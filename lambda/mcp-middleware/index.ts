import { createHmac, timingSafeEqual } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { log, hashUserId } from '../shared/log';
import { isPendingDeletionError } from '../shared/secrets';

const SECRET_PREFIX = process.env.SECRET_PREFIX || 'lark-mcp-on-agentcore/users';
const STATE_SECRET_PARAM = process.env.STATE_SECRET_PARAM || '/lark-mcp-on-agentcore/state-secret';
const RUNTIME_ARN = process.env.RUNTIME_ARN!;
const AUTHORIZE_BASE_RAW = process.env.AUTHORIZE_BASE || '';
const AUTHORIZE_BASE = (AUTHORIZE_BASE_RAW && AUTHORIZE_BASE_RAW !== 'SET_AFTER_DEPLOY') ? AUTHORIZE_BASE_RAW : '';
const REGION = process.env.DEPLOY_REGION || process.env.AWS_REGION || 'us-west-2';
const TOKEN_BUFFER_SECONDS = 120;

const sm = new SecretsManagerClient({});
const ssm = new SSMClient({});

let tokenKey: Buffer | null = null;
let incrKey: Buffer | null = null;
let keyExpiry = 0;
const KEY_CACHE_TTL = 5 * 60 * 1000; // 5 min

interface LambdaEvent {
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string>;
  httpMethod?: string;
  path?: string;
  requestContext?: { http?: { method?: string } };
}

async function loadKeys(): Promise<void> {
  if (tokenKey && Date.now() < keyExpiry) return;
  const resp = await ssm.send(new GetParameterCommand({ Name: STATE_SECRET_PARAM, WithDecryption: true }));
  const raw = resp.Parameter!.Value!;
  tokenKey = createHmac('sha256', raw).update('mcp-token-v1').digest();
  incrKey = createHmac('sha256', raw).update('mcp-incr-auth-v1').digest();
  keyExpiry = Date.now() + KEY_CACHE_TTL;
}

async function verifyMcpToken(token: string): Promise<{ valid: boolean; userId: string; transientError?: boolean }> {
  try {
    await loadKeys();
  } catch (e: any) {
    log('ERROR', 'state_secret_load_failed', { error: e.message, name: e.name });
    return { valid: false, userId: '', transientError: true };
  }
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
    const sig = decoded.slice(lastColon + 1);
    const expiresAt = parseInt(decoded.slice(secondLastColon + 1, lastColon));
    if (isNaN(expiresAt)) {
      log('WARN', 'token_verify_failed', { reason: 'malformed_payload' });
      return { valid: false, userId: '' };
    }
    const userId = decoded.slice(0, secondLastColon);
    if (Date.now() / 1000 > expiresAt) {
      log('WARN', 'token_verify_failed', { reason: 'expired', userIdHash: hashUserId(userId) });
      return { valid: false, userId: '' };
    }
    const expected = createHmac('sha256', tokenKey!).update(`${userId}:${expiresAt}`).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      log('WARN', 'token_verify_failed', { reason: 'signature_mismatch', userIdHash: hashUserId(userId) });
      return { valid: false, userId: '' };
    }
    return { valid: true, userId };
  } catch {
    log('WARN', 'token_verify_failed', { reason: 'decode_error' });
    return { valid: false, userId: '' };
  }
}

async function getUserToken(userId: string): Promise<{ token: string | null; transientError?: boolean }> {
  try {
    const resp = await sm.send(new GetSecretValueCommand({ SecretId: `${SECRET_PREFIX}/${userId}` }));
    const data = JSON.parse(resp.SecretString!);
    if (data.expires_at - Date.now() / 1000 > TOKEN_BUFFER_SECONDS) {
      return { token: data.access_token };
    }
    return { token: null };
  } catch (e: any) {
    if (e.name === 'ResourceNotFoundException') return { token: null };
    // A secret scheduled for deletion (user revoked authorization, still in the
    // 7-day recovery window) is effectively deauthorized — route to re-authorize
    // (403 + authorize_url), not a 503 backend fault.
    if (isPendingDeletionError(e)) return { token: null };
    // SM throttle / AccessDenied: do not surface as "not authorized" — that would
    // misdirect users to re-authorize with Feishu when SM is the actual problem.
    log('ERROR', 'get_user_token_failed', { userIdHash: hashUserId(userId), error: e.message, name: e.name });
    return { token: null, transientError: true };
  }
}

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

// MCP responses must never be cached: every call carries a unique session ID
// and the response body contains user-scoped tool results. Stale cache here
// would cross user boundaries.
export async function handler(event: LambdaEvent) {
  const r = await handle(event) as LambdaResponse;
  return {
    ...r,
    headers: { ...(r.headers || {}), 'Cache-Control': 'no-store' },
  };
}

async function handle(event: LambdaEvent) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  let userId = '';
  if (bearerToken) {
    const { valid, userId: mcpUserId, transientError } = await verifyMcpToken(bearerToken);
    if (transientError) {
      return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: '{"error":"backend_unavailable","error_description":"auth backend temporarily unavailable, retry"}' };
    }
    if (valid) userId = mcpUserId;
  }
  if (!userId) {
    log('WARN', 'auth_missing_or_invalid', { hasBearer: !!bearerToken });
    // RFC 9728: advertise PRM so clients can discover the AS and start DCR.
    const wwwAuth = AUTHORIZE_BASE
      ? `Bearer resource_metadata="${AUTHORIZE_BASE}/.well-known/oauth-protected-resource"`
      : 'Bearer';
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': wwwAuth },
      body: '{"error":"unauthorized","error_description":"missing or invalid token"}',
    };
  }

  await loadKeys();
  const incrTokenExp = Math.floor(Date.now() / 1000) + 300;
  const incrPayload = `${userId}:${incrTokenExp}`;
  const incrSig = createHmac('sha256', incrKey!).update(incrPayload).digest('hex');
  const incrToken = Buffer.from(`${incrPayload}:${incrSig}`).toString('base64url');

  const { token: feishuToken, transientError } = await getUserToken(userId);
  if (transientError) {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: '{"error":"backend_unavailable","error_description":"token store temporarily unavailable, retry"}' };
  }
  if (!feishuToken) {
    log('INFO', 'feishu_not_authorized', { userIdHash: hashUserId(userId) });
    // Use signed t= token; raw user_id is rejected by /authorize (confused-deputy guard).
    const authorizeUrl = AUTHORIZE_BASE ? `${AUTHORIZE_BASE}/authorize?t=${encodeURIComponent(incrToken)}` : '';
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'feishu_not_authorized', authorize_url: authorizeUrl }) };
  }

  const mcpPayload = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '';

  const bodyBytes = Buffer.from(mcpPayload, 'utf8');
  const encodedArn = encodeURIComponent(RUNTIME_ARN);
  // Forward client's MCP session ID (echoed from initialize response). MCP transport spec: server assigns the ID.
  const clientSessionId = event.headers?.['mcp-session-id'] || event.headers?.['Mcp-Session-Id'] || '';

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'X-User-Access-Token': feishuToken,
    'X-Incr-Auth-Token': incrToken,
    'host': `bedrock-agentcore.${REGION}.amazonaws.com`,
  };
  if (clientSessionId) requestHeaders['Mcp-Session-Id'] = clientSessionId;

  const request = new HttpRequest({
    method: 'POST',
    hostname: `bedrock-agentcore.${REGION}.amazonaws.com`,
    path: `/runtimes/${encodedArn}/invocations`,
    headers: requestHeaders,
    body: bodyBytes,
  });

  const signer = new SignatureV4({ credentials: defaultProvider(), region: REGION, service: 'bedrock-agentcore', sha256: Sha256 });
  const signed = await signer.sign(request);

  const url = `https://${signed.hostname}${signed.path}`;
  let resp: Response;
  const t0 = Date.now();
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: signed.headers as Record<string, string>,
      body: bodyBytes,
      signal: AbortSignal.timeout(25000),
    });
  } catch (e: any) {
    log('ERROR', 'agentcore_fetch_failed', { userIdHash: hashUserId(userId), error: e.message, name: e.name, durationMs: Date.now() - t0 });
    return { statusCode: 504, headers: { 'Content-Type': 'application/json' }, body: '{"error":"upstream_timeout"}' };
  }
  const durationMs = Date.now() - t0;
  if (resp.status >= 500) {
    log('ERROR', 'agentcore_5xx', { userIdHash: hashUserId(userId), status: resp.status, durationMs });
  } else if (durationMs > 5000) {
    log('WARN', 'agentcore_slow', { userIdHash: hashUserId(userId), durationMs, status: resp.status });
  }
  if (resp.status < 400) {
    log('INFO', 'mcp_request_ok', { userIdHash: hashUserId(userId), durationMs, status: resp.status });
  }

  const responseBody = await resp.text();
  // Forward MCP session ID back to client so it can echo on subsequent requests
  const responseHeaders: Record<string, string> = { 'Content-Type': resp.headers.get('content-type') || 'text/event-stream' };
  const respSessionId = resp.headers.get('mcp-session-id');
  if (respSessionId) responseHeaders['Mcp-Session-Id'] = respSessionId;
  return { statusCode: resp.status, headers: responseHeaders, body: responseBody };
}

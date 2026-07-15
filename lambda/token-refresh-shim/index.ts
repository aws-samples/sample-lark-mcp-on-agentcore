import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, ListSecretsCommand, DeleteSecretCommand, RestoreSecretCommand, DescribeSecretCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { storeCode, retrieveAndDeleteCode } from './dynamodb-codes';
import { storeOpenIdMapping, getOpenIdMapping } from './dynamodb-openid';
import { isPendingDeletionError } from '../shared/secrets';
import { log, hashUserId } from '../shared/log';
import { SCOPE_ALLOWLIST } from './scope-allowlist';
import i18n from '../../config/i18n.json';

const FEISHU_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v1/oidc/access_token";
const FEISHU_REFRESH_URL = "https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token";
const CALLBACK_URL_ENV = process.env.CALLBACK_URL || '';
const SECRET_PREFIX = process.env.SECRET_PREFIX || "lark-mcp-on-agentcore/users";
const APP_SECRET_ID = process.env.APP_SECRET_ID || "lark-mcp-on-agentcore/feishu-app";
// Customer-managed KMS key (CMK) for user token secrets. Set by CDK/deploy.sh.
// Empty = legacy behavior (AWS-managed `aws/secretsmanager` key): CreateSecret
// omits KmsKeyId and the refresh loop performs no key-swap migration, so an
// unconfigured deployment is byte-compatible with the pre-CMK behavior.
const USER_SECRET_KMS_KEY_ARN = process.env.USER_SECRET_KMS_KEY_ARN || '';
const STATE_SECRET_PARAM = process.env.STATE_SECRET_PARAM || '/lark-mcp-on-agentcore/state-secret';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET!;
const FEISHU_SCOPES = process.env.FEISHU_SCOPES || '';
// Verbatim body served at /.well-known/aws/securityagent-domain-verification.json
// to prove domain ownership to AWS Security Agent (penetration-testing target).
// Format-agnostic on purpose: the operator pastes whatever the console requires
// (plain token or a JSON object) so the same code works across tenants and any
// future format change. Empty (default) ⇒ the route 404s, zero impact when unused.
const DOMAIN_VERIFICATION = process.env.DOMAIN_VERIFICATION || '';
const STATE_TTL_SECONDS = 300;
const MCP_TOKEN_TTL = 86400 * 30; // 30 days

const sm = new SecretsManagerClient({});
const ssm = new SSMClient({});

// Domain-separated HMAC keys derived from the root STATE_SECRET.
// Prevents an oracle on one signing scheme from compromising the other.
let stateKey: Buffer | null = null;
let tokenKey: Buffer | null = null;
let incrKey: Buffer | null = null;
// DCR client_id signing — no rotation; revoke via STATE_SECRET root rotate.
let dcrKey: Buffer | null = null;

function deriveKey(secret: string, domain: string): Buffer {
  return createHmac('sha256', secret).update(domain).digest();
}

async function loadSigningKeys() {
  if (stateKey) return;
  const resp = await ssm.send(new GetParameterCommand({ Name: STATE_SECRET_PARAM, WithDecryption: true }));
  const raw = resp.Parameter!.Value!;
  stateKey = deriveKey(raw, 'oauth-state-v1');
  tokenKey = deriveKey(raw, 'mcp-token-v1');
  incrKey = deriveKey(raw, 'mcp-incr-auth-v1');
  dcrKey = deriveKey(raw, 'mcp-dcr-client-v1');
}

// Opaque signed nonce: base64url(payloadJson + ":" + hmac("dcr:"+payloadJson)).
function signClientId(): string {
  const payloadJson = JSON.stringify({ n: randomBytes(16).toString('hex'), iat: Math.floor(Date.now() / 1000) });
  const sig = createHmac('sha256', dcrKey!).update('dcr:' + payloadJson).digest('hex');
  return Buffer.from(`${payloadJson}:${sig}`).toString('base64url');
}

function verifyClientId(clientId: string): boolean {
  try {
    const decoded = Buffer.from(clientId, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return false;
    const payloadJson = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac('sha256', dcrKey!).update('dcr:' + payloadJson).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;
    const payload = JSON.parse(payloadJson);
    if (typeof payload.n !== 'string') return false;
    const iat = payload.iat;
    if (typeof iat !== 'number' || isNaN(iat) || iat < 0 || iat > Date.now() / 1000 + 300) return false;
    return true;
  } catch { return false; }
}
let appId = '';
let appSecret = '';

async function loadAppCredentials() {
  if (appId) return;
  const resp = await sm.send(new GetSecretValueCommand({ SecretId: APP_SECRET_ID }));
  const data = JSON.parse(resp.SecretString!);
  appId = data.appId;
  appSecret = data.appSecret;
}


interface LambdaEvent {
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string>;
  httpMethod?: string;
  path?: string;
  rawPath?: string;
  requestContext?: { http?: { method?: string; path?: string }; domainName?: string };
  queryStringParameters?: Record<string, string>;
  source?: string;
}

const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);

function getCallbackUrl(event: LambdaEvent): string {
  if (CALLBACK_URL_ENV && CALLBACK_URL_ENV !== 'SET_AFTER_DEPLOY') return CALLBACK_URL_ENV;
  const host = event.headers?.host || event.headers?.Host || event.requestContext?.domainName || '';
  if (!host) return '';
  if (/\.(cloudfront\.net|amazonaws\.com)$/.test(host)) return `https://${host}/callback`;
  if (ALLOWED_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) return `https://${host}/callback`;
  return '';
}

function signState(payload: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const full = `${payloadB64}.${ts}`;
  const sig = createHmac('sha256', stateKey!).update(full).digest('hex');
  return `${full}.${sig}`;
}

function verifyState(state: string): { valid: boolean; payload: string } {
  try {
    const parts = state.split('.');
    if (parts.length !== 3) return { valid: false, payload: '' };
    const [payloadB64, tsStr, sig] = parts;
    const ts = parseInt(tsStr);
    if (isNaN(ts) || Date.now() / 1000 - ts > STATE_TTL_SECONDS) return { valid: false, payload: '' };
    const full = `${payloadB64}.${tsStr}`;
    const expected = createHmac('sha256', stateKey!).update(full).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return { valid: false, payload: '' };
    const payload = Buffer.from(payloadB64, 'base64url').toString();
    return { valid: true, payload };
  } catch { return { valid: false, payload: '' }; }
}

function generateMcpToken(userId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + MCP_TOKEN_TTL;
  const payload = `${userId}:${expiresAt}`;
  const sig = createHmac('sha256', tokenKey!).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SUPPORTED_LANGS = Object.keys(i18n.callback);

function detectLang(acceptLang: string): string {
  if (!acceptLang) return 'en';
  const entries = acceptLang.split(',').map(part => {
    const [tag, ...params] = part.trim().split(';');
    const qParam = params.find(p => p.trim().startsWith('q='));
    const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
    return { lang: tag.trim().toLowerCase().split('-')[0], q: isNaN(q) ? 0 : q };
  });
  entries.sort((a, b) => b.q - a.q);
  for (const { lang: prefix } of entries) {
    if (SUPPORTED_LANGS.includes(prefix)) return prefix;
  }
  return 'en';
}

// Out-of-band sentinel for a non-JSON / unreadable Feishu response. Feishu
// success is code === 0 and real errors are positive (e.g. 20016); -1 can never
// collide, and every caller's `code !== 0` check treats it as a clean failure.
const FEISHU_NON_JSON: { code: number; msg: string; data?: undefined } = { code: -1, msg: 'non_json_response' };

// Feishu (or an edge WAF in front of it) can answer with a non-JSON body — an
// HTML block page or empty payload — for malformed/hostile inputs, and the body
// stream can also error mid-read. A bare resp.json() throws on either, which
// would surface as an unhandled Lambda exception → API Gateway 502 (a DoS vector
// triggerable by anyone). Parse defensively (read + parse both guarded) and
// return null so callers can treat it as a failed call.
async function parseJsonSafe<T>(resp: Response, api: string): Promise<T | null> {
  let text = '';
  try {
    text = await resp.text();
    return JSON.parse(text) as T;
  } catch {
    log('WARN', 'feishu_non_json_response', { api, status: resp.status, bodyPrefix: text.slice(0, 80) });
    return null;
  }
}

async function getAppAccessToken(): Promise<string> {
  await loadAppCredentials();
  const t0 = Date.now();
  const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const durationMs = Date.now() - t0;
  if (durationMs > 3000) log('WARN', 'feishu_slow', { api: 'app_access_token', durationMs });
  const parsed = await parseJsonSafe<{ app_access_token: string }>(resp, 'app_access_token');
  return parsed?.app_access_token ?? '';
}

async function exchangeCode(code: string, appToken: string) {
  const t0 = Date.now();
  const resp = await fetch(FEISHU_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${appToken}` },
    body: JSON.stringify({ grant_type: "authorization_code", code }),
  });
  const durationMs = Date.now() - t0;
  if (durationMs > 3000) log('WARN', 'feishu_slow', { api: 'exchange_code', durationMs });
  type ExchangeResp = { code: number; msg: string; data?: { access_token: string; refresh_token: string; expires_in: number; open_id: string } };
  const parsed = await parseJsonSafe<ExchangeResp>(resp, 'exchange_code');
  // Non-JSON (e.g. an edge block page) → synthesize a failure so the caller
  // returns a structured 400 instead of crashing on resp.json().
  return parsed ?? FEISHU_NON_JSON;
}

async function refreshToken(rt: string, appToken: string) {
  const t0 = Date.now();
  const resp = await fetch(FEISHU_REFRESH_URL, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${appToken}` },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: rt }),
  });
  const durationMs = Date.now() - t0;
  if (durationMs > 3000) log('WARN', 'feishu_slow', { api: 'refresh_token', durationMs });
  type RefreshResp = { code: number; msg: string; data?: { access_token: string; refresh_token: string; expires_in: number } };
  const parsed = await parseJsonSafe<RefreshResp>(resp, 'refresh_token');
  return parsed ?? FEISHU_NON_JSON;
}

async function getUserInfo(userAccessToken: string): Promise<string> {
  // /authen/v1/user_info — name is returned by default (no extra scope needed).
  // Failures are non-fatal: success page falls back to userId.
  try {
    const resp = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
      method: "GET",
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    const data = await resp.json() as { code: number; data?: { name?: string } };
    return data.code === 0 ? (data.data?.name || '') : '';
  } catch { return ''; }
}

const PROJECT_TAGS = [{ Key: "project", Value: "lark-mcp-on-agentcore" }];

async function storeToken(userId: string, data: { access_token: string; refresh_token: string; expires_in: number }): Promise<boolean> {
  const secretId = `${SECRET_PREFIX}/${userId}`;
  const now = Math.floor(Date.now() / 1000);
  const value = JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: now + data.expires_in,
    issued_at: now,
  });
  try { await sm.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: value })); return false; }
  catch (e: any) {
    if (e.name === "ResourceNotFoundException") {
      // New secrets are created directly on the CMK so they never need migrating.
      // KmsKeyId is a create-time-only attribute; omitting it (empty env) falls
      // back to the AWS-managed key, matching pre-CMK behavior.
      await sm.send(new CreateSecretCommand({
        Name: secretId, SecretString: value, Tags: PROJECT_TAGS,
        ...(USER_SECRET_KMS_KEY_ARN ? { KmsKeyId: USER_SECRET_KMS_KEY_ARN } : {}),
      }));
      return true;
    }
    if (isPendingDeletionError(e)) {
      await sm.send(new RestoreSecretCommand({ SecretId: secretId }));
      await sm.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: value }));
      return false;
    }
    throw e;
  }
}

interface StoredToken { access_token: string; refresh_token: string; expires_at: number; issued_at: number }

async function getToken(userId: string): Promise<StoredToken | null> {
  try {
    const resp = await sm.send(new GetSecretValueCommand({ SecretId: `${SECRET_PREFIX}/${userId}` }));
    return JSON.parse(resp.SecretString!);
  } catch (e: any) {
    if (e.name === 'ResourceNotFoundException') return null;
    // Throttle / AccessDenied / parse errors must surface, not silently look like "no auth".
    log('ERROR', 'get_token_failed', { userIdHash: hashUserId(userId), error: e.message, name: e.name });
    throw e;
  }
}

// Probe SM writability for this user before consuming the single-use refresh_token.
// Re-writes current value (idempotent). If this fails, skip refresh — RT stays alive
// for the next EventBridge cycle when SM recovers.
async function preflightWritable(secretId: string, userId: string): Promise<boolean> {
  try {
    const current = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
    await sm.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: current.SecretString! }));
    return true;
  } catch (e: any) {
    log('WARN', 'preflight_failed', { userIdHash: hashUserId(userId), error: e.message });
    return false;
  }
}


// CMK migration (resident invariant, not a one-shot): no user token secret should
// ever stay on a key other than this stack's CMK. The KMS key is a create-time
// attribute — PutSecretValue does NOT change it — so existing secrets must be
// migrated explicitly via UpdateSecret, which re-encrypts the AWSCURRENT/PENDING/
// PREVIOUS versions in-place with zero downtime (the token value is untouched).
// Returns:
//   'current'  — already on the CMK, nothing to do (not a straggler)
//   'swapped'  — was off the CMK; UpdateSecret ran AND a re-Describe confirmed the
//                key actually changed (not a straggler)
//   'stuck'    — UpdateSecret returned OK but a re-Describe shows the key did NOT
//                change. This is the silent missing-kms:Encrypt case (AWS documented:
//                without Encrypt, SM skips re-encryption and returns success anyway).
//                Counts as a straggler so the canary surfaces the misconfig.
//   'failed'   — Describe/Update threw (transient/throttle/misconfig). Token left
//                untouched on its old key, retried next cycle. A straggler. We NEVER
//                delete on a key-swap failure: UpdateSecret is a control-plane API
//                whose errors do not mean the token is invalid (blocker-fix).
// When no CMK is configured (empty env) this is a no-op ('current'), preserving
// pre-CMK behavior. The re-Describe doubles DescribeSecret calls for a secret being
// migrated, but only while it is off-CMK (transient), and is what makes `stragglers`
// a trustworthy convergence/Encrypt-permission canary instead of a churn counter.
type KeySwapResult = 'current' | 'swapped' | 'stuck' | 'failed';
async function ensureSecretOnCmk(secretId: string, userId: string): Promise<KeySwapResult> {
  if (!USER_SECRET_KMS_KEY_ARN) return 'current';
  try {
    const desc = await sm.send(new DescribeSecretCommand({ SecretId: secretId }));
    if (desc.KmsKeyId === USER_SECRET_KMS_KEY_ARN) return 'current';
    // Only KmsKeyId is sent — no SecretString — so the token value is never touched
    // and no version quota is consumed; SM re-encrypts the current version in place.
    await sm.send(new UpdateSecretCommand({ SecretId: secretId, KmsKeyId: USER_SECRET_KMS_KEY_ARN }));
    // Re-confirm: a missing kms:Encrypt makes UpdateSecret a silent no-op, so trusting
    // its success would mask the misconfig. Verify the key really moved.
    const after = await sm.send(new DescribeSecretCommand({ SecretId: secretId }));
    if (after.KmsKeyId === USER_SECRET_KMS_KEY_ARN) {
      log('INFO', 'user_secret_key_swapped', { userIdHash: hashUserId(userId) });
      return 'swapped';
    }
    log('WARN', 'key_swap_silent_noop', { userIdHash: hashUserId(userId) });
    return 'stuck';
  } catch (e: any) {
    log('WARN', 'key_swap_failed', { userIdHash: hashUserId(userId), error: e.message, name: e.name });
    return 'failed';
  }
}

// Multi-app isolation (Killer Fix #3): the Secrets Manager `name` filter is a
// PREFIX match, not exact, so filtering by `SECRET_PREFIX` alone also matches a
// sibling app's `SECRET_PREFIX-<other>/...` AND any per-app `SECRET_PREFIX/<slug>/...`
// secrets. The 30-min refresh loop auto-DELETES secrets on terminal Feishu codes,
// so a cross-app match would silently destroy another app's live tokens. Two-part
// screen, both required:
//   1. filter on `SECRET_PREFIX + '/'` (stops `users-other/...` sibling bleed), and
//   2. keep only single-segment names `^SECRET_PREFIX/[^/]+$` (drops a nested
//      `users/<slug>/<openid>` belonging to another app).
// The userId is a Feishu open_id (`ou_*`) or a stable hex id — never contains '/',
// so a single trailing segment is exactly one user. NOTE: must NOT screen on a hex
// shape — real userIds are `ou_*` open_ids, and a hex-only screen would silently
// drop every real user (data-destructive).
export async function listAllUserSecrets(): Promise<string[]> {
  const names: string[] = [];
  let nextToken: string | undefined;
  const prefix = `${SECRET_PREFIX}/`;
  const singleSegment = new RegExp(`^${escapeRegExp(SECRET_PREFIX)}/[^/]+$`);
  do {
    const resp = await sm.send(new ListSecretsCommand({ Filters: [{ Key: "name", Values: [prefix] }], NextToken: nextToken }));
    for (const s of resp.SecretList || []) {
      if (s.Name && s.Name.startsWith(prefix) && singleSegment.test(s.Name)) names.push(s.Name);
    }
    nextToken = resp.NextToken;
  } while (nextToken);
  return names;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBody(event: LambdaEvent): Record<string, string> {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '';
  const parsed = new URLSearchParams(raw);
  const params: Record<string, string> = {};
  for (const [k, v] of parsed) params[k] = v;
  return params;
}

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

// Wrap the handler so every HTTP response carries Cache-Control: no-store.
// OAuth flows must never be cached: state, codes, redirects all expire fast,
// and a stale 200 / error from a browser or proxy cache leads to confusing
// failures after redeploy. EventBridge invocations have no headers — pass
// through unchanged.
export async function handler(event: LambdaEvent) {
  const result = await handle(event);
  if (event.source === 'aws.events') return result;
  const r = result as LambdaResponse;
  return {
    ...r,
    headers: { ...(r.headers || {}), 'Cache-Control': 'no-store' },
  };
}

async function handle(event: LambdaEvent) {
  await loadAppCredentials();
  await loadSigningKeys();

  // EventBridge scheduled refresh
  if (event.source === "aws.events") {
    const appToken = await getAppAccessToken();
    const secrets = await listAllUserSecrets();
    const errors: Array<{ userIdHash: string; phase: string; error: string }> = [];
    let refreshed = 0, failed = 0, skipped = 0;
    // CMK migration counters (independent of refresh outcome to avoid polluting
    // RefreshFailedAlarm). `stragglers` is the convergence canary: it counts secrets
    // confirmed STILL off the CMK after this cycle (swap failed, or swap was a silent
    // no-op from a missing kms:Encrypt). A successfully-confirmed swap is NOT a
    // straggler, so a healthy migration cycle does not false-page; stragglers only
    // stays > 0 when something is genuinely stuck.
    let keySwapped = 0, keySwapFailed = 0, stragglers = 0;

    const CONCURRENCY = 5;
    async function refreshUser(name: string) {
      const userId = name.replace(`${SECRET_PREFIX}/`, "");

      // Enforce the CMK invariant FIRST — before the TTL early-return below, or a
      // not-yet-expiring token (the majority) would never get migrated.
      const swap = await ensureSecretOnCmk(name, userId);
      if (swap === 'swapped') keySwapped++;            // migrated AND confirmed — not a straggler
      else if (swap === 'failed') { keySwapFailed++; stragglers++; }
      else if (swap === 'stuck') { keySwapFailed++; stragglers++; }  // silent Encrypt no-op

      let stored: StoredToken | null;
      try {
        stored = await getToken(userId);
      } catch (e: any) {
        skipped++;
        errors.push({ userIdHash: hashUserId(userId), phase: 'get_token', error: e.message });
        return;
      }
      if (!stored) return;

      const totalTtl = stored.expires_at - stored.issued_at;
      const remaining = stored.expires_at - Date.now() / 1000;
      if (remaining > totalTtl / 2) return;

      if (!(await preflightWritable(`${SECRET_PREFIX}/${userId}`, userId))) {
        skipped++;
        errors.push({ userIdHash: hashUserId(userId), phase: 'preflight', error: 'sm_not_writable' });
        return;
      }

      let result;
      try {
        result = await refreshToken(stored.refresh_token, appToken);
      } catch (e: any) {
        failed++;
        errors.push({ userIdHash: hashUserId(userId), phase: 'feishu_call', error: e.message });
        return;
      }
      if (result.code !== 0 || !result.data) {
        // Terminal refresh failures — token cannot be recovered, auto-delete the secret.
        // 20016 = user revoked authorization on Feishu
        // 20017 = refresh_token invalid (corrupted or abnormally consumed)
        // 20064 = refresh_token expired (30-day inactivity)
        const REVOKED_CODES = new Set([20016, 20017, 20064]);
        if (REVOKED_CODES.has(result.code)) {
          log('INFO', 'user_deauthorized', { userIdHash: hashUserId(userId), code: result.code, msg: result.msg });
          try {
            await sm.send(new DeleteSecretCommand({
              SecretId: `${SECRET_PREFIX}/${userId}`,
              RecoveryWindowInDays: 7,
            }));
            log('INFO', 'user_secret_deleted', { userIdHash: hashUserId(userId) });
            skipped++;
          } catch (e: any) {
            // Cleanup failure is operationally significant (likely IAM/SM misconfig
            // or sustained throttle): count as failed so RefreshFailedAlarm fires,
            // otherwise the stale secret silently persists and accrues cost.
            log('WARN', 'user_secret_delete_failed', { userIdHash: hashUserId(userId), error: e.message });
            errors.push({ userIdHash: hashUserId(userId), phase: 'secret_delete', error: e.message });
            failed++;
          }
          return;
        }
        failed++;
        log('WARN', 'refresh_feishu_error', { userIdHash: hashUserId(userId), code: result.code, msg: result.msg });
        errors.push({ userIdHash: hashUserId(userId), phase: 'feishu_resp', error: `${result.code} ${result.msg}` });
        return;
      }

      let storeOk = false;
      for (let i = 0; i < 5 && !storeOk; i++) {
        try {
          await storeToken(userId, result.data);
          storeOk = true;
        } catch (e: any) {
          if (i === 4) {
            log('CRITICAL', 'store_token_lost', {
              userIdHash: hashUserId(userId),
              error: e.message,
              refresh_token_consumed: true,
            });
            errors.push({ userIdHash: hashUserId(userId), phase: 'store', error: e.message });
            failed++;
          } else {
            await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, i), 16000) + Math.random() * 500));
          }
        }
      }
      if (storeOk) refreshed++;
    }

    // Process users in parallel batches of CONCURRENCY
    for (let i = 0; i < secrets.length; i += CONCURRENCY) {
      await Promise.all(secrets.slice(i, i + CONCURRENCY).map(refreshUser));
    }

    log('INFO', 'refresh_cycle', { refreshed, failed, skipped, total: secrets.length, keySwapped, keySwapFailed, stragglers });

    return { statusCode: 200, body: JSON.stringify({ refreshed, failed, skipped, total: secrets.length, keySwapped, keySwapFailed, stragglers, errors }) };
  }

  const path = event.path || event.requestContext?.http?.path || event.rawPath || "/";
  const method = event.httpMethod || event.requestContext?.http?.method || "GET";
  const params = event.queryStringParameters || {};
  const CALLBACK_URL = getCallbackUrl(event);

  // AWS Security Agent domain-ownership verification (HTTP route method).
  // Serves the operator-supplied verification body verbatim. Returns 404 when
  // unconfigured so the path is inert for tenants not using Security Agent.
  if (path.includes("/.well-known/aws/securityagent-domain-verification.json")) {
    if (!DOMAIN_VERIFICATION) return { statusCode: 404, body: '{"error":"not_found"}' };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: DOMAIN_VERIFICATION,
    };
  }

  // Pin discovery issuer to CALLBACK_URL — never trust the Host header.
  const pinnedBase = (CALLBACK_URL_ENV && CALLBACK_URL_ENV !== 'SET_AFTER_DEPLOY')
    ? CALLBACK_URL_ENV.replace(/\/callback$/, '') : '';

  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  if (path.includes("/.well-known/oauth-authorization-server")) {
    if (!pinnedBase) return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: '{"error":"server_misconfigured"}' };
    const baseUrl = pinnedBase;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        // "none" = public DCR clients (PKCE only); CIMD omitted to force DCR.
        token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      }),
    };
  }

  // RFC 9728 Protected Resource Metadata
  if (path.includes("/.well-known/oauth-protected-resource")) {
    if (!pinnedBase) return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: '{"error":"server_misconfigured"}' };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: `${pinnedBase}/mcp`,
        authorization_servers: [pinnedBase],
      }),
    };
  }

  // /register — RFC 7591 Dynamic Client Registration (open, public clients only)
  if (path.includes("/register") && method === "POST") {
    const jsonErr = (error: string) => ({ statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error }) });
    let reqBody: any;
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '';
      reqBody = JSON.parse(raw);
    } catch {
      return jsonErr("invalid_client_metadata");
    }
    const redirectUris = reqBody?.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 5
        || !redirectUris.every((u: unknown) => typeof u === 'string')) {
      log('WARN', 'dcr_register_failed', { reason: 'invalid_metadata' });
      return jsonErr("invalid_client_metadata");
    }
    // Exact-host allowlist (no subdomain wildcard), https-or-loopback.
    for (const uri of redirectUris) {
      let u: URL;
      try { u = new URL(uri); } catch { return jsonErr("invalid_redirect_uri"); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return jsonErr("invalid_redirect_uri");
      if (u.username || u.password || u.hash) return jsonErr("invalid_redirect_uri");
      const host = u.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      const isQuickSight = host === 'quicksight.aws.amazon.com';
      const isAllowed = ALLOWED_DOMAINS.includes(host);
      if (!isLocal && !isQuickSight && !isAllowed) return jsonErr("invalid_redirect_uri");
      if (!isLocal && u.protocol !== 'https:') return jsonErr("invalid_redirect_uri");
    }
    const clientId = signClientId();
    log('INFO', 'dcr_register_ok', {});
    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        client_id_issued_at: Math.floor(Date.now() / 1000),
      }),
    };
  }

  // /authorize — OAuth 2.0 authorization endpoint
  if (path.includes("/authorize")) {
    log('INFO', 'oauth_authorize_start', {});
    if (!CALLBACK_URL) return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: '{"error":"server_misconfigured","error_description":"callback URL cannot be derived"}' };
    const redirectUri = params.redirect_uri || '';
    const clientState = params.state || '';
    const codeChallenge = params.code_challenge || '';
    const codeChallengeMethod = params.code_challenge_method || '';
    // userId is ONLY accepted via the HMAC-signed `t=` token (incremental auth).
    // Raw `user_id` query param is rejected (confused-deputy prevention).
    let userId = '';
    // extra_scope is comma-separated (no spaces). Each scope must be in the
    // allowlist to prevent a phishing link from broadening the consent screen.
    const extraScopeRaw = (params.extra_scope || '').slice(0, 1000);
    const incrToken = params.t || '';

    // Mutually exclusive: t= carries a userId, redirect_uri starts a new flow.
    if (incrToken && redirectUri) {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"t and redirect_uri are mutually exclusive"}' };
    }

    // Verify signed incremental-auth token (carries the original userId)
    if (incrToken) {
      try {
        const decoded = Buffer.from(incrToken, 'base64url').toString();
        const lastColon = decoded.lastIndexOf(':');
        const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
        const sig = decoded.slice(lastColon + 1);
        const expiresAt = parseInt(decoded.slice(secondLastColon + 1, lastColon));
        if (isNaN(expiresAt)) throw new Error('nan');
        const tokenUserId = decoded.slice(0, secondLastColon);
        if (Date.now() / 1000 <= expiresAt) {
          const expected = createHmac('sha256', incrKey!).update(`${tokenUserId}:${expiresAt}`).digest('hex');
          const sigBuf = Buffer.from(sig, 'hex');
          const expBuf = Buffer.from(expected, 'hex');
          if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
            userId = tokenUserId;
          }
        }
      } catch {}
    }
    // Parse comma-separated scopes; reject entire request if any scope is unknown
    // or malformed. Re-emit as space-separated for Feishu.
    let extraScope = '';
    if (extraScopeRaw) {
      const parts = extraScopeRaw.split(',').map(s => s.trim()).filter(Boolean);
      const validScope = /^[a-z][a-z0-9_:.-]*$/;
      const allOk = parts.length > 0 && parts.every(s => validScope.test(s) && SCOPE_ALLOWLIST.has(s));
      if (!allOk) {
        log('WARN', 'extra_scope_rejected', { raw: extraScopeRaw.slice(0, 200) });
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"extra_scope contains unknown or malformed scope"}' };
      }
      extraScope = parts.join(' ');
    }

    // Require S256 explicitly (absent method = plain per RFC 7636, not accepted).
    if (codeChallenge && codeChallengeMethod !== 'S256') {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"only S256 code_challenge_method supported"}' };
    }

    // Standard OAuth flow (from Quick Desktop or any OAuth client)
    if (redirectUri) {
      // Validate redirect_uri using hostname comparison (not regex on the
      // full URL) — protocol-anchored regexes like /^https:\/\/[^/]+\.foo\.com/
      // can be bypassed by hosts like x.foo.com.attacker.com.
      let host = '';
      try {
        const u = new URL(redirectUri);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad scheme');
        host = u.hostname;
      } catch {
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"redirect_uri not a valid URL"}' };
      }
      const isQuickSight = host === 'quicksight.aws.amazon.com' || host.endsWith('.quicksight.aws.amazon.com');
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      const customAllowed = ALLOWED_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
      if (!isQuickSight && !isLocal && !customAllowed) {
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"redirect_uri not allowed"}' };
      }
      // localhost / 127.0.0.1 must be plain HTTP only when explicitly local;
      // for any other host require HTTPS.
      if (!isLocal && new URL(redirectUri).protocol !== 'https:') {
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"redirect_uri must use https"}' };
      }

      if (!codeChallenge) {
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"code_challenge required"}' };
      }

      // Encode redirect_uri and client_state into our internal state
      const statePayload = JSON.stringify({ r: redirectUri, s: clientState, c: codeChallenge });
      const state = signState(statePayload);
      const allScopes = [FEISHU_SCOPES, extraScope].filter(Boolean).join(' ');
      const scopeParam = allScopes ? `&scope=${encodeURIComponent(allScopes)}` : '';
      return {
        statusCode: 302,
        headers: { Location: `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${appId}&response_type=code&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=${state}${scopeParam}` },
      };
    }

    // Incremental-auth flow: requires a verified `t=` token (signed userId).
    // Without it, the only legitimate flow is standard OAuth (redirect_uri + PKCE).
    if (!userId) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"missing redirect_uri or signed t= token"}' };
    const state = signState(JSON.stringify({ u: userId }));
    const incrScopes = extraScope ? extraScope : FEISHU_SCOPES;
    const scopeParamIncr = incrScopes ? `&scope=${encodeURIComponent(incrScopes)}` : '';
    return { statusCode: 302, headers: { Location: `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${appId}&response_type=code&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=${state}${scopeParamIncr}` } };
  }

  // /callback — Feishu redirects here after user consent
  if (path.includes("/callback")) {
    const { code, state } = params;
    if (!code || !state) return { statusCode: 400, body: "Missing code or state" };
    const { valid, payload } = verifyState(state);
    if (!valid) return { statusCode: 403, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_state"}' };

    let stateData: { r?: string; s?: string; c?: string; u?: string };
    try { stateData = JSON.parse(payload); } catch { return { statusCode: 400, body: "invalid state payload" }; }

    const appToken = await getAppAccessToken();
    const result = await exchangeCode(code, appToken);
    if (result.code !== 0 || !result.data) {
      log('ERROR', 'feishu_exchange_failed', { code: result.code, msg: result.msg });
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "feishu_exchange_failed", detail: result.msg || result.code }) };
    }

    let stableUserId: string;
    if (stateData.u) {
      // Incremental-auth flow: userId came from a verified `t=` token.
      // Verify the consenting Feishu user matches the original user to prevent
      // a confused-deputy attack where user B opens user A's link and consents.
      // Fail closed: only proceed if the open_id provably belongs to stateData.u
      // (either via existing mapping or direct equality).
      if (result.data.open_id) {
        const mappedOwner = await getOpenIdMapping(result.data.open_id);
        const ownerMatch = mappedOwner === stateData.u || result.data.open_id === stateData.u;
        if (!ownerMatch) {
          log('WARN', 'incremental_auth_identity_mismatch', {
            expectedHash: hashUserId(stateData.u),
            actualHash: hashUserId(mappedOwner || result.data.open_id),
          });
          return { statusCode: 403, headers: { "Content-Type": "application/json" }, body: '{"error":"identity_mismatch","error_description":"The Feishu account that authorized does not match the MCP session owner"}' };
        }
      }
      stableUserId = stateData.u;
    } else if (result.data.open_id) {
      // Standard OAuth flow: derive stable userId from Feishu open_id, with mapping reuse.
      const mapped = await getOpenIdMapping(result.data.open_id);
      stableUserId = mapped || result.data.open_id;
    } else {
      stableUserId = randomBytes(16).toString('hex');
    }
    const isNewUser = await storeToken(stableUserId, result.data);
    if (result.data.open_id && stableUserId !== result.data.open_id) {
      await storeOpenIdMapping(result.data.open_id, stableUserId);
    }
    log('INFO', 'oauth_callback_success', { userIdHash: hashUserId(stableUserId) });
    if (isNewUser) log('INFO', 'new_user_authorized', { userIdHash: hashUserId(stableUserId) });

    // Standard OAuth flow: generate auth code and redirect back to client
    if (stateData.r) {
      const authCode = randomBytes(32).toString('hex');
      await storeCode(authCode, {
        userId: stableUserId,
        codeChallenge: stateData.c || '',
        redirectUri: stateData.r,
        expiresAt: Date.now() / 1000 + 120,
      });
      const sep = stateData.r.includes('?') ? '&' : '?';
      const redirectBack = `${stateData.r}${sep}code=${authCode}${stateData.s ? `&state=${encodeURIComponent(stateData.s)}` : ''}`;
      return { statusCode: 302, headers: { Location: redirectBack } };
    }

    const userName = await getUserInfo(result.data.access_token);
    const displayName = userName || `${stableUserId.slice(0, 8)}…`;
    const acceptLang = event.headers?.['accept-language'] || event.headers?.['Accept-Language'] || '';
    const langKey = detectLang(acceptLang);
    const ct = (i18n.callback as Record<string, typeof i18n.callback.en>)[langKey] || i18n.callback.en;
    const hintText = ct.hint_close;
    const successHtml = `<!DOCTYPE html><html lang="${langKey}"><head><meta charset="utf-8"><title>${ct.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;color:#222}h2{color:#0a7d2c;margin-bottom:8px}p{color:#666;font-size:14px;line-height:1.5}.hint{color:#999;font-size:12px;margin-top:24px}</style></head><body><h2>${ct.heading}</h2><p>${ct.message.replace('%s', escapeHtml(displayName))}</p><p class="hint">${hintText}</p></body></html>`;
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: successHtml };
  }

  // /token — OAuth 2.0 token endpoint
  if (path.includes("/token") && method === "POST") {
    const body = parseBody(event);
    const grantType = body.grant_type;

    if (grantType === "authorization_code") {
      const authCode = body.code || '';
      const codeVerifier = body.code_verifier || '';
      const clientSecret = body.client_secret || '';
      const clientId = body.client_id || '';

      // Client auth dispatch (before consuming code to avoid burning it on failure):
      //   A. valid DCR client_id → public, secret forbidden, PKCE mandatory
      //   B. else valid shared secret → confidential
      //   C. else → 401
      if (clientId && verifyClientId(clientId)) {
        // Branch A — DCR public client.
        if (clientSecret) {
          log('WARN', 'token_dcr_secret_forbidden');
          return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_client","error_description":"public client must not present a client_secret"}' };
        }
        if (!codeVerifier) {
          log('WARN', 'token_dcr_missing_verifier');
          return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_client","error_description":"code_verifier required for public client"}' };
        }
      } else if (clientSecret) {
        // Branch B — shared-secret client (Amazon Quick).
        const provided = Buffer.from(clientSecret);
        const expected = Buffer.from(OAUTH_CLIENT_SECRET);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
          log('WARN', 'token_bad_client_secret');
          return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_client","error_description":"bad client credentials"}' };
        }
      } else {
        // Branch C — neither a valid DCR client_id nor a client_secret.
        log('WARN', 'token_no_client_auth');
        return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_client","error_description":"client authentication required"}' };
      }

      const stored = await retrieveAndDeleteCode(authCode);
      if (!stored) {
        log('WARN', 'token_invalid_code');
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_grant","error_description":"invalid or expired code"}' };
      }

      if (Date.now() / 1000 > stored.expiresAt) {
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_grant","error_description":"code expired"}' };
      }

      // RFC 6749 §4.1.3 — if redirect_uri was used at /authorize, /token MUST
      // include it and it MUST match.
      if (stored.redirectUri) {
        if (!body.redirect_uri || body.redirect_uri !== stored.redirectUri) {
          log('WARN', 'token_redirect_uri_mismatch');
          return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_grant","error_description":"redirect_uri mismatch"}' };
        }
      }

      // Always verify PKCE
      if (!codeVerifier) {
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_request","error_description":"code_verifier required"}' };
      }
      const computedChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
      if (computedChallenge !== stored.codeChallenge) {
        log('WARN', 'token_pkce_mismatch');
        return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"invalid_grant","error_description":"code_verifier mismatch"}' };
      }

      const mcpToken = generateMcpToken(stored.userId);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ access_token: mcpToken, token_type: "Bearer", expires_in: MCP_TOKEN_TTL }),
      };
    }

    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: '{"error":"unsupported_grant_type"}' };
  }

  if (path.includes("/token") && method === "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: '{"error":"method_not_allowed"}' };
  }

  return { statusCode: 404, body: '{"error":"not_found"}' };
}

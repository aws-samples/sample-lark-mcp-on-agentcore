import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// Required env vars before module import
process.env.STATE_SECRET_PARAM = '/test/state-secret';
process.env.RUNTIME_ARN = 'arn:aws:bedrock-agentcore:us-west-2:111:runtime/test';
process.env.AUTHORIZE_BASE = 'https://test.cloudfront.net';
process.env.DEPLOY_REGION = 'us-west-2';
process.env.SECRET_PREFIX = 'lark-mcp-on-agentcore/users';

const STATE_SECRET = 'test-state-secret';

// ── Mocks ────────────────────────────────────────────────────────────────────

let ssmFailNext = false;
const ssmSend = vi.fn(async (_cmd: any) => {
  if (ssmFailNext) {
    ssmFailNext = false;
    const err: any = new Error('throttle');
    err.name = 'ThrottlingException';
    throw err;
  }
  return { Parameter: { Value: STATE_SECRET } };
});

interface SmRow { access_token: string; expires_at: number; }
let smStore: Record<string, SmRow> = {};
let smFailMode: 'none' | 'not_found' | 'throttle' | 'pending_deletion' = 'none';
const smSend = vi.fn(async (cmd: any) => {
  if (smFailMode === 'throttle') {
    const err: any = new Error('throttle');
    err.name = 'ThrottlingException';
    throw err;
  }
  if (smFailMode === 'pending_deletion') {
    const err: any = new Error('You can’t perform this operation on the secret because it was marked for deletion.');
    err.name = 'InvalidRequestException';
    throw err;
  }
  if (smFailMode === 'not_found' || !smStore[cmd.input.SecretId]) {
    const err: any = new Error('not found');
    err.name = 'ResourceNotFoundException';
    throw err;
  }
  return { SecretString: JSON.stringify(smStore[cmd.input.SecretId]) };
});

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: smSend })),
  GetSecretValueCommand: class { constructor(public input: any) {} },
}));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn(() => ({ send: ssmSend })),
  GetParameterCommand: class { constructor(public input: any) {} },
}));
vi.mock('@smithy/signature-v4', () => ({
  SignatureV4: class {
    async sign(req: any) { return { ...req, headers: { ...req.headers, 'x-amz-signed': '1' } }; }
  },
}));
vi.mock('@aws-crypto/sha256-js', () => ({ Sha256: class {} }));
vi.mock('@smithy/protocol-http', () => ({
  HttpRequest: class {
    method: string; hostname: string; path: string; headers: Record<string, string>; body: any;
    constructor(o: any) { Object.assign(this, o); }
  },
}));
vi.mock('@aws-sdk/credential-provider-node', () => ({ defaultProvider: () => async () => ({ accessKeyId: 'a', secretAccessKey: 'b' }) }));

// global.fetch — captured per test
let fetchCalls: any[] = [];
let fetchResponse: { status?: number; body?: string; headers?: Record<string, string>; throwError?: any } = { status: 200, body: '{}' };
global.fetch = vi.fn(async (url: any, init: any) => {
  fetchCalls.push({ url, init });
  if (fetchResponse.throwError) throw fetchResponse.throwError;
  return new Response(fetchResponse.body || '{}', {
    status: fetchResponse.status,
    headers: fetchResponse.headers || { 'content-type': 'application/json' },
  });
}) as any;

// ── Test helpers ─────────────────────────────────────────────────────────────

// Derive the same domain-separated keys the middleware uses internally
const TOKEN_KEY = createHmac('sha256', STATE_SECRET).update('mcp-token-v1').digest();
const INCR_KEY = createHmac('sha256', STATE_SECRET).update('mcp-incr-auth-v1').digest();

function signMcpToken(userId: string, expiresAt: number, key: string | Buffer = TOKEN_KEY): string {
  const sig = createHmac('sha256', key).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

async function call(event: any) {
  vi.resetModules();
  const { handler } = await import('../index');
  return handler(event);
}

beforeEach(() => {
  ssmFailNext = false;
  smStore = {};
  smFailMode = 'none';
  fetchCalls = [];
  fetchResponse = { status: 200, body: '{}' };
});
afterEach(() => { vi.restoreAllMocks(); });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mcp-middleware — auth', () => {
  it('rejects request with no Authorization header (401)', async () => {
    const r = await call({ headers: {}, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(r.headers?.['Cache-Control']).toBe('no-store');
    expect(r.headers?.['WWW-Authenticate']).toBe('Bearer resource_metadata="https://test.cloudfront.net/.well-known/oauth-protected-resource"');
    expect(JSON.parse(r.body!).error).toBe('unauthorized');
  });

  it('rejects malformed bearer token (401)', async () => {
    const r = await call({ headers: { authorization: 'Bearer not.a.real.token' }, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(r.headers?.['WWW-Authenticate']).toBe('Bearer resource_metadata="https://test.cloudfront.net/.well-known/oauth-protected-resource"');
    expect(JSON.parse(r.body!).error).toBe('unauthorized');
  });

  it('rejects token signed with the wrong secret (401)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = signMcpToken('ou_user', exp, 'wrong-secret');
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body!).error).toBe('unauthorized');
  });

  it('rejects token with NaN expiresAt (401)', async () => {
    const payload = `ou_user:notanumber:${createHmac('sha256', TOKEN_KEY).update('ou_user:notanumber').digest('hex')}`;
    const tok = Buffer.from(payload).toString('base64url');
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body!).error).toBe('unauthorized');
  });

  it('rejects expired token (401)', async () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const tok = signMcpToken('ou_user', exp);
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body!).error).toBe('unauthorized');
  });

  it('returns 503 when SSM (state secret) read fails (not 401)', async () => {
    ssmFailNext = true;
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(503);
    expect(JSON.parse(r.body!).error).toBe('backend_unavailable');
  });
});

describe('mcp-middleware — Feishu token retrieval', () => {
  it('returns 403 with authorize_url when user has no Feishu token', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smFailMode = 'not_found';
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(403);
    const body = JSON.parse(r.body!);
    expect(body.error).toBe('feishu_not_authorized');
    expect(body.authorize_url).toMatch(/\/authorize\?t=/);
    expect(body.authorize_url).not.toMatch(/user_id=/);
    expect(r.headers?.['Content-Type']).toBe('application/json');
  });

  it('returns 503 when SM (token store) throttles', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smFailMode = 'throttle';
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(503);
    expect(JSON.parse(r.body!).error).toBe('backend_unavailable');
    expect(r.headers?.['Content-Type']).toBe('application/json');
  });

  it('returns 403 + authorize_url when the secret is scheduled for deletion (revoked user)', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    // A revoked user inside the 7-day recovery window: GetSecretValue raises
    // InvalidRequestException, not ResourceNotFoundException. Must still route to
    // re-authorize (403) rather than a 503 backend fault.
    smFailMode = 'pending_deletion';
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(403);
    const body = JSON.parse(r.body!);
    expect(body.error).toBe('feishu_not_authorized');
    expect(body.authorize_url).toMatch(/\/authorize\?t=/);
  });

  it('treats token within 120s of expiry as not authorized (403)', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = {
      access_token: 'feishu-tok',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    };
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(403);
    expect(JSON.parse(r.body!).error).toBe('feishu_not_authorized');
  });

  it('returns empty authorize_url when AUTHORIZE_BASE is not set', async () => {
    const origBase = process.env.AUTHORIZE_BASE;
    process.env.AUTHORIZE_BASE = '';
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smFailMode = 'not_found';
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(403);
    const body = JSON.parse(r.body!);
    expect(body.authorize_url).toBe('');
    process.env.AUTHORIZE_BASE = origBase;
  });

  it('401 falls back to a bare Bearer challenge when AUTHORIZE_BASE is unset', async () => {
    const origBase = process.env.AUTHORIZE_BASE;
    process.env.AUTHORIZE_BASE = '';
    const r = await call({ headers: {}, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(r.headers?.['WWW-Authenticate']).toBe('Bearer');
    process.env.AUTHORIZE_BASE = origBase;
  });
});

describe('mcp-middleware — proxy to AgentCore', () => {
  function authedEvent(extraHeaders: Record<string, string> = {}, body = '{"jsonrpc":"2.0"}') {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = {
      access_token: 'feishu-tok',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    return { headers: { authorization: `Bearer ${tok}`, ...extraHeaders }, body };
  }

  it('forwards Mcp-Session-Id from client to upstream and back to client', async () => {
    fetchResponse = {
      status: 200,
      body: '{}',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'upstream-session' },
    };
    const r = await call(authedEvent({ 'mcp-session-id': 'client-session' }));
    expect(r.statusCode).toBe(200);
    // Upstream received the client's session id
    const sentHeaders = fetchCalls[0].init.headers;
    expect(sentHeaders['Mcp-Session-Id']).toBe('client-session');
    // Client gets the upstream's session id back
    expect(r.headers?.['Mcp-Session-Id']).toBe('upstream-session');
  });

  it('injects X-User-Access-Token and X-Incr-Auth-Token in upstream request', async () => {
    await call(authedEvent());
    const sentHeaders = fetchCalls[0].init.headers;
    expect(sentHeaders['X-User-Access-Token']).toBe('feishu-tok');
    expect(sentHeaders['X-Incr-Auth-Token']).toBeTruthy();

    // X-Incr-Auth-Token is HMAC-signed with userId:exp:sig — verify shape
    const incr = sentHeaders['X-Incr-Auth-Token'];
    const decoded = Buffer.from(incr, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
    const userId = decoded.slice(0, secondLastColon);
    const expiresAt = parseInt(decoded.slice(secondLastColon + 1, lastColon));
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac('sha256', INCR_KEY).update(`${userId}:${expiresAt}`).digest('hex');
    expect(sig).toBe(expected);
    expect(userId).toBe('ou_user');
    // 5-min TTL window
    const now = Math.floor(Date.now() / 1000);
    expect(expiresAt - now).toBeGreaterThan(290);
    expect(expiresAt - now).toBeLessThanOrEqual(300);
  });

  it('returns 504 when upstream fetch throws (timeout/abort)', async () => {
    fetchResponse = { throwError: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) };
    const r = await call(authedEvent());
    expect(r.statusCode).toBe(504);
    expect(JSON.parse(r.body!).error).toBe('upstream_timeout');
  });

  it('passes through upstream 500 status (logs but does not mask)', async () => {
    fetchResponse = { status: 500, body: '{"error":"server"}', headers: { 'content-type': 'application/json' } };
    const r = await call(authedEvent());
    expect(r.statusCode).toBe(500);
    expect(r.body).toContain('server');
  });
});

describe('mcp-middleware — Cache-Control', () => {
  it('every response carries Cache-Control: no-store', async () => {
    const cases = [
      { event: { headers: {}, body: '{}' }, name: '401 no auth' },
      { event: { headers: { authorization: 'Bearer junk' }, body: '{}' }, name: '401 bad token' },
    ];
    for (const c of cases) {
      const r = await call(c.event);
      expect(r.headers?.['Cache-Control'], c.name).toBe('no-store');
    }
  });

  it('success proxy response also carries Cache-Control: no-store', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = {
      access_token: 'feishu-tok',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    fetchResponse = { status: 200, body: '{"result":"ok"}', headers: { 'content-type': 'application/json' } };
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(200);
    expect(r.headers?.['Cache-Control']).toBe('no-store');
  });
});

describe('mcp-middleware — isBase64Encoded', () => {
  function authedEvent(extraHeaders: Record<string, string> = {}, body = '{"jsonrpc":"2.0"}', isBase64 = false) {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = {
      access_token: 'feishu-tok',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    const b = isBase64 ? Buffer.from(body).toString('base64') : body;
    return { headers: { authorization: `Bearer ${tok}`, ...extraHeaders }, body: b, isBase64Encoded: isBase64 };
  }

  it('decodes base64-encoded body before forwarding to AgentCore', async () => {
    const r = await call(authedEvent({}, '{"jsonrpc":"2.0","method":"test"}', true));
    expect(r.statusCode).toBe(200);
    // Verify the upstream received the decoded body
    const sentBody = fetchCalls[0].init.body;
    expect(Buffer.from(sentBody).toString()).toBe('{"jsonrpc":"2.0","method":"test"}');
  });
});

describe('mcp-middleware — mcp-session-id response handling', () => {
  function authedEvent() {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = {
      access_token: 'feishu-tok',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    return { headers: { authorization: `Bearer ${tok}` }, body: '{}' };
  }

  it('does not include Mcp-Session-Id header when upstream does not return one', async () => {
    fetchResponse = { status: 200, body: '{}', headers: { 'content-type': 'application/json' } };
    const r = await call(authedEvent());
    expect(r.statusCode).toBe(200);
    expect(r.headers?.['Mcp-Session-Id']).toBeUndefined();
  });
});

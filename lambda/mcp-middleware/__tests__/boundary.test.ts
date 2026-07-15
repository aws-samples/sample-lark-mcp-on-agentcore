import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

process.env.STATE_SECRET_PARAM = '/test/state-secret';
process.env.RUNTIME_ARN = 'arn:aws:bedrock-agentcore:us-west-2:111:runtime/test';
process.env.AUTHORIZE_BASE = 'https://test.cloudfront.net';
process.env.DEPLOY_REGION = 'us-west-2';
process.env.SECRET_PREFIX = 'lark-mcp-on-agentcore/users';

const STATE_SECRET = 'test-state-secret';
const TOKEN_KEY = createHmac('sha256', STATE_SECRET).update('mcp-token-v1').digest();

let ssmFailNext = false;
const ssmSend = vi.fn(async () => {
  if (ssmFailNext) { ssmFailNext = false; throw Object.assign(new Error('throttle'), { name: 'ThrottlingException' }); }
  return { Parameter: { Value: STATE_SECRET } };
});

interface SmRow { access_token: string; expires_at: number }
let smStore: Record<string, SmRow> = {};
let smFailMode: 'none' | 'not_found' | 'throttle' = 'none';
const smSend = vi.fn(async (cmd: any) => {
  if (smFailMode === 'throttle') throw Object.assign(new Error('throttle'), { name: 'ThrottlingException' });
  if (smFailMode === 'not_found' || !smStore[cmd.input.SecretId]) throw Object.assign(new Error('not found'), { name: 'ResourceNotFoundException' });
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
  SignatureV4: class { async sign(req: any) { return { ...req, headers: { ...req.headers, 'x-amz-signed': '1' } }; } },
}));
vi.mock('@aws-crypto/sha256-js', () => ({ Sha256: class {} }));
vi.mock('@smithy/protocol-http', () => ({
  HttpRequest: class { method: string; hostname: string; path: string; headers: Record<string, string>; body: any; constructor(o: any) { Object.assign(this, o); } },
}));
vi.mock('@aws-sdk/credential-provider-node', () => ({ defaultProvider: () => async () => ({ accessKeyId: 'a', secretAccessKey: 'b' }) }));

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

function signMcpToken(userId: string, expiresAt: number, key: string | Buffer = TOKEN_KEY): string {
  const sig = createHmac('sha256', key).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

function authedEvent(extraHeaders: Record<string, string> = {}, body = '{}') {
  const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
  smStore['lark-mcp-on-agentcore/users/ou_user'] = { access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 };
  return { headers: { authorization: `Bearer ${tok}`, ...extraHeaders }, body };
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

// =============================================================================
// 1. Input Boundary Values
// =============================================================================

describe('middleware boundary — extreme inputs', () => {
  it('empty Authorization header treated as no auth (401)', async () => {
    const r = await call({ headers: { authorization: '' }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('Authorization header with only "Bearer" (no token) → 401', async () => {
    const r = await call({ headers: { authorization: 'Bearer ' }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('401 WWW-Authenticate carries resource_metadata pointing at the PRM doc', async () => {
    const r = await call({ headers: { authorization: '' }, body: '{}' });
    expect(r.statusCode).toBe(401);
    expect(r.headers!['WWW-Authenticate']).toBe(
      'Bearer resource_metadata="https://test.cloudfront.net/.well-known/oauth-protected-resource"'
    );
  });

  it('Authorization header with "Bearer" and spaces only → 401', async () => {
    const r = await call({ headers: { authorization: 'Bearer    ' }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('capitalized Authorization header variant works', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = { access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 };
    const r = await call({ headers: { Authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(200);
  });

  it('token with extremely long userId (1000 chars) still verifies', async () => {
    const longId = 'u'.repeat(1000);
    const tok = signMcpToken(longId, Math.floor(Date.now() / 1000) + 3600);
    smStore[`lark-mcp-on-agentcore/users/${longId}`] = { access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 };
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(200);
  });

  it('empty body proxied without crash', async () => {
    const r = await call(authedEvent({}, ''));
    expect(r.statusCode).toBe(200);
  });

  it('undefined body proxied without crash', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = { access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 };
    const r = await call({ headers: { authorization: `Bearer ${tok}` } });
    expect(r.statusCode).toBe(200);
  });

  it('very large body (100KB) proxied without crash', async () => {
    const bigBody = JSON.stringify({ data: 'x'.repeat(100000) });
    const r = await call(authedEvent({}, bigBody));
    expect(r.statusCode).toBe(200);
  });
});

// =============================================================================
// 2. Security Adversarial Inputs
// =============================================================================

describe('middleware boundary — adversarial tokens', () => {
  it('token that is valid base64url but contains no colons → 401', async () => {
    const garbage = Buffer.from('nocolonshere').toString('base64url');
    const r = await call({ headers: { authorization: `Bearer ${garbage}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('token with only one colon (no signature) → 401', async () => {
    const payload = Buffer.from('ou_user:12345').toString('base64url');
    const r = await call({ headers: { authorization: `Bearer ${payload}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('token with signature of different length than expected (not 64 hex) → 401', async () => {
    const payload = Buffer.from('ou_user:99999999999:short').toString('base64url');
    const r = await call({ headers: { authorization: `Bearer ${payload}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('token with correct format but all-zero signature → 401', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(`ou_user:${exp}:${'0'.repeat(64)}`).toString('base64url');
    const r = await call({ headers: { authorization: `Bearer ${payload}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('token signed with old/rotated secret → 401', async () => {
    const oldKey = createHmac('sha256', 'rotated-away-secret').update('mcp-token-v1').digest();
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600, oldKey);
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('non-base64url token (raw binary) → 401', async () => {
    const r = await call({ headers: { authorization: 'Bearer %%%not-base64%%%' }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('Bearer prefix case insensitivity (BEARER, bearer)', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = { access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 };
    const r = await call({ headers: { authorization: `BEARER ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(200);
  });

  it('Authorization with Basic scheme → 401 (not Bearer)', async () => {
    const r = await call({ headers: { authorization: 'Basic dXNlcjpwYXNz' }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('Mcp-Session-Id with newlines (header injection attempt) is forwarded as-is', async () => {
    const r = await call(authedEvent({ 'mcp-session-id': 'valid\r\nX-Injected: evil' }));
    expect(r.statusCode).toBe(200);
    // Verify the header value was forwarded (HttpRequest mock doesn't sanitize)
    const sent = fetchCalls[0].init.headers;
    expect(sent['Mcp-Session-Id']).toContain('valid');
  });
});

// =============================================================================
// 3. Protocol Compliance
// =============================================================================

describe('middleware boundary — protocol compliance', () => {
  it('request without body field still works (body defaults to empty)', async () => {
    const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
    smStore['lark-mcp-on-agentcore/users/ou_user'] = { access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 };
    const r = await call({ headers: { authorization: `Bearer ${tok}` } });
    expect(r.statusCode).toBe(200);
  });

  it('upstream returns content-type text/event-stream (SSE)', async () => {
    fetchResponse = { status: 200, body: 'event: message\ndata: {}\n\n', headers: { 'content-type': 'text/event-stream' } };
    const r = await call(authedEvent());
    expect(r.statusCode).toBe(200);
    expect(r.headers?.['Content-Type']).toBe('text/event-stream');
  });

  it('upstream returns 202 Accepted (proxied as-is)', async () => {
    fetchResponse = { status: 202, body: '{"accepted":true}', headers: { 'content-type': 'application/json' } };
    const r = await call(authedEvent());
    expect(r.statusCode).toBe(202);
  });

  it('upstream returns 429 Too Many Requests', async () => {
    fetchResponse = { status: 429, body: '{"error":"rate_limit"}', headers: { 'content-type': 'application/json' } };
    const r = await call(authedEvent());
    expect(r.statusCode).toBe(429);
  });

  it('isBase64Encoded false does not decode body', async () => {
    const r = await call({ ...authedEvent({}, '{"test":"raw"}'), isBase64Encoded: false });
    expect(r.statusCode).toBe(200);
    const sent = fetchCalls[0].init.body;
    expect(Buffer.from(sent).toString()).toBe('{"test":"raw"}');
  });
});

// =============================================================================
// 4. Uncovered branches
// =============================================================================

describe('middleware boundary — token decode_error branch', () => {
  it('completely invalid base64url token triggers decode_error (401)', async () => {
    const r = await call({ headers: { authorization: 'Bearer !!!invalid-not-base64!!!' }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });

  it('token with valid base64 but no colons triggers malformed_payload (401)', async () => {
    const tok = Buffer.from('nocolons').toString('base64url');
    const r = await call({ headers: { authorization: `Bearer ${tok}` }, body: '{}' });
    expect(r.statusCode).toBe(401);
  });
});

describe('middleware boundary — agentcore response logging', () => {
  it('slow response (>5s but success) logs agentcore_slow', async () => {
    // Drive a fake clock that jumps +6000ms WHEN fetch is invoked, so the
    // proxy's before/after Date.now() pair straddles the jump and durationMs>5000
    // deterministically (the old version keyed on a fragile call-count and never
    // actually hit the branch — a false-green this also fixes).
    const realNow = Date.now.bind(Date);
    let clockOffset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset);
    const ev = authedEvent();           // build token under the unshifted clock
    fetchResponse = { status: 200, body: '{}' };
    const realFetch = global.fetch as any;
    global.fetch = vi.fn(async (url: any, init: any) => {
      clockOffset += 6000;              // advance the clock across the fetch
      return realFetch(url, init);
    }) as any;

    const logs: any[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((line: any) => {
      try { logs.push(JSON.parse(line)); } catch { /* non-JSON */ }
    });

    const r = await call(ev);
    expect(r.statusCode).toBe(200);
    // The slow-path log must actually have fired (the assertion the old test lacked).
    expect(logs.some(l => l.event === 'agentcore_slow' && l.durationMs >= 5000)).toBe(true);

    logSpy.mockRestore();
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });
});

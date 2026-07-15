import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, createHash, randomBytes } from 'crypto';
import { mockClient } from './mock-client';

process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.CODE_TABLE = 'test-table';
process.env.CALLBACK_URL = 'https://test.cloudfront.net/callback';
process.env.SECRET_PREFIX = 'lark-mcp-on-agentcore/users';
process.env.OPENID_TABLE = 'lark-mcp-on-agentcore-openid-map';
process.env.APP_SECRET_ID = 'lark-mcp-on-agentcore/feishu-app';
process.env.STATE_SECRET_PARAM = '/lark-mcp-on-agentcore/state-secret';
process.env.OAUTH_CLIENT_ID = 'lark-mcp-on-agentcore';
process.env.FEISHU_SCOPES = 'im:message';

vi.mock('@aws-sdk/client-secrets-manager', () => mockClient.secretsManager);
vi.mock('@aws-sdk/client-ssm', () => mockClient.ssm);
vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET!;
const RAW_SECRET = 'test-state-secret-value';
const TOKEN_KEY = createHmac('sha256', RAW_SECRET).update('mcp-token-v1').digest();
const STATE_KEY = createHmac('sha256', RAW_SECRET).update('oauth-state-v1').digest();
const INCR_KEY = createHmac('sha256', RAW_SECRET).update('mcp-incr-auth-v1').digest();

function signIncrToken(userId: string, expiresAt: number, key: Buffer = INCR_KEY): string {
  const sig = createHmac('sha256', key).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

function buildState(payloadObj: any): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const ts = Math.floor(Date.now() / 1000);
  const full = `${payloadB64}.${ts}`;
  const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
  return `${full}.${sig}`;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function call(event: any) {
  vi.resetModules();
  const { handler } = await import('../index');
  return handler(event);
}

beforeEach(() => {
  mockClient.reset();
  mockClient.secretsManager.__set(
    'lark-mcp-on-agentcore/feishu-app',
    JSON.stringify({ appId: 'cli_test', appSecret: 'app-secret' })
  );
});
afterEach(() => { vi.restoreAllMocks(); });

// =============================================================================
// 1. Input Boundary Values
// =============================================================================

describe('boundary — empty/null/extreme inputs', () => {
  it('/authorize with all empty query params', async () => {
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: {} });
    expect(r.statusCode).toBe(400);
  });

  it('/authorize with extra_scope as empty string is OK', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256', extra_scope: '' },
    });
    expect(r.statusCode).toBe(302);
  });

  it('/authorize with extra_scope at 1000-char truncation limit (all valid scopes)', async () => {
    const longScope = 'im:message,'.repeat(90) + 'im:message'; // 90*11 + 10 = 1000
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256', extra_scope: longScope.slice(0, 1000) },
    });
    expect(r.statusCode).toBe(302);
  });

  it('/authorize with extra_scope exceeding 1000 chars truncates and invalidates', async () => {
    // 'fake:valid:x,' is 14 chars. 72 * 14 = 1008 > 1000. After slice(0,1000) last scope is truncated.
    const longScope = 'contact:user.base:readonly,'.repeat(40); // 40 * 27 = 1080
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256', extra_scope: longScope },
    });
    // The truncated trailing scope is not in the allowlist
    expect(r.statusCode).toBe(400);
  });

  it('/token with empty body returns unsupported_grant_type (no grant_type parsed)', async () => {
    const r = await call({ path: '/token', httpMethod: 'POST', body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('unsupported_grant_type');
  });

  it('/token with null body returns unsupported_grant_type', async () => {
    const r = await call({ path: '/token', httpMethod: 'POST', body: null, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('unsupported_grant_type');
  });

  it('/callback with empty code and state', async () => {
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: '', state: '' } });
    expect(r.statusCode).toBe(400);
  });

  it('t= token with userId containing unicode characters', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const t = signIncrToken('用户名_テスト', exp);
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    // Should succeed — unicode userId is valid
    expect(r.statusCode).toBe(302);
  });

  it('t= token with extremely long userId (500 chars)', async () => {
    const longId = 'a'.repeat(500);
    const exp = Math.floor(Date.now() / 1000) + 300;
    const t = signIncrToken(longId, exp);
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    expect(r.statusCode).toBe(302);
  });

  it('t= token with expiresAt at MAX_SAFE_INTEGER', async () => {
    const t = signIncrToken('ou_test', Number.MAX_SAFE_INTEGER);
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    // Token is far from expired — should work
    expect(r.statusCode).toBe(302);
  });

  it('t= token with expiresAt = 0 (epoch)', async () => {
    const t = signIncrToken('ou_test', 0);
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    // Expired — falls through to missing redirect_uri error
    expect(r.statusCode).toBe(400);
  });

  it('t= token with negative expiresAt', async () => {
    const t = signIncrToken('ou_test', -1);
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    expect(r.statusCode).toBe(400);
  });

  it('/token with redirect_uri as empty string (still required to match stored)', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({
      code: 'c1', userId: 'u', codeChallenge: challenge, redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'c1', code_verifier: verifier, redirect_uri: '', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri mismatch');
  });
});

// =============================================================================
// 2. Security Adversarial Inputs
// =============================================================================

describe('boundary — security adversarial inputs', () => {
  it('/authorize redirect_uri with javascript: protocol', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'javascript:alert(1)', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri not a valid URL');
  });

  it('/authorize redirect_uri with data: protocol', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'data:text/html,<script>alert(1)</script>', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('/authorize extra_scope with XSS payload', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256', extra_scope: '<script>alert(1)</script>' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('/authorize extra_scope with SQL injection payload', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256', extra_scope: "'; DROP TABLE users;--" },
    });
    expect(r.statusCode).toBe(400);
  });

  it('t= token with base64 standard encoding (+ and /) rejected', async () => {
    // Craft a base64 standard (not url-safe) token — should fail to parse
    const payload = 'ou_test:9999999999:deadbeef';
    const nonUrlSafe = Buffer.from(payload).toString('base64'); // uses + and /
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t: nonUrlSafe } });
    expect(r.statusCode).toBe(400);
  });

  it('t= token with truncated HMAC signature', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const fullToken = signIncrToken('ou_test', exp);
    const decoded = Buffer.from(fullToken, 'base64url').toString();
    // Truncate signature to 32 chars (half of 64-char hex)
    const lastColon = decoded.lastIndexOf(':');
    const truncated = decoded.slice(0, lastColon + 1) + decoded.slice(lastColon + 1, lastColon + 33);
    const t = Buffer.from(truncated).toString('base64url');
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    expect(r.statusCode).toBe(400);
  });

  it('t= token with padded HMAC (extra non-hex chars after sig) still rejected', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    // Manually build a token with corrupted signature
    const payload = `ou_test:${exp}`;
    const correctSig = createHmac('sha256', INCR_KEY).update(payload).digest('hex');
    // Flip the last char of the signature
    const flippedSig = correctSig.slice(0, -1) + (correctSig.slice(-1) === 'a' ? 'b' : 'a');
    const t = Buffer.from(`${payload}:${flippedSig}`).toString('base64url');
    const r = await call({ path: '/authorize', httpMethod: 'GET', queryStringParameters: { t } });
    expect(r.statusCode).toBe(400);
  });

  it('/callback state with null bytes in payload', async () => {
    const payloadB64 = Buffer.from('{"r":"https://x\x00.evil.com"}').toString('base64url');
    const ts = Math.floor(Date.now() / 1000);
    const full = `${payloadB64}.${ts}`;
    const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
    // State sig is valid → handler proceeds to the Feishu exchange; mock it so
    // the test never hits the network (would hang to timeout on CI).
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 99, msg: 'invalid code' })));
    const r = await call({
      path: '/callback', httpMethod: 'GET',
      queryStringParameters: { code: 'x', state: `${full}.${sig}` },
    });
    // State signature is valid, but the redirect_uri inside has null byte
    // The handler will try to proceed — this tests that no crash occurs
    expect([200, 302, 400]).toContain(r.statusCode);
  });

  it('/token client_secret with null byte injection', async () => {
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'x', code_verifier: 'v', redirect_uri: 'https://x.example', client_secret: 'test-client-secret\x00extra' }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    // timingSafeEqual should reject — length differs due to null byte
    expect(r.statusCode).toBe(401);
  });

  it('/token with duplicate parameters (first wins in URLSearchParams)', async () => {
    const body = 'grant_type=authorization_code&code=x&code=y&code_verifier=v&redirect_uri=https://x.example&client_secret=test-client-secret';
    const r = await call({
      path: '/token', httpMethod: 'POST', body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    // Our custom parseBody splits on & and first value wins for duplicate keys
    // client_secret matches → proceeds to code lookup
    expect([400, 401]).toContain(r.statusCode);
  });

  it('/authorize redirect_uri with hostname that looks like allowed domain suffix', async () => {
    // evil-quicksight.aws.amazon.com should NOT match quicksight.aws.amazon.com
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://evil-quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri not allowed');
  });

  it('/authorize redirect_uri with path traversal in URL', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/../../../etc/passwd', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    // URL is valid and hostname matches — should proceed (path traversal is irrelevant for redirect)
    expect(r.statusCode).toBe(302);
  });

  it('/authorize redirect_uri with credentials in URL', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://user:pass@quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    // URL constructor parses this fine, hostname matches
    expect(r.statusCode).toBe(302);
  });

  it('/callback incremental-auth rejects when consenting user has existing mapping to different owner', async () => {
    // stateData.u = 'ou_alice' but Feishu returns open_id for user B ('ou_bob')
    // whose mapping is already bound to a different userId ('ou_bob')
    const state = buildState({ u: 'ou_alice' });
    mockClient.dynamodb.__setOpenId('ou_bob', 'ou_bob');
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app_tok' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: { access_token: 'at', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_bob' }
      })));
    const r = await call({
      path: '/callback', httpMethod: 'GET',
      queryStringParameters: { code: 'valid_code', state },
    });
    expect(r.statusCode).toBe(403);
    expect(r.body).toContain('identity_mismatch');
  });

  it('/callback incremental-auth rejects unmapped consenting user whose open_id differs from session owner', async () => {
    // stateData.u = 'ou_alice', Feishu returns open_id = 'ou_bob', NO mapping exists.
    // Fail closed: open_id ≠ stateData.u and no mapping proves ownership.
    const state = buildState({ u: 'ou_alice' });
    // No __setOpenId call → getOpenIdMapping('ou_bob') returns null
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app_tok' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: { access_token: 'at', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_bob' }
      })));
    const r = await call({
      path: '/callback', httpMethod: 'GET',
      queryStringParameters: { code: 'valid_code', state },
    });
    expect(r.statusCode).toBe(403);
    expect(r.body).toContain('identity_mismatch');
  });

  it('/callback incremental-auth succeeds when consenting user matches session owner', async () => {
    const state = buildState({ u: 'ou_alice' });
    // Map ou_alice's open_id to the same userId so the check passes
    mockClient.dynamodb.__setOpenId('ou_alice', 'ou_alice');
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app_tok' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, data: { access_token: 'at', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_alice' }
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { name: 'Alice' } })));
    const r = await call({
      path: '/callback', httpMethod: 'GET',
      queryStringParameters: { code: 'valid_code', state },
    });
    // Should succeed (store token) — the success page or a redirect
    expect([200, 302]).toContain(r.statusCode);
    expect(r.body || '').not.toContain('identity_mismatch');
  });

  it('/token with malformed percent-encoding returns 400 not 500', async () => {
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: 'grant_type=authorization_code&code=%ZZ&code_verifier=v&redirect_uri=https://x.example&client_secret=test-client-secret',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    // URLSearchParams handles malformed % gracefully (returns literal string) → code lookup fails
    expect([400, 401]).toContain(r.statusCode);
  });
});

// =============================================================================
// 3. Protocol Compliance
// =============================================================================

describe('boundary — protocol compliance', () => {
  it('/authorize with POST method works (some OAuth clients POST)', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'POST',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    // The code uses path.includes("/authorize") regardless of method
    expect(r.statusCode).toBe(302);
  });

  it('/callback with POST method (some IdPs POST back)', async () => {
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c' });
    // Mock the Feishu exchange so the test never hits the network (would hang to
    // the 5s timeout on network-restricted CI runners).
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 99, msg: 'invalid code' })));
    const r = await call({
      path: '/callback', httpMethod: 'POST',
      queryStringParameters: { code: 'invalid-code', state },
    });
    // Exchange fails (code != 0) → 400; routing for POST works.
    expect([200, 302, 400]).toContain(r.statusCode);
  });

  it('/.well-known with POST method still returns metadata', async () => {
    const r = await call({ path: '/.well-known/oauth-authorization-server', httpMethod: 'POST' });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!).authorization_endpoint).toBeDefined();
  });

  it('/token with wrong Content-Type still parses body', async () => {
    // Some clients forget to set content-type
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: 'grant_type=authorization_code&code=x&code_verifier=v&redirect_uri=https://x.example&client_secret=test-client-secret',
      headers: { 'content-type': 'text/plain' },
    });
    // parseBody doesn't check Content-Type, just parses & pairs
    expect(r.statusCode).toBe(400); // invalid code, but parsed correctly
    expect(r.body).toContain('invalid or expired code');
  });

  it('/token with JSON body is not parsed as form data (unsupported_grant_type)', async () => {
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'x', client_secret: CLIENT_SECRET }),
      headers: { 'content-type': 'application/json' },
    });
    // parseBody splits on & which doesn't work for JSON → grant_type not recognized
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('unsupported_grant_type');
  });

  it('handles event with rawPath instead of path (HTTP API format)', async () => {
    const r = await call({ rawPath: '/token', httpMethod: 'GET', queryStringParameters: {} });
    expect(r.statusCode).toBe(405);
  });

  it('handles event with requestContext.http.path (API GW v2 format)', async () => {
    const r = await call({ requestContext: { http: { method: 'GET', path: '/token' } }, queryStringParameters: {} });
    expect(r.statusCode).toBe(405);
  });

  it('/token with application/x-www-form-urlencoded and percent-encoded values', async () => {
    const encoded = `grant_type=authorization_code&code=abc%3D%3D&code_verifier=v&redirect_uri=${encodeURIComponent('https://x.example')}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;
    const r = await call({
      path: '/token', httpMethod: 'POST', body: encoded,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    // client_secret should be correctly decoded and match
    expect(r.statusCode).toBe(400); // code invalid, but auth passed
    expect(r.body).toContain('invalid or expired code');
  });

  it('handles missing queryStringParameters gracefully', async () => {
    const r = await call({ path: '/authorize', httpMethod: 'GET' });
    expect(r.statusCode).toBe(400);
  });

  it('handles headers as undefined gracefully', async () => {
    const r = await call({ path: '/token', httpMethod: 'POST', body: 'grant_type=authorization_code&code=x&code_verifier=v&redirect_uri=https://x.example' });
    expect(r.statusCode).toBe(401); // no client_secret
  });

  it('EventBridge event does not return Cache-Control header', async () => {
    mockClient.secretsManager.__listNames([]);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));
    const { handler } = await import('../index');
    const r = await handler({ source: 'aws.events' });
    // EventBridge responses are internal — no HTTP headers
    expect(r.headers).toBeUndefined();
  });
});

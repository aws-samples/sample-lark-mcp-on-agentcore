import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { mockClient } from './mock-client';

// Required env vars must be set BEFORE the handler module is imported.
process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.CODE_TABLE = 'test-table';
process.env.CALLBACK_URL = 'https://test.cloudfront.net/callback';
process.env.SECRET_PREFIX = 'lark-mcp-on-agentcore/users';
process.env.OPENID_TABLE = 'lark-mcp-on-agentcore-openid-map';
process.env.APP_SECRET_ID = 'lark-mcp-on-agentcore/feishu-app';
process.env.STATE_SECRET_PARAM = '/lark-mcp-on-agentcore/state-secret';
process.env.OAUTH_CLIENT_ID = 'lark-mcp-on-agentcore';
process.env.FEISHU_SCOPES = 'im:message';
process.env.ALLOWED_DOMAINS = 'claude.ai';

vi.mock('@aws-sdk/client-secrets-manager', () => mockClient.secretsManager);
vi.mock('@aws-sdk/client-ssm', () => mockClient.ssm);
vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

const RAW_SECRET = 'test-state-secret-value';
const DCR_KEY = createHmac('sha256', RAW_SECRET).update('mcp-dcr-client-v1').digest();
const STATE_KEY = createHmac('sha256', RAW_SECRET).update('oauth-state-v1').digest();

// Build a signed internal state (mirrors signState) for end-to-end /callback tests.
function buildState(payloadObj: any): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const ts = Math.floor(Date.now() / 1000);
  const full = `${payloadB64}.${ts}`;
  const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
  return `${full}.${sig}`;
}

// Mock the Feishu exchange endpoints for /callback.
function mockFeishu() {
  vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app-token' }));
    if (url.includes('oidc/access_token')) return new Response(JSON.stringify({ code: 0, msg: 'ok', data: { access_token: 'feishu-tok', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_dcr_user' } }));
    if (url.includes('user_info')) return new Response(JSON.stringify({ code: 0, data: { name: 'DCR User' } }));
    return new Response('{}');
  });
}

// Local re-implementation of signClientId (mirrors signIncrToken pattern) so
// tests can forge tamper/garbage client_ids. The functions stay unexported.
function forgeClientId(payloadObj: any, key: Buffer = DCR_KEY): string {
  const payloadJson = JSON.stringify(payloadObj);
  const sig = createHmac('sha256', key).update('dcr:' + payloadJson).digest('hex');
  return Buffer.from(`${payloadJson}:${sig}`).toString('base64url');
}

async function call(event: any) {
  vi.resetModules();
  const { handler } = await import('../index');
  return handler(event);
}

function register(redirectUris: string[], extra: Record<string, any> = {}) {
  return call({
    path: '/register',
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: redirectUris, ...extra }),
  });
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
// POST /register — RFC 7591 Dynamic Client Registration
// =============================================================================

describe('POST /register', () => {
  it('registers a public client and returns an opaque signed client_id (no secret)', async () => {
    const r = await register(['https://claude.ai/api/mcp/auth_callback']);
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body!);
    expect(typeof body.client_id).toBe('string');
    expect(body.client_id.length).toBeGreaterThan(0);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body.client_secret).toBeUndefined();
    expect(body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });

  it('the returned client_id verifies under the DCR key (round-trip)', async () => {
    const r = await register(['https://claude.ai/api/mcp/auth_callback']);
    const { client_id } = JSON.parse(r.body!);
    // Decode the blob and verify the HMAC the way the Lambda does.
    const decoded = Buffer.from(client_id, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const payloadJson = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac('sha256', DCR_KEY).update('dcr:' + payloadJson).digest('hex');
    expect(sig).toBe(expected);
    const payload = JSON.parse(payloadJson);
    expect(typeof payload.n).toBe('string');
    expect(typeof payload.iat).toBe('number');
  });

  it('overrides client_secret_post to none', async () => {
    const r = await register(['https://claude.ai/x'], { token_endpoint_auth_method: 'client_secret_post' });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body!).token_endpoint_auth_method).toBe('none');
  });

  it('accepts loopback redirect (http, any port)', async () => {
    const r = await register(['http://127.0.0.1:54213/callback', 'http://localhost:8976/cb']);
    expect(r.statusCode).toBe(201);
  });

  it('rejects a non-allowlisted host', async () => {
    const r = await register(['https://evil.example.com/cb']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects a SUBDOMAIN of an allowlisted domain (M3 exact-host, no wildcard)', async () => {
    const r = await register(['https://evil.claude.ai/cb']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects cursor:// custom scheme', async () => {
    const r = await register(['cursor://anysphere.cursor-mcp/oauth/callback']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects a redirect_uri with userinfo@', async () => {
    const r = await register(['https://user:pass@claude.ai/cb']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects a redirect_uri with a fragment', async () => {
    const r = await register(['https://claude.ai/cb#frag']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects non-loopback http', async () => {
    const r = await register(['http://claude.ai/cb']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects missing redirect_uris', async () => {
    const r = await call({ path: '/register', httpMethod: 'POST', body: JSON.stringify({}) });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_client_metadata');
  });

  it('rejects non-array redirect_uris', async () => {
    const r = await call({ path: '/register', httpMethod: 'POST', body: JSON.stringify({ redirect_uris: 'x' }) });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_client_metadata');
  });

  it('rejects empty redirect_uris array', async () => {
    const r = await register([]);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_client_metadata');
  });

  it('rejects more than 5 redirect_uris', async () => {
    const r = await register(Array.from({ length: 6 }, (_, i) => `https://claude.ai/cb${i}`));
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_client_metadata');
  });

  it('rejects a list MIXING one valid + one invalid redirect_uri (whole request)', async () => {
    const r = await register(['https://claude.ai/cb', 'https://evil.example.com/cb']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });

  it('rejects a non-string element in redirect_uris', async () => {
    const r = await call({ path: '/register', httpMethod: 'POST', body: JSON.stringify({ redirect_uris: ['https://claude.ai/cb', 123] }) });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_client_metadata');
  });

  it('returns 400 (not 500) on a malformed JSON body', async () => {
    const r = await call({ path: '/register', httpMethod: 'POST', body: '{not json' });
    expect(r.statusCode).toBe(400);
  });

  it('Cache-Control: no-store on the response', async () => {
    const r = await register(['https://claude.ai/cb']);
    expect(r.headers!['Cache-Control']).toBe('no-store');
  });

  it('accepts a base64-encoded request body', async () => {
    const body = Buffer.from(JSON.stringify({ redirect_uris: ['https://claude.ai/cb'] })).toString('base64');
    const r = await call({ path: '/register', httpMethod: 'POST', isBase64Encoded: true, body });
    expect(r.statusCode).toBe(201);
  });

  it('rejects an unparseable redirect_uri (new URL throws)', async () => {
    const r = await register(['http://[::1:bad']);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_redirect_uri');
  });
});

// =============================================================================
// /authorize enhancements (H3 + L1)
// =============================================================================

describe('/authorize enhancements', () => {
  it('H3: rejects a request carrying BOTH t= and redirect_uri', async () => {
    const t = forgeIncrToken('user-1', Math.floor(Date.now() / 1000) + 300);
    const r = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { t, redirect_uri: 'https://claude.ai/cb', code_challenge: 'abc' },
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toContain('invalid_request');
  });

  it('L1: rejects code_challenge with a non-S256 method', async () => {
    const r = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://claude.ai/cb', code_challenge: 'abc', code_challenge_method: 'plain' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('L1: rejects code_challenge with NO method (defaults to plain, must be S256)', async () => {
    const r = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://claude.ai/cb', code_challenge: 'abc' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('still allows a normal DCR-style authorize (S256 method explicit) → 302', async () => {
    const r = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://claude.ai/cb', code_challenge: 'abc', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(302);
  });
});

// Forge an incremental-auth t= token (mirrors signIncrToken in the shim).
const INCR_KEY = createHmac('sha256', RAW_SECRET).update('mcp-incr-auth-v1').digest();
function forgeIncrToken(userId: string, expiresAt: number): string {
  const sig = createHmac('sha256', INCR_KEY).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

// =============================================================================
// /token A/B/C dispatch (security core)
// =============================================================================

import { createHash } from 'crypto';

function pkce() {
  const verifier = Buffer.from('verifier-fixed-for-tests-1234567890').toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function realRegister(redirectUris: string[]) {
  const r = await register(redirectUris);
  return JSON.parse(r.body!).client_id as string;
}

function tokenReq(fields: Record<string, string>) {
  return call({
    path: '/token', httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

describe('/token A/B/C dispatch', () => {
  const CLIENT_SECRET = 'test-client-secret';

  it('A: valid DCR client + correct PKCE, no secret → success', async () => {
    const { verifier, challenge } = pkce();
    const clientId = await realRegister(['https://claude.ai/cb']);
    mockClient.dynamodb.__seedCode({ code: 'c1', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c1', code_verifier: verifier, client_id: clientId });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!).access_token).toBeTruthy();
  });

  it('A: valid DCR client + client_secret present → 401 (secret forbidden) and does NOT consume code', async () => {
    const { verifier, challenge } = pkce();
    const clientId = await realRegister(['https://claude.ai/cb']);
    mockClient.dynamodb.__seedCode({ code: 'c2', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c2', code_verifier: verifier, client_id: clientId, client_secret: CLIENT_SECRET });
    expect(r.statusCode).toBe(401);
    expect(mockClient.dynamodb.__hasCode('c2')).toBe(true); // canary: code not burned
  });

  it('A: valid DCR client + missing code_verifier → 401 (PKCE mandatory)', async () => {
    const clientId = await realRegister(['https://claude.ai/cb']);
    mockClient.dynamodb.__seedCode({ code: 'c3', userId: 'u1', codeChallenge: 'x', redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c3', client_id: clientId });
    expect(r.statusCode).toBe(401);
    expect(r.body).toContain('code_verifier required'); // the DCR-branch 401, not branch C
    expect(mockClient.dynamodb.__hasCode('c3')).toBe(true); // not burned
  });

  it('B: absent client_id + valid secret + PKCE → success (legacy regression)', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({ code: 'c4', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c4', code_verifier: verifier, client_secret: CLIENT_SECRET });
    expect(r.statusCode).toBe(200);
  });

  it('B: ARBITRARY/garbage client_id + valid secret + PKCE → success (client_id ignored)', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({ code: 'c5', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c5', code_verifier: verifier, client_id: 'some-random-client-id', client_secret: CLIENT_SECRET });
    expect(r.statusCode).toBe(200);
  });

  it('C: not-DCR + no secret → 401', async () => {
    const { verifier } = pkce();
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c6', code_verifier: verifier });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body!).error).toBe('invalid_client');
  });

  it('C: not-DCR + present-but-wrong secret → 401 bad credentials', async () => {
    const { verifier } = pkce();
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c7', code_verifier: verifier, client_secret: 'wrong-secret' });
    expect(r.statusCode).toBe(401);
  });

  it('B: legacy secret + missing verifier → 400 (PKCE always-on shared step)', async () => {
    const { challenge } = pkce();
    mockClient.dynamodb.__seedCode({ code: 'c8', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c8', client_secret: CLIENT_SECRET });
    expect(r.statusCode).toBe(400);
  });

  it('A: DCR client + wrong PKCE verifier → 400 (code consumed, PKCE mismatch)', async () => {
    const { challenge } = pkce();
    const clientId = await realRegister(['https://claude.ai/cb']);
    mockClient.dynamodb.__seedCode({ code: 'c9', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'c9', code_verifier: 'wrong-verifier', client_id: clientId });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_grant');
    expect(mockClient.dynamodb.__hasCode('c9')).toBe(false); // DCR path consumes the code on PKCE mismatch
  });
});

// =============================================================================
// End-to-end DCR flow: /register → /callback → /token (exercises redirect_uri gate)
// =============================================================================

describe('DCR end-to-end flow', () => {
  async function e2eToToken(authorizeRedirect: string, tokenRedirect: string) {
    const { verifier, challenge } = pkce();
    const clientId = await realRegister([authorizeRedirect]);
    // /callback mints a real auth code via storeCode with the authorize redirect_uri baked in.
    mockFeishu();
    const state = buildState({ r: authorizeRedirect, s: 'cs', c: challenge });
    const cb = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'feishu-code', state } });
    expect(cb.statusCode).toBe(302);
    const code = cb.headers!.Location.match(/[?&]code=([a-f0-9]{64})/)![1];
    // Real /token: exercises the DCR dispatch + the redirect_uri exact-match gate + PKCE.
    return tokenReq({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: tokenRedirect });
  }

  it('full flow with a matching redirect_uri → 200 + token', async () => {
    const r = await e2eToToken('https://claude.ai/cb', 'https://claude.ai/cb');
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!).access_token).toBeTruthy();
  });

  it('full flow with a MISMATCHED redirect_uri at /token → 400 invalid_grant (the DCR redirect gate)', async () => {
    const r = await e2eToToken('https://claude.ai/cb', 'https://claude.ai/different');
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error).toBe('invalid_grant');
  });

  it('DCR code is single-use: replaying the same code → 400 invalid_grant', async () => {
    const { verifier, challenge } = pkce();
    const clientId = await realRegister(['https://claude.ai/cb']);
    mockFeishu();
    const state = buildState({ r: 'https://claude.ai/cb', s: 'cs', c: challenge });
    const cb = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'feishu-code', state } });
    const code = cb.headers!.Location.match(/[?&]code=([a-f0-9]{64})/)![1];
    const first = await tokenReq({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: 'https://claude.ai/cb' });
    expect(first.statusCode).toBe(200);
    const second = await tokenReq({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: 'https://claude.ai/cb' });
    expect(second.statusCode).toBe(400);
    expect(JSON.parse(second.body!).error).toBe('invalid_grant');
  });
});

// =============================================================================
// verifyClientId cross-scheme isolation (M4)
// =============================================================================

describe('client_id cross-scheme isolation (M4)', () => {
  it('an mcp-token forged value is NOT accepted as a DCR client_id', async () => {
    const TOKEN_KEY = createHmac('sha256', RAW_SECRET).update('mcp-token-v1').digest();
    const sig = createHmac('sha256', TOKEN_KEY).update('u1:9999999999').digest('hex');
    const fakeClientId = Buffer.from(`u1:9999999999:${sig}`).toString('base64url');
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({ code: 'cm1', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    // Presented as client_id with NO secret → must be branch C (401), not branch A.
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'cm1', code_verifier: verifier, client_id: fakeClientId });
    expect(r.statusCode).toBe(401);
  });

  it('the 4 deriveKey domain strings are pairwise distinct', () => {
    const domains = ['oauth-state-v1', 'mcp-token-v1', 'mcp-incr-auth-v1', 'mcp-dcr-client-v1'];
    expect(new Set(domains).size).toBe(4);
  });

  it('a tampered-payload DCR client_id is rejected (forged with wrong key)', async () => {
    const wrongKey = createHmac('sha256', RAW_SECRET).update('not-dcr').digest();
    const fakeClientId = forgeClientId({ n: 'abc', iat: Math.floor(Date.now() / 1000) }, wrongKey);
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({ code: 'cm2', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'cm2', code_verifier: verifier, client_id: fakeClientId });
    expect(r.statusCode).toBe(401); // not a valid DCR id, no secret → branch C
  });

  it('a far-future iat DCR client_id is rejected (L1)', async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 99999;
    const fakeClientId = forgeClientId({ n: 'abc', iat: farFuture });
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({ code: 'cm3', userId: 'u1', codeChallenge: challenge, redirectUri: '', expiresAt: Date.now() / 1000 + 60 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: 'cm3', code_verifier: verifier, client_id: fakeClientId });
    expect(r.statusCode).toBe(401);
  });
});

// =============================================================================
// AS metadata + PRM
// =============================================================================

describe('AS metadata (DCR additions)', () => {
  it('advertises registration_endpoint and none auth method', async () => {
    const r = await call({ path: '/.well-known/oauth-authorization-server', httpMethod: 'GET' });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.registration_endpoint).toContain('/register');
    expect(body.token_endpoint_auth_methods_supported).toEqual(['none', 'client_secret_post']);
    expect(body.client_id_metadata_document_supported).toBeUndefined();
  });
});

describe('Protected Resource Metadata (RFC 9728)', () => {
  it('GET /.well-known/oauth-protected-resource returns resource + authorization_servers', async () => {
    const r = await call({ path: '/.well-known/oauth-protected-resource', httpMethod: 'GET' });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body!);
    // baseUrl = CALLBACK_URL minus /callback = https://test.cloudfront.net
    expect(body.resource).toBe('https://test.cloudfront.net/mcp');
    expect(body.authorization_servers).toEqual(['https://test.cloudfront.net']);
  });

  it('does NOT echo a forged Host header (pinned CALLBACK_URL wins)', async () => {
    const r = await call({ path: '/.well-known/oauth-protected-resource', httpMethod: 'GET', headers: { host: 'attacker.cloudfront.net' } });
    const body = JSON.parse(r.body!);
    expect(body.authorization_servers).toEqual(['https://test.cloudfront.net']);
    expect(body.resource).toBe('https://test.cloudfront.net/mcp');
  });

  it('returns 500 (not an attacker-controlled issuer) when CALLBACK_URL is unpinned', async () => {
    const orig = process.env.CALLBACK_URL;
    process.env.CALLBACK_URL = 'SET_AFTER_DEPLOY';
    const r = await call({ path: '/.well-known/oauth-protected-resource', httpMethod: 'GET', headers: { host: 'attacker.cloudfront.net' } });
    expect(r.statusCode).toBe(500);
    process.env.CALLBACK_URL = orig;
  });
});

// expose the forge helper to other describe blocks in this file
export { forgeClientId, DCR_KEY, call };

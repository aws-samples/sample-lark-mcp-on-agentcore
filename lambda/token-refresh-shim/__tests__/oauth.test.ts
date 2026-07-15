import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, createHash, randomBytes } from 'crypto';
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
process.env.FEISHU_SCOPES = 'im:message contact:user.base:readonly';

vi.mock('@aws-sdk/client-secrets-manager', () => mockClient.secretsManager);
vi.mock('@aws-sdk/client-ssm', () => mockClient.ssm);
vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET!;

// Derive domain-separated keys the same way the Lambda does
const RAW_SECRET = 'test-state-secret-value'; // matches mock-client default
const TOKEN_KEY = createHmac('sha256', RAW_SECRET).update('mcp-token-v1').digest();
const STATE_KEY = createHmac('sha256', RAW_SECRET).update('oauth-state-v1').digest();
const INCR_KEY = createHmac('sha256', RAW_SECRET).update('mcp-incr-auth-v1').digest();

// Helpers ---------------------------------------------------------------------

function signMcpToken(userId: string, expiresAt: number, key: Buffer = TOKEN_KEY): string {
  const sig = createHmac('sha256', key).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

function signIncrToken(userId: string, expiresAt: number, key: Buffer = INCR_KEY): string {
  const sig = createHmac('sha256', key).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function call(event: any) {
  // Reset module so module-level appId/appSecret cache is fresh per test.
  vi.resetModules();
  const { handler } = await import('../index');
  return handler(event);
}

// Seed app credentials before every test so loadAppCredentials() succeeds.
beforeEach(() => {
  mockClient.reset();
  mockClient.secretsManager.__set(
    'lark-mcp-on-agentcore/feishu-app',
    JSON.stringify({ appId: 'cli_test', appSecret: 'app-secret' })
  );
});
afterEach(() => { vi.restoreAllMocks(); });

// =============================================================================
// /authorize
// =============================================================================

describe('/authorize — extra_scope validation', () => {
  it('accepts comma-separated scopes that are in the allowlist', async () => {
    const { challenge } = pkce();
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: {
        redirect_uri: 'https://quicksight.aws.amazon.com/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        extra_scope: 'im:chat:read,im:message',
      },
    });
    expect(result.statusCode).toBe(302);
    expect(result.headers?.Location).toContain('scope=');
    expect(result.headers?.Location).toContain('im%3Achat%3Aread');
  });

  it('rejects space-separated extra_scope (would have been accepted in old regex)', async () => {
    const { challenge } = pkce();
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: {
        redirect_uri: 'https://quicksight.aws.amazon.com/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        extra_scope: 'im:chat:read im:message',
      },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('extra_scope contains unknown or malformed scope');
  });

  it('rejects scope that is syntactically valid but not in allowlist', async () => {
    const { challenge } = pkce();
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: {
        redirect_uri: 'https://quicksight.aws.amazon.com/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        extra_scope: 'fake:nonexistent:scope',
      },
    });
    expect(result.statusCode).toBe(400);
  });
});

describe('/authorize — redirect_uri allowlist', () => {
  it('rejects hostname spoofing (attacker subdomain trick)', async () => {
    const { challenge } = pkce();
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: {
        redirect_uri: 'https://quicksight.aws.amazon.com.attacker.com/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('redirect_uri not allowed');
  });

  it('rejects http for non-localhost hosts', async () => {
    const { challenge } = pkce();
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: {
        redirect_uri: 'http://quicksight.aws.amazon.com/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('must use https');
  });

  it('accepts localhost over http (RFC 8252 native-app flow)', async () => {
    const { challenge } = pkce();
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: {
        redirect_uri: 'http://localhost:31337/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      },
    });
    expect(result.statusCode).toBe(302);
  });
});

describe('/authorize — t= incremental-auth token', () => {
  it('accepts a valid signed t= token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const t = signIncrToken('ou_test', exp);
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { t },
    });
    expect(result.statusCode).toBe(302);
    // location should embed Feishu state derived from u=ou_test (not the legacy user_id form)
    expect(result.headers?.Location).toContain('accounts.feishu.cn');
  });

  it('rejects a t= token signed with a different secret (tamper)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const t = signIncrToken('ou_attacker', exp, Buffer.from('wrong-secret'));
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { t },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('missing redirect_uri or signed t= token');
  });

  it('rejects expired t= token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const t = signIncrToken('ou_test', exp);
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { t },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('missing redirect_uri or signed t= token');
  });

  it('rejects legacy ?user_id= path (PR25 regression guard)', async () => {
    const result = await call({
      path: '/authorize',
      httpMethod: 'GET',
      queryStringParameters: { user_id: 'ou_attacker' },
    });
    expect(result.statusCode).toBe(400);
  });
});

// =============================================================================
// /token
// =============================================================================

describe('/token — client_secret enforcement', () => {
  function tokenBody(extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ grant_type: 'authorization_code', code: 'fake', code_verifier: 'v', redirect_uri: 'https://x.example', ...extra });
    return params.toString();
  }

  it('rejects request with no client_secret (401, before any DB lookup)', async () => {
    const result = await call({
      path: '/token',
      httpMethod: 'POST',
      body: tokenBody(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(result.statusCode).toBe(401);
    // v3 DCR dispatch: no DCR client_id AND no secret → branch C (invalid_client).
    expect(result.body).toContain('invalid_client');
    // Code DB must not be touched — wrong secret should not burn the code.
    expect(mockClient.dynamodb.__hasCode('any')).toBe(false);
  });

  it('rejects wrong client_secret (401)', async () => {
    const result = await call({
      path: '/token',
      httpMethod: 'POST',
      body: tokenBody({ client_secret: 'WRONG' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('bad client credentials');
  });

  it('client_secret check runs BEFORE retrieveAndDeleteCode (does not consume code)', async () => {
    // Seed a real code; it should still be present after the failed exchange.
    mockClient.dynamodb.__seedCode({
      code: 'real-code', userId: 'u1', codeChallenge: 'cc', redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    await call({
      path: '/token',
      httpMethod: 'POST',
      body: tokenBody({ code: 'real-code', client_secret: 'WRONG' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(mockClient.dynamodb.__hasCode('real-code')).toBe(true);
  });

  it('issues an MCP token when client_secret + PKCE both correct', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({
      code: 'real-code', userId: 'ou_user', codeChallenge: challenge, redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    const result = await call({
      path: '/token',
      httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'real-code', code_verifier: verifier, redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body!);
    expect(body.access_token).toBeTruthy();
    expect(body.token_type).toBe('Bearer');
    // Now the code IS consumed.
    expect(mockClient.dynamodb.__hasCode('real-code')).toBe(false);
  });
});

describe('/token — PKCE', () => {
  it('rejects when code_verifier does not match the challenge', async () => {
    const { challenge } = pkce();
    mockClient.dynamodb.__seedCode({
      code: 'real-code', userId: 'u1', codeChallenge: challenge, redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    const result = await call({
      path: '/token',
      httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'real-code', code_verifier: 'wrong-verifier', redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('code_verifier mismatch');
  });
});

// =============================================================================
// /callback (state verification)
// =============================================================================

describe('/callback — state verification', () => {
  it('rejects a state with a tampered signature (403)', async () => {
    const result = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'fake', state: 'aaaa.123.bb' },
    });
    expect(result.statusCode).toBe(403);
  });

  it('rejects expired state', async () => {
    // craft an old-but-correctly-signed state and verify it's refused
    const old = Math.floor(Date.now() / 1000) - 99999;
    const payload = Buffer.from(JSON.stringify({ r: 'https://x.example' })).toString('base64url');
    const full = `${payload}.${old}`;
    const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
    const result = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'fake', state: `${full}.${sig}` },
    });
    expect(result.statusCode).toBe(403);
  });
});

// =============================================================================
// MCP token verification (for parity with what the middleware does)
// =============================================================================

describe('MCP token shape', () => {
  it('a freshly issued MCP token verifies under the same secret', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({
      code: 'c2', userId: 'ou_z', codeChallenge: challenge, redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    const r = await call({
      path: '/token',
      httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'c2', code_verifier: verifier, redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const token = JSON.parse(r.body!).access_token;
    const decoded = Buffer.from(token, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
    const userId = decoded.slice(0, secondLastColon);
    const expiresAt = parseInt(decoded.slice(secondLastColon + 1, lastColon));
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac('sha256', TOKEN_KEY).update(`${userId}:${expiresAt}`).digest('hex');
    expect(sig).toBe(expected);
    expect(userId).toBe('ou_z');
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
  });
});

// =============================================================================
// /callback (full Feishu exchange path)
// =============================================================================

// Build a state string the way signState() inside index.ts would.
function buildState(payloadObj: any): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const ts = Math.floor(Date.now() / 1000);
  const full = `${payloadB64}.${ts}`;
  const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
  return `${full}.${sig}`;
}

// Mock the three Feishu endpoints + user_info. Returns the recorded calls so
// tests can assert on what was sent.
function mockFeishu(opts: {
  exchange?: { code?: number; msg?: string; data?: any };
  userInfo?: { code?: number; data?: { name?: string } };
  userInfoFails?: boolean;
} = {}) {
  const calls: { url: string; init?: any }[] = [];
  vi.spyOn(global, 'fetch').mockImplementation(async (input: any, init: any) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, init });
    if (url.includes('app_access_token')) {
      return new Response(JSON.stringify({ app_access_token: 'app-token' }));
    }
    if (url.includes('oidc/access_token')) {
      const body = opts.exchange ?? {
        code: 0, msg: 'ok',
        data: { access_token: 'feishu-tok', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_real_user' },
      };
      return new Response(JSON.stringify(body));
    }
    if (url.includes('user_info')) {
      if (opts.userInfoFails) throw new Error('network');
      const body = opts.userInfo ?? { code: 0, data: { name: '张三' } };
      return new Response(JSON.stringify(body));
    }
    return new Response('{}');
  });
  return { calls };
}

describe('/callback — full Feishu exchange path', () => {
  it('standard OAuth flow: stores token, generates auth code, 302 to client', async () => {
    mockFeishu();
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 'client-state-xyz', c: 'pkce-challenge' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(302);
    const loc = r.headers!.Location;
    expect(loc).toMatch(/^https:\/\/quicksight\.aws\.amazon\.com\/cb\?code=[a-f0-9]{64}&state=client-state-xyz$/);
    // Verify token was actually persisted
    const stored = mockClient.secretsManager.__get('lark-mcp-on-agentcore/users/ou_real_user');
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored);
    expect(parsed.access_token).toBe('feishu-tok');
    expect(parsed.refresh_token).toBe('rt');
    expect(parsed.expires_at).toBeGreaterThan(Date.now() / 1000);
  });

  it('returns 400 when Feishu exchange fails (code != 0)', async () => {
    mockFeishu({ exchange: { code: 99, msg: 'bad code', data: undefined } });
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'fake', state },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('feishu_exchange_failed');
  });

  it('legacy flow (no redirect_uri, signed t= → state {u}) renders success HTML with the user name', async () => {
    mockFeishu();
    const state = buildState({ u: 'ou_real_user' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers?.['Content-Type']).toContain('text/html');
    expect(r.body).toContain('授权成功');
    expect(r.body).toContain('张三');
  });

  it('falls back to userId prefix when /authen/v1/user_info fails', async () => {
    mockFeishu({ userInfoFails: true, exchange: { code: 0, msg: 'ok', data: { access_token: 'feishu-tok', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_abcdefghijklmnop' } } });
    const state = buildState({ u: 'ou_abcdefghijklmnop' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(200);
    // Should show short prefix, not full userId
    expect(r.body).toContain('ou_abcde');
    expect(r.body).not.toContain('ou_abcdefghijklmnop 已完成');
  });

  it('reuses existing userId via openid mapping on second OAuth (dedup)', async () => {
    // First login: stores an openid mapping ou_real_user -> ou_real_user
    mockFeishu();
    const state1 = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c1' });
    await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'c1', state: state1 } });

    // Simulate: the mapping was stored — seed it explicitly in DDB
    mockClient.dynamodb.__setOpenId('ou_real_user', 'stable-id-from-first-login');

    // Second login with same open_id: should reuse stable-id-from-first-login
    mockFeishu();
    const state2 = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's2', c: 'c2' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'c2', state: state2 } });
    expect(r.statusCode).toBe(302);
    // The auth code stored must reference stable-id-from-first-login
    // We can verify by checking the token stored under that userId
    const stored = mockClient.secretsManager.__get('lark-mcp-on-agentcore/users/stable-id-from-first-login');
    expect(stored).toBeDefined();
  });

  it('restores a pending-deletion secret when user re-authorizes within the recovery window', async () => {
    const userSecretId = 'lark-mcp-on-agentcore/users/ou_real_user';
    // A revoked user's secret inside the 7-day recovery window: present but pending-deletion.
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({ access_token: 'stale', refresh_token: 'rt', expires_at: 0, issued_at: 0 }));
    mockClient.secretsManager.__schedulePendingDeletion(userSecretId);

    // User re-authorizes: callback → storeToken's PutSecretValue hits InvalidRequestException
    // → RestoreSecret → PutSecretValue succeeds.
    mockFeishu();
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });

    expect(r.statusCode).toBe(302);
    expect(mockClient.secretsManager.__isPendingDeletion(userSecretId)).toBe(false);
    const stored = JSON.parse(mockClient.secretsManager.__get(userSecretId));
    expect(stored.access_token).toBe('feishu-tok');
  });

  it('creates a new secret on first authorization (PutSecretValue → ResourceNotFoundException → CreateSecret)', async () => {
    const userSecretId = 'lark-mcp-on-agentcore/users/ou_real_user';
    // First-time user: no secret yet → PutSecretValue raises ResourceNotFoundException,
    // storeToken falls back to CreateSecret.
    mockClient.secretsManager.__failPutMatching('users/ou_real_user', { name: 'ResourceNotFoundException', message: 'not found' });

    mockFeishu();
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });

    expect(r.statusCode).toBe(302);
    const stored = JSON.parse(mockClient.secretsManager.__get(userSecretId));
    expect(stored.access_token).toBe('feishu-tok');
  });

  it('returns 400 (not 502) when Feishu returns a non-JSON body for the code exchange', async () => {
    // Feishu (or an edge WAF in front of it) can answer certain malformed `code`
    // values with an HTML block page / empty body instead of JSON. The exchange
    // response parser must not throw on that — otherwise the Lambda crashes and
    // API Gateway returns 502, a DoS vector triggerable by anyone.
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app-token' }));
      if (url.includes('oidc/access_token')) return new Response('<html><body>blocked</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('{}');
    });
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: '<svg onload=alert(1)>', state } });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('feishu_exchange_failed');
  });

  it('throws when getOpenIdMapping hits DDB error — prevents identity fork', async () => {
    mockFeishu();
    mockClient.dynamodb.__failOpenidGet({ name: 'ThrottlingException', message: 'rate exceeded' });
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'c' });
    await expect(call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } }))
      .rejects.toThrow('rate exceeded');
  });
});

// =============================================================================
// /.well-known/oauth-authorization-server
// =============================================================================

describe('/.well-known/oauth-authorization-server', () => {
  it('returns metadata JSON with correct endpoints', async () => {
    const r = await call({ path: '/.well-known/oauth-authorization-server', httpMethod: 'GET' });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.authorization_endpoint).toContain('/authorize');
    expect(body.token_endpoint).toContain('/token');
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.token_endpoint_auth_methods_supported).toEqual(['none', 'client_secret_post']);
  });
});

// =============================================================================
// /.well-known/aws/securityagent-domain-verification.json
// =============================================================================

describe('/.well-known/aws/securityagent-domain-verification.json', () => {
  const PATH = '/.well-known/aws/securityagent-domain-verification.json';
  afterEach(() => { delete process.env.DOMAIN_VERIFICATION; });

  it('404s when DOMAIN_VERIFICATION is unset (inert by default)', async () => {
    delete process.env.DOMAIN_VERIFICATION;
    const r = await call({ path: PATH, httpMethod: 'GET' });
    expect(r.statusCode).toBe(404);
    expect(r.body).toContain('not_found');
  });

  it('serves the configured body verbatim with JSON content-type', async () => {
    const body = '{"tokens":["LtYrhHdc7nH72gaZcV3J-A"]}';
    process.env.DOMAIN_VERIFICATION = body;
    const r = await call({ path: PATH, httpMethod: 'GET' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe(body);
    expect(r.headers?.['Content-Type']).toBe('application/json');
    // Verbatim passthrough must not corrupt the documented {"tokens":[...]} shape.
    expect(JSON.parse(r.body!).tokens).toEqual(['LtYrhHdc7nH72gaZcV3J-A']);
  });

  it('supports multiple tokens (multi agent-space) without code change', async () => {
    process.env.DOMAIN_VERIFICATION = '{"tokens":["tok-a","tok-b"]}';
    const r = await call({ path: PATH, httpMethod: 'GET' });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!).tokens).toEqual(['tok-a', 'tok-b']);
  });
});

// =============================================================================
// Routing: GET /token, unknown paths
// =============================================================================

describe('routing', () => {
  it('GET /token returns 405 Method Not Allowed', async () => {
    const r = await call({ path: '/token', httpMethod: 'GET' });
    expect(r.statusCode).toBe(405);
    expect(r.body).toContain('method_not_allowed');
    expect(r.headers?.['Content-Type']).toBe('application/json');
  });

  it('unknown path returns 404', async () => {
    const r = await call({ path: '/nonexistent', httpMethod: 'GET' });
    expect(r.statusCode).toBe(404);
    expect(r.body).toContain('not_found');
  });

  it('unsupported grant_type returns 400', async () => {
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'client_credentials', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('unsupported_grant_type');
  });
});

// =============================================================================
// /authorize — redirect_uri validation branches
// =============================================================================

describe('/authorize — redirect_uri validation', () => {
  const baseQ = { code_challenge: 'fakechallenge', code_challenge_method: 'S256' };

  it('allows localhost with http (native client dev flow)', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { ...baseQ, redirect_uri: 'http://localhost:8080/cb' },
    });
    expect(r.statusCode).toBe(302);
  });

  it('allows 127.0.0.1 with http', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { ...baseQ, redirect_uri: 'http://127.0.0.1:9999/cb' },
    });
    expect(r.statusCode).toBe(302);
  });

  it('rejects non-localhost with http (must be https)', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { ...baseQ, redirect_uri: 'http://quicksight.aws.amazon.com/cb' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri must use https');
  });

  it('rejects unknown hostname not in ALLOWED_DOMAINS', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { ...baseQ, redirect_uri: 'https://attacker.com/cb' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri not allowed');
  });

  it('rejects invalid URL as redirect_uri', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { ...baseQ, redirect_uri: 'not-a-url' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri not a valid URL');
  });

  it('rejects missing code_challenge when redirect_uri present', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('code_challenge required');
  });

  it('rejects code_challenge_method other than S256', async () => {
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'x', code_challenge_method: 'plain' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('only S256');
  });
});

// =============================================================================
// /token — redirect_uri mismatch + expired code
// =============================================================================

describe('/token — additional grant validation', () => {
  it('rejects when redirect_uri does not match stored value', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({
      code: 'redir-code', userId: 'u', codeChallenge: challenge, redirectUri: 'https://original.example', expiresAt: Date.now() / 1000 + 60,
    });
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'redir-code', code_verifier: verifier, redirect_uri: 'https://different.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri mismatch');
  });

  it('rejects expired authorization code', async () => {
    const { verifier, challenge } = pkce();
    mockClient.dynamodb.__seedCode({
      code: 'expired-code', userId: 'u', codeChallenge: challenge, redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 - 10,
    });
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'expired-code', code_verifier: verifier, redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('code expired');
  });

  it('rejects missing code_verifier', async () => {
    mockClient.dynamodb.__seedCode({
      code: 'no-pkce', userId: 'u', codeChallenge: 'cc', redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'no-pkce', redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('code_verifier required');
  });
});

// =============================================================================
// getCallbackUrl dynamic derivation
// =============================================================================

describe('getCallbackUrl — dynamic host derivation', () => {
  it('derives callback from cloudfront.net host header when CALLBACK_URL is not set', async () => {
    const origCb = process.env.CALLBACK_URL;
    process.env.CALLBACK_URL = '';
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      headers: { host: 'd111.cloudfront.net' },
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(302);
    process.env.CALLBACK_URL = origCb;
  });

  it('derives callback from requestContext.domainName when no host header', async () => {
    const origCb = process.env.CALLBACK_URL;
    process.env.CALLBACK_URL = '';
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      headers: {},
      requestContext: { domainName: 'abc.execute-api.us-west-2.amazonaws.com' },
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(302);
    process.env.CALLBACK_URL = origCb;
  });

  it('derives callback from ALLOWED_DOMAINS custom domain', async () => {
    const origCb = process.env.CALLBACK_URL;
    const origDomains = process.env.ALLOWED_DOMAINS;
    process.env.CALLBACK_URL = '';
    process.env.ALLOWED_DOMAINS = 'mydomain.example.com';
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      headers: { host: 'mydomain.example.com' },
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(302);
    process.env.CALLBACK_URL = origCb;
    process.env.ALLOWED_DOMAINS = origDomains;
  });

  it('returns 500 when host is not recognized and callback URL cannot be derived', async () => {
    const origCb = process.env.CALLBACK_URL;
    process.env.CALLBACK_URL = '';
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      headers: { host: 'unknown-host.evil.com' },
      queryStringParameters: { redirect_uri: 'https://quicksight.aws.amazon.com/cb', code_challenge: 'c', code_challenge_method: 'S256' },
    });
    expect(r.statusCode).toBe(500);
    expect(r.body).toContain('callback URL cannot be derived');
    process.env.CALLBACK_URL = origCb;
  });
});

// =============================================================================
// isBase64Encoded body decoding
// =============================================================================

describe('isBase64Encoded body decoding', () => {
  it('/token decodes base64 body from API Gateway', async () => {
    const raw = new URLSearchParams({ grant_type: 'authorization_code', code: 'fake', code_verifier: 'v', redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString();
    const encoded = Buffer.from(raw).toString('base64');
    mockClient.dynamodb.__seedCode({
      code: 'fake', userId: 'u', codeChallenge: createHash('sha256').update('v').digest('base64url'), redirectUri: 'https://x.example', expiresAt: Date.now() / 1000 + 60,
    });
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: encoded, isBase64Encoded: true,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!).access_token).toBeTruthy();
  });
});

// =============================================================================
// /callback — edge cases
// =============================================================================

describe('/callback — edge cases', () => {
  it('returns 400 when code is missing', async () => {
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { state: 'something' } });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('Missing code or state');
  });

  it('returns 400 when state is missing', async () => {
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'something' } });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('Missing code or state');
  });

  it('returns 400 when state payload is not valid JSON (after HMAC passes)', async () => {
    // Build a state that signs non-JSON payload
    const payloadB64 = Buffer.from('not-json{{{').toString('base64url');
    const ts = Math.floor(Date.now() / 1000);
    const full = `${payloadB64}.${ts}`;
    const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
    const r = await call({
      path: '/callback', httpMethod: 'GET',
      queryStringParameters: { code: 'x', state: `${full}.${sig}` },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('invalid state payload');
  });

  it('generates random userId when Feishu returns no open_id', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app' }));
      if (url.includes('oidc/access_token')) return new Response(JSON.stringify({ code: 0, msg: 'ok', data: { access_token: 'tok', refresh_token: 'rt', expires_in: 7200 } }));
      if (url.includes('user_info')) return new Response(JSON.stringify({ code: 0, data: { name: 'Test' } }));
      return new Response('{}');
    });
    const state = buildState({ u: undefined, r: undefined });
    // Legacy flow with no open_id in Feishu response → random hex userId
    const r = await call({ path: '/callback', httpMethod: 'GET', headers: { 'accept-language': 'zh' }, queryStringParameters: { code: 'ok', state } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('授权成功');
  });

  it('uses & separator when redirect_uri already contains ?', async () => {
    mockFeishu();
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb?foo=bar', s: '', c: 'cc' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });
    expect(r.statusCode).toBe(302);
    expect(r.headers!.Location).toMatch(/cb\?foo=bar&code=/);
  });

  it('omits &state= when client_state is empty', async () => {
    mockFeishu();
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: '', c: 'cc' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });
    expect(r.statusCode).toBe(302);
    expect(r.headers!.Location).not.toContain('&state=');
  });

  it('getUserInfo non-zero code falls back to short userId', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app' }));
      if (url.includes('oidc/access_token')) return new Response(JSON.stringify({ code: 0, msg: 'ok', data: { access_token: 'tok', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_xyz' } }));
      if (url.includes('user_info')) return new Response(JSON.stringify({ code: 40003, data: {} }));
      return new Response('{}');
    });
    const state = buildState({ u: 'ou_xyz' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('ou_xyz');
  });
});

// =============================================================================
// /authorize — incremental auth with extra_scope
// =============================================================================

describe('/authorize — incremental auth flow', () => {
  it('includes extra_scope in redirect when using valid t= token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const t = signIncrToken('ou_test', exp);
    const r = await call({
      path: '/authorize', httpMethod: 'GET',
      queryStringParameters: { t, extra_scope: 'im:message' },
    });
    expect(r.statusCode).toBe(302);
    expect(r.headers!.Location).toContain('scope=');
    expect(r.headers!.Location).toContain('im%3Amessage');
  });
});

// =============================================================================
// verifyState — exception handling
// =============================================================================

describe('verifyState — catch branch', () => {
  it('returns invalid for completely garbage state (triggers catch)', async () => {
    // A state value that will cause Buffer.from to throw or parse to fail
    const r = await call({
      path: '/callback', httpMethod: 'GET',
      queryStringParameters: { code: 'x', state: '%00%00%00' },
    });
    expect(r.statusCode).toBe(403);
  });
});

// =============================================================================
// openid mapping (DynamoDB)
// =============================================================================

describe('openid mapping (DynamoDB)', () => {
  it('getOpenIdMapping returns null for new user → stableUserId = open_id', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app' }));
      if (url.includes('oidc/access_token')) return new Response(JSON.stringify({ code: 0, msg: 'ok', data: { access_token: 'tok', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_new' } }));
      if (url.includes('user_info')) return new Response(JSON.stringify({ code: 0, data: { name: 'Bob' } }));
      return new Response('{}');
    });
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'cc' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });
    expect(r.statusCode).toBe(302);
    // token stored under the open_id as userId
    const stored = mockClient.secretsManager.__get('lark-mcp-on-agentcore/users/ou_new');
    expect(stored).toBeDefined();
    // stableUserId === open_id → no DDB write (guard in index.ts)
    expect(mockClient.dynamodb.__getOpenId('ou_new')).toBeUndefined();
  });

  it('storeOpenIdMapping writes to DDB when stableUserId differs from open_id', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app' }));
      if (url.includes('oidc/access_token')) return new Response(JSON.stringify({ code: 0, msg: 'ok', data: { access_token: 'tok', refresh_token: 'rt', expires_in: 7200, open_id: 'ou_mapped' } }));
      if (url.includes('user_info')) return new Response(JSON.stringify({ code: 0, data: { name: 'Alice' } }));
      return new Response('{}');
    });
    // Seed: mapping already exists pointing to a different stable id
    mockClient.dynamodb.__setOpenId('ou_mapped', 'stable-mapped-id');
    const state = buildState({ r: 'https://quicksight.aws.amazon.com/cb', s: 's', c: 'cc' });
    const r = await call({ path: '/callback', httpMethod: 'GET', queryStringParameters: { code: 'ok', state } });
    expect(r.statusCode).toBe(302);
    // Token stored under the stable mapped id
    const stored = mockClient.secretsManager.__get('lark-mcp-on-agentcore/users/stable-mapped-id');
    expect(stored).toBeDefined();
    // Mapping updated in DDB
    expect(mockClient.dynamodb.__getOpenId('ou_mapped')).toBe('stable-mapped-id');
  });
});

// =============================================================================
// /token — invalid code (consumed or never existed)
// =============================================================================

describe('/token — invalid code', () => {
  it('returns 400 for a code that does not exist in DDB', async () => {
    const r = await call({
      path: '/token', httpMethod: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'nonexistent', code_verifier: 'v', redirect_uri: 'https://x.example', client_secret: CLIENT_SECRET }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('invalid or expired code');
  });
});

// =============================================================================
// EventBridge — getToken throttle → skip
// =============================================================================

describe('EventBridge — getToken transient error handling', () => {
  it('skips user when getToken throws ThrottlingException', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/throttled-user';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'tok', refresh_token: 'rt',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);
    mockClient.secretsManager.__failGetMatching('users/throttled-user', { name: 'ThrottlingException', message: 'slow down' });

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(0);
  });
});

// =============================================================================
// /callback — i18n (Accept-Language based)
// =============================================================================

describe('/callback — i18n success page', () => {
  function mockFeishuWithUser(userId: string, opts: Parameters<typeof mockFeishu>[0] = {}) {
    mockFeishu({ ...opts, exchange: { code: 0, msg: 'ok', data: { access_token: 'feishu-tok', refresh_token: 'rt', expires_in: 7200, open_id: userId } } });
  }

  it('renders English when Accept-Language is en', async () => {
    mockFeishuWithUser('ou_en_user');
    const state = buildState({ u: 'ou_en_user' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Authorized');
    expect(r.body).toContain('has been authorized');
    expect(r.body).toContain('Permission granted');
    expect(r.body).not.toContain('awsquick://');
    expect(r.body).toContain('lang="en"');
  });

  it('renders Chinese when Accept-Language starts with zh', async () => {
    mockFeishuWithUser('ou_zh_user');
    const state = buildState({ u: 'ou_zh_user' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      headers: { 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('授权成功');
    expect(r.body).toContain('已完成飞书授权');
    expect(r.body).toContain('lang="zh"');
  });

  it('falls back to English when Accept-Language is unknown', async () => {
    mockFeishuWithUser('ou_ja_user');
    const state = buildState({ u: 'ou_ja_user' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      headers: { 'accept-language': 'ja-JP,ja;q=0.9' },
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Authorized');
    expect(r.body).toContain('lang="en"');
  });

  it('falls back to English when no Accept-Language header', async () => {
    mockFeishuWithUser('ou_no_lang');
    const state = buildState({ u: 'ou_no_lang' });
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Authorized');
    expect(r.body).toContain('lang="en"');
  });
});

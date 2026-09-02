import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, timingSafeEqual } from 'crypto';
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
const STATE_KEY = createHmac('sha256', RAW_SECRET).update('oauth-state-v1').digest();
// Same derivation mcp-middleware uses to verify a Bearer token, so a token minted
// by /activate can be checked here exactly as the middleware would check it.
const TOKEN_KEY = createHmac('sha256', RAW_SECRET).update('mcp-token-v1').digest();

function buildState(payloadObj: any): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const ts = Math.floor(Date.now() / 1000);
  const full = `${payloadB64}.${ts}`;
  const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
  return `${full}.${sig}`;
}

function mockFeishu(openId = 'ou_activate_user', name = 'Activate User') {
  vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app-token' }));
    if (url.includes('oidc/access_token')) {
      return new Response(JSON.stringify({
        code: 0, msg: 'ok',
        data: { access_token: 'feishu-tok', refresh_token: 'rt', expires_in: 7200, open_id: openId },
      }));
    }
    if (url.includes('user_info')) return new Response(JSON.stringify({ code: 0, data: { name } }));
    return new Response('{}');
  });
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

function register(redirectUris: string[]) {
  return call({
    path: '/register',
    httpMethod: 'POST',
    body: JSON.stringify({ redirect_uris: redirectUris, client_name: 'test' }),
  });
}

function authorize(redirectUri: string) {
  return call({
    path: '/authorize',
    httpMethod: 'GET',
    queryStringParameters: { redirect_uri: redirectUri, code_challenge: 'c', code_challenge_method: 'S256' },
  });
}

// Mirrors mcp-middleware's verifyToken: base64url(userId:expiresAt:hexHmac).
function verifyMcpToken(token: string): { userId: string; expiresAt: number } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
    const sig = decoded.slice(lastColon + 1);
    const expiresAt = parseInt(decoded.slice(secondLastColon + 1, lastColon));
    const userId = decoded.slice(0, secondLastColon);
    if (isNaN(expiresAt)) return null;
    const expected = createHmac('sha256', TOKEN_KEY).update(`${userId}:${expiresAt}`).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId, expiresAt };
  } catch { return null; }
}

// The exact four redirect_uris VS Code submits in a single DCR request. Two are
// loopback, two are its hosted redirect brokers. Rejecting ANY entry fails the
// whole registration, which is what previously locked VS Code out — and VS Code
// is the one client that solves cross-machine callback without port forwarding.
const VSCODE_REDIRECT_URIS = [
  'https://insiders.vscode.dev/redirect',
  'https://vscode.dev/redirect',
  'http://127.0.0.1/',
  'http://127.0.0.1:33418/',
];

describe('DCR redirect_uri allowlist — RFC 8252 §7.3 loopback + hosted brokers', () => {
  it('accepts the full VS Code registration set in one request', async () => {
    const r = await register(VSCODE_REDIRECT_URIS);
    expect(r.statusCode, `VS Code DCR must not be rejected: ${r.body}`).toBe(201);
    expect(JSON.parse(r.body).redirect_uris).toEqual(VSCODE_REDIRECT_URIS);
  });

  it.each([
    ['[::1] with an explicit port', 'http://[::1]:44556/callback'],
    ['[::1] without a port', 'http://[::1]/callback'],
    ['another 127.0.0.0/8 address', 'http://127.0.0.2:8976/callback'],
    ['127.0.0.1 with no port (portless registration)', 'http://127.0.0.1/callback'],
    ['localhost with an ephemeral port', 'http://localhost:59656/callback'],
  ])('accepts %s', async (_label, uri) => {
    const r = await register([uri]);
    expect(r.statusCode, `${uri} must be accepted: ${r.body}`).toBe(201);
  });

  // The widening is strictly limited to the loopback block and the two broker
  // hosts. Everything the allowlist rejected before must still be rejected.
  it.each([
    ['a non-allowlisted https host', 'https://evil.example.com/cb'],
    ['a broker-lookalike subdomain', 'https://vscode.dev.evil.example.com/redirect'],
    ['a broker host over plain http', 'http://vscode.dev/redirect'],
    ['a non-loopback host over http', 'http://192.168.1.10:8976/cb'],
    ['a 128.x address that only looks loopback-ish', 'http://128.0.0.1:8976/cb'],
    ['an out-of-range octet', 'http://127.0.0.999/cb'],
  ])('still rejects %s', async (_label, uri) => {
    const r = await register([uri]);
    expect(r.statusCode, `${uri} must stay rejected`).toBe(400);
    expect(JSON.parse(r.body).error).toBe('invalid_redirect_uri');
  });

  it('rejects the VS Code set if any single entry is bad (whole-request semantics)', async () => {
    const r = await register([...VSCODE_REDIRECT_URIS, 'https://evil.example.com/cb']);
    expect(r.statusCode).toBe(400);
  });
});

describe('/authorize redirect_uri validation — same allowlist', () => {
  it('accepts the VS Code broker as redirect_uri', async () => {
    const r = await authorize('https://vscode.dev/redirect');
    expect(r.statusCode, `broker redirect must be accepted: ${r.body}`).toBe(302);
    expect(r.headers?.Location).toContain('/open-apis/authen/v1/authorize');
  });

  it('accepts [::1] over http', async () => {
    const r = await authorize('http://[::1]:44556/callback');
    expect(r.statusCode, r.body).toBe(302);
  });

  it('still rejects a non-allowlisted host', async () => {
    const r = await authorize('https://evil.example.com/cb');
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('redirect_uri not allowed');
  });
});

describe('/activate — headless self-service authorization', () => {
  it('redirects to Feishu without a client redirect_uri or PKCE', async () => {
    const r = await call({ path: '/activate', httpMethod: 'GET', queryStringParameters: {} });
    expect(r.statusCode).toBe(302);
    const loc = r.headers?.Location as string;
    expect(loc).toContain('/open-apis/authen/v1/authorize');
    // Feishu must be told to come back to THIS service, not to any client.
    expect(loc).toContain(encodeURIComponent('https://test.cloudfront.net/callback'));
    // No client redirect_uri and no PKCE challenge are carried in the state.
    const state = new URL(loc).searchParams.get('state')!;
    const payload = JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString());
    expect(payload).toEqual({ a: 1 });
    expect(payload.r).toBeUndefined();
    expect(payload.c).toBeUndefined();
    expect(payload.u).toBeUndefined();
  });

  it('renders a usable MCP token that the middleware would accept', async () => {
    mockFeishu();
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state: buildState({ a: 1 }) },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers?.['Content-Type']).toContain('text/html');

    // Pull the token out of the page and verify it exactly as mcp-middleware does.
    const codeBlocks = [...r.body.matchAll(/<code>([^<]+)<\/code>/g)].map(m => m[1]);
    const token = codeBlocks.find(t => verifyMcpToken(t) !== null);
    expect(token, `no verifiable MCP token in page. blocks: ${JSON.stringify(codeBlocks)}`).toBeDefined();
    const claims = verifyMcpToken(token!)!;
    expect(claims.userId).toBe('ou_activate_user');
    // 30-day TTL (MCP_TOKEN_TTL), allowing clock slack around the assertion.
    const ttl = claims.expiresAt - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(86400 * 29);
    expect(ttl).toBeLessThanOrEqual(86400 * 30);
  });

  it('never puts the token in a redirect, URL or cacheable response', async () => {
    mockFeishu();
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state: buildState({ a: 1 }) },
    });
    // A 302 would put the token in a Location header → browser history + Referer.
    expect(r.statusCode).not.toBe(302);
    expect(r.headers?.Location).toBeUndefined();
    expect(r.headers?.['Cache-Control']).toBe('no-store');
    expect(r.headers?.['Referrer-Policy']).toBe('no-referrer');
    // The token must not appear anywhere in the headers.
    const token = [...r.body.matchAll(/<code>([^<]+)<\/code>/g)]
      .map(m => m[1]).find(t => verifyMcpToken(t) !== null)!;
    expect(JSON.stringify(r.headers || {})).not.toContain(token);
    // Nor may the page leak the single-use Feishu authorization code.
    expect(r.body).not.toContain('feishu-code');
  });

  it('stores the Feishu token so revocation still governs access', async () => {
    mockFeishu('ou_revocable_user');
    await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state: buildState({ a: 1 }) },
    });
    // mcp-middleware re-reads this secret on every request; deleting it is what
    // makes every token for the user stop working, so it must exist.
    const stored = mockClient.secretsManager.__get('lark-mcp-on-agentcore/users/ou_revocable_user');
    expect(stored).toBeDefined();
  });

  it('warns the user in the page that the token is a secret shown once', async () => {
    mockFeishu();
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      queryStringParameters: { code: 'feishu-code', state: buildState({ a: 1 }) },
    });
    expect(r.body).toContain('shown only once');
    expect(r.body).toContain('Never paste it into chat');
    expect(r.body).toContain('revoke');
  });

  it('renders the token page in Chinese when the browser asks for zh', async () => {
    mockFeishu();
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
      queryStringParameters: { code: 'feishu-code', state: buildState({ a: 1 }) },
    });
    expect(r.body).toContain('访问令牌');
    expect(r.body).toContain('仅显示一次');
  });

  // The plain (non-activate) callback must be untouched: no token in that page.
  it('does not leak a token into the ordinary incremental-auth success page', async () => {
    mockFeishu('ou_plain_user');
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state: buildState({ u: 'ou_plain_user' }) },
    });
    expect(r.statusCode).toBe(200);
    const codeBlocks = [...r.body.matchAll(/<code>([^<]+)<\/code>/g)].map(m => m[1]);
    expect(codeBlocks.filter(t => verifyMcpToken(t) !== null)).toEqual([]);
  });

  it('rejects an unsigned activate state (forged {a:1})', async () => {
    mockFeishu();
    const forged = `${Buffer.from(JSON.stringify({ a: 1 })).toString('base64url')}.${Math.floor(Date.now() / 1000)}.deadbeef`;
    const r = await call({
      path: '/callback',
      httpMethod: 'GET',
      queryStringParameters: { code: 'feishu-code', state: forged },
    });
    expect(r.statusCode).toBe(403);
    expect(r.body).toContain('invalid_state');
  });
});

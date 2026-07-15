import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from '../__tests__/mock-client';

// Required env vars for module import
process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.CODE_TABLE = 'test-table';
process.env.STATE_SECRET_PARAM = '/lark-mcp-on-agentcore/state-secret';

// Mock SDK clients before importing the handler under test
vi.mock('@aws-sdk/client-secrets-manager', () => mockClient.secretsManager);
vi.mock('@aws-sdk/client-ssm', () => mockClient.ssm);
vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

describe('refresh path — preflight protection', () => {
  beforeEach(() => {
    mockClient.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips refresh when SM PutSecretValue is denied (preflight fails)', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u1';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,  // expiring soon
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);
    mockClient.secretsManager.__failOn('PutSecretValueCommand', { name: 'AccessDeniedException', message: 'denied' });

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.skipped).toBe(1);
    expect(body.refreshed).toBe(0);
    expect(body.failed).toBe(0);
    // Critical: Feishu must NOT have been called — refresh_token stays alive.
    const calls = fetchSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(u => u.includes('refresh_access_token'))).toBe(false);
  });

  it('logs CRITICAL store_token_lost when storeToken fails after preflight passed', { timeout: 60000 }, async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u2';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);

    // Preflight (1st PUT) passes; all subsequent PUT calls (storeToken + retries) fail.
    mockClient.secretsManager.__failOnPutFrom(2, { name: 'InternalServiceError', message: 'sm broken' });

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))  // getAppAccessToken
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, msg: 'ok',
        data: { access_token: 'new', refresh_token: 'rt-new', expires_in: 7200 },
      })));  // refreshToken

    // The shared log() helper writes to console.log (not console.error).
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((s: string) => { lines.push(s); });

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.failed).toBe(1);
    expect(body.refreshed).toBe(0);

    const critical = lines.find(e => e.includes('"event":"store_token_lost"'));
    expect(critical).toBeDefined();
    expect(critical).toContain('"refresh_token_consumed":true');
    // userId must appear hashed only — the field is named userIdHash.
    expect(critical).toContain('"userIdHash"');
    expect(critical).not.toContain('"userId":"u2"');
    expect(critical).not.toMatch(/"userIdHash":"u2"/);
    logSpy.mockRestore();
  });

  it('skips users whose token is not yet near expiry (adaptive TTL window)', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u3';
    const now = Math.floor(Date.now() / 1000);
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'tok', refresh_token: 'rt',
      expires_at: now + 6000,   // remaining 6000s
      issued_at: now - 1200,    // total 7200s — remaining (6000) > totalTtl/2 (3600)
    }));
    mockClient.secretsManager.__listNames([userSecretId]);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.refreshed).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.failed).toBe(0);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(1);  // app token only (or zero)
  });

  it('successfully refreshes a user token (happy path)', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u_happy';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, msg: 'ok',
        data: { access_token: 'new-tok', refresh_token: 'rt-new', expires_in: 7200 },
      })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.refreshed).toBe(1);
    expect(body.failed).toBe(0);
    const stored = JSON.parse(mockClient.secretsManager.__get(userSecretId));
    expect(stored.access_token).toBe('new-tok');
  });

  it('records failed when Feishu returns non-zero code', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u_bad_resp';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 99991, msg: 'invalid_grant' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.failed).toBe(1);
    expect(body.errors[0].phase).toBe('feishu_resp');
  });

  it('records failed (not a crash) when Feishu returns a non-JSON refresh response', async () => {
    // Same defensive-parse fix as /callback: a non-JSON body (edge WAF block page)
    // must not throw out of refreshUser. It maps to code -1 → counted as failed,
    // NOT skipped (it's an anomaly worth alerting, unlike a 20016 revocation).
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u_nonjson';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response('<html><body>blocked</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.failed).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.errors[0].phase).toBe('feishu_resp');
  });

  it('treats revoked token as deauthorized (skipped, not failed) and schedules secret deletion', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u_revoked';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 20016, msg: 'token has been revoked' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.refreshed).toBe(0);
    // Scheduled deletion (7-day recovery window): secret is pending-deletion, not gone.
    expect(mockClient.secretsManager.__isPendingDeletion(userSecretId)).toBe(true);
  });

  it('counts secret-delete failure as failed (triggers RefreshFailedAlarm)', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u_revoked_nodelete';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);
    // Simulate missing DeleteSecret IAM permission.
    mockClient.secretsManager.__failOn('DeleteSecretCommand', { name: 'AccessDeniedException', message: 'not authorized to perform: secretsmanager:DeleteSecret' });

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 20016, msg: 'token has been revoked' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.failed).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.errors[0].phase).toBe('secret_delete');
  });

  it('skips user when getToken returns null (secret deleted concurrently)', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    // listNames returns a name, but the secret is NOT in the store (deleted between list and get)
    mockClient.secretsManager.__listNames(['lark-mcp-on-agentcore/users/u_gone']);

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.refreshed).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it('records failed when Feishu refresh HTTP call throws (network error)', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const userSecretId = 'lark-mcp-on-agentcore/users/u4';
    mockClient.secretsManager.__set(userSecretId, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-old',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([userSecretId]);

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ app_access_token: 'app' })))  // getAppAccessToken
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));  // refreshToken throws

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(body.failed).toBe(1);
    expect(body.refreshed).toBe(0);
    expect(body.errors[0].phase).toBe('feishu_call');
  });
});

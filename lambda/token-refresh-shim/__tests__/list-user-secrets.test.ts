import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from '../__tests__/mock-client';

// Required env vars for module import
process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.CODE_TABLE = 'test-table';
process.env.STATE_SECRET_PARAM = '/lark-mcp-on-agentcore/state-secret';

vi.mock('@aws-sdk/client-secrets-manager', () => mockClient.secretsManager);
vi.mock('@aws-sdk/client-ssm', () => mockClient.ssm);
vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

// SECRET_PREFIX defaults to the byte-identical default-app prefix when unset
// (mirrors the Lambda env default). These tests exercise the DEFAULT app, which
// is the dangerous superset: its `users` prefix-matches every slugged app's
// `users/<slug>/<openid>` secrets, so the [^/]+ screen must exclude them.
const PREFIX = 'lark-mcp-on-agentcore/users';

describe('listAllUserSecrets — Killer Fix #3 single-segment screen', () => {
  beforeEach(() => mockClient.reset());
  afterEach(() => vi.restoreAllMocks());

  it('keeps default ou_* user secrets (the data-destructive regression guard)', async () => {
    // userId is a Feishu open_id ou_* — a hex-only screen would WRONGLY drop these.
    mockClient.secretsManager.__listNames([
      `${PREFIX}/ou_abc123`,
      `${PREFIX}/ou_def456`,
    ]);
    const { listAllUserSecrets } = await import('../index');
    const names = await listAllUserSecrets();
    expect(names).toContain(`${PREFIX}/ou_abc123`);
    expect(names).toContain(`${PREFIX}/ou_def456`);
    expect(names).toHaveLength(2);
  });

  it('keeps the rare hex fallback userId too', async () => {
    const hex = 'a'.repeat(32);
    mockClient.secretsManager.__listNames([`${PREFIX}/${hex}`]);
    const { listAllUserSecrets } = await import('../index');
    const names = await listAllUserSecrets();
    expect(names).toEqual([`${PREFIX}/${hex}`]);
  });

  it('EXCLUDES another app\'s nested users/<slug>/<openid> secrets (cross-app deletion guard)', async () => {
    // The prefix-match would return all of these; the [^/]+ screen must drop the nested ones.
    mockClient.secretsManager.__listNames([
      `${PREFIX}/ou_default_user`,        // default app — keep
      `${PREFIX}/team-a/ou_tenant_user`,  // slug app under default's prefix — DROP
      `${PREFIX}/team-a/ou_another`,      // DROP
    ]);
    const { listAllUserSecrets } = await import('../index');
    const names = await listAllUserSecrets();
    expect(names).toEqual([`${PREFIX}/ou_default_user`]);
    expect(names).not.toContain(`${PREFIX}/team-a/ou_tenant_user`);
  });

  it('a slugged app only sees its own users/<slug>/<openid> secrets', async () => {
    // Simulate the slug deployment by pointing SECRET_PREFIX at the per-slug prefix.
    vi.resetModules();
    process.env.SECRET_PREFIX = 'lark-mcp-on-agentcore/users/team-a';
    mockClient.reset();
    mockClient.secretsManager.__listNames([
      'lark-mcp-on-agentcore/users/ou_default',          // default app — DROP (different prefix)
      'lark-mcp-on-agentcore/users/team-a/ou_tenant',    // this slug — keep
      'lark-mcp-on-agentcore/users/team-ab/ou_other',    // sibling slug — DROP (prefix+'/' guards it)
    ]);
    const { listAllUserSecrets } = await import('../index');
    const names = await listAllUserSecrets();
    expect(names).toEqual(['lark-mcp-on-agentcore/users/team-a/ou_tenant']);
    delete process.env.SECRET_PREFIX;
    vi.resetModules();
  });

  it('a sibling app whose prefix is a string-prefix of another (users vs users-x) does not bleed', async () => {
    // Default 'lark-mcp-on-agentcore/users' must NOT match 'lark-mcp-on-agentcore/users-archive/...'.
    mockClient.secretsManager.__listNames([
      `${PREFIX}/ou_real`,
      'lark-mcp-on-agentcore/users-archive/ou_other',
    ]);
    const { listAllUserSecrets } = await import('../index');
    const names = await listAllUserSecrets();
    expect(names).toEqual([`${PREFIX}/ou_real`]);
  });

  // End-to-end: the strongest data-safety regression — the DEFAULT 30-min refresh
  // loop must NOT delete a *different* app's nested user secret, even when that
  // token would refresh-fail with a terminal Feishu code (20016) that triggers
  // auto-delete. Without the [^/]+ screen, the loop would treat
  // `users/team-a/ou_x` as a default user named `team-a/ou_x`, refresh it with the
  // default app_access_token, get 20016, and DELETE it — destroying tenant A's auth.
  it('default refresh loop never touches/deletes another app\'s nested secret', async () => {
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
    const tenantSecret = `${PREFIX}/team-a/ou_tenant`;
    // A nested (other-app) secret that is "expiring soon" so it WOULD be refreshed if not screened out.
    mockClient.secretsManager.__set(tenantSecret, JSON.stringify({
      access_token: 'old', refresh_token: 'rt-tenant',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      issued_at: Math.floor(Date.now() / 1000) - 7140,
    }));
    mockClient.secretsManager.__listNames([tenantSecret]);

    // app_access_token fetch + any refresh would return terminal 20016 (revoked) -> auto-delete path.
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('app_access_token')) return new Response(JSON.stringify({ code: 0, app_access_token: 'at', expire: 7200 }));
      return new Response(JSON.stringify({ code: 20016, msg: 'revoked' }));
    });

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    // The nested secret is screened out of the work list entirely.
    expect(body.total).toBe(0);
    expect(body.refreshed).toBe(0);
    expect(body.failed).toBe(0);
    // And it is NOT scheduled for deletion.
    expect(mockClient.secretsManager.__isPendingDeletion(tenantSecret)).toBe(false);
    // Feishu refresh was never called for the tenant token (only the app_access_token fetch, if any).
    const refreshCalls = fetchSpy.mock.calls.map(c => String(c[0])).filter(u => !u.includes('app_access_token'));
    expect(refreshCalls).toHaveLength(0);
  });
});

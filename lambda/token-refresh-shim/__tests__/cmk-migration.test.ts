import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from '../__tests__/mock-client';

// CMK key ARN the refresh loop migrates every user secret onto. Must be set
// BEFORE importing the handler (read at module load via process.env).
const CMK = 'arn:aws:kms:us-west-2:123456789012:key/abcd-cmk';
process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.CODE_TABLE = 'test-table';
process.env.STATE_SECRET_PARAM = '/lark-mcp-on-agentcore/state-secret';
process.env.USER_SECRET_KMS_KEY_ARN = CMK;

vi.mock('@aws-sdk/client-secrets-manager', () => mockClient.secretsManager);
vi.mock('@aws-sdk/client-ssm', () => mockClient.ssm);
vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

const PREFIX = 'lark-mcp-on-agentcore/users';
const now = () => Math.floor(Date.now() / 1000);

// Seed a user secret that is NOT near expiry (so the TTL early-return would skip
// the refresh) — this proves the key-swap check runs BEFORE that early-return.
function seedFreshUser(id: string, kmsKeyId?: string) {
  const secretId = `${PREFIX}/${id}`;
  mockClient.secretsManager.__set(secretId, JSON.stringify({
    access_token: 'tok', refresh_token: 'rt',
    expires_at: now() + 6000,   // remaining 6000s
    issued_at: now() - 1200,    // total 7200 — remaining > totalTtl/2 → refresh skipped
  }));
  if (kmsKeyId !== undefined) mockClient.secretsManager.__setKey(secretId, kmsKeyId);
  return secretId;
}

describe('CMK migration — refresh loop key-swap (zero-downtime)', () => {
  beforeEach(() => {
    mockClient.reset();
    mockClient.secretsManager.__set('lark-mcp-on-agentcore/feishu-app', JSON.stringify({ appId: 'a', appSecret: 's' }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('swaps an old-key (aws/secretsmanager) secret onto the CMK even when not near expiry', async () => {
    const id = seedFreshUser('ou_oldkey'); // no KmsKeyId = AWS-managed default
    mockClient.secretsManager.__listNames([id]);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    await handler({ source: 'aws.events' } as any);

    // Key migrated in-place; the token value is untouched.
    expect(mockClient.secretsManager.__getKey(id)).toBe(CMK);
    const stored = JSON.parse(mockClient.secretsManager.__get(id));
    expect(stored.access_token).toBe('tok');
    expect(stored.refresh_token).toBe('rt');
  });

  it('leaves a secret already on the CMK untouched (no UpdateSecret)', async () => {
    const id = seedFreshUser('ou_alreadycmk', CMK);
    mockClient.secretsManager.__listNames([id]);
    const updateSpy = vi.fn();
    mockClient.secretsManager.__failUpdateMatching('ou_alreadycmk', { name: '_SHOULD_NOT_CALL_', message: 'update was called' });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    // If UpdateSecret were called it would reject and surface; assert it does NOT throw the marker.
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);
    expect(body.keySwapFailed ?? 0).toBe(0);
    expect(mockClient.secretsManager.__getKey(id)).toBe(CMK);
    void updateSpy;
  });

  it('UpdateSecret failure does NOT delete the token — counts key_swap_failed and retries next cycle', async () => {
    const id = seedFreshUser('ou_swapfail'); // old key
    mockClient.secretsManager.__listNames([id]);
    // Transient control-plane error on the key swap.
    mockClient.secretsManager.__failUpdateMatching('ou_swapfail', { name: 'ThrottlingException', message: 'rate exceeded' });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    // The token is NEVER deleted on a key-swap failure (this is the blocker-fix).
    expect(mockClient.secretsManager.__get(id)).toBeTruthy();
    expect(mockClient.secretsManager.__isPendingDeletion(id)).toBe(false);
    // Still on the old key — will retry next cycle.
    expect(mockClient.secretsManager.__getKey(id)).toBeUndefined();
    expect(body.keySwapFailed).toBe(1);
    expect(body.stragglers).toBe(1);  // failed swap = still off CMK
    // Key-swap failures must NOT pollute the refresh failed/skipped alarm semantics.
    expect(body.failed).toBe(0);
  });

  it('silent no-op (UpdateSecret OK but key unchanged = missing kms:Encrypt) is caught as a straggler', async () => {
    // The most insidious failure: UpdateSecret returns success but does not
    // re-encrypt. Trusting the API return would mask it forever; the re-Describe
    // confirms the key did NOT move and counts it as a stuck straggler.
    const id = seedFreshUser('ou_silent'); // old key
    mockClient.secretsManager.__listNames([id]);
    mockClient.secretsManager.__silentNoopUpdateMatching('ou_silent');
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    // Still on the old key — UpdateSecret "succeeded" but did nothing.
    expect(mockClient.secretsManager.__getKey(id)).toBeUndefined();
    expect(body.keySwapped).toBe(0);          // NOT reported as a successful swap
    expect(body.keySwapFailed).toBe(1);       // surfaced as a failure
    expect(body.stragglers).toBe(1);          // and as a straggler (the canary trips)
    expect(body.failed).toBe(0);              // not a refresh failure
    // The token is never deleted.
    expect(mockClient.secretsManager.__get(id)).toBeTruthy();
  });

  it('does not scan a sibling/nested app secret (reuses the [^/]+ screen)', async () => {
    const mine = seedFreshUser('ou_mine');
    const nested = `${PREFIX}/team-a/ou_tenant`;
    mockClient.secretsManager.__set(nested, JSON.stringify({
      access_token: 't', refresh_token: 'r', expires_at: now() + 6000, issued_at: now() - 1200,
    }));
    // both on old key
    mockClient.secretsManager.__listNames([mine, nested]);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    // Only my own secret is migrated; the nested (other-app) secret is never touched.
    expect(mockClient.secretsManager.__getKey(mine)).toBe(CMK);
    expect(mockClient.secretsManager.__getKey(nested)).toBeUndefined();
    expect(body.total).toBe(1);
  });

  it('empty user list is safe (no swaps, no failures)', async () => {
    mockClient.secretsManager.__listNames([]);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);
    expect(body.total).toBe(0);
    expect(body.keySwapped ?? 0).toBe(0);
    expect(body.keySwapFailed ?? 0).toBe(0);
  });

  it('mixed population in one cycle: old-key migrated, CMK skipped, both reported', async () => {
    const old1 = seedFreshUser('ou_old1');
    const cmk1 = seedFreshUser('ou_cmk1', CMK);
    mockClient.secretsManager.__listNames([old1, cmk1]);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(mockClient.secretsManager.__getKey(old1)).toBe(CMK);
    expect(mockClient.secretsManager.__getKey(cmk1)).toBe(CMK);
    expect(body.keySwapped).toBe(1);
    expect(body.keySwapFailed).toBe(0);
    // A healthy cycle that successfully migrates secrets must NOT report stragglers
    // (else the convergence alarm false-pages on working migration).
    expect(body.stragglers).toBe(0);
  });

  it('stragglers counts only secrets STILL off the CMK — confirmed swaps do not count', async () => {
    // Three old-key secrets: one swaps & confirms, one throws (failed), one silently
    // no-ops (missing Encrypt). Only the latter two are stragglers; the confirmed
    // swap is not — so the canary converges to 0 on a fully-healthy migration.
    const ok = seedFreshUser('ou_will_swap');
    const thrown = seedFreshUser('ou_throws');
    const silent = seedFreshUser('ou_noop');
    mockClient.secretsManager.__failUpdateMatching('ou_throws', { name: 'ThrottlingException', message: 'rate exceeded' });
    mockClient.secretsManager.__silentNoopUpdateMatching('ou_noop');
    mockClient.secretsManager.__listNames([ok, thrown, silent]);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ app_access_token: 'app' })));

    const { handler } = await import('../index');
    const result = await handler({ source: 'aws.events' } as any);
    const body = JSON.parse(result.body!);

    expect(mockClient.secretsManager.__getKey(ok)).toBe(CMK);
    expect(body.keySwapped).toBe(1);     // ou_will_swap — confirmed
    expect(body.keySwapFailed).toBe(2);  // ou_throws + ou_noop
    // Only the two genuinely-stuck secrets are stragglers; the confirmed swap is not.
    expect(body.stragglers).toBe(2);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from './mock-client';

process.env.OPENID_TABLE = 'lark-mcp-on-agentcore-openid-map';

vi.mock('@aws-sdk/lib-dynamodb', () => mockClient.dynamodb);
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn(() => ({})) }));

beforeEach(() => { mockClient.reset(); });

describe('storeOpenIdMapping', () => {
  it('writes openId → userId to DynamoDB', async () => {
    const { storeOpenIdMapping } = await import('../dynamodb-openid');
    await storeOpenIdMapping('ou_abc', 'user-123');
    expect(mockClient.dynamodb.__getOpenId('ou_abc')).toBe('user-123');
  });

  it('overwrites existing mapping (idempotent)', async () => {
    mockClient.dynamodb.__setOpenId('ou_abc', 'old-id');
    const { storeOpenIdMapping } = await import('../dynamodb-openid');
    await storeOpenIdMapping('ou_abc', 'new-id');
    expect(mockClient.dynamodb.__getOpenId('ou_abc')).toBe('new-id');
  });

  it('throws on DDB PutCommand error (prevents silent identity fork)', async () => {
    mockClient.dynamodb.__failOpenidPut({ name: 'ProvisionedThroughputExceededException', message: 'throughput exceeded' });
    const { storeOpenIdMapping } = await import('../dynamodb-openid');
    await expect(storeOpenIdMapping('ou_x', 'u1')).rejects.toThrow('throughput exceeded');
  });

  it('handles empty string userId gracefully', async () => {
    const { storeOpenIdMapping } = await import('../dynamodb-openid');
    await storeOpenIdMapping('ou_empty', '');
    expect(mockClient.dynamodb.__getOpenId('ou_empty')).toBe('');
  });
});

describe('getOpenIdMapping', () => {
  it('returns userId when mapping exists', async () => {
    mockClient.dynamodb.__setOpenId('ou_found', 'stable-id');
    const { getOpenIdMapping } = await import('../dynamodb-openid');
    const result = await getOpenIdMapping('ou_found');
    expect(result).toBe('stable-id');
  });

  it('returns null when mapping does not exist', async () => {
    const { getOpenIdMapping } = await import('../dynamodb-openid');
    const result = await getOpenIdMapping('ou_nonexistent');
    expect(result).toBeNull();
  });

  it('throws on DDB ThrottlingException (prevents identity fork)', async () => {
    mockClient.dynamodb.__failOpenidGet({ name: 'ThrottlingException', message: 'rate exceeded' });
    const { getOpenIdMapping } = await import('../dynamodb-openid');
    await expect(getOpenIdMapping('ou_throttled')).rejects.toThrow('rate exceeded');
  });

  it('throws on DDB AccessDeniedException (prevents identity fork)', async () => {
    mockClient.dynamodb.__failOpenidGet({ name: 'AccessDeniedException', message: 'access denied' });
    const { getOpenIdMapping } = await import('../dynamodb-openid');
    await expect(getOpenIdMapping('ou_denied')).rejects.toThrow('access denied');
  });

  it('throws on DDB InternalServerError (prevents identity fork)', async () => {
    mockClient.dynamodb.__failOpenidGet({ name: 'InternalServerError', message: 'service unavailable' });
    const { getOpenIdMapping } = await import('../dynamodb-openid');
    await expect(getOpenIdMapping('ou_err')).rejects.toThrow('service unavailable');
  });

  it('returns null (not throws) when Item is undefined in response', async () => {
    // This is the "not found" path — DDB GetItem returns {} with no Item field
    const { getOpenIdMapping } = await import('../dynamodb-openid');
    const result = await getOpenIdMapping('ou_never_stored');
    expect(result).toBeNull();
  });
});

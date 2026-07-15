import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.CODE_TABLE = 'test-codes';

// Lightweight in-memory DDB mock that respects the same constraints as the
// real table (conditional put on attribute_not_exists, ALL_OLD on delete).
const store = new Map<string, any>();
const sendMock = vi.fn(async (cmd: any) => {
  const cmdName = cmd.constructor.name;
  if (cmdName === 'PutCommand') {
    const it = cmd.input.Item;
    if (cmd.input.ConditionExpression === 'attribute_not_exists(code)' && store.has(it.code)) {
      const err: any = new Error('conditional check failed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    store.set(it.code, it);
    return {};
  }
  if (cmdName === 'DeleteCommand') {
    const row = store.get(cmd.input.Key.code);
    store.delete(cmd.input.Key.code);
    return cmd.input.ReturnValues === 'ALL_OLD' && row ? { Attributes: row } : {};
  }
  return {};
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send: sendMock }) },
  PutCommand: class { constructor(public input: any) {} },
  DeleteCommand: class { constructor(public input: any) {} },
}));

beforeEach(() => {
  store.clear();
  sendMock.mockClear();
});

describe('dynamodb-codes — atomic single-use', () => {
  it('storeCode persists the auth code with TTL = expiresAt + 60', async () => {
    const { storeCode } = await import('../dynamodb-codes');
    const expiresAt = 1000000;
    await storeCode('c1', {
      userId: 'u1', codeChallenge: 'ch', redirectUri: 'https://x', expiresAt,
    });
    const stored = store.get('c1');
    expect(stored.userId).toBe('u1');
    expect(stored.ttl).toBe(expiresAt + 60);
  });

  it('storing the same code twice fails (ConditionalCheckFailedException)', async () => {
    const { storeCode } = await import('../dynamodb-codes');
    const data = { userId: 'u1', codeChallenge: 'ch', redirectUri: 'https://x', expiresAt: 1000000 };
    await storeCode('dup', data);
    await expect(storeCode('dup', data)).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    });
  });

  it('retrieveAndDeleteCode is single-use: second call returns null', async () => {
    const { storeCode, retrieveAndDeleteCode } = await import('../dynamodb-codes');
    await storeCode('c2', {
      userId: 'u2', codeChallenge: 'ch', redirectUri: 'https://x', expiresAt: 1000000,
    });
    const first = await retrieveAndDeleteCode('c2');
    expect(first?.userId).toBe('u2');
    const second = await retrieveAndDeleteCode('c2');
    expect(second).toBeNull();
  });

  it('retrieveAndDeleteCode returns null for unknown code (no error)', async () => {
    const { retrieveAndDeleteCode } = await import('../dynamodb-codes');
    expect(await retrieveAndDeleteCode('never-existed')).toBeNull();
  });
});

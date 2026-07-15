/**
 * Lightweight mocks for the AWS SDK clients the token-refresh-shim uses.
 * Captures Send calls and lets each test seed/fail specific operations.
 */

interface SecretStore { [id: string]: string }
let store: SecretStore = {};
// Per-secret KMS key id, mirroring the real Secrets Manager `KmsKeyId` attribute.
// Set at CreateSecret time and changeable only via UpdateSecret (NOT PutSecretValue,
// which keeps the existing key — the exact property the CMK migration relies on).
// Absent (undefined) models the AWS-managed `aws/secretsmanager` default key.
let keyStore: { [id: string]: string } = {};
// Secrets scheduled for deletion (RecoveryWindowInDays) — still present but
// pending-deletion: PutSecretValue/CreateSecret fail until RestoreSecret clears the flag.
let pendingDeletion: Set<string> = new Set();
let listNames: string[] = [];
let failOpName: string | null = null;
let failOpError: { name: string; message: string } | null = null;
let putCount = 0;
let failOnPutFrom = -1;
// Failure trigger that depends on the SecretId (e.g. fail GET on a specific secret only)
let failGetMatch: { idMatch: string; err: { name: string; message: string } } | null = null;
let failCreateMatch: { nameMatch: string; err: { name: string; message: string } } | null = null;
// Failure trigger for PUT that matches SecretId
let failPutMatch: { idMatch: string; err: { name: string; message: string } } | null = null;
// Failure trigger for UpdateSecret (the CMK key-swap) that matches SecretId.
let failUpdateMatch: { idMatch: string; err: { name: string; message: string } } | null = null;
// Models the silent missing-kms:Encrypt case: UpdateSecret returns success but does
// NOT re-encrypt (key unchanged). Matched by SecretId substring.
let silentNoopUpdateMatch: string | null = null;

// DDB code store (for /token grant exchange)
interface CodeRow { code: string; userId: string; codeChallenge: string; redirectUri: string; expiresAt: number }
let codeStore: Map<string, CodeRow> = new Map();

// DDB openid-map store
let openidStore: Map<string, string> = new Map();

// SSM store
let ssmStore: { [name: string]: string } = { '/lark-mcp-on-agentcore/state-secret': 'test-state-secret-value' };

// Openid DDB failure triggers
let failOpenidGet: { name: string; message: string } | null = null;
let failOpenidPut: { name: string; message: string } | null = null;

const reset = () => {
  store = {};
  keyStore = {};
  failUpdateMatch = null;
  silentNoopUpdateMatch = null;
  pendingDeletion = new Set();
  listNames = [];
  failOpName = null;
  failOpError = null;
  putCount = 0;
  failOnPutFrom = -1;
  failGetMatch = null;
  failCreateMatch = null;
  failPutMatch = null;
  codeStore = new Map();
  openidStore = new Map();
  failOpenidGet = null;
  failOpenidPut = null;
  ssmStore = { '/lark-mcp-on-agentcore/state-secret': 'test-state-secret-value' };
};

class GetSecretValueCommand { constructor(public input: any) {} }
class PutSecretValueCommand { constructor(public input: any) {} }
class CreateSecretCommand { constructor(public input: any) {} }
class ListSecretsCommand { constructor(public input: any) {} }
class DeleteSecretCommand { constructor(public input: any) {} }
class RestoreSecretCommand { constructor(public input: any) {} }
class DescribeSecretCommand { constructor(public input: any) {} }
class UpdateSecretCommand { constructor(public input: any) {} }

class SecretsManagerClient {
  send(cmd: any): Promise<any> {
    const cmdName = cmd.constructor.name;

    if (failOpName === cmdName && failOpError) {
      const err: any = new Error(failOpError.message);
      err.name = failOpError.name;
      return Promise.reject(err);
    }

    if (cmd instanceof PutSecretValueCommand) {
      putCount++;
      if (failPutMatch && cmd.input.SecretId.includes(failPutMatch.idMatch)) {
        const err: any = new Error(failPutMatch.err.message);
        err.name = failPutMatch.err.name;
        return Promise.reject(err);
      }
      if (failOnPutFrom > 0 && putCount >= failOnPutFrom && failOpError) {
        const err: any = new Error(failOpError.message);
        err.name = failOpError.name;
        return Promise.reject(err);
      }
      // A secret scheduled for deletion rejects writes until restored — mirrors real SM.
      if (pendingDeletion.has(cmd.input.SecretId)) {
        const err: any = new Error(`Secret ${cmd.input.SecretId} is scheduled for deletion`);
        err.name = 'InvalidRequestException';
        return Promise.reject(err);
      }
      store[cmd.input.SecretId] = cmd.input.SecretString;
      return Promise.resolve({ ARN: 'arn', VersionId: 'v' });
    }

    if (cmd instanceof CreateSecretCommand) {
      if (failCreateMatch && cmd.input.Name.includes(failCreateMatch.nameMatch)) {
        const err: any = new Error(failCreateMatch.err.message);
        err.name = failCreateMatch.err.name;
        return Promise.reject(err);
      }
      if (pendingDeletion.has(cmd.input.Name)) {
        const err: any = new Error(`Secret ${cmd.input.Name} is scheduled for deletion`);
        err.name = 'InvalidRequestException';
        return Promise.reject(err);
      }
      store[cmd.input.Name] = cmd.input.SecretString;
      // CreateSecret is the ONLY way the KMS key is fixed at creation time. A new
      // user secret with KmsKeyId lands directly on the CMK (no migration needed).
      if (cmd.input.KmsKeyId) keyStore[cmd.input.Name] = cmd.input.KmsKeyId;
      return Promise.resolve({ ARN: 'arn' });
    }

    if (cmd instanceof DescribeSecretCommand) {
      const id = cmd.input.SecretId;
      if (!(id in store)) {
        const err: any = new Error('not found');
        err.name = 'ResourceNotFoundException';
        return Promise.reject(err);
      }
      // KmsKeyId is undefined for secrets on the AWS-managed default key.
      return Promise.resolve({ Name: id, KmsKeyId: keyStore[id] });
    }

    if (cmd instanceof UpdateSecretCommand) {
      const id = cmd.input.SecretId;
      if (failUpdateMatch && id.includes(failUpdateMatch.idMatch)) {
        const err: any = new Error(failUpdateMatch.err.message);
        err.name = failUpdateMatch.err.name;
        return Promise.reject(err);
      }
      if (!(id in store)) {
        const err: any = new Error('not found');
        err.name = 'ResourceNotFoundException';
        return Promise.reject(err);
      }
      // Silent no-op: models a role missing kms:Encrypt — AWS returns success but
      // does NOT re-encrypt, so the key is left unchanged.
      const silentNoop = silentNoopUpdateMatch && id.includes(silentNoopUpdateMatch);
      // UpdateSecret re-encrypts the current version under the new key in-place —
      // the token value is untouched (the property the zero-downtime migration relies on).
      if (cmd.input.KmsKeyId && !silentNoop) keyStore[id] = cmd.input.KmsKeyId;
      if (cmd.input.SecretString !== undefined) store[id] = cmd.input.SecretString;
      return Promise.resolve({ ARN: 'arn' });
    }

    if (cmd instanceof GetSecretValueCommand) {
      if (failGetMatch && cmd.input.SecretId.includes(failGetMatch.idMatch)) {
        const err: any = new Error(failGetMatch.err.message);
        err.name = failGetMatch.err.name;
        return Promise.reject(err);
      }
      const v = store[cmd.input.SecretId];
      if (!v) {
        const err: any = new Error('not found');
        err.name = 'ResourceNotFoundException';
        return Promise.reject(err);
      }
      return Promise.resolve({ SecretString: v });
    }

    if (cmd instanceof ListSecretsCommand) {
      // Model the real Secrets Manager `name` filter: it is a PREFIX match, not
      // exact. Returning only exact matches would hide the cross-app bleed that
      // Killer Fix #3's [^/]+ screen exists to defend against.
      const filters = cmd.input?.Filters as Array<{ Key: string; Values: string[] }> | undefined;
      const nameFilter = filters?.find(f => f.Key === 'name');
      const prefixes = nameFilter?.Values ?? [];
      const matched = prefixes.length === 0
        ? listNames
        : listNames.filter(n => prefixes.some(p => n.startsWith(p)));
      return Promise.resolve({ SecretList: matched.map(n => ({ Name: n })) });
    }

    if (cmd instanceof DeleteSecretCommand) {
      if (cmd.input.ForceDeleteWithoutRecovery) {
        delete store[cmd.input.SecretId];
        pendingDeletion.delete(cmd.input.SecretId);
      } else {
        // Scheduled deletion (RecoveryWindowInDays): secret stays but is pending-deletion.
        pendingDeletion.add(cmd.input.SecretId);
      }
      return Promise.resolve({});
    }

    if (cmd instanceof RestoreSecretCommand) {
      pendingDeletion.delete(cmd.input.SecretId);
      return Promise.resolve({});
    }

    return Promise.reject(new Error(`Unmocked command: ${cmdName}`));
  }
}

class GetParameterCommand { constructor(public input: any) {} }

class SSMClient {
  send(cmd: any): Promise<any> {
    if (cmd instanceof GetParameterCommand) {
      const v = ssmStore[cmd.input.Name];
      if (!v) return Promise.reject(Object.assign(new Error('not found'), { name: 'ParameterNotFound' }));
      return Promise.resolve({ Parameter: { Value: v } });
    }
    return Promise.reject(new Error(`Unmocked SSM command`));
  }
}

// Test helpers attached to the module export so tests can drive the mock.
export const mockClient = {
  reset,
  ssm: {
    SSMClient,
    GetParameterCommand,
    __set: (name: string, value: string) => { ssmStore[name] = value; },
  },
  secretsManager: {
    SecretsManagerClient,
    GetSecretValueCommand,
    PutSecretValueCommand,
    CreateSecretCommand,
    ListSecretsCommand,
    DeleteSecretCommand,
    RestoreSecretCommand,
    DescribeSecretCommand,
    UpdateSecretCommand,
    __set: (id: string, value: string) => { store[id] = value; },
    __setKey: (id: string, keyId: string | undefined) => {
      if (keyId === undefined) delete keyStore[id]; else keyStore[id] = keyId;
    },
    __getKey: (id: string) => keyStore[id],
    __get: (id: string) => store[id],
    __isPendingDeletion: (id: string) => pendingDeletion.has(id),
    __schedulePendingDeletion: (id: string) => { pendingDeletion.add(id); },
    __listNames: (names: string[]) => { listNames = names; },
    __failOn: (op: string, err: { name: string; message: string }) => { failOpName = op; failOpError = err; },
    __failOnPutFrom: (n: number, err: { name: string; message: string }) => { failOnPutFrom = n; failOpError = err; },
    __failGetMatching: (idMatch: string, err: { name: string; message: string }) => { failGetMatch = { idMatch, err }; },
    __failCreateMatching: (nameMatch: string, err: { name: string; message: string }) => { failCreateMatch = { nameMatch, err }; },
    __failPutMatching: (idMatch: string, err: { name: string; message: string }) => { failPutMatch = { idMatch, err }; },
    __failUpdateMatching: (idMatch: string, err: { name: string; message: string }) => { failUpdateMatch = { idMatch, err }; },
    __silentNoopUpdateMatching: (idMatch: string) => { silentNoopUpdateMatch = idMatch; },
  },
  dynamodb: {
    DynamoDBDocumentClient: {
      from: () => ({
        send: (cmd: any) => {
          const cmdName = cmd.constructor.name;
          const table = cmd.input?.TableName || '';
          if (cmdName === 'PutCommand') {
            if (table.includes('openid-map')) {
              if (failOpenidPut) {
                const err: any = new Error(failOpenidPut.message);
                err.name = failOpenidPut.name;
                return Promise.reject(err);
              }
              openidStore.set(cmd.input.Item.openId, cmd.input.Item.userId);
              return Promise.resolve({});
            }
            const it = cmd.input.Item;
            codeStore.set(it.code, { code: it.code, userId: it.userId, codeChallenge: it.codeChallenge, redirectUri: it.redirectUri, expiresAt: it.expiresAt });
            return Promise.resolve({});
          }
          if (cmdName === 'GetCommand') {
            if (table.includes('openid-map')) {
              if (failOpenidGet) {
                const err: any = new Error(failOpenidGet.message);
                err.name = failOpenidGet.name;
                return Promise.reject(err);
              }
              const userId = openidStore.get(cmd.input.Key.openId);
              return Promise.resolve(userId ? { Item: { openId: cmd.input.Key.openId, userId } } : {});
            }
            return Promise.resolve({});
          }
          if (cmdName === 'DeleteCommand') {
            const row = codeStore.get(cmd.input.Key.code);
            codeStore.delete(cmd.input.Key.code);
            return Promise.resolve(row ? { Attributes: row } : {});
          }
          return Promise.resolve({});
        },
      }),
    },
    PutCommand: class { constructor(public input: any) {} },
    GetCommand: class { constructor(public input: any) {} },
    DeleteCommand: class { constructor(public input: any) {} },
    __seedCode: (row: CodeRow) => { codeStore.set(row.code, row); },
    __hasCode: (code: string) => codeStore.has(code),
    __setOpenId: (openId: string, userId: string) => { openidStore.set(openId, userId); },
    __getOpenId: (openId: string) => openidStore.get(openId),
    __failOpenidGet: (err: { name: string; message: string }) => { failOpenidGet = err; },
    __failOpenidPut: (err: { name: string; message: string }) => { failOpenidPut = err; },
  },
};

/**
 * SigV4 signing-input contract for the AgentCore proxy.
 *
 * The other middleware tests stub SignatureV4.sign to just append a header, so
 * the ACTUAL signing inputs — AWS service name, region, target hostname, and
 * the /runtimes/<arn>/invocations path with its ARN encoding — are never
 * verified. Get any of those wrong and EVERY production request 403s from
 * AgentCore while the unit suite stays green. These tests capture the real
 * SignatureV4 constructor config and the HttpRequest options and pin them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

const RUNTIME_ARN = 'arn:aws:bedrock-agentcore:us-west-2:111:runtime/test-runtime';
process.env.STATE_SECRET_PARAM = '/test/state-secret';
process.env.RUNTIME_ARN = RUNTIME_ARN;
process.env.AUTHORIZE_BASE = 'https://test.cloudfront.net';
process.env.DEPLOY_REGION = 'us-west-2';
process.env.SECRET_PREFIX = 'lark-mcp-on-agentcore/users';

const STATE_SECRET = 'test-state-secret';
const TOKEN_KEY = createHmac('sha256', STATE_SECRET).update('mcp-token-v1').digest();

const ssmSend = vi.fn(async () => ({ Parameter: { Value: STATE_SECRET } }));
const smSend = vi.fn(async (cmd: any) => ({
  SecretString: JSON.stringify({ access_token: 'feishu-tok', expires_at: Math.floor(Date.now() / 1000) + 7200 }),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: smSend })),
  GetSecretValueCommand: class { constructor(public input: any) {} },
}));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn(() => ({ send: ssmSend })),
  GetParameterCommand: class { constructor(public input: any) {} },
}));

// Capture the SignatureV4 constructor config and what gets signed.
let signerConfig: any = null;
let signedRequest: any = null;
vi.mock('@smithy/signature-v4', () => ({
  SignatureV4: class {
    constructor(cfg: any) { signerConfig = cfg; }
    async sign(req: any) { signedRequest = req; return { ...req, headers: { ...req.headers, 'x-amz-signed': '1' } }; }
  },
}));
vi.mock('@aws-crypto/sha256-js', () => ({ Sha256: class {} }));

// Capture the HttpRequest options exactly as the handler constructs them.
let httpRequestOpts: any = null;
vi.mock('@smithy/protocol-http', () => ({
  HttpRequest: class {
    method: string; hostname: string; path: string; headers: Record<string, string>; body: any;
    constructor(o: any) { httpRequestOpts = o; Object.assign(this, o); }
  },
}));
vi.mock('@aws-sdk/credential-provider-node', () => ({ defaultProvider: () => async () => ({ accessKeyId: 'a', secretAccessKey: 'b' }) }));

let fetchCalls: any[] = [];
global.fetch = vi.fn(async (url: any, init: any) => {
  fetchCalls.push({ url, init });
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}) as any;

function signMcpToken(userId: string, expiresAt: number): string {
  const sig = createHmac('sha256', TOKEN_KEY).update(`${userId}:${expiresAt}`).digest('hex');
  return Buffer.from(`${userId}:${expiresAt}:${sig}`).toString('base64url');
}

async function callProxy() {
  vi.resetModules();
  const { handler } = await import('../index');
  const tok = signMcpToken('ou_user', Math.floor(Date.now() / 1000) + 3600);
  return handler({ headers: { authorization: `Bearer ${tok}` }, body: '{"jsonrpc":"2.0"}' } as any);
}

beforeEach(() => { signerConfig = null; signedRequest = null; httpRequestOpts = null; fetchCalls = []; });
afterEach(() => { vi.restoreAllMocks(); });

describe('SigV4 signing inputs for the AgentCore proxy', () => {
  it('signs with service "bedrock-agentcore" and the deploy region', async () => {
    await callProxy();
    expect(signerConfig).not.toBeNull();
    expect(signerConfig.service).toBe('bedrock-agentcore');
    expect(signerConfig.region).toBe('us-west-2');
  });

  it('targets the regional bedrock-agentcore host', async () => {
    await callProxy();
    expect(httpRequestOpts.hostname).toBe('bedrock-agentcore.us-west-2.amazonaws.com');
    expect(httpRequestOpts.headers.host).toBe('bedrock-agentcore.us-west-2.amazonaws.com');
  });

  it('builds the invocations path with a URL-encoded runtime ARN', async () => {
    await callProxy();
    expect(httpRequestOpts.path).toBe(`/runtimes/${encodeURIComponent(RUNTIME_ARN)}/invocations`);
    // The ARN's colons and slash MUST be percent-encoded, or AgentCore 404/403s.
    expect(httpRequestOpts.path).toContain('arn%3Aaws%3Abedrock-agentcore');
    expect(httpRequestOpts.path).toContain('runtime%2Ftest-runtime');
    expect(httpRequestOpts.method).toBe('POST');
  });

  it('fetches the signed request over HTTPS at the same host+path', async () => {
    await callProxy();
    expect(fetchCalls[0].url).toBe(`https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/${encodeURIComponent(RUNTIME_ARN)}/invocations`);
    // The object handed to the signer is the one whose host/path we asserted.
    expect(signedRequest.hostname).toBe('bedrock-agentcore.us-west-2.amazonaws.com');
  });
});

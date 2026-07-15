import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
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
const RAW_SECRET = 'test-state-secret-value';
const TOKEN_KEY = createHmac('sha256', RAW_SECRET).update('mcp-token-v1').digest();
const STATE_KEY = createHmac('sha256', RAW_SECRET).update('oauth-state-v1').digest();

// Helpers
function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
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

// =============================================================================
// Property: signState -> verifyState roundtrip
// =============================================================================

describe('Property: signState -> verifyState roundtrip', () => {
  it('any JSON payload signed as state verifies correctly via /callback', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary string payloads (avoid dots in the payload to not
        // confuse the state format). Use JSON objects to match real usage.
        fc.record({
          r: fc.webUrl(),
          s: fc.string({ minLength: 0, maxLength: 50 }),
        }),
        async (payloadObj) => {
          // Build a valid state the way signState() would
          const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
          const ts = Math.floor(Date.now() / 1000);
          const full = `${payloadB64}.${ts}`;
          const sig = createHmac('sha256', STATE_KEY).update(full).digest('hex');
          const state = `${full}.${sig}`;

          // The callback should NOT return 403 (state verification passes)
          // It will return 400 because `code` is fake, but that's after state verification succeeds.
          // We mock Feishu to avoid network calls.
          vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
            const url = typeof input === 'string' ? input : input.url;
            if (url.includes('app_access_token')) return new Response(JSON.stringify({ app_access_token: 'app' }));
            if (url.includes('oidc/access_token')) return new Response(JSON.stringify({ code: 99, msg: 'bad', data: undefined }));
            return new Response('{}');
          });

          const result = await call({
            path: '/callback',
            httpMethod: 'GET',
            queryStringParameters: { code: 'fake', state },
          });

          // Key assertion: state verified (not 403). We get 400 because exchange fails.
          expect(result.statusCode).not.toBe(403);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// Property: generateMcpToken always produces base64url with exactly 2 colons
// =============================================================================

describe('Property: MCP token format invariant', () => {
  it('issued token is base64url-decodable with exactly 2 colons', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary userId strings (alphanumeric + underscore, like Feishu open_ids)
        fc.stringMatching(/^ou_[a-z0-9]{4,20}$/),
        async (userId) => {
          const { verifier, challenge } = pkce();
          mockClient.dynamodb.__seedCode({
            code: `code-${userId}`,
            userId,
            codeChallenge: challenge,
            redirectUri: 'https://quicksight.aws.amazon.com/cb',
            expiresAt: Date.now() / 1000 + 60,
          });

          const result = await call({
            path: '/token',
            httpMethod: 'POST',
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code: `code-${userId}`,
              code_verifier: verifier,
              redirect_uri: 'https://quicksight.aws.amazon.com/cb',
              client_secret: CLIENT_SECRET,
            }).toString(),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body!);
          const token = body.access_token;

          // Invariant 1: token is valid base64url
          const decoded = Buffer.from(token, 'base64url').toString();
          expect(decoded).toBeTruthy();

          // Invariant 2: decoded form has exactly 2 colons (userId:expiresAt:sig)
          const colons = decoded.split(':').length - 1;
          expect(colons).toBe(2);

          // Invariant 3: the middle part (expiresAt) is a number > now
          const lastColon = decoded.lastIndexOf(':');
          const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
          const expiresAt = parseInt(decoded.slice(secondLastColon + 1, lastColon));
          expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// Property: extra_scope validation rejects non-allowlist strings
// =============================================================================

describe('Property: extra_scope validation rejects invalid scopes', () => {
  it('any string NOT matching the scope regex is rejected with 400', async () => {
    // The valid scope regex is /^[a-z][a-z0-9_:.-]*$/ AND must be in SCOPE_ALLOWLIST.
    // We generate strings that either have invalid chars or are not in the allowlist.
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Strings with uppercase or special characters (fail regex)
          fc.stringMatching(/^[A-Z][A-Za-z0-9 !@#$%]{2,20}$/),
          // Strings with spaces (fail regex)
          fc.constant('has space:in:it'),
          // Strings that match regex pattern but are NOT in allowlist
          fc.stringMatching(/^[a-z]{2,8}:[a-z]{2,8}:[a-z]{2,8}$/).filter(
            s => s !== 'im:chat:read' && s !== 'im:message' // ensure not accidentally valid
          ),
          // Empty-ish strings that would fail
          fc.constant(''),
        ),
        async (badScope) => {
          // Skip empty string as extra_scope="" is just ignored (no error)
          if (!badScope) return;

          const { challenge } = pkce();
          const result = await call({
            path: '/authorize',
            httpMethod: 'GET',
            queryStringParameters: {
              redirect_uri: 'https://quicksight.aws.amazon.com/cb',
              code_challenge: challenge,
              code_challenge_method: 'S256',
              extra_scope: badScope,
            },
          });

          // Must be rejected (400) — never silently accepted into the OAuth redirect
          expect(result.statusCode).toBe(400);
          expect(result.body).toContain('extra_scope contains unknown or malformed scope');
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// Property: parseBody URL-encoding roundtrip
// =============================================================================

describe('Property: parseBody URL-encoding roundtrip', () => {
  it('URL-encoded key=value pairs are recovered by /token handler parsing', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a grant_type that's not authorization_code to get a simple 400 response
        // while still exercising parseBody
        fc.record({
          grant_type: fc.constant('client_credentials'),
          client_secret: fc.constant(CLIENT_SECRET),
          // Add an arbitrary extra param to exercise URL encoding
          custom_param: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('&') && !s.includes('=')),
        }),
        async (params) => {
          const encoded = new URLSearchParams(params as any).toString();

          const result = await call({
            path: '/token',
            httpMethod: 'POST',
            body: encoded,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          });

          // parseBody ran successfully — we got unsupported_grant_type (not a parse crash)
          expect(result.statusCode).toBe(400);
          expect(result.body).toContain('unsupported_grant_type');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('base64-encoded bodies decode correctly (isBase64Encoded path)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          grant_type: fc.constant('client_credentials'),
          client_secret: fc.constant(CLIENT_SECRET),
          extra: fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('&') && !s.includes('=')),
        }),
        async (params) => {
          const raw = new URLSearchParams(params as any).toString();
          const encoded = Buffer.from(raw).toString('base64');

          const result = await call({
            path: '/token',
            httpMethod: 'POST',
            body: encoded,
            isBase64Encoded: true,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          });

          // parseBody handled base64 decode — got expected business logic error
          expect(result.statusCode).toBe(400);
          expect(result.body).toContain('unsupported_grant_type');
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * MCP Protocol Contract/Compliance Tests
 *
 * Verifies that docker/server.js responses conform to the MCP spec (2024-11-05)
 * over Streamable HTTP (SSE transport).
 *
 * Strategy: start the real HTTP server on port 8000, mock fs.readFileSync
 * for catalog files and mock SecretsManagerClient to avoid AWS dependencies.
 * Also mock child_process.execFile to avoid calling lark-cli.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// --- Fixtures ---

const FAKE_TOOL_DEF_WRITE = {
  service: 'im',
  command: '+messages-send',
  description: 'Send a message to a chat',
  risk: 'write',
  flags: [
    { name: 'chat-id', type: 'string', description: 'Target chat ID', required: true },
    { name: 'text', type: 'string', description: 'Message text', required: true },
  ],
};

const FAKE_TOOL_DEF_DESTRUCTIVE = {
  service: 'base',
  command: '+delete-table',
  description: 'Delete a table from a base',
  risk: 'high-risk-write',
  supportsYes: true,
  flags: [
    { name: 'app-token', type: 'string', description: 'App token', required: true },
    { name: 'table-id', type: 'string', description: 'Table ID', required: true },
  ],
};

const FAKE_TOOL_DEF_READ = {
  service: 'calendar',
  command: '+agenda',
  description: 'Show upcoming calendar events',
  risk: 'read',
  flags: [
    { name: 'days', type: 'number', description: 'Number of days to show', required: false },
  ],
};

// Extra tool NOT in tier1 so it can be discovered
const FAKE_TOOL_DEF_DISCOVERABLE = {
  service: 'wiki',
  command: '+create-space',
  description: 'Create a new wiki space',
  risk: 'write',
  flags: [
    { name: 'name', type: 'string', description: 'Space name', required: true },
  ],
};

// Discoverable tool WITH an embedded composite-flag schema (build-time
// --print-schema extraction). The schema is large, so discover only returns it
// for an exact-name query — never in broad search results.
const FAKE_TOOL_DEF_WITH_SCHEMA = {
  service: 'sheets',
  command: '+cells-set',
  description: 'Write cells',
  risk: 'write',
  flags: [
    { name: 'cells', type: 'string', description: 'JSON 2D array of cell objects', required: true },
  ],
  payloadSchemas: {
    cells: { type: 'array', items: { type: 'array', items: { type: 'object' } }, description: '2D rows×cols' },
  },
};

// 25 filler tools to reproduce the real catalog's scoring dilution: every tool
// name starts with `lark_`, so an exact-name query's single token matches ALL
// of them via the "lark" prefix and the true exact match cannot be assumed to
// survive fuzzy top-20 ranking — discover must place it explicitly.
const FAKE_FILLER_TOOLS = Array.from({ length: 25 }, (_, i) => ({
  service: 'sheets',
  command: `+filler-${i}`,
  description: `Filler tool ${i} for ranking dilution`,
  risk: 'read',
  flags: [],
}));

const FAKE_CATALOG = {
  _larkCliVersion: '1.0.0-test',
  _scopeMapVersion: '1.0.0-test',
  // Fillers FIRST: with tied fuzzy scores (every name matches the "lark"
  // prefix), stable sort preserves catalog order, so a late-positioned target
  // falls outside top-20 — the real catalog's failure mode (409 tools).
  tools: [FAKE_TOOL_DEF_WRITE, FAKE_TOOL_DEF_DESTRUCTIVE, FAKE_TOOL_DEF_READ, FAKE_TOOL_DEF_DISCOVERABLE, ...FAKE_FILLER_TOOLS, FAKE_TOOL_DEF_WITH_SCHEMA],
};

// Only first 3 tools in tier1; the wiki tool is discoverable
const FAKE_TIER1 = ['lark_im_messages_send', 'lark_base_delete_table', 'lark_calendar_agenda'];

// --- Mocking Strategy ---
// server.js is CJS and uses require(). We intercept at multiple levels:
// 1. fs.readFileSync - intercepted via vi.spyOn before import
// 2. @aws-sdk/client-secrets-manager - intercepted via monkey-patching require
// 3. child_process - intercepted via monkey-patching require

// Create a fake /app/skills directory for skill tool tests
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
let skillsAvailable = false;
try {
  mkdirSync('/app/skills/lark-calendar/references', { recursive: true });
  mkdirSync('/app/skills/lark-calendar/assets/templates', { recursive: true });
  writeFileSync('/app/skills/lark-calendar/SKILL.md', '---\nname: lark-calendar\ndescription: "Calendar orchestration guide"\n---\n\n# calendar (v4)\n\nTest skill content for calendar domain.');
  writeFileSync('/app/skills/lark-calendar/references/lark-calendar-create.md', '# calendar +create\n\nTest reference content.');
  // Text asset (方案 B): served verbatim through lark_get_skill with extension + path.
  writeFileSync('/app/skills/lark-calendar/assets/templates/sample.html', '<html><body>SAMPLE_TEMPLATE_MARKER</body></html>');
  skillsAvailable = existsSync('/app/skills/lark-calendar/SKILL.md');
} catch (e) { /* /app may not be writable in some envs */ }

const originalReadFileSync = fs.readFileSync.bind(fs);
vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => {
  if (filePath === '/app/generated-tools.json') return JSON.stringify(FAKE_CATALOG);
  if (filePath === '/app/tier1.json') return JSON.stringify(FAKE_TIER1);
  return originalReadFileSync(filePath, encoding);
});

// Monkey-patch Module._load to intercept CJS require() for specific modules
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@aws-sdk/client-secrets-manager') {
    return {
      SecretsManagerClient: class MockSecretsManagerClient {
        send() {
          return Promise.resolve({
            SecretString: JSON.stringify({ appSecret: 'fake-secret-for-tests' }),
          });
        }
      },
      GetSecretValueCommand: class MockGetSecretValueCommand {
        constructor(params) { this.params = params; }
      },
    };
  }
  if (request === 'child_process') {
    return {
      execFile: (cmd, args, opts, cb) => {
        const child = {
          kill: () => {},
          pid: 99999,
        };
        setTimeout(() => cb(null, '{"ok":true,"data":{"message_id":"test123"}}', ''), 0);
        return child;
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

// --- Test Helpers ---

// Pin our own PORT before server.js loads (it reads process.env.PORT, default
// 8000). Explicit so that if another server-loading test file (e.g.
// server-runtime.test.js, which uses 18010) ever shares this worker, each file
// stays self-consistent and they never collide on one port.
const serverPort = 8000;
process.env.PORT = String(serverPort);

function sendMcpRequest(method, params = {}, id = 1, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const opts = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseSSE(body) {
  // Parse SSE format: "event: message\ndata: {...}\n\n"
  const lines = body.split('\n');
  let eventType = null;
  let data = null;
  for (const line of lines) {
    if (line.startsWith('event: ')) eventType = line.slice(7);
    if (line.startsWith('data: ')) data = line.slice(6);
  }
  return { eventType, data: data ? JSON.parse(data) : null };
}

// --- Server Lifecycle ---

beforeAll(async () => {
  // Dynamically import server.js (this starts it listening on port 8000)
  await import('../server.js');

  // Wait for the server to be ready and app secret to load
  await new Promise(resolve => setTimeout(resolve, 300));
});

afterAll(() => {
  Module._load = originalLoad;
  try { rmSync('/app/skills', { recursive: true, force: true }); } catch {}
});

// --- Tests ---

describe('MCP Protocol Contract Tests (spec 2024-11-05)', () => {
  describe('initialize response', () => {
    it('returns valid JSON-RPC 2.0 response with matching id', async () => {
      const { body } = await sendMcpRequest('initialize', {}, 42);
      const { eventType, data } = parseSSE(body);

      expect(eventType).toBe('message');
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(42);
    });

    it('contains result.protocolVersion as a string', async () => {
      const { body } = await sendMcpRequest('initialize', {}, 1);
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(typeof data.result.protocolVersion).toBe('string');
      expect(data.result.protocolVersion).toBe('2024-11-05');
    });

    it('contains result.capabilities as an object', async () => {
      const { body } = await sendMcpRequest('initialize', {}, 2);
      const { data } = parseSSE(body);

      expect(data.result.capabilities).toBeDefined();
      expect(typeof data.result.capabilities).toBe('object');
      expect(data.result.capabilities).not.toBeNull();
    });

    it('contains result.serverInfo.name as a string', async () => {
      const { body } = await sendMcpRequest('initialize', {}, 3);
      const { data } = parseSSE(body);

      expect(data.result.serverInfo).toBeDefined();
      expect(typeof data.result.serverInfo.name).toBe('string');
      expect(data.result.serverInfo.name.length).toBeGreaterThan(0);
    });

    it('contains result.serverInfo.version as a string', async () => {
      const { body } = await sendMcpRequest('initialize', {}, 4);
      const { data } = parseSSE(body);

      expect(typeof data.result.serverInfo.version).toBe('string');
      expect(data.result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('preserves request id of various types (number)', async () => {
      const { body } = await sendMcpRequest('initialize', {}, 99999);
      const { data } = parseSSE(body);
      expect(data.id).toBe(99999);
    });

    it('preserves request id of various types (string)', async () => {
      const payload = JSON.stringify({ jsonrpc: '2.0', id: 'req-abc-123', method: 'initialize', params: {} });
      const res = await new Promise((resolve, reject) => {
        const opts = {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        };
        const req = http.request(opts, (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ body }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
      const { data } = parseSSE(res.body);
      expect(data.id).toBe('req-abc-123');
    });
  });

  describe('tools/list response', () => {
    it('returns result.tools as an array', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 10);
      const { data } = parseSSE(body);

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(10);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.tools)).toBe(true);
      expect(data.result.tools.length).toBeGreaterThan(0);
    });

    it('each tool has name (string), description (string), inputSchema (object)', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 11);
      const { data } = parseSSE(body);

      for (const tool of data.result.tools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(0);
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });

    it('each tool inputSchema has type:"object" (valid JSON Schema)', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 12);
      const { data } = parseSSE(body);

      for (const tool of data.result.tools) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('tools with annotations have valid annotation structure (boolean hints)', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 13);
      const { data } = parseSSE(body);

      const toolsWithAnnotations = data.result.tools.filter(t => t.annotations);
      expect(toolsWithAnnotations.length).toBeGreaterThan(0);

      for (const tool of toolsWithAnnotations) {
        const ann = tool.annotations;
        expect(typeof ann).toBe('object');
        expect(ann).not.toBeNull();

        // MCP spec annotation fields are all boolean hints
        if ('readOnlyHint' in ann) expect(typeof ann.readOnlyHint).toBe('boolean');
        if ('destructiveHint' in ann) expect(typeof ann.destructiveHint).toBe('boolean');
        if ('idempotentHint' in ann) expect(typeof ann.idempotentHint).toBe('boolean');
        if ('openWorldHint' in ann) expect(typeof ann.openWorldHint).toBe('boolean');
      }
    });

    it('destructive tool has destructiveHint:true and readOnlyHint:false', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 14);
      const { data } = parseSSE(body);

      const destructiveTool = data.result.tools.find(t => t.name === 'lark_base_delete_table');
      expect(destructiveTool).toBeDefined();
      expect(destructiveTool.annotations.destructiveHint).toBe(true);
      expect(destructiveTool.annotations.readOnlyHint).toBe(false);
    });

    it('read-only tool has readOnlyHint:true and destructiveHint:false', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 15);
      const { data } = parseSSE(body);

      const readTool = data.result.tools.find(t => t.name === 'lark_calendar_agenda');
      expect(readTool).toBeDefined();
      expect(readTool.annotations.readOnlyHint).toBe(true);
      expect(readTool.annotations.destructiveHint).toBe(false);
    });

    it('includes lark_discover and lark_invoke meta-tools', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 16);
      const { data } = parseSSE(body);

      const names = data.result.tools.map(t => t.name);
      expect(names).toContain('lark_discover');
      expect(names).toContain('lark_invoke');
    });
  });

  describe('tools/call error format', () => {
    it('returns result.content as array of content blocks on success', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_im_messages_send',
        arguments: { chat_id: 'oc_123', text: 'hello' },
      }, 20, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(20);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content.length).toBeGreaterThan(0);
    });

    it('content blocks have type:"text" and text (string)', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_im_messages_send',
        arguments: { chat_id: 'oc_123', text: 'hello' },
      }, 21, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      for (const block of data.result.content) {
        expect(block.type).toBe('text');
        expect(typeof block.text).toBe('string');
      }
    });

    it('destructive without confirm returns a non-error approval prompt', async () => {
      // user_approval_required is normal control flow, NOT a tool failure:
      // isError:false so lenient clients render the prompt instead of swallowing
      // it as a generic "unknown error".
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_base_delete_table',
        arguments: { app_token: 'base123', table_id: 'tbl456' },
      }, 22, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      expect(data.result.isError).toBe(false);
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content[0].type).toBe('text');
      const payload = JSON.parse(data.result.content[0].text);
      expect(payload.status).toBe('user_approval_required');
      expect(payload.message).toContain('confirm');
    });

    it('returns isError:true with content blocks when no user token', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_im_messages_send',
        arguments: { chat_id: 'oc_123', text: 'hello' },
      }, 23);
      const { data } = parseSSE(body);

      expect(data.result.isError).toBe(true);
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content[0].type).toBe('text');
      expect(typeof data.result.content[0].text).toBe('string');
    });

    it('unknown tool in tools/call returns JSON-RPC error with code -32601', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'nonexistent_tool_xyz',
        arguments: {},
      }, 24, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(24);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
      expect(typeof data.error.message).toBe('string');
    });
  });

  describe('JSON-RPC compliance', () => {
    it('unknown method returns error code -32601 (Method not found)', async () => {
      const { body } = await sendMcpRequest('nonexistent/method', {}, 30);
      const { data } = parseSSE(body);

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(30);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
      expect(data.error.message).toContain('not found');
    });

    it('another unknown method also returns -32601', async () => {
      const { body } = await sendMcpRequest('resources/list', {}, 31);
      const { data } = parseSSE(body);

      expect(data.error.code).toBe(-32601);
    });

    // Helper: send a raw JSON-RPC payload verbatim (so we can omit `id` to form
    // a notification) and capture the raw response.
    const sendRaw = (obj) => new Promise((resolve, reject) => {
      const payload = JSON.stringify(obj);
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (r) => {
        let body = ''; r.on('data', c => { body += c; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body }));
      });
      req.on('error', reject);
      req.write(payload); req.end();
    });

    it('a notification (no id) gets NO JSON-RPC response body', async () => {
      // JSON-RPC 2.0 §4.1 / MCP: the server MUST NOT reply to a notification.
      // notifications/initialized is sent by every compliant client right after
      // initialize. The bug returned a -32601 error frame with a missing id.
      const { body } = await sendRaw({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      expect(body).toBe('');
    });

    it('notifications/cancelled (no id) also gets no response body', async () => {
      const { body } = await sendRaw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 5 } });
      expect(body).toBe('');
    });

    it('a request WITH id still gets an error frame for unknown methods', async () => {
      // Guard: the no-id short-circuit must not swallow real requests.
      const { body } = await sendRaw({ jsonrpc: '2.0', id: 77, method: 'totally/unknown', params: {} });
      expect(body).not.toBe('');
      const data = parseSSE(body).data;
      expect(data.id).toBe(77);
      expect(data.error.code).toBe(-32601);
    });

    it('response is always wrapped in SSE format', async () => {
      const { body, headers } = await sendMcpRequest('initialize', {}, 40);

      expect(headers['content-type']).toBe('text/event-stream');
      expect(body).toMatch(/^event: message\ndata: \{.*\}\n\n$/s);
    });

    it('SSE response for tools/list is properly formatted', async () => {
      const { body, headers } = await sendMcpRequest('tools/list', {}, 41);

      expect(headers['content-type']).toBe('text/event-stream');
      expect(body.startsWith('event: message\ndata: ')).toBe(true);
      expect(body.endsWith('\n\n')).toBe(true);
    });

    it('SSE response for error is properly formatted', async () => {
      const { body, headers } = await sendMcpRequest('unknown/xyz', {}, 42);

      expect(headers['content-type']).toBe('text/event-stream');
      expect(body.startsWith('event: message\ndata: ')).toBe(true);
      expect(body.endsWith('\n\n')).toBe(true);

      // Verify parseable JSON in data field
      const dataLine = body.split('\n').find(l => l.startsWith('data: '));
      const json = JSON.parse(dataLine.slice(6));
      expect(json.jsonrpc).toBe('2.0');
    });

    it('invalid JSON body returns HTTP 400', async () => {
      const res = await new Promise((resolve, reject) => {
        const payload = 'this is not json{{{';
        const opts = {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        };
        const req = http.request(opts, (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });

      expect(res.statusCode).toBe(400);
    });

    it('non-POST method returns HTTP 405', async () => {
      const res = await new Promise((resolve, reject) => {
        const opts = {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/',
          method: 'PUT',
        };
        const req = http.request(opts, (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ statusCode: r.statusCode }));
        });
        req.on('error', reject);
        req.end();
      });

      expect(res.statusCode).toBe(405);
    });

    it('GET request returns health check response', async () => {
      const res = await new Promise((resolve, reject) => {
        const opts = {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/ping',
          method: 'GET',
        };
        const req = http.request(opts, (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.status).toBe('Healthy');
    });
  });

  describe('tools/call with lark_discover', () => {
    it('returns content blocks with discoverable tools', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_discover',
        arguments: { query: 'wiki space' },
      }, 50, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content[0].type).toBe('text');
      // The text should be parseable JSON with a tools array
      const inner = JSON.parse(data.result.content[0].text);
      expect(Array.isArray(inner.tools)).toBe(true);
      expect(inner.tools.length).toBeGreaterThan(0);
    });

    it('lark_discover by category returns tools from that service', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_discover',
        arguments: { category: 'wiki' },
      }, 51, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      const inner = JSON.parse(data.result.content[0].text);
      expect(inner.tools.length).toBeGreaterThan(0);
      expect(inner.tools[0].category).toBe('wiki');
    });

    // Exact-name query = the agent's observed self-correction pattern (a call
    // failed; it re-queries THAT tool for the real contract). Return the
    // embedded --print-schema payload contracts then — and only then; the
    // schemas are large (up to ~70KB) so broad search results never carry them.
    it('lark_discover exact-name query returns payload_schemas', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_discover',
        arguments: { query: 'lark_sheets_cells_set' },
      }, 52, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      const inner = JSON.parse(data.result.content[0].text);
      const tool = inner.tools.find(t => t.name === 'lark_sheets_cells_set');
      expect(tool).toBeDefined();
      expect(tool.payload_schemas).toBeDefined();
      expect(tool.payload_schemas.cells.type).toBe('array');
    });

    it('lark_discover broad search does NOT include payload_schemas', async () => {
      // Keyword query (not the exact tool name): description tokens rank the
      // tool into results, but the large schemas stay out — only the
      // has_payload_schemas marker is advertised.
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_discover',
        arguments: { query: 'write cells', category: 'sheets' },
      }, 53, { 'x-user-access-token': 'fake-token' });
      const { data } = parseSSE(body);

      const inner = JSON.parse(data.result.content[0].text);
      const tool = inner.tools.find(t => t.name === 'lark_sheets_cells_set');
      expect(tool).toBeDefined();
      expect(tool.payload_schemas).toBeUndefined();
      // But the result advertises that schemas exist for this tool.
      expect(tool.has_payload_schemas).toBe(true);
    });
  });

  describe('meta tools are read-only', () => {
    it('lark_discover is annotated as read-only', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 60);
      const { data } = parseSSE(body);
      const tool = data.result.tools.find(t => t.name === 'lark_discover');
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    });

    it('lark_invoke is annotated as read/write (not read-only)', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 67);
      const { data } = parseSSE(body);
      const tool = data.result.tools.find(t => t.name === 'lark_invoke');
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations.readOnlyHint).toBe(false);
      expect(tool.annotations.destructiveHint).toBe(false);
    });

    it.skipIf(!skillsAvailable)('lark_list_skills is annotated as read-only', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 68);
      const { data } = parseSSE(body);
      const tool = data.result.tools.find(t => t.name === 'lark_list_skills');
      expect(tool).toBeDefined();
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    });

    it.skipIf(!skillsAvailable)('lark_get_skill is annotated as read-only', async () => {
      const { body } = await sendMcpRequest('tools/list', {}, 69);
      const { data } = parseSSE(body);
      const tool = data.result.tools.find(t => t.name === 'lark_get_skill');
      expect(tool).toBeDefined();
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    });

    it.skipIf(!skillsAvailable)('lark_list_skills returns skills list without auth', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_list_skills',
        arguments: {},
      }, 61);
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(data.result.isError).toBeUndefined();
      expect(Array.isArray(data.result.content)).toBe(true);
      const inner = JSON.parse(data.result.content[0].text);
      expect(Array.isArray(inner.skills)).toBe(true);
      expect(inner.skills.length).toBeGreaterThan(0);
      const cal = inner.skills.find(s => s.domain === 'calendar');
      expect(cal).toBeDefined();
      expect(cal).toHaveProperty('description');
      // The description must come from the frontmatter (extractSkillDescription), NOT the
      // bare directory name — this is the whole point of progressive disclosure level 1.
      expect(cal.description).toBe('Calendar orchestration guide');
      expect(cal.description).not.toBe('lark-calendar');
    });

    it.skipIf(!skillsAvailable)('lark_get_skill returns skill content for valid domain', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendar' },
      }, 62);
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(data.result.isError).toBeUndefined();
      const text = data.result.content[0].text;
      expect(text.length).toBeGreaterThan(100);
      expect(text).toContain('Available sections');
    });

    // The three correction responses are NOT isError: the payload contains the
    // fix (available lists the right names), and lenient clients hide
    // isError:true content behind a generic "unknown error" — same convention
    // as unknown_tool.
    it.skipIf(!skillsAvailable)('lark_get_skill returns error for invalid domain', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'nonexistent' },
      }, 63);
      const { data } = parseSSE(body);

      expect(data.result.isError).toBe(false);
      const inner = JSON.parse(data.result.content[0].text);
      expect(inner.error).toBe('unknown_domain');
      expect(Array.isArray(inner.available)).toBe(true);
    });

    it.skipIf(!skillsAvailable)('lark_get_skill resolves the plural service-name alias (docs→doc pattern)', async () => {
      // Tool namespace says lark_docs_* (service "docs") but the skill domain
      // is "doc" — the natural agent guess (domain+'s') must not dead-end.
      // Fixture only ships lark-calendar, so exercise the same plural alias on
      // it: "calendars" must resolve to the calendar domain.
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendars' },
      }, 71);
      const { data } = parseSSE(body);

      expect(data.result.isError).toBeUndefined();
      expect(data.result.content[0].text).toContain('calendar');
    });

    it.skipIf(!skillsAvailable)('lark_get_skill rejects path traversal in section', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendar', section: '../../etc/passwd' },
      }, 64);
      const { data } = parseSSE(body);

      expect(data.result.isError).toBe(false);
      const inner = JSON.parse(data.result.content[0].text);
      expect(inner.error).toBe('invalid_section');
    });

    it.skipIf(!skillsAvailable)('lark_get_skill returns section content when valid', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendar', section: 'create' },
      }, 65);
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(data.result.isError).toBeUndefined();
      expect(data.result.content[0].text.length).toBeGreaterThan(10);
    });

    it.skipIf(!skillsAvailable)('lark_get_skill serves a text asset addressed with extension + path (方案 B)', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendar', section: 'assets/templates/sample.html' },
      }, 67);
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(data.result.isError).toBeUndefined();
      // Served verbatim — the raw HTML, not transformed.
      expect(data.result.content[0].text).toContain('SAMPLE_TEMPLATE_MARKER');
    });

    it.skipIf(!skillsAvailable)('lark_get_skill lists text assets (with extension) among available sections', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendar' },
      }, 68);
      const { data } = parseSSE(body);

      expect(data.result.isError).toBeUndefined();
      const text = data.result.content[0].text;
      // Markdown listed without extension; the asset listed with its extension + path.
      expect(text).toContain('assets/templates/sample.html');
      expect(text).toContain('references/lark-calendar-create');
    });

    it.skipIf(!skillsAvailable)('lark_get_skill returns unknown_section listing assets for a missing section', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_get_skill',
        arguments: { domain: 'calendar', section: 'does-not-exist' },
      }, 70);
      const { data } = parseSSE(body);

      expect(data.result.isError).toBe(false);
      const inner = JSON.parse(data.result.content[0].text);
      expect(inner.error).toBe('unknown_section');
      expect(inner.available).toContain('assets/templates/sample.html');
    });

    it('lark_discover does not require auth token', async () => {
      const { body } = await sendMcpRequest('tools/call', {
        name: 'lark_discover',
        arguments: { query: 'wiki' },
      }, 66);
      const { data } = parseSSE(body);

      expect(data.result).toBeDefined();
      expect(data.result.isError).toBeUndefined();
      const inner = JSON.parse(data.result.content[0].text);
      expect(Array.isArray(inner.tools)).toBe(true);
    });
  });
});

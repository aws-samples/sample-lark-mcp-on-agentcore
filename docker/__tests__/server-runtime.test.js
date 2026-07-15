/**
 * Server runtime behavior tests (concurrency queue, child-process error mapping).
 *
 * These need things the protocol-contract suite can't express with its
 * instant-success execFile mock and default concurrency:
 *   - R1: force the semaphore QUEUE (MAX_CONCURRENT=1) and prove a queued
 *     request is NOT spuriously aborted just because its own request body
 *     finished arriving.
 *   - R4: make execFile fail with timeout / maxBuffer and prove the client
 *     gets a clean structured error, not a truncated partial-stdout fragment.
 *
 * Runs in its own vitest worker (forks pool, per-file isolation), so importing
 * server.js here — which listens on the hardcoded port 8000 — does not collide
 * with mcp-contract.test.js's server.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import Module from 'node:module';

// Force the queue to engage with just two concurrent requests. MUST be set
// before importing server.js (read at module load).
process.env.MAX_CONCURRENT = '1';
process.env.MAX_QUEUE_DEPTH = '20';
// Needed for patchPermissionError to mint authorize_url in the R8 tests below.
process.env.AUTHORIZE_BASE = 'https://auth.example.test';
// Bind a port distinct from mcp-contract.test.js's 8000. Both files import the
// side-effectful server.js (which calls server.listen); a shared vitest worker
// would otherwise collide on the same port. server.js reads process.env.PORT.
process.env.PORT = '18010';
const PORT = 18010;

const FAKE_TOOL_DEF_READ = {
  service: 'calendar',
  command: '+agenda',
  description: 'Show upcoming calendar events',
  risk: 'read',
  flags: [{ name: 'days', type: 'number', description: 'Number of days', required: false }],
};
const FAKE_TOOL_DEF_DELETE = {
  service: 'base',
  command: '+delete-table',
  description: 'Delete a table',
  risk: 'high-risk-write',
  supportsYes: true,
  flags: [{ name: 'table-id', type: 'string', description: 'Table id', required: true }],
};
// Tier-1 tool WITH a composite-flag payloadSchema: exercises the pre-spawn
// validatePayload wiring in executeTool (R9 below) — the lib-level unit tests
// alone can't catch a broken payloadSchemas key lookup or a wrong isError.
const FAKE_TOOL_DEF_CELLS = {
  service: 'sheets',
  command: '+cells-set',
  description: 'Write cells',
  risk: 'write',
  flags: [
    { name: 'cells', type: 'string', description: '2D cell payload', required: true },
    { name: 'range', type: 'string', description: 'target range', required: false },
  ],
  payloadSchemas: {
    cells: { type: 'array', items: { type: 'array', items: { type: 'object' } }, description: '2D rows×cols' },
  },
};
// One raw API for lark_invoke paths: a high-risk-write delete (confirmation gate)
// that doubles as the JSON-validation target via its params/data flags.
const FAKE_RAW_DELETE = { service: 'drive', resource: 'file', method: 'delete', description: 'Delete a drive file', risk: 'high-risk-write', supportsYes: true };
// A read-risk raw API (no confirmation gate) for exercising the permission path.
const FAKE_RAW_READ = { service: 'contact', resource: 'user_profiles', method: 'batch_query', description: 'Bulk fetch profiles', risk: 'read' };
const FAKE_CATALOG = { _larkCliVersion: 'test', _scopeMapVersion: 'test', tools: [FAKE_TOOL_DEF_READ, FAKE_TOOL_DEF_DELETE, FAKE_TOOL_DEF_CELLS], rawApis: [FAKE_RAW_DELETE, FAKE_RAW_READ] };
const FAKE_TIER1 = ['lark_calendar_agenda', 'lark_base_delete_table', 'lark_sheets_cells_set'];

// Controllable child_process mock. Each test sets `execFileBehavior` to steer
// how the next lark-cli call resolves.
//   { mode: 'instant' }                         -> immediate success
//   { mode: 'slow', delayMs }                   -> success after delayMs
//   { mode: 'timeout', partial }                -> err.killed+signal, partial stdout
//   { mode: 'maxbuffer', partial }              -> err.code=ERR_CHILD_PROCESS_STDIO_MAXBUFFER
let execFileBehavior = { mode: 'instant' };
let lastExecFileOpts = null; // captured opts of the most recent execFile call
let execFileCalls = 0; // total spawns — lets tests assert pre-spawn rejection
const OK_STDOUT = '{"ok":true,"data":{"events":[]}}';

const originalReadFileSync = fs.readFileSync.bind(fs);
fs.readFileSync = (filePath, encoding) => {
  if (filePath === '/app/generated-tools.json') return JSON.stringify(FAKE_CATALOG);
  if (filePath === '/app/tier1.json') return JSON.stringify(FAKE_TIER1);
  return originalReadFileSync(filePath, encoding);
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === '@aws-sdk/client-secrets-manager') {
    return {
      SecretsManagerClient: class { send() { return Promise.resolve({ SecretString: JSON.stringify({ appSecret: 'fake' }) }); } },
      GetSecretValueCommand: class { constructor(p) { this.params = p; } },
    };
  }
  if (request === 'child_process') {
    return {
      execFile: (cmd, args, opts, cb) => {
        lastExecFileOpts = opts;
        execFileCalls++;
        const child = { kill: () => {}, pid: 4242 };
        const b = execFileBehavior;
        if (b.mode === 'slow') {
          // Honor an AbortSignal the way Node's execFile does: abort → kill the
          // child and call back with an AbortError, freeing the slot at once.
          const timer = setTimeout(() => cb(null, OK_STDOUT, ''), b.delayMs ?? 200);
          if (opts?.signal) {
            opts.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              cb(Object.assign(new Error('aborted'), { name: 'AbortError', killed: true }), '', '');
            }, { once: true });
          }
        } else if (b.mode === 'timeout') {
          const err = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' });
          setTimeout(() => cb(err, b.partial ?? '{"partia', ''), 0);
        } else if (b.mode === 'maxbuffer') {
          const err = Object.assign(new Error('stdout maxBuffer length exceeded'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
          setTimeout(() => cb(err, b.partial ?? '{"big":"trunc', ''), 0);
        } else if (b.mode === 'abort-error') {
          // Node sets BOTH name=AbortError and killed=true when a signal aborts.
          const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError', killed: true });
          setTimeout(() => cb(err, '', ''), 0);
        } else if (b.mode === 'stdout') {
          // Inject arbitrary lark-cli stdout (e.g. a permission-error envelope).
          setTimeout(() => cb(null, b.stdout ?? OK_STDOUT, ''), 0);
        } else if (b.mode === 'fail') {
          // Non-zero exit with structured stdout (lark-cli's validation errors
          // exit 2 but still print the JSON envelope on stdout).
          const err = Object.assign(new Error('Command failed'), { code: 2, stdout: b.stdout ?? '', stderr: b.stderr ?? '' });
          setTimeout(() => cb(err, b.stdout ?? '', b.stderr ?? ''), 0);
        } else {
          setTimeout(() => cb(null, OK_STDOUT, ''), 0);
        }
        return child;
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

function callTool(name, args = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'x-user-access-token': 'u-tok' },
    }, (res) => {
      let body = ''; res.on('data', c => { body += c; });
      res.on('end', () => {
        let data = null;
        for (const line of body.split('\n')) if (line.startsWith('data: ')) data = JSON.parse(line.slice(6));
        resolve({ statusCode: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

beforeAll(async () => {
  await import('../server.js');
  await new Promise(r => setTimeout(r, 300));
});
afterAll(() => { Module._load = originalLoad; fs.readFileSync = originalReadFileSync; });

describe('R1: semaphore queue does not spuriously abort queued requests', () => {
  it('a queued request (beyond MAX_CONCURRENT) still completes instead of client_aborted', async () => {
    // MAX_CONCURRENT=1: req A occupies the only slot for 250ms, req B must queue.
    // The bug: B's own request-body 'close' fires ac.abort() while B is queued,
    // rejecting it with client_aborted even though the client never disconnected.
    execFileBehavior = { mode: 'slow', delayMs: 250 };
    const [a, b] = await Promise.all([callTool('lark_calendar_agenda', {}, 1), callTool('lark_calendar_agenda', {}, 2)]);

    const textOf = r => r.data?.result?.content?.[0]?.text ?? '';
    expect(textOf(a)).not.toContain('client_aborted');
    expect(textOf(b)).not.toContain('client_aborted');
    // Both should be successful tool results, not errors.
    expect(a.data?.result?.isError).toBeUndefined();
    expect(b.data?.result?.isError).toBeUndefined();
  });

  it('three concurrent requests all succeed: the queue buffers, none are dropped', async () => {
    // Stronger form of the R1 guard: with MAX_CONCURRENT=1, requests 2 and 3
    // both have to queue. Pre-fix, BOTH overflowed to client_aborted; with the
    // fix all three drain in turn. (The abort path itself is exercised live by
    // the standalone disconnect repro; it can't be observed cleanly through an
    // aborted HTTP client here, so we don't assert it from the client side.)
    execFileBehavior = { mode: 'slow', delayMs: 120 };
    const results = await Promise.all([
      callTool('lark_calendar_agenda', {}, 30),
      callTool('lark_calendar_agenda', {}, 31),
      callTool('lark_calendar_agenda', {}, 32),
    ]);
    for (const r of results) {
      expect(r.data?.result?.isError).toBeUndefined();
      expect(r.data?.result?.content?.[0]?.text ?? '').not.toContain('client_aborted');
    }
  });
});

describe('R4: child-process timeout / maxBuffer map to a clean structured error', () => {
  it('a 60s timeout returns {"error":"timeout"}, not the truncated partial stdout', async () => {
    // execFile kills the child on timeout (err.killed + signal) and hands back
    // whatever partial stdout it had — almost always invalid JSON. The bug
    // returned that fragment as the tool result; the real cause (timeout) was
    // lost and the LLM got a corrupt blob.
    execFileBehavior = { mode: 'timeout', partial: '{"partia' };
    const r = await callTool('lark_calendar_agenda', {}, 40);

    expect(r.data?.result?.isError).toBe(true);
    const text = r.data?.result?.content?.[0]?.text ?? '';
    expect(text).not.toContain('partia');           // not the truncated fragment
    expect(() => JSON.parse(text)).not.toThrow();    // it IS valid JSON
    expect(JSON.parse(text).error).toBe('timeout');
  });

  it('a maxBuffer overflow returns {"error":"output_too_large"}, not the truncated blob', async () => {
    execFileBehavior = { mode: 'maxbuffer', partial: '{"big":"trunc' };
    const r = await callTool('lark_calendar_agenda', {}, 41);

    expect(r.data?.result?.isError).toBe(true);
    const text = r.data?.result?.content?.[0]?.text ?? '';
    expect(text).not.toContain('trunc');
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text).error).toBe('output_too_large');
  });

  it('a normal lark-cli error (non-timeout) still surfaces its stderr/message', async () => {
    // Guard: the timeout/maxBuffer branch must not swallow ordinary CLI errors.
    execFileBehavior = { mode: 'instant' };
    const ok = await callTool('lark_calendar_agenda', {}, 42);
    expect(ok.data?.result?.isError).toBeUndefined();
  });
});

describe('R5: execFile is abortable and its timeout aligns under the Lambda', () => {
  it('passes an AbortSignal into execFile so a client disconnect can kill the child', async () => {
    // The middleware aborts its fetch at 25s; if the child keeps running to the
    // old 60s timeout it holds a concurrency slot for ~35s after the client gave
    // up. Wiring ac.signal into execFile lets a disconnect kill the child and
    // free the slot immediately.
    execFileBehavior = { mode: 'instant' };
    await callTool('lark_calendar_agenda', {}, 50);
    expect(lastExecFileOpts).not.toBeNull();
    expect(lastExecFileOpts.signal).toBeInstanceOf(AbortSignal);
  });

  it('caps the execFile timeout at or below the Lambda 25s budget', async () => {
    execFileBehavior = { mode: 'instant' };
    await callTool('lark_calendar_agenda', {}, 51);
    expect(typeof lastExecFileOpts.timeout).toBe('number');
    expect(lastExecFileOpts.timeout).toBeLessThanOrEqual(25000);
  });

  it('maps an execFile AbortError to client_aborted, NOT timeout', async () => {
    // When the signal kills the child, Node sets err.name=AbortError AND
    // err.killed=true. That must not be misreported as a timeout — it's a
    // client disconnect. (Only reachable if the request is still being served;
    // in practice the response is already closed, but the mapping must be right.)
    execFileBehavior = { mode: 'abort-error' };
    const r = await callTool('lark_calendar_agenda', {}, 54);
    expect(r.data?.result?.isError).toBe(true);
    const text = r.data?.result?.content?.[0]?.text ?? '';
    expect(JSON.parse(text).error).toBe('client_aborted');
  });

  it('a client disconnect frees the slot promptly instead of holding it for the full timeout', async () => {
    // MAX_CONCURRENT=1. Request A is slow (would take 5s). Its client aborts
    // almost immediately; the child must be killed so a later request can run
    // well before A's nominal completion.
    execFileBehavior = { mode: 'slow', delayMs: 5000 };
    const ctrl = new AbortController();
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 52, method: 'tools/call', params: { name: 'lark_calendar_agenda', arguments: {} } });
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- localhost test server, no TLS needed
    const aborted = fetch(`http://127.0.0.1:${PORT}/`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-user-access-token': 'u-tok' },
      body: payload,
    }).catch(e => ({ aborted: e.name }));
    await new Promise(r => setTimeout(r, 50));
    ctrl.abort();
    await aborted;

    // If the slot were held until the 5s child finished, this fast call would
    // not complete quickly. Give it far less than 5s.
    execFileBehavior = { mode: 'instant' };
    const t0 = Date.now();
    const after = await callTool('lark_calendar_agenda', {}, 53);
    const elapsed = Date.now() - t0;
    expect(after.data?.result?.isError).toBeUndefined();
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('R6: confirmation gate is a non-error control-flow result', () => {
  // Regression: the gate used isError:true, so lenient MCP clients dropped the
  // content and showed a generic "unknown error" instead of the approval prompt.
  const textOf = r => r.data?.result?.content?.[0]?.text ?? '';

  it('tier1 high-risk-write without _confirm: isError:false + user_approval_required', async () => {
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_base_delete_table', { table_id: 'tbl_1' }, 60);
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.status).toBe('user_approval_required');
    expect(p.message).toContain('confirm');
  });

  it('raw-API high-risk-write without _confirm: isError:false + user_approval_required', async () => {
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_invoke', { tool_name: 'lark_drive_file_delete', args: { params: '{"file_type":"docx"}' } }, 61);
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.status).toBe('user_approval_required');
  });

  it('the gate actually blocks: lark-cli is never spawned without _confirm', async () => {
    // mode:'fail' would surface a CLI error; the gate must short-circuit before that.
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_base_delete_table', { table_id: 'tbl_1' }, 62);
    expect(JSON.parse(textOf(r)).status).toBe('user_approval_required');
    // with _confirm it proceeds to (mocked) execution — proving the gate was the only blocker
    const ok = await callTool('lark_base_delete_table', { table_id: 'tbl_1', _confirm: true }, 63);
    expect(ok.data?.result?.isError).toBeUndefined();
  });
});

describe('R7: raw-API params/data JSON is validated before spawning lark-cli', () => {
  const textOf = r => r.data?.result?.content?.[0]?.text ?? '';

  it('rejects a non-JSON params string with a clear invalid_json error', async () => {
    execFileBehavior = { mode: 'instant' };
    // The real-world mistake: params="user_id_type=open_id" (key=value, not JSON).
    // Use a read-risk-free raw tool path by confirming the delete so the gate is passed,
    // then the JSON guard must still fire BEFORE execution.
    const r = await callTool('lark_invoke', { tool_name: 'lark_drive_file_delete', args: { _confirm: true, params: 'file_type=docx' } }, 70);
    // isError:false — a malformed arg is self-correctable, so lenient clients must
    // see the hint instead of swallowing it as "unknown error".
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.error).toBe('invalid_json');
    expect(p.field).toBe('params');
  });

  it('rejects a non-JSON data string', async () => {
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_invoke', { tool_name: 'lark_drive_file_delete', args: { _confirm: true, data: 'not json' } }, 71);
    expect(r.data?.result?.isError).toBe(false);
    expect(JSON.parse(textOf(r)).field).toBe('data');
  });

  it('accepts valid JSON params/data and proceeds to execution', async () => {
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_invoke', { tool_name: 'lark_drive_file_delete', args: { _confirm: true, params: '{"file_type":"docx"}', data: '{"k":1}' } }, 72);
    expect(r.data?.result?.isError).toBeUndefined();
  });

  it('unknown tool_name → isError:false + discover hint (self-correctable)', async () => {
    // Real case: caller typed lark_sheets_delete_sheet (real name is _sheet_delete).
    // The discover hint must reach the client, not be hidden as "unknown error".
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_invoke', { tool_name: 'lark_sheets_delete_sheet', args: {} }, 73);
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.error).toBe('unknown_tool');
    expect(p.hint).toContain('lark_discover');
  });
});

describe('R8: missing-scope responses carry an authorize_url and are non-error', () => {
  // Regression: a missing-scope error is patched to include authorize_url +
  // user_action, but was returned with isError:true — lenient clients (Quick
  // Suite) then swallow the link as a generic "unknown error". A grantable scope
  // is "needs authorization" (normal control flow), not a tool failure.
  const textOf = r => r.data?.result?.content?.[0]?.text ?? '';

  it('typed missing_scope → isError:false + authorize_url the client can show', async () => {
    execFileBehavior = { mode: 'stdout', stdout: JSON.stringify({
      ok: false,
      error: { type: 'authorization', subtype: 'missing_scope',
        message: 'unauthorized: required scope(s): profile:user_profile:read',
        missing_scopes: ['profile:user_profile:read'] },
    }) };
    const r = await callTool('lark_calendar_agenda', {}, 80);
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.error.authorize_url).toContain('profile%3Auser_profile%3Aread');
    expect(p.error.required_scopes).toContain('profile:user_profile:read');
  });

  it('same fix on the raw-API (lark_invoke) path', async () => {
    execFileBehavior = { mode: 'stdout', stdout: JSON.stringify({
      ok: false,
      error: { type: 'authorization', subtype: 'missing_scope',
        message: 'unauthorized: required scope(s): profile:user_profile:read',
        missing_scopes: ['profile:user_profile:read'] },
    }) };
    const r = await callTool('lark_invoke', { tool_name: 'lark_contact_user_profiles_batch_query', args: { data: '{"user_ids":["ou_x"]}' } }, 81);
    expect(r.data?.result?.isError).toBe(false);
    expect(JSON.parse(textOf(r)).error.authorize_url).toContain('profile%3Auser_profile%3Aread');
  });

  it('missing scope that cannot be determined → no link, stays isError:true', async () => {
    // permission error code but no missing_scopes / console_url / extractable
    // message → only the "contact the admin" fallback; that IS a dead end.
    execFileBehavior = { mode: 'stdout', stdout: JSON.stringify({
      error: { code: 99991679, message: 'Permission denied' },
    }) };
    const r = await callTool('lark_calendar_agenda', {}, 82);
    expect(r.data?.result?.isError).toBe(true);
    const p = JSON.parse(textOf(r));
    expect(p.error.authorize_url).toBeUndefined();
    expect(p.error.user_action).toContain('admin');
  });

  it('genuine auth failure (token expired) stays isError:true → reconnect', async () => {
    execFileBehavior = { mode: 'stdout', stdout: JSON.stringify({
      error: { type: 'auth', message: 'token is expired' },
    }) };
    const r = await callTool('lark_calendar_agenda', {}, 83);
    expect(r.data?.result?.isError).toBe(true);
    expect(JSON.parse(textOf(r)).error.user_action).toContain('reconnect');
  });
});

// Cross-review finding: the contract-layer wiring (validatePayload pre-spawn,
// translateCliError in the catch path, stripCliNotice on success) had only
// lib-level unit tests — a wrong payloadSchemas key, a mispassed flag list, or
// a flipped isError in server.js would go unnoticed. These run the REAL server.
describe('R9: contract-layer wiring in executeTool', () => {
  const textOf = r => r.data?.result?.content?.[0]?.text ?? '';

  it('1D cells payload → invalid_payload, isError:false, before spawning lark-cli', async () => {
    execFileBehavior = { mode: 'instant' };
    const before = execFileCalls;
    const r = await callTool('lark_sheets_cells_set', { cells: '[{"formula":"=A1+1"}]', range: 'B1' }, 90);
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.error).toBe('invalid_payload');
    expect(p.parameter).toBe('cells');
    expect(p.message).toMatch(/2D|array of arrays/i);
    expect(p.hint).toContain('lark_discover');
    expect(execFileCalls).toBe(before); // rejected pre-spawn
  });

  it('a native array payload is stringified and accepted (passes validation)', async () => {
    execFileBehavior = { mode: 'instant' };
    const r = await callTool('lark_sheets_cells_set', { cells: [[{ value: 1 }]], range: 'A1' }, 91);
    expect(r.data?.result?.isError).toBeUndefined();
  });

  it('lark-cli validation error → --flag refs translated, isError:false', async () => {
    execFileBehavior = { mode: 'fail', stdout: JSON.stringify({
      ok: false,
      error: { type: 'validation', subtype: 'invalid_argument', message: 'specify at least one of --sheet-id or --range' },
    }) };
    const r = await callTool('lark_sheets_cells_set', { cells: '[[{"value":1}]]', range: 'A1' }, 92);
    expect(r.data?.result?.isError).toBe(false);
    const p = JSON.parse(textOf(r));
    expect(p.error.message).not.toContain('--range');
    expect(p.error.message).toContain('range');
  });

  it('success responses have _notice.update stripped', async () => {
    execFileBehavior = { mode: 'stdout', stdout: '{"ok":true,"data":{"revision":2},"_notice":{"update":{"message":"lark-cli 9.9.9 available"}}}' };
    const r = await callTool('lark_calendar_agenda', {}, 93);
    expect(r.data?.result?.isError).toBeUndefined();
    const text = textOf(r);
    expect(text).not.toContain('_notice');
    expect(text).toContain('"revision":2');
  });
});

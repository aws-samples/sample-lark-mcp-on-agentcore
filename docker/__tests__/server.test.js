import { describe, it, expect } from 'vitest';
// Import the REAL implementations from server-lib.js (extracted from server.js
// so they can be tested without server.js's module-level side effects —
// fs reads of /app/* and server.listen). Same single-source-of-truth pattern as
// generate-tools-lib.js / skill-sections.js: server.js requires this module, so
// the two can never drift. Previously this file re-implemented every function
// inline and tested the COPY, which could never catch a regression in server.js.
import {
  ServerBusyError,
  toToolName,
  toSchemaKey,
  buildInputSchema,
  toolAnnotations,
  buildToolScopeMap,
  buildCatalogIndex,
  searchCatalog,
  findByName,
  patchPermissionError,
  createSemaphore,
  createSingleFlight,
  coerceFlagValue,
  validatePayload,
  translateCliError,
  stripCliNotice,
  resolveSkillDomain,
} from '../server-lib.js';

const FAKE_CATALOG = {
  tools: [
    {
      service: 'im', command: 'messages-send', description: 'Send a message to a chat',
      risk: 'write', scopes: ['im:message:send'],
      flags: [
        { name: 'chat-id', type: 'string', description: 'Target chat ID', required: true },
        { name: 'text', type: 'string', description: 'Message body', required: true },
      ],
    },
    {
      service: 'im', command: 'chat-delete', description: 'Delete a group chat permanently',
      risk: 'high-risk-write', scopes: ['im:chat:delete'], supportsYes: true,
      flags: [{ name: 'chat-id', type: 'string', description: 'Target chat ID', required: true }],
    },
    {
      service: 'calendar', command: 'agenda', description: 'List upcoming calendar events',
      risk: 'read', scopes: ['calendar:calendar:readonly'],
      flags: [
        { name: 'days', type: 'number', description: 'Number of days to look ahead', required: false },
        { name: 'verbose', type: 'boolean', description: 'Include full details', required: false },
      ],
    },
    {
      service: 'docs', command: 'search', description: 'Search cloud documents by keyword',
      risk: 'read', scopes: ['docs:doc:readonly'],
      flags: [
        { name: 'query', type: 'string', description: 'Search keyword', required: true },
        { name: 'type', type: 'string', description: 'Document type', required: false, enum: ['docx', 'sheet', 'bitable'] },
      ],
    },
    {
      service: 'drive', command: 'upload', description: 'Upload a file to cloud drive',
      risk: 'write', scopes: ['drive:file:write'],
      flags: [
        { name: 'file-path', type: 'string', description: 'Local file path', required: true },
        { name: 'parent-token', type: 'string', description: 'Folder token', required: false },
      ],
    },
  ],
};
const FAKE_TIER1 = new Set(['lark_im_messages_send', 'lark_calendar_agenda']);

// Build the shared state exactly as server.js does, via the same helpers.
const allToolDefs = FAKE_CATALOG.tools;
const toolScopeMap = buildToolScopeMap(allToolDefs);
const catalogIndex = buildCatalogIndex(allToolDefs);
const AUTHORIZE_BASE = 'https://oauth.example.com';

describe('toToolName', () => {
  it('converts service + command with hyphens to underscored tool name', () => {
    expect(toToolName({ service: 'im', command: 'messages-send' })).toBe('lark_im_messages_send');
  });
  it('strips leading + from command', () => {
    expect(toToolName({ service: 'calendar', command: '+agenda' })).toBe('lark_calendar_agenda');
  });
  it('handles commands with no hyphens', () => {
    expect(toToolName({ service: 'drive', command: 'upload' })).toBe('lark_drive_upload');
  });
});

describe('toSchemaKey', () => {
  it('replaces hyphens with underscores', () => {
    expect(toSchemaKey('chat-id')).toBe('chat_id');
    expect(toSchemaKey('parent-folder-token')).toBe('parent_folder_token');
  });
  it('leaves already-underscored names unchanged', () => {
    expect(toSchemaKey('chat_id')).toBe('chat_id');
  });
});

describe('buildInputSchema', () => {
  it('produces correct JSON schema for string flags', () => {
    const schema = buildInputSchema(FAKE_CATALOG.tools[0]);
    expect(schema.type).toBe('object');
    expect(schema.properties.chat_id).toEqual({ type: 'string', description: 'Target chat ID' });
    expect(schema.properties.text).toEqual({ type: 'string', description: 'Message body' });
    expect(schema.required).toEqual(['chat_id', 'text']);
  });
  it('handles number and boolean flag types', () => {
    const schema = buildInputSchema(FAKE_CATALOG.tools[2]);
    expect(schema.properties.days.type).toBe('number');
    expect(schema.properties.verbose.type).toBe('boolean');
    expect(schema.required).toBeUndefined();
  });
  it('includes enum property when flag has enum', () => {
    const schema = buildInputSchema(FAKE_CATALOG.tools[3]);
    expect(schema.properties.type.enum).toEqual(['docx', 'sheet', 'bitable']);
  });
  it('adds _confirm property for high-risk-write tools', () => {
    const schema = buildInputSchema(FAKE_CATALOG.tools[1]);
    expect(schema.properties._confirm).toBeDefined();
    expect(schema.properties._confirm.type).toBe('boolean');
    expect(schema.properties._confirm.description).toContain('destructive operation');
  });
  it('does NOT add _confirm for non-high-risk tools', () => {
    const schema = buildInputSchema(FAKE_CATALOG.tools[0]);
    expect(schema.properties._confirm).toBeUndefined();
  });
});

describe('toolAnnotations', () => {
  it('returns destructiveHint=true for high-risk-write', () => {
    const ann = toolAnnotations({ description: 'Delete chat', risk: 'high-risk-write' });
    expect(ann.readOnlyHint).toBe(false);
    expect(ann.destructiveHint).toBe(true);
    expect(ann.idempotentHint).toBe(false);
    expect(ann.openWorldHint).toBe(true);
    expect(ann.title).toBe('Delete chat');
  });
  it('returns destructiveHint=false for write (low-risk)', () => {
    const ann = toolAnnotations({ description: 'Send message', risk: 'write' });
    expect(ann.readOnlyHint).toBe(false);
    expect(ann.destructiveHint).toBe(false);
    expect(ann.idempotentHint).toBe(false);
    expect(ann.openWorldHint).toBe(true);
  });
  it('returns readOnlyHint=true for read tools', () => {
    const ann = toolAnnotations({ description: 'List events', risk: 'read' });
    expect(ann.readOnlyHint).toBe(true);
    expect(ann.destructiveHint).toBe(false);
    expect(ann.idempotentHint).toBe(true);
    expect(ann.openWorldHint).toBe(true);
  });
  it('defaults to read-only for unknown risk levels', () => {
    const ann = toolAnnotations({ description: 'Unknown op', risk: 'something-else' });
    expect(ann.readOnlyHint).toBe(true);
    expect(ann.destructiveHint).toBe(false);
  });
});

describe('searchCatalog', () => {
  const search = (q, cat) => searchCatalog(catalogIndex, FAKE_TIER1, q, cat);
  it('returns all non-tier1 tools when no query or category', () => {
    const results = search('', undefined);
    expect(results.length).toBe(3);
    expect(results.every(e => !FAKE_TIER1.has(e.name))).toBe(true);
  });
  it('filters by category (service)', () => {
    const results = search('', 'docs');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('lark_docs_search');
  });
  it('returns empty when category has no non-tier1 tools', () => {
    expect(search('', 'calendar').length).toBe(0);
  });
  it('finds tools by partial keyword match (prefix)', () => {
    const results = search('delete', undefined);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('lark_im_chat_delete');
  });
  it('finds tools by description keyword', () => {
    const results = search('cloud documents keyword', undefined);
    expect(results.some(e => e.name === 'lark_docs_search')).toBe(true);
  });
  it('returns no results for completely unrelated query', () => {
    expect(search('zzz_nonexistent_xyz', undefined).length).toBe(0);
  });
  it('respects category filter when combined with query', () => {
    expect(search('upload', 'docs').length).toBe(0);
  });
  it('ranks higher-scoring results first', () => {
    expect(search('chat delete', undefined)[0].name).toBe('lark_im_chat_delete');
  });
});

describe('findByName', () => {
  it('finds a catalog entry by its tool name', () => {
    expect(findByName(catalogIndex, 'lark_docs_search')?.name).toBe('lark_docs_search');
  });
  it('returns undefined for an unknown name', () => {
    expect(findByName(catalogIndex, 'lark_nope_nope')).toBeUndefined();
  });
});

// Agents naturally pass structured data for a parameter whose description shows
// a JSON shape — String([[10],[20]]) silently produces "10,20" and lark-cli
// rejects it downstream with an opaque error. Accept BOTH conventions: a JSON
// string passes through, an object/array is stringified.
describe('coerceFlagValue', () => {
  it('passes a string through unchanged', () => {
    expect(coerceFlagValue('[[10],[20]]')).toBe('[[10],[20]]');
  });
  it('stringifies an array (String() would corrupt it)', () => {
    expect(coerceFlagValue([[10], [20]])).toBe('[[10],[20]]');
  });
  it('stringifies an object', () => {
    expect(coerceFlagValue({ sheets: [{ name: 'S1' }] })).toBe('{"sheets":[{"name":"S1"}]}');
  });
  it('stringifies numbers/booleans via String (CLI flag values)', () => {
    expect(coerceFlagValue(7)).toBe('7');
    expect(coerceFlagValue(true)).toBe('true');
  });
});

// Pre-spawn payload validation against the embedded --print-schema contract.
// Catches the observed failure classes BEFORE spawning lark-cli, returning a
// self-correction hint in MCP language (mirrors the raw-API params/data
// validation precedent). Shallow on purpose: root type + first-level items
// type — enough to catch non-JSON and 1D-vs-2D, without reimplementing a full
// JSON-Schema validator.
describe('validatePayload', () => {
  const CELLS_SCHEMA = {
    description: '2D array of cell objects',
    type: 'array',
    items: { type: 'array', items: { type: 'object' } },
  };

  it('accepts a valid 2D JSON string', () => {
    expect(validatePayload('[[{"value":1}]]', CELLS_SCHEMA)).toBeNull();
  });

  it('rejects non-JSON text with a hint', () => {
    const err = validatePayload('10\n20\n30', CELLS_SCHEMA);
    expect(err).toContain('JSON');
  });

  it('rejects a 1D array when the schema wants 2D (the observed cells mistake)', () => {
    const err = validatePayload('[{"formula":"=SUM(A1:A5)"}]', CELLS_SCHEMA);
    expect(err).toBeTruthy();
    expect(err).toMatch(/array of arrays|2D|nested/i);
  });

  it('rejects a root-type mismatch (object where array expected)', () => {
    expect(validatePayload('{"a":1}', CELLS_SCHEMA)).toBeTruthy();
  });

  it('accepts an object payload for an object schema', () => {
    expect(validatePayload('{"sheets":[]}', { type: 'object' })).toBeNull();
  });

  it('returns null when there is no schema to check against', () => {
    expect(validatePayload('anything', undefined)).toBeNull();
  });
});

// lark-cli's structured validation errors speak CLI ("--values: trailing data
// after JSON value") — an agent correcting against `--values` gets more
// confused, since its parameter is `values`. Translate flag references to MCP
// parameter names and mark the result self-correctable (the caller returns it
// with isError:false so lenient clients don't swallow the hint).
describe('translateCliError', () => {
  // The invoked tool's real flag names — rewriting is ALLOWLIST-ONLY. Error
  // messages echo arbitrary user input (formulas, payload fragments), so a
  // blind /--\w+/ rewrite would corrupt echoed data; only --<known-flag> of
  // this specific tool may be translated.
  const FLAGS = ['values', 'sheet-id', 'sheet-name'];
  const CLI_VALIDATION = JSON.stringify({
    ok: false, identity: 'user',
    error: { type: 'validation', subtype: 'invalid_argument', message: '--values: trailing data after JSON value' },
  });

  it('rewrites known --flag references to parameter names and flags it self-correctable', () => {
    const r = translateCliError(CLI_VALIDATION, FLAGS);
    expect(r.selfCorrectable).toBe(true);
    expect(r.text).not.toContain('--values');
    expect(JSON.parse(r.text).error.message).toContain('values');
  });

  it('leaves auth errors untouched and NOT self-correctable', () => {
    const authErr = JSON.stringify({ ok: false, error: { type: 'authentication', message: 'token expired' } });
    const r = translateCliError(authErr, FLAGS);
    expect(r.selfCorrectable).toBe(false);
    expect(r.text).toBe(authErr);
  });

  it('passes non-JSON text through untouched', () => {
    const r = translateCliError('some raw stderr text', FLAGS);
    expect(r.selfCorrectable).toBe(false);
    expect(r.text).toBe('some raw stderr text');
  });

  it('rewrites multiple known flag references in one message', () => {
    const err = JSON.stringify({ ok: false, error: { type: 'validation', message: 'either --sheet-id or --sheet-name is required' } });
    const r = translateCliError(err, FLAGS);
    expect(r.text).not.toContain('--sheet-id');
    expect(JSON.parse(r.text).error.message).toContain('sheet_id');
    expect(JSON.parse(r.text).error.message).toContain('sheet_name');
  });

  it('does NOT touch -- sequences in echoed user data (Excel double-negation)', () => {
    // A validation message may echo the user's own payload. `--(a1:a10>5)` is
    // the common Excel coercion idiom; `--a1` is not a flag of this tool and
    // must survive verbatim.
    const err = JSON.stringify({ ok: false, error: { type: 'validation', message: 'invalid formula: =SUMPRODUCT(--(a1:a10>5)) --values must be JSON' } });
    const r = translateCliError(err, FLAGS);
    const msg = JSON.parse(r.text).error.message;
    expect(msg).toContain('--(a1:a10>5)');
    expect(msg).toContain(' values must be JSON');
  });

  it('does NOT rewrite an unknown --flag (not in this tool\'s flag set)', () => {
    const err = JSON.stringify({ ok: false, error: { type: 'validation', message: 'unknown flag: --frobnicate' } });
    const r = translateCliError(err, FLAGS);
    expect(JSON.parse(r.text).error.message).toContain('--frobnicate');
  });

  it('longer flag names win over prefixes (sheet-name vs a hypothetical sheet flag)', () => {
    const err = JSON.stringify({ ok: false, error: { type: 'validation', message: '--sheet-name is required' } });
    const r = translateCliError(err, ['sheet', 'sheet-name']);
    expect(JSON.parse(r.text).error.message).toContain('sheet_name');
  });
});

// lark-cli appends `_notice.update` ("run: lark-cli update") to every response
// when a newer CLI exists. That's operator guidance — the agent can't run
// terminal commands, and the notice burns tokens in EVERY tool response until
// the pin is bumped. Strip it; version drift is visible in ops.sh/logs.
describe('stripCliNotice', () => {
  it('removes _notice.update from a success payload', () => {
    const payload = JSON.stringify({ ok: true, data: { x: 1 }, _notice: { update: { message: 'lark-cli 1.0.69 available' } } });
    const out = JSON.parse(stripCliNotice(payload));
    expect(out._notice).toBeUndefined();
    expect(out.data).toEqual({ x: 1 });
  });

  it('keeps other _notice keys if present', () => {
    const payload = JSON.stringify({ ok: true, _notice: { update: { v: 1 }, other: 'keep' } });
    const out = JSON.parse(stripCliNotice(payload));
    expect(out._notice).toEqual({ other: 'keep' });
  });

  it('passes non-JSON and notice-free payloads through unchanged', () => {
    expect(stripCliNotice('plain text')).toBe('plain text');
    const clean = JSON.stringify({ ok: true, data: null });
    expect(stripCliNotice(clean)).toBe(clean);
  });

  // Cross-review finding: a JSON.parse→stringify round-trip reads numbers as
  // doubles, silently corrupting integers > 2^53 (7304827392019283746 →
  // 7304827392019284000). Feishu responses can carry such numeric ids, and
  // the _notice path is ACTIVE whenever upstream lark-cli is newer than the
  // pin — i.e. most of the time. The strip must preserve every other byte.
  it('preserves >2^53 integers while stripping _notice.update', () => {
    const payload = '{"ok":true,"data":{"chat_id":7304827392019283746},"_notice":{"update":{"message":"lark-cli 1.0.70 available"}}}';
    const out = stripCliNotice(payload);
    expect(out).toContain('7304827392019283746');
    expect(out).not.toContain('_notice');
    expect(out).not.toContain('1.0.70');
  });

  it('preserves >2^53 integers when _notice has other keys to keep', () => {
    const payload = '{"ok":true,"data":{"rev":123456789012345678},"_notice":{"update":{"v":1},"other":"keep"}}';
    const out = stripCliNotice(payload);
    expect(out).toContain('123456789012345678');
    expect(out).toContain('"other":"keep"');
    expect(out).not.toContain('"update"');
  });
});

// The tool namespace says `lark_docs_*` (service "docs") but the skill domain
// is `doc` — an agent deriving the domain from a tool name naturally guesses
// "docs" and gets unknown_domain. Accept service-name aliases.
describe('resolveSkillDomain', () => {
  const INDEX = [
    { domain: 'doc', dir: 'lark-doc' },
    { domain: 'sheets', dir: 'lark-sheets' },
  ];

  it('resolves an exact domain name', () => {
    expect(resolveSkillDomain(INDEX, 'doc')?.domain).toBe('doc');
  });

  it('resolves the lark- prefixed dir form', () => {
    expect(resolveSkillDomain(INDEX, 'lark-doc')?.domain).toBe('doc');
  });

  it('resolves the docs service-name alias to the doc domain', () => {
    expect(resolveSkillDomain(INDEX, 'docs')?.domain).toBe('doc');
  });

  it('returns undefined for a truly unknown domain', () => {
    expect(resolveSkillDomain(INDEX, 'nonexistent')).toBeUndefined();
  });
});

describe('patchPermissionError', () => {
  const ERROR_CODE = 99991679;
  const patch = (output, toolName, tok) => patchPermissionError(toolScopeMap, AUTHORIZE_BASE, output, toolName, tok);

  it('adds authorize_url when scope is found in toolScopeMap', () => {
    const output = JSON.stringify({ error: { code: ERROR_CODE, message: 'Permission denied' } });
    const parsed = JSON.parse(patch(output, 'lark_im_messages_send', ''));
    expect(parsed.error.authorize_url).toContain('https://oauth.example.com/authorize');
    expect(parsed.error.authorize_url).toContain('im%3Amessage%3Asend');
    expect(parsed.error.required_scopes).toContain('im:message:send');
    expect(parsed.error.user_action).toContain('Ask the user');
    expect(parsed.error.console_url).toBeUndefined();
  });
  it('includes incremental auth token in URL when provided', () => {
    const output = JSON.stringify({ error: { code: ERROR_CODE, message: 'Permission denied' } });
    const parsed = JSON.parse(patch(output, 'lark_im_messages_send', 'my-auth-token'));
    expect(parsed.error.authorize_url).toContain('&t=my-auth-token');
  });
  it('extracts scopes from console_url when toolScopeMap has no entry', () => {
    const output = JSON.stringify({ error: { code: ERROR_CODE, message: 'Permission denied', console_url: 'https://feishu.cn/admin?scopes=wiki:wiki:readonly,wiki:space' } });
    const parsed = JSON.parse(patch(output, 'lark_unknown_tool', ''));
    expect(parsed.error.authorize_url).toContain('wiki%3Awiki%3Areadonly');
    expect(parsed.error.authorize_url).toContain('wiki%3Aspace');
  });
  it('extracts scopes from error message regex when no console_url', () => {
    const output = JSON.stringify({ error: { code: ERROR_CODE, message: 'Insufficient privilege. Required scope: contact:user.base:readonly' } });
    const parsed = JSON.parse(patch(output, 'lark_unknown_tool', ''));
    expect(parsed.error.authorize_url).toContain('contact%3Auser.base%3Areadonly');
  });
  it('returns generic user_action when no scopes can be determined', () => {
    const output = JSON.stringify({ error: { code: ERROR_CODE, message: 'Something went wrong' } });
    const parsed = JSON.parse(patch(output, 'lark_unknown_tool', ''));
    expect(parsed.error.user_action).toContain('not automatically determined');
    expect(parsed.error.authorize_url).toBeUndefined();
  });
  it('matches typed envelope with type=authorization + subtype=missing_scope (no code)', () => {
    const output = JSON.stringify({
      ok: false, error: {
        type: 'authorization', subtype: 'missing_scope',
        message: 'missing required scope(s): docs:document.comment:create',
        missing_scopes: ['docs:document.comment:create', 'docs:document.comment:write_only'],
        identity: 'user',
      },
    });
    const parsed = JSON.parse(patch(output, 'lark_drive_add_comment', ''));
    expect(parsed.error.authorize_url).toContain('docs%3Adocument.comment%3Acreate');
    expect(parsed.error.authorize_url).toContain('docs%3Adocument.comment%3Awrite_only');
    expect(parsed.error.required_scopes).toEqual(['docs:document.comment:create', 'docs:document.comment:write_only']);
  });
  it('matches typed envelope with subtype=token_scope_insufficient', () => {
    const output = JSON.stringify({
      ok: false, error: {
        type: 'authorization', subtype: 'token_scope_insufficient',
        message: 'token has no permission for this operation',
        hint: 'check the token\'s granted scopes',
      },
    });
    const parsed = JSON.parse(patch(output, 'lark_im_messages_send', 'tok'));
    expect(parsed.error.authorize_url).toContain('im%3Amessage%3Asend');
    expect(parsed.error.authorize_url).toContain('&t=tok');
  });
  it('prefers missing_scopes array from typed envelope over toolScopeMap', () => {
    const output = JSON.stringify({
      ok: false, error: {
        type: 'authorization', subtype: 'missing_scope', code: 99991679,
        message: 'unauthorized',
        missing_scopes: ['calendar:calendar.event:create'],
      },
    });
    const parsed = JSON.parse(patch(output, 'lark_im_messages_send', ''));
    expect(parsed.error.required_scopes).toEqual(['calendar:calendar.event:create']);
    expect(parsed.error.required_scopes).not.toContain('im:message:send');
  });
  it('does not match typed envelope with unrelated authorization subtypes', () => {
    const output = JSON.stringify({
      ok: false, error: {
        type: 'authorization', subtype: 'app_unavailable',
        message: 'app is not available',
      },
    });
    expect(patch(output, 'lark_im_messages_send', '')).toBe(output);
  });
  it('passes through output unchanged when error code is not 99991679', () => {
    const output = JSON.stringify({ error: { code: 12345, message: 'Other error' } });
    expect(patch(output, 'lark_im_messages_send', '')).toBe(output);
  });
  it('passes through non-JSON output unchanged', () => {
    expect(patch('plain text error from cli', 'lark_im_messages_send', '')).toBe('plain text error from cli');
  });
  it('passes through output with no error field', () => {
    const output = JSON.stringify({ data: { ok: true } });
    expect(patch(output, 'lark_im_messages_send', '')).toBe(output);
  });
  it('handles multiple scopes in error message', () => {
    const output = JSON.stringify({ error: { code: ERROR_CODE, message: 'Requires scopes: im:message:send, im:chat:readonly' } });
    const parsed = JSON.parse(patch(output, 'lark_unknown_tool', ''));
    expect(parsed.error.authorize_url).toContain('im%3Amessage%3Asend');
    expect(parsed.error.authorize_url).toContain('im%3Achat%3Areadonly');
  });
});

describe('createSemaphore', () => {
  it('executes function immediately when under concurrency limit', async () => {
    const withSemaphore = createSemaphore(3, 2);
    expect(await withSemaphore(() => Promise.resolve('ok'), undefined)).toBe('ok');
  });
  it('queues execution when at concurrency limit and resolves in order', async () => {
    const withSemaphore = createSemaphore(1, 5);
    const order = [];
    let resolveFirst;
    const firstBlocker = new Promise(r => { resolveFirst = r; });
    const p1 = withSemaphore(async () => { order.push('first-start'); await firstBlocker; order.push('first-end'); return 'first'; }, undefined);
    const p2 = withSemaphore(async () => { order.push('second'); return 'second'; }, undefined);
    resolveFirst();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });
  it('throws ServerBusyError when queue overflows', async () => {
    const withSemaphore = createSemaphore(1, 1);
    let resolveBlocker;
    const blocker = new Promise(r => { resolveBlocker = r; });
    const p1 = withSemaphore(() => blocker, undefined);
    const p2 = withSemaphore(() => Promise.resolve('queued'), undefined);
    await expect(withSemaphore(() => Promise.resolve('overflow'), undefined)).rejects.toThrow('server_busy');
    resolveBlocker('done');
    await Promise.all([p1, p2]);
  });
  it('rejects with client_aborted when abort signal fires while queued', async () => {
    const withSemaphore = createSemaphore(1, 5);
    let resolveBlocker;
    const blocker = new Promise(r => { resolveBlocker = r; });
    const ac = new AbortController();
    const p1 = withSemaphore(() => blocker, undefined);
    const p2 = withSemaphore(() => Promise.resolve('should not run'), ac.signal);
    ac.abort();
    await expect(p2).rejects.toThrow('client_aborted');
    resolveBlocker('done');
    await p1;
  });
  it('propagates errors from the executed function', async () => {
    const withSemaphore = createSemaphore(3, 2);
    await expect(withSemaphore(() => Promise.reject(new Error('boom')), undefined)).rejects.toThrow('boom');
  });
  it('releases slot even when function throws', async () => {
    const withSemaphore = createSemaphore(1, 2);
    await withSemaphore(() => Promise.reject(new Error('fail')), undefined).catch(() => {});
    expect(await withSemaphore(() => Promise.resolve('ok'), undefined)).toBe('ok');
  });
});

describe('ServerBusyError', () => {
  it('has correct name and message', () => {
    const err = new ServerBusyError();
    expect(err.name).toBe('ServerBusyError');
    expect(err.message).toBe('server_busy');
    expect(err instanceof Error).toBe(true);
  });
});

describe('createSingleFlight', () => {
  it('collapses concurrent calls into ONE underlying invocation', async () => {
    // Guards the loadAppSecret thundering-herd: at the TTL boundary, up to ~30
    // in-flight requests must NOT each fire a Secrets Manager call.
    let calls = 0;
    let release;
    const gate = new Promise(r => { release = r; });
    const sf = createSingleFlight(async () => { calls++; await gate; return calls; });

    const a = sf(); const b = sf(); const c = sf(); // three concurrent callers
    release();
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(calls).toBe(1);          // one underlying call
    expect([ra, rb, rc]).toEqual([1, 1, 1]); // all share the same result
  });

  it('allows a fresh call AFTER the in-flight one settles', async () => {
    let calls = 0;
    const sf = createSingleFlight(async () => { calls++; return calls; });
    expect(await sf()).toBe(1);
    expect(await sf()).toBe(2); // not deduped once the first settled
    expect(calls).toBe(2);
  });

  it('propagates rejection to all in-flight callers and clears for retry', async () => {
    let attempt = 0;
    const sf = createSingleFlight(async () => { attempt++; if (attempt === 1) throw new Error('boom'); return 'ok'; });
    const a = sf(); const b = sf();
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom'); // same failure shared
    // After the failed flight clears, a retry can succeed.
    expect(await sf()).toBe('ok');
    expect(attempt).toBe(2);
  });
});

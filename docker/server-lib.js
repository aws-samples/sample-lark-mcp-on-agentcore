// Pure, side-effect-free helpers for the MCP server.
//
// Extracted from server.js so they can be unit-tested directly: server.js runs
// module-level code on require (reads /app/*.json, scans /app/skills, calls
// server.listen), so it cannot be imported in tests. Keeping these functions
// here is the single source of truth — server.js requires this module, the
// tests import this module, and the two can never drift. (Same pattern as
// generate-tools-lib.js and skill-sections.js.)
//
// Functions that depend on per-process state (the catalog index, the scope map,
// the OAuth authorize base) take that state as parameters rather than closing
// over module globals, so they stay pure and testable.

const PERMISSION_ERROR_CODE = 99991679;
const AUTH_ERROR_CODE = 99991668;

class ServerBusyError extends Error {
  constructor() { super('server_busy'); this.name = 'ServerBusyError'; }
}

function toToolName(def) {
  const cmd = def.command.replace(/^\+/, '');
  return `lark_${def.service}_${cmd.replace(/-/g, '_')}`;
}

function toSchemaKey(flagName) { return flagName.replace(/-/g, '_'); }

function buildInputSchema(def) {
  const properties = {};
  const required = [];
  for (const flag of def.flags) {
    const key = toSchemaKey(flag.name);
    const prop = { description: flag.description };
    if (flag.type === 'boolean') prop.type = 'boolean';
    else if (flag.type === 'number') prop.type = 'number';
    else prop.type = 'string';
    if (flag.enum) prop.enum = flag.enum;
    properties[key] = prop;
    if (flag.required) required.push(key);
  }
  if (def.risk === 'high-risk-write') {
    properties._confirm = {
      type: 'boolean',
      description: 'Must be set to true to confirm this destructive operation. Ask the user first; do not set this without explicit user approval.',
    };
  }
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

// MCP tool annotations (spec: 2025-03-26). Clients use these to render UI:
// destructive tools should prompt the user explicitly before invocation.
function toolAnnotations(def) {
  if (def.risk === 'high-risk-write') {
    return { title: def.description, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  }
  if (def.risk === 'write') {
    return { title: def.description, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  }
  return { title: def.description, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
}

// toolName -> required scopes (only for tools that declare scopes).
function buildToolScopeMap(toolDefs) {
  const map = new Map();
  for (const def of toolDefs) {
    if (def.scopes && def.scopes.length > 0) map.set(toToolName(def), def.scopes);
  }
  return map;
}

// Searchable catalog index: each entry carries its tool name, the def, and a
// lowercased token list (name + description) for prefix matching.
function buildCatalogIndex(toolDefs) {
  return toolDefs.map(def => {
    const name = toToolName(def);
    return { name, def, tokens: `${name} ${def.description}`.toLowerCase().split(/[\s_]+/) };
  });
}

function searchCatalog(catalogIndex, tier1Names, query, category) {
  const tokens = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  let candidates = catalogIndex.filter(e => !tier1Names.has(e.name));
  if (category) candidates = candidates.filter(e => e.def.service === category);
  if (tokens.length === 0) return candidates.slice(0, 20);

  const scored = [];
  for (const entry of candidates) {
    let score = 0;
    for (const tok of tokens) {
      if (entry.tokens.some(t => t.startsWith(tok) || tok.startsWith(t))) score++;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map(s => s.entry);
}

function findByName(catalogIndex, name) {
  return catalogIndex.find(e => e.name === name);
}

// Rewrite a lark-cli permission-denied error into an actionable hint with an
// incremental-auth URL. Two detection paths:
//   1. Legacy/API-classified: error.code === 99991679 or 99991668
//   2. Typed envelope (lark-cli ≥1.0.50 pre-flight): error.type === "authorization"
//      with subtype "missing_scope" or "token_scope_insufficient" (no code field)
//
// Scope discovery layers (in priority order):
//   a. error.missing_scopes array (typed envelope, most authoritative)
//   b. local scope map (toolScopeMap, generated at build time)
//   c. console_url query param
//   d. scope tokens parsed from error message text
function patchPermissionError(toolScopeMap, authorizeBase, output, toolName, incrAuthToken) {
  try {
    const data = JSON.parse(output);
    const code = Number(data.error?.code);
    const isCodeMatch = code === PERMISSION_ERROR_CODE || code === AUTH_ERROR_CODE;
    const isTypedMatch = data.error?.type === 'authorization' &&
      (data.error.subtype === 'missing_scope' || data.error.subtype === 'token_scope_insufficient');
    if (isCodeMatch || isTypedMatch) {
      const missing = new Set();
      // Layer 1: typed envelope carries authoritative missing_scopes array
      if (Array.isArray(data.error.missing_scopes)) {
        for (const s of data.error.missing_scopes) if (s) missing.add(s);
      }
      // Layer 2: check local scope mapping table
      if (missing.size === 0 && toolName && toolScopeMap.has(toolName)) {
        for (const s of toolScopeMap.get(toolName)) missing.add(s);
      }
      // Layer 3: extract from lark-cli error response console_url
      if (missing.size === 0 && data.error.console_url) {
        try {
          const u = new URL(data.error.console_url);
          const raw = u.searchParams.get('scopes') || '';
          for (const s of raw.split(/[,\s]+/).filter(Boolean)) missing.add(s);
        } catch {}
      }
      // Layer 4: regex extraction from error message
      if (missing.size === 0) {
        const matches = [...(data.error.message || '').matchAll(/scopes?[:\s]+([a-z0-9_:.\- ,]+)/gi)];
        for (const m of matches) {
          for (const s of m[1].split(/[,\s]+/)) {
            if (/^[a-z0-9_:.-]+$/i.test(s) && s.length > 2) missing.add(s);
          }
        }
      }

      if (missing.size > 0 && authorizeBase) {
        const scopeList = [...missing];
        const tokenParam = incrAuthToken ? `&t=${encodeURIComponent(incrAuthToken)}` : '';
        const authUrl = `${authorizeBase}/authorize?extra_scope=${encodeURIComponent(scopeList.join(','))}${tokenParam}`;
        data.error.authorize_url = authUrl;
        data.error.required_scopes = scopeList;
        data.error.user_action = `Ask the user to open authorize_url to grant: ${scopeList.join(', ')}. Do not retry until authorized.`;
      } else {
        data.error.user_action = 'This tool requires a permission not automatically determined. Contact the admin.';
      }
      delete data.error.console_url;
      return JSON.stringify(data, null, 2);
    }
  } catch {}
  return output;
}

// Bounded-concurrency gate. Returns a withSemaphore(fn, abortSignal) function
// holding its own counters, so each server process (or test) gets an isolated
// semaphore. Queued callers past maxConcurrent wait for a slot; past
// maxQueueDepth they get ServerBusyError. A queued caller whose abortSignal
// fires is spliced out and rejected with client_aborted.
function createSemaphore(maxConcurrent, maxQueueDepth) {
  let activeProcesses = 0;
  const queue = [];

  return async function withSemaphore(fn, abortSignal) {
    if (activeProcesses >= maxConcurrent) {
      if (queue.length >= maxQueueDepth) throw new ServerBusyError();
      await new Promise((resolve, reject) => {
        const entry = { resolve, reject };
        queue.push(entry);
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            const idx = queue.indexOf(entry);
            if (idx >= 0) { queue.splice(idx, 1); reject(new Error('client_aborted')); }
          }, { once: true });
        }
      });
    }
    activeProcesses++;
    try { return await fn(); }
    finally {
      activeProcesses--;
      const next = queue.shift();
      if (next) next.resolve();
    }
  };
}

// Single-flight: wrap an async fn so concurrent calls share ONE in-flight
// invocation; once it settles (resolve or reject), the next call starts fresh.
// Used to dedup loadAppSecret at the cache-TTL boundary, where a burst of
// requests would otherwise each hit Secrets Manager (thundering herd).
function createSingleFlight(fn) {
  let inflight = null;
  return function (...args) {
    if (inflight) return inflight;
    inflight = Promise.resolve()
      .then(() => fn(...args))
      .finally(() => { inflight = null; });
    return inflight;
  };
}

// Agents naturally pass structured data for a parameter whose description
// shows a JSON shape. String([[10],[20]]) silently corrupts that to "10,20"
// and lark-cli rejects it downstream with an opaque error. Accept BOTH
// conventions: a string passes through; an object/array is stringified;
// primitives keep String() (ordinary CLI flag values).
function coerceFlagValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

// Pre-spawn payload validation against the embedded --print-schema contract
// (def.payloadSchemas[flag], extracted at build time). Returns null when OK,
// or a self-correction hint in MCP language. Shallow on purpose: root type +
// first-level items type — enough to catch the two observed failure classes
// (non-JSON text; 1D array where the contract wants 2D) without reimplementing
// a JSON-Schema validator. Deeper mistakes still reach lark-cli, whose
// validation error is translated and passed through.
function validatePayload(value, schema) {
  if (!schema || !schema.type) return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return `not valid JSON. This parameter takes a JSON ${schema.type} (as a JSON value or a JSON-encoded string). ${schema.description ? `Contract: ${schema.description}` : ''}`.trim();
  }
  const rootIsArray = Array.isArray(parsed);
  if (schema.type === 'array' && !rootIsArray) {
    return `expected a JSON array at the root, got ${typeof parsed}. ${schema.description || ''}`.trim();
  }
  if (schema.type === 'object' && (rootIsArray || typeof parsed !== 'object' || parsed === null)) {
    return `expected a JSON object at the root, got ${rootIsArray ? 'array' : typeof parsed}. ${schema.description || ''}`.trim();
  }
  // First-level dimensionality: schema says array-of-arrays (e.g. cells is
  // rows×cols) but the payload's first element is not an array → the classic
  // "single cell, so I flattened to 1D" mistake.
  const itemsType = schema.items && !Array.isArray(schema.items) ? schema.items.type : undefined;
  if (schema.type === 'array' && itemsType === 'array' && parsed.length > 0 && !Array.isArray(parsed[0])) {
    return `expected an array of arrays (2D: rows × columns) — even a single cell must be nested, e.g. [[{...}]]. Got a 1D array. ${schema.description || ''}`.trim();
  }
  return null;
}

// lark-cli's structured validation errors speak CLI ("--values: trailing data
// after JSON value") — the MCP parameter is `values`, so an agent correcting
// against the flag name gets more confused. For `type:"validation"` errors,
// rewrite --flag references to snake_case parameter names and mark the result
// self-correctable: the caller returns it with isError:false so lenient
// clients (which swallow isError:true content as a generic "unknown error")
// let the agent read the hint and fix its own input. Auth/permission errors
// keep their dedicated paths (patchPermissionError / isAuthError) untouched.
//
// Rewriting is ALLOWLIST-ONLY (`flagNames` = the invoked tool's real flags):
// validation messages echo arbitrary user input — a formula like
// `=SUMPRODUCT(--(a1:a10>5))` or a payload fragment contains `--` sequences
// that a blind /--\w+/ rewrite would corrupt. Only `--<known-flag>` of THIS
// tool is translated; longest name first so --sheet-name is never half-matched
// by a shorter --sheet; a word-boundary guard keeps --sheet-id intact when
// only `sheet` is in the allowlist.
function translateCliError(raw, flagNames = []) {
  let data;
  try { data = JSON.parse(raw); } catch { return { text: raw, selfCorrectable: false }; }
  if (data?.error?.type !== 'validation') return { text: raw, selfCorrectable: false };
  if (typeof data.error.message === 'string' && flagNames.length > 0) {
    const byLength = [...flagNames].sort((a, b) => b.length - a.length);
    let msg = data.error.message;
    for (const flag of byLength) {
      msg = msg.split(`--${flag}`).map((part, i, arr) => {
        // Only join with the replacement when the next char is not a flag-name
        // char (word boundary) — prevents --sheet matching inside --sheet-id.
        if (i === arr.length - 1) return part;
        const next = arr[i + 1];
        const boundary = next === '' || !/^[a-z0-9-]/.test(next);
        return part + (boundary ? flag.replace(/-/g, '_') : `--${flag}`);
      }).join('');
    }
    data.error.message = msg;
  }
  return { text: JSON.stringify(data), selfCorrectable: true };
}

// lark-cli appends `_notice.update` ("run: lark-cli update") to every response
// when a newer CLI exists. That's operator guidance — the agent can't run
// terminal commands, and the notice burns tokens in EVERY tool response until
// the pin is bumped. Strip it (keep any other _notice keys); version drift
// stays visible to operators via ops.sh and container logs.
//
// The strip is SURGICAL, not a JSON.parse→stringify round-trip: parsing the
// whole response reads numbers as doubles and silently corrupts integers
// > 2^53 (7304827392019283746 → …4000) — and this path is active whenever
// upstream lark-cli is newer than the pin, i.e. most of the time. A string-
// aware scan locates the TOP-LEVEL "_notice" key (depth-1 check also defuses
// a literal "_notice" inside user data), and only that value span — lark-cli's
// own small notice object, never user data — is re-encoded. Every other byte
// of the response passes through untouched.
function stripCliNotice(output) {
  if (!output.includes('"_notice"')) return output;
  if (output[0] !== '{') return output;

  // Scan for the top-level "_notice" key: track string/escape state and brace
  // depth; a depth-1 string followed by `:` is a top-level key.
  let i = 1, depth = 1, keyIdx = -1, valStart = -1, valEnd = -1;
  const n = output.length;
  while (i < n) {
    const c = output[i];
    if (c === '"') {
      const strStart = i;
      i++;
      while (i < n) {
        if (output[i] === '\\') i += 2;
        else if (output[i] === '"') break;
        else i++;
      }
      const str = output.slice(strStart, i + 1);
      i++;
      // Key position: at depth 1 and followed by a colon.
      let k = i;
      while (k < n && /\s/.test(output[k])) k++;
      if (depth === 1 && output[k] === ':' && str === '"_notice"') {
        keyIdx = strStart;
        k++;
        while (k < n && /\s/.test(output[k])) k++;
        if (output[k] !== '{') return output; // unexpected shape — leave as-is
        // Capture the balanced object span.
        let d = 0, j = k, inStr = false;
        while (j < n) {
          const cj = output[j];
          if (inStr) {
            if (cj === '\\') j++;
            else if (cj === '"') inStr = false;
          } else if (cj === '"') inStr = true;
          else if (cj === '{') d++;
          else if (cj === '}') { d--; if (d === 0) { j++; break; } }
          j++;
        }
        valStart = k; valEnd = j;
        break;
      }
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    i++;
  }
  if (keyIdx < 0) return output;

  // Re-encode ONLY the notice object (lark-cli's own metadata, no big ints).
  let notice;
  try { notice = JSON.parse(output.slice(valStart, valEnd)); } catch { return output; }
  delete notice.update;

  if (Object.keys(notice).length > 0) {
    return output.slice(0, valStart) + JSON.stringify(notice) + output.slice(valEnd);
  }
  // Notice empty → drop the whole `"_notice": {...}` member plus one adjacent
  // comma (preceding if present, else following).
  let start = keyIdx, end = valEnd;
  let p = keyIdx - 1;
  while (p >= 0 && /\s/.test(output[p])) p--;
  if (output[p] === ',') start = p;
  else {
    let q = valEnd;
    while (q < n && /\s/.test(output[q])) q++;
    if (output[q] === ',') end = q + 1;
  }
  return output.slice(0, start) + output.slice(end);
}

// Skill-domain lookup with service-name aliases. The tool namespace says
// `lark_docs_*` (service "docs") but the skill domain is `doc` — an agent
// deriving the domain from a tool name naturally guesses "docs" and got
// unknown_domain. Accept: exact domain, dir name, lark-<domain>, and the
// domain+'s' plural (docs→doc) so the service-name guess just works.
function resolveSkillDomain(skillIndex, domain) {
  return skillIndex.find(s =>
    s.domain === domain || s.dir === domain || s.dir === `lark-${domain}` ||
    `${s.domain}s` === domain);
}

module.exports = {
  PERMISSION_ERROR_CODE,
  ServerBusyError,
  coerceFlagValue,
  validatePayload,
  translateCliError,
  stripCliNotice,
  resolveSkillDomain,
  createSingleFlight,
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
};

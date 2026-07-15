#!/usr/bin/env node
// MCP Streamable HTTP server for AgentCore.
// Tiered tool architecture: 28 tier-1 + lark_discover + lark_invoke.
// Executes lark-cli commands with per-request user token injection.

const http = require('http');
const fs = require('fs');
const { execFile } = require('child_process');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { extractSkillDescription } = require('./skill-description');
const { isUnsafeSection, listAllSections, resolveSection } = require('./skill-sections');
const {
  ServerBusyError,
  toToolName,
  toSchemaKey,
  buildInputSchema,
  toolAnnotations,
  buildToolScopeMap,
  buildCatalogIndex,
  searchCatalog: searchCatalogLib,
  findByName: findByNameLib,
  patchPermissionError: patchPermissionErrorLib,
  createSemaphore,
  createSingleFlight,
  coerceFlagValue,
  validatePayload,
  translateCliError,
  stripCliNotice,
  resolveSkillDomain,
} = require('./server-lib');

process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({ level: 'FATAL', event: 'uncaughtException', error: err.message, stack: err.stack }));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ level: 'ERROR', event: 'unhandledRejection', reason: String(reason) }));
});

// Track in-flight lark-cli child processes so SIGTERM can drain or kill them.
const activeChildren = new Set();

// Bounded concurrency for lark-cli child processes. ServerBusyError and the
// queue/abort logic live in server-lib.js (createSemaphore) so they're unit-
// testable without server.js's module-level side effects.
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '10', 10);
const MAX_QUEUE_DEPTH = parseInt(process.env.MAX_QUEUE_DEPTH || '20', 10);
const withSemaphore = createSemaphore(MAX_CONCURRENT, MAX_QUEUE_DEPTH);

// Per-call lark-cli timeout. Kept at/under the mcp-middleware Lambda's 25s fetch
// budget (AbortSignal.timeout(25000)) so a child can't outlive the client's 504
// and hold a concurrency slot for the gap.
const LARK_CLI_TIMEOUT_MS = parseInt(process.env.LARK_CLI_TIMEOUT_MS || '24000', 10);

function runLarkCli(cliArgs, env, timeoutMs, abortSignal) {
  return new Promise((resolve, reject) => {
    const child = execFile('lark-cli', cliArgs, {
      timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env, signal: abortSignal,
    }, (err, stdout, stderr) => {
      activeChildren.delete(child);
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
    activeChildren.add(child);
  });
}

// AgentCore expects 8000 (Dockerfile EXPOSE 8000); env-overridable so tests that
// load this module can bind distinct ports and never collide on a shared worker.
const PORT = parseInt(process.env.PORT || '8000', 10);
const REGION = process.env.AWS_REGION || process.env.DEPLOY_REGION || 'us-west-2';
const APP_ID = process.env.APP_ID || '';
const APP_SECRET_ID = process.env.APP_SECRET_ID || 'lark-mcp-on-agentcore/feishu-app';
const BRAND = process.env.LARKSUITE_CLI_BRAND || 'feishu';
const AUTHORIZE_BASE = process.env.AUTHORIZE_BASE || '';

let APP_SECRET = '';
let appSecretLoaded = false;
let appSecretExpiry = 0;
const SECRET_CACHE_TTL = 30 * 60 * 1000; // 30 min
const sm = new SecretsManagerClient({ region: REGION });

// The actual fetch+retry, deduped via single-flight: at the 30-min TTL boundary
// a burst of in-flight requests would each call Secrets Manager (thundering
// herd, risking ThrottlingException). createSingleFlight collapses concurrent
// callers onto one fetch; the next call after it settles starts fresh.
const loadAppSecretOnce = createSingleFlight(async (maxRetries) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await sm.send(new GetSecretValueCommand({ SecretId: APP_SECRET_ID }));
      APP_SECRET = JSON.parse(resp.SecretString).appSecret;
      appSecretLoaded = true;
      appSecretExpiry = Date.now() + SECRET_CACHE_TTL;
      console.log(JSON.stringify({ level: 'INFO', event: 'app_secret_loaded' }));
      return;
    } catch (e) {
      const wait = Math.min(500 * Math.pow(2, i), 8000);
      console.error(JSON.stringify({ level: 'WARN', event: 'app_secret_load_failed', attempt: i + 1, error: e.message, retry_in_ms: wait }));
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, wait));
      else throw e;
    }
  }
});

async function loadAppSecret(maxRetries = 5) {
  // Cache hit short-circuits before single-flight, so steady-state requests pay
  // nothing. Only a cache miss enters the deduped loader.
  if (appSecretLoaded && Date.now() < appSecretExpiry) return;
  return loadAppSecretOnce(maxRetries);
}

// Load tool catalog and tier1
const catalogRaw = JSON.parse(fs.readFileSync('/app/generated-tools.json', 'utf8'));
const allToolDefs = catalogRaw.tools || [];
const tier1Names = new Set(JSON.parse(fs.readFileSync('/app/tier1.json', 'utf8')));

// Raw API registry: tool_name → {service, resource, method, risk}
const rawApiMap = new Map();
for (const entry of catalogRaw.rawApis || []) {
  const name = `lark_${entry.service}_${entry.resource.replace(/\./g, '_')}_${entry.method}`;
  rawApiMap.set(name, entry);
}

console.log(`Tool catalog: ${allToolDefs.length} shortcuts + ${rawApiMap.size} raw APIs, Tier 1: ${tier1Names.size}`);

// Scope mapping: toolName -> required scopes (generated at build time)
const toolScopeMap = buildToolScopeMap(allToolDefs);
console.log(`Scope map: ${toolScopeMap.size} tools (lark-cli ${catalogRaw._larkCliVersion}, scope-map ${catalogRaw._scopeMapVersion})`);

// Build tier1 tool schemas
const tier1Tools = [];
for (const def of allToolDefs) {
  const name = toToolName(def);
  if (!tier1Names.has(name)) continue;
  tier1Tools.push({
    name,
    description: `[${def.risk}] ${def.description}`,
    inputSchema: buildInputSchema(def),
    _def: def,
  });
}
console.log(`Tier 1 matched: ${tier1Tools.length}/${tier1Names.size}`);

// Catalog index for discover
const catalogIndex = buildCatalogIndex(allToolDefs);

const DISCOVER_TOOL = {
  name: 'lark_discover',
  description: '[read] Discover lark-cli tools not in the high-frequency set. Use when registered tools cannot fulfill the need. Provide at least one of query or category.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language or keyword, e.g. "create wiki space"' },
      category: { type: 'string', description: 'Filter by service: im, calendar, docs, base, sheets, drive, task, contact, wiki, mail, vc, minutes, okr, slides, whiteboard, markdown' },
    },
  },
};

const INVOKE_TOOL = {
  name: 'lark_invoke',
  description: '[read|write] Invoke a tool discovered via lark_discover. Pass exact tool_name and args.',
  inputSchema: {
    type: 'object',
    required: ['tool_name', 'args'],
    properties: {
      tool_name: { type: 'string', description: 'Tool name from lark_discover results' },
      args: { type: 'object', description: 'Tool arguments' },
    },
  },
};

// lark_exec_script — generic Python script executor for skill-bundled scripts
// Security: ALLOWED_SCRIPTS is frozen at startup (populated after SKILLS_DIR).
const SCRIPTS_WHITELIST_RE = /^lark-[a-z-]+\/scripts\/[a-z0-9_]+\.py$/;
const EXEC_SCRIPT_TIMEOUT_MS = 30_000;
const ALLOWED_SCRIPTS = new Set();
const EXEC_SCRIPT_TOOL = {
  name: 'lark_exec_script',
  description: '[read] Execute a Python script bundled with a lark skill. Scripts are pre-installed in the container and accept CLI arguments. Returns stdout as JSON. Use for icon search, template operations, XML validation, etc.',
  inputSchema: {
    type: 'object',
    required: ['script'],
    properties: {
      script: { type: 'string', description: 'Script path relative to skills dir, e.g. "lark-slides/scripts/iconpark_tool.py"' },
      args: { type: 'array', items: { type: 'string' }, description: 'CLI arguments to pass to the script' },
      stdin: { type: 'string', description: 'Optional string to pipe as stdin (for scripts that accept --input -)' },
    },
  },
};

function execScript(script, args, stdin, abortSignal) {
  if (!SCRIPTS_WHITELIST_RE.test(script) || !ALLOWED_SCRIPTS.has(script)) {
    return Promise.resolve({ error: 'script_not_found', message: `Script not found or not allowed: ${script}` });
  }
  return withSemaphore(() => new Promise((resolve) => {
    const scriptPath = `${SKILLS_DIR}/${script}`;
    const safeArgs = Array.isArray(args) ? args.filter(a => typeof a === 'string') : [];
    const child = execFile('python3', [scriptPath, ...safeArgs], {
      timeout: EXEC_SCRIPT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      cwd: '/tmp',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG || 'en_US.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        NO_COLOR: '1',
      },
    }, (err, stdout, stderr) => {
      activeChildren.delete(child);
      if (err) {
        const code = typeof err.code === 'number' ? err.code : err.killed ? 'TIMEOUT' : err.code;
        resolve({ error: 'exec_failed', message: stderr || err.message, exit_code: code });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ output: stdout.trim() });
      }
    });
    activeChildren.add(child);
    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  }), abortSignal);
}

// Skills — usage guides for multi-step orchestration of lark tools
const SKILLS_DIR = '/app/skills';

const skillIndex = [];
if (fs.existsSync(SKILLS_DIR)) {
  for (const dir of fs.readdirSync(SKILLS_DIR).sort()) {
    const skillPath = `${SKILLS_DIR}/${dir}/SKILL.md`;
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf8');
    skillIndex.push({
      domain: dir.replace(/^lark-/, ''),
      dir,
      description: extractSkillDescription(content, dir),
    });
  }
  console.log(`Skills loaded: ${skillIndex.length} domains`);
  // Freeze allowed script list — only scripts present at boot can be executed.
  // Prevents runtime file-write attacks (e.g. malicious file via lark_drive_download).
  for (const dir of fs.readdirSync(SKILLS_DIR)) {
    const scriptsDir = `${SKILLS_DIR}/${dir}/scripts`;
    if (!fs.existsSync(scriptsDir)) continue;
    for (const file of fs.readdirSync(scriptsDir)) {
      if (file.endsWith('.py')) ALLOWED_SCRIPTS.add(`${dir}/scripts/${file}`);
    }
  }
  if (ALLOWED_SCRIPTS.size > 0) console.log(`Exec scripts: ${ALLOWED_SCRIPTS.size} allowed`);
}

const LIST_SKILLS_TOOL = {
  name: 'lark_list_skills',
  description: 'List available domain guides. Call this first to see which domains (calendar, im, drive, etc.) have guides, then call lark_get_skill for the relevant one.',
  inputSchema: { type: 'object', properties: {} },
};

const GET_SKILL_TOOL = {
  name: 'lark_get_skill',
  description: 'Read a domain guide before calling tools in that domain. The guide specifies parameter formats, call sequences, and preconditions.',
  inputSchema: {
    type: 'object',
    required: ['domain'],
    properties: {
      domain: { type: 'string', description: 'Domain name (e.g. calendar, im, drive, base, sheets, task, doc, wiki, mail, vc, contact, slides, okr, minutes, whiteboard, markdown, approval, apps)' },
      section: { type: 'string', description: 'Specific guide section for detailed workflows and parameter reference (e.g. "schedule-meeting", "create", "upload", "search"). Omit to get the main domain overview which lists all available sections.' },
    },
  },
};

// Thin wrappers binding this process's catalog/scope state to the pure
// implementations in server-lib.js (the single source of truth, unit-tested).
const searchCatalog = (query, category) => searchCatalogLib(catalogIndex, tier1Names, query, category);
const findByName = (name) => findByNameLib(catalogIndex, name);
const patchPermissionError = (output, toolName, incrAuthToken) =>
  patchPermissionErrorLib(toolScopeMap, AUTHORIZE_BASE, output, toolName, incrAuthToken);

// Wrap a patched permission response. When the patch produced an actionable
// authorize_url, this is "needs authorization" — normal control flow asking the
// user to grant a scope, NOT a tool failure. Return isError:false so lenient
// MCP clients (e.g. Quick Suite) render the link instead of swallowing it as a
// generic "unknown error". Without authorize_url the patch only added the
// "contact the admin" fallback — that IS a dead end, keep isError:true.
function permissionResult(patched) {
  let hasAuthUrl = false;
  try { hasAuthUrl = !!JSON.parse(patched).error?.authorize_url; } catch {}
  return { content: [{ type: 'text', text: patched }], isError: !hasAuthUrl };
}

function buildReauthResponse(_incrAuthToken) {
  return JSON.stringify({
    ok: false,
    error: {
      type: 'auth',
      message: 'Feishu authorization revoked or expired.',
      user_action: 'Session expired. Ask the user to disconnect and reconnect this MCP server in their client to re-authorize with full permissions. Do not retry.',
    },
  }, null, 2);
}

// lark-cli writes diagnostic lines to stderr before the JSON error envelope
// (e.g. "Using explicit block ID: ...\nCreating local comment...\n{...}").
// Extract the JSON object so patchPermissionError/isAuthError can parse it.
function extractJson(text) {
  const idx = text.indexOf('\n{');
  if (idx >= 0) {
    const candidate = text.slice(idx + 1);
    try { JSON.parse(candidate); return candidate; } catch {}
  }
  if (text.startsWith('{')) {
    try { JSON.parse(text); return text; } catch {}
  }
  return null;
}

function isAuthError(output) {
  try {
    const data = JSON.parse(output);
    if (data.error?.type === 'auth') return true;
    if (data.error?.type === 'authentication') return true;
    return false;
  } catch {}
  return /token is expired|token is invalid/i.test(output);
}

async function executeTool(def, args, userToken, toolName, incrAuthToken, abortSignal) {
  // High-risk writes (delete, etc.) require explicit user approval. Primary
  // defense is the destructiveHint annotation surfaced via tools/list — a
  // spec-compliant MCP client will pop a confirmation UI. _confirm is layered
  // defense for clients that ignore annotations.
  if (def.risk === 'high-risk-write' && args._confirm !== true) {
    // NOT isError: this is a normal control-flow result ("stop and ask the
    // user"), not a tool failure. Flagging it isError:true makes lenient MCP
    // clients drop the content and render a generic "unknown error", hiding the
    // very instruction the agent needs to act on.
    return {
      content: [{ type: 'text', text: JSON.stringify({
        status: 'user_approval_required',
        message: 'This is a destructive operation. STOP. Ask the user to confirm in plain language (describe exactly what will be deleted/modified). Only after the user explicitly approves, re-call this tool with args._confirm=true. Do NOT silently retry.',
        tool: toolName,
        risk: def.risk,
      }) }],
      isError: false,
    };
  }

  const cliArgs = [def.service, def.command];
  for (const flag of def.flags) {
    const key = toSchemaKey(flag.name);
    const value = args[key];
    if (value === undefined || value === null || value === '') continue;
    if (flag.type === 'boolean') { if (value) cliArgs.push(`--${flag.name}`); continue; }
    // Accept both conventions for JSON parameters: string passes through,
    // object/array is stringified (String() would corrupt it to "[object
    // Object]"/comma-joins and fail deep inside lark-cli).
    const coerced = coerceFlagValue(value);
    // Validate composite payloads against the embedded --print-schema contract
    // BEFORE spawning. NOT isError (raw-API params/data precedent): a malformed
    // payload is self-correctable — isError:true makes lenient clients hide the
    // hint behind a generic "unknown error".
    const shapeError = validatePayload(coerced, def.payloadSchemas?.[flag.name]);
    if (shapeError) {
      return { content: [{ type: 'text', text: JSON.stringify({
        error: 'invalid_payload',
        parameter: key,
        tool: toolName,
        message: `args.${key} ${shapeError}`,
        hint: `Call lark_discover(query="${toolName}") for this parameter's full JSON Schema.`,
      }) }], isError: false };
    }
    cliArgs.push(`--${flag.name}`, coerced);
  }
  // lark-cli's --yes is per-command. Only inject it for commands that declare
  // it (recorded as supportsYes at build time); other high-risk-write commands
  // (e.g. delete-dimension) would treat --yes as an unknown flag and print usage.
  if (def.risk === 'high-risk-write' && def.supportsYes) cliArgs.push('--yes');

  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_PATH: process.env.NODE_PATH || '',
    LANG: process.env.LANG || 'en_US.UTF-8',
    NO_COLOR: '1',
    LARKSUITE_CLI_USER_ACCESS_TOKEN: userToken,
    LARKSUITE_CLI_APP_ID: APP_ID,
    LARKSUITE_CLI_APP_SECRET: APP_SECRET,
    LARKSUITE_CLI_BRAND: BRAND,
    LARKSUITE_CLI_DEFAULT_AS: 'user',
  };

  try {
    // Timeout kept at/under the middleware Lambda's 25s fetch budget: once the
    // client has its 504 there's no point letting lark-cli keep running and
    // holding a concurrency slot. abortSignal is also wired into execFile so a
    // client disconnect kills the child and frees the slot immediately, rather
    // than leaking it until the timeout.
    const { stdout } = await withSemaphore(() => runLarkCli(cliArgs, env, LARK_CLI_TIMEOUT_MS, abortSignal), abortSignal);
    // Strip lark-cli's `_notice.update` ("run: lark-cli update") — operator
    // guidance the agent can't act on, repeated in EVERY response until the
    // pin is bumped. Version drift stays visible in ops.sh / container logs.
    const output = stripCliNotice(stdout.trim() || '{"ok":true,"data":null}');
    const patched = patchPermissionError(output, toolName, incrAuthToken);
    if (patched !== output) {
      return permissionResult(patched);
    }
    if (isAuthError(output)) {
      return { content: [{ type: 'text', text: buildReauthResponse(incrAuthToken) }], isError: true };
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (err) {
    if (err instanceof ServerBusyError) {
      return { content: [{ type: 'text', text: '{"error":"server_busy","message":"Too many concurrent requests, retry shortly"}' }], isError: true };
    }
    if (err.message === 'client_aborted') {
      return { content: [{ type: 'text', text: '{"error":"client_aborted"}' }], isError: true };
    }
    if (err.name === 'AbortError') {
      return { content: [{ type: 'text', text: '{"error":"client_aborted"}' }], isError: true };
    }
    if (err.killed || err.signal) {
      return { content: [{ type: 'text', text: '{"error":"timeout","message":"lark-cli call exceeded the time limit"}' }], isError: true };
    }
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return { content: [{ type: 'text', text: '{"error":"output_too_large","message":"lark-cli output exceeded the buffer limit; narrow the query (e.g. pagination/filters)"}' }], isError: true };
    }
    const raw = err.stdout?.trim() || err.stderr?.trim() || err.message;
    const message = extractJson(raw) || raw;
    const patchedErr = patchPermissionError(message, toolName, incrAuthToken);
    if (patchedErr !== message) {
      return permissionResult(patchedErr);
    }
    if (isAuthError(message)) {
      return { content: [{ type: 'text', text: buildReauthResponse(incrAuthToken) }], isError: true };
    }
    // Validation errors are self-correctable: translate this tool's --flag refs
    // to MCP parameter names (allowlist = def.flags; echoed user data with --
    // sequences stays intact) and return isError:false so lenient clients
    // surface the hint instead of swallowing it as a generic "unknown error".
    const translated = translateCliError(message, def.flags.map(f => f.name));
    if (translated.selfCorrectable) {
      return { content: [{ type: 'text', text: translated.text }], isError: false };
    }
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

// Raw API pass-through: looks up tool_name in the build-time rawApiMap registry,
// then executes `lark-cli <service> <resource> <method>` with standard flags.
async function executeRawApi(toolName, args, userToken, incrAuthToken, abortSignal) {
  const entry = rawApiMap.get(toolName);
  if (!entry) {
    // NOT isError: a wrong tool name is self-correctable (call lark_discover for
    // the right one). isError:true makes lenient clients hide the hint behind a
    // generic "unknown error", so the agent retries blindly instead of fixing it.
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'unknown_tool', tool_name: toolName, hint: 'Use lark_discover(query) to find valid tool names.' }) }], isError: false };
  }

  if (entry.risk === 'high-risk-write' && args._confirm !== true) {
    // NOT isError (see executeTool): a confirmation prompt is normal control
    // flow, not a failure — isError:true makes lenient clients hide the message.
    return {
      content: [{ type: 'text', text: JSON.stringify({
        status: 'user_approval_required',
        message: 'This is a destructive operation. STOP. Ask the user to confirm in plain language. Only after explicit approval, re-call with args._confirm=true.',
        tool: toolName,
        risk: entry.risk,
      }) }],
      isError: false,
    };
  }

  // Validate --params / --data JSON BEFORE spawning lark-cli. These flags are
  // raw JSON (lark-cli: "Raw URL/query params JSON" / "JSON request body"). A
  // non-JSON string (e.g. params="user_id_type=open_id") would otherwise be
  // passed through verbatim and fail deep inside lark-cli with an opaque error
  // the client surfaces as "unknown error" — wasting the agent's debugging on a
  // self-correctable input mistake.
  for (const field of ['params', 'data']) {
    if (typeof args[field] === 'string' && args[field].trim() !== '') {
      try {
        JSON.parse(args[field]);
      } catch {
        // NOT isError: a malformed JSON arg is self-correctable (the message
        // states the right shape). isError:true makes lenient clients hide it
        // behind a generic "unknown error", defeating the whole point of the hint.
        return {
          content: [{ type: 'text', text: JSON.stringify({
            error: 'invalid_json',
            message: `args.${field} must be a JSON object (or a JSON string), not a raw "key=value" string. Example: ${field}={"user_id_type":"open_id"}.`,
            field,
            tool: toolName,
          }) }],
          isError: false,
        };
      }
    }
  }

  const cliArgs = [entry.service, entry.resource, entry.method];

  // Standard raw-API flags
  if (args.params) {
    const p = typeof args.params === 'string' ? args.params : JSON.stringify(args.params);
    cliArgs.push('--params', p);
  }
  if (args.data) {
    const d = typeof args.data === 'string' ? args.data : JSON.stringify(args.data);
    cliArgs.push('--data', d);
  }
  if (args.page_all) cliArgs.push('--page-all');
  if (args.page_limit) cliArgs.push('--page-limit', String(args.page_limit));
  if (args.format) cliArgs.push('--format', String(args.format));
  // lark-cli requires --yes to actually run a high-risk-write; without it the
  // CLI returns confirmation_required even after the agent passed _confirm=true.
  // Only inject for commands that declare --yes (recorded at build time).
  if (entry.risk === 'high-risk-write' && entry.supportsYes) cliArgs.push('--yes');

  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_PATH: process.env.NODE_PATH || '',
    LANG: process.env.LANG || 'en_US.UTF-8',
    NO_COLOR: '1',
    LARKSUITE_CLI_USER_ACCESS_TOKEN: userToken,
    LARKSUITE_CLI_APP_ID: APP_ID,
    LARKSUITE_CLI_APP_SECRET: APP_SECRET,
    LARKSUITE_CLI_BRAND: BRAND,
    LARKSUITE_CLI_DEFAULT_AS: 'user',
  };

  try {
    const { stdout } = await withSemaphore(() => runLarkCli(cliArgs, env, LARK_CLI_TIMEOUT_MS, abortSignal), abortSignal);
    // Strip lark-cli's `_notice.update` ("run: lark-cli update") — operator
    // guidance the agent can't act on, repeated in EVERY response until the
    // pin is bumped. Version drift stays visible in ops.sh / container logs.
    const output = stripCliNotice(stdout.trim() || '{"ok":true,"data":null}');
    const patched = patchPermissionError(output, toolName, incrAuthToken);
    if (patched !== output) {
      return permissionResult(patched);
    }
    if (isAuthError(output)) {
      return { content: [{ type: 'text', text: buildReauthResponse(incrAuthToken) }], isError: true };
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (err) {
    if (err instanceof ServerBusyError) {
      return { content: [{ type: 'text', text: '{"error":"server_busy","message":"Too many concurrent requests, retry shortly"}' }], isError: true };
    }
    if (err.message === 'client_aborted' || err.name === 'AbortError') {
      return { content: [{ type: 'text', text: '{"error":"client_aborted"}' }], isError: true };
    }
    if (err.killed || err.signal) {
      return { content: [{ type: 'text', text: '{"error":"timeout","message":"lark-cli call exceeded the time limit"}' }], isError: true };
    }
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return { content: [{ type: 'text', text: '{"error":"output_too_large","message":"lark-cli output exceeded the buffer limit; narrow the query (e.g. pagination/filters)"}' }], isError: true };
    }
    const raw = err.stdout?.trim() || err.stderr?.trim() || err.message;
    const message = extractJson(raw) || raw;
    const patchedErr = patchPermissionError(message, toolName, incrAuthToken);
    if (patchedErr !== message) {
      return permissionResult(patchedErr);
    }
    if (isAuthError(message)) {
      return { content: [{ type: 'text', text: buildReauthResponse(incrAuthToken) }], isError: true };
    }
    // Validation errors are self-correctable: translate the raw-API standard
    // flags to their MCP parameter names (allowlist; echoed user data with --
    // sequences stays intact) and return isError:false so lenient clients
    // surface the hint instead of swallowing it as a generic "unknown error".
    const translated = translateCliError(message, ['params', 'data', 'page-all']);
    if (translated.selfCorrectable) {
      return { content: [{ type: 'text', text: translated.text }], isError: false };
    }
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

function sseResponse(res, data) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  res.end(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((req, res) => {
  // Health check (AgentCore sends GET /ping)
  if (req.method === 'GET') {
    if (!appSecretLoaded) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"status":"Unhealthy","reason":"app_secret_not_loaded"}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Cache-Control': 'no-store' });
    res.end('');
    return;
  }

  const MAX_BODY = 1024 * 1024; // 1MB
  let body = '';
  let destroyed = false;
  req.on('data', chunk => {
    if (destroyed) return;
    body += chunk;
    if (body.length > MAX_BODY) {
      destroyed = true;
      if (!res.headersSent) { res.writeHead(413, { 'Cache-Control': 'no-store' }); res.end(); }
      req.destroy();
    }
  });
  req.on('end', () => { if (!destroyed) handleRequest(req, res, body); });
});

async function handleRequest(req, res, body) {
  // Refresh cached app secret if TTL expired (non-blocking on cache hit)
  loadAppSecret(1).catch(() => {});

  let mcpReq;
  try { mcpReq = JSON.parse(body); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"error":"invalid_json"}');
    return;
  }

  // JSON-RPC notifications carry no `id`. The spec (and MCP) forbid sending any
  // response to a notification — e.g. the mandatory notifications/initialized
  // handshake message and notifications/cancelled. Acknowledge with 202 and an
  // empty body instead of falling through to a (malformed, id-less) error frame.
  if (mcpReq && typeof mcpReq === 'object' && !Array.isArray(mcpReq) && !('id' in mcpReq)) {
    res.writeHead(202, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  // Propagate a GENUINE client disconnect into the semaphore queue. The
  // REQUEST's 'close' event fires as soon as the request body is fully received
  // (BEFORE we write the response), so listening there would cancel every
  // queued request the moment its body arrived — a spurious client_aborted for
  // anything waiting on a concurrency slot. The RESPONSE's 'close' is the right
  // signal: it fires when the response is done OR the socket dies early; only
  // the latter (response not yet finished) is a real disconnect worth aborting.
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });

  // Extract user token and incremental-auth token from headers
  const userToken = req.headers['x-user-access-token'] || '';
  const incrAuthToken = req.headers['x-incr-auth-token'] || '';

  // initialize
  if (mcpReq.method === 'initialize') {
    sseResponse(res, {
      jsonrpc: '2.0', id: mcpReq.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'lark-mcp-on-agentcore', version: '1.0.0', larkCliVersion: catalogRaw._larkCliVersion },
        instructions: [
          'WORKFLOW: call lark_list_skills → pick the domain matching user intent → call lark_get_skill(domain) to read the guide → then call tools following the guide. Do not skip the guide — it contains required parameter formats and call sequences.',
          'DISCOVERY: 28 high-frequency tools are directly available. For anything else, use lark_discover(query) to find the tool, then lark_invoke(tool_name, args) to call it.',
          'PERMISSION ERROR: when a tool returns authorize_url, STOP immediately. Show the user a clickable link: "This action needs additional permission — please open: <url>". Do NOT retry or call other tools until the user confirms authorization is complete.',
          'LANGUAGE: respond in the same language the user writes in.',
        ].join('\n'),
      },
    });
    return;
  }

  // tools/list — emit MCP annotations so spec-compliant clients (Quick Desktop,
  // Kiro, etc.) render an explicit user-approval UI for destructive tools
  // instead of relying on the LLM to honor _confirm semantics.
  if (mcpReq.method === 'tools/list') {
    const tools = [
      ...tier1Tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: toolAnnotations(t._def),
      })),
      { ...DISCOVER_TOOL, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
      { ...INVOKE_TOOL, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } },
      ...(ALLOWED_SCRIPTS.size > 0 ? [{ ...EXEC_SCRIPT_TOOL, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }] : []),
      ...(skillIndex.length > 0 ? [
        { ...LIST_SKILLS_TOOL, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
        { ...GET_SKILL_TOOL, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ] : []),
    ];
    sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { tools } });
    return;
  }

  // tools/call
  if (mcpReq.method === 'tools/call') {
    if (!appSecretLoaded) {
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: '{"error":"server_initializing","message":"App secret not loaded yet, retry shortly"}' }], isError: true } });
      return;
    }
    const toolName = mcpReq.params?.name || '';
    const toolArgs = mcpReq.params?.arguments || {};

    // lark_list_skills
    if (toolName === 'lark_list_skills') {
      const output = skillIndex.map(s => ({ domain: s.domain, description: s.description }));
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: JSON.stringify({ skills: output }) }] } });
      return;
    }

    // lark_get_skill
    if (toolName === 'lark_get_skill') {
      const domain = toolArgs.domain || '';
      const section = toolArgs.section || '';
      // Alias-aware lookup: accepts the docs→doc service-name guess (agents
      // derive the domain from lark_docs_* tool names). The three correction
      // responses below are NOT isError: the fix is in the payload (available
      // lists the right names) and isError:true makes lenient clients hide it
      // behind a generic "unknown error" — same convention as unknown_tool.
      const entry = resolveSkillDomain(skillIndex, domain);
      if (!entry) {
        sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: JSON.stringify({ error: 'unknown_domain', domain, available: skillIndex.map(s => s.domain) }) }], isError: false } });
        return;
      }
      const skillDir = `${SKILLS_DIR}/${entry.dir}`;

      let content;
      if (section) {
        if (isUnsafeSection(section)) {
          sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: JSON.stringify({ error: 'invalid_section', message: 'section must not contain .. or backslash' }) }], isError: false } });
          return;
        }
        // Resolve markdown (no extension) or a text asset (.html/.txt/.csv, with
        // extension + relative path). See skill-sections.js for the search order.
        const filePath = resolveSection(skillDir, entry.domain, section);
        if (!filePath) {
          sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: JSON.stringify({ error: 'unknown_section', section, available: listAllSections(skillDir) }) }], isError: false } });
          return;
        }
        content = fs.readFileSync(filePath, 'utf8');
      } else {
        content = fs.readFileSync(`${skillDir}/SKILL.md`, 'utf8');
        const allSections = listAllSections(skillDir);
        if (allSections.length > 0) {
          content += `\n\n---\nAvailable sections (use section parameter to fetch): ${allSections.join(', ')}`;
        }
      }
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: content }] } });
      return;
    }

    // lark_exec_script
    if (toolName === 'lark_exec_script') {
      const result = await execScript(toolArgs.script, toolArgs.args, toolArgs.stdin, ac.signal);
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
      return;
    }

    // lark_discover
    if (toolName === 'lark_discover') {
      // Exact-name query = the agent's self-correction pattern (a call failed,
      // it re-queries THAT tool for the real contract) → include the embedded
      // --print-schema payload contracts. Broad searches only advertise their
      // existence (has_payload_schemas): the schemas run up to ~70KB and would
      // bury a 20-result list.
      //
      // The exact match MUST be placed explicitly: searchCatalog splits the
      // query on whitespace, so a full tool name is a single token whose
      // "lark" prefix matches every tool — fuzzy scoring ties across the
      // catalog and the true match routinely falls outside top-20.
      const exact = findByName(toolArgs.query);
      let results = searchCatalog(toolArgs.query, toolArgs.category);
      if (exact && !results.includes(exact)) results = [exact, ...results.slice(0, 19)];
      const output = results.map(e => ({
        name: e.name,
        description: `[${e.def.risk}] ${e.def.description}`,
        category: e.def.service,
        inputSchema: buildInputSchema(e.def),
        annotations: toolAnnotations(e.def),
        ...(e.def.payloadSchemas && (exact === e
          ? { payload_schemas: e.def.payloadSchemas }
          : { has_payload_schemas: true })),
      }));
      // Also search raw APIs by dotted query (e.g. "drive.file.comments.list")
      const q = (toolArgs.query || '').toLowerCase();
      const cat = (toolArgs.category || '').toLowerCase();
      for (const [name, entry] of rawApiMap) {
        if (output.length >= 20) break;
        const dottedPath = `${entry.service}.${entry.resource}.${entry.method}`;
        if ((q && (dottedPath.includes(q) || name.includes(q.replace(/\./g, '_')))) ||
            (cat && entry.service === cat)) {
          output.push({
            name,
            description: `[${entry.risk}] ${entry.description}`,
            category: entry.service,
            inputSchema: { type: 'object', properties: { params: { type: 'string' }, data: { type: 'string' }, page_all: { type: 'boolean' } } },
          });
        }
      }
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: JSON.stringify({ tools: output }) }] } });
      return;
    }

    // lark_invoke
    if (toolName === 'lark_invoke') {
      const realName = toolArgs.tool_name;
      const realArgs = toolArgs.args || {};
      if (!userToken) {
        sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: '{"error":"no user token"}' }], isError: true } });
        return;
      }
      const entry = findByName(realName);
      if (entry) {
        const result = await executeTool(entry.def, realArgs, userToken, realName, incrAuthToken, ac.signal);
        sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result });
        return;
      }
      // Fallback: raw API pass-through. tool_name lark_<svc>_<res...>_<method>
      // maps to `lark-cli <svc> <res...> <method> --params '...' --data '...'`.
      const result = await executeRawApi(realName, realArgs, userToken, incrAuthToken, ac.signal);
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result });
      return;
    }

    // Tier 1 direct call
    const tool = tier1Tools.find(t => t.name === toolName);
    if (tool) {
      if (!userToken) {
        sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result: { content: [{ type: 'text', text: '{"error":"no user token"}' }], isError: true } });
        return;
      }
      const result = await executeTool(tool._def, toolArgs, userToken, toolName, incrAuthToken, ac.signal);
      sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, result });
      return;
    }

    sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, error: { code: -32601, message: `Unknown tool: ${toolName}` } });
    return;
  }

  // Other methods
  sseResponse(res, { jsonrpc: '2.0', id: mcpReq.id, error: { code: -32601, message: 'Method not found' } });
}

let shuttingDown = false;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`lark-mcp-on-agentcore listening on :${PORT} (${tier1Tools.length} tier1 + ${allToolDefs.length} discoverable)`);
  loadAppSecret().catch(e => {
    // If a graceful shutdown is already in progress, don't let the secret-load
    // give-up race it and exit(1) — the shutdown handler owns the exit code.
    if (shuttingDown) return;
    console.error(JSON.stringify({ level: 'CRITICAL', event: 'app_secret_load_giveup', error: e.message }));
    process.exit(1);
  });
});
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'INFO', event: 'shutdown_start', signal, active_children: activeChildren.size }));

  server.close();
  await new Promise(r => setTimeout(r, 5000));

  for (const child of activeChildren) { try { child.kill('SIGTERM'); } catch {} }
  await new Promise(r => setTimeout(r, 2000));
  for (const child of activeChildren) { try { child.kill('SIGKILL'); } catch {} }

  console.log(JSON.stringify({ level: 'INFO', event: 'shutdown_complete' }));
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

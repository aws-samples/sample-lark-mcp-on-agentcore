#!/usr/bin/env node
// Generates tool definitions from lark-cli at Docker build time.
// Mirrors the logic of lark-cli-mcp-wrapper/src/generate.ts

const { execFileSync } = require('child_process');
const fs = require('fs');
const { parseFlags, detectRisk, parseShortcuts, translateFlagDescription } = require('./generate-tools-lib');

const OUTPUT = '/app/generated-tools.json';
const SCOPES_FILE = '/app/shortcut-scopes.json';

const BUILD_ENV = {
  ...process.env,
  NO_COLOR: '1',
  LARKSUITE_CLI_APP_ID: process.env.LARKSUITE_CLI_APP_ID || 'build',
  LARKSUITE_CLI_APP_SECRET: process.env.LARKSUITE_CLI_APP_SECRET || 'build',
  LARKSUITE_CLI_USER_ACCESS_TOKEN: process.env.LARKSUITE_CLI_USER_ACCESS_TOKEN || 'build',
  LARKSUITE_CLI_BRAND: process.env.LARKSUITE_CLI_BRAND || 'feishu',
};

function run(cmd, ...args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 15000, env: BUILD_ENV, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return ''; }
}

function getVersion() {
  const output = run('lark-cli', '--version');
  const match = output.match(/[\d.]+/);
  return match ? match[0] : 'unknown';
}

function discoverServices() {
  const help = run('lark-cli', '--help');
  const services = [];
  const skipServices = new Set(['api', 'auth', 'config', 'doctor', 'help', 'profile', 'schema', 'update', 'event', 'skill']);
  for (const line of help.split('\n')) {
    const m = line.match(/^\s{2,4}(\w+)\s/);
    if (m && !skipServices.has(m[1])) services.push(m[1]);
  }
  return services;
}

function discoverShortcuts(service, knownNoPlus) {
  const help = run('lark-cli', service, '--help');
  // parseShortcuts captures +cmd shortcuts plus the no-plus shortcuts listed in
  // knownNoPlus (e.g. docs resource-* added in lark-cli 1.0.55). Raw-API resource
  // groups (also no-plus) are excluded. See generate-tools-lib.js.
  return { shortcuts: parseShortcuts(help, knownNoPlus), help };
}

// Load scope mapping from source-extracted data
let scopeMap = {};
let scopeMapVersion = 'unknown';
// Per-service sets of no-plus shortcut commands (e.g. docs resource-*), taken from
// shortcut-scopes.json — the authoritative upstream-extracted shortcut list. Used
// to admit no-plus shortcuts while excluding no-plus raw-API resource groups.
const noPlusShortcuts = {};
if (fs.existsSync(SCOPES_FILE)) {
  const raw = JSON.parse(fs.readFileSync(SCOPES_FILE, 'utf8'));
  const scopeData = raw.shortcuts || raw;
  if (raw._meta) scopeMapVersion = raw._meta.lark_cli_version || 'unknown';
  for (const entry of scopeData) {
    const key = `${entry.service}:${entry.command}`;
    scopeMap[key] = entry.scopes || [];
    if (!entry.command.startsWith('+')) {
      (noPlusShortcuts[entry.service] ||= new Set()).add(entry.command);
    }
  }
  console.log(`Scope map loaded: ${Object.keys(scopeMap).length} entries (lark-cli ${scopeMapVersion})`);
}

console.log('Generating tool catalog from lark-cli...');
const version = getVersion();
console.log(`lark-cli version: ${version}`);

const services = discoverServices();
console.log(`Found ${services.length} services`);

// Extract the machine-readable JSON Schemas lark-cli embeds for composite
// flags. `--print-schema` (no flag-name) lists the introspectable flags;
// `--print-schema --flag-name <f>` dumps that flag's full JSON Schema (payload
// dimensionality, per-field types, enums). These are the authoritative payload
// contracts — the prose description alone reliably loses the shape (e.g. the
// 2D [[{cell}]] requirement) by the time an agent reads it.
function extractPayloadSchemas(service, command) {
  const listRaw = run('lark-cli', service, command, '--print-schema');
  let flagNames;
  try { flagNames = JSON.parse(listRaw).introspectable_flags || []; } catch { return undefined; }
  const schemas = {};
  for (const flagName of flagNames) {
    const schemaRaw = run('lark-cli', service, command, '--print-schema', '--flag-name', flagName);
    try { schemas[flagName] = JSON.parse(schemaRaw); } catch { /* skip unparseable */ }
  }
  return Object.keys(schemas).length > 0 ? schemas : undefined;
}

const tools = [];
let scopeMapped = 0;
let schemaExtracted = 0;
for (const service of services) {
  const { shortcuts } = discoverShortcuts(service, noPlusShortcuts[service] || new Set());
  for (const { command, description } of shortcuts) {
    const cmdHelp = run('lark-cli', service, command, '--help');
    const { flags, supportsYes, supportsPrintSchema } = parseFlags(cmdHelp);
    // Translate CLI-speak out of every agent-facing description (@file/stdin
    // hints, --flag refs, lark-cli advice) — agents can't run terminal commands.
    for (const f of flags) f.description = translateFlagDescription(f.description);
    const risk = detectRisk(cmdHelp, command);
    const scopes = scopeMap[`${service}:${command}`] || [];
    if (scopes.length > 0) scopeMapped++;
    const payloadSchemas = supportsPrintSchema ? extractPayloadSchemas(service, command) : undefined;
    if (payloadSchemas) schemaExtracted += Object.keys(payloadSchemas).length;
    tools.push({ service, command, description: translateFlagDescription(description), risk, flags, ...(supportsYes && { supportsYes: true }), ...(scopes.length > 0 && { scopes }), ...(payloadSchemas && { payloadSchemas }) });
  }
}
console.log(`Payload schemas extracted: ${schemaExtracted} composite flags`);

// Parse cobra subcommand names from a "--help" output. Only lines inside the
// "Available Commands:" section count — cobra prefixes service/resource help
// with free-form prose ("Start here (required for AI agents): ...") that is also
// 2-space indented and would otherwise be misparsed as command names.
function parseSubcommands(help, { allowPlus = false } = {}) {
  const names = [];
  let inSection = false;
  for (const line of help.split('\n')) {
    if (/^[A-Za-z].*:\s*$/.test(line)) { // section header like "Available Commands:"
      inSection = /^Available Commands:/.test(line);
      continue;
    }
    if (!inSection) continue;
    if (/^\s*$/.test(line)) { inSection = false; continue; } // blank line ends section
    const m = line.match(/^\s{2,4}(\+?[a-z][a-z0-9_.-]*)\s+(.+)/);
    if (!m) continue;
    if (!allowPlus && m[1].startsWith('+')) continue;
    if (allowPlus && !m[1].startsWith('+')) continue;
    names.push({ name: m[1], description: m[2].trim() });
  }
  return names;
}

// Discover raw API commands (non-shortcut service subcommands).
// These are registered so lark_invoke can execute them directly.
const rawApis = [];
for (const service of services) {
  const svcHelp = run('lark-cli', service, '--help');
  const resources = parseSubcommands(svcHelp).map(r => r.name);
  for (const resource of resources) {
    const resHelp = run('lark-cli', service, resource, '--help');
    for (const { name: method, description } of parseSubcommands(resHelp)) {
      const cmdHelp = run('lark-cli', service, resource, method, '--help');
      const risk = detectRisk(cmdHelp, method);
      const { supportsYes } = parseFlags(cmdHelp);
      rawApis.push({ service, resource, method, description, risk, ...(supportsYes && { supportsYes: true }) });
    }
  }
}
console.log(`Found ${rawApis.length} raw API commands`);

const output = { _larkCliVersion: version, _scopeMapVersion: scopeMapVersion, tools, rawApis };
fs.writeFileSync(OUTPUT, JSON.stringify(output));
console.log(`Saved ${tools.length} shortcuts + ${rawApis.length} raw APIs to ${OUTPUT} (${scopeMapped} with scope info)`);

const unmapped = tools.length - scopeMapped;
if (unmapped > 5) {
  console.warn(`\n⚠ WARNING: ${unmapped} tools have no scope mapping. Incremental authorization will not work for these tools.`);
  console.warn(`  This usually means lark-cli has added new commands not covered by shortcut-scopes.json (built for ${scopeMapVersion}).`);
  console.warn(`  To fix: pin lark-cli to the tested version in Dockerfile:`);
  console.warn(`    ARG LARK_CLI_VERSION=${scopeMapVersion}`);
  console.warn(`  Or open an issue on the project repository for an updated scope map.\n`);
}


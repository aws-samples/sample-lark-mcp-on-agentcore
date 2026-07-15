// Pure parsing/classification helpers for the build-time tool-catalog generator.
//
// Extracted from generate-tools.js so they can be unit-tested directly:
// generate-tools.js runs top-level code (spawns lark-cli, writes files) on
// require, so it cannot be imported in tests. Keeping these side-effect-free
// functions here is the single source of truth — tests import this module, the
// generator requires it, and the two can never drift.

// Flags hidden from the LLM-facing schema:
// - yes / dry-run / jq: lark-cli wrapper concerns, not user intent.
//   server.js adds --yes itself when needed (gated by supportsYes).
// - print-schema / flag-name: build-time introspection controls — the generator
//   drives them itself to extract composite-flag JSON Schemas (surfaced as
//   supportsPrintSchema), so they are never user intent at runtime.
const HIDDEN_FLAGS = new Set(['yes', 'dry-run', 'jq', 'print-schema', 'flag-name']);

// cobra renders a value flag as `--name <type-token>   <description>` and a
// boolean as `--name   <description>` with NO token. The two gaps differ: the
// name→token gap is a single space, the token→description gap is 2+ spaces of
// alignment padding. `parseFlags`'s greedy `\s+` collapses the name→token gap,
// but the token→description gap survives at the START of `rest` — so leading
// text up to the first 2+ space run is the TYPE TOKEN (the flag takes a value),
// and the absence of any 2+ space run means the flag is a boolean switch. We do
// NOT whitelist the token: lark-cli >=1.0.60 renders composite/JSON flags with
// an EXAMPLE as the token (`+table-put`, `[["alice",95]]`, `A1:Z200`,
// `{ top: {...}, bottom: ... }`, `[{"column":"x"}, ...]`) rather than the bare
// word `string`; a whitelist misread those as boolean and server.js dropped
// their JSON payload. The example may contain INTERNAL single spaces, so the
// token runs up to the first 2+ space gap, not the first space. Only NUMBER
// tokens need recognizing; every other value-taking flag is a string.
const NUMBER_TYPE_TOKENS = new Set(['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'float32', 'float64', 'count']);

// Resolve a flag's JSON-schema type from the text following its name (`rest`).
// The type token is everything up to the first 2+ space description gap: NUMBER
// tokens → number, anything else → string (covers real type tokens like
// `string`/`duration`, single- and multi-word example tokens, and the XOR
// `--other-flag` mutual-exclusivity hint). No 2+ space gap → cobra omitted the
// token → boolean switch.
//
// EXCEPT boolean-shaped tokens: lark-cli 1.0.69 renders SOME booleans WITH a
// token — the default value (`--skip-hidden false`) or a negation hint
// (`--highlight --highlight=false`). A bare `true`/`false` token, or a
// `--x=true/false` token, is a boolean switch, not a value flag; treating it
// as string made server.js emit `--skip-hidden true`, which lark-cli rejects
// as an unexpected positional arg.
function flagTypeFromRest(rest) {
  const token = rest.match(/^(.+?)\s{2,}/)?.[1];
  if (!token) return 'boolean';
  if (token === 'true' || token === 'false') return 'boolean';
  if (/^--\S+=(true|false)$/.test(token)) return 'boolean';
  if (NUMBER_TYPE_TOKENS.has(token)) return 'number';
  return 'string';
}

function parseFlags(helpText) {
  const flags = [];
  let supportsYes = false;
  let supportsPrintSchema = false;
  const lines = helpText.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s+--(\S+)\s+(.+)/);
    if (!m) continue;
    const [, rawName, rest] = m;
    const name = rawName;
    if (name.includes(' ')) continue;
    if (name === 'yes') { supportsYes = true; continue; }
    if (name === 'print-schema') { supportsPrintSchema = true; continue; }
    if (HIDDEN_FLAGS.has(name)) continue;
    let type = flagTypeFromRest(rest);
    // A `(default false)` / `(default: false)` annotation is an explicit
    // boolean signal even if some other leading token were present. lark-cli
    // 1.0.69 renders the colon-less form; keep both. A quoted default like
    // (default "json") is a string default, NOT a boolean — hence the bare
    // true/false requirement.
    if (/\(default:? (false|true)\)/i.test(rest)) type = 'boolean';
    const required = rest.includes('(required)');
    const enumMatch = rest.match(/\(enum:\s*([^)]+)\)/);
    const enumValues = enumMatch ? enumMatch[1].split(',').map(s => s.trim()) : undefined;
    const description = rest.replace(/\s*\(required\)/, '').replace(/\s*\(default:[^)]+\)/, '').replace(/\s*\(enum:[^)]+\)/, '').trim();
    flags.push({ name, type, description, required, ...(enumValues && { enum: enumValues }) });
  }
  return { flags, supportsYes, supportsPrintSchema };
}

// `--help` descriptions speak CLI: @file/stdin hints, `--kebab-flag` references,
// "run --print-schema" advice. MCP agents cannot run terminal commands or read
// local files — that prose is pure noise that buries what they DO need (the
// payload shape), and it's exactly what an agent skims past when it misses the
// real contract. The skills layer already enforces zero CLI leakage in
// actionable text (adapt-skill-for-mcp rules + skill-quality test); this
// extends the same invariant to the catalog path. Payload literals like
// {"shortcut":"+xxx-yyy"} are kept — there `+name` is data, not CLI usage.
function translateFlagDescription(desc) {
  let out = desc;
  // "(supports @file, - reads stdin ...)" / "(supports - reads stdin ...)"
  // — allows one level of nested parens inside the hint.
  out = out.replace(/\s*\(supports (?:@file|- reads stdin)(?:[^()]|\([^()]*\))*\)/g, '');
  // "; supports @file or -" tails (no parens)
  out = out.replace(/;?\s*supports @file[^.;)]*/gi, '');
  // inline "or @file" alternatives ("filter JSON object or @file, ...")
  out = out.replace(/\s+or @file/gi, '');
  // "run `--print-schema` for the full structure" → point at the embedded
  // schema. Consume a leading connector (`;`, `—`, `-`) so "Deeply nested —
  // run …" doesn't leave a dangling dash before the replacement.
  out = out.replace(/[;—–-]?\s*run\s+`?--print-schema`?[^.;]*/gi, '; full structure is in this tool\'s payload_schema (fetch via lark_discover with the exact tool name)');
  // "For basic flags use lark-cli <svc> <shortcut> --help; ... use --print-schema --flag-name <flag>."
  out = out.replace(/For basic flags use lark-cli[^.;]*[.;]?\s*/gi, '');
  out = out.replace(/for composite JSON flags use\s+--print-schema[^.;]*[.;]?\s*/gi, 'composite JSON flag structures are in this tool\'s payload_schema (fetch via lark_discover with the exact tool name). ');
  // "lark-cli skills read <domain> <path>" advice → the MCP skill tool. The
  // path arg maps to lark_get_skill(domain, section) — domain drops the lark-
  // prefix; the section is the reference file path without the .md extension.
  out = out.replace(/lark-cli skills read\s+lark-([a-z-]+)\s+(\S+?)(?:\.md)?([\s.,;)]|$)/g, 'lark_get_skill(domain="$1", section="$2")$3');
  out = out.replace(/lark-cli skills read\s+lark-([a-z-]+)/g, 'lark_get_skill(domain="$1")');
  // Prose citing an equivalent lark-cli command ("the equivalent `lark-cli ...`
  // writes to cwd") — CLI-only context, drop the sentence. Quoted data literals
  // like (default "created by lark-cli") are NOT sentences and don't match.
  out = out.replace(/[^.;]*`lark-cli [^`]*`[^.;]*[.;]?/g, '');
  // Any residual bare `--flag` reference → the snake_case MCP parameter name.
  // Only match CLI-style references (start-of-word, letters/hyphens), never
  // inside payload literals (those are quoted strings, no leading --).
  out = out.replace(/(^|[\s(`])--([a-z][a-z0-9-]*)/g, (_, pre, flag) => `${pre}${flag.replace(/-/g, '_')}`);
  return out.replace(/\s{2,}/g, ' ').trim();
}

// Parse a service's `lark-cli <service> --help` output for its shortcut commands.
// "Available Commands:" mixes three line shapes:
//   `+cmd`              — classic shortcuts (always real tools)
//   `resource-x`        — no-plus shortcuts (lark-cli 1.0.55 docs resource-*)
//   `user_mailbox.msgs` — no-plus RAW-API resource groups; NOT shortcuts (the
//                         raw-API loop descends into these for lark_invoke)
// `+cmd` lines are always shortcuts. A no-plus line is a shortcut ONLY when it is
// in `knownNoPlus` — the set of no-plus shortcut commands for this service taken
// from shortcut-scopes.json (extracted from upstream source, the authoritative
// list). Without that gate, raw-API resource groups would be mis-registered as
// broken leaf shortcuts. Both real forms are routable: server.js passes
// def.command verbatim and toToolName strips an optional leading '+'.
// Only lines inside the section count: cobra wraps service help with 2-space-
// indented prose ("Start here ...") that would otherwise be misparsed, and the
// Flags: block (`-h, --help`) must be skipped. A blank line ends the section.
function parseShortcuts(helpText, knownNoPlus = new Set()) {
  const shortcuts = [];
  let inSection = false;
  for (const line of helpText.split('\n')) {
    if (/^[A-Za-z].*:\s*$/.test(line)) { // section header like "Available Commands:"
      inSection = /^Available Commands:/.test(line);
      continue;
    }
    if (!inSection) continue;
    if (/^\s*$/.test(line)) { inSection = false; continue; } // blank line ends section
    // command token: a +shortcut, or a lowercase no-plus command (letters, digits,
    // hyphens, dots). Excludes flag lines like `-h, --help` (start with '-').
    const m = line.match(/^\s{2,4}(\+[a-z][a-z0-9_.-]*|[a-z][a-z0-9_.-]*)\s+(.+)/);
    if (!m) continue;
    const command = m[1];
    if (!command.startsWith('+') && !knownNoPlus.has(command)) continue;
    shortcuts.push({ command, description: m[2].trim() });
  }
  return shortcuts;
}

// Section headers of the per-command "affordance" guidance block that lark-cli
// (since 1.0.60) renders INTO `--help` output, below the authoritative `Risk:`
// line. Its free prose ("unlike risk: write commands…", "Avoid when … this is
// destructive") would poison a naive whole-text substring scan, so risk
// detection must ignore it: match the Risk line at line-start, and apply the
// keyword fallback only to the text ABOVE the first affordance header.
const AFFORDANCE_SECTION_RE = /\n(?=(?:When to use|Avoid when|Prerequisites|Tips|Examples):)/;

function detectRisk(helpText, commandName) {
  // Authoritative signal: lark-cli emits a `Risk:` line per command. Anchor to
  // line-start and return on first hit so affordance prose that merely *mentions*
  // "risk: write" cannot override (or downgrade) the real classification.
  for (const line of helpText.split('\n')) {
    const m = line.match(/^\s*Risk:\s*(high-risk-write|write|read)\b/i);
    if (m) return m[1].toLowerCase();
  }
  // Fallback (no Risk line): name/keyword heuristics, scanning only the text
  // before the affordance block so its prose can't trip the `destructive` keyword.
  const lower = helpText.split(AFFORDANCE_SECTION_RE)[0].toLowerCase();
  if (lower.includes('destructive') || commandName.includes('delete') || commandName.includes('remove')) return 'high-risk-write';
  if (commandName.includes('create') || commandName.includes('send') || commandName.includes('update') || commandName.includes('patch')) return 'write';
  return 'read';
}

module.exports = { parseFlags, detectRisk, parseShortcuts, translateFlagDescription };

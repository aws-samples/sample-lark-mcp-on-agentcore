import { describe, it, expect } from 'vitest';
// Import the REAL helpers (generate-tools.js itself runs top-level code on
// require — spawns lark-cli, writes files — so the pure functions live in
// generate-tools-lib.js and the generator requires them. Single source of truth.)
import { detectRisk, parseFlags, parseShortcuts, translateFlagDescription } from '../generate-tools-lib.js';

describe('detectRisk', () => {
  it('detects "Risk: write" from help text', () => {
    const help = 'Upload a local file to Drive\n\nUsage:\n  lark-cli drive +upload [flags]\n\nRisk: write';
    expect(detectRisk(help, '+upload')).toBe('write');
  });

  it('detects "Risk: read" from help text', () => {
    const help = 'View calendar agenda\n\nRisk: read';
    expect(detectRisk(help, '+agenda')).toBe('read');
  });

  it('detects "Risk: high-risk-write" from help text', () => {
    const help = 'Delete a group chat permanently\n\nRisk: high-risk-write';
    expect(detectRisk(help, '+chat-delete')).toBe('high-risk-write');
  });

  it('prefers explicit Risk line over command name heuristic', () => {
    // Command name says "create" (heuristic → write) but help says "read"
    const help = 'Create a read-only view\n\nRisk: read';
    expect(detectRisk(help, '+create-view')).toBe('read');
  });

  it('falls back to command name heuristic when no Risk line', () => {
    expect(detectRisk('some help text', '+create')).toBe('write');
    expect(detectRisk('some help text', '+send')).toBe('write');
    expect(detectRisk('some help text', '+update')).toBe('write');
    expect(detectRisk('some help text', '+patch')).toBe('write');
    expect(detectRisk('some help text', '+delete')).toBe('high-risk-write');
    expect(detectRisk('some help text', '+remove')).toBe('high-risk-write');
  });

  it('defaults to read when no Risk line and no heuristic match', () => {
    expect(detectRisk('some help text', '+list')).toBe('read');
    expect(detectRisk('some help text', '+search')).toBe('read');
    expect(detectRisk('some help text', '+get')).toBe('read');
  });

  it('handles "destructive" keyword in help text', () => {
    const help = 'This is a destructive operation.';
    expect(detectRisk(help, '+some-cmd')).toBe('high-risk-write');
  });

  it('case-insensitive match for Risk line', () => {
    expect(detectRisk('RISK: WRITE', '+foo')).toBe('write');
    expect(detectRisk('risk: HIGH-RISK-WRITE', '+foo')).toBe('high-risk-write');
  });

  // Regression: lark-cli >=1.0.60 renders a per-command "affordance" guidance
  // block (When to use / Avoid when / Tips / Examples) INTO --help, below the
  // Risk line. Its free prose must NOT poison risk detection — a whole-text
  // substring scan misclassified all of these.
  describe('affordance block does not poison risk detection', () => {
    it('keeps authoritative read when Tips prose mentions "risk: write"', () => {
      const help = [
        'Bulk-fetch user status.',
        '',
        'Risk: read',
        '',
        'When to use:',
        '  • Bulk-fetch status for ids you already have.',
        '',
        'Tips:',
        '  • unlike risk: write commands, this never mutates state',
      ].join('\n');
      expect(detectRisk(help, 'batch_query')).toBe('read');
    });

    it('keeps authoritative read when "Avoid when" prose mentions "destructive"', () => {
      const help = [
        'Read something.',
        '',
        'Risk: read',
        '',
        'Avoid when:',
        '  • This is not destructive; to delete use [[xxx delete]]',
      ].join('\n');
      expect(detectRisk(help, 'get')).toBe('read');
    });

    it('does not downgrade authoritative high-risk-write when Tips mention "risk: read"', () => {
      const help = [
        'Delete a resource permanently.',
        '',
        'Risk: high-risk-write',
        '',
        'Tips:',
        '  • safer than a risk: read preview — double-check the id first',
      ].join('\n');
      expect(detectRisk(help, 'remove_thing')).toBe('high-risk-write');
    });

    it('keyword fallback ignores affordance prose when no Risk line', () => {
      // No authoritative Risk line; "destructive" only appears inside the
      // affordance block, so the read-shaped command must stay read.
      const help = [
        'List the items.',
        '',
        'Avoid when:',
        '  • Bulk destructive cleanup → use [[items purge]]',
      ].join('\n');
      expect(detectRisk(help, '+list-items')).toBe('read');
    });

    it('keyword fallback still fires for "destructive" in the real description', () => {
      // Above any affordance header → genuine signal, must still escalate.
      const help = 'This is a destructive operation that wipes the table.\n\nTips:\n  • irreversible';
      expect(detectRisk(help, '+some-cmd')).toBe('high-risk-write');
    });
  });

  // Regression: these were previously misdetected as "read"
  it('correctly detects write for drive +upload', () => {
    const help = 'Upload a local file to Drive\n\nUsage:\n  lark-cli drive +upload [flags]\n\nFlags:\n      --file string\n\nRisk: write';
    expect(detectRisk(help, '+upload')).toBe('write');
  });

  it('correctly detects write for sheets +write', () => {
    const help = 'Write to spreadsheet cells\n\nRisk: write';
    expect(detectRisk(help, '+write')).toBe('write');
  });

  it('correctly detects write for task +complete', () => {
    const help = 'Mark a task as complete\n\nRisk: write';
    expect(detectRisk(help, '+complete')).toBe('write');
  });
});

describe('parseFlags', () => {
  it('parses a required string flag', () => {
    const { flags, supportsYes } = parseFlags('Flags:\n      --chat-id string   Target chat ID (required)');
    expect(supportsYes).toBe(false);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ name: 'chat-id', type: 'string', required: true });
    // Characterization: lark-cli help puts the type token before the description, and the
    // parser keeps it in the description text. Locking in current shipped behavior.
    expect(flags[0].description).toBe('string   Target chat ID');
    expect(flags[0].enum).toBeUndefined();
  });

  it('detects a boolean flag from (default: false/true)', () => {
    const { flags } = parseFlags('Flags:\n      --page-all   Fetch all pages (default: false)');
    expect(flags[0]).toEqual({ name: 'page-all', type: 'boolean', description: 'Fetch all pages', required: false });
  });

  it('extracts enum values and strips the (enum: ...) annotation from the description', () => {
    const { flags } = parseFlags('Flags:\n      --format string   Output format (enum: json,csv,yaml)');
    expect(flags[0].enum).toEqual(['json', 'csv', 'yaml']);
    expect(flags[0].description).toBe('string   Output format');
  });

  it('treats --yes as supportsYes and excludes it from flags', () => {
    const { flags, supportsYes } = parseFlags('Flags:\n      --yes   Skip confirmation\n      --summary string   Title');
    expect(supportsYes).toBe(true);
    expect(flags.map(f => f.name)).toEqual(['summary']);
  });

  it('drops hidden flags (dry-run, jq) but keeps others', () => {
    const { flags } = parseFlags('Flags:\n      --dry-run   preview\n      --jq string   filter\n      --keep string   z');
    expect(flags.map(f => f.name)).toEqual(['keep']);
  });

  it('strips (required), (default:), and (enum:) annotations together', () => {
    const { flags } = parseFlags('Flags:\n      --mode string   The mode (required) (default: a) (enum: a,b)');
    expect(flags[0]).toMatchObject({ name: 'mode', required: true, enum: ['a', 'b'] });
    expect(flags[0].description).toBe('string   The mode');
  });

  // Regression: cobra boolean flags render with NO type token and NO default
  // annotation (e.g. `--has-chatted   restrict to users...`). They were being
  // misclassified as `string`, so server.js emitted `--has-chatted true`, which
  // lark-cli rejects as an unexpected positional arg. A flag with no type token
  // is a boolean.
  it('detects a boolean flag from the ABSENCE of a type token', () => {
    const { flags } = parseFlags('Flags:\n      --has-chatted   restrict to users you have chatted with');
    expect(flags[0]).toMatchObject({ name: 'has-chatted', type: 'boolean', required: false });
  });

  it('classifies an int type token as number', () => {
    const { flags } = parseFlags('Flags:\n      --page-size int   rows per request, 1-30');
    expect(flags[0]).toMatchObject({ name: 'page-size', type: 'number' });
  });

  it('classifies a float type token as number', () => {
    const { flags } = parseFlags('Flags:\n      --ratio float   scale factor');
    expect(flags[0]).toMatchObject({ name: 'ratio', type: 'number' });
  });

  it('keeps string-like type tokens (string, stringArray, duration) as string', () => {
    expect(parseFlags('Flags:\n      --tags stringArray   labels').flags[0]).toMatchObject({ name: 'tags', type: 'string' });
    expect(parseFlags('Flags:\n      --wait duration   timeout').flags[0]).toMatchObject({ name: 'wait', type: 'string' });
  });

  it('still treats a boolean with (default: false) as boolean (no type token)', () => {
    const { flags } = parseFlags('Flags:\n      --page-all   Fetch all pages (default: false)');
    expect(flags[0]).toMatchObject({ name: 'page-all', type: 'boolean' });
  });

  // Regression: lark-cli >=1.0.60 renders composite/JSON flags with an EXAMPLE
  // as the cobra type token (`--sheets +table-put`, `--values [["alice",95]]`,
  // `--range A1:Z200`, `--cells [[{cell},...],...]`) instead of the bare word
  // `string`. These are string-valued flags, but the old whitelist-only check
  // saw an unrecognized token and fell back to boolean — so server.js emitted a
  // valueless `--sheets` switch and dropped the JSON payload, and lark-cli
  // rejected the call with "unknown error". Any single token between the flag
  // name and the 2-space description gap means the flag TAKES a value.
  it('treats an example type token (+table-put) as string', () => {
    const { flags } = parseFlags('Flags:\n      --sheets +table-put       Typed table payload as JSON');
    expect(flags[0]).toMatchObject({ name: 'sheets', type: 'string' });
  });

  it('treats a JSON-array example token ([["alice",95]]) as string', () => {
    const { flags } = parseFlags('Flags:\n      --values [["alice",95]]   Untyped initial data as one 2D JSON array');
    expect(flags[0]).toMatchObject({ name: 'values', type: 'string' });
  });

  it('treats a range example token (A1:Z200) as string', () => {
    const { flags } = parseFlags('Flags:\n      --range A1:Z200   range to verify');
    expect(flags[0]).toMatchObject({ name: 'range', type: 'string' });
  });

  it('treats a nested-array example token ([[{cell},...],...]) as string', () => {
    const { flags } = parseFlags('Flags:\n      --cells [[{cell},...],...]   typed cells payload');
    expect(flags[0]).toMatchObject({ name: 'cells', type: 'string' });
  });

  // Some example tokens contain INTERNAL spaces (`--border-styles { top: {...},
  // bottom: ... }`, `--sort-keys [{"column":"x","ascending":true}, ...]`). The
  // token still ends at the 2+ space description gap — capturing only up to the
  // first inner space misreads these as boolean and drops their JSON payload.
  it('treats a space-containing example token ({ top: {...} }) as string', () => {
    const { flags } = parseFlags('Flags:\n      --border-styles { top: {style,color}, bottom: ... }   Border config JSON');
    expect(flags[0]).toMatchObject({ name: 'border-styles', type: 'string' });
  });

  it('treats a JSON-array example token with inner spaces as string', () => {
    const { flags } = parseFlags('Flags:\n      --sort-keys [{"column":"x","ascending":true}, ...]   JSON array');
    expect(flags[0]).toMatchObject({ name: 'sort-keys', type: 'string' });
  });

  // XOR mutual-exclusivity hint (`--properties +cond-format-create --properties`)
  // — the example references another command; still a value-taking string flag.
  it('treats an XOR-style example token as string', () => {
    const { flags } = parseFlags('Flags:\n      --properties +cond-format-create --properties   Rule config JSON');
    expect(flags[0]).toMatchObject({ name: 'properties', type: 'string' });
  });

  // Regression (cross-review finding): lark-cli 1.0.69 renders SOME booleans
  // WITH a token — the default value (`--skip-hidden false`) or a negation
  // hint (`--highlight --highlight=false`). A bare true/false token or a
  // `--flag=` token means boolean, NOT a value flag; misreading these as
  // string made server.js emit `--skip-hidden true`, which lark-cli rejects
  // as a positional arg ("unknown error" downstream).
  it('treats a bare false default-token as boolean (--skip-hidden false)', () => {
    const { flags } = parseFlags('Flags:\n      --skip-hidden false         Skip hidden rows and columns; default false');
    expect(flags[0]).toMatchObject({ name: 'skip-hidden', type: 'boolean' });
  });

  it('treats a bare true default-token as boolean', () => {
    const { flags } = parseFlags('Flags:\n      --has-header true           first row is a header; default true');
    expect(flags[0]).toMatchObject({ name: 'has-header', type: 'boolean' });
  });

  it('treats a --flag=false negation-hint token as boolean (--highlight --highlight=false)', () => {
    const { flags } = parseFlags('Flags:\n      --highlight --highlight=false    Pill-highlight switch; default false');
    expect(flags[0]).toMatchObject({ name: 'highlight', type: 'boolean' });
  });

  it('honors a colon-less (default true) annotation as boolean (--include-row-prefix [row=N])', () => {
    const { flags } = parseFlags('Flags:\n      --include-row-prefix [row=N]   prefix each row; default `true` (default true)');
    expect(flags[0]).toMatchObject({ name: 'include-row-prefix', type: 'boolean' });
  });

  it('does not misread a quoted string default as boolean', () => {
    const { flags } = parseFlags('Flags:\n      --format string           output format (default "json")');
    expect(flags[0]).toMatchObject({ name: 'format', type: 'string' });
  });

  // --print-schema / --flag-name are build-time introspection controls (the
  // generator uses them to extract composite-flag JSON Schemas); they are not
  // user intent and must be hidden from the LLM-facing schema, with the
  // command's introspection support surfaced as supportsPrintSchema.
  it('hides print-schema and flag-name flags and reports supportsPrintSchema', () => {
    const help = [
      'Flags:',
      '      --flag-name string        flag whose schema to print (omit to list introspectable flags); used with --print-schema',
      '      --print-schema            print JSON Schema for a composite flag instead of executing',
      '      --cells [[{cell},...],...]   typed cells payload',
    ].join('\n');
    const { flags, supportsPrintSchema } = parseFlags(help);
    expect(supportsPrintSchema).toBe(true);
    expect(flags.map(f => f.name)).toEqual(['cells']);
  });

  it('reports supportsPrintSchema=false when the command lacks the flag', () => {
    const { supportsPrintSchema } = parseFlags('Flags:\n      --days int   Number of days');
    expect(supportsPrintSchema).toBe(false);
  });
});

// The catalog descriptions come verbatim from `--help`, which speaks CLI:
// @file/stdin hints, `--kebab-flag` references, `run --print-schema` advice.
// MCP agents cannot run terminal commands or read local files, so every one of
// those is noise that buries the parts they DO need (the payload shape). The
// skills layer already enforces zero CLI leakage (adapt-skill-for-mcp rules);
// translateFlagDescription extends the same invariant to the catalog path.
describe('translateFlagDescription', () => {
  it('strips the (supports @file, - reads stdin ...) suffix', () => {
    const desc = 'Untyped initial data as one 2D JSON array (supports @file, - reads stdin (one flag per call; use @file for others))';
    expect(translateFlagDescription(desc)).toBe('Untyped initial data as one 2D JSON array');
  });

  it('rewrites --flag references to snake_case parameter names', () => {
    const desc = 'Mutually exclusive with --values. Pair with --styles for number formats.';
    expect(translateFlagDescription(desc)).toBe('Mutually exclusive with values. Pair with styles for number formats.');
  });

  it('rewrites the run --print-schema advice to point at the embedded schema', () => {
    const desc = 'JSON: {config, sparklines}; run `--print-schema` for the full structure';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('--print-schema');
    expect(out).toContain('payload_schema');
  });

  it('rewrites lark-cli <shortcut> --help advice without leaking CLI usage', () => {
    const desc = 'For basic flags use lark-cli sheets <shortcut> --help; for composite JSON flags use --print-schema --flag-name <flag>.';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('lark-cli');
    expect(out).not.toContain('--print-schema');
  });

  it('keeps +cmd payload literals intact (batch-update operations use them)', () => {
    const desc = 'JSON array: [{"shortcut":"+xxx-yyy","input":{...}}, ...]. shortcut uses CLI names.';
    expect(translateFlagDescription(desc)).toContain('"+xxx-yyy"');
  });

  it('leaves a clean description unchanged', () => {
    expect(translateFlagDescription('Spreadsheet title')).toBe('Spreadsheet title');
  });

  // Remaining real-catalog leak shapes (found by translating all 2816 flag
  // descriptions of the 1.0.69 catalog): variant stdin hints, inline "or
  // @file" alternatives, `lark-cli skills read` advice, and prose citing the
  // equivalent lark-cli command.
  it('strips the (supports - reads stdin ...) variant without @file prefix', () => {
    const desc = 'Inline SQL text; mutually exclusive with file (supports - reads stdin (one flag per call; use @file for others))';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('stdin');
    expect(out).not.toContain('@file');
  });

  it('strips inline "or @file" alternatives', () => {
    const desc = 'filter JSON object or @file, same shape as view filter';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('@file');
    expect(out).toContain('filter JSON object');
  });

  it('strips "supports @file or -" tails', () => {
    const desc = 'JSON array of pages ({slide_id, content}); supports @file or -';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('@file');
  });

  it('rewrites `lark-cli skills read <domain> <path>` advice to lark_get_skill', () => {
    const desc = 'AI agents MUST read lark-cli skills read lark-doc references/lark-doc-xml.md before writing content.';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('lark-cli');
    expect(out).toContain('lark_get_skill');
  });

  it('neutralizes prose citing an equivalent lark-cli command', () => {
    const desc = 'Local output path for the download. Note: the equivalent `lark-cli drive +export doc_type sheet` writes to cwd.';
    const out = translateFlagDescription(desc);
    expect(out).not.toContain('lark-cli');
  });

  it('keeps the literal default value "created by lark-cli" (data, not usage)', () => {
    // A default-value literal is data the agent may see in API output — leave it.
    const desc = 'source title for display (default "created by lark-cli")';
    expect(translateFlagDescription(desc)).toContain('created by lark-cli');
  });

  // Cross-review finding: the print-schema rewrite left a dangling em-dash —
  // "Deeply nested — run `--print-schema ...`" became "Deeply nested —; full
  // structure ...". The connector before "run" must be consumed too.
  it('does not leave a dangling em-dash when rewriting print-schema advice', () => {
    const desc = 'Full chart config JSON. Deeply nested — run `--print-schema --flag-name properties` for the full structure.';
    const out = translateFlagDescription(desc);
    expect(out).not.toMatch(/—\s*;/);
    expect(out).toContain('payload_schema');
  });

  it('returns no flags when there is no flag section', () => {
    expect(parseFlags('Just a description, no flags here')).toEqual({ flags: [], supportsYes: false, supportsPrintSchema: false });
  });

  it('ignores lines that are not indented flag definitions', () => {
    // Usage lines / prose mentioning --foo without the leading-whitespace + "-- " shape
    const { flags } = parseFlags('Usage:\n  lark-cli im +send --chat-id <id>\n\nSend a message');
    expect(flags).toEqual([]);
  });
});

describe('parseShortcuts', () => {
  // lark-cli renders each service's "Available Commands:" with a MIX of:
  //   `+cmd`              — classic shortcuts (always real tools)
  //   `resource-x`        — no-plus shortcuts (lark-cli 1.0.55 docs resource-*)
  //   `user_mailbox.msgs` — no-plus RAW-API resource groups (NOT shortcuts; the
  //                         raw-API loop descends into these for lark_invoke)
  // The ONLY no-plus commands that are real shortcuts are the ones extracted from
  // upstream source into shortcut-scopes.json. So parseShortcuts takes that set of
  // known no-plus shortcut commands and admits a no-plus line ONLY if it's listed —
  // otherwise raw-API resource groups would be mis-registered as broken shortcuts.
  const DOCS_HELP = [
    'Manage Lark documents',
    '',
    'Available Commands:',
    '  +create            Create a Lark document',
    '  +media-download    Download document media',
    '  resource-delete    Delete a document resource (type=cover is idempotent when empty)',
    '  resource-download  Download a document resource',
    '  resource-update    Upload and update a document resource (type=cover)',
    '',
    'Flags:',
    '  -h, --help   help',
  ].join('\n');

  const DOCS_NOPLUS = new Set(['resource-delete', 'resource-download', 'resource-update']);

  it('captures +plus shortcuts (no allowlist needed for them)', () => {
    const got = parseShortcuts(DOCS_HELP, new Set());
    expect(got.find(s => s.command === '+create')).toMatchObject({ command: '+create', description: 'Create a Lark document' });
    expect(got.find(s => s.command === '+media-download')).toBeDefined();
  });

  it('captures no-plus shortcuts listed in the known set (docs resource-*)', () => {
    const names = parseShortcuts(DOCS_HELP, DOCS_NOPLUS).map(s => s.command);
    expect(names).toContain('resource-download');
    expect(names).toContain('resource-update');
    expect(names).toContain('resource-delete');
  });

  it('preserves the description for a no-plus shortcut', () => {
    const got = parseShortcuts(DOCS_HELP, DOCS_NOPLUS);
    expect(got.find(s => s.command === 'resource-update'))
      .toMatchObject({ command: 'resource-update', description: 'Upload and update a document resource (type=cover)' });
  });

  it('does NOT admit no-plus commands absent from the known set (raw-API resource groups)', () => {
    const MAIL_HELP = [
      'Available Commands:',
      '  +draft               Create a draft',
      '  user_mailbox.messages   manage messages',
      '  user_mailboxes          manage mailboxes',
    ].join('\n');
    const names = parseShortcuts(MAIL_HELP, new Set()).map(s => s.command);
    expect(names).toEqual(['+draft']); // the two no-plus resource groups are excluded
  });

  it('only reads inside the Available Commands section (ignores prose and flags)', () => {
    const got = parseShortcuts(DOCS_HELP, DOCS_NOPLUS);
    expect(got.find(s => s.command.includes('help'))).toBeUndefined();
    expect(got).toHaveLength(5); // 2 plus + 3 known no-plus
  });

  it('defaults the known set to empty (only +cmd) when omitted', () => {
    const names = parseShortcuts(DOCS_HELP).map(s => s.command);
    expect(names).toEqual(['+create', '+media-download']);
  });
});

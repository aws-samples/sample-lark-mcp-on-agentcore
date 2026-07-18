---
name: adapt-skill-for-mcp
description: "Transform a raw lark-cli skill into MCP-adapted format. Use when upgrading lark-cli skills for the Remote MCP server."
---

# Adapt lark-cli Skill for Remote MCP

Transform a raw lark-cli skill (designed for clients that can shell-exec lark-cli and read
local files) into a format suitable for downstream agents calling our Remote MCP tools.

## Quick reference

| Rule | One-liner |
|------|-----------|
| 1 | Keep `name` + `description` frontmatter; adapt CLI notation inside it; drop the rest |
| 2 | `lark-cli ... +cmd --flags` → `lark_<svc>_<cmd>(flag="val")` |
| 3 | Remove `--as`, auth, identity setup |
| 4 | Cross-file links → `lark_get_skill(domain, section)` |
| 5 | Parameter tables: `--kebab` → `snake_case`, remove `--as`/`--yes` rows |
| 6 | CLI terminology → tool terminology; delete pipelines |
| 6b | Bot-only ops → add ⚠️ warning |
| 7 | Preserve orchestration logic, CRITICAL markers, language |
| 8 | Text assets (`.html`/`.txt`/`.csv`): copy verbatim; `cat local-file` → `lark_get_skill(section="assets/...")` |
| 9 | Scripts (`scripts/`): copy `.py` verbatim; rewrite `python3 ...` → `lark_exec_script(...)` in `.md` |

## When to use

After upgrading lark-cli (`lark-cli update`), re-adapt skills into `docker/skills/`.

## Runtime architecture (context for adaptation)

The MCP server exposes tools to downstream agents. The call chain:

```
Agent → MCP tools/call {name: "lark_calendar_create", arguments: {summary: "x", start: "y"}}
  → server.js converts arguments to CLI flags: lark-cli calendar +create --summary "x" --start "y"
  → lark-cli executes with user token → returns JSON
  → server.js returns result to agent
```

Key implications for adapted skills:
- **Parameter names** in skill examples must be `snake_case` (matching inputSchema)
- **The agent never runs lark-cli directly** — it calls MCP tools
- **Auth is transparent** — user token is injected by the server per-request
- **Identity is always `user`** — `LARKSUITE_CLI_DEFAULT_AS=user` is hardcoded
- **High-risk writes** require `_confirm=true` (server rejects first call with guidance)
- **`params` and `data` for raw APIs** are JSON strings, not nested objects

## Input / Output

- **Input**: A raw skill directory (e.g. `~/.agents/skills/lark-calendar/`)
- **Output**: Adapted files written to `docker/skills/lark-calendar/`

## Transformation Rules

### 1. Keep and adapt the `description` frontmatter

The raw skill starts with a `---...---` YAML block. **Keep `name` and `description`; drop
everything else** (`version`, `metadata`, `bins`, `cliHelp`, `user-invocable`, `source`,
`type` — all irrelevant to MCP).

**Why this matters**: `lark_list_skills` returns each domain's `description` as the one-line
summary an agent uses to decide which skill to load. If you strip it, the server falls back to
the bare directory name (`lark-calendar`), and the first level of progressive disclosure is
dead — the agent can't tell what a domain does without fetching its full SKILL.md. So the
`description` is load-bearing, not metadata noise.

**Adapt CLI notation inside the description** with the same rules as the body:

| In the raw description | Adapted |
|------------------------|---------|
| `lark-cli` (e.g. "用 lark-cli 操作飞书多维表格") | drop the word or rephrase ("操作飞书多维表格") |
| `+create` / `+agenda` **shortcut** notation | direct tool `lark_<svc>_<cmd>` (`lark_calendar_create`, `lark_calendar_agenda`) |
| `references/lark-calendar-schedule-meeting.md` | `lark_get_skill(domain="calendar", section="schedule-meeting")` |
| `vc meeting get --with-participants` (**raw API**, no `+`) | prose ref `通过 lark_invoke 调用 lark_vc_meeting_get 并带上 with_participants 参数` — NOT a direct call `lark_vc_meeting_get(...)` |
| `calendar +agenda 和 task +get-my-tasks` | `lark_calendar_agenda 和 lark_task_get_my_tasks` |
| `drive +search` | `lark_drive_search` |

**CRITICAL — shortcut vs raw API**: only `+cmd` shortcuts become direct calls
`lark_<svc>_<cmd>(...)`. A raw API written as `<svc> <resource> <method>` (no `+`, e.g.
`vc meeting get`) is NOT a registered tool — it is only reachable via
`lark_invoke(tool_name="lark_<svc>_<resource>_<method>", ...)`. Writing it as a direct call in
the description invents a tool name that does not exist. In a one-line description, prefer a
short prose reference (mention `lark_invoke` + the tool name) over inlining the full nested-JSON
`lark_invoke(...)` call, which would force escaping many inner quotes. When unsure whether a
name is a shortcut, check it against the generated tool catalog (the body already shows the
right form — match it).

Keep the description's language (Chinese stays Chinese), routing hints (when-to-use vs
when-NOT-to-use, cross-domain pointers like "走 lark-doc"), and length. Do not invent a new
summary — adapt the upstream one. The result must contain zero `lark-cli`, zero `+cmd`, zero
`references/*.md` paths, and zero direct-call tokens for raw-API names (the same bans the body has).

**Output shape** (top of every adapted SKILL.md):

```
---
name: lark-calendar
description: "飞书日历：... 高频操作优先使用 lark_calendar_agenda、lark_calendar_create ... 涉及预约会议时先调用 lark_get_skill(domain=\"calendar\", section=\"schedule-meeting\")"
---

# calendar (v4)
...
```

**Always emit a single double-quoted line** for the value, and escape inner double quotes as
`\"` (YAML-safe). If the upstream used a `>` or `|` block scalar (e.g. whiteboard), collapse it
to one quoted line. (The server's `extractSkillDescription` does parse block scalars as a
fallback, but a single quoted line is what the CI quality test and every existing skill use —
keep it uniform.)

### 2. Replace CLI commands with MCP tool calls

The MCP server receives `{"name": "tool_name", "arguments": {...}}` and internally converts
arguments back to `--flag value` when calling lark-cli. Adapted skills should show the
**agent-facing format** (function-call shorthand that maps directly to MCP arguments):

| Original (CLI) | Adapted (MCP) |
|----------------|---------------|
| `lark-cli calendar +create --summary "x" --start "y" --end "z"` | `lark_calendar_create(summary="x", start="y", end="z")` |
| `lark-cli calendar events create --params '{...}' --data '{...}'` | `lark_invoke(tool_name="lark_calendar_events_create", args={params: {"calendar_id":"xxx"}, data: {"summary":"y"}})` |
| `lark-cli schema calendar.events.create` | `lark_discover(query="calendar.events.create")` |
| `lark-cli calendar -h` | `lark_discover(category="calendar")` |

**Rules:**

- **Tool naming**: Shortcut `+<cmd>` → `lark_<service>_<cmd>`; Raw API `<service> <resource> <method>` → via `lark_invoke(tool_name="lark_<service>_<resource>_<method>")`; dots in resource names become underscores
- **Parameter names**: Convert `--kebab-case` to `snake_case` (must match the tool's inputSchema exactly)
- **String params**: Most args are strings — `flag_name="value"`
- **Boolean params**: `page_all=true`, `overwrite=true`. Both bare `true` and `"true"` work at runtime (server checks truthiness), but prefer bare `true` for clarity.
- **`--params` and `--data`**: In the skill pseudo-code, write as readable JSON objects for clarity: `params={"calendar_id": "xxx"}, data={"summary": "y"}`. The MCP client serializes these as JSON strings on the wire. (Do NOT leave multi-line JSON blobs orphaned outside the function call.)
- **Multi-line commands**: Collapse backslash continuations AND multi-line `--data '{...}'` blobs into a single tool call
- **`| jq` pipelines**: Delete. The MCP caller handles JSON parsing.
- **`| tr`, `| grep`, shell variable assignment** (e.g. `TOKEN=$(lark-cli ...)`): Delete. Show only the tool call.
- **Hidden flags** (never appear in adapted output): `--as`, `--dry-run`, `--jq`, `--yes`, `--help`. These are handled by the server or irrelevant to MCP consumers. Note: `--format` IS exposed in some tools (e.g., `format="json"`) — include it only when the skill explicitly needs a non-default format.

### 3. Remove identity / auth instructions

The MCP server handles authentication transparently. Remove or neutralize:

- `--as user` / `--as bot` flags — remove entirely from tool calls
- Where the original text distinguishes "user identity" vs "bot identity" behavior, preserve the semantic distinction but replace backtick-quoted `--as user`/`--as bot` with readable labels like `user identity` and `bot identity` (not both as "user identity")
- `lark-cli auth login ...` lines — delete
- `lark-cli config init` lines — delete
- "Prerequisites: Read lark-shared/SKILL.md for auth..." — delete
- Sections explaining auth setup — delete or replace with: "(authentication is handled automatically by the MCP server)"
- Empty code blocks left after stripping auth commands — delete

### 4. Replace cross-file references and "Read 工具" instructions

| Original | Adapted |
|----------|---------|
| `先用 Read 工具读取 [references/lark-calendar-schedule-meeting.md](...)` | `先调用 lark_get_skill(domain="calendar", section="schedule-meeting")` |
| `MUST 先用 Read 工具读取以下文件` | Delete or replace with `先调用 lark_get_skill(domain="...", section="...")` |
| `[../lark-shared/SKILL.md](...)` | Delete (auth is automatic) |
| `lark_get_skill(domain="shared")` | Delete — shared is excluded, this is a dead reference. Replace with "(MCP server 自动处理认证)" |
| `[../lark-vc/SKILL.md](...)` | `lark_get_skill(domain="vc")` |
| `[vc +recording](../lark-vc/references/lark-vc-recording.md)` | `lark_get_skill(domain="vc", section="recording")` |
| `[text](references/local-file.md)` (intra-skill) | `lark_get_skill(domain="<current>", section="<filename-without-prefix>")` |
| `[text](../SKILL.md)` (parent ref within same skill) | `lark_get_skill(domain="<current>")` |

**Section name resolution**: The server tries these paths in order:

```
section="X" →
  1. references/X.md
  2. references/lark-<domain>-X.md
  3. <skillDir>/X.md

section="subdir/filename" →
  1. references/subdir/filename.md    ← subdirs work via /
  2. references/lark-<domain>-subdir/filename.md
  3. <skillDir>/subdir/filename.md    ← routes/, scenes/ etc.
```

**Rules for section values:**

| File path | Correct section |
|-----------|----------------|
| `references/lark-task-create.md` | `"create"` (strip `lark-<domain>-` prefix) |
| `references/examples.md` | `"examples"` |
| `references/style/lark-doc-style.md` | `"style/lark-doc-style"` (include subdir) |
| `routes/dsl.md` | `"routes/dsl"` |
| `scenes/flowchart.md` | `"scenes/flowchart"` |

**CRITICAL**: Shortcut tables in SKILL.md often have rows like `[+create](references/lark-task-create.md)`.
These MUST be converted. Do NOT leave any `](references/` patterns in the output — they are
filesystem paths that downstream agents cannot resolve.

### 5. Convert parameter tables

Original skills often have tables with `--flag` column. Convert to snake_case:

| Before | After |
|--------|-------|
| `--summary <text>` | `summary` |
| `--start <ISO8601>` | `start` |
| `--attendee-ids <ids>` | `attendee_ids` |
| `--page-all` (boolean) | `page_all` (boolean) |
| `--as <identity>` | _(delete row)_ |
| `--yes` | _(delete row — server handles)_ |

Keep the description and required/optional columns intact.

### 6. Clean up CLI terminology and pipelines

- `CLI/API 返回的` → `工具返回的`
- `CLI 标志` → `参数`
- `调用任何具体的 CLI 子命令` → `调用任何具体的 MCP tool`
- `| jq '...'` or `| tr ...` post-processing pipelines → delete (caller handles JSON parsing)
- Keep "CLI" in purely descriptive/historical context (acceptable)

### 6b. Handle bot-only operations

The MCP server always uses **user identity** (user_access_token). If a tool/operation is
documented as bot-only (`tenant_access_token` required, no user auth support), add a note:

> ⚠️ This operation requires bot identity and is not available via the MCP server.

### 7. Preserve everything else

- All orchestration logic (workflow steps, decision rules, constraints)
- All CRITICAL / BLOCKING REQUIREMENT markers
- All parameter tables (but remove `--as` rows)
- All conceptual explanations
- Original language (Chinese stays Chinese, English stays English)
- Markdown formatting
- **Upstream license attribution.** All `docker/skills/**` content is derived
  from lark-cli (MIT), so its copyright notice must be retained per the MIT
  license. For `.py` helper scripts, keep the upstream header verbatim
  (`# Copyright (c) <year> Lark Technologies Pte. Ltd.` + `# SPDX-License-Identifier: MIT`).
  For the bulk `.md`/`.html`/`.xml` assets — which can't carry per-file headers
  cleanly — attribution is satisfied collectively by the root
  `THIRD-PARTY-LICENSES` and `NOTICE` files; when adapting a **new** upstream
  source (a new derived component or a changed upstream copyright), update those
  two files rather than silently dropping the notice. IconPark-derived
  `iconpark-index.json` is likewise covered there (Apache-2.0).

### 8. Copy text assets verbatim; rewrite local-file reads

Some skills ship **non-markdown text assets** alongside their `.md` files — e.g.
`lark-mail/assets/templates/*.html` (static email templates). The server serves these through
`lark_get_skill` for the allow-listed text extensions **`.html`, `.txt`, `.csv`** (see
`docker/skill-sections.js`). Handle them like this:

- **Copy the asset file verbatim** to the same relative path under `docker/skills/lark-<domain>/`
  (e.g. `assets/templates/weekly--team-report.html`). Do **NOT** apply the CLI→MCP text rules to
  asset bodies — an HTML template is data, not skill prose. Preserve the `assets/` directory
  structure as-is.
- **Rewrite local-file reads** in the `.md` that references them. The raw skill reads assets off
  the local filesystem (`cat skills/lark-mail/assets/templates/x.html`, or a relative
  `[`../assets/templates/`](../assets/templates/)` link) — neither works for a downstream agent
  with no filesystem. Replace with a `lark_get_skill` call that addresses the asset **with its
  extension and path relative to the skill dir**:

  | Original (local read) | Adapted (MCP) |
  |-----------------------|---------------|
  | `cat skills/lark-mail/assets/templates/weekly--team-report.html` | `lark_get_skill(domain="mail", section="assets/templates/weekly--team-report.html")` |
  | `[`../assets/templates/`](../assets/templates/)` (browse the dir) | prose: 用 `lark_get_skill(domain="mail", section="assets/templates/<name>.html")` 按名取用某个模板 |

  Note the asset section **keeps its `.md`-less peers' convention inverted**: markdown sections
  are addressed without an extension (`section="create"`), but assets are addressed **with** the
  full filename+extension (`section="assets/templates/x.html"`), because that is how
  `skill-sections.js` lists and resolves them.
- **Binary assets are NOT supported** (images, PDFs, fonts, …) — the server returns text only. If
  a skill depends on a binary asset, add a ⚠️ note that it is unavailable via the MCP server
  rather than inventing a broken reference.

### 9. Handle executable scripts (`scripts/` directories)

Some skills ship **executable scripts** (e.g. `lark-slides/scripts/iconpark_tool.py`) that
agents are instructed to run locally. The MCP server provides `lark_exec_script` — a generic
Python script executor that can run any script bundled under `docker/skills/*/scripts/`.

Handle them like this:

- **Copy `scripts/` directories verbatim** to `docker/skills/lark-<domain>/scripts/`. Do NOT
  apply CLI→MCP text rules to `.py` files — they are executable code, not skill prose.
- **Rewrite script invocations** in the `.md` files. Replace `python3 ...` with
  `lark_exec_script(script="<relative-path>", args=[...])`. The `script` value is relative to
  the skills dir (e.g. `lark-slides/scripts/iconpark_tool.py`). Arguments are passed as a JSON
  array of strings.
- **For scripts that read input from a file** (e.g. `--input <file>`): the adapted `.md` MUST
  invoke them via the `stdin` parameter (`args=["--input", "-"], stdin="<content>"`), because the
  container gives `lark_exec_script` child processes **no writable filesystem** for the agent to
  stage an input file — stdin is the only data channel. This is a hard contract: **if a doc pipes
  `stdin=` to a script, that script MUST read stdin**, or the payload lands in the literal path
  `/tmp/-` and the call dies with `FileNotFoundError`. So whenever you rewrite a file-reading
  invocation to use `stdin`, first confirm the script reads stdin; if it doesn't, add the standard
  2-line shim to its file-reading helper:

  ```python
  if str(file_path) == "-":
      return sys.stdin.read()
  ```

  (Reference implementations: `doc_word_stat.py`, `xml_text_overlap_lint.py`.) The
  `skill-quality` test "every script invoked with stdin= actually reads stdin" enforces this
  statically — a doc/script drift fails CI rather than surfacing as a silent runtime error.
- **Data files consumed by scripts** (e.g. `references/iconpark-index.json`,
  `assets/templates/*.xml`) stay at their current paths — the scripts locate them via
  `Path(__file__).parent.parent` which resolves correctly in the container.
- **The `scripts/` whitelist regex**: only paths matching
  `lark-[a-z-]+/scripts/[a-z0-9_]+\.py` are executable. Scripts in other locations or with
  non-lowercase names will be rejected.

| Original (script invocation) | Adapted (MCP) |
|------------------------------|---------------|
| `python3 scripts/iconpark_tool.py search --query "增长趋势" --limit 8` | `lark_exec_script(script="lark-slides/scripts/iconpark_tool.py", args=["search", "--query", "增长趋势", "--limit", "8"])` |
| `python3 scripts/template_tool.py summarize --template office--work_report --label 内容` | `lark_exec_script(script="lark-slides/scripts/template_tool.py", args=["summarize", "--template", "office--work_report", "--label", "内容"])` |
| `python3 scripts/xml_text_overlap_lint.py --input <file>` | `lark_exec_script(script="lark-slides/scripts/xml_text_overlap_lint.py", args=["--input", "-"], stdin="<XML content>")` |

## Excluded skills (do not adapt)

- `lark-shared` — auth-only, not relevant
- `lark-skill-maker` — dev tool for creating skills
- `lark-event` — real-time event consumption (not exposed via Remote MCP)

## Conditional guards

Apply transformation **only if** the pattern is in an actionable context (code block, inline
backtick, or direct instruction). **Skip if** the pattern is in:

- A comment explaining historical context ("originally this was done via lark-cli...")
- A default value literal (e.g., `--source-title` default is `"created by lark-cli"`)
- An error message description ("if lark-cli returns error.code=20017...")
- A comparison or "do not" instruction ("do NOT call lark-cli directly")

When in doubt, convert — a false positive (converting descriptive text) is less harmful than
a false negative (leaving an actionable CLI command unconverted).

## Execution workflow

### Phase 0: Diff analysis (which skills to re-adapt)

Re-adaptation is **incremental by default**: re-adapt only the `docker/skills/` domains whose
upstream source changed between the OLD and NEW lark-cli versions. (This is distinct from scope
extraction in the bump runbook, which is **always full** — it re-scans every shortcut regardless
of this diff. Phase 0 governs ONLY which skills below get transformed.)

Inputs come from the bump runbook ([`bump-lark-cli.md`](bump-lark-cli.md) Step 8): `OLD_VER`,
`NEW_VER`, two shallow single-tag source clones at `/tmp/lark-cli-$OLD_VER` and
`/tmp/lark-cli-$NEW_VER`, and the computed `READAPT` domain list. The clones share no git
history, so diff the on-disk trees with `git diff --no-index` (NOT `git diff v$OLD_VER..v$NEW_VER`,
which fails on shallow clones). `git diff --no-index` exits 1 when differences exist, so always
guard with `2>/dev/null || true` under `set -e`.

```bash
EXCL='lark-shared|lark-skill-maker|lark-event'
# CHANGED: any domain with a differing/added/deleted file under skills/lark-<domain>/.
# Parse `diff --git` headers so delete-only domains are not lost (--name-only would drop them).
mapfile -t CHANGED < <(
  git diff --no-index /tmp/lark-cli-$OLD_VER/skills /tmp/lark-cli-$NEW_VER/skills 2>/dev/null \
    | grep '^diff --git ' | grep -oE 'skills/lark-[a-z-]+' | sed -E 's#^skills/##' \
    | sort -u | grep -vxE "$EXCL" | grep -vxE '^$' || true
)
# ADDED: in NEW not OLD (no prior adapted version → adapt FRESH).
mapfile -t ADDED < <(comm -13 <(ls -1 /tmp/lark-cli-$OLD_VER/skills|sort) <(ls -1 /tmp/lark-cli-$NEW_VER/skills|sort) | grep -vxE "$EXCL" | grep -vxE '^$' || true)
# REMOVED: in OLD not NEW. Deletions also emit `diff --git` headers, so REMOVED leaks into
# CHANGED — it MUST be subtracted. REMOVED domains are only `rm -rf`'d (bump Step 8), never adapted.
mapfile -t REMOVED < <(comm -23 <(ls -1 /tmp/lark-cli-$OLD_VER/skills|sort) <(ls -1 /tmp/lark-cli-$NEW_VER/skills|sort) | grep -vxE '^$' || true)
# Re-adapt set = (CHANGED ∪ ADDED) \ REMOVED
mapfile -t READAPT < <(comm -23 <(printf '%s\n' "${CHANGED[@]}" "${ADDED[@]}" | grep -vxE '^$' | sort -u) <(printf '%s\n' "${REMOVED[@]}" | grep -vxE '^$' | sort -u))
echo "RE-ADAPT (${#READAPT[@]}): ${READAPT[*]}"
```

If `READAPT` is empty, re-adapt nothing. `N = ${#READAPT[@]}` — dispatch one Phase 1 agent per
domain in `READAPT` (see Phase 1).

**Force a FULL re-adapt (ignore the diff; `N` = every adaptable domain) when:**

- The transformation RULES below (Rules 1–9, section-resolution, tool-naming, quality checklist)
  change — the diff only tells you which *upstream* skills changed, not whether already-committed
  output still complies with the *current* rules. A rule change makes even upstream-unchanged
  output stale, and is invisible to both the diff and `npm test` (skill-quality only re-validates
  format on existing dirs), so the full re-adapt must be done manually.
- `docker/server.js` skill-serving semantics change (`extractSkillDescription` /
  section-resolution).

### Phase 1: Transform

Dispatch one agent per domain in the Phase 0 `READAPT` set, in parallel — there are no
dependencies between skills. **`N` = the number of changed domains**, or **all adaptable
domains** when a Phase 0 full-re-adapt trigger fired. Do not hardcode the agent count; derive it
from `READAPT`.

Use the table below to size effort per skill (solo agent for high/medium complexity; batch the
low-complexity ones), but only for the domains actually in `READAPT`:

| Complexity | Skills | Strategy |
|-----------|--------|----------|
| High (10+ references) | calendar, base, drive, im, doc | Solo agent per skill |
| Medium (3-9 references) | mail, task, wiki, sheets, whiteboard, vc | Solo agent per skill |
| Low (1-2 files) | approval, attendance, contact, okr / markdown, slides, apps, minutes / workflow-meeting-summary, workflow-standup-report, openapi-explorer, vc-agent | Batch 3-4 skills per agent |

(When every adaptable domain is in `READAPT`, this is the full ~14-agent fan-out the table
describes; when only a few changed, dispatch only those.)

Each agent, per skill:

1. Read the upstream per-skill diff for semantic-change context, then read the raw SKILL.md:
   ```bash
   # OLD vs NEW upstream source for this domain. --no-index because the two /tmp clones share no
   # git history; `|| true` because it exits 1 on differences.
   git diff --no-index /tmp/lark-cli-$OLD_VER/skills/lark-<domain> /tmp/lark-cli-$NEW_VER/skills/lark-<domain> 2>/dev/null || true
   ```
   Use this diff to catch **semantic** changes a mechanical CLI→MCP rewrite would miss: new
   `+shortcuts` (adapt into new `lark_<svc>_<cmd>` tools), new/renamed reference files (new
   `lark_get_skill` sections), changed routing hints in the description, new artifacts or
   workflow steps. **ADDED domains have no OLD dir** — the command above errors and yields
   nothing, so for an added domain skip the diff and read the entire NEW tree directly
   (`ls -R /tmp/lark-cli-$NEW_VER/skills/lark-<domain>`, then read each file). Then read the raw
   SKILL.md from `~/.agents/skills/lark-<domain>/SKILL.md`.
2. Apply transformation rules (respect conditional guards) — including Rule 1: keep & adapt the `name`/`description` frontmatter
3. Write result to `docker/skills/lark-<domain>/SKILL.md`
4. For each `.md` file in the skill directory (references/, routes/, scenes/, style/, etc.):
   - Read, apply same rules, write to same relative path under `docker/skills/lark-<domain>/`
   - Use the per-skill diff to confirm every file added/renamed/deleted upstream is reflected (added files written, deleted files removed)
   - Note: files in subdirs like `references/style/` are accessible to agents via full SKILL.md text but not individually via `lark_get_skill(section=...)`. Preserve their directory structure as-is.
   - For **text assets** (`.html`/`.txt`/`.csv`, e.g. `assets/templates/*.html`): copy verbatim (Rule 8 — no CLI→MCP transform on the asset body), and rewrite any `cat local-file` / relative-link reads of them in the `.md` to `lark_get_skill(section="assets/...")`. Skip binary assets (flag as unavailable).
   - For **`scripts/` directories** (Rule 9): copy `.py` files verbatim to `docker/skills/lark-<domain>/scripts/`. Rewrite `python3 ...` invocations in `.md` to `lark_exec_script(script="lark-<domain>/scripts/<name>.py", args=[...])`. Data files consumed by the scripts (e.g. `.json` indexes, `assets/templates/`) should also be copied verbatim.
5. Self-verify: `grep -c "lark-cli"` on all output files — must be 0 (asset bodies and `.py` scripts are exempt — they are copied verbatim; check only the `.md` files). Also verify: no raw `python3 ...` invocations remain in `.md` files.

### Phase 2: Verify

After all agents complete:

```bash
find docker/skills -name "*.md" -exec grep -l "lark-cli" {} \;         # must be empty
find docker/skills -name "*.md" -exec grep -ln "\.\./lark-" {} \;      # no dead cross-links
find docker/skills -name "*.md" -exec grep -ln "\-\-as " {} \;         # no --as leaks
find docker/skills -name "*.md" -exec grep -ln "Read 工具\|Read tool" {} \;  # no Read tool refs
find docker/skills -name "*.md" -exec grep -ln "^python3\|python3 " {} \; # no raw python3 invocations in .md (lark_exec_script only)

# Tool-name existence: every lark_*() call in skills must reference a real tool.
# Extracts call-form tool names and diffs against shortcut-scopes.json.
python3 -c "
import json, re, glob, sys
sc = json.load(open('docker/shortcut-scopes.json'))['shortcuts']
real = {f'lark_{e[\"service\"]}_{e[\"command\"].lstrip(\"+\").replace(\"-\",\"_\")}' for e in sc}
real |= {'lark_discover','lark_invoke','lark_get_skill','lark_drive_import','lark_exec_script'}
bad = set()
for f in glob.glob('docker/skills/**/*.md', recursive=True):
    for m in re.finditer(r'(lark_[a-z0-9_]+)\(', open(f).read()):
        t = m.group(1)
        if t not in real and not t.endswith('_'): bad.add((t,f))
if bad:
    for t,f in sorted(bad): print(f'  ✗ {t}  <- {f}')
    print(f'\n{len(bad)} tool-name references to non-existent tools'); sys.exit(1)
print('Tool-name check: all references valid ✓')
"

# Every SKILL.md must keep a non-empty, single-quoted description frontmatter that itself
# contains no CLI leaks. The authoritative gate is the vitest skill-quality test (it parses
# the value exactly as server.js does); run it rather than relying on a weak grep:
cd docker && npx vitest run __tests__/skill-quality.test.js && cd ..
```

### Phase 2b: Upstream Semantic Diff Audit

Phase 2 catches **format** violations (grep patterns); this phase catches **content** fidelity
issues: sections silently dropped, meaning changed, tool names invented, parameters garbled,
or workflows hallucinated. It compares the adapted output against the upstream source and
confirms that ALL differences are expected CLI→MCP transformations.

**Method:** For each domain in `READAPT` (or all domains on a full re-adapt), run:

```bash
git diff --no-index /tmp/lark-cli-$NEW_VER/skills/lark-<domain> docker/skills/lark-<domain> 2>/dev/null || true
```

Dispatch one audit agent per domain (parallel). Each agent:

1. Reads the transformation rules (this document)
2. Examines the diff hunk-by-hunk, classifying each as:
   - ✅ EXPECTED: rule-conformant CLI→MCP transform (tool naming, param snake_case,
     cross-ref→lark_get_skill, auth removal, description adaptation, pipeline removal, etc.)
   - ⚠️ SUSPICIOUS: content lost, meaning changed, new content invented, incorrect tool name,
     broken `lark_get_skill` section value that won't resolve to any file, garbled parameters
3. Specifically verifies:
   - Every `lark_get_skill(section="X")` resolves to an existing file
   - Every `lark_<svc>_<cmd>` corresponds to a real `+shortcut` in the upstream SKILL.md
   - No content sections/paragraphs silently dropped (compare section headings)
   - Description frontmatter matches upstream's semantic content (just notation adapted)
   - No `+shortcut` notation left in actionable context
   - No `--kebab-case` flags left in function-call parens or descriptive text

**Acceptance criteria:** All domains must report PASS. Issues found → fix (re-dispatch a
transform agent or fix inline), then re-audit only the affected domain.

### Phase 3: Review (multi-perspective panel)

Review with a **panel of agents split by concern**, dispatched in parallel — not one generalist
agent that runs the whole checklist per domain. A single reviewer tunnel-visions on format and
misses semantic regressions; specializing each agent to one perspective makes it adversarial and
catches bug classes a generalist is blind to. Each perspective covers **all** adapted skills (not
just a spot-check), reading every `.md` under the assigned `docker/skills/lark-<domain>/` dirs plus
the per-skill upstream diff.

| # | Perspective | What this agent hunts for (and ignores everything else) |
|---|-------------|----------------------------------------------------------|
| 1 | **Semantic fidelity** | Content silently dropped, meaning changed, or workflows/sections invented vs the NEW upstream source. Every new `+shortcut`/flag/reference-file is reflected; nothing hallucinated. |
| 2 | **Tool & parameter correctness** | Every `lark_<svc>_<cmd>(...)` is a real tool in `shortcut-scopes.json` (watch the `docs` vs `doc` plural trap); every named arg matches that tool's actual snake_case `--flags` — no invented params. |
| 3 | **Reference & section resolution** | Every `lark_get_skill(domain, section="X")` resolves under the 3-path rule; no `](references/` links, no dead `../lark-*` cross-links, no `domain="shared"`. |
| 4 | **Leak & format compliance** | Zero `lark-cli` / bare `+cmd` / `--kebab` / `--as` / `Read 工具` / `\| jq` in actionable text; description frontmatter is a single quoted YAML line. (Runs the Phase 2 grep gate + `skill-quality` test.) |
| 5 | **Identity & scope safety** | Bot-only ops carry the ⚠️ Rule 6b warning rather than being silently presented as user-callable; no bot-only scopes implied. |

Each agent:

1. Reads every `.md` file in its scope (all `docker/skills/lark-<domain>/` dirs being reviewed)
2. Reports only its perspective's issues, with file path + line number and a concrete fix
3. Explicitly lists what it checked and returns **PASS** or a list of **ISSUE**s

**Acceptance criteria**: **every perspective must PASS**. Any issue → fix (re-dispatch a transform
agent for that domain, or fix inline), then re-run only the affected perspective(s). When the
re-adapted set is tiny you may run fewer agents, but never collapse perspectives 1–4 into a single
generalist — that defeats the purpose.

## Quality checklist (per skill)

- [ ] SKILL.md keeps `name` + non-empty `description` frontmatter as a **single double-quoted line** (no `>`/`|` block scalar — the server/CI parse it as a quoted scalar)
- [ ] Description's CLI notation is adapted: no `lark-cli`, no `+cmd` (incl. after CJK punctuation like `：+agenda`、`、+create`), no `references/*.md`, and **no raw-API direct-call token** (e.g. `lark_vc_meeting_get(...)` — raw APIs go through `lark_invoke` or a prose reference)
- [ ] Description's inner double quotes are escaped `\"`; the line parses as valid YAML
- [ ] Zero `lark-cli` in code blocks and inline backticks
- [ ] All `--flag value` converted to `flag="value"` inside tool call parens
- [ ] `--params`/`--data` as readable JSON objects: `args={params: {"key":"val"}, data: {...}}` (not orphaned multi-line blobs)
- [ ] No dead `../lark-*` cross-skill links
- [ ] No `](references/` intra-skill filesystem links (must be converted to `lark_get_skill`)
- [ ] No `lark_get_skill(domain="shared")` (dead reference)
- [ ] No `Read 工具` / `Read tool` instructions (use `lark_get_skill` instead)
- [ ] No empty backticks or `(identity)` where bot/user distinction was lost
- [ ] No `--as user/bot` in code examples
- [ ] No `| jq` or shell pipeline post-processing
- [ ] Parameter tables use `snake_case` names (no `--kebab-case`)
- [ ] All `lark_get_skill(section="X")` references resolve to actual files in `references/`
- [ ] Orchestration logic reads coherently
- [ ] Bot-only operations flagged with warning
- [ ] Every resource file (references/, routes/, scenes/) is mentioned by at least one .md in the same skill
- [ ] Subdir sections use full path: `section="style/lark-doc-style"` not `section="style"`
- [ ] **Tool-name existence**: every `lark_*()` call references a tool that exists in `shortcut-scopes.json` (or `lark_discover`/`lark_invoke`/`lark_get_skill`/`lark_drive_import`). Common pitfall: the CLI service is `docs` (plural), so the tool is `lark_docs_create` — not `lark_doc_create`. The skill directory name (`lark-doc`) does NOT dictate the tool name.
- [ ] **Parameter-name accuracy**: every named argument inside a tool call (`flag="value"`) must match that tool's actual `--flags` (in snake_case). Verify against `lark-cli <service> +<command> --help` or the generated catalog. Don't invent parameter names from the semantic intent (e.g. `dimension/start/end` when the real flags are `position/count`).
- [ ] **`scripts/` contain only `.py` files** copied verbatim from upstream — no `.md` transformation applied to them
- [ ] **No raw `python3 ...` invocations** in `.md` files — must be replaced with `lark_exec_script(script="...", args=[...])` calls

## Correct and incorrect examples

### Tier1 shortcut tool (e.g. `lark_calendar_create`)

The MCP inputSchema for this tool has parameters: `summary` (string), `start` (string),
`end` (string), `attendee_ids` (string), `calendar_id` (string), `description` (string),
`rrule` (string). Hidden: `--as`, `--dry-run`, `--format`, `--jq`, `--yes`.

**Correct:**
```
lark_calendar_create(summary="产品评审", start="2026-03-12T14:00+08:00", end="2026-03-12T15:00+08:00", attendee_ids="ou_aaa,ou_bbb")
```

**Incorrect** (flag style after call):
```
lark_calendar_create(summary="产品评审", start="2026-03-12T14:00+08:00") \
  --end "2026-03-12T15:00+08:00" \
  --attendee-ids ou_aaa,ou_bbb
```

**Incorrect** (kebab-case params):
```
lark_calendar_create(summary="产品评审", start="2026-03-12T14:00+08:00", attendee-ids="ou_aaa")
```

**Incorrect** (includes --as):
```
lark_calendar_create(as="user", summary="产品评审", start="2026-03-12T14:00+08:00")
```

### Raw API via `lark_invoke`

The `lark_invoke` tool accepts `tool_name` (string) and `args` (object). The `args` keys
map to CLI flags: `params`, `data`, `page_all`, `page_limit`, `format`.
Write `params` and `data` as readable JSON objects in the pseudo-code — the MCP client
handles serialization.

**Correct:**
```
lark_invoke(tool_name="lark_calendar_events_create", args={
  params: {"calendar_id": "<CALENDAR_ID>"},
  data: {"summary": "技术分享", "start_time": {"timestamp": "1741586400"}, "end_time": {"timestamp": "1741593600"}}
})
```

**Incorrect** (orphaned JSON lines outside the function call):
```
lark_invoke(tool_name="lark_calendar_events_create", args={params: {"calendar_id":"xxx"}})
  "summary": "技术分享",
  "start_time": { "timestamp": "1741586400" }
}'
```

**Incorrect** (multi-line `--data` not collapsed):
```
lark_invoke(tool_name="lark_calendar_events_create", args={params: {"calendar_id":"xxx"}}) \
  --data '{
  "summary": "技术分享"
}'
```

**Incorrect** (shell variable assignment):
```
EVENT_ID=$(lark_invoke(tool_name="lark_calendar_events_create", args={...}))
```
Correct: just show the tool call — the caller gets the JSON response directly.

### Boolean parameters

Tools like `lark_wiki_node_list` have boolean flags: `page_all`.

**Correct:** `lark_wiki_node_list(space_id="xxx", page_all=true)`

**Acceptable:** `lark_wiki_node_list(space_id="xxx", page_all="true")` (works but prefer bare true)

**Incorrect:** `lark_wiki_node_list(space_id="xxx", page_all="--page-limit")` (flag name as value — broken conversion artifact)

### `lark_discover` and `lark_get_skill`

**Correct:** `lark_discover(query="calendar.events.create")` — find a tool and its schema

**Correct:** `lark_discover(category="calendar")` — list all tools in a domain

**Correct:** `lark_get_skill(domain="calendar", section="schedule-meeting")` — get orchestration guide

**Incorrect:** `lark-cli schema calendar.events.create` (CLI command, not MCP tool)

**Incorrect:** `先用 Read 工具读取 references/xxx.md` (local file access, not available in MCP)

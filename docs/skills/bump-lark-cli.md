---
name: bump-lark-cli
description: "Upgrade lark-cli version pin: bump Dockerfile, re-extract shortcut-scopes.json from source, regenerate scope-allowlist.ts, update snapshot. Use when a new lark-cli version is released."
---

# Upgrade lark-cli Version

## When to use

When a new lark-cli version is released and needs to be pinned in this project.

## Prerequisites

- The target version tag (e.g. `v1.0.40`) must exist at https://github.com/larksuite/cli
- `lark-cli --version` locally should match or exceed the target (for validation)

## Steps

### 1. Create branch

```bash
git checkout -b chore/bump-lark-cli-<VERSION>
```

### 2. Update Dockerfile pin

Edit `docker/Dockerfile` line `ARG LARK_CLI_VERSION=...` to the new version.

### 3. Capture OLD version and clone BOTH source trees

> **Do this BEFORE Step 4 (extract).** `scripts/extract-shortcut-scopes.py` regenerates
> `docker/shortcut-scopes.json` and **overwrites** `._meta.lark_cli_version` with the NEW
> version. Once it runs, the OLD version is unrecoverable from the working tree — read it first.

The diff-guided re-adaptation in Step 8 needs **both** the OLD and NEW upstream skill trees.
Capture the currently-pinned (OLD) version, then idempotently clone both source tags into `/tmp`.

```bash
# OLD = what is pinned right now (read BEFORE the Step 4 extract overwrites it)
OLD_VER=$(jq -r ._meta.lark_cli_version docker/shortcut-scopes.json)
# NEW = the bump target you set in Step 2 (the Dockerfile pin)
NEW_VER=$(grep -oP 'ARG LARK_CLI_VERSION=\K\S+' docker/Dockerfile)
echo "OLD_VER=$OLD_VER  NEW_VER=$NEW_VER"

# Idempotent clone of BOTH tags. The [ -d ] guard is REQUIRED: a bare `git clone` into an
# existing non-empty dir ABORTS. Do NOT use `git clone ... || true` — it would mask real
# network/tag failures. The tag is v<VER>; the dir and JSON field are bare <VER>.
for VER in "$OLD_VER" "$NEW_VER"; do
  D=/tmp/lark-cli-$VER
  [ -d "$D" ] || git clone --depth=1 --branch "v$VER" https://github.com/larksuite/cli.git "$D"
done
```

These are shallow single-tag clones (`--depth=1 --branch v<VER>`) and share **no** git history,
so you **cannot** `git diff v$OLD_VER..v$NEW_VER` (it fails with `fatal: bad revision`). Step 8
compares the two on-disk trees with `git diff --no-index` instead.

> **Keep `OLD_VER` durable.** It is only a shell variable but is consumed much later (Steps 8–9
> and the adapt agents). If the shell session is lost, recover OLD from the clone dir name
> (`ls -d /tmp/lark-cli-*`) or `git show HEAD:docker/shortcut-scopes.json` — **not** from the
> working-tree `docker/shortcut-scopes.json`, which Step 4 will have overwritten with NEW.

### 4. Extract shortcut-scopes.json from the NEW clone

```bash
# The NEW clone already exists from Step 3 (the guarded loop). Just extract from it.
python3 scripts/extract-shortcut-scopes.py /tmp/lark-cli-$NEW_VER $NEW_VER
```

> **Scope extraction is ALWAYS full.** `extract-shortcut-scopes.py` re-scans every shortcut in
> the NEW clone on every run, regardless of which skills changed. Do NOT gate this step (or the
> Step 5 scope-allowlist build) on the changed-domain set computed in Step 8 — that set governs
> ONLY which `docker/skills/` dirs get re-adapted, never scope extraction.

The script (`scripts/extract-shortcut-scopes.py`) handles:
- UserScopes-first strategy (prefer UserScopes → fallback Scopes → include ConditionalScopes → exclude BotScopes)
- Variable/constant resolution (single strings, slices, and `append()` combos)
- Multiple `common.Shortcut{}` definitions per file
- Service name constants
- Empty scope arrays (included as `[]`)

### 5. Regenerate rawapi-scopes.json and scope-allowlist.ts

Raw API scope metadata lives in the lark-cli binary's embedded registry (injected
at lark-cli release time — NOT present in the source clone), so extracting it
requires a **built image**. Build first, then extract, then rebuild the allowlist:

```bash
docker build -f docker/Dockerfile -t lark-mcp-bump:tmp docker/   # NEW pin from Step 2
scripts/extract-rawapi-scopes.sh lark-mcp-bump:tmp               # → docker/rawapi-scopes.json
scripts/build-scope-allowlist.sh                                  # → scope-allowlist.ts
```

This regenerates `lambda/token-refresh-shim/scope-allowlist.ts` from
`docker/shortcut-scopes.json` + `docker/rawapi-scopes.json` + `config/oauth-scopes.json`.
Without the rawapi step, incremental auth for raw APIs (via `lark_invoke`) breaks:
the OAuth Lambda rejects their scopes as "unknown or malformed".

### 6. Verify consistency

```bash
scripts/check-lark-cli-version.sh   # Dockerfile ↔ shortcut-scopes.json version match
```

If the upstream lark-cli `LICENSE` copyright line changed (year or holder),
update the lark-cli entry in the root `THIRD-PARTY-LICENSES` and `NOTICE` files
to match — the re-adapted `docker/skills/**` content is derived from it and must
retain the current upstream notice. See rule 7 in
[adapt-skill-for-mcp.md](adapt-skill-for-mcp.md).

### 6b. Update default OAuth scopes

Compare tier1 tool scopes against `config/oauth-scopes.json`:

```bash
python3 -c "
import json
with open('docker/tier1.json') as f: tier1 = set(json.load(f))
with open('docker/shortcut-scopes.json') as f: data = json.load(f)
with open('config/oauth-scopes.json') as f: defaults = set(json.load(f))
needed = set()
for s in data['shortcuts']:
    tool = f\"lark_{s['service']}_{s['command'].lstrip('+').replace('-','_')}\"
    if tool in tier1:
        needed.update(s['scopes'])
missing = sorted(needed - defaults)
if missing:
    print('Add to config/oauth-scopes.json:')
    for s in missing: print(f'  {s}')
else:
    print('OK: all tier1 scopes covered')
"
```

If scopes are missing, add them to `config/oauth-scopes.json` (grouped near related entries),
then re-run `scripts/build-scope-allowlist.sh`.

### 7. Update CDK snapshot

```bash
npx vitest run infra/test/snapshot.test.ts --update
```

### 8. Compute the changed skill set (diff-guided re-adaptation)

Re-adaptation is **incremental by default**: only re-adapt the `docker/skills/` domains whose
upstream source actually changed between OLD and NEW. (Contrast Step 4: scope extraction is
always full.) Compute the changed set from the two `/tmp` clones from Step 3.

The three skills excluded from adaptation are never written to `docker/skills/`:
`lark-shared`, `lark-skill-maker`, `lark-event`.

```bash
EXCL='lark-shared|lark-skill-maker|lark-event'

# CHANGED = any domain with a differing/added/deleted file under skills/lark-<domain>/
# (SKILL.md OR references/**). Parse the `diff --git` header lines — robust because every
# modify/add/delete header carries the domain on at least one of a/ or b/, so DELETIONS are
# not lost (unlike --name-only, which prints /dev/null for delete-only files and drops the
# domain). `git diff --no-index` exits 1 when differences exist, which kills `set -e`: always
# wrap with `2>/dev/null` + `|| true`.
mapfile -t CHANGED < <(
  git diff --no-index /tmp/lark-cli-$OLD_VER/skills /tmp/lark-cli-$NEW_VER/skills 2>/dev/null \
    | grep '^diff --git ' | grep -oE 'skills/lark-[a-z-]+' | sed -E 's#^skills/##' \
    | sort -u | grep -vxE "$EXCL" | grep -vxE '^$' || true
)
# ADDED = dir in NEW but not OLD (no prior adapted version → adapt FRESH, all files).
mapfile -t ADDED < <(
  comm -13 <(ls -1 /tmp/lark-cli-$OLD_VER/skills | sort) <(ls -1 /tmp/lark-cli-$NEW_VER/skills | sort) \
    | grep -vxE "$EXCL" | grep -vxE '^$' || true
)
# REMOVED = dir in OLD but not NEW (deleted upstream). NOTE: deletions also produce `diff --git`
# headers, so a removed domain leaks into CHANGED — it MUST be subtracted from the dispatch set
# below, and its stale docker/skills dir deleted.
mapfile -t REMOVED < <(
  comm -23 <(ls -1 /tmp/lark-cli-$OLD_VER/skills | sort) <(ls -1 /tmp/lark-cli-$NEW_VER/skills | sort) \
    | grep -vxE '^$' || true
)

# Dispatch set = (CHANGED ∪ ADDED) \ REMOVED
mapfile -t READAPT < <(
  comm -23 \
    <(printf '%s\n' "${CHANGED[@]}" "${ADDED[@]}" | grep -vxE '^$' | sort -u) \
    <(printf '%s\n' "${REMOVED[@]}" | grep -vxE '^$' | sort -u)
)
echo "OLD_VER=$OLD_VER NEW_VER=$NEW_VER"
echo "ADDED=[${ADDED[*]}] REMOVED=[${REMOVED[*]}]"
echo "RE-ADAPT (${#READAPT[@]}): ${READAPT[*]}"

# Delete the stale adapted dir for each REMOVED domain (else lark_list_skills/lark_get_skill
# keep serving a dead skill). REMOVED domains are ONLY deleted here — never dispatched in Step 9.
for d in "${REMOVED[@]}"; do [ -n "$d" ] && rm -rf "docker/skills/$d"; done
```

If `READAPT` is empty (e.g. `OLD_VER == NEW_VER`, or only excluded skills changed), re-adapt
**nothing** in Step 9 — but still run the cleanup and tests.

> The `grep -oE 'skills/lark-[a-z-]+'` extractor only matches **lowercase + hyphen** domain
> names (all current upstream dirs qualify). If a future lark-cli introduces a digit or uppercase
> letter in a skill dir name, revisit this regex — otherwise that domain would be truncated and
> silently dropped from `CHANGED`.

**Force a FULL re-adapt (ignore the diff — `READAPT` = every adaptable domain) when:**

- The transformation RULES in [`adapt-skill-for-mcp.md`](adapt-skill-for-mcp.md) change
  (new/edited rule, changed tool-naming or section-resolution convention, new quality-checklist
  item). The diff only tells you which *upstream* skills changed — not whether already-committed
  output still complies with the *current* rules. Such rule changes are invisible to **both** the
  diff and `npm test` (skill-quality only re-validates format on existing dirs), so the full
  re-adapt MUST be done by hand; ideally ship any new rule with a matching skill-quality assertion.
- `docker/server.js` skill-serving semantics change (`extractSkillDescription` /
  section-resolution).

### 9. Re-adapt MCP skills

Follow [`adapt-skill-for-mcp.md`](adapt-skill-for-mcp.md) to regenerate `docker/skills/`. Pass it
the version pair (`OLD_VER`, `NEW_VER`) and the `READAPT` list from Step 8 so its **Phase 0**
dispatches one agent per changed domain (N = `${#READAPT[@]}` agents, not a fixed count). Each
agent reads its skill's upstream per-skill diff for semantic-change context:

```bash
# Per-skill diff handed to each adaptation agent. -no-index because the two /tmp clones share no
# git history; `|| true` because it exits 1 on differences.
git diff --no-index /tmp/lark-cli-$OLD_VER/skills/lark-<domain> /tmp/lark-cli-$NEW_VER/skills/lark-<domain> 2>/dev/null || true
```

so it catches semantic changes (new `+shortcuts`, changed workflows, new/renamed reference
files), not just mechanical CLI→MCP rewrites. **ADDED domains have no OLD dir** — the command
above errors out and yields nothing, so adapt those FRESH by reading the entire NEW tree
(`/tmp/lark-cli-$NEW_VER/skills/lark-<domain>`) directly.

#### 9a. Multi-perspective parallel review (do NOT review with a single agent)

After re-adapting, **review with a panel of agents, one per perspective — not one generalist
agent per domain.** A single reviewer running the whole quality checklist reliably tunnel-visions
on format and misses semantic regressions; splitting the review by *concern* (not just by domain)
makes each agent adversarially specialized and catches classes of bug the others are blind to.
This is in addition to `adapt-skill-for-mcp.md`'s Phase 2b (semantic-diff audit) and Phase 3
(per-domain checklist) — those still run; this panel is the cross-cutting layer over the full
re-adapted set.

Dispatch these perspectives **in parallel** (each covers ALL domains in `READAPT`, reading the
adapted output + the per-skill upstream diff). Each returns PASS or a list of `file:line` issues
with a concrete fix:

| # | Perspective | What this agent hunts for (and ignores everything else) |
|---|-------------|----------------------------------------------------------|
| 1 | **Semantic fidelity** | Content silently dropped, meaning changed, or workflows/sections invented vs the NEW upstream source. Every new `+shortcut`/flag/reference-file in the diff is reflected; nothing hallucinated. |
| 2 | **Tool & parameter correctness** | Every `lark_<svc>_<cmd>(...)` is a real tool in `shortcut-scopes.json` (watch the `docs` vs `doc` plural trap), and every named arg matches that tool's actual snake_case `--flags` — no invented params. |
| 3 | **Reference & section resolution** | Every `lark_get_skill(domain, section="X")` resolves to a real file under the 3-path rule; no `](references/` filesystem links, no dead `../lark-*` cross-links, no `domain="shared"`. |
| 4 | **Leak & format compliance** | Zero `lark-cli` / bare `+cmd` / `--kebab` / `--as` / `Read 工具` / `\| jq` in actionable text; description frontmatter is a single quoted YAML line. (Runs the Phase 2 grep gate + `skill-quality` test.) |
| 5 | **Identity & scope safety** | No bot-only scopes leaked into `shortcut-scopes.json`/`scope-allowlist.ts`; bot-only ops carry the ⚠️ Rule 6b warning rather than being silently presented as user-callable. |

Collect all panel reports; **every perspective must PASS**. Any ⚠️ → fix (re-dispatch the
transform agent for that domain, or fix inline), then re-run only the affected perspective(s).
Scale the panel down only when `READAPT` is tiny — but never collapse perspectives 1–4 into one
agent; that defeats the purpose. Then verify the quality checklist holds across the result.

After re-adapting `.md` files, also copy **scripts and data assets** from the NEW upstream
clone for each domain in `READAPT` that has them:

```bash
for d in "${READAPT[@]}"; do
  # scripts/ — copy .py files verbatim (executed by lark_exec_script)
  SRC="/tmp/lark-cli-$NEW_VER/skills/$d/scripts"
  [ -d "$SRC" ] && cp -r "$SRC" "docker/skills/$d/"
  # assets/ — copy data files verbatim (consumed by scripts)
  SRC="/tmp/lark-cli-$NEW_VER/skills/$d/assets"
  [ -d "$SRC" ] && cp -r "$SRC" "docker/skills/$d/"
done
```

Then confirm no orphan adapted dirs remain (runs against the **regenerated** tree, so do it
here, not in Step 8):

```bash
comm -13 <(ls -1 /tmp/lark-cli-$NEW_VER/skills | sort) <(ls -1 docker/skills | sort) || true   # → empty
```

### 10. Run full tests

```bash
npm test   # All tests must pass (includes scope-coverage)
```

The `scope-coverage` test validates:
- All tier1 tool scopes are in `config/oauth-scopes.json`
- Every tier1 tool has a shortcut-scopes entry
- Extraction covers all lark-cli runtime shortcuts (no gaps)

### 11. Container smoke test (build + boot)

> **`npm test` is not enough.** It runs against the source tree and never builds
> the image, so a broken *artifact* (e.g. a new `server.js` require whose file was
> never `COPY`ed in the Dockerfile, or a skill that fails to load) passes every
> unit test yet crashes the container at startup with `MODULE_NOT_FOUND`. Always
> boot the real image before committing.

```bash
bash scripts/test-smoke-docker.sh   # builds the image, boots the container,
                                    # asserts MCP initialize/tools-list + clean shutdown
```

This must reach `Skills loaded: <N> domains` and pass all checks. The same job runs
in CI (`docker-smoke`), and the `dockerfile-copy` unit test statically asserts every
`require('./x')` in `server.js` has a matching `COPY` — but run the smoke test locally
so a broken image never reaches a commit.

### 12. Commit

Include all changed files:
- `docker/Dockerfile`
- `docker/shortcut-scopes.json`
- `docker/skills/` (if re-adapted)
- `config/oauth-scopes.json` (if updated)
- `lambda/token-refresh-shim/scope-allowlist.ts`
- `infra/test/__snapshots__/snapshot.test.ts.snap`

## Validation checklist

- [ ] No bot-only scopes in shortcut-scopes.json (e.g. `im:message:send_as_bot` should NOT appear)
- [ ] `scripts/check-lark-cli-version.sh` passes
- [ ] `npm test` passes (scope-coverage test catches missing oauth-scopes)
- [ ] `bash scripts/test-smoke-docker.sh` passes — the image **builds and the container boots** (catches a broken artifact that `npm test` cannot, e.g. a new module not `COPY`ed into the Dockerfile)
- [ ] `git diff --stat` shows only the expected files (4-5 depending on oauth-scopes changes)
- [ ] Re-adaptation scope is correct — the touched `docker/skills/` domains match the Step 8
  dispatch set (or **all** domains if a full-re-adapt trigger fired):
  `git diff --name-only docker/skills | sed -E 's#docker/skills/(lark-[a-z-]+)/.*#\1#' | sort -u`
  should equal `${READAPT[*]}` (a superset only when a full re-adapt fired). This is the only
  guard against a silently-skipped changed skill — `npm test` does not compare the adapted set
  to upstream.
- [ ] Removed-upstream skills deleted: `comm -13 <(ls -1 /tmp/lark-cli-$NEW_VER/skills | sort) <(ls -1 docker/skills | sort)` prints nothing (no orphan adapted dirs)
- [ ] No remaining references to old version (`grep -r "OLD_VERSION" --include="*.json" --include="Dockerfile*"`)
- [ ] **Affordance unchanged or still unpolluted** — lark-cli >=1.0.60 renders per-command
  "affordance" guidance into `--help`, which `generate-tools.js` parses. If
  `git diff --no-index /tmp/lark-cli-$OLD_VER/affordance /tmp/lark-cli-$NEW_VER/affordance`
  shows new/changed `*.md`, confirm the generated catalog's `risk`/`flags` aren't poisoned by
  that prose. `detectRisk` (anchored `Risk:` line + affordance-aware keyword fallback) and
  `parseFlags` are covered by the "affordance block does not poison risk detection" tests in
  `docker/__tests__/generate-tools.test.js` — extend them if a new affordance shape appears.
- [ ] **No value-taking flag misread as boolean** — affordance renders composite/JSON flags
  with an EXAMPLE as the cobra type token (`--sheets +table-put`, `--values [["alice",95]]`,
  `--range A1:Z200`, multi-word `{ top: {...} }`); `flagTypeFromRest` classifies by the
  2+-space token→description gap, not a token whitelist. The failure mode is SILENT: a
  misread flag stays boolean in the schema, server.js pushes the bare switch and **drops the
  agent's payload**, and every unit/smoke test still passes — only a real tool call fails
  ("unknown error"). After the image build, scan the generated catalog from the NEW image:

  ```bash
  docker run --rm --entrypoint cat lark-mcp-bump:tmp /app/generated-tools.json \
    | jq -r '.tools[] as $t | $t.flags[]
        | select(.type=="boolean")
        | select(.description|test("\\[\\[|JSON array|payload|@file|:\\["))
        | "\($t.service)/\($t.command)/\(.name): \(.description[0:60])"'
  ```

  Expected: **empty**. Any hit → inspect that command's `--help` in the image; if a value
  flag's help line lacks the 2+-space gap (a new affordance shape), fix `flagTypeFromRest`
  and add the new shape to the "example type token" tests in
  `docker/__tests__/generate-tools.test.js`. (A genuine boolean whose *description prose*
  happens to match the grep — e.g. `--allow-sensitive` mentioning file paths — is fine;
  verify against `--help` and move on.)
- [ ] **No CLI-speak leaked into catalog descriptions** — `translateFlagDescription`
  rewrites the `--help` prose for agents (strips `@file`/stdin hints, maps `--flag` →
  `snake_case`, `lark-cli skills read` → `lark_get_skill`), but a NEW lark-cli version can
  introduce phrasing it doesn't cover. Scan the built image's catalog:

  ```bash
  docker run --rm --entrypoint cat lark-mcp-bump:tmp /app/generated-tools.json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const gt=JSON.parse(s);let n=0;
      for(const t of gt.tools) for(const d of [t.description,...t.flags.map(f=>f.description)]){
        if(/@file|--print-schema|reads stdin|lark-cli/.test(d.replace(/"[^"]*"/g,""))){n++;console.log(t.service,t.command,d.slice(0,90))}}
      console.log("leaks =",n)})'
  ```

  Expected: `leaks = 0`. A hit means a new CLI-speak shape — extend
  `translateFlagDescription` + its tests (quoted data literals like
  `(default "created by lark-cli")` are exempt; the scan already ignores them).
- [ ] **Payload-schema extraction still working** — composite flags' JSON Schemas are
  extracted at build time via `--print-schema` (`extractPayloadSchemas` in
  `generate-tools.js`) and embedded as `payloadSchemas`; server.js validates payloads
  against them pre-spawn, and `lark_discover` serves them on exact-name queries. The
  extraction fails SILENTLY (unparseable output → tool ships without schemas → validation
  quietly disabled). Check the build log line `Payload schemas extracted: <N> composite
  flags` — N dropping vs the previous bump (25 at 1.0.69) means the `--print-schema`
  output shape changed; fix `extractPayloadSchemas` accordingly.

## MCP Skill Tools

The MCP server exposes `lark_list_skills` and `lark_get_skill` tools that serve adapted
versions of lark-cli's AI skills to downstream agents.

### How it works

Transformation rules and workflow are defined in [`docs/skills/adapt-skill-for-mcp.md`](adapt-skill-for-mcp.md).

Use that skill to dispatch Agents that transform each raw skill. Output is committed to
`docker/skills/` and reviewed before merge. Dockerfile does `COPY skills /app/skills`.

### When upgrading lark-cli

After bumping lark-cli and running `lark-cli update`:

1. Compute the changed skill set (Step 8) from the OLD and NEW `/tmp` clones — re-adaptation is
   **incremental by default** (only changed domains; scope extraction stays full)
2. Follow [`adapt-skill-for-mcp.md`](adapt-skill-for-mcp.md) to re-adapt that set (or **all**
   skills if a full-re-adapt trigger fired: rules or `server.js` changed, skill added/removed)
3. Review the diff: `git diff docker/skills/`
4. Verify (globstar-independent — scans nested reference files, not just top-level SKILL.md):
   `grep -rc 'lark-cli' docker/skills --include='*.md' | grep -v ':0$'` (should be 0 or near-zero)
5. Commit `docker/skills/`

### Files

- `docs/skills/adapt-skill-for-mcp.md` — transformation rules (referenced by Agents)
- `docker/skills/` — adapted output (committed, served at runtime)
- `docker/server.js` — `lark_list_skills` / `lark_get_skill` handlers

## Scope extraction strategy reference

```
Source field priority (per shortcut):
  UserScopes            →  user OAuth scopes (preferred)
  Scopes                →  generic/fallback (when no UserScopes)
  ConditionalUserScopes →  runtime-triggered user scopes (preferred)
  ConditionalScopes     →  runtime-triggered fallback
  BotScopes             →  EXCLUDED (bot-only, not relevant)
```

Why: This project uses user OAuth (3-legged). The scope-allowlist limits incremental-auth
`extra_scope=` parameter to prevent phishing. Bot scopes can never be granted via user
consent, so including them would be noise in the allowlist and confusing for incremental auth.

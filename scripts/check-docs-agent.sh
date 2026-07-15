#!/usr/bin/env bash
# Warn-only, agent-agnostic check: did a code change make docs/agent/* stale?
# Runs in lefthook pre-push. Complements the mechanical scripts/check-invariants.sh
# (which cannot judge semantic drift). NEVER blocks a push: every degraded path
# (no Agent CLI, offline, timeout, parse failure, no relevant changes) prints SKIP
# and exits 0; even a detected inconsistency only prints WARN and exits 0.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

AGENT_TIMEOUT="${DOC_CHECK_AGENT_TIMEOUT:-60}"
DIFF_CHAR_CAP=12000

skip() { echo "SKIP: $1"; exit 0; }

# 1. Determine the push diff range.
#    A native git pre-push hook receives "<local_ref> <local_sha> <remote_ref>
#    <remote_sha>" lines on stdin. NOTE: lefthook does NOT forward that stdin to
#    `run:` jobs, so under lefthook the loop below reads nothing and we fall back.
#    The stdin branch is kept so the script is still correct when invoked as a raw
#    git hook or with the refs piped in manually.
range=""
if [ ! -t 0 ]; then
  while read -r _local_ref local_sha _remote_ref remote_sha; do
    [ -z "${local_sha:-}" ] && continue
    case "$local_sha" in *[!0]*) : ;; *) continue ;; esac  # skip deletes (all-zero local)
    if [ -n "${remote_sha:-}" ] && [ "$remote_sha" != "0000000000000000000000000000000000000000" ]; then
      range="$remote_sha..$local_sha"
    else
      range="$local_sha"  # new branch: no remote base yet
    fi
    break
  done || true
fi
# Fallback (the lefthook path): prefer the real push target's upstream so we only
# check the commits actually being pushed, not the whole branch. Try @{push},
# then @{upstream}, then merge-base with origin/main, then HEAD.
# NOTE: `git rev-parse @{push}` prints the literal token to stdout (exit!=0) when
# no remote-tracking ref exists yet (e.g. first push of a new branch), so resolve
# to a real commit and VERIFY it before use — otherwise the garbage token would
# poison the range and defeat the merge-base fallback.
if [ -z "$range" ]; then
  base=""
  for ref in '@{push}' '@{upstream}'; do
    cand="$(git rev-parse --verify --quiet "${ref}^{commit}" 2>/dev/null || true)"
    if [ -n "$cand" ]; then base="$cand"; break; fi
  done
  if [ -n "$base" ]; then
    range="$base..HEAD"
  else
    mb="$(git merge-base origin/main HEAD 2>/dev/null || true)"
    if [ -n "$mb" ]; then range="$mb..HEAD"; else range="HEAD"; fi
  fi
fi

# 2. Heuristic gate: only proceed if the diff touches doc-relevant code.
#    `|| true` on BOTH branches so a failing git invocation (bad ref, shallow
#    clone, empty repo) degrades to "no changes" → SKIP, never aborts under set -e.
if [ "$range" = "HEAD" ] || ! echo "$range" | grep -q '\.\.'; then
  changed="$(git show --name-only --pretty=format: "$range" 2>/dev/null | sort -u || true)"
else
  changed="$(git diff --name-only "$range" 2>/dev/null || true)"
fi
# Doc-relevant code = the surfaces docs/agent/* actually cite: the JS/TS under
# docker/lambda/infra-lib AND the provisioning/scope files (deploy.sh, scope
# scripts, oauth-scope/shortcut-scope JSON, Dockerfile) that architecture.md and
# invariants.md describe in detail. Tests excluded.
relevant="$(echo "$changed" \
  | grep -E '^(docker|lambda|infra/lib)/.*\.(js|ts|mjs)$|^scripts/(deploy|build-scope-allowlist)\.sh$|^config/oauth-scopes\.json$|^docker/(Dockerfile|shortcut-scopes\.json)$' \
  | grep -vE '(__tests__/|\.test\.)' || true)"
[ -z "$relevant" ] && skip "no doc-relevant code changes in this push"

# 3. Detect an Agent CLI (priority order; first found wins).
AGENT_NAME=""
for c in claude codex gemini kiro-cli cursor-agent llm; do
  if command -v "$c" >/dev/null 2>&1; then AGENT_NAME="$c"; break; fi
done
if [ -z "$AGENT_NAME" ] && [ -n "${DOC_CHECK_AGENT_CMD:-}" ]; then AGENT_NAME="override"; fi
[ -z "$AGENT_NAME" ] && skip "no Agent CLI detected (install claude/codex/gemini/kiro-cli/cursor-agent/llm)"

# run_agent <prompt>  →  prints model stdout; normalized "feed prompt, read stdout".
# Each branch is wrapped in `timeout` directly, so the caller is a plain function
# call (no `export -f`/`bash -c` subshell that couldn't see this function).
run_agent() {
  local prompt="$1"
  case "$AGENT_NAME" in
    claude)       printf '%s' "$prompt" | timeout "$AGENT_TIMEOUT" claude -p ;;
    codex)        printf '%s' "$prompt" | timeout "$AGENT_TIMEOUT" codex exec - ;;
    gemini)       timeout "$AGENT_TIMEOUT" gemini -p "$prompt" ;;
    kiro-cli)     timeout "$AGENT_TIMEOUT" kiro-cli chat --no-interactive --trust-tools= "$prompt" ;;
    cursor-agent) timeout "$AGENT_TIMEOUT" cursor-agent -p "$prompt" --output-format text ;;
    llm)          printf '%s' "$prompt" | timeout "$AGENT_TIMEOUT" llm ;;
    override)     printf '%s' "$prompt" | timeout "$AGENT_TIMEOUT" sh -c "$DOC_CHECK_AGENT_CMD" ;;
  esac
}

# 4. Build the prompt: relevant diff (capped) + the two docs that hold code citations.
diff_text="$(git diff "$range" -- $relevant 2>/dev/null | head -c "$DIFF_CHAR_CAP" || true)"
[ -z "$diff_text" ] && skip "empty diff for relevant files"
arch_doc="$(cat docs/agent/architecture.md 2>/dev/null || true)"
inv_doc="$(cat docs/agent/invariants.md 2>/dev/null || true)"

prompt="You are checking whether a code change has made project documentation factually stale.

Below are (A) a unified diff of changed code files, and (B) two documentation files that describe the code. Decide whether any statement in the docs is now factually WRONG because of the diff. Pay attention to: function/file names, file locations, numeric values (timeouts, limits, counts), and described behavior.

Output ONLY a single line of minified JSON, no prose, no code fences:
{\"consistent\": true} if nothing in the docs is contradicted, or
{\"consistent\": false, \"findings\": [\"<doc file> says X but the code now Y\", ...]} listing each stale statement.
If you are unsure, output {\"consistent\": true} (this is a non-blocking advisory check; avoid false alarms).

=== (A) CODE DIFF ===
$diff_text

=== (B) docs/agent/architecture.md ===
$arch_doc

=== (B) docs/agent/invariants.md ===
$inv_doc"

# 5. Invoke (timeout is inside run_agent per-branch); any failure/empty → SKIP.
#    `head -c` caps the captured output so a runaway/verbose CLI can't balloon
#    memory before `timeout` fires. Notice on stderr so a multi-second push isn't
#    a silent hang.
echo "doc-consistency check: asking $AGENT_NAME (up to ${AGENT_TIMEOUT}s, advisory)..." >&2
raw="$(run_agent "$prompt" 2>/dev/null | head -c 65536 || true)"
[ -z "$raw" ] && skip "Agent check unavailable (no output, timeout, or error)"

# 6. Extract the JSON object and parse with jq. Models often ignore the
#    "single-line, no code fences" instruction, so strip ``` fences and collapse
#    newlines before the greedy { ... } match — this recovers pretty-printed and
#    fenced JSON, which a single-line grep would otherwise silently drop.
cleaned="$(printf '%s' "$raw" | sed 's/```[a-zA-Z]*//g; s/```//g' | tr '\n' ' ')"
json="$(printf '%s' "$cleaned" | grep -oE '\{.*\}' | tail -1 || true)"
[ -z "$json" ] && skip "could not find JSON in Agent output"
consistent="$(echo "$json" | jq -r '.consistent' 2>/dev/null || true)"
case "$consistent" in
  true)  echo "OK: docs appear consistent with this change (checked via $AGENT_NAME)"; exit 0 ;;
  false) : ;;
  *)     skip "could not parse Agent output" ;;
esac

# 7. consistent==false → print findings as warnings, but DO NOT block.
echo "WARN: docs/agent may be stale vs this change (advisory, not blocking) [via $AGENT_NAME]:" >&2
echo "$json" | jq -r '.findings[]?' 2>/dev/null | while IFS= read -r f; do
  echo "  - $f" >&2
done
echo "  → review docs/agent/architecture.md and docs/agent/invariants.md before merging." >&2
exit 0

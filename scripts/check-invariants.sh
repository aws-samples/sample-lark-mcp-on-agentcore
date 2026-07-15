#!/usr/bin/env bash
# Tool-agnostic consistency checks between docs and code.
# Runs in lefthook pre-commit and in test.sh --lint. Fast: no Docker/AWS/network.
# Mirrors the style of scripts/check-lark-cli-version.sh.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

fail=0
note() { echo "FAIL: $1" >&2; fail=1; }

# 1. No stale .claude/skills references in docs/ (regression guard for the drift fix).
if grep -rn "\.claude/skills" docs/ >/dev/null 2>&1; then
  note "docs/ still references .claude/skills (runbooks live in docs/skills/):"
  grep -rn "\.claude/skills" docs/ >&2 || true
fi

# 2. Top-level dirs named in structure docs must exist on disk.
#    Structure block lists dirs as lines like "docker/" or "config/" at column 0.
for doc in docs/structure_en.md docs/structure_zh.md; do
  [ -f "$doc" ] || { note "missing $doc"; continue; }
  while IFS= read -r dir; do
    [ -d "$dir" ] || note "$doc references top-level dir '$dir/' which does not exist"
  done < <(grep -oE '^[a-z][a-z0-9_-]*/' "$doc" | sed 's#/$##' | sort -u)
done

# 3. Bilingual pairing: every docs/*_en.md needs a docs/*_zh.md sibling and vice-versa.
for en in docs/*_en.md; do
  [ -e "$en" ] || continue
  zh="${en%_en.md}_zh.md"
  [ -f "$zh" ] || note "missing Chinese counterpart for $en (expected $zh)"
done
for zh in docs/*_zh.md; do
  [ -e "$zh" ] || continue
  en="${zh%_zh.md}_en.md"
  [ -f "$en" ] || note "missing English counterpart for $zh (expected $en)"
done

# 4. docs/agent/ AI docs must exist (AGENTS.md links to them).
for f in docs/agent/architecture.md docs/agent/invariants.md docs/agent/playbooks.md; do
  [ -f "$f" ] || note "missing AI doc: $f"
done

# 5. AGENTS.md exists and CLAUDE.md imports it.
[ -f AGENTS.md ] || note "missing AGENTS.md (the AI router)"
[ -f CLAUDE.md ] || note "missing CLAUDE.md"
if [ -f CLAUDE.md ] && ! grep -q '@AGENTS.md' CLAUDE.md; then
  note "CLAUDE.md must import the router via '@AGENTS.md'"
fi

# 6. lark-cli version pin coherence (reuse existing checker).
if [ -x scripts/check-lark-cli-version.sh ]; then
  scripts/check-lark-cli-version.sh >/dev/null || note "lark-cli version drift (see check-lark-cli-version.sh)"
fi

if [ "$fail" -ne 0 ]; then
  echo "check-invariants: FAILED" >&2
  exit 1
fi
echo "OK: invariants consistent (docs/code couplings, bilingual pairing, version pin)"

#!/usr/bin/env bash
# Tests for scripts/lib/registry.sh — the file-based app registry + alias
# uniqueness. Pure-shell assertions (no bats). Run: ./registry.test.sh
#
# Contract (from .claude/specs/2026-06-07-multi-app-overview-and-identity.md):
#   - alias is HARD-UNIQUE within the registry (normalized compare).
#   - claim_alias <slug> <alias> succeeds for a new alias, succeeds idempotently
#     for the same slug re-claiming its own alias, and FAILS for a different slug
#     trying to take an in-use alias.
#   - upsert_app records slug/alias/region/endpoint/runtime.
#   - normalization: trim + collapse whitespace + lowercase.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/../registry.sh"

PASS=0; FAIL=0
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }
grn() { printf '\033[0;32m%s\033[0m\n' "$1"; }
ok()   { PASS=$((PASS+1)); }
nok()  { FAIL=$((FAIL+1)); red "FAIL: $1"; }

if [ ! -f "$LIB" ]; then red "registry.sh not found at $LIB (expected — write it next)"; exit 1; fi

# Fresh temp registry per run.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export APPS_REGISTRY="$TMP/apps.json"

# shellcheck source=../registry.sh
source "$LIB"

echo "── claim_alias: first claim succeeds ──"
if claim_alias "team-a" "HR Prod"; then ok; else nok "first claim should succeed"; fi

echo "── claim_alias: same slug re-claims same alias (idempotent) ──"
if claim_alias "team-a" "HR Prod"; then ok; else nok "idempotent re-claim should succeed"; fi

echo "── claim_alias: different slug, same alias -> REJECT ──"
if claim_alias "team-b" "HR Prod"; then nok "duplicate alias must be rejected"; else ok; fi

echo "── claim_alias: normalization (case/space) catches near-duplicates ──"
if claim_alias "team-c" "hr   prod"; then nok "normalized duplicate must be rejected"; else ok; fi

echo "── claim_alias: a genuinely different alias for a new slug succeeds ──"
if claim_alias "team-d" "Finance"; then ok; else nok "distinct alias should succeed"; fi

echo "── upsert_app records a row; list_app_slugs returns it ──"
upsert_app "team-a" "HR Prod" "us-west-2" "https://x.cloudfront.net/mcp" "lark_mcp_on_agentcore_team_a"
slugs="$(list_app_slugs)"
case "$slugs" in *team-a*) ok ;; *) nok "list_app_slugs should contain team-a (got: $slugs)" ;; esac

echo "── get_app_alias returns the stored alias ──"
a="$(get_app_alias team-a)"
if [ "$a" = "HR Prod" ]; then ok; else nok "get_app_alias team-a expected 'HR Prod' got '$a'"; fi

echo "── rename_alias: move team-a to a new free alias ──"
if rename_alias "team-a" "HR Production"; then ok; else nok "rename to free alias should succeed"; fi
a2="$(get_app_alias team-a)"
if [ "$a2" = "HR Production" ]; then ok; else nok "after rename expected 'HR Production' got '$a2'"; fi

echo "── rename_alias: old alias is freed and reusable by another slug ──"
if claim_alias "team-e" "HR Prod"; then ok; else nok "freed alias should be reusable"; fi

echo "── rename_alias: cannot rename onto an in-use alias ──"
if rename_alias "team-d" "Finance2"; then : ; else nok "setup rename should succeed"; fi  # free move first
if rename_alias "team-d" "HR Production"; then nok "rename onto in-use alias must fail"; else ok; fi

# State now: team-a='HR Production', team-d='Finance2', team-e='HR Prod'.

echo "── alias_taken_by_other: a NEW slug taking an in-use alias is flagged ──"
if alias_taken_by_other "team-new" "HR Production"; then ok; else nok "should report taken"; fi

echo "── alias_taken_by_other: normalized match (case/space) is flagged ──"
if alias_taken_by_other "team-new" "  hr   PRODUCTION "; then ok; else nok "normalized alias should be flagged taken"; fi

echo "── alias_taken_by_other: a free alias is NOT flagged ──"
if alias_taken_by_other "team-new" "Brand New Alias"; then nok "free alias must not be flagged"; else ok; fi

echo "── alias_taken_by_other: the SAME slug re-using its own alias is NOT flagged ──"
if alias_taken_by_other "team-a" "HR Production"; then nok "same-slug own alias must not be flagged"; else ok; fi

echo "── slug_registered: an existing slug is reported registered ──"
if slug_registered "team-a"; then ok; else nok "team-a should be registered"; fi

echo "── slug_registered: an unknown slug is NOT registered ──"
if slug_registered "never-deployed"; then nok "unknown slug must not be registered"; else ok; fi

echo ""
echo "── registry.sh: $PASS passed, $FAIL failed ──"
if [ "$FAIL" -gt 0 ]; then red "REGISTRY TESTS FAILED"; exit 1; else grn "ALL REGISTRY TESTS PASSED"; exit 0; fi

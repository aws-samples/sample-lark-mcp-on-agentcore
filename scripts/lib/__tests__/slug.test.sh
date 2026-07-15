#!/usr/bin/env bash
# Tests for scripts/lib/slug.sh — the per-app slug resolver.
#
# Pure-shell assertions (no bats/shellspec dependency, matching repo convention).
# Run directly: ./scripts/lib/__tests__/slug.test.sh   (exit 0 = all pass)
#
# Contract under test (from .claude/specs/2026-06-07-multi-app-slug-namespacing.md):
#   - resolve_slug "<input>" validates + sets SLUG and all per-slug name vars.
#   - empty/unset slug == the reserved DEFAULT sentinel -> byte-identical to today's literals.
#   - invalid slugs (uppercase, slash, underscore, double-hyphen, leading/trailing
#     hyphen, too long, reserved words) -> non-zero exit, no vars trusted.
#   - two transforms: runtime name underscores hyphens; stack ids get -<slug> suffix
#     (WAF shared, unsuffixed).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/../slug.sh"
# shellcheck source=../slug.sh disable=SC1091

PASS=0; FAIL=0
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }
grn() { printf '\033[0;32m%s\033[0m\n' "$1"; }

# assert_eq <label> <expected> <actual>
assert_eq() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1));
  else FAIL=$((FAIL+1)); red "FAIL: $1"; echo "    expected: [$2]"; echo "    actual:   [$3]"; fi
}

# assert_ok <label> -- runs resolve_slug in a subshell, expects exit 0
assert_accepts() {
  local label="$1"; shift
  # shellcheck source=../slug.sh
  if ( source "$LIB"; resolve_slug "$1" >/dev/null 2>&1 ); then PASS=$((PASS+1));
  else FAIL=$((FAIL+1)); red "FAIL (should ACCEPT): $label  input=[$1]"; fi
}

# assert_rejects <label> <input> -- expects non-zero exit
assert_rejects() {
  local label="$1"
  # shellcheck source=../slug.sh
  if ( source "$LIB"; resolve_slug "$2" >/dev/null 2>&1 ); then
    FAIL=$((FAIL+1)); red "FAIL (should REJECT): $label  input=[$2]";
  else PASS=$((PASS+1)); fi
}

# resolve and echo one exported var (subshell-isolated)
# shellcheck source=../slug.sh
val() { ( source "$LIB"; resolve_slug "$1" >/dev/null 2>&1; printf '%s' "${!2}" ); }

if [ ! -f "$LIB" ]; then red "slug.sh not found at $LIB (expected — write it next)"; exit 1; fi

echo "── DEFAULT sentinel (empty) must equal today's byte-identical literals ──"
assert_eq "default SLUG empty"            ""                                          "$(val '' SLUG)"
assert_eq "default SFX empty"             ""                                          "$(val '' SFX)"
assert_eq "default runtime name"          "lark_mcp_on_agentcore"                     "$(val '' RUNTIME_NAME)"
assert_eq "default feishu secret"         "lark-mcp-on-agentcore/feishu-app"          "$(val '' FEISHU_SECRET)"
assert_eq "default users prefix"          "lark-mcp-on-agentcore/users"               "$(val '' SECRET_USERS_PREFIX)"
assert_eq "default state param"           "/lark-mcp-on-agentcore/state-secret"       "$(val '' STATE_PARAM)"
assert_eq "default oauth-secret param"    "/lark-mcp-on-agentcore/oauth-client-secret" "$(val '' OAUTH_SECRET_PARAM)"
assert_eq "default webhook ssm"           "/lark-mcp-on-agentcore/alarm-webhook-url"  "$(val '' WEBHOOK_SSM_NAME)"
assert_eq "default code table"            "lark-mcp-on-agentcore-oauth-codes"         "$(val '' CODE_TABLE)"
assert_eq "default openid table"          "lark-mcp-on-agentcore-openid-map"          "$(val '' OPENID_TABLE)"
assert_eq "default oauth client id"       "lark-mcp-on-agentcore"                     "$(val '' OAUTH_CLIENT_ID)"
assert_eq "default OAuth stack"           "LarkMcpOnAgentCoreOAuth"                   "$(val '' OAUTH_STACK)"
assert_eq "default Runtime stack"         "LarkMcpOnAgentCoreRuntime"                 "$(val '' RUNTIME_STACK)"
assert_eq "default WAF stack"             "LarkMcpOnAgentCoreWaf"                     "$(val '' WAF_STACK)"

echo "── Slugged names (slug=team-a) ──"
assert_eq "slug SLUG"                "team-a"                                      "$(val 'team-a' SLUG)"
assert_eq "slug SFX"                 "-team-a"                                     "$(val 'team-a' SFX)"
assert_eq "slug runtime (us)"        "lark_mcp_on_agentcore_team_a"                "$(val 'team-a' RUNTIME_NAME)"
assert_eq "slug feishu secret"       "lark-mcp-on-agentcore/feishu-app/team-a"     "$(val 'team-a' FEISHU_SECRET)"
assert_eq "slug users prefix"        "lark-mcp-on-agentcore/users/team-a"          "$(val 'team-a' SECRET_USERS_PREFIX)"
assert_eq "slug state param"         "/lark-mcp-on-agentcore/team-a/state-secret"  "$(val 'team-a' STATE_PARAM)"
assert_eq "slug oauth-secret param"  "/lark-mcp-on-agentcore/team-a/oauth-client-secret" "$(val 'team-a' OAUTH_SECRET_PARAM)"
assert_eq "slug webhook ssm"         "/lark-mcp-on-agentcore/team-a/alarm-webhook-url" "$(val 'team-a' WEBHOOK_SSM_NAME)"
assert_eq "slug code table"          "lark-mcp-on-agentcore-oauth-codes-team-a"    "$(val 'team-a' CODE_TABLE)"
assert_eq "slug openid table"        "lark-mcp-on-agentcore-openid-map-team-a"     "$(val 'team-a' OPENID_TABLE)"
assert_eq "slug oauth client id"     "lark-mcp-on-agentcore-team-a"                "$(val 'team-a' OAUTH_CLIENT_ID)"
assert_eq "slug OAuth stack"         "LarkMcpOnAgentCoreOAuth-team-a"              "$(val 'team-a' OAUTH_STACK)"
assert_eq "slug Runtime stack"       "LarkMcpOnAgentCoreRuntime-team-a"            "$(val 'team-a' RUNTIME_STACK)"
assert_eq "WAF stack stays SHARED"   "LarkMcpOnAgentCoreWaf"                       "$(val 'team-a' WAF_STACK)"

echo "── Runtime-name transform is injective (hyphen->underscore) ──"
assert_eq "transform hr-prod"        "lark_mcp_on_agentcore_hr_prod"               "$(val 'hr-prod' RUNTIME_NAME)"
assert_eq "transform a1"             "lark_mcp_on_agentcore_a1"                    "$(val 'a1' RUNTIME_NAME)"

echo "── ACCEPT valid slugs ──"
assert_accepts "single letter"      "a"
assert_accepts "letter+digit"       "a1"
assert_accepts "single hyphen"      "team-a"
assert_accepts "max length 20"      "abcdefghij0123456789"
assert_accepts "digits inside"      "hr2prod"

echo "── REJECT invalid slugs ──"
assert_rejects "empty-not-via-default-path is fine, but explicit reserved 'default'" "default"
assert_rejects "uppercase"          "Team"
assert_rejects "underscore"         "team_a"
assert_rejects "slash"              "team/a"
assert_rejects "leading hyphen"     "-team"
assert_rejects "trailing hyphen"    "team-"
assert_rejects "double hyphen"      "team--a"
assert_rejects "triple hyphen"      "a---b"
assert_rejects "starts with digit"  "1team"
assert_rejects "21 chars"           "abcdefghij0123456789x"
assert_rejects "reserved users"     "users"
assert_rejects "reserved feishu-app" "feishu-app"
assert_rejects "reserved oauth"     "oauth"
assert_rejects "reserved waf"       "waf"
assert_rejects "dot"                "team.a"
assert_rejects "space"              "team a"

echo "── resolve_region: deploy-config is authoritative over a stray AWS_REGION ──"
# Isolated LOCAL_DIR so we never touch the real .local; resolve_region reads
# <LOCAL_DIR>/deploy-config (default app) or <LOCAL_DIR>/apps/<slug>/deploy-config.
region_val() {
  # region_val <slug> <saved-region-or-empty> <aws_region-env> -> printed REGION
  local slug="$1" saved="$2" envreg="$3"
  local tmp; tmp="$(mktemp -d)"
  if [ -n "$saved" ]; then
    if [ -n "$slug" ]; then mkdir -p "$tmp/apps/$slug"; printf 'REGION=%s\n' "$saved" > "$tmp/apps/$slug/deploy-config";
    else printf 'REGION=%s\n' "$saved" > "$tmp/deploy-config"; fi
  fi
  ( source "$LIB"; LOCAL_DIR="$tmp"; resolve_slug "$slug" >/dev/null 2>&1
    if [ -n "$envreg" ]; then export AWS_REGION="$envreg"; else unset AWS_REGION; fi
    resolve_region; printf '%s' "$REGION" )
  rm -rf "$tmp"
}
# Saved region wins even when AWS_REGION points elsewhere (the actual bug).
assert_eq "default: saved beats env"   "us-west-2"  "$(region_val '' 'us-west-2' 'us-east-1')"
assert_eq "slug: saved beats env"      "ap-northeast-1" "$(region_val 'team-a' 'ap-northeast-1' 'us-east-1')"
# No saved config -> fall back to AWS_REGION env.
assert_eq "default: env fallback"      "eu-west-1"   "$(region_val '' '' 'eu-west-1')"
assert_eq "slug: env fallback"         "eu-west-1"   "$(region_val 'team-a' '' 'eu-west-1')"

echo ""
echo "── slug.sh: $PASS passed, $FAIL failed ──"
if [ "$FAIL" -gt 0 ]; then red "SLUG TESTS FAILED"; exit 1; else grn "ALL SLUG TESTS PASSED"; exit 0; fi

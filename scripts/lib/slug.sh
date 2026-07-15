# shellcheck shell=bash
# scripts/lib/slug.sh — single source of truth mapping an app SLUG to every
# per-app physical resource name. Sourced by deploy.sh / ops.sh / teardown.sh /
# upgrade.sh.
#
# Design: .claude/specs/2026-06-07-multi-app-slug-namespacing.md
#
# GOLDEN RULE: an empty/unset slug is the reserved DEFAULT sentinel and resolves
# to today's EXACT physical names with NO suffix/segment/transform, so the
# existing single deployment is byte-identical and undisturbed.
#
# Two transforms only (everything else uses the slug verbatim):
#   #1 AgentCore runtime name — hyphen is ILLEGAL in agentRuntimeName, so
#      hyphens become underscores (`team-a` -> `lark_mcp_on_agentcore_team_a`).
#      Injective because the input validator bans underscores.
#   #2 CFN/CDK stack name — hyphen is legal, so stacks get a `-<slug>` suffix.
#      The WAF stack is SHARED across all apps and is NOT suffixed.
#
# Usage:
#   source scripts/lib/slug.sh
#   resolve_slug "$APP_SLUG"      # validates; exits non-zero on bad input
#   echo "$RUNTIME_NAME" "$FEISHU_SECRET" ...

# Reserved words rejected as explicit input (guards against operator error and
# against a slug colliding with a base resource segment). 'default' is reserved
# because the default sentinel is the EMPTY string, never the literal 'default'.
_SLUG_RESERVED="default users feishu feishu-app state state-secret oauth oauth-codes openid openid-map alarms app admin waf runtime"

# validate_slug <input> : 0 if a valid non-empty slug, non-zero otherwise.
# Empty input is the default sentinel and is handled by resolve_slug, not here.
validate_slug() {
  local s="$1"
  # Shape: lowercase letter first; [a-z0-9-] middle; alphanumeric last; length 1-20.
  # (This regex still admits 'a--b'; the explicit *--* reject below closes that.)
  if ! [[ "$s" =~ ^([a-z]|[a-z][a-z0-9-]{0,18}[a-z0-9])$ ]]; then
    return 1
  fi
  # No consecutive hyphens (the shape regex alone does not forbid them).
  case "$s" in *--*) return 1 ;; esac
  # Reserved words.
  local r
  for r in $_SLUG_RESERVED; do
    [ "$s" = "$r" ] && return 1
  done
  return 0
}

# resolve_slug <input> : validate then export SLUG + every per-slug name var.
# Empty/unset input -> default sentinel -> today's literals.
resolve_slug() {
  local in="${1-}"

  if [ -z "$in" ]; then
    # ── DEFAULT sentinel: byte-identical to today's names ──
    SLUG=""
    SFX=""
    RUNTIME_NAME="lark_mcp_on_agentcore"
    FEISHU_SECRET="lark-mcp-on-agentcore/feishu-app"
    SECRET_USERS_PREFIX="lark-mcp-on-agentcore/users"
    STATE_PARAM="/lark-mcp-on-agentcore/state-secret"
    OAUTH_SECRET_PARAM="/lark-mcp-on-agentcore/oauth-client-secret"
    WEBHOOK_SSM_NAME="/lark-mcp-on-agentcore/alarm-webhook-url"
    CODE_TABLE="lark-mcp-on-agentcore-oauth-codes"
    OPENID_TABLE="lark-mcp-on-agentcore-openid-map"
    OAUTH_CLIENT_ID="lark-mcp-on-agentcore"
    OAUTH_STACK="LarkMcpOnAgentCoreOAuth"
    RUNTIME_STACK="LarkMcpOnAgentCoreRuntime"
    WAF_STACK="LarkMcpOnAgentCoreWaf"
  else
    if ! validate_slug "$in"; then
      echo "Invalid --app slug: '$in'" >&2
      echo "  Must match ^[a-z][a-z0-9-]{0,18}[a-z0-9]\$ (1-20 chars, lowercase, no leading/trailing/double hyphen, no underscore/slash/uppercase) and not be a reserved word." >&2
      return 2
    fi
    # transform #1: hyphen -> underscore for the AgentCore runtime name
    local slug_us="${in//-/_}"
    SLUG="$in"
    SFX="-$in"
    RUNTIME_NAME="lark_mcp_on_agentcore_${slug_us}"
    FEISHU_SECRET="lark-mcp-on-agentcore/feishu-app/${in}"          # slash delimiter (Killer Fix #1)
    SECRET_USERS_PREFIX="lark-mcp-on-agentcore/users/${in}"         # path segment (Killer Fix #3)
    STATE_PARAM="/lark-mcp-on-agentcore/${in}/state-secret"         # path segment (Killer Fix #2)
    OAUTH_SECRET_PARAM="/lark-mcp-on-agentcore/${in}/oauth-client-secret"
    WEBHOOK_SSM_NAME="/lark-mcp-on-agentcore/${in}/alarm-webhook-url"
    CODE_TABLE="lark-mcp-on-agentcore-oauth-codes-${in}"
    OPENID_TABLE="lark-mcp-on-agentcore-openid-map-${in}"
    OAUTH_CLIENT_ID="lark-mcp-on-agentcore-${in}"
    OAUTH_STACK="LarkMcpOnAgentCoreOAuth-${in}"                     # transform #2: stack suffix
    RUNTIME_STACK="LarkMcpOnAgentCoreRuntime-${in}"
    WAF_STACK="LarkMcpOnAgentCoreWaf"                              # SHARED, never suffixed
  fi

  export SLUG SFX RUNTIME_NAME FEISHU_SECRET SECRET_USERS_PREFIX STATE_PARAM \
    OAUTH_SECRET_PARAM WEBHOOK_SSM_NAME CODE_TABLE OPENID_TABLE OAUTH_CLIENT_ID \
    OAUTH_STACK RUNTIME_STACK WAF_STACK
  return 0
}

# list_user_secret_names: the SINGLE source of truth for enumerating THIS app's
# user-token secrets. Killer Fix #3 (two-part screen): the Secrets Manager `name`
# filter is a PREFIX match, so filtering by `${SECRET_USERS_PREFIX}/` also matches
# another app's nested `users/<slug>/<openid>`; the `^…/[^/]+$` single-segment
# grep then drops those. This guard lives here (sourced by deploy/ops/teardown)
# so a fix can never drift between the listing site and the force-delete site.
# Requires REGION and SECRET_USERS_PREFIX to be set (after resolve_slug).
list_user_secret_names() {
  aws secretsmanager list-secrets --region "${REGION:-us-west-2}" \
    --filters "Key=name,Values=${SECRET_USERS_PREFIX}/" \
    --query 'SecretList[].Name' --output text 2>/dev/null \
    | tr '\t' '\n' \
    | grep -E "^${SECRET_USERS_PREFIX}/[^/]+$" || true
}

# resolve_region: the SINGLE source of truth for which region an app lives in,
# shared by ops.sh / teardown.sh / upgrade.sh so they never drift from where
# deploy.sh actually deployed. Precedence (highest first):
#   1. the REGION saved in this app's deploy-config (the authoritative value
#      deploy.sh wrote at deploy time — per-app for a slug, root for default)
#   2. AWS_REGION env (explicit operator override)
#   3. `aws configure get region`
#   4. us-west-2 fallback
# Why deploy-config beats the env: an unrelated AWS_REGION in the shell (e.g. an
# EC2 box defaulting to us-east-1) otherwise makes ops/teardown query the WRONG
# region — status under-counts users, and teardown can miss resources entirely.
# Requires LOCAL_DIR and SLUG to be set (i.e. call AFTER resolve_slug).
resolve_region() {
  local cfg
  if [ -n "${SLUG:-}" ]; then
    cfg="${LOCAL_DIR}/apps/${SLUG}/deploy-config"
  else
    cfg="${LOCAL_DIR}/deploy-config"
  fi
  local saved=""
  if [ -f "$cfg" ]; then
    saved=$(grep '^REGION=' "$cfg" 2>/dev/null | cut -d= -f2- || echo "")
  fi
  if [ -n "$saved" ]; then
    REGION="$saved"
  else
    REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo us-west-2)}"
  fi
  export REGION
}

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DIR="${PROJECT_DIR}/.local"
# REGION is resolved AFTER resolve_slug (see resolve_region in lib/slug.sh): the
# per-app deploy-config is authoritative, so ops never drifts from where deploy
# actually shipped. A stray AWS_REGION in the shell must not silently redirect
# queries to the wrong region.

# --app <slug>: operate on a specific app (empty = default app, byte-identical
# names). Parse it out of the args before the subcommand so `ops.sh list-users
# --app team-a` and `ops.sh --app team-a list-users` both work.
APP_SLUG="${APP_SLUG:-}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --app)   APP_SLUG="${2:-}"; shift 2 ;;
    --app=*) APP_SLUG="${1#--app=}"; shift ;;
    *)       ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]}"

# shellcheck source=lib/slug.sh
source "${SCRIPT_DIR}/lib/slug.sh"
resolve_slug "$APP_SLUG" || exit 1
resolve_region
APPS_REGISTRY="${LOCAL_DIR}/apps.json"
export APPS_REGISTRY
# shellcheck source=lib/registry.sh
source "${SCRIPT_DIR}/lib/registry.sh"

get_oauth_fn() {
  aws cloudformation describe-stacks --stack-name "$OAUTH_STACK" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`OAuthFunctionName`].OutputValue' --output text 2>/dev/null || echo ""
}

# list_user_secret_names is provided by scripts/lib/slug.sh (shared with
# teardown.sh) so the Killer Fix #3 single-segment screen has one source of truth.

case "${1:-help}" in
  list-users)
    echo "Authorized users (app: ${SLUG:-default}):"
    list_user_secret_names | sed 's#^#  #' || true
    ;;
  list-apps)
    echo "Deployed apps:"
    echo "  default  (lark_mcp_on_agentcore)"
    if [ -f "$APPS_REGISTRY" ]; then
      while IFS= read -r s; do
        [ -z "$s" ] && continue
        printf '  %s  (%s)\n' "$(get_app_alias "$s")" "$s"
      done < <(list_app_slugs)
    fi
    ;;
  rename)
    NEW_ALIAS="${2:?Usage: ops.sh rename --app <slug> <new-alias>}"
    if [ -z "$SLUG" ]; then echo "  rename requires --app <slug> (the default app has no alias)"; exit 1; fi
    if rename_alias "$SLUG" "$NEW_ALIAS"; then
      # Refresh the alarm-webhook Lambda's APP_ALIAS so alert cards show the new name.
      WEBHOOK_FN=$(aws cloudformation describe-stacks --stack-name "$OAUTH_STACK" --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`AlarmWebhookFunctionName`].OutputValue' --output text 2>/dev/null || echo "")
      if [ -n "$WEBHOOK_FN" ] && [ "$WEBHOOK_FN" != "None" ]; then
        CURRENT_ENV=$(aws lambda get-function-configuration --function-name "$WEBHOOK_FN" --region "$REGION" \
          --query 'Environment.Variables' --output json 2>/dev/null || echo '{}')
        ENV_FILE=$(mktemp); chmod 600 "$ENV_FILE"
        NEW_ALIAS="$NEW_ALIAS" python3 -c '
import json, os, sys
env = json.loads(sys.stdin.read() or "{}")
env["APP_ALIAS"] = os.environ["NEW_ALIAS"]
print(json.dumps({"Variables": env}))
' <<< "$CURRENT_ENV" > "$ENV_FILE"
        aws lambda update-function-configuration --function-name "$WEBHOOK_FN" \
          --environment "file://$ENV_FILE" --region "$REGION" >/dev/null 2>&1 || true
        rm -f "$ENV_FILE"
      fi
      echo "  Renamed to '${NEW_ALIAS}' ✓"
    else
      echo "  Alias '${NEW_ALIAS}' is already in use; pick another."; exit 1
    fi
    ;;
  revoke)
    USER="${2:?Usage: ops.sh revoke --app <slug> <user_id>}"
    # user_id is a single Feishu open_id / hex segment — never contains '/'.
    # Reject any slash so a crafted id like 'team-a/ou_victim' can't escape this
    # app's namespace and force-delete another app's nested user secret (the
    # IAM/runtime isolation boundary; mirrors the listAllUserSecrets [^/]+ screen).
    case "$USER" in
      */*|"") echo "  Invalid user_id: '${USER}' (must not contain '/')" >&2; exit 1 ;;
    esac
    SECRET_ID="${SECRET_USERS_PREFIX}/${USER}"
    echo "  Will permanently delete secret: ${SECRET_ID}"
    read -rp "  Revoke ${USER}'s token (app: ${SLUG:-default})? (y/N) " CONFIRM
    if [[ "$CONFIRM" =~ ^[yY] ]]; then
      aws secretsmanager delete-secret --secret-id "$SECRET_ID" --force-delete-without-recovery --region "$REGION" 2>&1
      echo "  Revoked ✓"
    fi
    ;;
  refresh-all)
    echo "Triggering manual refresh (app: ${SLUG:-default})..."
    LAMBDA_FN=$(get_oauth_fn)
    if [ -z "$LAMBDA_FN" ]; then echo "  OAuth Lambda not found"; exit 1; fi
    aws lambda invoke --function-name "$LAMBDA_FN" --payload '{"source":"aws.events"}' --region "$REGION" /tmp/refresh-out.json 2>&1 | head -2
    python3 -m json.tool < /tmp/refresh-out.json
    ;;
  logs)
    echo "Recent Lambda logs (app: ${SLUG:-default}):"
    LAMBDA_FN=$(get_oauth_fn)
    if [ -z "$LAMBDA_FN" ]; then echo "  OAuth Lambda not found"; exit 1; fi
    aws logs tail "/aws/lambda/${LAMBDA_FN}" --region "$REGION" --since 1h --format short 2>/dev/null | tail -20 || echo "  No logs found"
    ;;
  status)
    echo "=== System status (app: ${SLUG:-default}) ==="
    echo ""
    USERS=$(list_user_secret_names | grep -c . || true)
    echo "  Authorized users: ${USERS}"
    echo "  Runtime:          ${RUNTIME_NAME}"
    EB_RULE=$(aws events list-rules --name-prefix "$OAUTH_STACK" --region "$REGION" --query 'Rules[0].Name' --output text 2>/dev/null || echo "")
    if [ -z "$EB_RULE" ] || [ "$EB_RULE" = "None" ]; then EB="not found"; else
    EB=$(aws events describe-rule --name "$EB_RULE" --region "$REGION" --query 'State' --output text 2>/dev/null || echo "not found"); fi
    echo "  Token refresh:    ${EB}"
    echo ""
    ;;
  destroy)
    echo "Destroying AgentCore Runtime (app: ${SLUG:-default})..."
    RUNTIME_ID=$(RUNTIME_NAME="$RUNTIME_NAME" REGION="$REGION" python3 -c "
import boto3, os
c = boto3.client('bedrock-agentcore-control', region_name=os.environ['REGION'])
target = os.environ['RUNTIME_NAME']
next_token = None
while True:
    kwargs = {'nextToken': next_token} if next_token else {}
    resp = c.list_agent_runtimes(**kwargs)
    for r in resp.get('agentRuntimes', []):
        if r.get('agentRuntimeName') == target:
            print(r['agentRuntimeId']); exit(0)
    next_token = resp.get('nextToken')
    if not next_token: break
" 2>/dev/null)
    if [ -n "$RUNTIME_ID" ]; then
      read -rp "  Delete Runtime ${RUNTIME_ID} (${RUNTIME_NAME})? (y/N) " CONFIRM
      if [[ "$CONFIRM" =~ ^[yY] ]]; then
        RUNTIME_ID="$RUNTIME_ID" REGION="$REGION" python3 -c "
import boto3, time, os
c = boto3.client('bedrock-agentcore-control', region_name=os.environ['REGION'])
rid = os.environ['RUNTIME_ID']
try: c.delete_agent_runtime_endpoint(agentRuntimeId=rid, endpointName='ep')
except Exception: pass
time.sleep(3)
c.delete_agent_runtime(agentRuntimeId=rid)
print('  Deleted ✓')
"
      fi
    else
      echo "  AgentCore Runtime not found (${RUNTIME_NAME})."
    fi
    ;;
  rotate-secret)
    echo "Rotating OAuth Client Secret (app: ${SLUG:-default})..."
    NEW_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    SEC_FILE=$(mktemp); chmod 600 "$SEC_FILE"
    printf '%s' "$NEW_SECRET" > "$SEC_FILE"
    aws ssm put-parameter --name "$OAUTH_SECRET_PARAM" --value "file://$SEC_FILE" \
      --type SecureString --overwrite --region "$REGION" >/dev/null 2>&1
    rm -f "$SEC_FILE"
    aws ssm add-tags-to-resource \
      --resource-type Parameter \
      --resource-id "$OAUTH_SECRET_PARAM" \
      --tags "Key=project,Value=lark-mcp-on-agentcore" \
      --region "$REGION" >/dev/null 2>&1 || true
    LAMBDA_FN=$(get_oauth_fn)
    if [ -n "$LAMBDA_FN" ]; then
      CURRENT_ENV=$(aws lambda get-function-configuration --function-name "$LAMBDA_FN" --region "$REGION" \
        --query 'Environment.Variables' --output json 2>/dev/null)
      ENV_FILE=$(mktemp); chmod 600 "$ENV_FILE"
      NEW_SECRET="$NEW_SECRET" python3 -c '
import json, os, sys
env = json.loads(sys.stdin.read())
env["OAUTH_CLIENT_SECRET"] = os.environ["NEW_SECRET"]
print(json.dumps({"Variables": env}))
' <<< "$CURRENT_ENV" > "$ENV_FILE"
      aws lambda update-function-configuration --function-name "$LAMBDA_FN" \
        --environment "file://$ENV_FILE" --region "$REGION" >/dev/null 2>&1
      rm -f "$ENV_FILE"
    fi
    echo ""
    echo "  New Client Secret: ${NEW_SECRET:0:8}..."
    echo ""
    echo "  ⚠ Note:"
    echo "    1. Already-issued MCP tokens stay valid (STATE_SECRET unchanged)"
    echo "    2. Update the Client Secret in your Quick Desktop connector"
    echo ""
    echo "  Updated ✓"
    ;;
  rebuild-registry)
    # Rebuild .local/apps.json from AWS (the source of truth). The registry is a
    # local convenience index (list-apps / upgrade --rest / alias-uniqueness); if it
    # is lost or you deploy from a new machine, this re-discovers every named app by
    # enumerating its CloudFormation OAuth stack (LarkMcpOnAgentCoreOAuth-<slug>).
    # The default app has no registry row (no alias), so it is skipped.
    echo "Rebuilding app registry from AWS (region: ${REGION})..."
    STACKS=$(aws cloudformation list-stacks --region "$REGION" \
      --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
      --query 'StackSummaries[?starts_with(StackName, `LarkMcpOnAgentCoreOAuth-`)].StackName' \
      --output text 2>/dev/null | tr '\t' '\n' || true)
    if [ -z "$STACKS" ]; then
      echo "  No named-app (slug) OAuth stacks found. Registry left unchanged."
      echo "  (The default app needs no registry entry.)"
      exit 0
    fi
    COUNT=0
    while IFS= read -r stack; do
      [ -z "$stack" ] && continue
      s="${stack#LarkMcpOnAgentCoreOAuth-}"   # slug = stack name minus the prefix
      # Endpoint + alias-source come from the stack's own outputs.
      ENDPOINT=$(aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`OAuthEndpoint`].OutputValue' --output text 2>/dev/null || echo "")
      WEBHOOK_FN=$(aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`AlarmWebhookFunctionName`].OutputValue' --output text 2>/dev/null || echo "")
      # Alias is a local-only concept; the only place AWS may hold it is the alarm
      # webhook Lambda's APP_ALIAS env. If no webhook was configured, fall back to slug.
      ALIAS="$s"
      if [ -n "$WEBHOOK_FN" ] && [ "$WEBHOOK_FN" != "None" ]; then
        A=$(aws lambda get-function-configuration --function-name "$WEBHOOK_FN" --region "$REGION" \
          --query 'Environment.Variables.APP_ALIAS' --output text 2>/dev/null || echo "")
        [ -n "$A" ] && [ "$A" != "None" ] && ALIAS="$A"
      fi
      # Runtime name comes from the authoritative resolver (no duplicated transform).
      # resolve_slug runs in a subshell so it can't clobber our loop's exported vars.
      RUNTIME_NAME_REBUILD=$( resolve_slug "$s" >/dev/null 2>&1 && printf '%s' "$RUNTIME_NAME" )
      upsert_app "$s" "$ALIAS" "$REGION" "$ENDPOINT" "$RUNTIME_NAME_REBUILD"
      printf '  ✓ %s  (%s)\n' "$ALIAS" "$s"
      COUNT=$((COUNT+1))
    done <<< "$STACKS"
    echo "  Rebuilt ${COUNT} app entr$([ "$COUNT" = 1 ] && echo y || echo ies) → ${APPS_REGISTRY}"
    echo "  Note: alias falls back to the slug when no alarm webhook was configured; fix with 'ops.sh rename'."
    ;;
  help|*)
    echo "Usage: ./scripts/ops.sh [--app <slug>] <command>"
    echo ""
    echo "Commands:"
    echo "  list-users        List all authorized users"
    echo "  list-apps         List all deployed apps (alias + slug)"
    echo "  rebuild-registry  Rebuild the local app registry from AWS (after losing .local/apps.json)"
    echo "  rename            Rename an app's alias (--app <slug> <new-alias>)"
    echo "  revoke            Revoke a user's token"
    echo "  refresh-all       Trigger a manual token refresh"
    echo "  logs              View recent Lambda logs"
    echo "  status            System overview"
    echo "  rotate-secret     Rotate the OAuth Client Secret"
    echo "  destroy           Delete the AgentCore Runtime (Runtime only; for full teardown use ./scripts/teardown.sh)"
    echo ""
    echo "  --app <slug>      Target a specific app (omit for the default app)"
    ;;
esac

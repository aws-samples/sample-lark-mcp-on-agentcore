#!/usr/bin/env bash
# Tear down AWS resources for ONE app deployment (default app unless --app given).
# Order: AgentCore Runtime → CDK stacks (deploy region) → shared WAF (only when no
# other app still consumes it) → user-token Secrets Manager entries (optional).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# shellcheck disable=SC2034  # consumed by resolve_region in the sourced lib/slug.sh
LOCAL_DIR="${PROJECT_DIR}/.local"
# REGION is resolved AFTER resolve_slug via resolve_region (lib/slug.sh): the
# per-app deploy-config is authoritative. Critical for teardown — a stray
# AWS_REGION pointing at the wrong region would make us miss live resources
# (leaving them billing) or operate in a region with nothing to delete.

# --app <slug>: tear down a specific app (empty = default app).
APP_SLUG="${APP_SLUG:-}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --app)   APP_SLUG="${2:-}"; shift 2 ;;
    --app=*) APP_SLUG="${1#--app=}"; shift ;;
    *)       ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# shellcheck source=lib/slug.sh
source "${SCRIPT_DIR}/lib/slug.sh"
resolve_slug "$APP_SLUG" || exit 1
resolve_region

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step()  { echo -e "\n${GREEN}=== $1 ===${NC}\n"; }
warn()  { echo -e "${YELLOW}  ⚠ $1${NC}"; }

# count_other_oauth_consumers: OAuth stacks for OTHER apps that still read the
# shared WAF's cross-region export. The WAF must not be destroyed while any
# remain (CFN rejects destroying a still-referenced cross-region producer).
count_other_oauth_consumers() {
  aws cloudformation list-stacks --region "$REGION" \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE ROLLBACK_COMPLETE \
    --query "StackSummaries[?starts_with(StackName, 'LarkMcpOnAgentCoreOAuth')].StackName" \
    --output text 2>/dev/null | tr '\t' '\n' | grep -v "^${OAUTH_STACK}$" | grep -c . || true
}

if [ "${TEARDOWN_YES:-0}" != "1" ]; then
  echo ""
  warn "This will destroy the AgentCore Runtime and CDK stacks for app '${SLUG:-default}'."
  warn "  App:              ${SLUG:-default}"
  warn "  Region:           $REGION"
  warn "  Shared WAF:        destroyed only if no other app still uses it"
  warn "  User tokens:      will prompt before deleting"
  read -rp "  Continue? (type 'yes' to proceed): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "  Aborted."
    exit 0
  fi
fi

# 1. AgentCore Runtime + Endpoint (not managed by CDK).
step "AgentCore Runtime (${RUNTIME_NAME})"
RUNTIME_ID=$(RUNTIME_NAME="$RUNTIME_NAME" REGION="$REGION" python3 -c "
import boto3, os
c = boto3.client('bedrock-agentcore-control', region_name=os.environ['REGION'])
target = os.environ['RUNTIME_NAME']
nt = None
while True:
    kw = {'nextToken': nt} if nt else {}
    r = c.list_agent_runtimes(**kw)
    for x in r.get('agentRuntimes', []):
        if x.get('agentRuntimeName') == target:
            print(x['agentRuntimeId']); exit(0)
    nt = r.get('nextToken')
    if not nt: break
" 2>/dev/null || echo "")

if [ -n "$RUNTIME_ID" ]; then
  echo "  Found Runtime: $RUNTIME_ID"
  RUNTIME_ID="$RUNTIME_ID" REGION="$REGION" python3 -c "
import boto3, time, os
c = boto3.client('bedrock-agentcore-control', region_name=os.environ['REGION'])
rid = os.environ['RUNTIME_ID']
try: c.delete_agent_runtime_endpoint(agentRuntimeId=rid, endpointName='ep')
except Exception as e: print(f'  endpoint delete: {e}')
time.sleep(3)
try:
    c.delete_agent_runtime(agentRuntimeId=rid)
    print('  Runtime deleted')
except Exception as e: print(f'  runtime delete failed: {e}')
"
else
  echo "  No Runtime found (${RUNTIME_NAME}), skipping"
fi

# 2. CDK stacks (this app's OAuth + Runtime).
step "CDK stacks ($REGION)"
( cd "${PROJECT_DIR}/infra" && AWS_REGION="$REGION" npx cdk destroy "$OAUTH_STACK" "$RUNTIME_STACK" -c "slug=${SLUG}" --force ) || warn "Some CDK destroy steps failed"

# 3. Shared WAF — destroy ONLY when no other app still consumes it.
if [ "${SKIP_WAF:-0}" != "1" ]; then
  OTHERS=$(count_other_oauth_consumers)
  if [ "$OTHERS" -gt 0 ]; then
    warn "Shared WAF (${WAF_STACK}) left in place — ${OTHERS} other app(s) still use it."
  else
    step "CDK stacks (us-east-1, shared WAF)"
    ( cd "${PROJECT_DIR}/infra" && AWS_REGION="us-east-1" SKIP_WAF=0 npx cdk destroy "$WAF_STACK" -c "slug=${SLUG}" --force ) || warn "WAF destroy failed"
  fi
fi

# 4. User-token secrets — confirm before deleting (real authorizations).
# Killer Fix #3 screen: the default app's prefix also prefix-matches other apps'
# nested users/<slug>/<openid>; the [^/]+ filter excludes them so an irreversible
# --force-delete here never destroys another app's tokens.
# list_user_secret_names is provided by scripts/lib/slug.sh (shared with ops.sh),
# applying the Killer Fix #3 single-segment screen so this irreversible
# --force-delete never reaches another app's nested users/<slug>/<openid> secrets.
step "User token secrets (app: ${SLUG:-default})"
USER_COUNT=$(list_user_secret_names | grep -c . || true)
if [ "${USER_COUNT:-0}" -gt 0 ]; then
  warn "Found ${USER_COUNT} user-token secret(s)."
  read -rp "  Delete all user tokens? Users will need to re-authorize. (type 'yes' to proceed) " confirm
  if [ "$confirm" = "yes" ]; then
    list_user_secret_names | while read -r name; do
      [ -n "$name" ] && aws secretsmanager delete-secret --secret-id "$name" \
        --force-delete-without-recovery --region "$REGION" >/dev/null 2>&1 || true
    done
    echo "  User tokens deleted"
  fi
fi

# 5. Preserved resources (kept by default).
echo ""
echo "  Remaining (preserved by default):"
echo "    - secret  ${FEISHU_SECRET}"
echo "    - ssm     ${STATE_PARAM}"
echo "    - ssm     ${OAUTH_SECRET_PARAM}"
echo "    - dynamodb ${OPENID_TABLE}  (RETAIN — survives stack deletion)"
echo ""
if [ -n "$SLUG" ]; then
  warn "The openid-map table (${OPENID_TABLE}) has removalPolicy RETAIN, so it is"
  warn "NOT deleted by 'cdk destroy'. You MUST delete it manually before any future"
  warn "re-deploy of app '${SLUG}', or the redeploy fails with 'table already exists':"
  echo "    aws dynamodb delete-table --table-name ${OPENID_TABLE} --region $REGION"
fi
echo ""
echo "  To purge the preserved resources:"
echo "    aws secretsmanager delete-secret --secret-id ${FEISHU_SECRET} --force-delete-without-recovery --region $REGION"
echo "    aws ssm delete-parameter --name ${STATE_PARAM} --region $REGION"
echo "    aws ssm delete-parameter --name ${OAUTH_SECRET_PARAM} --region $REGION"
echo "    aws dynamodb delete-table --table-name ${OPENID_TABLE} --region $REGION"
echo ""
echo -e "${GREEN}Teardown complete (app: ${SLUG:-default}).${NC}"

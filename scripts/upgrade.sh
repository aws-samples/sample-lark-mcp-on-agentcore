#!/usr/bin/env bash
# scripts/upgrade.sh — coordinated multi-app upgrade.
#
# One source tree, N env-differentiated deployments. Re-running deploy.sh IS an
# upgrade (it rebuilds the content-addressed image once, then each app's runtime
# repoints to the shared ECR tag — build-once / repoint-N). This wrapper loops
# deploy.sh over the app registry with a canary-first option and an image-version
# rollback.
#
# Usage:
#   ./scripts/upgrade.sh --canary        # upgrade ONLY the default app, then verify
#   ./scripts/upgrade.sh --rest          # upgrade every NAMED app in the registry
#   ./scripts/upgrade.sh --all           # canary (default) then --rest
#   ./scripts/upgrade.sh --rollback <slug>   # repin <slug>'s endpoint to its previous runtime version
#   ./scripts/upgrade.sh --list          # show registered apps
#
# Design: .claude/specs/2026-06-07-multi-app-upgrade-observability.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DIR="${PROJECT_DIR}/.local"
# Initial fallback only. canary/rest delegate to deploy.sh (which resolves its
# own region from deploy-config); --rollback overrides this via resolve_region
# after resolve_slug so it targets the app's actual deploy region, not a stray
# AWS_REGION in the shell.
REGION="${AWS_REGION:-us-west-2}"

APPS_REGISTRY="${LOCAL_DIR}/apps.json"
export APPS_REGISTRY
# shellcheck source=lib/registry.sh
source "${SCRIPT_DIR}/lib/registry.sh"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}  $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
err()  { echo -e "${RED}  ✗ $1${NC}"; }
hdr()  { echo -e "\n${GREEN}=== $1 ===${NC}"; }

upgrade_one() {
  local slug="$1"
  hdr "Upgrading app: ${slug:-default}"
  if [ -z "$slug" ]; then
    ( cd "$PROJECT_DIR" && ./scripts/deploy.sh --yes )
  else
    ( cd "$PROJECT_DIR" && ./scripts/deploy.sh --app "$slug" --yes )
  fi
}

canary() {
  hdr "Canary: upgrading DEFAULT app first"
  upgrade_one ""
  info "Canary upgrade complete. deploy.sh ran its built-in post-deploy verify."
  info "Observe the default app, then run: ./scripts/upgrade.sh --rest"
}

rest() {
  local slugs
  slugs="$(list_app_slugs)"
  if [ -z "$slugs" ]; then
    warn "No named apps in the registry (${APPS_REGISTRY}). Nothing to do."
    return 0
  fi
  local failed=()
  while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    if ! upgrade_one "$slug"; then
      err "Upgrade FAILED for app '${slug}' — continuing with the rest."
      failed+=("$slug")
    fi
  done <<< "$slugs"
  echo ""
  if [ "${#failed[@]}" -gt 0 ]; then
    err "Failed apps: ${failed[*]}"
    return 1
  fi
  info "All named apps upgraded ✓"
}

rollback() {
  local slug="$1"
  [ -z "$slug" ] && { err "--rollback requires a slug"; exit 2; }
  # Resolve the runtime name for this slug.
  # shellcheck source=lib/slug.sh
  source "${SCRIPT_DIR}/lib/slug.sh"
  resolve_slug "$slug" || exit 1
  resolve_region   # per-app deploy-config is authoritative; don't trust a stray AWS_REGION
  hdr "Rollback: repinning ${RUNTIME_NAME} endpoint to its previous version"
  warn "Image-only rollback is SAFE ONLY if scopes did not change between versions."
  warn "If the upgrade touched OAuth scopes, abort and instead run:"
  warn "    git checkout <prev-commit> && ./scripts/deploy.sh --app ${slug} --yes"
  read -rp "  Proceed with endpoint version rollback? (type 'yes'): " c
  [ "$c" = "yes" ] || { echo "  Aborted."; exit 0; }

  RUNTIME_NAME="$RUNTIME_NAME" REGION="$REGION" python3 - <<'PY'
import boto3, os, sys
region = os.environ['REGION']; target = os.environ['RUNTIME_NAME']
c = boto3.client('bedrock-agentcore-control', region_name=region)

# Find the runtime id by name.
rid = None; nt = None
while True:
    kw = {'nextToken': nt} if nt else {}
    r = c.list_agent_runtimes(**kw)
    for x in r.get('agentRuntimes', []):
        if x.get('agentRuntimeName') == target:
            rid = x['agentRuntimeId']; break
    if rid: break
    nt = r.get('nextToken')
    if not nt: break
if not rid:
    print(f"  runtime {target} not found", file=sys.stderr); sys.exit(1)

# List versions; guard that a previous version still exists (old versions age out).
try:
    versions = []
    nt = None
    while True:
        kw = {'agentRuntimeId': rid, 'nextToken': nt} if nt else {'agentRuntimeId': rid}
        vr = c.list_agent_runtime_versions(**kw)
        versions += [v.get('agentRuntimeVersion') for v in vr.get('agentRuntimeVersions', [])]
        nt = vr.get('nextToken')
        if not nt: break
except Exception as e:
    print(f"  cannot list runtime versions ({e}); ABORTING.", file=sys.stderr)
    print("  Use the full-rebuild rollback: git checkout <prev> && deploy.sh --app <slug> --yes", file=sys.stderr)
    sys.exit(1)

nums = sorted({int(v) for v in versions if str(v).isdigit()})
if len(nums) < 2:
    print(f"  only versions {nums} exist — no previous version to roll back to.", file=sys.stderr)
    print("  Use the full-rebuild rollback path instead.", file=sys.stderr)
    sys.exit(1)
prev = str(nums[-2])
print(f"  repinning endpoint 'ep' to version {prev} (available: {nums})")
c.update_agent_runtime_endpoint(agentRuntimeId=rid, endpointName='ep', agentRuntimeVersion=prev)
print("  rolled back ✓")
PY
}

case "${1:-help}" in
  --canary)   canary ;;
  --rest)     rest ;;
  --all)      canary; rest ;;
  --rollback) rollback "${2:-}" ;;
  --list)
    echo "Registered apps:"
    echo "  default"
    list_app_slugs | sed 's/^/  /'
    ;;
  help|*)
    sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac

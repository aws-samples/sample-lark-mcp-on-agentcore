#!/usr/bin/env bash
# scripts/upgrade.sh — coordinated multi-app upgrade.
#
# One source tree, N env-differentiated deployments. Re-running deploy.sh IS an
# upgrade (it rebuilds the content-addressed image once, then each app's runtime
# repoints to the shared ECR tag — build-once / repoint-N). This wrapper loops
# deploy.sh over the app registry with a canary-first option.
#
# Usage:
#   ./scripts/upgrade.sh --canary        # upgrade ONLY the default app, then verify
#   ./scripts/upgrade.sh --rest          # upgrade every NAMED app in the registry
#   ./scripts/upgrade.sh --all           # canary (default) then --rest
#   ./scripts/upgrade.sh --rollback <slug>   # prints how to roll back (redeploy the previous commit)
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
  # The runtime is a CloudFormation resource and traffic uses the service-managed
  # DEFAULT endpoint, which always serves the latest version. Repinning an
  # endpoint to an older version would not move traffic (and changing the
  # runtime out of band would drift the stack), so rollback = redeploy the
  # previous commit.
  local slug="${1:-}"
  [ -z "$slug" ] && { err "--rollback requires a slug"; exit 2; }
  err "Endpoint-version rollback is no longer supported (the runtime is managed by CloudFormation)."
  info "Roll back by redeploying the previous commit:"
  info "    git checkout <prev-commit> && ./scripts/deploy.sh --app ${slug} --yes"
  exit 2
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

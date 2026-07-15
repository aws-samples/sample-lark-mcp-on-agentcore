#!/usr/bin/env bash
# scripts/test.sh — single entry point for all tests in this repo.
#
# Tiers (can be selected individually):
#   --unit          vitest (lambda + docker + CDK snapshot + MCP contract)
#   --coverage      vitest with v8 coverage report
#   --mutation      stryker mutation testing (~7 min, finds weak assertions)
#   --smoke         docker container build + local HTTP smoke test (needs Docker)
#   --mcp-protocol  MCP protocol validation against spec (needs Docker + jq)
#   --typecheck     tsc --noEmit on lambda + infra
#   --lint          bash -n + eslint on source
#   --audit         scripts/audit-tools.sh (needs AWS or --catalog)
#   --e2e           scripts/test-e2e.sh (needs deployed stack)
#   --all           all offline tiers (unit + typecheck + lint)
#   --full          all tiers including smoke + mcp-protocol + audit + e2e
#
# Default (no args): --all (offline only, safe to run anywhere)
#
# Examples:
#   ./scripts/test.sh                  # offline: unit + typecheck + lint
#   ./scripts/test.sh --coverage       # unit with coverage report
#   ./scripts/test.sh --full           # everything including AWS-dependent
#   ./scripts/test.sh --audit --catalog generated-tools.json
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
hdr() { echo -e "\n${CYAN}══════════════════════════════════════════"; echo -e " $1"; echo -e "══════════════════════════════════════════${NC}"; }
ok()  { echo -e "${GREEN}✓ $1 PASSED${NC}"; }
bad() { echo -e "${RED}✗ $1 FAILED (exit $2)${NC}"; }

DO_UNIT=0; DO_AUDIT=0; DO_E2E=0; DO_TYPECHECK=0; DO_LINT=0; DO_COV=0; DO_MUTATION=0; DO_SMOKE=0; DO_MCP_PROTO=0
AUDIT_ARGS=()
E2E_ARGS=()

if [ $# -eq 0 ]; then
  DO_UNIT=1; DO_TYPECHECK=1; DO_LINT=1
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --unit)      DO_UNIT=1; shift ;;
    --coverage)  DO_UNIT=1; DO_COV=1; shift ;;
    --mutation)  DO_MUTATION=1; shift ;;
    --smoke)     DO_SMOKE=1; shift ;;
    --mcp-protocol) DO_MCP_PROTO=1; shift ;;
    --audit)     DO_AUDIT=1; shift ;;
    --e2e)       DO_E2E=1; shift ;;
    --typecheck) DO_TYPECHECK=1; shift ;;
    --lint)      DO_LINT=1; shift ;;
    --all)       DO_UNIT=1; DO_TYPECHECK=1; DO_LINT=1; shift ;;
    --full)      DO_UNIT=1; DO_TYPECHECK=1; DO_LINT=1; DO_SMOKE=1; DO_MCP_PROTO=1; DO_AUDIT=1; DO_E2E=1; shift ;;
    --catalog|--image|--region) AUDIT_ARGS+=("$1" "$2"); shift 2 ;;
    --runtime-arn|--oauth-endpoint|--user-id) E2E_ARGS+=("$1" "$2"); shift 2 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

declare -a RESULTS
run_tier() {
  local name="$1"; shift
  hdr "$name"
  if "$@"; then
    ok "$name"
    RESULTS+=("${GREEN}✓${NC} $name")
  else
    local rc=$?
    bad "$name" "$rc"
    RESULTS+=("${RED}✗${NC} $name (exit $rc)")
    OVERALL=1
  fi
}

OVERALL=0

# Ensure dependencies are installed
if [ ! -d "$ROOT/node_modules" ]; then
  echo -e "${YELLOW}Installing root dependencies...${NC}"
  ( cd "$ROOT" && npm install --silent )
fi
if [ "$DO_TYPECHECK" = 1 ] && [ ! -d "$ROOT/infra/node_modules" ]; then
  echo -e "${YELLOW}Installing infra dependencies...${NC}"
  ( cd "$ROOT/infra" && npm install --silent )
fi

[ "$DO_LINT" = 1 ] && run_tier "lint (bash -n)" bash -c '
  for f in "'"$ROOT"'"/scripts/*.sh "'"$ROOT"'"/scripts/lib/*.sh "'"$ROOT"'"/scripts/lib/__tests__/*.sh; do
    [ -e "$f" ] && { bash -n "$f" || exit 1; }
  done
'
[ "$DO_LINT" = 1 ] && run_tier "lint (eslint)" bash -c "cd '$ROOT' && npm run lint"
[ "$DO_LINT" = 1 ] && run_tier "lint (invariants)" bash -c "cd '$ROOT' && ./scripts/check-invariants.sh"
[ "$DO_TYPECHECK" = 1 ] && run_tier "typecheck (lambda tsc --noEmit)" bash -c "cd '$ROOT' && npx tsc --noEmit -p tsconfig.json"
[ "$DO_TYPECHECK" = 1 ] && run_tier "typecheck (infra tsc --noEmit)" bash -c "cd '$ROOT/infra' && npx tsc --noEmit"
if [ "$DO_UNIT" = 1 ]; then
  if [ "$DO_COV" = 1 ]; then
    run_tier "unit (vitest + coverage)" bash -c "cd '$ROOT' && npx vitest run --coverage"
  else
    run_tier "unit (vitest)" bash -c "cd '$ROOT' && npm test --silent"
  fi
  # Pure-shell unit tests (slug resolver, etc.) — no vitest, run each *.test.sh.
  run_tier "unit (shell lib)" bash -c '
    for t in "'"$ROOT"'"/scripts/lib/__tests__/*.test.sh; do
      [ -e "$t" ] && { bash "$t" || exit 1; }
    done
  '
fi
[ "$DO_MUTATION" = 1 ] && run_tier "mutation (stryker)" bash -c "cd '$ROOT' && npx stryker run"
[ "$DO_SMOKE" = 1 ] && run_tier "smoke (docker container)" "$ROOT/scripts/test-smoke-docker.sh"
[ "$DO_MCP_PROTO" = 1 ] && run_tier "mcp-protocol (spec validation)" "$ROOT/scripts/test-mcp-protocol.sh"
[ "$DO_AUDIT" = 1 ] && run_tier "audit (catalog structure)" "$ROOT/scripts/audit-tools.sh" "${AUDIT_ARGS[@]}"
[ "$DO_E2E" = 1 ] && run_tier "e2e (live OAuth + Runtime)" "$ROOT/scripts/test-e2e.sh" "${E2E_ARGS[@]}"

echo ""
echo -e "${CYAN}═══════ Summary ═══════${NC}"
for r in "${RESULTS[@]}"; do echo -e "  $r"; done
exit "$OVERALL"

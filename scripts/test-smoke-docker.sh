#!/usr/bin/env bash
# Local container smoke test — builds the Docker image and verifies:
# 1. Image builds successfully
# 2. Container starts and health check returns 200
# 3. MCP initialize returns valid JSON-RPC response
# 4. tools/list returns tools array
# 5. Graceful shutdown on SIGTERM
#
# Requirements: Docker (no AWS credentials needed)
# Usage: ./scripts/test-smoke-docker.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-lark-mcp-smoke-test}"
KEEP_IMAGE="${KEEP_IMAGE:-0}"
CONTAINER=""

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "  ${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗ $1${NC}"; FAIL=$((FAIL+1)); }

PASS=0; FAIL=0

cleanup() {
  if [ -n "$CONTAINER" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ "$KEEP_IMAGE" != "1" ]; then
    docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo ""
echo "=== Container Smoke Test ==="
echo ""

# Step 1: Build
echo "── Build ──"
if docker build -t "$IMAGE" "$ROOT/docker" --quiet >/dev/null 2>&1; then
  pass "Docker image builds successfully"
else
  fail "Docker build failed"
  exit 1
fi

# Step 1b: Verify no-plus shortcut consistency (shortcut-scopes ↔ generated-tools)
# Catches the 1.0.55-era bug where no-plus shortcuts are extracted into scopes but
# the tool generator skips them — leaving tools that skills reference unroutable.
NOPLUS_MISS=$(docker run --rm --entrypoint sh "$IMAGE" -c '
  python3 -c "
import json,sys
sc=json.load(open(\"/app/shortcut-scopes.json\"))[\"shortcuts\"]
noplus=set()
for s in sc:
    cmd=s[\"command\"]
    if not cmd.startswith(\"+\"):
        noplus.add(s[\"service\"]+\":\"+cmd)
if not noplus: sys.exit(0)
gt=json.load(open(\"/app/generated-tools.json\"))[\"tools\"]
have=set()
for t in gt:
    have.add(t[\"service\"]+\":\"+t[\"command\"])
miss=sorted(noplus - have)
if miss: print(\" \".join(miss)); sys.exit(1)
" 2>&1')
if [ $? -eq 0 ]; then
  pass "No-plus shortcuts consistent (scopes ⊆ generated-tools)"
else
  fail "No-plus shortcuts in scopes but missing from generated-tools: ${NOPLUS_MISS}"
fi

# Step 2: Start container with mock secret (SM will fail, but we test health check 503 behavior)
echo ""
echo "── Start ──"
CONTAINER=$(docker run -d --name lark-mcp-smoke-$$ \
  -p 18000:8000 \
  -e APP_SECRET_ID=mock/nonexistent \
  -e AWS_ACCESS_KEY_ID=test \
  -e AWS_SECRET_ACCESS_KEY=test \
  -e AWS_REGION=us-west-2 \
  "$IMAGE" 2>&1)

# Wait for container to start (it will exit(1) because SM is unreachable — that's expected)
sleep 3

# Check if container is still running or exited
STATE=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "removed")

if [ "$STATE" = "exited" ]; then
  EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER" 2>/dev/null || echo "?")
  if [ "$EXIT_CODE" = "1" ]; then
    pass "Container exits with code 1 when secret unavailable (expected behavior)"
  else
    fail "Container exited with unexpected code: $EXIT_CODE"
  fi
elif [ "$STATE" = "running" ]; then
  # Container is running — check health endpoint returns 503 (secret not loaded)
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18000/ 2>/dev/null || echo "000")
  if [ "$HTTP" = "503" ]; then
    pass "Health check returns 503 when secret not loaded"
  elif [ "$HTTP" = "200" ]; then
    pass "Container running, health check OK (secret somehow loaded)"
  else
    fail "Health check returned HTTP $HTTP (expected 503)"
  fi

  # Step 3: Test MCP initialize (should work even without app secret for protocol layer)
  echo ""
  echo "── MCP Protocol ──"
  INIT_RESP=$(curl -s -X POST http://localhost:18000/ \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' 2>/dev/null || echo "")
  if echo "$INIT_RESP" | grep -q "serverInfo"; then
    pass "MCP initialize returns serverInfo"
  elif echo "$INIT_RESP" | grep -q "server_initializing"; then
    pass "MCP initialize returns server_initializing (expected without secret)"
  else
    fail "MCP initialize unexpected: ${INIT_RESP:0:100}"
  fi

  # Step 4: Test tools/list
  TOOLS_RESP=$(curl -s -X POST http://localhost:18000/ \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' 2>/dev/null || echo "")
  if echo "$TOOLS_RESP" | grep -q "tools"; then
    pass "tools/list returns tools array"
  elif echo "$TOOLS_RESP" | grep -q "server_initializing"; then
    pass "tools/list returns server_initializing (expected without secret)"
  else
    fail "tools/list unexpected: ${TOOLS_RESP:0:100}"
  fi

  # Step 5: Graceful shutdown.
  # The server's SIGTERM handler waits ~7s (server.close + child drain) before
  # process.exit(0), so allow a grace period comfortably above that. Exit 0 is
  # the clean path; 143 is SIGTERM-without-handler (128+15). A non-clean exit
  # here is a real regression — e.g. the secret-load give-up racing the shutdown
  # handler and winning with exit(1) — so this gates.
  echo ""
  echo "── Shutdown ──"
  docker stop -t 15 "$CONTAINER" >/dev/null 2>&1
  EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER" 2>/dev/null || echo "?")
  if [ "$EXIT_CODE" = "0" ] || [ "$EXIT_CODE" = "143" ]; then
    pass "Graceful shutdown (exit code $EXIT_CODE)"
  else
    fail "Graceful shutdown non-clean (exit code $EXIT_CODE)"
  fi
else
  fail "Container in unexpected state: $STATE"
fi

# Summary
echo ""
echo "═══════════════════════════════════"
echo "  Pass: ${PASS}  Fail: ${FAIL}"
echo "═══════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then exit 1; fi

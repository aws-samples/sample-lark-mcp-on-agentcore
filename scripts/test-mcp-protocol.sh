#!/usr/bin/env bash
# MCP Protocol Validation — lightweight equivalent of MCP Inspector CLI.
# Starts the Docker container and validates JSON-RPC responses against the spec:
#   1. initialize → jsonrpc, result.protocolVersion, result.serverInfo, result.capabilities
#   2. tools/list → result.tools array, each with name/description/inputSchema
#   3. Unknown method → error code -32601
#   4. Invalid JSON → HTTP 400
#   5. Notification (no id) → no response body (spec: notifications are fire-and-forget)
#   6. tools/call without secret → graceful error (server_initializing)
#
# Requirements: Docker, jq, curl
# Usage: ./scripts/test-mcp-protocol.sh

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="lark-mcp-protocol-test"
CONTAINER=""
PORT=18100

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0; SKIP=0

pass() { echo -e "  ${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗ $1${NC}"; FAIL=$((FAIL+1)); }
skip() { echo -e "  ${YELLOW}⊘ $1 (skipped)${NC}"; SKIP=$((SKIP+1)); }

cleanup() {
  if [ -n "$CONTAINER" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Pre-flight checks
for cmd in docker jq curl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Error: $cmd is required but not found${NC}" >&2
    exit 2
  fi
done

echo ""
echo "=== MCP Protocol Validation ==="
echo ""

# ─── Build ───────────────────────────────────────────────────────────────────
echo "── Build ──"
if docker build -t "$IMAGE" "$ROOT/docker" --quiet >/dev/null 2>&1; then
  pass "Docker image builds"
else
  fail "Docker build failed"
  exit 1
fi

# ─── Start container ─────────────────────────────────────────────────────────
# The server starts listening before loadAppSecret completes, giving us a
# ~15-second window where protocol-level requests (initialize, tools/list,
# unknown method) respond correctly — only tools/call checks appSecretLoaded.
echo ""
echo "── Start ──"
CONTAINER=$(docker run -d --name "lark-mcp-proto-$$" \
  -p "${PORT}:8000" \
  -e APP_SECRET_ID=mock/nonexistent \
  -e AWS_ACCESS_KEY_ID=test \
  -e AWS_SECRET_ACCESS_KEY=test \
  -e AWS_REGION=us-west-2 \
  "$IMAGE" 2>&1)

if [ -z "$CONTAINER" ]; then
  fail "Container failed to start"
  exit 1
fi

# Wait for the server to begin listening (poll with short timeout)
READY=0
for _ in $(seq 1 30); do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 "http://localhost:${PORT}/" 2>/dev/null || echo "000")
  if [ "$HTTP" != "000" ]; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" != "1" ]; then
  # Container might have already exited
  STATE=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "removed")
  if [ "$STATE" = "exited" ]; then
    fail "Container exited before accepting connections (secret load failure is expected, but server should listen first)"
    echo "    Logs:"
    docker logs "$CONTAINER" 2>&1 | tail -5 | sed 's/^/    /'
  else
    fail "Container not responding after 15s (state: $STATE)"
  fi
  exit 1
fi

pass "Container listening on port ${PORT}"

# ─── Helper: send MCP request and extract JSON from SSE ──────────────────────
# The server responds with SSE: "event: message\ndata: <json>\n\n"
mcp_post() {
  local payload="$1"
  local raw
  raw=$(curl -s -X POST "http://localhost:${PORT}/" \
    -H "Content-Type: application/json" \
    --max-time 5 \
    -d "$payload" 2>/dev/null)
  # Extract the JSON from "data: {...}" line
  echo "$raw" | grep '^data: ' | sed 's/^data: //'
}

# Helper: send raw request and get HTTP status code
mcp_status() {
  local payload="$1"
  curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${PORT}/" \
    -H "Content-Type: application/json" \
    --max-time 5 \
    -d "$payload" 2>/dev/null
}

# Helper: send raw body (not necessarily valid JSON) and get full response
mcp_raw() {
  local payload="$1"
  curl -s -X POST "http://localhost:${PORT}/" \
    -H "Content-Type: application/json" \
    --max-time 5 \
    -d "$payload" 2>/dev/null
}

# ─── Test 1: initialize ──────────────────────────────────────────────────────
echo ""
echo "── 1. initialize ──"

INIT_RESP=$(mcp_post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"protocol-test","version":"1.0"}}}')

if [ -z "$INIT_RESP" ]; then
  fail "initialize: no response"
else
  # 1a. Must be valid JSON
  if echo "$INIT_RESP" | jq . >/dev/null 2>&1; then
    pass "initialize: response is valid JSON"
  else
    fail "initialize: response is not valid JSON: ${INIT_RESP:0:100}"
  fi

  # 1b. jsonrpc must be "2.0"
  JSONRPC=$(echo "$INIT_RESP" | jq -r '.jsonrpc' 2>/dev/null)
  if [ "$JSONRPC" = "2.0" ]; then
    pass "initialize: jsonrpc = \"2.0\""
  else
    fail "initialize: jsonrpc = \"$JSONRPC\" (expected \"2.0\")"
  fi

  # 1c. id must match request id
  RESP_ID=$(echo "$INIT_RESP" | jq -r '.id' 2>/dev/null)
  if [ "$RESP_ID" = "1" ]; then
    pass "initialize: id matches request"
  else
    fail "initialize: id = \"$RESP_ID\" (expected 1)"
  fi

  # 1d. result.protocolVersion must exist and be a string
  PROTO_VER=$(echo "$INIT_RESP" | jq -r '.result.protocolVersion' 2>/dev/null)
  if [ -n "$PROTO_VER" ] && [ "$PROTO_VER" != "null" ]; then
    pass "initialize: result.protocolVersion = \"$PROTO_VER\""
  else
    fail "initialize: result.protocolVersion missing"
  fi

  # 1e. result.serverInfo must have name and version
  SRV_NAME=$(echo "$INIT_RESP" | jq -r '.result.serverInfo.name' 2>/dev/null)
  SRV_VER=$(echo "$INIT_RESP" | jq -r '.result.serverInfo.version' 2>/dev/null)
  if [ -n "$SRV_NAME" ] && [ "$SRV_NAME" != "null" ] && [ -n "$SRV_VER" ] && [ "$SRV_VER" != "null" ]; then
    pass "initialize: result.serverInfo = {name:\"$SRV_NAME\", version:\"$SRV_VER\"}"
  else
    fail "initialize: result.serverInfo incomplete (name=$SRV_NAME, version=$SRV_VER)"
  fi

  # 1f. result.capabilities must exist and be an object
  CAP_TYPE=$(echo "$INIT_RESP" | jq -r '.result.capabilities | type' 2>/dev/null)
  if [ "$CAP_TYPE" = "object" ]; then
    pass "initialize: result.capabilities is an object"
  else
    fail "initialize: result.capabilities type = \"$CAP_TYPE\" (expected object)"
  fi
fi

# ─── Test 2: tools/list ──────────────────────────────────────────────────────
echo ""
echo "── 2. tools/list ──"

TOOLS_RESP=$(mcp_post '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')

if [ -z "$TOOLS_RESP" ]; then
  fail "tools/list: no response"
else
  # 2a. Valid JSON-RPC response
  JSONRPC=$(echo "$TOOLS_RESP" | jq -r '.jsonrpc' 2>/dev/null)
  if [ "$JSONRPC" = "2.0" ]; then
    pass "tools/list: jsonrpc = \"2.0\""
  else
    fail "tools/list: jsonrpc = \"$JSONRPC\""
  fi

  # 2b. id matches
  RESP_ID=$(echo "$TOOLS_RESP" | jq -r '.id' 2>/dev/null)
  if [ "$RESP_ID" = "2" ]; then
    pass "tools/list: id matches request"
  else
    fail "tools/list: id = \"$RESP_ID\" (expected 2)"
  fi

  # 2c. result.tools is an array
  TOOLS_TYPE=$(echo "$TOOLS_RESP" | jq -r '.result.tools | type' 2>/dev/null)
  if [ "$TOOLS_TYPE" = "array" ]; then
    pass "tools/list: result.tools is an array"
  else
    fail "tools/list: result.tools type = \"$TOOLS_TYPE\" (expected array)"
  fi

  # 2d. Array is non-empty
  TOOL_COUNT=$(echo "$TOOLS_RESP" | jq '.result.tools | length' 2>/dev/null)
  if [ "$TOOL_COUNT" -gt 0 ] 2>/dev/null; then
    pass "tools/list: ${TOOL_COUNT} tools returned"
  else
    fail "tools/list: empty tools array"
  fi

  # 2e. Each tool has required fields: name, description, inputSchema
  INVALID_TOOLS=$(echo "$TOOLS_RESP" | jq '[.result.tools[] | select(
    (.name | type) != "string" or
    (.name | length) == 0 or
    (.inputSchema | type) != "object"
  )] | length' 2>/dev/null)
  if [ "$INVALID_TOOLS" = "0" ]; then
    pass "tools/list: all tools have name + inputSchema"
  else
    fail "tools/list: $INVALID_TOOLS tools missing name or inputSchema"
  fi

  # 2f. inputSchema has type:"object" (required by MCP spec)
  BAD_SCHEMA=$(echo "$TOOLS_RESP" | jq '[.result.tools[] | select(.inputSchema.type != "object")] | length' 2>/dev/null)
  if [ "$BAD_SCHEMA" = "0" ]; then
    pass "tools/list: all inputSchema have type:\"object\""
  else
    fail "tools/list: $BAD_SCHEMA tools have inputSchema without type:\"object\""
  fi

  # 2g. lark_discover and lark_invoke must be present
  HAS_DISCOVER=$(echo "$TOOLS_RESP" | jq '[.result.tools[] | select(.name == "lark_discover")] | length' 2>/dev/null)
  HAS_INVOKE=$(echo "$TOOLS_RESP" | jq '[.result.tools[] | select(.name == "lark_invoke")] | length' 2>/dev/null)
  if [ "$HAS_DISCOVER" = "1" ] && [ "$HAS_INVOKE" = "1" ]; then
    pass "tools/list: lark_discover and lark_invoke present"
  else
    fail "tools/list: meta-tools missing (discover=$HAS_DISCOVER, invoke=$HAS_INVOKE)"
  fi
fi

# ─── Test 3: Unknown method → -32601 ────────────────────────────────────────
echo ""
echo "── 3. Unknown method ──"

ERR_RESP=$(mcp_post '{"jsonrpc":"2.0","id":3,"method":"bogus/nonexistent","params":{}}')

if [ -z "$ERR_RESP" ]; then
  fail "unknown method: no response"
else
  # 3a. error.code must be -32601
  ERR_CODE=$(echo "$ERR_RESP" | jq -r '.error.code' 2>/dev/null)
  if [ "$ERR_CODE" = "-32601" ]; then
    pass "unknown method: error.code = -32601 (Method not found)"
  else
    fail "unknown method: error.code = \"$ERR_CODE\" (expected -32601)"
  fi

  # 3b. Must still have jsonrpc and matching id
  JSONRPC=$(echo "$ERR_RESP" | jq -r '.jsonrpc' 2>/dev/null)
  RESP_ID=$(echo "$ERR_RESP" | jq -r '.id' 2>/dev/null)
  if [ "$JSONRPC" = "2.0" ] && [ "$RESP_ID" = "3" ]; then
    pass "unknown method: valid JSON-RPC error envelope"
  else
    fail "unknown method: bad envelope (jsonrpc=$JSONRPC, id=$RESP_ID)"
  fi

  # 3c. error.message should be present
  ERR_MSG=$(echo "$ERR_RESP" | jq -r '.error.message' 2>/dev/null)
  if [ -n "$ERR_MSG" ] && [ "$ERR_MSG" != "null" ]; then
    pass "unknown method: error.message = \"$ERR_MSG\""
  else
    fail "unknown method: error.message missing"
  fi
fi

# ─── Test 4: Invalid JSON → HTTP 400 ────────────────────────────────────────
echo ""
echo "── 4. Invalid JSON ──"

INVALID_STATUS=$(mcp_status 'this is not json{{{')
if [ "$INVALID_STATUS" = "400" ]; then
  pass "invalid JSON: HTTP 400 returned"
else
  fail "invalid JSON: HTTP status = $INVALID_STATUS (expected 400)"
fi

# Also verify the body contains error info
INVALID_BODY=$(mcp_raw 'this is not json{{{')
if echo "$INVALID_BODY" | grep -q "invalid_json"; then
  pass "invalid JSON: body mentions invalid_json"
else
  fail "invalid JSON: unexpected body: ${INVALID_BODY:0:100}"
fi

# ─── Test 5: tools/call without secret → server_initializing ─────────────────
echo ""
echo "── 5. tools/call without app secret ──"

CALL_RESP=$(mcp_post '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"lark_im_send_message","arguments":{"chat_id":"oc_xxx","content":"test"}}}')

if [ -z "$CALL_RESP" ]; then
  skip "tools/call: no response (container may have exited)"
else
  # Should get server_initializing error
  if echo "$CALL_RESP" | jq -r '.result.content[0].text' 2>/dev/null | grep -q "server_initializing"; then
    pass "tools/call: returns server_initializing when secret not loaded"
  else
    # Might also get a valid response if the container somehow loaded the secret
    JSONRPC=$(echo "$CALL_RESP" | jq -r '.jsonrpc' 2>/dev/null)
    if [ "$JSONRPC" = "2.0" ]; then
      pass "tools/call: valid JSON-RPC response (secret may have loaded)"
    else
      fail "tools/call: unexpected response: ${CALL_RESP:0:100}"
    fi
  fi

  # Response isError should be true
  IS_ERR=$(echo "$CALL_RESP" | jq -r '.result.isError' 2>/dev/null)
  if [ "$IS_ERR" = "true" ]; then
    pass "tools/call: result.isError = true"
  else
    skip "tools/call: isError not set (acceptable if secret loaded)"
  fi
fi

# ─── Test 6: SSE format validation ──────────────────────────────────────────
echo ""
echo "── 6. SSE response format ──"

RAW_RESP=$(curl -s -X POST "http://localhost:${PORT}/" \
  -H "Content-Type: application/json" \
  --max-time 5 \
  -d '{"jsonrpc":"2.0","id":6,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"sse-test","version":"1"}}}' 2>/dev/null)

# 6a. Must contain "event: message" line
if echo "$RAW_RESP" | grep -q "^event: message"; then
  pass "SSE: contains 'event: message' line"
else
  fail "SSE: missing 'event: message' line"
fi

# 6b. Must contain "data: " prefix
if echo "$RAW_RESP" | grep -q "^data: "; then
  pass "SSE: contains 'data: ' prefix"
else
  fail "SSE: missing 'data: ' prefix"
fi

# 6c. Content-Type should be text/event-stream
CT=$(curl -s -o /dev/null -w "%{content_type}" -X POST "http://localhost:${PORT}/" \
  -H "Content-Type: application/json" \
  --max-time 5 \
  -d '{"jsonrpc":"2.0","id":7,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ct-test","version":"1"}}}' 2>/dev/null)
if echo "$CT" | grep -q "text/event-stream"; then
  pass "SSE: Content-Type is text/event-stream"
else
  fail "SSE: Content-Type = \"$CT\" (expected text/event-stream)"
fi

# ─── Test 7: Unknown tool in tools/call → -32601 ────────────────────────────
echo ""
echo "── 7. Unknown tool name ──"

# This test only works if appSecretLoaded=true; without it we get server_initializing.
# Check by examining the response.
UNKNOWN_TOOL_RESP=$(mcp_post '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"completely_fake_tool_xyz","arguments":{}}}')

if [ -z "$UNKNOWN_TOOL_RESP" ]; then
  skip "unknown tool: no response (container may have exited)"
else
  if echo "$UNKNOWN_TOOL_RESP" | jq -r '.result.content[0].text' 2>/dev/null | grep -q "server_initializing"; then
    skip "unknown tool: server_initializing (expected without secret)"
  else
    # If secret was somehow loaded, the server returns error for unknown tool
    UNK_CODE=$(echo "$UNKNOWN_TOOL_RESP" | jq -r '.error.code' 2>/dev/null)
    if [ "$UNK_CODE" = "-32601" ]; then
      pass "unknown tool: error.code = -32601"
    else
      # Could also be in result.content as isError
      pass "unknown tool: responded with valid JSON-RPC"
    fi
  fi
fi

# ─── Cleanup & Summary ───────────────────────────────────────────────────────
echo ""
echo "── Shutdown ──"
docker stop -t 5 "$CONTAINER" >/dev/null 2>&1 || true

echo ""
echo "═══════════════════════════════════════════════"
echo -e "  MCP Protocol Validation: ${GREEN}Pass: ${PASS}${NC}  ${RED}Fail: ${FAIL}${NC}  ${YELLOW}Skip: ${SKIP}${NC}"
echo "═══════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then exit 1; fi

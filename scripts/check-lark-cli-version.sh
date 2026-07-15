#!/usr/bin/env bash
# Detect drift between Dockerfile's pinned lark-cli version and the version
# whose scope mapping is captured in docker/shortcut-scopes.json.
# Run in CI to fail builds if these drift.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="$PROJECT_DIR/docker/Dockerfile"
SCOPES="$PROJECT_DIR/docker/shortcut-scopes.json"

PINNED=$(grep -E '^ARG LARK_CLI_VERSION=' "$DOCKERFILE" | tail -n1 | cut -d= -f2)
META=$(jq -r '._meta.lark_cli_version' "$SCOPES")

if [ -z "$PINNED" ] || [ "$PINNED" = "latest" ]; then
  echo "FAIL: Dockerfile LARK_CLI_VERSION is unpinned ('$PINNED')." >&2
  exit 1
fi

if [ "$PINNED" != "$META" ]; then
  echo "FAIL: lark-cli version drift" >&2
  echo "  Dockerfile pinned:  $PINNED" >&2
  echo "  shortcut-scopes:    $META" >&2
  exit 1
fi

echo "OK: lark-cli pinned to $PINNED (matches shortcut-scopes.json)"

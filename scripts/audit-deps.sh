#!/usr/bin/env bash
# Run npm audit across all production dependency trees in this repo.
# Fails on high or critical advisories.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

audit_dir() {
  local dir="$1"
  echo ""
  echo "=== $dir ==="
  if [ ! -f "$dir/package.json" ]; then
    echo "  no package.json — skipping"
    return
  fi
  ( cd "$dir" && npm audit --omit=dev --audit-level=high ) || FAIL=1
}

audit_dir "$PROJECT_DIR"
audit_dir "$PROJECT_DIR/docker"
audit_dir "$PROJECT_DIR/infra"

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: high/critical advisories found"
  exit 1
fi
echo "OK: no high/critical advisories"

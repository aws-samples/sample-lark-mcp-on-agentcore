#!/usr/bin/env bash
# Detect whether a newer lark-cli release exists upstream than the version
# currently pinned in docker/Dockerfile.
#
# Intended for unattended (cron) use: prints a single-line JSON verdict to
# stdout and uses the exit code as the trigger signal.
#
#   exit 0  + {"newer":true,...}   a newer version is available  -> start a bump
#   exit 0  + {"newer":false,...}  already up to date            -> do nothing
#   exit 2                         could not determine latest    -> transient, retry later
#
# Latest version is resolved from npm (the install source used by the
# Dockerfile); the GitHub release tag is consulted only as a fallback so a
# brief npm hiccup does not stall detection.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="$PROJECT_DIR/docker/Dockerfile"

# `awk '{print $1}'` strips any trailing inline comment / whitespace after the
# version (e.g. `ARG LARK_CLI_VERSION=1.0.54 # pinned`).
PINNED=$(grep -E '^ARG LARK_CLI_VERSION=' "$DOCKERFILE" | tail -n1 | cut -d= -f2 | awk '{print $1}')
if [ -z "$PINNED" ] || [ "$PINNED" = "latest" ]; then
  echo '{"error":"Dockerfile LARK_CLI_VERSION is unpinned"}' >&2
  exit 2
fi

# Primary source: npm (matches the Dockerfile install path @larksuite/cli@<ver>).
LATEST=$(npm view @larksuite/cli version 2>/dev/null | sed 's/^v//' || true)

# Fallback: GitHub latest release tag (strip the leading v).
if [ -z "$LATEST" ]; then
  if command -v gh >/dev/null 2>&1; then
    LATEST=$(gh release view --repo larksuite/cli --json tagName -q .tagName 2>/dev/null | sed 's/^v//' || true)
  fi
  if [ -z "$LATEST" ]; then
    LATEST=$(curl -fsSL https://api.github.com/repos/larksuite/cli/releases/latest 2>/dev/null \
      | grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 \
      | sed -E 's/.*"v?([^"]+)".*/\1/' || true)
  fi
fi

if [ -z "$LATEST" ]; then
  echo '{"error":"could not resolve latest lark-cli version from npm or github"}' >&2
  exit 2
fi

# Reject prereleases. `sort -V` does NOT honour semver prerelease ordering
# (it ranks 1.0.55-rc.1 ABOVE 1.0.55), which would mis-trigger a bump to an
# older prerelease. This project only ever pins stable releases, so treat a
# prerelease "latest" (any version containing a hyphen) as "cannot determine".
if [[ "$LATEST" == *-* ]]; then
  echo "{\"error\":\"upstream latest '$LATEST' is a prerelease; skipping\"}" >&2
  exit 2
fi

# Semver-aware "is LATEST strictly newer than PINNED?" using sort -V.
# newer == (the larger of the two is LATEST) AND (they differ).
if [ "$PINNED" = "$LATEST" ]; then
  NEWER=false
else
  TOP=$(printf '%s\n%s\n' "$PINNED" "$LATEST" | sort -V | tail -n1)
  if [ "$TOP" = "$LATEST" ]; then NEWER=true; else NEWER=false; fi
fi

printf '{"newer":%s,"pinned":"%s","latest":"%s"}\n' "$NEWER" "$PINNED" "$LATEST"
exit 0

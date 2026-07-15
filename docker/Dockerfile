# Pin to a tested base image. Update with:
#   docker pull node:20-bookworm-slim 2>&1 | grep Digest
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

# Pin lark-cli to the version whose scope mapping is captured in shortcut-scopes.json.
# Drift is detected by scripts/check-lark-cli-version.sh.
ARG LARK_CLI_VERSION=1.0.69

# hadolint ignore=DL3008
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install lark-cli
RUN npx @larksuite/cli@${LARK_CLI_VERSION} install 2>/dev/null || npm install -g @larksuite/cli@${LARK_CLI_VERSION}

# Install skills (required by lark-cli)
RUN npx skills add larksuite/cli -y -g 2>/dev/null || true

# Install server runtime dependencies (AWS SDK for SM secret loading)
WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev --no-audit --no-fund

COPY generate-tools.js /app/generate-tools.js
COPY generate-tools-lib.js /app/generate-tools-lib.js
COPY shortcut-scopes.json /app/shortcut-scopes.json
COPY server.js /app/server.js
COPY server-lib.js /app/server-lib.js
COPY skill-description.js /app/skill-description.js
COPY skill-sections.js /app/skill-sections.js
COPY tier1.json /app/tier1.json

# Pre-adapted skills (committed to repo, reviewed before merge)
# Scripts are made read-only to prevent runtime overwrite attacks.
COPY skills /app/skills

# Generate tool catalog at build time; lock scripts/ to prevent runtime overwrite
RUN find /app/skills -type d -name scripts -exec chmod -R 555 {} + \
    && LARKSUITE_CLI_APP_ID=build LARKSUITE_CLI_APP_SECRET=build LARKSUITE_CLI_BRAND=feishu \
    node /app/generate-tools.js

USER node
EXPOSE 8000

ENTRYPOINT ["node", "/app/server.js"]

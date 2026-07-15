#!/usr/bin/env bash
# Extract raw API scopes from a lark-cli container image into
# docker/rawapi-scopes.json. Raw API scope metadata lives in the lark-cli
# binary's embedded meta_data.json (NOT in the source repo — it is injected
# at lark-cli release build time), so the only way to read it is via
# `lark-cli schema <service>.<resource>.<method>` inside a built image.
#
# Run after bumping lark-cli (the bump runbook builds the image anyway):
#   scripts/extract-rawapi-scopes.sh <image>
# Then regenerate the allowlist:
#   scripts/build-scope-allowlist.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/docker/rawapi-scopes.json"
IMAGE="${1:?usage: extract-rawapi-scopes.sh <docker-image>}"

docker run --rm --entrypoint sh "$IMAGE" -c '
export NO_COLOR=1 LARKSUITE_CLI_APP_ID=build LARKSUITE_CLI_APP_SECRET=build \
  LARKSUITE_CLI_USER_ACCESS_TOKEN=build LARKSUITE_CLI_BRAND=feishu
node -e "
const { execFileSync } = require(\"child_process\");
function run(...args) {
  try { return execFileSync(\"lark-cli\", args, {encoding:\"utf-8\", timeout:15000, env:process.env, stdio:[\"pipe\",\"pipe\",\"pipe\"]}).trim(); }
  catch { return \"\"; }
}
// Bot-only scopes can never be granted via user (3-legged) consent, so they
// must not enter the user-identity allowlist. lark-cli schema _meta.scopes is a
// flat mixed list (user + bot) with no per-scope identity tag, unlike the source
// UserScopes/BotScopes fields the shortcut extractor reads. Filter by the Feishu
// bot-identity naming convention (the :send_as_bot suffix). Mirrors the
// shortcut extractor policy that excludes BotScopes (this is a user-only project).
const isBotOnlyScope = (s) => /:send_as_bot$/.test(s);
const t = JSON.parse(require(\"fs\").readFileSync(\"/app/generated-tools.json\",\"utf8\"));
const out = [];
let botFiltered = 0;
for (const e of t.rawApis || []) {
  const schemaPath = e.service + \".\" + e.resource + \".\" + e.method;
  const raw = run(\"schema\", schemaPath);
  let scopes = [];
  try { scopes = JSON.parse(raw)._meta?.scopes || []; } catch {}
  const kept = scopes.filter(s => !isBotOnlyScope(s));
  botFiltered += scopes.length - kept.length;
  out.push({ service: e.service, resource: e.resource, method: e.method, scopes: kept });
}
if (botFiltered > 0) console.error(\"Filtered \" + botFiltered + \" bot-only scope occurrence(s)\");
const version = run(\"--version\").match(/[\d.]+/)?.[0] || \"unknown\";
console.log(JSON.stringify({ _meta: { lark_cli_version: version, source: \"lark-cli schema _meta.scopes\" }, rawApis: out }, null, 2));
"' > "$OUT"

COUNT=$(python3 -c "import json; print(len(json.load(open('$OUT'))['rawApis']))")
SCOPES=$(python3 -c "
import json
d = json.load(open('$OUT'))
s = set()
for e in d['rawApis']: s.update(e['scopes'])
print(len(s))")
echo "Wrote ${OUT}: ${COUNT} raw APIs, ${SCOPES} distinct scopes"

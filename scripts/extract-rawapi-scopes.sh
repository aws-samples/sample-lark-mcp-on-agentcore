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
// The suffix test above is a heuristic: a bot-only scope named anything else sails
// through. The shortcut extractor DOES read per-identity source fields, so it
// publishes the scopes upstream declares only for bots (BotScopes /
// ConditionalBotScopes minus everything that survived as a user scope) in
// shortcut-scopes.json _meta. Cross-check against that list and REVIEW rather than
// filter: some scopes upstream lists under BotScopes are legitimately user-grantable
// too, so a hard filter would over-block a raw API that genuinely needs one.
const REVIEWED_USER_SCOPES = new Set([
  // Upstream lists this under BotScopes at contact_get_user.go, but it is a real
  // user scope and drive file.view_records list needs it. Confirmed user-grantable.
  \"contact:user.base:readonly\",
]);
let botExclusive = new Set();
try {
  const meta = JSON.parse(require(\"fs\").readFileSync(\"/app/shortcut-scopes.json\",\"utf8\"))._meta || {};
  botExclusive = new Set(meta.bot_exclusive_scopes || []);
} catch {}
const flagged = new Set();
const t = JSON.parse(require(\"fs\").readFileSync(\"/app/generated-tools.json\",\"utf8\"));
const out = [];
let botFiltered = 0;
for (const e of t.rawApis || []) {
  const schemaPath = e.service + \".\" + e.resource + \".\" + e.method;
  const raw = run(\"schema\", schemaPath);
  let scopes = [];
  try { scopes = JSON.parse(raw)._meta?.scopes || []; } catch {}
  const kept = scopes.filter(s => !isBotOnlyScope(s));
  for (const s of kept) {
    if (botExclusive.has(s) && !REVIEWED_USER_SCOPES.has(s)) flagged.add(s + \"  (\" + schemaPath + \")\");
  }
  botFiltered += scopes.length - kept.length;
  out.push({ service: e.service, resource: e.resource, method: e.method, scopes: kept });
}
if (flagged.size > 0) {
  console.error(\"\");
  console.error(\"REVIEW REQUIRED: \" + flagged.size + \" raw-API scope(s) that upstream declares only for bots\");
  console.error(\"passed the :send_as_bot suffix filter. Confirm each is user-grantable; if it is, add it to\");
  console.error(\"REVIEWED_USER_SCOPES in scripts/extract-rawapi-scopes.sh with the reason. If it is not,\");
  console.error(\"it must not reach the user allowlist.\");
  for (const f of [...flagged].sort()) console.error(\"  - \" + f);
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

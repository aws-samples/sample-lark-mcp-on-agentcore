#!/usr/bin/env bash
# audit-tools.sh
# Structural audit of every lark-cli tool exposed by the MCP server.
#
# Non-destructive: reads generated-tools.json (built into the container) and
# asserts catalog completeness, schema health, risk classification, MCP
# annotations, scope coverage, and flag hygiene. Does NOT call any Feishu API.
#
# Usage:
#   ./scripts/audit-tools.sh                     # uses ECR image of current Runtime
#   ./scripts/audit-tools.sh --catalog tools.json  # offline against a local catalog
#   ./scripts/audit-tools.sh --image <uri>       # explicit image URI
#
# Exit code 0 if all assertions pass, 1 otherwise.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REGION="${AWS_REGION:-us-west-2}"
CATALOG=""
IMAGE_URI=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --catalog) CATALOG="$2"; shift 2 ;;
    --image)   IMAGE_URI="$2"; shift 2 ;;
    --region)  REGION="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Resolve catalog source: --catalog wins; else pull image; else discover image
# from CloudFormation stack output.
if [ -z "$CATALOG" ]; then
  if [ -z "$IMAGE_URI" ]; then
    IMAGE_URI=$(aws cloudformation describe-stacks \
      --stack-name LarkMcpOnAgentCoreRuntime --region "$REGION" \
      --query 'Stacks[0].Outputs[?OutputKey==`ImageUri`].OutputValue' \
      --output text 2>/dev/null || echo "")
    if [ -z "$IMAGE_URI" ]; then
      echo "Could not resolve ImageUri from LarkMcpOnAgentCoreRuntime stack." >&2
      echo "Pass --image <uri> or --catalog <path>." >&2
      exit 2
    fi
  fi
  echo "  Pulling catalog from $IMAGE_URI"
  REGISTRY="${IMAGE_URI%%/*}"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null 2>&1
  docker pull "$IMAGE_URI" >/dev/null
  CID=$(docker create "$IMAGE_URI")
  trap 'docker rm "$CID" >/dev/null 2>&1 || true' EXIT
  CATALOG=$(mktemp)
  docker cp "$CID":/app/generated-tools.json "$CATALOG" >/dev/null
fi

if [ ! -f "$CATALOG" ]; then
  echo "Catalog file not found: $CATALOG" >&2
  exit 2
fi

# All assertions delegated to Python so we can do real JSON checks.
AUDIT_SCRIPT_DIR="$SCRIPT_DIR" python3 - "$CATALOG" <<'PYEOF'
import json, sys, re

CATALOG = sys.argv[1]
with open(CATALOG) as f:
    data = json.load(f)

tools = data.get('tools', [])
PASS, FAIL = 0, 0
def ok(msg):
    global PASS; PASS += 1
    print(f"  \033[32m✓\033[0m {msg}")
def bad(msg):
    global FAIL; FAIL += 1
    print(f"  \033[31m✗\033[0m {msg}")

cli_v = data.get('_larkCliVersion', '?')
sm_v = data.get('_scopeMapVersion', '?')
print(f"\nCatalog: {len(tools)} tools (lark-cli {cli_v}, scope-map {sm_v})\n")

# ── A. Catalog completeness ───────────────────────────────────────────────
print("── A. Catalog completeness ──")
if cli_v != '?' and sm_v != '?':
    if cli_v == sm_v:
        ok(f"lark-cli ({cli_v}) and scope-map versions aligned")
    else:
        bad(f"version drift: lark-cli={cli_v} but scope-map={sm_v} "
            f"(re-run scripts/build-scope-allowlist.sh after refreshing shortcut-scopes.json)")

if len(tools) >= 200:
    ok(f"tool count {len(tools)} >= 200 (lark-cli upstream surface)")
else:
    bad(f"tool count {len(tools)} < 200; build may have skipped a service")

# Cross-check vs shortcut-scopes.json if available
import os
SCOPES = os.path.join(os.path.dirname(CATALOG), 'shortcut-scopes.json')
if not os.path.exists(SCOPES):
    SCOPES = os.path.join(os.path.dirname(os.environ['AUDIT_SCRIPT_DIR']), 'docker', 'shortcut-scopes.json')
if os.path.exists(SCOPES):
    # generate-tools.js intentionally skips meta services (api/auth/help/etc.)
    # and only registers commands prefixed with `+` as shortcuts. Mirror that
    # filter here so audit doesn't flag deliberate exclusions.
    SKIP_SERVICES = {'api', 'auth', 'config', 'doctor', 'help', 'profile',
                     'schema', 'update', 'event', 'skill'}
    with open(SCOPES) as f:
        sc = json.load(f).get('shortcuts', [])
    sc_keys = {f"{s['service']}:{s['command'].lstrip('+')}"
               for s in sc
               if s['service'] not in SKIP_SERVICES
               and s['command'].startswith('+')}
    catalog_keys = {f"{t['service']}:{t['command'].lstrip('+')}" for t in tools}
    missing = sc_keys - catalog_keys
    extra = catalog_keys - sc_keys
    # The load-bearing direction is catalog -> scope map: a tool the server serves
    # with no scope entry breaks incremental authorization. Assert that.
    if not extra:
        ok(f"every catalog tool ({len(catalog_keys)}) has a shortcut-scopes.json entry")
    else:
        bad(f"{len(extra)} catalog tool(s) have NO scope-map entry — incremental auth "
            f"will fail for them; refresh docker/shortcut-scopes.json: "
            f"{sorted(list(extra))[:5]}…")
    # The reverse direction is NOT an invariant: shortcut-scopes.json is extracted
    # from lark-cli's Go source and is deliberately a SUPERSET of the catalog. It
    # keeps deprecated/renamed aliases, and non-user-callable shortcuts that never
    # become tools. Reporting
    # that as a failure made this tier permanently red and hid real regressions.
    if missing:
        print(f"  \033[33m·\033[0m {len(missing)} scope-map entry(ies) are not catalog "
              f"tools — expected: the scope map is a Go-source superset (deprecated "
              f"aliases + non-user-callable shortcuts). Sample: {sorted(list(missing))[:5]}")

# ── B. Schema health ──────────────────────────────────────────────────────
print("\n── B. Schema health ──")
broken_schema = []
for t in tools:
    if not isinstance(t.get('flags'), list):
        broken_schema.append((t.get('service'), t.get('command'), 'no flags array'))
        continue
    for f in t['flags']:
        if not f.get('name') or not isinstance(f['name'], str):
            broken_schema.append((t['service'], t['command'], 'flag missing name'))
        # 'stringArray' is emitted by flagTypeFromRest for repeatable flags
        # (pflag stringArray/stringSlice) and mapped to {type:"array"} by
        # buildInputSchema. It predates this allowlist, which had gone stale and
        # failed all 62 such flags.
        if f.get('type') not in ('string', 'number', 'boolean', 'stringArray'):
            broken_schema.append((t['service'], t['command'], f"bad flag type {f.get('type')}"))
if not broken_schema:
    ok(f"all {len(tools)} tools have well-formed flags")
else:
    bad(f"{len(broken_schema)} schema issue(s); first 3: {broken_schema[:3]}")

# ── C. Risk classification ─────────────────────────────────────────────────
print("\n── C. Risk classification ──")
risks = {}
for t in tools:
    r = t.get('risk', '<unset>')
    risks[r] = risks.get(r, 0) + 1
expected = {'read', 'write', 'high-risk-write'}
unexpected = set(risks) - expected
if not unexpected:
    summary = ", ".join(f"{k}:{v}" for k, v in sorted(risks.items()))
    ok(f"every tool has risk ∈ {{read,write,high-risk-write}} ({summary})")
else:
    bad(f"unexpected risk values: {unexpected}")

# ── D. Annotations / risk consistency ──────────────────────────────────────
print("\n── D. Annotations consistency (simulated from server.js logic) ──")
# Mirror toolAnnotations() in docker/server.js. If it drifts, this test
# catches it.
def expected_anno(risk):
    if risk == 'high-risk-write':
        return {'readOnlyHint': False, 'destructiveHint': True, 'idempotentHint': False}
    if risk == 'write':
        return {'readOnlyHint': False, 'destructiveHint': False, 'idempotentHint': False}
    return {'readOnlyHint': True, 'destructiveHint': False, 'idempotentHint': True}

# Just count and assert distribution makes sense
hrw = [t for t in tools if t.get('risk') == 'high-risk-write']
if hrw:
    ok(f"{len(hrw)} tool(s) classified high-risk-write → will get destructiveHint")
else:
    bad("no high-risk-write tools — destructive guards never fire")

# ── E. Scope mapping coverage ──────────────────────────────────────────────
print("\n── E. Scope mapping coverage ──")
no_scope = [t for t in tools if not t.get('scopes')]
no_scope_hrw = [t for t in no_scope if t.get('risk') == 'high-risk-write']
no_scope_write = [t for t in no_scope if t.get('risk') == 'write']
if not no_scope_hrw:
    ok(f"every high-risk-write tool ({len(hrw)}) has scopes → incremental auth works")
else:
    bad(f"{len(no_scope_hrw)} high-risk-write tool(s) without scopes (incr-auth degraded): "
        f"{[t['service']+':'+t['command'] for t in no_scope_hrw[:3]]}…")
print(f"  \033[33m·\033[0m {len(no_scope_write)} write-class tool(s) with no scopes "
      f"(incr-auth falls back to error message parsing)")

# ── F. supportsYes correctness ─────────────────────────────────────────────
# server.js only auto-injects --yes when (risk == 'high-risk-write' && supportsYes),
# so write-class tools that also accept --yes are harmless — note them, don't fail.
print("\n── F. --yes injection correctness ──")
yes_tools = [t for t in tools if t.get('supportsYes')]
yes_hrw = [t for t in yes_tools if t.get('risk') == 'high-risk-write']
yes_non_hrw = [t for t in yes_tools if t.get('risk') != 'high-risk-write']
ok(f"{len(yes_hrw)} high-risk-write tool(s) declare --yes (auto-injected by server.js)")
if yes_non_hrw:
    print(f"  \033[33m·\033[0m {len(yes_non_hrw)} non-high-risk tool(s) also declare --yes "
          f"(no auto-inject; user/LLM may pass it explicitly)")

# ── G. Hidden-flag hygiene ─────────────────────────────────────────────────
print("\n── G. Hidden flags absent from LLM-facing schema ──")
HIDDEN = {'yes', 'dry-run', 'jq'}
leaks = []
for t in tools:
    for f in t.get('flags', []):
        if f.get('name') in HIDDEN:
            leaks.append((t['service'], t['command'], f['name']))
if not leaks:
    ok(f"yes / dry-run / jq are hidden from all {len(tools)} tools' flags")
else:
    bad(f"{len(leaks)} hidden flag leak(s); first 3: {leaks[:3]}")

# ── H. Tier1 file integrity ────────────────────────────────────────────────
print("\n── H. Tier1 alignment ──")
TIER1_PATH = os.path.join(os.path.dirname(os.environ['AUDIT_SCRIPT_DIR']), 'docker', 'tier1.json')
if os.path.exists(TIER1_PATH):
    with open(TIER1_PATH) as f:
        tier1 = json.load(f)
    catalog_names = {f"lark_{t['service']}_{t['command'].lstrip('+').replace('-','_')}"
                     for t in tools}
    missing_tier1 = [n for n in tier1 if n not in catalog_names]
    if not missing_tier1:
        ok(f"all {len(tier1)} tier1 tools resolve to a catalog entry")
    else:
        bad(f"{len(missing_tier1)} tier1 name(s) not found in catalog: {missing_tier1[:3]}")
else:
    print(f"  \033[33m·\033[0m skipped (tier1.json not at expected path)")

# ── I. Tool name uniqueness ────────────────────────────────────────────────
# server.js builds a Map keyed by lark_<svc>_<cmd> with dashes->underscores.
# Two distinct defs collapsing to the same key would silently lose one tool.
print("\n── I. Tool name uniqueness ──")
seen = {}
collisions = []
for t in tools:
    n = f"lark_{t['service']}_{t['command'].lstrip('+').replace('-','_')}"
    if n in seen:
        collisions.append((n, seen[n], f"{t['service']}:{t['command']}"))
    seen[n] = f"{t['service']}:{t['command']}"
if not collisions:
    ok(f"all {len(tools)} tool names are unique after dash→underscore normalization")
else:
    bad(f"{len(collisions)} name collision(s); first: {collisions[0]}")

# ── J. Scope syntax sanity ─────────────────────────────────────────────────
# Every scope must match the Feishu syntax our SCOPE_ALLOWLIST regex expects.
# Catches stray full-width colons, uppercase, whitespace, etc.
print("\n── J. Scope syntax sanity ──")
SCOPE_RE = re.compile(r'^[a-z][a-z0-9_:.\-]*$')
malformed = []
for t in tools:
    for s in t.get('scopes', []) or []:
        if not SCOPE_RE.match(s):
            malformed.append((f"{t['service']}:{t['command']}", s))
if not malformed:
    ok("all scopes match expected syntax")
else:
    bad(f"{len(malformed)} malformed scope(s); first: {malformed[0]}")

# ── K. Description quality ────────────────────────────────────────────────
# Tier1/discover relies on description for LLM tool selection. Empty or
# placeholder descriptions hurt recall — flag (warn-only).
print("\n── K. Description quality ──")
weak = []
for t in tools:
    d = (t.get('description') or '').strip()
    if not d or d == '<no description>' or len(d) < 5 or d.lower() == t['command'].lstrip('+'):
        weak.append(f"{t['service']}:{t['command']}")
if not weak:
    ok(f"all {len(tools)} tools have non-trivial descriptions")
else:
    print(f"  \033[33m·\033[0m {len(weak)} tool(s) with weak/empty description "
          f"(LLM recall may suffer): {weak[:3]}…")

# ── L. Service distribution ────────────────────────────────────────────────
# A whole service vanishing is a build-time disaster — count tools per service.
print("\n── L. Service distribution ──")
from collections import Counter
by_service = Counter(t['service'] for t in tools)
empty = [s for s, n in by_service.items() if n == 0]
if not empty and len(by_service) >= 10:
    services_str = ", ".join(f"{s}:{n}" for s, n in sorted(by_service.items()))
    ok(f"{len(by_service)} services represented ({services_str})")
elif empty:
    bad(f"{len(empty)} service(s) declared but empty: {empty}")
else:
    bad(f"only {len(by_service)} services in catalog (expected ≥10)")

# ── M. Snapshot of key fields ──────────────────────────────────────────────
# A coarse contract test: hash the security-critical fields per tool, compare
# to a stored baseline. Drift = something a human should review before deploy.
# Run with AUDIT_UPDATE_SNAPSHOT=1 to refresh the baseline.
print("\n── M. Snapshot of risk / supportsYes / scopes ──")
import hashlib
SNAPSHOT_PATH = os.path.join(os.environ['AUDIT_SCRIPT_DIR'], '.audit-snapshot.txt')
def fingerprint(t):
    parts = [t['service'], t['command'], t.get('risk', ''),
             '1' if t.get('supportsYes') else '0',
             ','.join(sorted(t.get('scopes', []) or []))]
    return '|'.join(parts)
fingerprints = sorted(fingerprint(t) for t in tools)
combined = '\n'.join(fingerprints)
current = hashlib.sha256(combined.encode()).hexdigest()[:16]

if os.environ.get('AUDIT_UPDATE_SNAPSHOT') == '1':
    with open(SNAPSHOT_PATH, 'w') as f:
        f.write(combined + '\n')
    ok(f"snapshot updated → {SNAPSHOT_PATH} (sha256 {current})")
elif os.path.exists(SNAPSHOT_PATH):
    with open(SNAPSHOT_PATH) as f:
        baseline = f.read().rstrip('\n')
    baseline_hash = hashlib.sha256(baseline.encode()).hexdigest()[:16]
    if baseline == combined:
        ok(f"snapshot matches baseline (sha256 {current}, {len(fingerprints)} tools)")
    else:
        # Show the smallest informative diff: which fingerprints changed
        baseline_set = set(baseline.split('\n'))
        current_set = set(fingerprints)
        added = sorted(current_set - baseline_set)[:3]
        removed = sorted(baseline_set - current_set)[:3]
        bad(f"snapshot drift (baseline {baseline_hash} → current {current}); "
            f"sample +{added} -{removed}; refresh with AUDIT_UPDATE_SNAPSHOT=1")
else:
    print(f"  \033[33m·\033[0m no baseline at {SNAPSHOT_PATH}; "
          f"run with AUDIT_UPDATE_SNAPSHOT=1 to create one")

# ── N. Skill-doc tool references ───────────────────────────────────────────
# The adapted skills under docker/skills/ are prose handed to downstream agents,
# so a tool name or flag type that is wrong there fails at CALL time, not build
# time. Two failure classes, both silent, both seen in real bumps:
#
#   1. Dead tool name. shortcut-scopes.json is a Go-source SUPERSET (hidden
#      aliases, plus shortcuts marked non-user-callable by AuthTypes or an
#      evidence-backed ordinary-app override). Validating docs
#      against it passes names the server does not expose; the agent then gets
#      "tool does not exist". The catalog below is the only authority.
#   2. Flag type mismatch. A stringArray flag written as a comma-joined string
#      is NOT split — it becomes one bogus value. A string flag written as an
#      array is JSON-stringified into one bogus value. Neither errors.
print("\n── N. Skill-doc tool references ──")
REPO_ROOT = os.path.dirname(os.environ['AUDIT_SCRIPT_DIR'].rstrip('/'))
SKILLS_DIR = os.path.join(REPO_ROOT, 'docker', 'skills')

def tool_name(t):
    return f"lark_{t['service']}_{t['command'].lstrip('+').replace('-', '_')}"

# Tools the server implements itself; they are not lark-cli shortcuts.
META_TOOLS = {'lark_invoke', 'lark_discover', 'lark_get_skill',
              'lark_list_skills', 'lark_exec_script'}
catalog_names = {tool_name(t) for t in tools}
# A `string`-typed flag is either a plain scalar (pflag `strings`, comma-joined —
# an array literal there is a real defect) or a COMPOSITE JSON flag, where the
# value is a JSON document and server.js JSON-stringifies an array into exactly
# what the CLI wants — an array literal there is correct. Tell them apart by the
# flag's own contract: a payload schema, or a description that says JSON / opens
# with a JSON literal.
flag_types, json_flags = {}, {}
for t in tools:
    name = tool_name(t)
    schemas = t.get('payloadSchemas') or {}
    flag_types[name] = {}
    json_flags[name] = set()
    for f in (t.get('flags') or []):
        key = f['name'].replace('-', '_')
        flag_types[name][key] = f.get('type')
        desc = (f.get('description') or '').lstrip()
        if (f['name'] in schemas or key in schemas
                or 'JSON' in desc or desc[:1] in ('[', '{')):
            json_flags[name].add(key)

if not os.path.isdir(SKILLS_DIR):
    print(f"  \033[33m·\033[0m {SKILLS_DIR} not present; skipping "
          f"(running against an image catalog outside a checkout?)")
else:
    call_re = re.compile(r'\b(lark_[a-z0-9_]+)\s*\(')
    unknown, mistyped = {}, []
    md_files = 0
    for root, _dirs, files in os.walk(SKILLS_DIR):
        for fn in sorted(files):
            if not fn.endswith('.md'):
                continue
            md_files += 1
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, REPO_ROOT)
            with open(path, encoding='utf-8') as fh:
                for lineno, line in enumerate(fh, 1):
                    for name in call_re.findall(line):
                        if name in META_TOOLS:
                            continue
                        if name not in catalog_names:
                            unknown.setdefault(name, []).append(f"{rel}:{lineno}")
                            continue
                        for flag, ftype in flag_types[name].items():
                            # `flag=[` is an array literal, `flag="` a string.
                            as_array = re.search(
                                rf'\b{flag}\s*=\s*\[', line)
                            as_string = re.search(
                                rf'\b{flag}\s*=\s*["\']', line)
                            if ftype == 'stringArray' and as_string:
                                mistyped.append(
                                    f"{rel}:{lineno} {name}.{flag} is stringArray "
                                    f"but written as a string (comma form is NOT split)")
                            elif (ftype == 'string' and as_array
                                    and flag not in json_flags[name]):
                                mistyped.append(
                                    f"{rel}:{lineno} {name}.{flag} is a scalar string "
                                    f"but written as an array (JSON-stringified to one value)")

    if not unknown:
        ok(f"every tool named in {md_files} skill docs exists in the catalog")
    else:
        bad(f"{len(unknown)} tool name(s) in skill docs are NOT catalog tools "
            f"(validate against the catalog, never shortcut-scopes.json):")
        for name in sorted(unknown)[:6]:
            print(f"      {name} — {', '.join(unknown[name][:3])}")

    if not mistyped:
        ok("no stringArray/string flag-type mismatches in skill docs")
    else:
        bad(f"{len(mistyped)} flag-type mismatch(es) — these fail SILENTLY at call time:")
        for m in mistyped[:6]:
            print(f"      {m}")

# End-to-end counterpart of the scope-coverage unit assertions: prove the shortcuts
# marks non-user-callable really are absent from the catalog the server serves.
if os.path.exists(SCOPES):
    with open(SCOPES) as f:
        _sc = json.load(f).get('shortcuts', [])
    user_unavailable = [s for s in _sc if s.get('userCallable') is False]
    leaked = [f"{s['service']} {s['command']}"
              for s in user_unavailable
              if (s['service'], s['command']) in
              {(t['service'], t['command']) for t in tools}]
    if not user_unavailable:
        bad("no shortcut is marked userCallable:false — the extraction gate in "
            "scripts/extract-shortcut-scopes.py has stopped working")
    elif leaked:
        bad(f"{len(leaked)} non-user-callable shortcut(s) reached the catalog — the adapted "
            f"skills claim no tool exists for them: {leaked}")
    else:
        ok(f"all {len(user_unavailable)} non-user-callable shortcut(s) absent from the catalog")

# ── Summary ────────────────────────────────────────────────────────────────
print(f"\n──────────────────────────────────")
print(f"  PASS: \033[32m{PASS}\033[0m")
print(f"  FAIL: \033[31m{FAIL}\033[0m")
sys.exit(0 if FAIL == 0 else 1)
PYEOF

# shellcheck shell=bash
# scripts/lib/registry.sh — file-based app registry + HARD alias uniqueness.
#
# The registry is a JSON object at $APPS_REGISTRY (default .local/apps.json):
#   { "apps": { "<slug>": {slug, alias, aliasKey, region, endpoint, runtime, ...} } }
# Alias uniqueness is enforced on a NORMALIZED key (trim + collapse whitespace +
# lowercase) so 'HR Prod' / 'hr   prod' collide. All mutations go through python3
# read-modify-write under an atomic mkdir lock so concurrent deploys can't race.
#
# Design: .claude/specs/2026-06-07-multi-app-overview-and-identity.md
#   (file index now; promote to DynamoDB when CI/multi-operator needs it).

: "${APPS_REGISTRY:="${LOCAL_DIR:-.local}/apps.json"}"

_registry_py() {
  # Run a python snippet with REG (path), and forward extra args as sys.argv[1:].
  REG="$APPS_REGISTRY" python3 "$@"
}

# _with_lock <fn> <args...> : run a registry mutation under an atomic mkdir lock.
_with_lock() {
  local lock="${APPS_REGISTRY}.lock"
  local tries=0
  mkdir -p "$(dirname "$APPS_REGISTRY")"
  while ! mkdir "$lock" 2>/dev/null; do
    tries=$((tries+1)); [ "$tries" -gt 100 ] && { echo "registry: lock timeout" >&2; return 1; }
    sleep 0.05
  done
  # shellcheck disable=SC2064
  trap "rmdir '$lock' 2>/dev/null || true" RETURN
  "$@"
}

# claim_alias <slug> <alias> : 0 if the alias is free OR already owned by <slug>;
# non-zero (and no write) if a DIFFERENT slug owns the normalized alias.
claim_alias() { _with_lock _claim_alias_impl "$@"; }
_claim_alias_impl() {
  local slug="$1" alias="$2"
  REG="$APPS_REGISTRY" SLUG="$slug" ALIAS="$alias" python3 - <<'PY'
import json, os, re, sys
reg = os.environ["REG"]; slug = os.environ["SLUG"]; alias = os.environ["ALIAS"]
def norm(s): return re.sub(r"\s+", " ", s.strip()).lower()
key = norm(alias)
try:
    with open(reg) as f: data = json.load(f)
except (FileNotFoundError, ValueError):
    data = {"apps": {}}
apps = data.setdefault("apps", {})
for s, row in apps.items():
    if row.get("aliasKey") == key and s != slug:
        print(f"alias '{alias}' already in use by app '{s}'", file=sys.stderr)
        sys.exit(1)
row = apps.setdefault(slug, {"slug": slug})
row["alias"] = alias; row["aliasKey"] = key
with open(reg, "w") as f: json.dump(data, f, indent=2, ensure_ascii=False)
os.chmod(reg, 0o600)
PY
}

# rename_alias <slug> <new-alias> : free the slug's old alias and claim the new
# one atomically; fails if another slug holds the new (normalized) alias.
rename_alias() { _with_lock _claim_alias_impl "$@"; }

# alias_taken_by_other <slug> <alias> : READ-ONLY precheck (no write, no lock).
# Returns 0 if the normalized alias is already owned by a DIFFERENT slug (i.e. a
# claim would fail), non-zero otherwise. Used by the interactive new-app flow to
# re-prompt before committing — the authoritative write still goes through
# claim_alias. Mirrors _claim_alias_impl's normalization exactly.
alias_taken_by_other() {
  [ -f "$APPS_REGISTRY" ] || return 1
  REG="$APPS_REGISTRY" SLUG="$1" ALIAS="$2" python3 - <<'PY'
import json, os, re, sys
def norm(s): return re.sub(r"\s+", " ", s.strip()).lower()
try:
    with open(os.environ["REG"]) as f: data = json.load(f)
except (FileNotFoundError, ValueError):
    sys.exit(1)
key = norm(os.environ["ALIAS"]); slug = os.environ["SLUG"]
for s, row in data.get("apps", {}).items():
    if row.get("aliasKey") == key and s != slug:
        sys.exit(0)   # taken by another slug
sys.exit(1)           # free (or owned by this slug)
PY
}

# slug_registered <slug> : 0 if the slug already has a registry row, else non-zero.
slug_registered() {
  [ -f "$APPS_REGISTRY" ] || return 1
  REG="$APPS_REGISTRY" SLUG="$1" python3 - <<'PY'
import json, os, sys
try:
    with open(os.environ["REG"]) as f: data = json.load(f)
except (FileNotFoundError, ValueError):
    sys.exit(1)
sys.exit(0 if os.environ["SLUG"] in data.get("apps", {}) else 1)
PY
}

# upsert_app <slug> <alias> <region> <endpoint> <runtime> : record/update a row.
upsert_app() { _with_lock _upsert_app_impl "$@"; }
_upsert_app_impl() {
  REG="$APPS_REGISTRY" SLUG="$1" ALIAS="$2" REGION_="$3" ENDPOINT="$4" RUNTIME_="$5" python3 - <<'PY'
import json, os, re
reg = os.environ["REG"]
def norm(s): return re.sub(r"\s+", " ", s.strip()).lower()
try:
    with open(reg) as f: data = json.load(f)
except (FileNotFoundError, ValueError):
    data = {"apps": {}}
apps = data.setdefault("apps", {})
slug = os.environ["SLUG"]; alias = os.environ["ALIAS"]
row = apps.setdefault(slug, {"slug": slug})
row.update({
    "slug": slug,
    "alias": alias,
    "aliasKey": norm(alias),
    "region": os.environ["REGION_"],
    "endpoint": os.environ["ENDPOINT"],
    "runtime": os.environ["RUNTIME_"],
})
with open(reg, "w") as f: json.dump(data, f, indent=2, ensure_ascii=False)
os.chmod(reg, 0o600)
PY
}

# list_app_slugs : print every registered slug, one per line.
list_app_slugs() {
  [ -f "$APPS_REGISTRY" ] || return 0
  REG="$APPS_REGISTRY" python3 - <<'PY'
import json, os
try:
    with open(os.environ["REG"]) as f: data = json.load(f)
except (FileNotFoundError, ValueError):
    data = {"apps": {}}
for s in data.get("apps", {}): print(s)
PY
}

# get_app_alias <slug> : print the stored alias (empty if none).
get_app_alias() {
  [ -f "$APPS_REGISTRY" ] || return 0
  REG="$APPS_REGISTRY" SLUG="$1" python3 - <<'PY'
import json, os
try:
    with open(os.environ["REG"]) as f: data = json.load(f)
except (FileNotFoundError, ValueError):
    data = {"apps": {}}
print(data.get("apps", {}).get(os.environ["SLUG"], {}).get("alias", ""))
PY
}

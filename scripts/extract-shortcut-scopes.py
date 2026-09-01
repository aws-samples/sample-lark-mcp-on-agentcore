#!/usr/bin/env python3
"""Extract shortcut scope mappings from lark-cli Go source.

Usage:
    python3 scripts/extract-shortcut-scopes.py /path/to/lark-cli-source [version]

Produces docker/shortcut-scopes.json with UserScopes-first extraction strategy:
  - Prefer UserScopes when present
  - Fallback to Scopes when no UserScopes defined
  - Include ConditionalUserScopes / ConditionalScopes
  - Exclude BotScopes — including when the same scope also appears in the
    generic Scopes fallback (upstream may declare it under both)
  - Exclude every scope of a shortcut whose AuthTypes omits "user" (the
    endpoint rejects user tokens, so nothing there is user-grantable)

Handles:
  - Direct []string{...} literals
  - Package-level var/const string references (single value and slices)
  - append([]string{...}, otherVar...) patterns
  - Empty Scopes ([]string{}) — included as empty arrays
  - Service name constants
"""
import json
import re
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print("Usage: extract-shortcut-scopes.py <lark-cli-source-dir> [version]", file=sys.stderr)
        sys.exit(1)

    src = Path(sys.argv[1]) / "shortcuts"
    version = sys.argv[2] if len(sys.argv) > 2 else "unknown"

    if not src.exists():
        print(f"ERROR: {src} does not exist", file=sys.stderr)
        sys.exit(1)

    # Phase 1: Collect all package-level variables and constants across all Go files
    scope_vars = {}       # varname -> list of scope strings
    string_consts = {}    # constname -> single string value
    service_consts = {}   # constname -> service name string

    for gofile in sorted(src.rglob("*.go")):
        if "_test.go" in gofile.name:
            continue
        content = gofile.read_text()

        # var someScopes = []string{"scope1", "scope2"}
        for m in re.finditer(r'(\w+)\s*=\s*\[\]string\{([^}]*)\}', content):
            varname = m.group(1)
            scopes = re.findall(r'"([^"]+)"', m.group(2))
            scope_vars[varname] = scopes

        # var combined = append([]string{baseVar}, otherVar...)
        for m in re.finditer(
            r'(\w+)\s*=\s*append\(\[\]string\{(\w+)\},\s*(\w+)\.\.\.\)',
            content
        ):
            varname, base_var, rest_var = m.group(1), m.group(2), m.group(3)
            scope_vars[varname] = ("append", base_var, rest_var)

        # const or var singleScope = "some:scope:value"
        for m in re.finditer(r'(\w+)\s*=\s*"([^"]*:[^"]*)"', content):
            string_consts[m.group(1)] = m.group(2)

        # Service name constants: someService = "servicename"
        for m in re.finditer(r'(\w*[Ss]ervice\w*)\s*=\s*"([^"]+)"', content):
            service_consts[m.group(1)] = m.group(2)

    def resolve_var(varname):
        """Resolve a variable name to a list of scope strings."""
        if varname in scope_vars:
            val = scope_vars[varname]
            if isinstance(val, tuple) and val[0] == "append":
                # ("append", base_var, rest_var)
                base = resolve_var(val[1])
                rest = resolve_var(val[2])
                return base + rest
            return val
        if varname in string_consts:
            return [string_consts[varname]]
        return []

    # Phase 2: Extract Shortcut structs
    shortcut_pattern = re.compile(
        r'(?:var\s+\w+\s*=\s*)?common\.Shortcut\s*\{(.*?)\n\}',
        re.DOTALL
    )

    def strip_comments(text):
        text = re.sub(r'//[^\n]*', '', text)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        return text

    def extract_string_field(body, field):
        pattern = re.compile(rf'{field}\s*:\s*"([^"]+)"')
        m = pattern.search(body)
        return m.group(1) if m else ""

    def merge_user_scopes(base_scopes, cond_scopes, bot_scopes, auth_types,
                          from_user_field, has_auth):
        """Combine a shortcut's scope fields into the user-grantable set.

        Returns (scopes, user_callable). ``user_callable`` is False when upstream
        declares AuthTypes without "user": such a shortcut cannot be invoked with a
        user token at all, so it grants no user scopes AND must not be exposed as an
        MCP tool. generate-tools.js consumes the flag so that exclusion is a checked
        contract rather than a side effect of lark-cli hiding bot-only commands from
        `--help` (which only happens when a user-token env var is set at build time).

        Two bot-only leaks are filtered here, both of which the plain
        "exclude BotScopes" rule misses:

        1. When no UserScopes is declared we fall back to the generic ``Scopes``
           field, which carries whatever identity upstream happens to support.
           A scope listed there AND in ``BotScopes`` is bot-only, so drop it.
           Scopes taken from ``UserScopes`` are left alone — upstream declared
           them user-grantable, and the same string may legitimately appear
           under both identities.
        2. ``AuthTypes`` without "user" means the endpoint rejects user tokens
           outright (e.g. im +messages-edit, added in 1.0.92), so the shortcut
           grants no user scopes at all regardless of the fields above.
        """
        if not from_user_field:
            botset = set(bot_scopes)
            base_scopes = [s for s in base_scopes if s not in botset]
            cond_scopes = [s for s in cond_scopes if s not in botset]
        if has_auth and auth_types and "user" not in auth_types:
            return [], False
        return list(dict.fromkeys(base_scopes + cond_scopes)), True

    def extract_scope_field(body, field):
        """Extract scope list from a struct field, resolving variable references."""
        # Direct []string{...}
        pattern = re.compile(rf'(?<![A-Za-z0-9_]){field}\s*:\s*\[\]string\{{([^}}]*)\}}', re.DOTALL)
        m = pattern.search(body)
        if m:
            inner = m.group(1).strip()
            # Quoted string literals
            quoted = re.findall(r'"([^"]+)"', inner)
            if quoted:
                return quoted, True
            # Identifiers (variable/const references) inside []string{ident, ...}
            if inner:
                idents = re.findall(r'(\w+)', inner)
                resolved = []
                for ident in idents:
                    resolved.extend(resolve_var(ident))
                if resolved:
                    return resolved, True
            # Truly empty: []string{}
            return [], True

        # Variable reference: Field: someVar,
        pattern = re.compile(rf'(?<![A-Za-z0-9_]){field}\s*:\s*(\w+)\s*,')
        m = pattern.search(body)
        if m:
            return resolve_var(m.group(1)), True

        # append() inline: Field: append([]string{"x"}, someVar...)
        pattern = re.compile(
            rf'{field}\s*:\s*append\(\[\]string\{{([^}}]*)\}},\s*(\w+)\.\.\.\)',
        )
        m = pattern.search(body)
        if m:
            base = re.findall(r'"([^"]+)"', m.group(1))
            rest = resolve_var(m.group(2))
            return base + rest, True

        return [], False

    results = []
    # Every scope upstream declares under BotScopes / ConditionalBotScopes, across
    # all shortcuts. Recorded in _meta so scripts/extract-rawapi-scopes.sh can flag
    # a raw-API scope that is bot-declared upstream: that script runs inside the
    # container against lark-cli's flat `_meta.scopes` list, which carries no
    # per-identity tag, so on its own it can only guess from the :send_as_bot suffix.
    bot_declared = set()

    for gofile in sorted(src.rglob("*.go")):
        if "_test.go" in gofile.name:
            continue
        content = strip_comments(gofile.read_text())

        for m in shortcut_pattern.finditer(content):
            body = m.group(1)

            service = extract_string_field(body, "Service")
            command = extract_string_field(body, "Command")

            if not service:
                svc_pattern = re.compile(r'Service\s*:\s*(\w+)\s*,')
                sm = svc_pattern.search(body)
                if sm and sm.group(1) in service_consts:
                    service = service_consts[sm.group(1)]
            if not service or not command:
                continue

            # UserScopes-first strategy
            user_scopes, has_user = extract_scope_field(body, "UserScopes")
            generic_scopes, has_generic = extract_scope_field(body, "Scopes")
            cond_user, _ = extract_scope_field(body, "ConditionalUserScopes")
            cond_generic, _ = extract_scope_field(body, "ConditionalScopes")
            bot_scopes, _ = extract_scope_field(body, "BotScopes")
            cond_bot, _ = extract_scope_field(body, "ConditionalBotScopes")
            bot_declared.update(bot_scopes)
            bot_declared.update(cond_bot)
            auth_types, has_auth = extract_scope_field(body, "AuthTypes")

            base_scopes = user_scopes if has_user and user_scopes else generic_scopes
            cond_scopes = cond_user if cond_user else cond_generic

            all_scopes, user_callable = merge_user_scopes(
                base_scopes, cond_scopes, bot_scopes, auth_types,
                from_user_field=bool(has_user and user_scopes),
                has_auth=has_auth,
            )

            entry = {
                "service": service,
                "command": command,
                "scopes": all_scopes,
            }
            if not user_callable:
                entry["userCallable"] = False
            results.append(entry)

    # Phase 3: Catch dynamically-registered shortcuts missed by regex.
    # Some shortcuts are generated by helper functions (objectCRUDSpec, newMergeShortcut, etc.)
    # whose Command field uses string concatenation or function parameters.
    # Strategy: scan for known factory patterns and extract their scope declarations.

    extracted_keys = {(r["service"], r["command"]) for r in results}

    # 3a: objectCRUDSpec pattern — generates -create/-update/-delete/-list from commandPrefix
    crud_spec_pattern = re.compile(
        r'commandPrefix\s*:\s*"(\+[^"]+)"', re.MULTILINE
    )
    for gofile in sorted(src.rglob("*.go")):
        if "_test.go" in gofile.name:
            continue
        content = strip_comments(gofile.read_text())
        for m in crud_spec_pattern.finditer(content):
            prefix = m.group(1)  # e.g. "+chart"
            for suffix in ["-create", "-update", "-delete"]:
                cmd = prefix + suffix
                if ("sheets", cmd) not in extracted_keys:
                    results.append({"service": "sheets", "command": cmd, "scopes": ["sheets:spreadsheet:write_only"]})
                    extracted_keys.add(("sheets", cmd))

    # 3b: objectListSpec pattern — generates a list command
    list_spec_pattern = re.compile(
        r'objectListSpec\s*\{[^}]*command\s*:\s*"(\+[^"]+)"', re.DOTALL
    )
    for gofile in sorted(src.rglob("*.go")):
        if "_test.go" in gofile.name:
            continue
        content = strip_comments(gofile.read_text())
        for m in list_spec_pattern.finditer(content):
            cmd = m.group(1)
            if ("sheets", cmd) not in extracted_keys:
                results.append({"service": "sheets", "command": cmd, "scopes": ["sheets:spreadsheet:read"]})
                extracted_keys.add(("sheets", cmd))

    # 3c: Helper function calls that pass command as first string argument
    # Patterns: newMergeShortcut("+cells-merge", ...), newDimRangeOpShortcut("+dim-hide", ...),
    #           newDimGroupShortcut("+dim-group", ...), newSheetVisibilityShortcut("+sheet-hide", ...)
    helper_call_pattern = re.compile(
        r'(?:newMergeShortcut|newDimRangeOpShortcut|newDimGroupShortcut|newSheetVisibilityShortcut'
        r'|newFilterShortcut)\s*\(\s*"(\+[^"]+)"',
        re.MULTILINE
    )
    for gofile in sorted(src.rglob("*.go")):
        if "_test.go" in gofile.name:
            continue
        content = strip_comments(gofile.read_text())
        for m in helper_call_pattern.finditer(content):
            cmd = m.group(1)
            if ("sheets", cmd) not in extracted_keys:
                results.append({"service": "sheets", "command": cmd, "scopes": ["sheets:spreadsheet:write_only"]})
                extracted_keys.add(("sheets", cmd))

    # 3d: Config-struct factories — a `common.Shortcut{}` returned from inside a
    # helper whose Command comes from a config field (`Command: cfg.Command`),
    # with the actual command names in sibling config-struct literals:
    #
    #   var DriveResolveComment = newDriveCommentSolvedShortcut(driveCommentSolvedConfig{
    #       Command: "+resolve-comment", ...})
    #   func newDriveCommentSolvedShortcut(cfg ...) common.Shortcut {
    #       return common.Shortcut{Service: "drive", Command: cfg.Command,
    #                              Scopes: [...], ConditionalScopes: [...]}}
    #
    # Phase 1 skips these: `cfg.Command` is not a literal, so `command` is empty.
    # Service and the scope fields ARE literals in the factory body, so read them
    # from there and pair them with every command literal in the same file —
    # unlike 3a-3c this needs no hardcoded service/scope guesses.
    #
    # The factory's `common.Shortcut{` closes at an INDENTED brace, so
    # shortcut_pattern (which anchors `\n}` at column 0) swallows the rest of the
    # function into one match. That is harmless here: the fields are read by name.
    config_cmd_pattern = re.compile(r'^\s*Command\s*:\s*"(\+[^"]+)"\s*,', re.MULTILINE)
    for gofile in sorted(src.rglob("*.go")):
        if "_test.go" in gofile.name:
            continue
        content = strip_comments(gofile.read_text())
        for m in shortcut_pattern.finditer(content):
            body = m.group(1)
            # Only factories: a Command that is a field selector, not a literal.
            if not re.search(r'Command\s*:\s*\w+\.\w+\s*,', body):
                continue
            service = extract_string_field(body, "Service")
            if not service:
                continue
            user_scopes, has_user = extract_scope_field(body, "UserScopes")
            generic_scopes, _ = extract_scope_field(body, "Scopes")
            cond_user, _ = extract_scope_field(body, "ConditionalUserScopes")
            cond_generic, _ = extract_scope_field(body, "ConditionalScopes")
            bot_scopes, _ = extract_scope_field(body, "BotScopes")
            cond_bot, _ = extract_scope_field(body, "ConditionalBotScopes")
            bot_declared.update(bot_scopes)
            bot_declared.update(cond_bot)
            auth_types, has_auth = extract_scope_field(body, "AuthTypes")
            base_scopes = user_scopes if has_user and user_scopes else generic_scopes
            cond_scopes = cond_user if cond_user else cond_generic
            all_scopes, user_callable = merge_user_scopes(
                base_scopes, cond_scopes, bot_scopes, auth_types,
                from_user_field=bool(has_user and user_scopes),
                has_auth=has_auth,
            )
            for cm in config_cmd_pattern.finditer(content):
                cmd = cm.group(1)
                if (service, cmd) not in extracted_keys:
                    entry = {"service": service, "command": cmd,
                             "scopes": all_scopes}
                    if not user_callable:
                        entry["userCallable"] = False
                    results.append(entry)
                    extracted_keys.add((service, cmd))

    results.sort(key=lambda x: (x["service"], x["command"]))

    # A scope declared under BotScopes is not necessarily bot-ONLY: plenty are also
    # granted to users (base:app:copy, wiki:node:retrieve, im:message:readonly …).
    # Subtracting everything that survived as a user scope leaves the genuinely
    # bot-exclusive strings — the set worth alerting on when it shows up on the
    # raw-API side, where identity cannot be read from the schema.
    user_side = {s for r in results for s in r["scopes"]}
    bot_exclusive = sorted(bot_declared - user_side)

    output = {
        "_meta": {
            "lark_cli_version": version,
            "extracted_at": __import__("datetime").date.today().isoformat(),
            "source": "https://github.com/larksuite/cli",
            "bot_declared_scopes": sorted(bot_declared),
            "bot_exclusive_scopes": bot_exclusive,
        },
        "shortcuts": results,
    }

    # Write to stdout for piping, or directly to the target file
    out_path = Path(__file__).resolve().parent.parent / "docker" / "shortcut-scopes.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Extracted {len(results)} shortcuts → {out_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Extract shortcut scope mappings from lark-cli Go source.

Usage:
    python3 scripts/extract-shortcut-scopes.py /path/to/lark-cli-source [version]

Produces docker/shortcut-scopes.json with UserScopes-first extraction strategy:
  - Prefer UserScopes when present
  - Fallback to Scopes when no UserScopes defined
  - Include ConditionalUserScopes / ConditionalScopes
  - Exclude BotScopes

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

    def extract_scope_field(body, field):
        """Extract scope list from a struct field, resolving variable references."""
        # Direct []string{...}
        pattern = re.compile(rf'{field}\s*:\s*\[\]string\{{([^}}]*)\}}', re.DOTALL)
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
        pattern = re.compile(rf'{field}\s*:\s*(\w+)\s*,')
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

            base_scopes = user_scopes if has_user and user_scopes else generic_scopes
            cond_scopes = cond_user if cond_user else cond_generic

            all_scopes = list(dict.fromkeys(base_scopes + cond_scopes))

            results.append({
                "service": service,
                "command": command,
                "scopes": all_scopes,
            })

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

    results.sort(key=lambda x: (x["service"], x["command"]))

    output = {
        "_meta": {
            "lark_cli_version": version,
            "extracted_at": __import__("datetime").date.today().isoformat(),
            "source": "https://github.com/larksuite/cli",
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

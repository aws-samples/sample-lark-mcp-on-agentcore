# Base advanced permission and role guide

This guide is the entry point for Base advanced permissions and roles. Use it to choose commands and understand safety boundaries. For the permission JSON itself, use `lark_get_skill(domain="base", section="role-config")` as the SSOT.

## Command selection

| Goal | Tool | Notes |
|------|------|-------|
| Enable advanced permissions | `lark_base_advperm_enable()` | Required before creating or updating roles. Caller must be a Base admin. |
| Disable advanced permissions | `lark_base_advperm_disable()` | High-risk write. Disabling invalidates existing custom roles. |
| Locate roles | `lark_base_role_list()` | Returns role summaries. Use `lark_base_role_get()` for full config. |
| Inspect one role | `lark_base_role_get()` | Use before updating a role or deciding whether a role can be deleted. |
| Create a custom role | `lark_base_role_create()` | Supports `custom_role` only. Read `lark_get_skill(domain="base", section="role-config")` before constructing `json`. |
| Update a role | `lark_base_role_update()` | Delta merge. Read current config first, then send only intended changes. |
| Delete a role | `lark_base_role_delete()` | Custom roles only. System roles cannot be deleted. |

## Safety boundaries

- Role operations require advanced permissions to be enabled and the caller to be a Base admin.
- `lark_base_role_create()` creates custom roles only.
- `lark_base_role_delete()` is only for custom roles. System roles such as editor/reader can be configured within supported limits, but cannot be deleted.
- `lark_base_role_update()` uses delta merge: omitted fields remain unchanged, but identity fields such as `role_name` and `role_type` should match the current target role.
- `lark_base_advperm_disable()` invalidates existing custom roles; confirm the target Base and user intent before passing `_confirm=true`.

## Common Fewshots

Use these fewshots for simple role changes. For table, field, record, dashboard, docx, or filter permission details, switch to `lark_get_skill(domain="base", section="role-config")`.

Create a custom role that keeps copy/download disabled:

```
lark_base_role_create(base_token="<base_token>", json='{"role_name":"Reviewer","role_type":"custom_role","base_rule_map":{"copy":false,"download":false}}')
```

Rename a role while preserving its type:

```
lark_base_role_update(base_token="<base_token>", role_id="<role_id>", json='{"role_name":"Finance Reviewer","role_type":"custom_role"}', _confirm=true)
```

Grant read-only access to one table:

```
lark_base_role_update(base_token="<base_token>", role_id="<role_id>", json='{"role_name":"Finance Reviewer","role_type":"custom_role","table_rule_map":{"Orders":{"perm":"read_only"}}}', _confirm=true)
```

## JSON SSOT

Use `lark_get_skill(domain="base", section="role-config")` for:

- `AdvPermBaseRoleConfig` top-level structure.
- `base_rule_map`, `table_rule_map`, `dashboard_rule_map`, and `docx_rule_map`.
- Table, view, field, record, dashboard, and docx permission values.
- Filter permission JSON.
- Default permission strategy and risk rules.

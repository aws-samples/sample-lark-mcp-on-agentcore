# lark-wiki +member-remove

Remove a member from a wiki space. OpenAPI: `DELETE /open-apis/wiki/v2/spaces/:space_id/members/:member_id`. Unlike most DELETEs, this endpoint **requires a body** carrying `member_type` and `member_role` — the `:member_id` path segment alone is ambiguous without both.

> The underlying `members.delete` API is flagged `danger: true` in the schema browser, but the operation is recoverable — call `lark_wiki_member_add` with the same `(member_id, member_type, member_role)` to restore. No `_confirm` gate.

## Usage

```
lark_wiki_member_remove(space_id="<space_id>", member_id="<open_id|email|user_id|app_id|...>", member_type="openid", member_role="admin")

# Personal library (resolves my_library first)
lark_wiki_member_remove(space_id="my_library", member_id="ou_xxx", member_type="openid", member_role="member")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `space_id` | string | **Yes** | — | Wiki space ID; use `my_library` for the personal document library |
| `member_id` | string | **Yes** | — | Member ID; interpretation is decided by `member_type` |
| `member_type` | enum | **Yes** | — | Must **match the original grant**: `openchat` / `userid` / `email` / `opendepartmentid` / `openid` / `unionid` / `appid` |
| `member_role` | enum | **Yes** | — | Must **match the original grant**: `admin` / `member` |

## Output

```json
{
  "space_id": "7160145948494381236",
  "member_id": "ou_449b53ad6aee526f7ed311b216aabcef",
  "member_type": "openid",
  "member_role": "admin"
}
```

If the API ever omits the member echo, the tool falls back to surfacing the caller-supplied `(member_id, member_type, member_role)` so downstream still sees what was removed.

## Notes

- **`member_type` and `member_role` must match the original grant.** Revoking a non-existent `(member_id, type, role)` tuple is a no-op error from the API. If you do not know the current role, run `lark_wiki_member_list` first.
- **Role switch is not a single update.** To move someone between `admin` and `member`, call `lark_wiki_member_remove` with the old role first, then `lark_wiki_member_add` with the new one.
- **Bot + `my_library` is rejected upfront.** ⚠️ Bot identity operations are not available via the MCP server.

## Required Scope

`wiki:member:update`

# lark-wiki +member-add

Add a member to a wiki space. OpenAPI: `POST /open-apis/wiki/v2/spaces/:space_id/members`. Shortcut over the raw `wiki members create` — adds enum hints, optional `need_notification`, `my_library` resolution, and a flattened single-member output envelope.

> The underlying `members.create` API is flagged `danger: true` in the schema browser, but adding a member is **not** confirmation-gated (no `_confirm`). To revert, call `lark_wiki_member_remove` with the same `(member_id, member_type, member_role)` tuple.

## Usage

```
# Add a user as a regular member
lark_wiki_member_add(space_id="<space_id>", member_id="<open_id|email|user_id|app_id|...>", member_type="openid", member_role="admin")

# Personal library (resolves my_library to the per-user real space first)
lark_wiki_member_add(space_id="my_library", member_id="ou_xxx", member_type="openid", member_role="member")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `space_id` | string | **Yes** | — | Wiki space ID; use `my_library` for the personal document library |
| `member_id` | string | **Yes** | — | Member ID; interpretation is decided by `member_type` |
| `member_type` | enum | **Yes** | — | `openchat` / `userid` / `email` / `opendepartmentid` / `openid` / `unionid` / `appid` |
| `member_role` | enum | **Yes** | — | `admin` (full space administration) / `member` (collaborator) |
| `need_notification` | bool | No | unset | Send an in-app notification after the grant. **Omitting sends no `need_notification` query at all** — passing `need_notification=false` is the explicit opt-out |

## Output

```json
{
  "space_id": "7160145948494381236",
  "member_id": "ou_449b53ad6aee526f7ed311b216aabcef",
  "member_type": "openid",
  "member_role": "admin",
  "type": "user"
}
```

`type` is a read-only enum (`user` / `chat` / `department`) the server attaches; absent when the API omits it.

## Notes

- `space_id="my_library"` is a per-user alias. The MCP server always runs with user identity, so it resolves normally. (It is rejected only under bot identity, which this server does not use.)
- **Department members work here.** The `opendepartmentid` restriction is a bot-identity limitation on the backend; user identity — the only identity this server uses — is the supported path for department adds.
- **App member uses `member_type="appid"`.** The corresponding `member_id` is the app ID, commonly formatted as `cli_xxx`.
- Resolve `member_id` **before** calling: `lark_contact_search_user` for users, `lark_im_chat_search` for groups. For departments there is **no** lookup tool in this surface (the 1.0.96 catalog exposes no department resource), so the `open_department_id` must be supplied by the caller. Do not call `lark_wiki_member_add` first and reverse-engineer the type from the error.
- The role switch (`admin` <-> `member`) is not a single update — call `lark_wiki_member_remove` for the old role first, then `lark_wiki_member_add` with the new one.

## Required Scope

`wiki:member:create`

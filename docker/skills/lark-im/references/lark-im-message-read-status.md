# IM message read status

Two focused tools cover message read-status queries:

- `lark_im_messages_read_status` queries whether the current user has read 1–50 messages.
- `lark_im_message_read_users` lists users who have read one message and supports automatic pagination.

The two answer different questions and can disagree on the same message without either being wrong. For a message the current user sent, `lark_im_messages_read_status` reports `is_read: true` (the sender has seen their own message) while `lark_im_message_read_users` can still return `total: 0` — the recipient list is empty because nobody else has opened it yet. Do not treat that pair as a contradiction, and do not use one to sanity-check the other.

Both underlying OpenAPIs support user identity, which is the only identity the MCP server uses (authentication is handled automatically by the MCP server).

## Identity and scopes

| Tool | Identity | Scope |
|---|---|---|
| `lark_im_messages_read_status` | user only | `im:message:readonly` (recommended) or `im:message` |
| `lark_im_message_read_users` | user | `im:message:readonly` (recommended) or `im:message` |

The two scopes are alternatives; either one is sufficient, and the preflight asks for `im:message:readonly` because it is the least-privileged regular OAuth scope these endpoints accept.

> The upstream API docs also list `im:message:basic` and `im:message:get_as_user` as alternative scopes for these endpoints. **Do not treat them as options here** — neither can be granted in this deployment (the Feishu developer console rejects both with "该权限不存在"), so `im:message:readonly` is the scope to grant.

> ⚠️ `lark_im_message_read_users` additionally supports bot identity upstream. Bot identity is not available via the MCP server, which always calls as the user — so the user-identity constraints below always apply.

## Batch query the current user's read status

```
lark_im_messages_read_status(message_ids="om_xxx,om_yyy")
```

Accepts 1–50 comma-separated `om_` message IDs. The response keeps the OpenAPI response unchanged:

- `items[].message_id` and `items[].is_read` contain the statuses the server could determine.
- `invalid_message_ids` contains messages that do not exist, are not visible to the current user, or do not support this query. The API deliberately does not expose a more specific reason.

### Parameters

| Parameter | Required | Limits | Description |
|---|---|---|---|
| `message_ids` | Yes | 1–50 `om_xxx` IDs, comma-separated | Message ID list |

## List users who read one message

```
# Fetch one page
lark_im_message_read_users(message_id="om_xxx")

# Fetch every page, bounded to ten pages by default
lark_im_message_read_users(message_id="om_xxx", user_id_type="open_id", page_all=true)
```

The caller must still be in the chat, and can only query messages **they sent within the last seven days**.

### Parameters

| Parameter | Required | Limits | Description |
|---|---|---|---|
| `message_id` | Yes | `om_xxx` | The message to inspect |
| `user_id_type` | No | `open_id` (default), `union_id`, `user_id` | User ID type returned in each item |
| `page_size` | No | 1–100, default 100 | Page size |
| `page_token` | No | — | Start from a known cursor |
| `page_all` | No | — | Continue from `page_token` until the endpoint is exhausted or `page_limit` is reached |
| `page_limit` | No | 1–1000, default 10 | Maximum pages fetched by `page_all` |
| `page_delay` | No | 0–60000 ms, default 200 | Delay between pages with `page_all`; 0 disables throttling |

Each server item is preserved, including `user_id_type`, `user_id`, `timestamp`, and `tenant_key`. Pagination metadata reports whether the endpoint was exhausted and retains the next token when a bounded run can be resumed.

## Raw APIs

`im messages read_status` and `im messages read_users` expose the same two endpoints as raw APIs, but they add nothing over the tools above and offer no flag validation, scope hints, or read-users auto-pagination. Use `lark_im_messages_read_status` and `lark_im_message_read_users`.

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| Read status rejects a bot call | The batch endpoint requires user identity | Nothing to do — the MCP server always calls as the user |
| Missing `im:message:readonly` or `im:message` | No supported regular OAuth scope has been granted | Grant `im:message:readonly` and retry |
| Permission error naming `im:message:basic` or `im:message:get_as_user` | The error echoes an upstream alternative scope that cannot be granted here | Grant `im:message:readonly` instead |
| Empty read-user list | No user has read the message, or the sender/time constraints are not met | Verify chat membership, that the current user sent the message, and the seven-day window |
| `invalid_message_ids` contains an ID you expected to resolve | The message does not exist, is not visible to the current user, or does not support this query | Confirm the `om_` ID and the current user's access to that chat |

## References

- `lark_get_skill(domain="im")`

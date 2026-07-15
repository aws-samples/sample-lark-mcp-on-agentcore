# im +chat-list

List chats the current user (or bot) is a member of. **Not a search API — there is no `query` parameter; the call always returns the full member list, paginated.** For keyword-based lookup (e.g. find a group by name or by member), use `lark_get_skill(domain="im", section="chat-search")` instead.

**Defaults to groups only**; pass `types="p2p,group"` to also include p2p single chats (user identity only — see ["Bot identity and p2p"](#bot-identity-and-p2p)). Supports pagination, sort order, and (user identity only) muted-chat filtering.

This tool maps to: `lark_im_chat_list` (internally calls `GET /open-apis/im/v1/chats`).

## Commands

```
# List the user's chats (default sort: create_time, ascending)
lark_im_chat_list()

# Sort by recent activity (most recently active first)
lark_im_chat_list(sort="active_time")

# Limit page size
lark_im_chat_list(page_size="50")

# Pagination
lark_im_chat_list(page_token="xxx")

# Drop muted chats (user identity only)
lark_im_chat_list(exclude_muted=true)

# JSON output
lark_im_chat_list(format="json")

# Include p2p single chats (user identity only)
lark_im_chat_list(types="p2p,group")

# Only p2p single chats (user identity only)
lark_im_chat_list(types="p2p")
```

## Parameters

| Parameter | Required | Limits | Description |
|------|------|------|------|
| `user_id_type` | No | `open_id` (default), `union_id`, `user_id` | ID type used for `owner_id` in the response |
| `types` | No | `group`, `p2p` (comma-separated) | Chat types to include. Omitted = groups only (backward compatible). `p2p` requires user identity; under bot identity, `types="p2p"` alone is rejected and `types="p2p,group"` is silently downgraded to `group` |
| `sort` | No | `create_time` (default, ascending), `active_time` (descending) | Result ordering |
| `page_size` | No | 1-100, default 20 | Number of results per page |
| `page_token` | No | - | Pagination token from the previous response |
| `exclude_muted` | No | User identity only | Drop chats the current user has muted (do-not-disturb). Under bot identity, the flag is silently inactive; see "Filtering muted chats" below |
| `format` | No | - | Output as JSON |

> **Note:** Supports both user identity (default) and bot identity. When using bot identity, the app must have bot capability enabled.

## Output Fields

| Field | Description |
|------|------|
| `chat_id` | Chat ID (`oc_xxx` format) |
| `name` | Chat name |
| `description` | Chat description |
| `owner_id` | Owner ID (type controlled by `user_id_type`) |
| `external` | Whether the chat is external |
| `chat_status` | Chat status (`normal` / `dissolved` / `dissolved_save`) |
| `chat_mode` | Chat mode discriminator: `group` (regular) / `topic` (topic group) / `p2p` (single chat) |
| `p2p_target_type` | Peer type, e.g., `user` |
| `p2p_target_id` | Peer ID (type controlled by `user_id_type`) |

## Including p2p single chats

Default behavior lists groups only — same as before this feature. To include p2p, pass `types`:

| User intent | Call | Identity |
|---|---|---|
| "list my groups" / 我的群 / 我加入了哪些群 | (default, omit `types`) | user or bot |
| "list my p2p chats" / 我的单聊 / 我跟谁有 1v1 | `types="p2p"` | **user only** |
| "all my chats" / 全部聊天 / 所有会话 (ambiguous) | `types="p2p,group"` | **user only** |

For p2p rows in the response: `name` is the peer's display name, `owner_id` follows group semantics, `chat_mode = "p2p"`, and `p2p_target_type` / `p2p_target_id` identify the peer.

## Bot identity and p2p

`tenant_access_token` cannot list p2p chats — to protect user privacy, bot identity is not permitted to enumerate p2p single chats. Behavior under bot identity:

- bot identity + `types="p2p"` → rejected at validation time with an actionable error; no request is sent.
- bot identity + `types="p2p,group"` → `p2p` is stripped and `types=group` is sent. Request proceeds; only groups are returned. The strip is a **request-level adjustment**, surfaced via a structured notice so neither humans nor agents miss it:
    - **stdout JSON**: a top-level `notices` array gains a structured entry:
      ```json
      {
        "chats": [...],
        "notices": [
          { "code": "bot_strip_p2p", "message": "To protect user privacy, bot identity cannot list p2p chats; …" }
        ]
      }
      ```
    - The `filter` slot stays scoped to `exclude_muted`; `notices` is a separate top-level key, so the two never collide and no priority is needed when both fire.
- bot identity + `types="group"` → accepted, returns groups normally.
- bot identity (no `types`) → unchanged, returns groups.

To include p2p single chats, use user identity: `types="p2p,group"`. (The MCP server always calls with user identity, so p2p enumeration is available.)

## Filtering muted chats

`exclude_muted` (user identity only) drops chats the current user has set to do-not-disturb. After the list call, the tool batches the page's chat_ids through `POST /open-apis/im/v1/chat_user_setting/batch_get_mute_status` and filters client-side. Under bot identity, the mute API is UAT-only and the filter is silently skipped.

When the flag is set, the JSON envelope gains a `filter` sub-object (absent otherwise, so existing consumers are unaffected); `fetched_count == returned_count + filtered_count` always holds:

```json
{
  "chats": [...],
  "filter": {
    "applied": "exclude_muted",
    "fetched_count": 20,
    "returned_count": 17,
    "filtered_count": 3,
    "hint": "Filtered out 3 muted chat(s) on this page (17 remaining); use page_token to fetch more."
  }
}
```

## Usage Scenarios

### Scenario 1: List my recent chats

```
lark_im_chat_list(sort="active_time", page_size="10")
```

### Scenario 2: List my non-muted chats sorted by activity

```
lark_im_chat_list(sort="active_time", exclude_muted=true)
```

### Scenario 3: Iterate all my chats programmatically

Page through results with `page_size="100"`, passing the previous response's `page_token` on each call until `has_more` is `false`.

```
lark_im_chat_list(page_size="100", page_token="xxx")
```

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| `page_size must be an integer between 1 and 100` | page-size is out of range or not an integer | Use an integer between 1 and 100 |
| Permission denied (99991672) | The bot app does not have `im:chat:read` TAT permission enabled | Enable the permission for the app in the Open Platform console |
| Permission denied (99991679) with user identity | UAT is not authorized for `im:chat:read` | Ensure the scope is authorized |
| `Bot ability is not activated` (232025) | The app does not have bot capability enabled | Enable bot capability in the Open Platform console |
| `exclude_muted` returns all chats unfiltered and `hint` says "no effect under bot identity" | Running under bot identity (mute API is UAT-only) | Switch to user identity for mute filtering |
| `types=p2p (single chats) is only supported with user identity` | bot identity + `types="p2p"` (single-value only; mixed `types="p2p,group"` is downgraded to `group` and surfaces a `bot_strip_p2p` notice via `notices` — see "Bot identity and p2p") | Use user identity, or include `group` in `types` (the bot proceeds with `group` only and emits the `bot_strip_p2p` notice) |

> Full error message of the row above: `types=p2p (single chats) is only supported with user identity. To protect user privacy, bot identity cannot list p2p chats. Use user identity, or include "group" in types.`

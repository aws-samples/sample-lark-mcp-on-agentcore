# im +chat-members-list

List the members of a chat. Users and bots are returned in **separate buckets** — `users[]` and `bots[]` — with per-bucket totals (`user_total` / `bot_total`). Use `member_types` to return only one kind.

This tool maps to: `lark_im_chat_members_list` (internally calls `GET /open-apis/im/v1/chats/{chat_id}/members/list`).

## Commands

```
# Single page (default)
lark_im_chat_members_list(chat_id="oc_xxx")

# Only users, or only bots
lark_im_chat_members_list(chat_id="oc_xxx", member_types="user")
lark_im_chat_members_list(chat_id="oc_xxx", member_types="user,bot")

# Walk every page (capped by page_limit; 0 = unlimited)
lark_im_chat_members_list(chat_id="oc_xxx", page_all=true, page_limit="0")

# Resume from a specific cursor (single page; page_all is ignored)
lark_im_chat_members_list(chat_id="oc_xxx", page_token="xxx")

# JSON output
lark_im_chat_members_list(chat_id="oc_xxx", format="json")
```

## Parameters

| Parameter | Required | Limits | Description |
|------|------|------|------|
| `chat_id` | Yes | `oc_xxx` | Target chat |
| `member_types` | No | `user`, `bot` (comma-separated) | Member types to return. Omitted = all |
| `member_id_type` | No | `open_id` (default), `union_id`, `user_id` | ID type for `member_id` in the response |
| `page_size` | No | 1-100, default 20 | Results per page. With `page_all` and no explicit `page_size`, the max (100) is used automatically to minimize round-trips |
| `page_token` | No | - | Pagination cursor; **implies a single-page fetch** (disables auto-pagination) |
| `page_all` | No | - | Automatically walk every page (capped by `page_limit`) |
| `page_limit` | No | default 10, `0` = unlimited | Max pages to fetch with `page_all` |
| `page_delay` | No | default 200, `0` = no delay | Delay in ms between pages during `page_all` (throttle to avoid rate limits on large lists) |
| `format` | No | - | Output as JSON |

> Supports both user identity (default) and bot identity. The caller must be in the target chat, and must belong to the same tenant for internal chats.

## Output Fields

| Field | Description |
|------|------|
| `chat_id` | The queried chat ID |
| `users` | Array of user members (`member_id`, `name`, `tenant_key`, …) |
| `bots` | Array of bot members (`member_id`, `app_id`, `name`, …) |
| `user_total` / `bot_total` | Server-reported totals for each bucket |
| `truncations` | Non-empty when the server **capped a bucket** due to security config — see below |
| `has_more` / `page_token` | Paging signals from the final page fetched |

## Truncation: the result may be incomplete

The server applies a security cap to large member lists. When a bucket is capped, the response carries a `truncations[]` entry (e.g. `[{"limit": 100, "member_type": "user"}]`) **on the final page only**. The tool surfaces this two ways so it is never missed:

- **Warning output**: `⚠️  member list truncated by server security config: user bucket capped at 100 — the list is INCOMPLETE.`
- **JSON result**: the `truncations` array is preserved verbatim in the output.

A truncated result is *not* fixable by paging further — it is a server-side cap. Treat `users`/`bots` as a partial list whenever `truncations` is non-empty.

## Pagination notes

- Default fetches a single page. Pass `page_all=true` to drain every page.
- With `page_all` and no explicit `page_size`, the tool uses the maximum page size (100) so a full walk takes the fewest round-trips. An explicit `page_size` is always honored.
- `page_all` sleeps `page_delay` ms (default 200) between pages to avoid hammering the API when a tenant has no server-side member cap and the list spans many pages. Set `page_delay="0"` to disable.
- `page_all` stops at `page_limit` pages (default 10). When it stops early, `has_more` stays `true` so you know the result is incomplete; re-run with `page_limit="0"` for everything.
- `page_token` and `page_all` together: `page_token` wins (single-page fetch from the supplied cursor); a warning is emitted.
- Across pages, `users[]` and `bots[]` are concatenated; `truncations` / `has_more` / `page_token` come from the last page fetched.

## Common Errors and Troubleshooting

| Symptom | Root Cause |   | Solution |
|---------|---------|---|---------|
| `chat_id is required` | `chat_id` omitted |   | Provide the `oc_xxx` chat ID |
| `page_size must be an integer between 1 and 100` | out of range |   | Use 1-100 |
| `member_types contains invalid value` | value other than `user`/`bot` |   | Use `user`, `bot`, or both |
| Permission denied | missing `im:chat.members:read` |   | Ensure the scope is authorized |

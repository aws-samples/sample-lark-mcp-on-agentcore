# +feed-group-list-item

This tool maps to: `lark_im_feed_group_list_item`. List the feed cards inside one feed group (tag), enriched with a readable `chat_name`.

`lark_im_feed_group_list_item` is the only tool surface for the `feed.groups.list_item` read API. It resolves a human-readable `chat_name` for every feed card it returns: a v1 feed card's `feed_id` is always a chat ID (`oc_xxx`), so the tool issues a follow-up `POST /open-apis/im/v1/chats/batch_query` and injects `chat_name` into each entry of both `items[]` and `deleted_items[]`.

## Identity

User-only.

## Scopes

Because chat-name resolution always runs, this tool needs **two** user scopes unconditionally:

- `im:feed_group_v1:read` — to read the items
- `im:chat:read` — to resolve names

`chat_name` resolution always runs, so there is no single-scope, un-enriched path. For the other raw `feed.groups.*` methods, see `lark_get_skill(domain="im", section="feed-groups")`.

## Commands

```
# First page, enriched with chat names
lark_im_feed_group_list_item(feed_group_id="ofg_xxx")

# Auto-paginate through everything within a time window
lark_im_feed_group_list_item(feed_group_id="ofg_xxx", page_all=true, start_time="1767196800000", end_time="1767200000000")
```

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `feed_group_id` | Yes | Feed group ID (`ofg_xxx`); path parameter |
| `page_size` | No | Records per page, 1-50 (default 50) |
| `page_token` | No | Continuation token for a specific page |
| `page_all` | No | Auto-paginate and merge all pages |
| `page_limit` | No | Max pages when `page_all` is set, 1-1000 (default 20) |
| `start_time` | No | Update-time window start (Unix milliseconds as a decimal string) |
| `end_time` | No | Update-time window end (Unix milliseconds as a decimal string) |

When `page_token` is set explicitly, it wins over `page_all` (you get exactly that page).

## Output

JSON keeps the raw envelope and adds `chat_name` to each resolvable item:

```json
{
  "items": [
    { "feed_id": "oc_abc", "feed_type": "chat", "update_time": "1767196800000", "chat_name": "Release Team" }
  ],
  "deleted_items": [
    { "feed_id": "oc_def", "feed_type": "chat", "update_time": "1767196800000", "chat_name": "Old Channel" }
  ],
  "page_token": "",
  "has_more": false
}
```

A feed card whose chat cannot be resolved (soft-deleted or no permission) simply omits `chat_name` — the command still exits 0. p2p (direct) chats also omit `chat_name`: the server returns an empty `name` for them (the client UI shows the partner's display name instead); if a label is needed, fetch the chat via `chats/batch_query`, read `p2p_target_id`, and resolve it with a contact lookup.

## See also

- `lark_get_skill(domain="im", section="feed-groups")` — raw `feed.groups.*` APIs, enums, and rule guidance
- `lark_get_skill(domain="im", section="feed-group-list")` — list your feed groups
- `lark_get_skill(domain="im", section="feed-group-query-item")` — look up specific feed cards by ID

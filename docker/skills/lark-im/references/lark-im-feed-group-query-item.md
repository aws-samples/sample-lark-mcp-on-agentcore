# +feed-group-query-item

This tool maps to: `lark_im_feed_group_query_item`. Look up specific feed cards inside one feed group (tag) by ID, enriched with a readable `chat_name`.

`lark_im_feed_group_query_item` is the only tool surface for the `feed.groups.batch_query_item` read API. It resolves a human-readable `chat_name` for every feed card it returns: a v1 feed card's `feed_id` is always a chat ID (`oc_xxx`), so the tool issues a follow-up `POST /open-apis/im/v1/chats/batch_query` and injects `chat_name` into each entry of both `items[]` and `deleted_items[]`.

## Identity

User-only.

## Scopes

Because chat-name resolution always runs, this tool needs **two** user scopes unconditionally:

- `im:feed_group_v1:read` — to read the items
- `im:chat:read` — to resolve names

`chat_name` resolution always runs, so there is no single-scope, un-enriched path. For the other raw `feed.groups.*` methods, see `lark_get_skill(domain="im", section="feed-groups")`.

## Commands

```
lark_im_feed_group_query_item(feed_group_id="ofg_xxx", feed_id="oc_a,oc_b")
```

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `feed_group_id` | Yes | Feed group ID (`ofg_xxx`); path parameter |
| `feed_id` | Yes | Comma-separated chat IDs (`oc_xxx`); `feed_type` is fixed to `chat` |

## Output

The tool sends `{"items":[{"feed_id":"oc_a","feed_type":"chat"},{"feed_id":"oc_b","feed_type":"chat"}]}`, then enriches the response (`items[]` and `deleted_items[]`) with `chat_name` exactly as `lark_im_feed_group_list_item` does. There is no pagination for this method.

A feed card whose chat cannot be resolved (soft-deleted or no permission) simply omits `chat_name` — the command still exits 0. p2p (direct) chats also omit `chat_name`: the server returns an empty `name` for them (the client UI shows the partner's display name instead); if a label is needed, fetch the chat via `chats/batch_query`, read `p2p_target_id`, and resolve it with a contact lookup.

## See also

- `lark_get_skill(domain="im", section="feed-groups")` — raw `feed.groups.*` APIs, enums, and rule guidance
- `lark_get_skill(domain="im", section="feed-group-list")` — list your feed groups
- `lark_get_skill(domain="im", section="feed-group-list-item")` — list all feed cards in a group (paginated)

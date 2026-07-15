# im +flag-list

This tool maps to: `lark_im_flag_list`. Underlying API: `GET /open-apis/im/v1/flags`.

## Sorting Rules (Important)

The API returns data sorted by `update_time` in **ascending order**, meaning **oldest first, newest last**. When `has_more=true`, you cannot simply take the first page's items as the latest flags — you must paginate through all pages and take the last item on the last page as the newest.

Recommended: use `page_all=true` for auto-pagination to get the complete list.

## Commands

```
# Fetch first page (default page_size=50)
lark_im_flag_list()

# Manual pagination with custom page size
lark_im_flag_list(page_size="30", page_token="<page_token>")

# Auto-paginate to get all flags (recommended)
lark_im_flag_list(page_all=true)

# Disable auto-enrichment of message content (enabled by default)
lark_im_flag_list(page_all=true, enrich_feed_thread="false")

# Limit max pages (default 20, max 1000)
lark_im_flag_list(page_all=true, page_limit="10")
```

## Parameters

| Parameter | Default | Description |
|------|------|------|
| `page_size` | 50 | Range 1-50 (server max is 50) |
| `page_token` | empty | Pagination token from previous page; empty string must still be provided |
| `page_all` | false | Auto-paginate to fetch all pages and merge results |
| `page_limit` | 20 | Max pages in `page_all` mode (max 1000) |
| `enrich_feed_thread` | true | Auto-enrich feed-layer thread entries with message content (calls `im.messages.mget`) |

> Currently only supports user identity.

## Response Structure

The response has `data` as the main body, with fields described below:

| Field | Type | Description |
|------|------|------|
| `flag_items` | array | List of currently existing (not canceled) flags, sorted by `update_time` ascending |
| `delete_flag_items` | array | List of previously canceled flags, sorted by `update_time` ascending |
| `messages` | array | Message content inlined by the server for `(default, message)` type flags |
| `has_more` | boolean | Whether there's a next page |
| `page_token` | string | Pagination token for the next page |

Note: `(thread, feed)` / `(msg_thread, feed)` entries are automatically enriched via `mget` by the tool, and written to the corresponding entry's `message` field.

## Limitations

- **delete_flag_items are not enriched**: Message content is only fetched for active flags (`flag_items`), not canceled flags (`delete_flag_items`). If you need message content for a canceled flag, query the message separately using `lark_im_messages_mget(message_ids="<item_id>")`.

## Response Example (Sanitized)

```json
{
  "data": {
    "delete_flag_items": [
      {
        "create_time": "xxx",
        "flag_type": "xxx",
        "item_id": "xxx",
        "item_type": "xxx",
        "update_time": "xxx"
      }
    ],
    "flag_items": [
      {
        "create_time": "xxx",
        "flag_type": "xxx",
        "item_id": "xxx",
        "item_type": "xxx",
        "update_time": "xxx"
      }
    ],
    "has_more": false,
    "messages": [],
    "page_token": "xxx"
  }
}
```

## Permissions

- Base scope: `im:feed.flag:read`
- Additional scopes only when `enrich_feed_thread=true` needs to fetch missing message content: `im:message.group_msg:get_as_user`, `im:message.p2p_msg:get_as_user`

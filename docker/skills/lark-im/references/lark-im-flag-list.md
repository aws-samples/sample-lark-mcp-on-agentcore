# im +flag-list

This tool maps to: `lark_im_flag_list`. Underlying API: `GET /open-apis/im/v1/flags`.

## Sorting Rules (Important)

The API returns data sorted by `update_time` in **ascending order**, meaning **oldest first, newest last**. When `has_more=true`, continue pagination until `has_more=false`; only then is the last item in the merged result authoritative as the newest flag. If pagination stops while `has_more=true`, the last item is only the newest observed flag.

`page_all=true` enables automatic pagination but is still capped by `page_limit`. The default cap is 20 pages; **20 is not the hard maximum**. Set `page_limit` between 1 and 1000 when a larger scan is required. A response with `has_more=true` is incomplete, even when `flag_items` is empty; increase the limit or resume from the returned `page_token` before reporting an authoritative latest item or count.

## Commands

```
# Fetch first page (default page_size=50)
lark_im_flag_list()

# Manual pagination with custom page size
lark_im_flag_list(page_size="30", page_token="<page_token>")

# Auto-paginate, capped at the default 20 pages
lark_im_flag_list(page_all=true)

# Disable auto-enrichment of message content (enabled by default)
lark_im_flag_list(page_all=true, enrich_feed_thread="false")

# Use the largest supported page limit for a broader scan
lark_im_flag_list(page_all=true, page_limit="1000")
```

## Parameters

| Parameter | Default | Description |
|------|------|------|
| `page_size` | 50 | Range 1-50 (server max is 50) |
| `page_token` | empty | Pagination token from previous page; empty string must still be provided |
| `page_all` | false | Auto-paginate and merge results, capped by `page_limit` |
| `page_limit` | 20 | Max pages in `page_all` mode; configurable range 1-1000 (20 is only the default) |
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

- **Auto-pagination is bounded**: `page_all=true` fetches at most 20 pages by default. If the response still has `has_more=true`, the result is incomplete; increase `page_limit` up to 1000 or resume with `page_token`. Never interpret `flag_items: []` as an authoritative zero while more pages remain. Historical `delete_flag_items` may occupy early pages and push active flags to later pages.
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

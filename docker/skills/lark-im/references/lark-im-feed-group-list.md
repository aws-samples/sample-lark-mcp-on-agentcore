# +feed-group-list

This tool maps to: `lark_im_feed_group_list`. List the caller's feed groups (tags) with auto-pagination that correctly merges both the live and soft-deleted lists.

`lark_im_feed_group_list` is the only tool surface for listing feed groups. The list response carries two parallel arrays — `groups` (live) and `deleted_groups` (soft-deleted). The tool paginates this dual-list response correctly: its `page_all` merges **both** arrays across pages (a naive single-array pager would silently drop one list's later pages). It adds no enrichment.

## Identity

User-only.

## Scopes

- `im:feed_group_v1:read`

## Commands

```
# First page
lark_im_feed_group_list()

# Auto-paginate through all your feed groups (both live and deleted)
lark_im_feed_group_list(page_all=true)

# Within an update-time window
lark_im_feed_group_list(page_all=true, start_time="1767196800000", end_time="1767200000000")
```

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `page_size` | No | Records per page, 1-50 (default 50). Caps the combined `groups` + `deleted_groups` count, so a page may hold fewer live groups than the size suggests |
| `page_token` | No | Continuation token for a specific page |
| `page_all` | No | Auto-paginate and merge all pages (both lists) |
| `page_limit` | No | Max pages when `page_all` is set, 1-1000 (default 20) |
| `start_time` | No | Update-time window start (Unix milliseconds as a decimal string) |
| `end_time` | No | Update-time window end (Unix milliseconds as a decimal string) |

When `page_token` is set explicitly, it wins over `page_all` (you get exactly that page).

## Output

JSON keeps the raw envelope; with `page_all` both lists are returned fully merged:

```json
{
  "groups": [
    { "group_id": "ofg_xxx", "type": "normal", "name": "Releases", "rules": { "rules": [] } }
  ],
  "deleted_groups": [
    { "group_id": "ofg_yyy", "type": "rule", "name": "Old", "rules": { "rules": [] } }
  ],
  "page_token": "",
  "has_more": false
}
```

> `page_size` counts live and deleted groups together, and the per-page count can be smaller still when entries are filtered — so never infer completeness from counts. Pagination is governed solely by `has_more`.

## See also

- `lark_get_skill(domain="im", section="feed-groups")` — raw `feed.groups.*` APIs, enums, and rule guidance
- `lark_get_skill(domain="im", section="feed-group-list-item")` — list the feed cards inside one group
- `lark_get_skill(domain="im", section="feed-group-query-item")` — look up specific feed cards by ID

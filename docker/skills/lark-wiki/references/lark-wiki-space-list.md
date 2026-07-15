# lark-wiki +space-list

List wiki spaces accessible to the caller. **Default fetches a single page** (matches the rest of the list tools); pass `page_all=true` to walk every page.

## Usage

```
# Default: single page (first up to page_size items)
lark_wiki_space_list()

# Walk every page (capped by page_limit, default 10)
lark_wiki_space_list(page_all=true)

# Walk every page, no cap (use with care if you have many spaces)
lark_wiki_space_list(page_all=true, page_limit="0")

# Resume from a specific cursor (single-page fetch regardless of page_all)
lark_wiki_space_list(page_token="<TOKEN>")

# Pretty / table / csv / ndjson output
lark_wiki_space_list(format="pretty")
lark_wiki_space_list(format="table")
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page_size` | int | 50 | Page size, 1-50 |
| `page_token` | string | — | Page cursor; implies single-page fetch (no auto-pagination) |
| `page_all` | bool | `false` | Automatically paginate through all pages (capped by `page_limit`) |
| `page_limit` | int | 10 | Max pages with `page_all` (0 = unlimited) |
| `format` | enum | `json` | `json` / `pretty` / `table` / `csv` / `ndjson` |

## Output

```json
{
  "ok": true,
  "data": {
    "spaces": [
      {
        "space_id": "6946843325487912356",
        "name": "Engineering Wiki",
        "description": "...",
        "space_type": "team",
        "visibility": "private",
        "open_sharing": "closed"
      }
    ],
    "has_more": false,
    "page_token": ""
  },
  "meta": { "count": 1 }
}
```

When the default single-page fetch (or `page_all` capped by `page_limit`) does not exhaust the upstream cursor, `has_more=true` and `page_token=<cursor>` so the caller can resume via `page_token` or by increasing `page_limit`.

## Notes

- **The underlying API never returns the my_library personal library**; resolve it via `lark_invoke(tool_name="lark_wiki_spaces_get", args={params: {"space_id": "my_library"}})`.
- Use `space_id` from the output as `space_id` for `lark_wiki_node_list` or `lark_wiki_node_copy`.

## Required Scope

`wiki:space:retrieve`

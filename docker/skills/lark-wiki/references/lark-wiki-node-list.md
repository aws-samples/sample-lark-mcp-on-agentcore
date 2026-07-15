# lark-wiki +node-list

List wiki nodes in a space or under a specific parent node. **Default fetches a single page** (large knowledge bases can have thousands of nodes — opt into `page_all=true` explicitly with an eye on `page_limit`).

## Usage

```
# Default: single page of root nodes
lark_wiki_node_list(space_id="<SPACE_ID>")

# Drill into a sub-directory (still single page by default)
lark_wiki_node_list(space_id="<SPACE_ID>", parent_node_token="<NODE_TOKEN>")

# Drill with a wiki URL (normalizes /wiki/<token> to node_token)
lark_wiki_node_list(space_id="<SPACE_ID>", parent_node_token="https://feishu.cn/wiki/wikcn_xxx")

# Personal document library
lark_wiki_node_list(space_id="my_library")

# Walk every page (capped by page_limit, default 10)
lark_wiki_node_list(space_id="<SPACE_ID>", page_all=true)

# Walk every page with a higher cap
lark_wiki_node_list(space_id="<SPACE_ID>", page_all=true, page_limit="30")

# Resume from a cursor
lark_wiki_node_list(space_id="<SPACE_ID>", page_token="<TOKEN>")

# Pretty / table output
lark_wiki_node_list(space_id="<SPACE_ID>", format="pretty")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `space_id` | string | **Yes** | — | Numeric wiki space ID. Use `my_library` for personal document library |
| `parent_node_token` | string | No | — | Parent wiki node token, or a `/wiki/<token>` URL; omit to list the space root |
| `page_size` | int | No | 50 | Page size, 1-50 |
| `page_token` | string | No | — | Page cursor; implies single-page fetch (no auto-pagination) |
| `page_all` | bool | No | `false` | Automatically paginate through all pages (capped by `page_limit`) |
| `page_limit` | int | No | 10 | Max pages with `page_all` (0 = unlimited) |
| `format` | enum | No | `json` | `json` / `pretty` / `table` / `csv` / `ndjson` |

## Output

```json
{
  "ok": true,
  "data": {
    "nodes": [
      {
        "space_id": "6946843325487912356",
        "node_token": "wikcn_EXAMPLE_TOKEN",
        "obj_token": "doccn_EXAMPLE_TOKEN",
        "obj_type": "docx",
        "parent_node_token": "",
        "node_type": "origin",
        "title": "Getting Started",
        "has_child": true
      }
    ],
    "has_more": false,
    "page_token": ""
  },
  "meta": { "count": 1 }
}
```

When the default single-page fetch (or `page_all` capped by `page_limit`) does not exhaust the upstream cursor, `has_more=true` and `page_token=<cursor>` so the caller can resume via `page_token` or by increasing `page_limit`.

## Traverse the wiki tree

To list all content recursively, call `lark_wiki_node_list` again with each node's `node_token` as `parent_node_token` when `has_child` is `true`.

```
# Step 1: list root nodes
lark_wiki_node_list(space_id="6946843325487912356")

# Step 2: drill into a node that has children
lark_wiki_node_list(space_id="6946843325487912356", parent_node_token="wikcn_EXAMPLE_TOKEN")
```

## Notes

- `space_id="my_library"` is a per-user alias. The MCP server always runs with user identity so this works by default.
- `space_id` is a numeric wiki `space_id`. Do not pass a wiki URL, wiki node token, document token, or title. Use `lark_wiki_space_list` to discover it.
- `parent_node_token` must resolve to a wiki node token. If you have a docx/sheet/base/file URL, first call `lark_wiki_node_get(node_token="<url>")` and use the returned `node_token`.
- Treat `invalid_parameters` (`space_id is not int`, `invalid page_token`), `not_found` (`node not found by parent node token`), and `permission_denied` as terminal for the current arguments. Fix the argument or permission before retrying.
- For `rate_limit`, stop immediate retries and retry later with exponential backoff or a smaller `page_limit`.

## Required Scope

`wiki:node:retrieve`

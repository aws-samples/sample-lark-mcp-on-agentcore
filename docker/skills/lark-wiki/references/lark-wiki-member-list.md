# lark-wiki +member-list

List the members of a wiki space. OpenAPI: `GET /open-apis/wiki/v2/spaces/:space_id/members`. **Default fetches a single page** (matches `lark_wiki_space_list` / `lark_wiki_node_list`); pass `page_all=true` to walk every page.

## Usage

```
# Default: single page
lark_wiki_member_list(space_id="<space_id>")

# Walk every page (capped by page_limit, default 10)
lark_wiki_member_list(space_id="<space_id>", page_all=true)

# Walk every page, no cap
lark_wiki_member_list(space_id="<space_id>", page_all=true, page_limit="0")

# Resume from a specific cursor (single-page fetch regardless of page_all)
lark_wiki_member_list(space_id="<space_id>", page_token="<TOKEN>")

# Personal library
lark_wiki_member_list(space_id="my_library")

# Pretty / table / csv / ndjson output
lark_wiki_member_list(space_id="<space_id>", format="pretty")
lark_wiki_member_list(space_id="<space_id>", format="table")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `space_id` | string | **Yes** | — | Wiki space ID; use `my_library` for the personal document library |
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
    "space_id": "7160145948494381236",
    "members": [
      {
        "member_id": "ou_449b53ad6aee526f7ed311b216aabcef",
        "member_type": "openid",
        "member_role": "admin"
      },
      {
        "member_id": "ou_67e5ecb64ce1c0bd94612c17999db411",
        "member_type": "openid",
        "member_role": "member"
      }
    ],
    "has_more": false,
    "page_token": ""
  },
  "meta": { "count": 2 }
}
```

`type` (`user` / `chat` / `department`) is included when the server returns it. When the default single-page fetch (or `page_all` capped by `page_limit`) does not exhaust the upstream cursor, `has_more=true` and `page_token=<cursor>` so the caller can resume.

## Notes

- **Bot + `my_library` is rejected upfront** — ⚠️ Bot identity operations are not available via the MCP server.
- Use `member_id` from the output as `member_id` for `lark_wiki_member_remove`; `member_type` and `member_role` must be passed exactly as listed to remove a grant.

## Required Scope

`wiki:member:retrieve`

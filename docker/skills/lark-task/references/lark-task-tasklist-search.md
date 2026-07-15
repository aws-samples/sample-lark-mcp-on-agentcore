# task +tasklist-search

> **⚠️ Note:** This tool uses tasklist search followed by tasklist detail queries to render the final output.

Search tasklists by keyword and optional filters.

## Recommended Usage

```
# Search by keyword
lark_task_tasklist_search(query="测试")

# Search tasklists created by specific users
lark_task_tasklist_search(creator="ou_xxx,ou_yyy")

# Search by creation time range
lark_task_tasklist_search(query="Q2", create_time="-30d,+0d")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | No | Search keyword. If omitted, at least one filter must be provided. |
| `creator` | No | Creator open_ids, comma-separated. |
| `create_time` | No | Creation time range in `start,end` form. Each side supports ISO/date/relative/ms input. |
| `page_token` | No | Page token for pagination. |
| `page_all` | No | Automatically paginate through all pages (max 40). |
| `page_limit` | No | Max page limit (default 20). |

## Workflow

1. Build the search keyword and filters from the user's request.
2. Execute `lark_task_tasklist_search(...)`
3. Report the matched tasklists and the next `page_token` if more results exist.

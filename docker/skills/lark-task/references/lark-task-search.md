# task +search

> **⚠️ Note:** This tool must be called with user identity. It is not available with bot identity.

Search tasks by keyword and optional filters.

## Recommended Usage

```
# Search by keyword
lark_task_search(query="test")

# Search incomplete tasks assigned to specific users
lark_task_search(assignee="ou_xxx,ou_yyy", completed="false")

# Search by due time range
lark_task_search(query="release", due="-1d,+7d")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | No | Search keyword. If omitted, at least one filter must be provided. |
| `creator` | No | Creator open_ids, comma-separated. |
| `assignee` | No | Assignee open_ids, comma-separated. |
| `follower` | No | Follower open_ids, comma-separated. |
| `completed` | No | Filter by completion state. |
| `due` | No | Due time range in `start,end` form. Each side supports ISO/date/relative/ms input. |
| `page_token` | No | Page token for pagination. |
| `page_all` | No | Automatically paginate through all pages (max 40). |
| `page_limit` | No | Max page limit (default 20). |

## Workflow

1. Build the keyword and filters from the user's request.
2. Execute `lark_task_search(...)`
3. Report the matched tasks and include the next `page_token` if more results exist.

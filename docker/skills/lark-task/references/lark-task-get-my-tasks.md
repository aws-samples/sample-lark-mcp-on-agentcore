# task +get-my-tasks

If the user query only specifies a task name (e.g., "Complete task Lobster No. 1"), use this tool to list and search for the task by its summary.

> **⚠️ Note:** This tool must be called with user identity. It is not available with bot identity.
>
> **Output rendering note:**
> 1. If you need to present user fields (assignee, creator, etc.), do not only output the raw `id` (e.g. open_id). Also try to resolve and display the user's real name (e.g. via the contact skill) for readability.
> 2. When rendering timestamps (e.g. created time, due time), use the local timezone. Format is 2006-01-02 15:04:05

List tasks assigned to the current user, with support for filtering by completion status, creation time, and due date.
By default, the tool will automatically paginate up to 20 times. Use `page_all=true` to fetch more (up to 40 pages).

> **Pending vs all tasks:** When `complete` is not provided, the result contains **both completed and incomplete tasks**.
> For standup / daily-summary / pending-todo scenarios, you **must** pass `complete="false"`; otherwise completed tasks will be surfaced as if they were still pending.

## Recommended Usage

```
# Search for a specific task by name
lark_task_get_my_tasks(query="Lobster No. 1")

# Get all my tasks, both completed and incomplete (fetches up to 20 pages by default)
lark_task_get_my_tasks()

# Pending-only: my incomplete tasks (use this for standup/daily-summary)
lark_task_get_my_tasks(complete="false")

# Pending-only with a due-date upper bound (e.g. end of today / this week)
lark_task_get_my_tasks(complete="false", due_end="2026-03-27T23:59:59+08:00")

# Fetch all my tasks (up to 40 pages)
lark_task_get_my_tasks(page_all=true)

# Fetch up to 10 pages
lark_task_get_my_tasks(page_limit="10")

# Resume from a known page token
lark_task_get_my_tasks(page_token="pt_xxx")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | No | Search for tasks by summary. Returns exact matches if any; otherwise returns partial matches. |
| `complete` | No | Optional. If not provided, it fetches all tasks (both incomplete and completed). Set to `"true"` to fetch only completed tasks, or `"false"` for incomplete tasks. |
| `created_at` | No | Query tasks created after this time. Supports date: `YYYY-MM-DD`, relative: `-2d`, or ms timestamp. |
| `due_start` | No | Query tasks with a due date after this time. Supports date: `YYYY-MM-DD`, relative: `-2d`, or ms timestamp. |
| `due_end` | No | Query tasks with a due date before this time. Supports date: `YYYY-MM-DD`, relative: `-2d`, or ms timestamp. |
| `page_all` | No | Automatically paginate through all pages (max 40). |
| `page_limit` | No | Max page limit (default 20). |
| `page_token` | No | Start from the specified page token (useful for resuming a previous query). |

## Workflow

1. Determine the filters based on the user's request.
2. Execute the tool call. The tool will automatically loop up to the specified limit (default 20, or 40 with `page_all=true`) to fetch records.
3. Show the results (ID, summary, due time, and created date).

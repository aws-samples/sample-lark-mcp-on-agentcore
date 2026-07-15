# task +create

Create a new task in Lark.

## Recommended Usage

```
# Create a task with all details
lark_task_create(summary="Quarterly Sales Review", description="Review the sales performance for the last quarter.", assignee="ou_xxx", due="2026-03-25", tasklist_id="https://applink.larkoffice.com/client/todo/task_list?guid=a4b00000-000-000-000-00000000036c")

# Create a task assigned to an app
lark_task_create(summary="Nightly Sync", assignee="cli_xxx")

# Create a simple task
lark_task_create(summary="Buy milk")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `summary` | Yes | The title or summary of the task |
| `description` | No | Detailed description of the task |
| `assignee` | No | Assignee ID. Use user `open_id` like `ou_xxx` for people, or app ID like `cli_xxx` for apps. |
| `follower` | No | Follower ID. Use user `open_id` like `ou_xxx` for people, or app ID like `cli_xxx` for apps. |
| `due` | No | Due date. Supports ISO 8601, `YYYY-MM-DD`, relative time (e.g., `+2d`), or ms timestamp. `YYYY-MM-DD` and relative time will automatically set it as an all-day task. |
| `tasklist_id` | No | The GUID of the tasklist, or a full AppLink URL (the tool will automatically extract the `guid` parameter from the URL). |
| `idempotency_key` | No | Client token to ensure idempotency of the request. |

## Workflow

1. Confirm with the user: task summary, due date, assignee, and tasklist if necessary.
   - **Crucial Rule for Assignee**: If the user explicitly or implicitly says "create a task for me" (给我创建一个任务), or "help me create a task" (帮我新建/创建一个任务), you MUST assign the task to the current logged-in user. You can get the current user's `open_id` by calling the contact skill to resolve the current user's identity, and then passing it to the `assignee` parameter.
2. Execute `lark_task_create(summary="...", ...)`
3. Judge success by `ok == true` in the response JSON (the success envelope has no `code` field — do not test `code == 0`), then report the result: task ID (`data.guid`) and summary.

Example success response:

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "guid": "e297d3d0-4b60-4a5f-a4d4-xxxxxxxxxxxx",
    "url": "https://applink.larkoffice.com/client/todo/detail?guid=e297d3d0-4b60-4a5f-a4d4-xxxxxxxxxxxx"
  }
}
```

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

## References

- `lark_get_skill(domain="task")` -- All task commands

# task +complete

Mark a task as completed.

## Recommended Usage

```
# Complete a task
lark_task_complete(task_id="<task_guid>")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task_id` | Yes | The task GUID to complete. For Feishu task applinks, use the `guid` query parameter, not the `suite_entity_num` / display task ID like `t104121`. |

## Workflow

1. Confirm the task to complete.
2. Execute the tool call.
3. Report success.

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

# task +reopen

Reopen a previously completed task.

## Recommended Usage

```
# Reopen a task
lark_task_reopen(task_id="<task_guid>")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task_id` | Yes | The task GUID to reopen. For Feishu task applinks, use the `guid` query parameter, not the `suite_entity_num` / display task ID like `t104121`. |

## Workflow

1. Confirm the task to reopen.
2. Execute the tool call.
3. Report success.

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

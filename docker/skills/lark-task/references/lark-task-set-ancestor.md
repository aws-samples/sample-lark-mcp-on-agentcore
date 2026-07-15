# task +set-ancestor

Set a parent task for a task, or clear the parent to make it independent.

## Recommended Usage

```
# Set a parent task
lark_task_set_ancestor(task_id="guid_1", ancestor_id="guid_2")

# Clear the parent task
lark_task_set_ancestor(task_id="guid_1")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task_id` | Yes | The task GUID to update. |
| `ancestor_id` | No | The parent task GUID. Omit it to clear the ancestor. |

## Workflow

1. Confirm the child task and, if applicable, the ancestor task.
2. Execute `lark_task_set_ancestor(...)`
3. Report the updated task GUID and whether the ancestor was set or cleared.

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

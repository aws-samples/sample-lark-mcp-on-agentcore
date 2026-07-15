# task +tasklist-create

Create a new tasklist, and optionally batch create tasks within it.

## Recommended Usage

```
# Create an empty tasklist
lark_task_tasklist_create(name="Q1 Goals")

# Create a tasklist and add members
lark_task_tasklist_create(name="Project A", member="ou_xxx,ou_yyy")

# Create a tasklist and batch create tasks within it
lark_task_tasklist_create(name="Launch Checklist", data="[{\"summary\": \"Code Review\", \"assignee\": \"ou_aaa\"}, {\"summary\": \"Deploy\", \"assignee\": \"ou_bbb\"}]")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | The name of the tasklist. |
| `member` | No | Comma-separated list of user `open_id`s to add as editors. |
| `data` | No | JSON array of task definitions to create and add to the tasklist automatically. |

## Workflow

1. Confirm the tasklist name, members, and tasks (if any).
2. Execute `lark_task_tasklist_create(...)`.
3. Report success, including the new tasklist ID and the result of the batch task creation.

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

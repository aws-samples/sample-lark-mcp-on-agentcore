# task +update

Update an existing task in Lark.

## Recommended Usage

```
# Update task summary
lark_task_update(task_id="<task_guid>", summary="New Summary")

# Update multiple tasks' due dates
lark_task_update(task_id="<task_guid>,<another_task_guid>", due="+2d")

# A task applink is accepted directly; the tool extracts its guid query value
lark_task_update(task_id="https://applink.larksuite.com/client/todo/task?guid=<task_guid>", summary="New Summary")

# Update with JSON data
lark_task_update(task_id="<task_guid>", data="{\"description\": \"New description\"}")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task_id` | Yes | Task OpenAPI GUID or a task applink containing `guid=`. Comma-separated GUIDs/applinks are supported for multiple tasks. Display task IDs such as `t104121` / `suite_entity_num` are rejected. |
| `summary` | No | New summary/title for the task. |
| `description` | No | New description for the task. |
| `due` | No | New due date (supports relative time). |
| `data` | No | JSON payload for fields to update. |

## Workflow

1. Confirm with the user the tasks to update and the fields.
2. Execute `lark_task_update(task_id="...", ...)`
3. Read `data.updated_fields` and `data.tasks[].confirmed` from the result and report only the fields confirmed by the server.
4. Do not routinely query task details after the update when `confirmed` already contains the required state. Query details only if a required field is absent or the user explicitly asks for a full verification.

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

# task +tasklist-task-add

Add existing tasks to a tasklist.

## Recommended Usage

```
# Add a single task to a tasklist
lark_task_tasklist_task_add(tasklist_id="<tasklist_guid>", task_id="<task_guid>")

# Add multiple tasks to a tasklist
lark_task_tasklist_task_add(tasklist_id="<tasklist_guid>", task_id="<task_guid>,<another_task_guid>,<third_task_guid>")

# Add a task to a specific section in the tasklist
lark_task_tasklist_task_add(tasklist_id="<tasklist_guid>", task_id="<task_guid>", section_guid="<section_guid>")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `tasklist_id` | Yes | The GUID of the tasklist, or a full AppLink URL. |
| `task_id` | Yes | Comma-separated list of task GUIDs to add to the tasklist. For Feishu task applinks, use each task's `guid` query parameter, not the `suite_entity_num` / display task ID like `t104121`. |
| `section_guid` | No | The GUID of the custom section to add the tasks to. If omitted, tasks will be added to the default section. |

## Workflow

1. Confirm the tasklist and the tasks to add.
2. Execute `lark_task_tasklist_task_add(...)`.
3. Report the result (successful vs failed tasks).

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

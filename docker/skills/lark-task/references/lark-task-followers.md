# task +followers

Manage task followers. Add or remove followers from an existing task.

## Recommended Usage

```
# Add a follower
lark_task_followers(task_id="<task_guid>", add="ou_aaa")

# Add an app follower
lark_task_followers(task_id="<task_guid>", add="cli_xxx")

# Remove a follower
lark_task_followers(task_id="<task_guid>", remove="ou_aaa")
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task_id` | Yes | The task GUID to modify. For Feishu task applinks, use the `guid` query parameter, not the `suite_entity_num` / display task ID like `t104121`. |
| `add` | No | Comma-separated follower IDs. Use user `open_id`s like `ou_xxx` for people, or app IDs like `cli_xxx` for apps. |
| `remove` | No | Comma-separated follower IDs. Use user `open_id`s like `ou_xxx` for people, or app IDs like `cli_xxx` for apps. |

## Workflow

1. Confirm the task and followers to add/remove.
2. Execute the tool call.
3. Report success.

> [!CAUTION]
> This is a **Write Operation** -- You must confirm the user's intent before executing.

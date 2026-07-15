# im +chat-update

Update a group's name or description. Supports both **TAT (bot)** and **UAT (user)** identity.

This tool maps to: `lark_im_chat_update` (internally calls `PUT /open-apis/im/v1/chats/:chat_id`).

## Commands

```
# Update the group name
lark_im_chat_update(chat_id="oc_xxx", name="New Group Name")

# Update the group description
lark_im_chat_update(chat_id="oc_xxx", description="Updated group description")

# Update multiple fields at once
lark_im_chat_update(chat_id="oc_xxx", name="Q2 Project Team", description="Owns Q2 goal tracking")
```

## Parameters

### Required

| Parameter | Description |
|------|------|
| `chat_id` | Group ID (`oc_xxx`) |

### Optional Fields

| Parameter | Limits | Description |
|------|------|------|
| `name` | Max 60 characters | Group name |
| `description` | Max 100 characters | Group description |

### Global Parameters

| Parameter | Description |
|------|------|
| `format` | Output as JSON (default) |

## Usage Scenarios

### Scenario 1: Rename a group and update its description

```
lark_im_chat_update(chat_id="oc_xxx", name="Q2 Project Team", description="Owns Q2 goal tracking")
```

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| `invalid chat_id: expected chat ID (oc_xxx)` | Invalid chat_id format | Use a valid `oc_xxx` chat ID |
| `name exceeds the maximum of 60 characters` | Group name too long | Shorten the name to 60 characters or fewer |
| `description exceeds the maximum of 100 characters` | Group description too long | Shorten the description to 100 characters or fewer |
| `at least one field must be specified to update` | No update field was provided | Specify at least one field to update |
| Permission denied (99991679) | Missing `im:chat:update` permission | Ensure the scope is authorized |
| Non-owner/admin cannot update (232016/232002/232017) | Current identity is not the owner/admin | Try switching identity |
| Not in the group (232011) | The current user is not a member of the group | Use a member identity or join the group first |

## AI Usage Guidance

### Identity Selection

`lark_im_chat_update` supports both user and bot identity.

Infer the group owner from context whenever possible (for example, if a bot just created the group, the owner is the bot) and use the matching identity directly. If ownership is unclear, query the group first and confirm `owner_id`.

Identity choice should follow Group Chat Identity Rules (`lark_get_skill(domain="im", section="chat-identity")`): if the user explicitly specifies an identity, use it directly; otherwise infer the owner identity from context.

## References

- [lark-im](../SKILL.md) - all IM commands

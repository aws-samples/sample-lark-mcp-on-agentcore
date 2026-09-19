# im +chat-create

Create a group chat. Under this server the caller is always the authorized **user**. You can specify the group name, description, members (users/bots), owner, chat type (private/public), and group mode. Set `chat_mode="topic"` to create a topic chat.

This tool maps to: `lark_im_chat_create` (internally calls `POST /open-apis/im/v1/chats`).

- This shortcut needs the `im:chat:create_by_user` scope, which is grantable here.
- ⚠️ The bot-identity path needs `im:chat:create`, a bot-exclusive scope this deployment cannot grant. Do not report it as the missing scope on a permission error — `im:chat:create_by_user` is the operative one.

## Commands

```
# Create a private group (default)
lark_im_chat_create(name="My Group")

# Create a public group (name is required and must be at least 2 characters)
lark_im_chat_create(name="Public Group", type="public")

# Create a topic chat
lark_im_chat_create(name="Topic Group", chat_mode="topic")

# Specify the group owner
lark_im_chat_create(name="My Group", owner="ou_xxx")

# Invite user members (comma-separated open_ids, up to 50)
lark_im_chat_create(name="My Group", users="ou_aaa,ou_bbb")

# Invite bot members (comma-separated app IDs, up to 5)
lark_im_chat_create(name="My Group", bots="cli_aaa,cli_bbb")

# Invite both users and bots
lark_im_chat_create(name="My Group", users="ou_aaa", bots="cli_aaa")

# JSON output
lark_im_chat_create(name="My Group", format="json")
```

## Parameters

| Parameter | Required | Limits | Description |
|------|------|------|------|
| `name` | Required for public groups | Max 60 characters; at least 2 characters for public groups | Group name (`"(no subject)"` for private groups if omitted) |
| `description` | No | Max 100 characters | Group description |
| `users` | No | Up to 50, format `ou_xxx` | Comma-separated user open_ids |
| `bots` | No | Up to 5, format `cli_xxx` | Comma-separated bot app IDs |
| `owner` | No | Format `ou_xxx` | Owner open_id (defaults to the bot when using bot identity, or the authorized user when using user identity) |
| `type` | No | `private` (default) or `public` | Group type. Default to `private`; pass `public` only when the user explicitly asks for a discoverable/public group. |
| `chat_mode` | No | `group` (default) or `topic` | Group mode; `topic` creates a topic chat (not the same as `group_message_type=thread`). When the user asks for a topic chat, pass `topic` explicitly — do not rely on the default. |
| `set_bot_manager` | No | - | Set the creating bot as a group manager. ⚠️ Only effective under bot identity — passing it here is accepted and silently does nothing, so do not use it |
| `format` | No | - | Output as JSON |

> **`chat_mode="topic"` vs "normal group with topic-message mode"**: `chat_mode="topic"` here creates a 话题群 — the entire group is a topic chat. This is different from "normal group (`chat_mode=group`) + topic-message mode (`group_message_type=thread`)". This tool exposes only `chat_mode`; `group_message_type` is intentionally not surfaced.

## AI Usage Guidance

This server always acts as the authorized **user**, so the one-step flow below is the operative guidance.

```
lark_im_chat_create(name="<group name>", users="ou_aaa,ou_bbb")
```

The authorized user is automatically the group creator and member. User identity has no bot-visibility limitation, so members can be invited in the same call.

<details>
<summary>⚠️ Bot-identity background (not reachable here) — why a two-step flow exists</summary>

Under bot identity a bot may fail to invite users who are mutually invisible to it during group creation (error 232043), which is why upstream documents a two-step create-then-add flow. **This server never uses bot identity, so neither the error nor the workaround applies** — do not follow it, and do not offer it to the user as an option.

</details>

## Output Fields

| Field | Description |
|------|------|
| `chat_id` | The new group's ID (`oc_xxx` format) |
| `name` | Group name |
| `chat_type` | Group type (`private` / `public`) |
| `owner_id` | Owner ID (may be empty when a bot creates the group and `owner` is not specified) |
| `external` | Whether the group is external |
| `share_link` | Group share link (omitted if retrieval fails) |

## Usage Scenarios

### Scenario 1: Create a group and specify the owner

```
lark_im_chat_create(name="Project Discussion Group", owner="ou_xxx")
```

### Scenario 2: Create a group and invite users and a bot

```
lark_im_chat_create(name="Project Discussion Group", owner="ou_xxx", users="ou_aaa,ou_bbb", bots="cli_aaa")
```

### Scenario 3: Create a group and send a welcome message

```
# Step 1: Create the group
lark_im_chat_create(name="New Group", format="json")

# Step 2: Use the chat_id from step 1 to send a welcome message
lark_im_messages_send(chat_id="<chat_id>", text="Welcome, everyone!")
```

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| Permission denied (99991672) | The app does not have `im:chat:create` (bot) or `im:chat:create_by_user` (user) permission enabled | Enable the required permission for the app in the Open Platform console |
| `name is required for public groups and must be at least 2 characters` | A public group was created without a name or with a name shorter than 2 characters | Provide a name with at least 2 characters |
| `name exceeds the maximum of 60 characters` | The group name is too long | Shorten the name to 60 characters or fewer |
| `description exceeds the maximum of 100 characters` | The group description is too long | Shorten the description to 100 characters or fewer |
| `users exceeds the maximum of 50` | Too many user members were provided | Split the operation into batches and add more members later |
| `bots exceeds the maximum of 5` | Too many bot members were provided | Invite at most 5 bots at once |
| `invalid user id: expected open_id (ou_xxx)` | Invalid user ID format | Use the `ou_xxx` format for users |
| `invalid bot id: expected app ID (cli_xxx)` | Invalid bot ID format | Use the `cli_xxx` format for bots |
| `invalid owner: expected open_id (ou_xxx)` | Invalid owner ID format | Use the `ou_xxx` format for the owner |
| `bot is invisible to user` (232043) | The bot and target users are mutually invisible | ⚠️ Bot-identity only — unreachable here. Under user identity this error does not occur; if you see it, the call did not run as this server's user |

## References

- `lark_get_skill(domain="im")` - all IM commands

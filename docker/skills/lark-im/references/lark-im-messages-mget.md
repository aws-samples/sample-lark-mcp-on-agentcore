# im +messages-mget

Fetch message details in batch. Given a list of message IDs, this returns the full content for multiple messages in one call and automatically resolves sender names.

By default the response also carries a `reactions` block (counts + details from `im.reactions.batch_query`) on every message that has reactions, and `update_time` on messages that were actually edited. Replies inside `thread_replies` participate in the same batched enrichment. Pass `no_reactions=true` to skip the extra round-trip. Pass `download_resources=true` to additionally download message resources (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` and attach a `resources` block — off by default, no extra requests when omitted. See `lark_get_skill(domain="im", section="message-enrichment")` for the full contract.

> **Supports both user identity (default) and bot identity.**

This tool maps to: `lark_im_messages_mget` (internally calls `GET /open-apis/im/v1/messages/mget`).

## Commands

```
# Fetch a single message
lark_im_messages_mget(message_ids="om_xxx")

# Fetch multiple messages in batch (comma-separated)
lark_im_messages_mget(message_ids="om_aaa,om_bbb,om_ccc")

# JSON output
lark_im_messages_mget(message_ids="om_aaa,om_bbb", format="json")
```

## Parameters

| Parameter | Required | Limits | Description |
|------|------|------|------|
| `message_ids` | Yes | At least one, max 50, `om_xxx` format, comma-separated | Message ID list |
| `no_reactions` | No | — | Skip auto-fetching the `reactions` block |
| `download_resources` | No | — | Download message resources (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` and attach a `resources` block. Off by default |

## Output Fields

| Field | Description |
|------|------|
| `messages` | Message array |
| `total` | Number of messages returned |

Each message contains:

| Field | Description |
|------|------|
| `message_id` | Message ID |
| `msg_type` | Message type (`text`, `image`, `file`, etc.) |
| `create_time` | Creation time |
| `sender` | Sender information (includes `name`) |
| `content` | Message content |

## Usage Scenarios

### Scenario 1: Fetch the full content of a specific message

```
lark_im_messages_mget(message_ids="om_xxx", format="json")
```

### Scenario 2: Fetch multiple messages in one batch

```
lark_im_messages_mget(message_ids="om_aaa,om_bbb,om_ccc")
```

### Scenario 3: Use together with the message list command

First get message IDs via `lark_im_chat_messages_list`, then fetch full content via `lark_im_messages_mget`:

```
# Get the message list
lark_im_chat_messages_list(chat_id="oc_xxx", format="json")

# Fetch specific message details
lark_im_messages_mget(message_ids="om_aaa,om_bbb")
```

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| `message_ids requires at least one message ID` | No message ID was provided | Provide at least one message ID |
| `invalid message ID: must start with om_` | Invalid message ID format | Message IDs must start with `om_` |
| Permission denied | Message read permission is missing | Ensure the app has `im:message:readonly` and `contact:user.base:readonly` enabled |
| Empty result | Message IDs do not exist or are not accessible | Verify the IDs and access permissions |

## AI Usage Guidance

1. **Use JSON for full content:** table output truncates content. Use `format="json"` when the full body matters.
2. **Sender names are already enriched:** the command resolves sender names automatically, so no extra lookup is required.
3. **Images are rendered as placeholders:** image messages appear as placeholders such as `![Image](img_xxx)`. Use `lark_im_messages_resources_download` when you need the binary resource.
4. **Batching is more efficient:** fetching multiple IDs in one request is better than calling the API repeatedly.

## References

- [lark-im](../SKILL.md) - all IM commands

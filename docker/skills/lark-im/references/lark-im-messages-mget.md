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

For `folder` messages, `content` carries a folder key; `lark_im_messages_mget` expands the folder one level (`GET /files/:file_key/folder`), rendering first-level children inside the folder tag:

```
<folder key="file_v3_...g" name="assets" child_count="5">
  <file key="file_v3_...g" name="a.pdf"/>
  <folder key="file_v3_...g" name="sub" child_count="2"/>
</folder>
```

- `child_count` on the root folder is the total first-level item count reported by the API; when a folder has more first-level children than the render cap (10), the tag carries `has_more="true"`.
- `child_count` on a nested `<folder>` child is that child's own child count (a depth hint; nested folders are not expanded further).
- A genuinely empty folder renders as `<folder key="..." name="..." child_count="0"/>`.

For `post` messages, the attachment zone (top-level `files` array) is rendered as trailing lines in `content`, one per attachment:

- `<file key="file_xxx" name="report.pdf"/>` — a file with a display name (same tag style as a standalone `file` message)
- `<file key="file_xxx"/>` — a file with an empty display name (the server always backfills names, so this branch is rare but valid on the wire)
- `<folder key="file_xxx" name="assets"/>` — a folder attachment (`is_folder: true`). Like folder messages, the attachment is expanded one level (children rendered inside the tag) when runtime + message id are available; otherwise it degrades to this single-line tag.

Use `format="json"` to see the full content without table truncation — note the content is the rendered text (including the `<file>`/`<folder>` lines above), not the raw post JSON.

Downloading: `lark_im_messages_resources_download` (see `lark_get_skill(domain="im", section="messages-resources-download")`) takes an explicit `message_id` + `file_key` and fetches `GET /messages/:id/resources/:file_key` — this works for standalone `file` message keys, top-level `post` attachment `files[]` entries, **and file keys rendered inside `<folder>...</folder>` (folder children are real files addressed by their own file_key)**. Two caveats:
- `download_resources=true` (the automatic enrichment flag on the list/get tools) only auto-collects top-level single-file resources from the raw content — folder children are expanded at render time and are **not** auto-added to that worklist, so to download a folder child you pass its key explicitly to `lark_im_messages_resources_download`.
- `is_folder` entries themselves (a folder, not a file) are not downloadable as a single resource.

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

- `lark_get_skill(domain="im")` - all IM commands

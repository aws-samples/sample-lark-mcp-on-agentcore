# im +chat-messages-list

Fetch the message list for a conversation. Supports both group chats and direct messages.

By default the response carries a `reactions` block (counts + details from `im.reactions.batch_query`) on every message that has reactions, and `update_time` on messages that were actually edited. Thread replies expanded via auto-`thread_replies` participate in the same batched enrichment. Pass `no_reactions=true` to skip the extra round-trip. Pass `download_resources=true` to additionally download message resources (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` and attach a `resources` block — off by default. See `lark_get_skill(domain="im", section="message-enrichment")` for the full contract.

This tool maps to: `lark_im_chat_messages_list` (internally calls `GET /open-apis/im/v1/messages`, and automatically resolves the p2p chat_id when needed).

## Commands

```
# Get group chat messages (json output by default)
lark_im_chat_messages_list(chat_id="oc_xxx")

# Get direct messages with a user (pass open_id and resolve p2p chat_id automatically)
lark_im_chat_messages_list(user_id="ou_xxx")

# Specify a time range (ISO 8601)
lark_im_chat_messages_list(chat_id="oc_xxx", start="2026-03-10T00:00:00+08:00", end="2026-03-11T00:00:00+08:00")

# Specify a time range (date only)
lark_im_chat_messages_list(chat_id="oc_xxx", start="2026-03-10", end="2026-03-11")

# Control sort order and page size (max 50)
lark_im_chat_messages_list(chat_id="oc_xxx", order="asc", page_size="20")

# Pagination
lark_im_chat_messages_list(chat_id="oc_xxx", page_token="xxx")

# JSON output
lark_im_chat_messages_list(chat_id="oc_xxx", format="json")
```

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `chat_id` | One of two | Specify the conversation by its chat_id directly (e.g., group chat `oc_xxx`) |
| `user_id` | One of two | Specify a DM conversation by the other user's open_id (`ou_xxx`); p2p chat_id is resolved automatically. Requires user identity; not supported with bot identity |
| `start` | No | Start time (ISO 8601 or date only) |
| `end` | No | End time (ISO 8601 or date only) |
| `order` | No | Sort order: `asc` / `desc` (default `desc`) |
| `page_size` | No | Page size (default 50, max 50) |
| `page_token` | No | Pagination token |
| `no_reactions` | No | Skip auto-fetching the `reactions` block |
| `download_resources` | No | Download message resources (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` and attach a `resources` block. Off by default; no extra requests when omitted |

> Rule: `chat_id` and `user_id` are mutually exclusive. You must provide exactly one of them.

> **CAUTION:** `order` is the only sort axis — messages are always ordered by creation time, `asc` or `desc`. There is no field axis: the tool cannot sort by sender or any other field, so do **not** attempt `order="sender"` or similar (it is rejected). If the user asks to group or sort by sender, fetch with `order` and aggregate client-side, and tell them this is local post-processing, not an API sort capability.

## Resource Rendering

Messages are rendered into human-readable text for inspection. Image messages are shown as placeholders such as `![Image](img_xxx)`; files, audio, and videos are rendered with resource keys in the content (e.g. `<audio key="file_xxx" duration="Xs"/>`). By default resource binaries are **not** downloaded.

Two ways to get the binaries:
- **In one pass:** add `download_resources=true` to this tool — every eligible resource (image/file/audio/video/media + post-embedded, excluding stickers) is downloaded into `./lark-im-resources/` and a `resources` block (`{message_id, key, type, local_path, size_bytes}`) is attached to each message. See `lark_get_skill(domain="im", section="message-enrichment")`.
- **One at a time:** use `lark_im_messages_resources_download`.

| Resource Type | Marker in Content | Behavior |
|---------|-------------|------|
| Image | `![Image](img_xxx)` | `download_resources=true`, or manually `lark_im_messages_resources_download(type="image")` |
| File | `<file key="file_xxx" .../>` | `download_resources=true`, or manually `lark_im_messages_resources_download(type="file")` |
| Audio | `<audio key="file_xxx" duration="Xs"/>` | `download_resources=true`, or manually `lark_im_messages_resources_download(type="file")` |
| Video | `<video key="file_xxx" .../>` | `download_resources=true`, or manually `lark_im_messages_resources_download(type="file")` |
| Sticker | `[Sticker]` | Not downloadable (Feishu does not support fetching sticker resources) |

## Thread Expansion (`thread_id`)

In JSON output, a message may contain a `thread_id` (`omt_xxx`) field, which means the message has replies in a thread. Use `lark_im_threads_messages_list` to inspect replies in that thread:

```
lark_im_threads_messages_list(thread="omt_xxx")
```

| Scenario | Recommendation |
|------|------|
| You need context | Call `lark_im_threads_messages_list(thread="<thread_id>", order="desc", page_size="10")` for the discovered thread_id to inspect recent replies |
| The user asks for the "full discussion" | Use `lark_im_threads_messages_list(thread="<thread_id>", order="asc", page_size="50")`, then paginate if needed |
| You only need an overview | Skip thread expansion |

## Output Fields

| Field | Description |
|------|------|
| `messages` | Message array |
| `total` | Number of messages in the current page |
| `has_more` | Whether additional pages are available |
| `page_token` | Pagination token for the next page |

Each message contains:

| Field | Description |
|------|------|
| `message_id` | Message ID |
| `msg_type` | Message type: `text`, `image`, `file`, `interactive`, `post`, `audio`, `video`, `system`, etc. |
| `create_time` | Creation time |
| `sender` | Sender information (includes `name` for user senders) |
| `content` | Message content |
| `deleted` | Whether the message has been recalled (always present, `true` = recalled) |
| `updated` | Whether the message has been edited after sending |
| `mentions` | Array of @mentions in the message; each item contains `{id, key, name}`. Present only when the message contains @mentions |
| `thread_id` | Thread ID (`omt_xxx`) if the message has replies in a thread. Present only when replies exist |

## Pagination (`has_more` / `page_token`)

`lark_im_chat_messages_list` returns `has_more` and `page_token` when more data is available. Use `page_token` to continue:

```
lark_im_chat_messages_list(chat_id="oc_xxx", page_token="<PAGE_TOKEN>")
```

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| `specify chat_id or user_id` | Neither `chat_id` nor `user_id` was provided | You must provide exactly one |
| `chat_id and user_id cannot be specified together` | Both parameters were provided | Use only one |
| `user_id requires user identity; use chat_id when calling with bot identity` | `user_id` was used with bot identity | The p2p resolution endpoint requires user identity. Either use user identity or look up the p2p `chat_id` separately and pass it via `chat_id` |
| `P2P chat not found for this user` | `user_id` was used but no p2p chat exists for the current identity and that user | Confirm the target direct-message relationship exists for the current identity |
| `start: invalid time format` | Invalid time format | Use ISO 8601 or date-only format such as `2026-03-10` |
| Permission denied | Message read permissions are missing | Ensure the app has `im:message:readonly` and `im:chat:read` enabled |

## AI Usage Guidance

1. **Resolving chat_id from a chat name:** When the user refers to a chat by name and you don't have the `chat_id`, use `lark_im_chat_search` first:
   ```
   # Find chat_id by name, then list messages
   lark_im_chat_search(query="<chat name keyword>", format="json")
   lark_im_chat_messages_list(chat_id="<chat_id>")
   ```
   **Do not use raw `im chats search` or `lark_im_chat_list` — always use the `lark_im_chat_search` tool.**
2. **Prefer `chat_id` when available:** if the chat_id is already known, use it directly to avoid extra API calls.
3. **For direct messages:** use `user_id` to resolve the p2p chat automatically instead of looking it up manually. This requires user identity; with bot identity, resolve the p2p `chat_id` yourself and pass it via `chat_id`.
4. **For time ranges:** both ISO 8601 and date-only inputs are supported. Date-only is usually simpler.
5. **For full content:** table output truncates content. Use `format="json"` when you need the complete message body.
6. **For sender info:** the command already resolves sender names, so you do not need a separate lookup.
7. **Application/bot identity + named group history:** If the user says "使用应用身份/以 bot 身份" and asks to list or read historical messages for a named group, use bot identity for both steps:
   ```
   lark_im_chat_search(query="<chat name keyword>", format="json")
   lark_im_chat_messages_list(chat_id="<chat_id>", page_size="50", format="json")
   ```
   Do not use `lark_im_messages_search` with bot identity; `lark_im_messages_search` is user-only. Continue with `page_token` if `has_more=true`.

## References

- [lark-im](../SKILL.md) - all IM commands

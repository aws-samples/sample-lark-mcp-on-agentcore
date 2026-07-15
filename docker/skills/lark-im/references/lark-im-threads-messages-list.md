# im +threads-messages-list

Fetch the reply message list inside a thread. When `lark_im_chat_messages_list` returns messages that include a `thread_id` field, use this tool to inspect all replies in that thread.

By default each reply also carries a `reactions` block (counts + details from `im.reactions.batch_query`) when the server has reactions for it, and `update_time` for messages that were actually edited. Pass `no_reactions=true` to skip the extra round-trip. Pass `download_resources=true` to additionally download message resources (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` and attach a `resources` block — off by default, no extra requests when omitted. See `lark_get_skill(domain="im", section="message-enrichment")` for the full contract.

This tool maps to: `lark_im_threads_messages_list` (internally calls `GET /open-apis/im/v1/messages` with `container_id_type=thread` to fetch thread messages).

## Commands

```
# Get thread replies (ascending by time by default, table output)
lark_im_threads_messages_list(thread="omt_xxx")

# Reverse chronological order (latest first)
lark_im_threads_messages_list(thread="omt_xxx", order="desc")

# Control page size
lark_im_threads_messages_list(thread="omt_xxx", page_size="20")

# Pagination
lark_im_threads_messages_list(thread="omt_xxx", page_token="<PAGE_TOKEN>")

# Output format options
lark_im_threads_messages_list(thread="omt_xxx", format="pretty")
lark_im_threads_messages_list(thread="omt_xxx", format="table")
lark_im_threads_messages_list(thread="omt_xxx", format="csv")
```

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `thread` | Yes | Thread ID (`om_xxx` or `omt_xxx` format) |
| `no_reactions` | No | Skip auto-fetching the `reactions` block |
| `download_resources` | No | Download message resources (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` and attach a `resources` block. Off by default |
| `order` | No | Sort order: `asc` (default) / `desc` |
| `page_size` | No | Number of items per page (default 50, range 1-500) |
| `page_token` | No | Pagination token for the next page |
| `format` | No | Output format: `json` (default) / `pretty` / `table` / `ndjson` / `csv` |

## Core Constraints

### 1. Source of `thread_id`

`thread_id` (`omt_xxx` or `om_xxx`) comes from the `thread_id` field in results returned by `lark_im_chat_messages_list` or `lark_im_messages_search`. Do not guess a thread ID. Fetch messages first and use the returned value.

### 2. No time filtering support

Thread messages do not support `start_time` / `end_time` filtering because of Feishu API limitations. Use pagination and sort order to control the scope.

### 3. Pagination (`has_more` / `page_token`)

- When the result includes `has_more=true`, use `page_token` to fetch the next page
- If you need the complete thread, keep paginating; if you only need an overview, the first page is often enough

### 4. Recommended expansion strategy

| Scenario | Recommended Parameters |
|------|---------|
| Quickly inspect recent replies | `order="desc", page_size="10"` |
| Read the full thread in chronological order | `order="asc", page_size="50"`, then paginate as needed |
| Just confirm whether replies exist | `order="desc", page_size="1"` |

## Usage Scenarios

### Scenario 1: Expand a thread discovered in group messages

```
# Step 1: Fetch group messages and find one that contains thread_id
lark_im_chat_messages_list(chat_id="oc_xxx")

# Step 2: Extract thread_id from the JSON output and fetch thread replies
lark_im_threads_messages_list(thread="omt_xxx")
```

### Scenario 2: Paginate through a long thread

```
# First page
lark_im_threads_messages_list(thread="omt_xxx")

# If has_more=true is returned, continue with page_token
lark_im_threads_messages_list(thread="omt_xxx", page_token="<PAGE_TOKEN>")
```

## Resource Rendering

Thread replies are rendered into human-readable text. Image messages appear as placeholders such as `![Image](img_xxx)`; by default resource binaries are **not** downloaded.

Pass `download_resources=true` to download every eligible resource (image/file/audio/video/media + post-embedded, excluding stickers) into `./lark-im-resources/` in one pass and attach a `resources` block to each reply (see `lark_get_skill(domain="im", section="message-enrichment")`). Otherwise download individual resources manually through `lark_im_messages_resources_download` (see `lark_get_skill(domain="im", section="messages-resources-download")`).

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| "Invalid thread ID format" | `thread_id` does not start with `om_` or `omt_` | Use a valid `om_xxx` or `omt_xxx` value |
| Empty thread result | Wrong thread_id or no replies in the thread | Confirm the thread_id came from `lark_im_chat_messages_list` output |
| Permission denied | The user is not authorized or is not a conversation member | Make sure OAuth authorization is complete and the identity is a chat member |

## References

- [lark-im](../SKILL.md) - all message-related commands
- `lark_get_skill(domain="im", section="chat-messages-list")` - fetch conversation messages (source of `thread_id`)

# im +messages-search

Search Feishu messages across conversations. This tool automatically performs a multi-step workflow: search for message IDs, batch fetch message details, then enrich the results with chat context.

By default each result message also carries a `reactions` block (counts + details from `im.reactions.batch_query`) when the server has reactions for it, and `update_time` for messages that were actually edited. With `page_all`, every page is enriched; pass `no_reactions=true` to skip the extra round-trip. See `lark_get_skill(domain="im", section="message-enrichment")` for the full contract.

> **User identity only.** Bot identity is not supported.

This tool maps to: `lark_im_messages_search` (internally calls `POST /open-apis/im/v1/messages/search` + batched `GET /open-apis/im/v1/messages/mget`, then batch-fetches chat context).

## Commands

```
# Search by keyword
lark_im_messages_search(query="project progress")

# Restrict search to a specific group chat
lark_im_messages_search(query="weekly report", chat_id="oc_xxx")

# Filter by sender (comma-separated)
lark_im_messages_search(query="requirement", sender="ou_xxx,ou_yyy")

# Filter by attachment type
lark_im_messages_search(query="report", include_attachment_type="file")

# Filter by chat type (group / p2p)
lark_im_messages_search(query="progress", chat_type="group")

# Filter by sender type (user / bot)
lark_im_messages_search(query="reminder", sender_type="bot")

# Exclude bot senders
lark_im_messages_search(query="reminder", exclude_sender_type="bot")

# Only messages that @me
lark_im_messages_search(query="announcement", is_at_me=true)

# Only messages that @mention specific users (results also include messages that @all)
lark_im_messages_search(query="release", at_chatter_ids="ou_xxx,ou_yyy")

# Combined filters + time range
lark_im_messages_search(query="meeting", sender="ou_xxx", chat_type="group", start="2026-03-13T00:00:00+08:00", end="2026-03-20T23:59:59+08:00")

# Specific time range (ISO 8601)
lark_im_messages_search(query="release", start="2026-03-01T00:00:00+08:00", end="2026-03-10T00:00:00+08:00")

# Output format options
lark_im_messages_search(query="test", format="pretty")
lark_im_messages_search(query="test", format="table")
lark_im_messages_search(query="test", format="csv")

# Pagination
lark_im_messages_search(query="test", page_token="<PAGE_TOKEN>")

# Auto-pagination across multiple pages
lark_im_messages_search(query="test", page_all=true, format="json")

# Auto-pagination with an explicit page cap
lark_im_messages_search(query="test", page_limit="5", format="json")
```

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `query` | No | Search keyword (may be empty when used with other filters) |
| `chat_id` | No | Restrict to chat IDs, comma-separated (`oc_xxx,oc_yyy`) |
| `sender` | No | Sender open_ids, comma-separated (`ou_xxx`) |
| `include_attachment_type` | No | Attachment filter: `file` / `image` / `video` / `link` |
| `chat_type` | No | Chat type: `group` / `p2p` |
| `sender_type` | No | Sender type: `user` / `bot` |
| `exclude_sender_type` | No | Exclude messages from `user` or `bot` senders |
| `is_at_me` | No | Only return messages that mention `@me` |
| `at_chatter_ids` | No | Filter by @mentioned user open_ids, comma-separated (`ou_xxx,ou_yyy`). Matched results also include messages that `@all` |
| `start` | No | Start time with local timezone offset required (e.g. `2026-03-24T00:00:00+08:00`) |
| `end` | No | End time with local timezone offset required (e.g. `2026-03-25T23:59:59+08:00`) |
| `page_size` | No | Page size (default 20, range 1-50) |
| `page_token` | No | Pagination token for the next page |
| `page_all` | No | Automatically paginate through all result pages (up to 40 pages) |
| `page_limit` | No | Max pages to fetch when auto-pagination is enabled (default 20, max 40). Setting it explicitly also enables auto-pagination |
| `format` | No | Output format: `json` (default) / `pretty` / `table` / `ndjson` / `csv` |

## Core Constraints

### 1. Provide at least one filter whenever possible

All parameters are optional, but you should usually provide at least one filter (`query`, `sender`, `chat_id`, etc.). Otherwise the search scope may be too broad and return low-signal results.

### 2. Two-step orchestration is automatic

The tool automatically performs:

1. The **search API** returns matching `message_id` values
2. The **mget API** fetches full message content for those message IDs in batch
3. Chat context lookup is fetched in batch and attached to each message

The user does not need to manage the orchestration manually. When search results span multiple pages, the tool can also paginate automatically with `page_all` or `page_limit`.

### 3. Conversation context is enriched automatically

In JSON output, each message automatically includes conversation context:

| Field | Description |
|------|------|
| `chat_type` | Conversation type: `p2p` / `group` |
| `chat_name` | Group name (for groups) or the other participant's name (for p2p chats) |
| `chat_partner` | For p2p only: the other participant's `open_id` and `name` |

In pretty output, the `chat` column shows the chat name for groups, or `"p2p"` for direct messages.

Each message in JSON output contains:

| Field | Description |
|------|------|
| `message_id` | Message ID |
| `msg_type` | Message type: `text`, `image`, `file`, `interactive`, `post`, `audio`, `video`, `system`, etc. |
| `create_time` | Creation time |
| `sender` | Sender information (includes `name` for user senders) |
| `content` | Message content |
| `chat_id` | ID of the conversation the message belongs to |
| `deleted` | Whether the message has been recalled (`true` = recalled) |
| `updated` | Whether the message has been edited after sending |
| `mentions` | Array of @mentions in the message; each item contains `{id, key, name}`. Present only when the message contains @mentions |
| `thread_id` | Thread ID (`omt_xxx`) if the message has replies in a thread. Present only when replies exist |

### 4. Pagination behavior

- Default behavior is still **single-page**.
- `page_token` is the manual continuation mechanism when you already have a token from a previous response.
- `page_all` enables auto-pagination and uses a default cap of **40 pages**.
- `page_limit` enables auto-pagination with an explicit cap. If you pass `page_limit` without `page_all`, auto-pagination is still enabled.
- When auto-pagination stops because of the configured page cap, the response still includes the last `has_more` / `page_token` so you can continue manually.

### 5. Search results contain follow-up clues

In JSON output, each message includes `chat_id` and `thread_id` (when present). Use them with other tools for deeper inspection:

```
# View the full message stream for the conversation that contains the search result
lark_im_chat_messages_list(chat_id="<chat_id>")

# View replies in the thread that contains the search result
lark_im_threads_messages_list(thread="<thread_id>")
```

## Resource Rendering

Search results reuse the same content formatter as other read commands. Image messages are rendered as placeholders such as `![Image](img_xxx)`; resource binaries are **not** downloaded automatically.

Use `lark_im_messages_resources_download` if you need to fetch the underlying image or file bytes from a specific message.

## AI Usage Guidance

### Query boundary for activity review

Use `query` only for real message keywords. If the user asks for activity review such as "最近一周我和哪些 Bot 有过交互" or "整理我和某人的聊天记录", and the useful constraints are sender type, chat, person, or time range, keep `query=""` and rely on those filters. Do not put generic instruction words such as "看看", "总结", "交互内容", or "聊天记录" into `query`; those words often over-constrain message search and hide the relevant messages.

This guidance applies only when using user identity. `lark_im_messages_search` is user-only; if the user explicitly asks for application/bot identity, do not try bot identity. For bot identity with a named group and history/listing intent, resolve the group with `lark_im_chat_search`, then list messages with `lark_im_chat_messages_list(chat_id="<chat_id>")`.

```
# Review recent bot interactions without forcing a keyword
lark_im_messages_search(query="", sender_type="bot", start="<YYYY-MM-DDT00:00:00+08:00>", end="<YYYY-MM-DDT23:59:59+08:00>", page_all=true, format="json")
```

Replace the time placeholders at execution time. For example, "最近一周" means computing the start date and end date from the current day before running the command; do not copy date literals from this reference into answers for relative requests.

For activity summaries, validate evidence by message IDs and chat context. The final answer should cite or retain the `message_id`, sender, chat, and create time for each important item. If the row's source data contains concrete `om_...` message IDs or `ou_...` user IDs, treat those IDs as strong recall targets during verification; do not rely only on a high-level keyword match.

### Resolving chat_id from a chat name

When the user refers to a chat by name and you need its `chat_id` for the `chat_id` filter, use `lark_im_chat_search` first:

```
# Step 1: Find the chat_id by name
lark_im_chat_search(query="<chat name keyword>", format="json")

# Step 2: Use the chat_id to narrow down message search
lark_im_messages_search(query="keyword", chat_id="<chat_id>")
```

**Do not use raw `im chats search` or `lark_im_chat_list` — always use the `lark_im_chat_search` tool.**

## Work Summary / Report Generation

When the user asks you to summarize work, generate a weekly report, or compile activity from chat messages, you should **paginate through all available results** to get a complete picture. A single page is rarely enough for thorough summarization.

### Strategy

1. **Start with targeted filters** — use `chat_id`, `sender`, `start`, `end` to narrow the scope as much as possible before paginating.
2. **Prefer auto-pagination** — for report and summary tasks, use `page_all=true, format="json"` by default. If you need a bounded run, use `page_limit="<n>", format="json"`.
3. **Accumulate before summarizing** — collect all pages of messages first, then analyze and summarize. Do not summarize after the first page alone — you will miss important context.
4. **Fall back to `page_token` when resuming** — if auto-pagination hits the configured page cap and the response still has `has_more=true`, continue from the returned `page_token`.
5. **Use `format="json"`** — JSON output includes `has_more` and `page_token` fields needed for pagination. `pretty` and `table` formats are useful for reading but not for resuming pagination reliably.

### Example: Weekly work summary from a project chat

```
# Preferred: fetch automatically
lark_im_messages_search(query="", chat_id="oc_xxx", sender="ou_me", start="2026-03-18T00:00:00+08:00", end="2026-03-25T23:59:59+08:00", page_size="50", page_all=true, format="json")

# If you need to cap the run explicitly
lark_im_messages_search(query="", chat_id="oc_xxx", sender="ou_me", start="2026-03-18T00:00:00+08:00", end="2026-03-25T23:59:59+08:00", page_size="50", page_limit="5", format="json")

# If the bounded run still returns has_more=true, continue manually
lark_im_messages_search(query="", chat_id="oc_xxx", sender="ou_me", start="2026-03-18T00:00:00+08:00", end="2026-03-25T23:59:59+08:00", page_size="50", page_token="<token_from_previous_run>", format="json")
```

### Key points

- **Always paginate exhaustively** for summary tasks. A single page of 20-50 messages is usually insufficient for a meaningful work summary.
- Prefer `page_all=true`; use `page_limit` only when you need to bound runtime or output volume.
- If the user does not specify a time range, default to the current week (Monday to today) for weekly reports, or ask for clarification.
- When summarizing, group messages by topic/thread rather than by chronological order for better readability.

## Common Errors and Troubleshooting

| Symptom | Root Cause | Solution |
|---------|---------|---------|
| Too few results | The time range is too narrow or the keyword is too specific | Expand the time range and try broader keywords |
| No results | Missing permission or no match | Confirm `search:message` is authorized and relax the filters |
| Permission denied | Search scope not authorized | Ensure the `search:message` scope is authorized |

## References

- [lark-im](../SKILL.md) - all message-related commands
- `lark_get_skill(domain="im", section="threads-messages-list")` - inspect thread replies

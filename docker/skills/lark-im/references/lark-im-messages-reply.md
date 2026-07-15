# im +messages-reply

Reply to a specific message. Supports both user identity and bot identity. Also supports thread replies.

This tool maps to: `lark_im_messages_reply` (internally calls `POST /open-apis/im/v1/messages/:message_id/reply`).

## Safety Constraints

Replies sent by this tool are visible to other people. Before calling it, you **must** confirm with the user:

1. Which message to reply to
2. The reply content
3. Which identity to use (user or bot)

**Do not** send a reply without explicit user approval.

When using bot identity, the reply is sent in the app's name, so make sure the app has already been added to the target chat.

When using user identity, the reply is sent as the authorized end user and requires the `im:message.send_as_user` and `im:message` scopes.

## Choose The Right Content Parameter

### Default Selection Rule For Agents

- Prefer `markdown` for headings, lists, links, summaries, investigation notes, or Markdown-looking content.
- Use `text` for exact plain text: logs, code, indentation-sensitive text, or literal Markdown.
- Use `content` for exact `post` JSON, titles, multiple locales, cards, or unsupported structures.

| Need | Recommended parameter | Why |
|------|------|------|
| Reply with headings, lists, links, summaries, or investigation notes | `markdown` | Best default for lightweight formatting; converted to Feishu `post` JSON |
| Reply with plain text exactly as written | `text` | Preserves literal text; no Markdown conversion |
| Precisely control the reply payload | `content` | You provide the exact JSON |
| Reply with media | `image` / `file` / `video` / `audio` | Shortcut uploads URLs, or cwd-relative local files automatically |

### `text` vs `markdown`

- Use `markdown` for lightweight formatted replies.
- Use `text` for exact plain text, especially logs, code, indentation, or literal Markdown characters.
- Use `content` when you need exact `post` JSON, a card, a title, multiple locales, or any structure that `markdown` cannot express reliably.

## What `markdown` Really Does

`markdown` accepts Markdown-like input and converts it to the Feishu `post` payload required by the reply API.

The tool:

1. Forces `msg_type=post`
2. Resolves remote Markdown images like `![x](https://...)`
3. Normalizes the Markdown for Feishu post rendering
4. Wraps the final content as:

```json
{"zh_cn":{"content":[[{"tag":"md","text":"..."}]]}}
```

This makes `markdown` the simplest path for lightweight formatted replies.

### Markdown Boundaries

- It does **not** promise full CommonMark / GitHub Flavored Markdown support.
- It always becomes a `post` payload with a single `zh_cn` locale.
- It does **not** let you set a `post` title.
- Headings are rewritten:
    - `# Title` becomes `#### Title`
    - `##` to `######` are normalized to `#####` when the content contains H1-H3
- Consecutive headings are separated with blank lines after heading normalization.
- Block spacing and line breaks may be normalized during conversion.
- Code blocks are preserved as code blocks.
- Excess blank lines are compressed.
- Already-uploaded `img_xxx` image keys are the most reliable Markdown image input.
- Local paths (e.g. `![x](./a.png)`) are **not** supported directly in `markdown` and will not be auto-uploaded.
- Remote URLs (`https://...`) will be auto-downloaded and uploaded at runtime; if the download or upload fails, the image is removed with a warning.

If you need a title, multiple locales, cards, unsupported rich structures, or byte-for-byte post JSON control, use `msg_type="post"` with `content=...`.

### Image Constraint for `markdown`

When using `markdown` with images, prefer pre-uploading via `images.create` and referencing `![alt](img_xxx)` for predictable results. Remote URLs may work but are not guaranteed.

**Steps:**

```
# 1. Upload image to get image_key (bot identity required)
lark_invoke(tool_name="lark_im_images_create", args={data: {"image_type": "message"}, file: "./diagram.png"})
# Returns: {"image_key":"img_v3_xxxx"}

# 2. Use image_key in markdown reply
lark_im_messages_reply(message_id="om_xxx", markdown="## Result\n\n![diagram](img_v3_xxxx)\n\nSee above for details.")
```

## Preserving Formatting

If the reply contains multiple lines, code blocks, indentation, tabs, or a lot of escaping, prefer literal newlines for either `markdown` or `text`.

### When formatting must be preserved

Use `text`:

```
lark_im_messages_reply(message_id="om_xxx", text="Received\nI will check this today.\nOwner: alice")
```

```
lark_im_messages_reply(message_id="om_xxx", text="```sql\nselect * from jobs;\n```")
```

This keeps the reply as plain text instead of converting it to a `post`.

## Commands

```
# Reply with a formatted update
lark_im_messages_reply(message_id="om_xxx", markdown="## Reply\n\n- item 1\n- item 2")

# Reply with a plain one-line message
lark_im_messages_reply(message_id="om_xxx", text="Received")

# Equivalent manual JSON
lark_im_messages_reply(message_id="om_xxx", content="{\"text\":\"Received\"}")

# Reply with preserved multi-line text
lark_im_messages_reply(message_id="om_xxx", text="Line 1\nLine 2\n  indented line")

# Reply inside the thread (message appears in the target thread)
lark_im_messages_reply(message_id="om_xxx", text="Let's discuss this", reply_in_thread=true)

# Reply with Markdown containing an image (must pre-upload via images.create)
lark_invoke(tool_name="lark_im_images_create", args={data: {"image_type": "message"}, file: "./screenshot.png"})
# Use the returned image_key
lark_im_messages_reply(message_id="om_xxx", markdown="## Screenshot\n\n![screenshot](img_v3_xxxx)\n\nConfirmed.")

# If you need exact post structure, send JSON directly
lark_im_messages_reply(message_id="om_xxx", msg_type="post", content="{\"zh_cn\":{\"title\":\"Reply\",\"content\":[[{\"tag\":\"text\",\"text\":\"Detailed content\"}]]}}")

# Reply with a local image (uploaded automatically before sending)
lark_im_messages_reply(message_id="om_xxx", image="./photo.png")

# Reply with a local file (uploaded automatically before sending)
lark_im_messages_reply(message_id="om_xxx", file="./report.pdf")

# Reply with a local video (video_cover is required as the video cover)
lark_im_messages_reply(message_id="om_xxx", video="./demo.mp4", video_cover="./cover.png")

# Reply with a voice message
lark_im_messages_reply(message_id="om_xxx", audio="./voice.opus")

# With an idempotency key
lark_im_messages_reply(message_id="om_xxx", text="Received", idempotency_key="my-unique-id")

# ===== Interactive Card =====
# 🚫 STOP — before constructing ANY interactive card JSON, you MUST call
#    lark_get_skill(domain="im", section="card/lark-im-card-create") and follow
#    its workflow. Do NOT hand-write or copy a card payload. The JSON passed to
#    content must be the OUTPUT of that workflow. This is non-negotiable.

# Once the workflow has produced the card JSON, reply with it:
lark_im_messages_reply(message_id="om_xxx", msg_type="interactive", content="<card_json_from_workflow>")
```

## Media Input Rules

- Media parameters accept an existing key (`img_xxx` / `file_xxx`), an `http://` or `https://` URL, or a local file path.
- Local paths must be relative to the current working directory and stay within it after resolving `..` and symlinks.
- Absolute paths such as `/tmp/photo.png` are rejected. Run the command from the file's directory and pass `./photo.png`, or copy the file into the current directory first.
- `audio` sends a voice message and accepts only Opus audio (`.opus` or Ogg Opus `.ogg`) for local paths and URLs. For `mp3`, `wav`, or other non-Opus audio, convert to `.opus` before using `audio`, or use `file` to send the original audio as an attachment.

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `message_id` | Yes | ID of the message being replied to (`om_xxx`) |
| `msg_type` | No | Message type (default `text`). If you use `text` / `markdown` / media parameters, the effective type is inferred automatically. Explicitly setting a conflicting `msg_type` fails validation |
| `content` | One content option | Exact reply content as JSON. The JSON must match the effective `msg_type` |
| `text` | One content option | Plain text reply. Use when exact text and formatting preservation matter |
| `markdown` | One content option | Best default for lightweight formatted replies such as headings, lists, links, summaries, and investigation notes. Internally converted to `post` JSON with Feishu-specific normalization |
| `image` | One content option | Cwd-relative local image path, URL, or `image_key` (`img_xxx`) |
| `file` | One content option | Cwd-relative local file path, URL, or `file_key` (`file_xxx`) |
| `video` | One content option | Cwd-relative local video path, URL, or `file_key` (`file_xxx`); **must be used together with `video_cover`** |
| `video_cover` | **Required with `video`** | Cwd-relative local cover image path, URL, or `image_key` (`img_xxx`) |
| `audio` | One content option | Voice-message audio key, URL, or cwd-relative local path. Local paths and URLs must be Opus (`.opus` or Ogg Opus `.ogg`) |
| `reply_in_thread` | No | Reply inside the thread. The reply appears in the target message's thread instead of the main chat stream |
| `idempotency_key` | No | Idempotency key, max 50 characters; the same key sends only one reply within 1 hour |

> **Mutual exclusivity rule:** `text`, `markdown`, `content`, and `image`/`file`/`video`/`audio` cannot be used together. Media parameters are also mutually exclusive with each other.
>
> **Video cover rule:** `video` **must** be accompanied by `video_cover`. Omitting `video_cover` when using `video` will fail validation. `video_cover` cannot be used without `video`.

## Common Mistakes

- Choosing `text` for headings, lists, links, summaries, or investigation notes. Use `markdown`.
- Choosing `markdown` when you actually need exact plain text. If exact line breaks, spacing, logs, code, or literal Markdown characters matter, use `text`.
- Assuming `markdown` supports every Markdown feature. It is converted into a Feishu `post` payload and normalized first.
- Putting local image paths inside Markdown like `![x](./a.png)`. `markdown` does not auto-upload those paths.
- **Using local file paths inside Markdown image syntax** (e.g. `![x](./a.png)`) with `markdown`. Local paths are not auto-uploaded and will not render as an image. Pre-upload via `images.create` to get an `image_key` instead.
- Using `content` without making the JSON match the effective `msg_type`.
- Explicitly setting `msg_type` to something that conflicts with `text`, `markdown`, or media parameters.
- Mixing `text`, `markdown`, or `content` with media parameters in one command.

## Return Value

```json
{
  "message_id": "om_xxx",
  "chat_id": "oc_xxx",
  "create_time": "1234567890"
}
```

## Usage Scenarios

### Scenario 1: Reply in the main chat stream

```
lark_im_messages_reply(message_id="om_xxx", text="OK, I will handle it")
```

The reply appears in the main chat stream and references the target message.

### Scenario 2: Reply inside a thread

```
lark_im_messages_reply(message_id="om_xxx", text="Let me take a look at this", reply_in_thread=true)
```

The reply appears in the target message's thread and does not show up in the main chat stream.

## @Mention Format

The `<at>` syntax differs by message type. The tool only normalizes mentions for `text` and `post`; `interactive` card content is passed through verbatim, so cards must use the card-native syntax below.

### `text`

- `<at user_id="ou_xxx">name</at>` — the inner text is the mentioned user's display name and is optional (`<at user_id="ou_xxx"></at>` also works)
- @all: `<at user_id="all"></at>`

### `post`

- Inside a `text` or `md` element, the same inline form as `text` works: `<at user_id="ou_xxx">name</at>`
- Or use a dedicated `at` element node: `{"tag":"at","user_id":"ou_xxx"}` (use `"all"` to mention everyone)

### `interactive` (card)

Card content is **not** normalized — use the card-native `<at>` syntax inside a `lark_md` / `markdown` element:

- single user by open_id: `<at id=ou_xxx></at>`
- multiple users: `<at ids=ou_xxx1,ou_xxx2></at>`
- by email: `<at email=user@example.com></at>`

## Notes

- `message_id` must be a valid message ID in `om_xxx` format
- `content` must be valid JSON
- When using `content`, you are responsible for making the JSON structure match the effective `msg_type`
- `reply_in_thread=true` adds `reply_in_thread=true` to the API request
- `reply_in_thread` is mainly meaningful in chats that support thread replies
- `image`/`file`/`video`/`audio`/`video_cover` support existing keys, URLs, and cwd-relative local file paths; the tool uploads local paths and URLs first, then sends the reply
- If the provided media value starts with `img_` or `file_`, it is treated as an existing key and used directly
- `markdown` always sends `msg_type=post`
- If you explicitly set `msg_type` and it conflicts with the chosen content parameter, validation fails
- When using `video`, `video_cover` is required as the video cover
- Failures return error codes and messages
- User identity uses a user access token (UAT) and requires the `im:message.send_as_user` and `im:message` scopes; the reply is sent as the authorized end user
- Bot identity uses a tenant access token (TAT), and requires the `im:message:send_as_bot` scope
- When using `markdown` with images, pre-uploading via `images.create` to obtain an `image_key` is recommended for reliability; remote URLs may be auto-resolved at runtime, but if download/upload fails the image is removed with a warning; local paths are not supported
- **Interactive cards are gated:** you MUST read and follow the `lark_get_skill(domain="im", section="card/lark-im-card-create")` workflow to produce the card JSON *before* replying. Do not hand-write or copy a card payload — the JSON given to `msg_type="interactive"` + `content` must be the workflow's output. This applies every time, with no exception

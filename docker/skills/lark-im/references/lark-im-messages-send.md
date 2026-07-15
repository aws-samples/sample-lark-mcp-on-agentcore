# im +messages-send

Send a message to a group chat or a direct message conversation. Supports both user identity and bot identity.

This tool maps to: `lark_im_messages_send` (internally calls `POST /open-apis/im/v1/messages`).

## Safety Constraints

Messages sent by this tool are visible to other people. Before calling it, you **must** confirm with the user:

1. The recipient (which person or which group)
2. The message content
3. The sending identity (user or bot)

**Do not** send messages without explicit user approval.

When using bot identity, the message is sent in the app's name, so make sure the app has already been added to the target chat.

When using user identity, the message is sent as the authorized end user and requires the `im:message.send_as_user` and `im:message` scopes.

## Choose The Right Content Parameter

### Default Selection Rule For Agents

- Prefer `markdown` for headings, lists, links, summaries, reports, or Markdown-looking content.
- Use `text` for exact plain text: logs, code, indentation-sensitive text, or literal Markdown.
- Use `content` for exact `post` JSON, titles, multiple locales, cards, or unsupported structures.

| Need | Recommended parameter | Why |
|------|------|------|
| Send headings, lists, links, summaries, or reports | `markdown` | Best default for lightweight formatting; converted to Feishu `post` JSON |
| Send plain text exactly as written | `text` | Preserves literal text; no Markdown conversion |
| Precisely control the final payload | `content` | You provide the exact JSON for `text` / `post` / `interactive` / `share_*` / media payloads |
| Send image / file / video / audio | `image` / `file` / `video` / `audio` | Shortcut uploads URLs, or cwd-relative local files automatically |

### `text` vs `markdown`

- Use `markdown` for lightweight formatted messages.
- Use `text` for exact plain text, especially logs, code, indentation, or Markdown characters that should **not** render.
- Use `content` when `markdown` is not enough, especially if you need exact `post` JSON, a title, multiple locales, cards, or unsupported rich structures.

## What `markdown` Really Does

`markdown` accepts Markdown-like input and converts it to the Feishu `post` payload required by the message API.

The tool does all of the following before sending:

1. Forces `msg_type=post`
2. Resolves remote Markdown images like `![x](https://...)` by downloading and uploading them first
3. Normalizes the Markdown for Feishu post rendering
4. Wraps the result as:

```json
{"zh_cn":{"content":[[{"tag":"md","text":"..."}]]}}
```

This makes `markdown` the simplest path for lightweight formatted messages.

### Markdown Boundaries

- It does **not** promise full CommonMark / GitHub Flavored Markdown support.
- It always becomes a `post` payload with a single `zh_cn` locale.
- It does **not** let you set a `post` title. If you need a title, use `msg_type="post"` with `content=...`.
- Headings are rewritten:
    - `# Title` becomes `#### Title`
    - `##` to `######` are normalized to `#####` when the content contains H1-H3
- Consecutive headings are separated with blank lines after heading normalization.
- Block spacing and line breaks may be normalized during conversion.
- Code blocks are preserved as code blocks.
- Excess blank lines are compressed.
- Already-uploaded `img_xxx` image keys are the most reliable Markdown image input.
- Local paths in Markdown image syntax like `![x](./a.png)` are **not** supported and will not be auto-uploaded.
- Remote URLs (`https://...`) will be auto-downloaded and uploaded at runtime; if the download or upload fails, the image is removed with a warning.

If you need a title, multiple locales, cards, unsupported rich structures, or byte-for-byte post JSON control, use `content` and provide the final JSON yourself.

### Image Constraint for `markdown`

When using `markdown` with images, prefer pre-uploading via `images.create` and referencing `![alt](img_xxx)` for predictable results. Remote URLs may work but are not guaranteed.

**Steps:**

```
# 1. Upload image to get image_key (bot identity required)
lark_invoke(tool_name="lark_im_images_create", args={data: {"image_type": "message"}, file: "./diagram.png"})
# Returns: {"image_key":"img_v3_xxxx"}

# 2. Use image_key in markdown
lark_im_messages_send(chat_id="oc_xxx", markdown="## Report\n\n![diagram](img_v3_xxxx)\n\nSee above for details.")
```

## Preserving Formatting

If the message has multiple lines, indentation, code blocks, tabs, or many quotes/backslashes, prefer writing `\n` explicitly with literal newlines for either `markdown` or `text`.

### When formatting must be preserved

Use `text`:

```
lark_im_messages_send(chat_id="oc_xxx", text="Build failed\nBranch: feature/im-docs\nAction: please check logs")
```

```
lark_im_messages_send(chat_id="oc_xxx", text="```bash\nmake test\nmake lint\n```")
```

Use this path when you want the receiver to see the text exactly as entered, not a converted Markdown post.

## Commands

```
# Send a formatted update
lark_im_messages_send(chat_id="oc_xxx", markdown="## Update\n\n- item 1\n- item 2")

# Send a plain one-line message
lark_im_messages_send(chat_id="oc_xxx", text="Hello")

# Equivalent manual JSON
lark_im_messages_send(chat_id="oc_xxx", content="{\"text\":\"Hello\"}")

# Send to a direct message (pass open_id)
lark_im_messages_send(user_id="ou_xxx", text="Hello")

# Send multi-line text while preserving formatting
lark_im_messages_send(chat_id="oc_xxx", text="Line 1\nLine 2\n  indented line")

# Send Markdown with an image (must pre-upload via images.create)
lark_invoke(tool_name="lark_im_images_create", args={data: {"image_type": "message"}, file: "./screenshot.png"})
# Use the returned image_key in the markdown content
lark_im_messages_send(chat_id="oc_xxx", markdown="## Status\n\n![screenshot](img_v3_xxxx)\n\nDone.")

# If you need exact post structure, send JSON directly
lark_im_messages_send(chat_id="oc_xxx", msg_type="post", content="{\"zh_cn\":{\"title\":\"Title\",\"content\":[[{\"tag\":\"text\",\"text\":\"Body\"}]]}}")

# Send a local image (uploaded automatically before sending)
lark_im_messages_send(chat_id="oc_xxx", image="./photo.png")

# Or send directly with an existing image_key
lark_im_messages_send(chat_id="oc_xxx", image="img_xxx")

# Send a local file (uploaded automatically before sending)
lark_im_messages_send(chat_id="oc_xxx", file="./report.pdf")

# Send a video (video_cover is required as the cover)
lark_im_messages_send(chat_id="oc_xxx", video="./demo.mp4", video_cover="./cover.png")
lark_im_messages_send(chat_id="oc_xxx", video="./demo.mp4", video_cover="img_xxx")

# Send a voice message
lark_im_messages_send(chat_id="oc_xxx", audio="./voice.opus")

# Use an idempotency key (same key sends only once within 1 hour)
lark_im_messages_send(chat_id="oc_xxx", text="Hello", idempotency_key="my-unique-id")

# ===== Interactive Card =====
# 🚫 STOP — before constructing ANY interactive card JSON, you MUST call
#    lark_get_skill(domain="im", section="card/lark-im-card-create") and follow
#    its workflow. Do NOT hand-write or copy a card payload from the examples
#    below. The JSON passed to content must be the OUTPUT of that workflow.
#    This is non-negotiable.

# Once the workflow has produced the card JSON, send it:
lark_im_messages_send(chat_id="oc_xxx", msg_type="interactive", content="<card_json_from_workflow>")
```

## Media Input Rules

- Media parameters accept an existing key (`img_xxx` / `file_xxx`), an `http://` or `https://` URL, or a local file path.
- Local paths must be relative to the current working directory and stay within it after resolving `..` and symlinks.
- Absolute paths such as `/tmp/photo.png` are rejected. Run the command from the file's directory and pass `./photo.png`, or copy the file into the current directory first.
- `audio` sends a voice message and accepts only Opus audio (`.opus` or Ogg Opus `.ogg`) for local paths and URLs. For `mp3`, `wav`, or other non-Opus audio, convert to `.opus` before using `audio`, or use `file` to send the original audio as an attachment.

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `chat_id` | One of two | Group chat ID (`oc_xxx`) |
| `user_id` | One of two | User open_id (`ou_xxx`) for direct messages |
| `text` | One content option | Plain text message. Use when exact text and formatting preservation matter. Automatically wrapped as `{"text":"..."}` |
| `markdown` | One content option | Best default for lightweight formatted messages such as headings, lists, links, summaries, and reports. Internally converted to `post` JSON with Feishu-specific normalization |
| `content` | One content option | Exact message content JSON string; use this when you need full control over `msg_type` and payload. The JSON must match the effective `msg_type` |
| `image` | One content option | Cwd-relative local image path, URL, or `image_key` (`img_xxx`). Local paths and URLs are uploaded automatically |
| `file` | One content option | Cwd-relative local file path, URL, or `file_key` (`file_xxx`). Local paths and URLs are uploaded automatically |
| `video` | One content option | Cwd-relative local video path, URL, or `file_key` (`file_xxx`). Local paths and URLs are uploaded automatically. **Must be paired with `video_cover`** |
| `video_cover` | **Required with `video`** | Cwd-relative local cover image path, URL, or `image_key` (`img_xxx`). Local paths and URLs are uploaded automatically |
| `audio` | One content option | Voice-message audio key, URL, or cwd-relative local path. Local paths and URLs must be Opus (`.opus` or Ogg Opus `.ogg`) |
| `msg_type` | No | Message type (default `text`). If you use `text` / `markdown` / media parameters, the effective type is inferred automatically. Explicitly setting a conflicting `msg_type` fails validation |
| `idempotency_key` | No | Idempotency key, max 50 characters; the same key sends only one message within 1 hour |

> **Mutual exclusivity rule:** `text`, `markdown`, `content`, and `image`/`file`/`video`/`audio` cannot be used together. Media parameters are also mutually exclusive with each other.
>
> **Video cover rule:** `video` **must** be accompanied by `video_cover`. Omitting `video_cover` when using `video` will fail validation. `video_cover` cannot be used without `video`.

## Common Mistakes

- Choosing `text` for headings, lists, links, summaries, or reports. Use `markdown`.
- Choosing `markdown` when you actually need exact plain text. If exact line breaks, spacing, logs, code, or literal Markdown characters matter, use `text`.
- Assuming `markdown` supports every Markdown feature. It is converted into a Feishu `post` payload and normalized first.
- Putting local image paths inside Markdown like `![x](./a.png)`. `markdown` does not auto-upload those paths.
- **Using local file paths inside Markdown image syntax** (e.g. `![x](./a.png)`) with `markdown`. Local paths are not auto-uploaded and will not render as an image. Pre-upload via `images.create` to get an `image_key` instead.
- Using `content` without making the JSON match the effective `msg_type`.
- Explicitly setting `msg_type` to something that conflicts with `text`, `markdown`, or media parameters.
- Mixing `text`, `markdown`, or `content` with media parameters in one command.

## `content` Format Reference

| `msg_type` | Example `content` |
|----------|-------------|
| `text` | `{"text":"Hello <at user_id=\"ou_xxx\">name</at>"}` |
| `post` | `{"zh_cn":{"title":"Title","content":[[{"tag":"text","text":"Body"}]]}}` |
| `image` | `{"image_key":"img_xxx"}` |
| `file` | `{"file_key":"file_xxx"}` |
| `audio` | `{"file_key":"file_xxx"}` |
| `media` | `{"file_key":"file_xxx","image_key":"img_xxx"}` (video; `image_key` is the cover from `video_cover` — **required**) |
| `share_chat` | `{"chat_id":"oc_xxx"}` |
| `share_user` | `{"user_id":"ou_xxx"}` |
| `interactive` | Card JSON — **MUST** be produced by the `lark_get_skill(domain="im", section="card/lark-im-card-create")` workflow. Read it before writing any card; never hand-craft the JSON here |

> **`post` vs `interactive`:** `post` is a static rich-text message (title, paragraphs, @mentions, links, inline images) — content is fixed once sent. `interactive` is a card with structured layout and UI components (buttons, forms, selects, date pickers, charts) — content can be updated after sending and supports user-action callbacks. Use `post` for read-only content; use `interactive` when the message needs user interaction or dynamic updates.

`interactive` cards support callback events (`card.action.trigger`). ⚠️ Card callbacks require bot identity and are not available via the MCP server (user-identity only) — see `lark_get_skill(domain="im", section="card-action-reply")`.

## Return Value

```json
{
  "message_id": "om_xxx",
  "chat_id": "oc_xxx",
  "create_time": "1234567890"
}
```

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

- `chat_id` and `user_id` are mutually exclusive; you must provide exactly one
- `content` must be valid JSON
- When using `content`, you are responsible for making the JSON structure match the effective `msg_type`
- `image`/`file`/`video`/`audio` support existing keys, URLs, and cwd-relative local file paths; the tool uploads local paths and URLs first, then sends the message
- If the provided media value starts with `img_` or `file_`, it is treated as an existing key and used directly
- `markdown` always sends `msg_type=post`, even if you do not explicitly set `msg_type="post"`
- If you explicitly set `msg_type` and it conflicts with the chosen content parameter, validation fails
- When using `video`, `video_cover` is required as the video cover
- Failures return an error code and message
- User identity uses a user access token (UAT) and requires the `im:message.send_as_user` and `im:message` scopes; the message is sent as the authorized end user
- Bot identity uses a tenant access token (TAT) and requires the `im:message:send_as_bot` scope
- When sending as a bot, the app must already be in the target group or already have a direct-message relationship with the target user
- When using `markdown` with images, pre-uploading via `images.create` to obtain an `image_key` is recommended for reliability; remote URLs may be auto-resolved at runtime, but if download/upload fails the image is removed with a warning; local paths are not supported
- **Interactive cards are gated:** you MUST read and follow the `lark_get_skill(domain="im", section="card/lark-im-card-create")` workflow to produce the card JSON *before* sending. Do not hand-write or copy a card payload — the JSON given to `msg_type="interactive"` + `content` must be the workflow's output. This applies every time, with no exception

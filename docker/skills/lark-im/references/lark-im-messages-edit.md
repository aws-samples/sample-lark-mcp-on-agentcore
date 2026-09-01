# im messages-edit

> ⚠️ **This operation requires bot identity and is not available via the MCP server.**
> The message-edit API does not accept user tokens (`im:message:send_as_bot` is bot-only and
> cannot be granted through user OAuth, so this project's scope map records none for it),
> and the MCP server always calls with user identity — the server rejects the call
> with `user access token not support`. Treat everything below as reference for the message
> shape and edit semantics, **not** as a callable operation. To rewrite content the caller can
> actually change, recall and re-send instead (`messages.delete` via `lark_invoke` +
> `lark_im_messages_send`), or update an `interactive` card via `messages.patch`
> (`lark_invoke` with `tool_name="lark_im_messages_patch"`).

Edit an already-sent message's content. **Bot identity only.** Only messages the bot sent can
be edited.

This reference documents an upstream capability (internally a PUT on the message edit
endpoint). Because the shortcut accepts bot identity only, it is **absent from the MCP server's
tool catalog** — there is no tool name to call, and any attempt fails as "tool does not exist".

## Safety Constraints

Editing rewrites a message visible to other people. Before calling it, you **must** confirm with the user:

1. Which message to edit (its `message_id`)
2. The new content

The bot must be the original sender — editing another identity's message fails. Identity is
always the bot: user identity is rejected server-side (`user access token not support`), which
is why this operation is unavailable through the MCP server.

**Do not** edit a message without explicit user approval.

## Choose The Right Content Parameter

| Need | Recommended parameter | Why |
|------|------|------|
| Edit to headings, lists, links, summaries, or Markdown-looking content | `markdown` | Best default for lightweight formatting; converted to Feishu `post` JSON |
| Edit to exact plain text | `text` | Preserves literal text; no Markdown conversion |
| Precisely control the new payload | `content` | You provide the exact JSON for `text` / `post` |
| Attach files/folders to the edited message's attachment zone | `set_attachments` | Array of bare `file_key` values (`file_xxx`), one element per file; **replaces** the post content's `files` array (the array you pass is the final list, discarding any `files` in `content`). Requires a post message (`markdown` or `msg_type="post"`). Name/metadata are filled by the server, not the client |
| Clear the edited message's attachment zone | `clear_attachments` | Sets `files:[]` on the post content. Requires a post message; mutually exclusive with `set_attachments` |
| Keep the existing attachment zone while rewriting the body | *(no attachment parameter)* | **Default.** Editing with only `markdown` / `text` / `content` leaves the current `files` array untouched — a body-only edit never drops attachments |

## Editing the Attachment Zone

`post` messages can carry an attachment zone — a top-level `files` array that renders files/folders under the rich-text body.

**Default: no attachment parameter preserves the attachment zone.** Editing with only
`markdown` / `text` / `content` (i.e. passing neither `set_attachments` nor
`clear_attachments`) rewrites the body and keeps the existing `files` array unchanged. This is
the safe default — fixing a typo must not drop the files you attached. Only pass
`set_attachments` to replace the zone, or `clear_attachments` to remove it.

To edit a message so it attaches (or re-attaches) files, the upstream request carries the message
id, the new `markdown` body, and a `set_attachments` list of bare file/folder keys. Shape only —
there is no MCP tool to call.

- `set_attachments` is an **array**, one bare file/folder key (`file_xxx`) per element.
- **`set_attachments` is a replace, not an append:** the array you pass becomes the final `files` array. Send/reply's `attachment` merges; edit's `set_attachments` replaces.
- **Mutually exclusive with `content` carrying files:** when `content` already contains a `files` array, `set_attachments` and `clear_attachments` are rejected — declare the attachment zone either via `content` or via the attachment parameters, not both. Use `markdown` (which never emits a `files` array) or a `content` without `files` together with the attachment parameters.
- The server fills name/size/mime/is_folder from file service metadata; the client does not (and cannot) override the display name.
- When `set_attachments` is present the effective `msg_type` is forced to `post`. Pair it with `markdown` (or `content` with post JSON plus `msg_type="post"`); `text` cannot carry an attachment zone.
- The edited content replaces the whole message content, so include every file you want to keep in the new attachment zone.

To **clear** the attachment zone entirely, the upstream request carries `clear_attachments`
instead of `set_attachments`:

- `clear_attachments` sets the post content's `files` array to `[]`, telling the server to remove all file/folder attachments.
- It cannot be used together with `set_attachments`.
- Like `set_attachments`, it forces the effective `msg_type` to `post`, so pair it with `markdown` or `msg_type="post"` + post-JSON `content`.

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `message_id` | Yes | Message ID (`om_xxx`) to edit |
| `text` | One content option | Plain text content |
| `markdown` | One content option | Markdown text, converted to `post` JSON |
| `content` | One content option | Exact message content JSON; must match the effective `msg_type` |
| `set_attachments` | One content option | Array of bare file/folder keys (`file_xxx`), one element per value; **replaces** the post attachment zone — the array becomes the final `files` array, discarding any `files` written in `content`, and duplicate keys are sent once. Name/size/mime/is_folder are filled by the server |
| `clear_attachments` | One content option | Boolean; clear the post attachment zone by setting `files:[]` |
| `msg_type` | No | Message type (default `text`). When `markdown` / `set_attachments` / `clear_attachments` is used the effective type is inferred automatically |

## Return Value

```json
{
  "message_id": "om_xxx",
  "chat_id": "oc_xxx",
  "update_time": "1234567890"
}
```

## Common Mistakes

- Calling this at all from the MCP server — it is bot-only and the call is rejected with `user access token not support`.
- Editing a message the calling identity did not send — the API rejects it.
- Using `set_attachments` with `text`. The attachment zone only exists on `post` messages; use `markdown` or `msg_type="post"`.
- Supplying only the files you want to keep, then losing the text. Editing replaces the entire content; pass the full new content (text + attachments) in one call.
- Assuming a body-only edit clears the attachment zone. It does not — without `set_attachments` / `clear_attachments` the existing attachments are preserved.

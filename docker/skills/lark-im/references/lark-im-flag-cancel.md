# im +flag-cancel

This tool maps to: `lark_im_flag_cancel`. Underlying API: `POST /open-apis/im/v1/flags/cancel`.

## Double-Cancel Behavior (Important)

A message can have flags on both layers simultaneously:
- Message layer: `(default, message)`
- Feed layer: `(thread, feed)` or `(msg_thread, feed)` depending on chat type

**When no `flag_type` is specified, the tool performs best-effort double-cancel**: the message-layer flag is always removed; the feed-layer flag is also removed when the chat type can be determined (otherwise a warning is printed on stderr and the feed layer is skipped). The server handles cancel requests for non-existent flags idempotently, so this is safe.

**Feed layer item_type is determined by chat_mode**:
- Topic-style chat (`chat_mode=topic`) -> `item_type=thread`
- Regular chat (`chat_mode=group`) -> `item_type=msg_thread`

## Commands

```
# Double-cancel both layers (recommended default)
lark_im_flag_cancel(message_id="om_xxx")

# Only cancel message layer
lark_im_flag_cancel(message_id="om_xxx", flag_type="message")

# Only cancel feed layer (need to specify item-type)
lark_im_flag_cancel(message_id="om_xxx", item_type="thread", flag_type="feed")
```

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `message_id` | Required | Message ID (`om_xxx`) |
| `flag_type` | No | `message` or `feed`; **when omitted, best-effort double-cancel of both layers** |
| `item_type` | No | `default|thread|msg_thread`; required when `flag_type="feed"` |

> Currently only supports user identity.

## Idempotency

The server doesn't return an error for cancel requests when the flag doesn't exist, so repeated cancel calls are idempotent.

## Permissions

- Required scopes: `im:feed.flag:write`, `im:message.group_msg:get_as_user`, `im:message.p2p_msg:get_as_user`, `im:chat:read`
- The message/chat read scopes are used by the default double-cancel path to auto-detect the feed-layer item type.

## Note

- **Do not call lark_im_flag_list for verification**: If the cancel API returns success, the flag is removed. Calling lark_im_flag_list to verify is expensive (requires full pagination) and unnecessary.

## Finding Message ID Efficiently

If you have message content but not the message ID:

1. **Use `lark_im_messages_search`** to find the message by content, then extract `message_id` from the result
2. **Do NOT use `lark_im_flag_list`** to find the message — it requires full pagination and is very inefficient

```
# Search by message content to find message_id
lark_im_messages_search(query="message content here")
```

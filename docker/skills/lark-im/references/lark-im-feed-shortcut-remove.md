# im +feed-shortcut-remove

This tool maps to: `lark_im_feed_shortcut_remove`. Underlying API: `POST /open-apis/im/v2/feed_shortcuts/remove`.

## What it does

Removes one or more chats from the **current user's** feed shortcuts.

- Only **CHAT-type** shortcuts are supported (`feed_card_id` must be an `oc_xxx`).
- Batch up to **10 chat IDs per call**.
- Currently only supports **user identity**.
- Removing a chat that is not currently in the shortcut list is idempotent success: the call returns `ok:true`, `failure_count=0`, and no `failed_shortcuts` entry for that chat.

## Commands

```
# Remove a single feed shortcut
lark_im_feed_shortcut_remove(chat_id="oc_xxx")

# Remove multiple feed shortcuts in one call
lark_im_feed_shortcut_remove(chat_id="oc_a,oc_b")

# Preview the request
lark_im_feed_shortcut_remove(chat_id="oc_xxx", dry_run=true)
```

## Parameters

| Parameter | Required | Description |
|------|------|------|
| `chat_id` | yes | open_chat_id to remove from feed shortcuts; comma-separated for multiple; max 10 per call |

## Response

The response uses the same batch ledger as `lark_im_feed_shortcut_create`: `total`, `success_count`, `failure_count`, `succeeded_shortcuts`, and `failed_shortcuts`. A non-empty `failed_shortcuts` is a partial failure: stdout carries `ok:false` with the full ledger.

## Permissions

- Required scope: `im:feed.shortcut:write`
- Only available with user identity.

## Note

- To see what is currently in the shortcut list before removing, run `lark_im_feed_shortcut_list`. Use `no_detail=true` when you only need the `feed_card_id` values.

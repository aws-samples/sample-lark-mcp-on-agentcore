# mail message-modify

`lark_mail_message_modify` is the preferred tool for changing labels, read-state labels, or folder placement on existing messages.

Use it instead of raw `user_mailbox.messages batch_modify` when the operation targets concrete `message_id` values from `lark_mail_triage`, `lark_mail_message`, or `lark_mail_messages`.

## Common Commands

```
lark_mail_message_modify(message_ids="<id1>,<id2>", add_label_ids="unread")
lark_mail_message_modify(message_ids="<id>", remove_label_ids="FLAGGED")
lark_mail_message_modify(message_ids="<id>", add_folder="archive")
lark_mail_message_modify(mailbox="shared@example.com", message_ids="<id>", add_folder="folder_xxx")
```

## Parameters

| Parameter | Required | Notes |
| --- | --- | --- |
| `mailbox` | No | Mailbox that owns the messages. Defaults to `me`. |
| `message_ids` | Yes | Supports comma-separated values. |
| `add_label_ids` | No | Adds labels. System labels `unread`, `important`, `other`, `flagged` normalize to upper case. |
| `remove_label_ids` | No | Removes labels. Cannot overlap with `add_label_ids`. |
| `add_folder` | No | Moves to one folder. `inbox`, `sent`, `spam`, `archive`, `archived` normalize to system folder IDs. |

`TRASH` is intentionally rejected by this tool. Use `lark_mail_message_trash(message_ids="<id>", _confirm=true)` for soft deletion.

## Behavior

- Message IDs are locally validated, de-duplicated in first-seen order, and sent in batches of 20.
- Custom label IDs are checked with `labels.get`; custom folder IDs are checked with `folders.get`.
- If no label or folder operation is requested, the command succeeds locally, emits all message IDs as `success_message_ids`, and makes no POST request.
- Single batch POST failures mark every message in that batch with the same failure reason; later batches still run.
- JSON output is intentionally compact:

```json
{
  "success_message_ids": ["id1"],
  "failed_message_ids": [
    {"message_id": "id2", "reason": "api error"}
  ]
}
```

## When Raw API Is Still Appropriate

Use raw `mail user_mailbox.messages batch_modify` (via `lark_invoke(tool_name="lark_mail_user_mailbox_messages_batch_modify", ...)`) only when you need a request shape that the tool intentionally does not expose, or when reproducing backend/API behavior exactly for diagnostics.

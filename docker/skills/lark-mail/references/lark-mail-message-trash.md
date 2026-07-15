# mail message-trash

`lark_mail_message_trash` is the preferred tool for soft-deleting existing messages.

Use it after obtaining real `message_id` values from `lark_mail_triage`, `lark_mail_message`, or `lark_mail_messages`, and after the user has confirmed the deletion preview.

本工具被标记为 `high-risk-write`，需要 `_confirm=true` 才执行；仅在用户明确确认删除预览后附上。

## Common Commands

```
lark_mail_message_trash(message_ids="<id1>,<id2>", _confirm=true)
lark_mail_message_trash(mailbox="shared@example.com", message_ids="<id>", _confirm=true)
```

## Parameters

| Parameter | Required | Notes |
| --- | --- | --- |
| `mailbox` | No | Mailbox that owns the messages. Defaults to `me`. |
| `message_ids` | Yes | Supports comma-separated values. |
| `_confirm` | Yes for execution | Required by the high-risk write confirmation framework. Add only after the user confirms. |

## Behavior

- Message IDs are locally validated, de-duplicated in first-seen order, and sent in batches of 20.
- The tool calls `POST /open-apis/mail/v1/user_mailboxes/<mailbox>/messages/batch_trash` sequentially.
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

Use raw `mail user_mailbox.messages batch_trash` (via `lark_invoke(tool_name="lark_mail_user_mailbox_messages_batch_trash", ...)`) only when reproducing backend/API behavior exactly for diagnostics. For normal soft deletion, prefer this tool because it handles validation, batching, compact output, and `_confirm` confirmation consistently.

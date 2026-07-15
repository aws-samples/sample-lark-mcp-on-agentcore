# mail sent_messages recall

撤回已发送邮件，并查询异步撤回结果。

## 何时使用

发送成功后，若发送响应中包含 `recall_available: true`，说明该邮件支持撤回（通常为 24 小时内已投递的邮件）。

- 只有用户明确要求撤回时才执行。
- 若响应中无 `recall_available` 字段，不要主动提及撤回。
- 定时发送中、尚未真正发出的邮件不能用撤回；应使用 `lark_invoke(tool_name="lark_mail_user_mailbox_drafts_cancel_scheduled_send", ...)` 取消定时发送。
- 撤回是异步操作，`recall` 返回成功只表示请求已受理，实际结果必须通过 `get_recall_detail` 查询。

## 命令

```
# 发起撤回
lark_invoke(tool_name="lark_mail_user_mailbox_sent_messages_recall", args={params: {"user_mailbox_id": "me", "message_id": "<message_id>"}})

# 查询撤回进度
lark_invoke(tool_name="lark_mail_user_mailbox_sent_messages_get_recall_detail", args={params: {"user_mailbox_id": "me", "message_id": "<message_id>"}})
```

## 返回值解读

`recall` 返回：

- `recall_status: available` — 撤回请求已受理，稍后查询进度。
- `recall_status: unavailable` — 不可撤回，查看 `recall_restriction_reason`。

`get_recall_detail` 返回：

- `recall_status: in_progress` — 撤回进行中，可稍后再查。
- `recall_status: done` — 撤回完成，查看 `recall_result` 和每个收件人的详情。

具体字段和枚举以 schema 为准：

```
lark_discover(query="mail.user_mailbox.sent_messages.get_recall_detail")
```

## 典型流程

```
# 1. 发送结果中确认可撤回
# data.recall_available == true

# 2. 用户确认要撤回后发起
lark_invoke(tool_name="lark_mail_user_mailbox_sent_messages_recall", args={params: {"user_mailbox_id": "me", "message_id": "<message_id>"}})

# 3. 查询最终结果
lark_invoke(tool_name="lark_mail_user_mailbox_sent_messages_get_recall_detail", args={params: {"user_mailbox_id": "me", "message_id": "<message_id>"}})
```

## 相关命令

- `lark_mail_send(confirm_send=true)` — 发送新邮件，响应中可能包含 `recall_available`。
- `lark_mail_reply(confirm_send=true)` — 发送回复，响应中可能包含 `recall_available`。
- `lark_mail_forward(confirm_send=true)` — 发送转发，响应中可能包含 `recall_available`。
- `lark_invoke(tool_name="lark_mail_user_mailbox_messages_send_status", ...)` — 查询发送投递状态。

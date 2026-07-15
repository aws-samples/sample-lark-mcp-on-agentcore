# mail send_as

使用公共邮箱或别名发信。适用于 `lark_mail_send` / `lark_mail_draft_create` / `lark_mail_reply` / `lark_mail_reply_all` / `lark_mail_forward` 等发信类工具。

## 参数含义

- `mailbox` 指定邮件归属邮箱（如 `shared@example.com` 或 `me`），可通过 `accessible_mailboxes` 查询可用值。
- `from` 指定 EML From 头里的发件人地址（别名、邮件组等），可通过 `send_as` 查询可用值。
- 不使用公共邮箱或别名时无需指定 `mailbox`，行为与默认发信一致。

## 查询可用邮箱和发信地址

```
# 查询可访问的邮箱（主邮箱 + 公共邮箱）
lark_invoke(tool_name="lark_mail_user_mailboxes_accessible_mailboxes", args={params: {"user_mailbox_id": "me"}})

# 查询某个邮箱的可用发信地址（主地址、别名、邮件组）
lark_invoke(tool_name="lark_mail_user_mailbox_settings_send_as", args={params: {"user_mailbox_id": "me"}})
```

## 公共邮箱发信

```
# mailbox 指定公共邮箱，From 头自动使用该邮箱地址
lark_mail_send(mailbox="shared@example.com", to="bob@example.com", subject="通知", body="<p>你好</p>")
```

## 别名发信

```
# mailbox 指定所属邮箱，from 指定别名地址
lark_mail_send(mailbox="me", from="alias@example.com", to="bob@example.com", subject="测试", body="<p>你好</p>")
```

## 相关命令

- `lark_mail_send` — 新邮件发信。
- `lark_mail_draft_create` — 新建草稿。
- `lark_mail_reply` / `lark_mail_reply_all` — 回复邮件。
- `lark_mail_forward` — 转发邮件。

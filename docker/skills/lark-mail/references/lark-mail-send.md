# mail +send

发送新邮件，支持：
- 纯文本或 HTML 正文
- 抄送/密送
- 本地文件附件（`attach`）
- 内嵌图片（`inline`，CID 可用随机字符串）

本工具对应 MCP tool：`lark_mail_send`。

## CRITICAL — 发送工作流（必须遵循）

**CRITICAL - 编辑邮件内容前 MUST 先调用 `lark_get_skill(domain="mail", section="html")`，其中包含邮件书写规范**

此工具默认**只保存草稿**，不会发送邮件。需要发送时，有两种合规方式：

**方式 A（推荐）** — 先创建草稿，再确认发送：
```
lark_mail_send(to="<收件人>", subject="<主题>", body="<正文>")
```
→ 返回 `draft_id`

向用户展示邮件摘要（收件人、主题、正文预览）；如果用户想先看效果，可引导其去飞书邮件里打开该草稿查看详情。

用户明确同意后，发送该草稿：
```
lark_invoke(tool_name="lark_mail_user_mailbox_drafts_send", args={params: {"user_mailbox_id": "me", "draft_id": "<Step 1 返回的 draft_id>"}})
```

**方式 B（允许）** — 用户已经明确确认收件人和内容时，可直接使用 `confirm_send=true` 立即发送：
```
lark_mail_send(to="<收件人>", subject="<主题>", body="<正文>", confirm_send=true)
```

**禁止在用户未明确同意的情况下执行发送，无论是发送草稿还是直接使用 `confirm_send=true`。**

## 调用

```
# 保存为草稿（默认行为，不发送）— HTML 格式推荐
lark_mail_send(to="alice@example.com", subject="周报", body="<p>本周进展：</p><ul><li>完成 A 模块</li><li>修复 3 个 bug</li></ul>")

# 保存为草稿并抄送
lark_mail_send(to="alice@example.com", cc="bob@example.com", subject="状态更新", body="<b>已完成</b>")

# 确认发送（仅在用户明确确认后使用）
lark_mail_send(to="alice@example.com", subject="周报", body="<p>本周进展如下...</p>", confirm_send=true)

# 保存带附件的草稿
lark_mail_send(to="alice@example.com", subject="请查收", body="<p>见附件</p>", attach="./report.pdf,./logs.zip")

# 保存带内嵌图片的草稿（推荐：直接用相对路径，自动解析）
lark_mail_send(to="alice@example.com", subject="预览图", body="<img src=\"./logo.png\" />")

# 纯文本邮件（仅在内容极简时使用）
lark_mail_send(to="alice@example.com", subject="确认", body="收到，谢谢")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `to` | 是 | 收件人邮箱，多个用逗号分隔 |
| `subject` | 是 | 邮件主题 |
| `body` | 二选一 | 邮件正文。推荐使用 HTML 获得富文本排版；也支持纯文本（自动检测）。使用 `plain_text=true` 可强制纯文本模式。支持 `<img src="./local.png" />` 相对路径自动解析为内嵌图片（仅支持相对路径，不支持绝对路径）。与 `body_file` 互斥 |
| `body_file` | 二选一 | 从文件读取邮件正文 HTML（相对路径，仅限 cwd 子树）。与 `body` 互斥。文件大小上限 32 MB |
| `from` | 否 | 发件人邮箱地址（EML From 头）。使用别名（send_as）发信时，设为别名地址并配合 `mailbox` 指定所属邮箱。默认读取邮箱主地址 |
| `mailbox` | 否 | 邮箱地址，指定草稿所属的邮箱（默认回退到 `from`，再回退到 `me`）。当发件人（`from`）与邮箱不同时使用。可通过 `accessible_mailboxes` 查询可用邮箱 |
| `cc` | 否 | 抄送邮箱，多个用逗号分隔 |
| `bcc` | 否 | 密送邮箱，多个用逗号分隔 |
| `plain_text` | 否 | 强制纯文本模式，忽略 HTML 自动检测。不可与 `inline` 同时使用。纯文本模式下也会自动追加纯文本签名（HTML 签名经 `PlainTextFromHTML` 转换，内联图片丢弃） |
| `attach` | 否 | 附件文件路径，多个用逗号分隔。相对路径。当附件导致 EML 总大小超过 25 MB 时，超出部分自动上传为超大附件（HTML 邮件插入下载卡片，纯文本邮件追加下载链接），单个文件上限 3 GB |
| `inline` | 否 | 高级用法：手动指定内嵌图片 CID 映射。推荐直接在 `body` 中使用 `<img src="./path" />`（自动解析）。仅在需要精确控制 CID 命名时使用此参数。格式：`'[{"cid":"mycid","file_path":"./logo.png"}]'`，在 body 中用 `<img src="cid:mycid">` 引用。不可与 `plain_text` 同时使用 |
| `signature_id` | 否 | 签名 ID。附加邮箱签名到正文末尾。运行 `lark_mail_signature` 查看可用签名。与 `no_signature` 互斥 |
| `no_signature` | 否 | 跳过默认签名自动追加。与 `signature_id` 互斥，同时使用时返回参数校验错误（退出码 2） |
| `priority` | 否 | 邮件优先级：`high`、`normal`、`low`。省略或 `normal` 时不设置优先级 |
| `event_summary` | 否 | 日程标题。设置此参数即在邮件中嵌入日程邀请（text/calendar）。需同时设置 `event_start` 和 `event_end` |
| `event_start` | 条件必填 | 日程开始时间（ISO 8601，如 `2026-04-20T14:00+08:00`） |
| `event_end` | 条件必填 | 日程结束时间（ISO 8601） |
| `event_location` | 否 | 日程地点 |
| `confirm_send` | 否 | 确认发送邮件（默认只保存草稿）。仅在用户明确确认收件人和内容后使用 |
| `send_time` | 否 | 定时发送时间，Unix 时间戳（秒）。需至少为当前时间 + 5 分钟。配合 `confirm_send=true` 使用可定时发送邮件 |
| `request_receipt` | 否 | 请求已读回执（RFC 3798 Message Disposition Notification）。在出站 EML 里写 `Disposition-Notification-To: <sender>` 头。收件人的邮件客户端**可能**弹出提示询问是否回执、可能自动发送、也可能忽略——送达不保证 |

### 日程邀请约束

使用 `event_*` 时需满足以下条件：

- `event_summary`、`event_start`、`event_end` 必须同时出现或同时不出现
- 与 `send_time` 互斥，不可同时使用（日程邀请必须立即发送，否则收件人可能在日程开始后才收到）
- 不可与 `bcc` 同时使用：日程参会人（ATTENDEE）仅来自 To 和 Cc，Bcc 收件人不在参会人列表中、无法 RSVP，且该组合将导致邮件发送失败。需要邀请某人参加日程请用 `to` 或 `cc`；如只想告知而不邀请，请单独发一封无日程的邮件

## 返回值

**草稿模式（默认）：**

```json
{
  "ok": true,
  "data": {
    "draft_id": "草稿ID",
    "tip": "draft saved"
  }
}
```

**发送模式（`confirm_send=true`）：**

```json
{
  "ok": true,
  "data": {
    "message_id": "邮件ID",
    "thread_id": "会话ID"
  }
}
```

可选字段：

- `automation_send_disable_reason`：发送被邮箱自动化设置拦截时返回的原因
- `automation_send_disable_reference`：发送被拦截时的草稿打开链接
- `recall_available` / `recall_tip`：发送成功后若返回可撤回提示，按需参考 `lark_get_skill(domain="mail", section="recall")`

字段语义：

- 若返回中包含 `automation_send_disable_reason` / `automation_send_disable_reference`，说明邮件未真正发出，而是被邮箱设置拦截。此时应直接向用户展示原因和草稿打开链接，不要继续假设已经发送成功
- 若返回中包含 `recall_available: true`，说明该邮件支持撤回；仅当用户明确要求撤回时，读取 `lark_get_skill(domain="mail", section="recall")` 并执行撤回流程

## 发送后跟进

邮件发送后，分两种情况处理：

- 若返回中有 `automation_send_disable_reason` / `automation_send_disable_reference`：说明发送被邮箱设置拦截，应直接告诉用户原因并提供草稿打开链接，**不要**调用 `send_status`

### 立即发送（无 `send_time`）

若返回非空 `message_id`，调用：

```
lark_invoke(tool_name="lark_mail_user_mailbox_messages_send_status", args={params: {"user_mailbox_id": "me", "message_id": "<发送返回的 message_id>"}})
```

状态码：1=正在投递, 2=投递失败重试, 3=退信, 4=投递成功, 5=待审批, 6=审批拒绝。向用户简要报告各收件人投递结果，异常状态需重点提示。

### 定时发送（指定了 `send_time`）

定时发送不会立即产生 `message_id`，**不建议在定时发送后立即查询**。可在预定发送时间后再查询投递状态。

如需取消定时发送：

```
lark_invoke(tool_name="lark_mail_user_mailbox_drafts_cancel_scheduled_send", args={params: {"user_mailbox_id": "me", "draft_id": "<draft_id>"}})
```

**取消后邮件会变回草稿**，可继续编辑或在之后重新发送。

## 相关工具

- `lark_mail_reply` — 回复邮件
- `lark_mail_reply_all` — 回复全部
- `lark_mail_forward` — 转发邮件
- `lark_invoke(tool_name="lark_mail_user_mailbox_messages_list", ...)` — 列出邮件

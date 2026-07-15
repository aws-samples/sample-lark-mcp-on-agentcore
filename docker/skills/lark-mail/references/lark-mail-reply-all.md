# mail +reply-all

回复全部会自动处理：
- 自动聚合原邮件发件人、原 To、原 Cc
- 自动排除当前用户地址，避免回给自己
- 自动维护会话头（`In-Reply-To` / `References`）

> **默认草稿**：`lark_mail_reply_all` 默认保存为草稿，不会立即发送。如需立即发送，添加 `confirm_send=true` 参数（仅在用户明确确认后使用）。

本工具对应 MCP tool：`lark_mail_reply_all`。

## CRITICAL — 发送工作流（必须遵循）

**CRITICAL - 编辑邮件内容前 MUST 先调用 `lark_get_skill(domain="mail", section="html")`，其中包含邮件书写规范**

此工具默认**只保存草稿**，不会发送邮件。回复全部会发送给**所有**原始收件人，需要发送时有两种合规方式：

**方式 A（推荐）** — 创建回复全部草稿（不带 `confirm_send`）：
```
lark_mail_reply_all(message_id="<邮件ID>", body="<回复正文>")
```
→ 返回 `draft_id`

向用户展示回复摘要（目标邮件、回复内容、完整收件人列表 To/Cc）；如果用户想先看效果，可引导其去飞书邮件里查看草稿。

用户明确同意后，发送该草稿：
```
lark_invoke(tool_name="lark_mail_user_mailbox_drafts_send", args={params: {"user_mailbox_id": "me", "draft_id": "<Step 1 返回的 draft_id>"}})
```

**方式 B（允许）** — 用户已经明确确认完整收件人列表和内容时，可直接使用 `confirm_send=true` 立即发送。

**禁止在用户未明确同意的情况下执行发送，无论是发送草稿还是直接使用 `confirm_send=true`。**

## 调用

```
# 回复全部（默认保存为草稿）— HTML 推荐
lark_mail_reply_all(message_id="<邮件ID>", body="<p><b>已完成</b>，详见下方说明。</p>")

# 回复全部并追加收件人/抄送（草稿）
lark_mail_reply_all(message_id="<邮件ID>", body="<p>同步更新</p>", to="lead@example.com", cc="pm@example.com")

# 从回复名单中排除某些地址（草稿）
lark_mail_reply_all(message_id="<邮件ID>", body="<p>见上</p>", remove="bot@example.com,noreply@example.com")

# 回复全部时插入内嵌图片（推荐：直接用相对路径，自动解析）
lark_mail_reply_all(message_id="<邮件ID>", body="<p>详见图示：<img src=\"./logo.png\" /></p>")

# 纯文本回复全部（仅在内容极简时使用）
lark_mail_reply_all(message_id="<邮件ID>", body="收到，已处理。")

# 确认发送（用户明确确认后才可使用）
lark_mail_reply_all(message_id="<邮件ID>", body="<p>收到，已处理。</p>", confirm_send=true)
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `message_id` | 是 | 被回复的邮件 ID |
| `body` | 二选一 | 回复正文。推荐使用 HTML 获得富文本排版；也支持纯文本。根据回复正文和原邮件正文自动检测 HTML。使用 `plain_text=true` 可强制纯文本模式。支持 `<img src="./local.png" />` 相对路径自动解析为内嵌图片（仅支持相对路径，不支持绝对路径）。与 `body_file` 互斥 |
| `body_file` | 二选一 | 从文件读取回复正文 HTML（相对路径，仅限 cwd 子树）。与 `body` 互斥。文件大小上限 32 MB |
| `from` | 否 | 发件人邮箱地址（EML From 头）。使用别名（send_as）发信时，设为别名地址并配合 `mailbox` 指定所属邮箱。默认读取邮箱主地址 |
| `mailbox` | 否 | 邮箱地址，指定草稿所属的邮箱（默认回退到 `from`，再回退到 `me`）。当发件人（`from`）与邮箱不同时使用。可通过 `accessible_mailboxes` 查询可用邮箱 |
| `to` | 否 | 额外收件人，多个用逗号分隔（追加到自动聚合结果） |
| `cc` | 否 | 额外抄送，多个用逗号分隔 |
| `bcc` | 否 | 密送邮箱，多个用逗号分隔。与 `event_*` 不兼容（见 `lark_mail_send` 日程邀请约束） |
| `remove` | 否 | 从自动聚合结果中排除的邮箱，多个用逗号分隔 |
| `plain_text` | 否 | 强制纯文本模式，忽略所有 HTML 自动检测。不可与 `inline` 同时使用。纯文本模式下也会自动追加纯文本签名（HTML 签名经 `PlainTextFromHTML` 转换，内联图片丢弃） |
| `attach` | 否 | 附件文件路径，多个用逗号分隔。相对路径。当附件导致 EML 总大小超过 25 MB 时，超出部分自动上传为超大附件（HTML 邮件插入下载卡片，纯文本邮件追加下载链接），单个文件上限 3 GB |
| `inline` | 否 | 高级用法：手动指定内嵌图片 CID 映射。推荐直接在 `body` 中使用 `<img src="./path" />`（自动解析）。仅在需要精确控制 CID 命名时使用此参数。格式：`'[{"cid":"mycid","file_path":"./logo.png"}]'`，在 body 中用 `<img src="cid:mycid">` 引用。不可与 `plain_text` 同时使用 |
| `signature_id` | 否 | 签名 ID。附加邮箱签名到回复正文与引用块之间。运行 `lark_mail_signature` 查看可用签名。与 `no_signature` 互斥 |
| `no_signature` | 否 | 跳过默认签名自动追加。与 `signature_id` 互斥，同时使用时返回参数校验错误（退出码 2） |
| `priority` | 否 | 邮件优先级：`high`、`normal`、`low`。省略或 `normal` 时不设置优先级 |
| `event_summary` | 否 | 日程标题。设置此参数即在邮件中嵌入日程邀请。需同时设置 `event_start` 和 `event_end` |
| `event_start` | 条件必填 | 日程开始时间（ISO 8601） |
| `event_end` | 条件必填 | 日程结束时间（ISO 8601） |
| `event_location` | 否 | 日程地点 |
| `confirm_send` | 否 | 确认发送回复（默认只保存草稿）。仅在用户明确确认后使用 |
| `send_time` | 否 | 定时发送时间，Unix 时间戳（秒）。需至少为当前时间 + 5 分钟。配合 `confirm_send=true` 使用可定时发送邮件 |
| `request_receipt` | 否 | 请求已读回执（RFC 3798 Message Disposition Notification）。在出站 EML 里写 `Disposition-Notification-To: <sender>` 头。收件人的邮件客户端可能弹出提示、自动发送或忽略——送达不保证 |

## 返回值

默认（草稿模式）：
```json
{
  "ok": true,
  "data": {
    "draft_id": "草稿ID",
    "tip": "draft saved"
  }
}
```

`confirm_send=true` 模式：
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

- 若返回中包含 `automation_send_disable_reason` / `automation_send_disable_reference`，说明回复全部未真正发出，而是被邮箱设置拦截。此时应直接向用户展示原因和草稿打开链接，不要继续假设已经发送成功
- 若返回中包含 `recall_available: true`，说明该邮件支持撤回；仅当用户明确要求撤回时，读取 `lark_get_skill(domain="mail", section="recall")` 并执行撤回流程

## 典型场景

### 场景 1：用户说"帮我回复全部说同意"（只创建草稿）
```
lark_mail_reply_all(message_id="<邮件ID>", body="<p>同意，没有问题。</p>")
```
→ 返回 `draft_id`，告诉用户回复全部草稿已创建。

### 场景 2：用户说"回复全部说已确认"（需要发送）
```
# 方式 A: 创建回复全部草稿
lark_mail_reply_all(message_id="<邮件ID>", body="<p>已确认。</p>")
# → 返回 draft_id

# 向用户确认 "收件人 alice@, bob@, carol@，内容「已确认。」如果你想先看效果，也可以先去飞书邮件里查看草稿。确认发送吗？"

# 用户确认后发送
lark_invoke(tool_name="lark_mail_user_mailbox_drafts_send", args={params: {"user_mailbox_id": "me", "draft_id": "<draft_id>"}})

# 方式 B: 用户已明确确认时，直接发送
lark_mail_reply_all(message_id="<邮件ID>", body="<p>已确认。</p>", confirm_send=true)
```

## 实现说明

- 自动收件人规则：原发件人优先进入 To，原 To/Cc 进入 Cc。
- 地址会去重（大小写不敏感）。
- 自动排除当前用户地址（enterprise email），并叠加 `remove` 规则。
- 通过 raw EML 维护会话头并尽量复用原 `thread_id`。

## 发送后跟进

回复发送后，分两种情况处理：

- 若返回中有 `automation_send_disable_reason` / `automation_send_disable_reference`：说明发送被邮箱设置拦截，应直接告诉用户原因并提供草稿打开链接，**不要**调用 `send_status`
- 若用户基于发送结果要求撤回，先读取 `lark_get_skill(domain="mail", section="recall")`，再执行撤回流程

**1. 确认投递状态**（仅立即发送且返回非空 `message_id` 时必须）

用返回的 `message_id` 查询投递状态：

```
lark_invoke(tool_name="lark_mail_user_mailbox_messages_send_status", args={params: {"user_mailbox_id": "me", "message_id": "<发送返回的 message_id>"}})
```

状态码：1=正在投递, 2=投递失败重试, 3=退信, 4=投递成功, 5=待审批, 6=审批拒绝。向用户简要报告投递结果，异常状态需重点提示。

**2. 标记已读**（可选）— 询问用户是否需要将原邮件标记为已读。如果用户同意：

```
lark_mail_message_modify(message_ids="<原邮件ID>", remove_label_ids="UNREAD")
```

## 相关工具

- `lark_mail_reply` — 仅回复发件人
- `lark_mail_forward` — 转发邮件
- `lark_invoke(tool_name="lark_mail_user_mailbox_messages_get", ...)` — 查看邮件详情

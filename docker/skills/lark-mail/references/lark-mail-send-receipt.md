# mail +send-receipt

响应收到的已读回执请求。**本工具仅在对方邮件请求了已读回执（`READ_RECEIPT_REQUEST` 标签，系统 ID `-607`）时使用**，用于向原发件人发送一封短回复以告知"已阅读"。

本工具对应 MCP tool：`lark_mail_send_receipt`。

## CRITICAL — 工作流与安全规则

1. **触发条件严格**：仅当拉信（`lark_mail_message` / `lark_mail_messages` / `lark_mail_thread`）看到 `label_ids` 里有 `READ_RECEIPT_REQUEST` 时，才应该问用户是否发回执。对普通邮件**绝不**调用此工具。
2. **必须先问用户**：发回执之前**必须**向用户展示原邮件摘要（发件人、主题）并请求确认；用户明确同意后才执行。**不要替用户自动回执**——这会造成隐私泄露（告诉对方"我读了"）。
3. **本工具被标记为 `high-risk-write`**，需要 `_confirm=true` 才执行。仅在用户确认后附上。
4. **失败安全**：若原邮件没有 `READ_RECEIPT_REQUEST` 标签，工具会拒绝执行并报错——这是防御，不要通过其他方式绕过。

## 调用

```
# 标准用法：对指定 message_id 发回执
lark_mail_send_receipt(message_id="<message-id>", _confirm=true)

# 指定邮箱（公共邮箱场景）
lark_mail_send_receipt(mailbox="shared@example.com", message_id="<message-id>", _confirm=true)
```

## 参数

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `message_id` | 是 | — | 请求了已读回执的原邮件 message ID |
| `mailbox` | 否 | `me` | 回执邮件归属的邮箱 |
| `from` | 否 | 邮箱主地址 | 回执 From 头 |
| `_confirm` | 是 | — | 确认高危写操作。仅在用户明确同意发回执后附上 |

> **没有 `body` 参数**：回执正文**由工具自动生成**（见下方"行为细节"），对齐业界惯例（Outlook / Thunderbird / Lark 客户端等均不支持逐封自定义回执正文）。若真需要自由回复，请改用 `lark_mail_reply`——那本来就是"自由回复"的工具，不该与"已读回执"混用。

## 行为细节

- **Subject**：按原邮件主题语言（`detectSubjectLang`）自动选前缀 —— <code>已读回执：&lt;原邮件主题&gt;</code>（zh）或 <code>Read receipt:&nbsp;&lt;原邮件主题&gt;</code>（en）。
- **正文**（自动生成，纯文本 + HTML 双版本走 `multipart/alternative`）：
    - 按原邮件主题语言在 `zh` 与 `en` 之间切换
    - 结构化 4 行（纯文本版，zh）：
      ```text
      您发送的邮件已被阅读，详情如下：
      > 主题：<原邮件主题>
      > 收件人：<回执发件人地址>
      > 发送时间：<原邮件发送时间>
      > 阅读时间：<当前时间>
      ```
- **会话挂接**：自动设置 `In-Reply-To`（原信的 SMTP Message-ID）和 `References`（原信 references + 原信 SMTP Message-ID），保证在发件人邮箱里聚合到原邮件回复链。
- **即时发送**：本工具不支持保存草稿——回执邮件按语义是"立即告知对方已读"，保存草稿无意义。

## 返回值

```json
{
  "ok": true,
  "data": {
    "message_id":             "回执邮件的 message ID",
    "thread_id":              "挂到原会话的 thread ID",
    "receipt_for_message_id": "原邮件的 message ID"
  }
}
```

`message_id` 可用于后续 `send_status` 查询投递状态。

## 典型场景

### 场景 1：用户在拉信时看到 `-607` 标签

```
# 1. 拉信
lark_mail_message(message_id="msg-1", format="json")
# 输出 label_ids 包含 ["UNREAD", "READ_RECEIPT_REQUEST"] → 原邮件请求了已读回执

# 2. 向用户提示：
#    "这封来自 alice@example.com 的邮件请求已读回执。主题：《周报》。
#     要不要回一封告诉对方你已阅读？"

# 3. 用户确认后发回执
lark_mail_send_receipt(message_id="msg-1", _confirm=true)
```

### 场景 2：公共邮箱的回执

```
# 公共邮箱收到的回执请求，用 mailbox 指定
lark_mail_send_receipt(mailbox="support@example.com", message_id="<id>", _confirm=true)
```

## 不要这样做

- ❌ **自动回执**（不经用户确认就发）——违反隐私规则
- ❌ 对普通邮件调用 `lark_mail_send_receipt`（工具会拒绝，但 agent 也不应尝试）
- ❌ 用 `lark_mail_send` / `lark_mail_reply` 手工拼 "已读回执" 回复——会缺少 `X-Lark-Read-Receipt-Mail` 头，后端不会打 `-608` 标签，收信人看不到系统样式的回执
- ❌ 一次调用发多条（本工具设计为单次响应）

## 相关工具

- `lark_mail_message` — 拉单封邮件（在 `label_ids` 里检查 `READ_RECEIPT_REQUEST`）
- `lark_mail_send(request_receipt=true)` — 反向：**请求**别人回执
- `lark_invoke(tool_name="lark_mail_user_mailbox_messages_send_status", ...)` — 查询回执邮件的投递状态

# mail +thread

读取指定会话中的所有邮件，按发送时间升序排列。每条邮件结构与 `lark_mail_message` 相同。

本工具对应 MCP tool：`lark_mail_thread`。

## 调用

```
# 读取完整会话
lark_mail_thread(thread_id="<thread-id>")

# 仅纯文本正文（更小的负载，适合 AI 处理）
lark_mail_thread(thread_id="<thread-id>", html=false)

# 指定邮箱
lark_mail_thread(mailbox="user@example.com", thread_id="<thread-id>")

# JSON 输出
lark_mail_thread(thread_id="<thread-id>", format="json")
```

## 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `thread_id` | 是 | — | 会话 ID（`thread_id`） |
| `mailbox` | 否 | 当前用户 | 邮箱地址（`user_mailbox_id`） |
| `html` | 否 | true | 是否返回 HTML 正文（`false` 仅返回纯文本，减少带宽） |
| `format` | 否 | json | 输出格式：`json`（默认）/ `pretty` / `table` / `ndjson` / `csv` |

## 返回值

成功时返回 `{"ok": true, "data": ...}` 结构，`data` 字段包含：

```json
{
  "thread_id":     "会话 ID",
  "message_count": 2,
  "messages": [
    { "...与 lark_mail_message 输出结构相同（最早的在前）..." },
    { "......" }
  ]
}
```

顶层字段：

| 字段 | 说明 |
|------|------|
| `thread_id` | 请求的会话 ID |
| `message_count` | 成功获取的邮件数量 |
| `messages` | 按 `internal_date` 升序排列的邮件列表（最早的在前） |

每个 `messages[]` 项使用与 `lark_mail_message` 相同的结构。完整字段列表参见 `lark_get_skill(domain="mail", section="message")` 中的字段说明和 security_level。

## 注意事项

- **JSON 输出可直接使用**，可直接读取，无需额外编码转换。
- `lark_mail_thread` 不再在读取会话时获取附件/图片下载 URL。如后续步骤需要 URL，请针对特定的 `message_id` 和 `attachment_ids` 调用原生附件 URL API。
- 与 `lark_mail_message` 一样，普通附件和内嵌图片都出现在 `messages[].attachments[]` 中，使用同一个 `user_mailbox.message.attachments download_url` API。

## 典型场景

### 查看会话时间线 → 生成摘要

```
# 1. 从某封邮件获取 thread_id
lark_mail_message(message_id="<id>", html=false, format="json")
# → 从返回的 data.thread_id 获取

# 2. 读取完整会话（仅纯文本）
lark_mail_thread(thread_id="<thread_id>", html=false, format="json")

# 3. 让 LLM 分析 messages[].body_plain_text 并生成会话摘要
```

### 回复会话中最新一封邮件

```
# 获取最新一封邮件的 message_id
lark_mail_thread(thread_id="<thread_id>", html=false, format="json")
# → messages[-1].message_id

# 回复
lark_mail_reply(message_id="<last_message_id>", body="...")
```

## 相关工具

- `lark_mail_message` — 读取单封邮件
- `lark_mail_reply` — 回复邮件
- `lark_mail_forward` — 转发邮件
- `lark_invoke(tool_name="lark_mail_user_mailbox_message_attachments_download_url", ...)` — 按需获取邮件附件/图片下载 URL
- `lark_invoke(tool_name="lark_mail_user_mailbox_messages_list", ...)` — 列出收件箱邮件（获取 `thread_id`）

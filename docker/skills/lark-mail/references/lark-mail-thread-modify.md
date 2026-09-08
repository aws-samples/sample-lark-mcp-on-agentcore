# mail thread-modify

如果操作对象是具体邮件 `message_id`，不是整个会话，使用 `lark_mail_message_modify`（`lark_get_skill(domain="mail", section="message-modify")`）。

## 命令

```
# 给多个会话添加未读标签（thread_ids 是数组参数，一个元素一个 ID）
lark_mail_thread_modify(thread_ids=["<thread_id1>", "<thread_id2>"], add_label_ids="unread")

# 移除星标标签
lark_mail_thread_modify(thread_ids=["<thread_id>"], remove_label_ids="FLAGGED")

# 归档会话
lark_mail_thread_modify(thread_ids=["<thread_id>"], add_folder="archive")

# 指定公共邮箱或共享邮箱
lark_mail_thread_modify(mailbox="shared@example.com", thread_ids=["<thread_id>"], add_folder="folder_xxx")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `mailbox` | 否 | 会话所属邮箱，默认 `me` |
| `thread_ids` | 是 | **数组**：会话 ID 列表，一个元素一个 ID（`stringArray`，逗号拼接的字符串会被当成一个 ID）；超过 20 个时自动分批提交 |
| `add_label_ids` | 否 | 要添加的标签 ID，多个用逗号分隔。系统标签可传 `unread` / `important` / `other` / `flagged`；自定义标签传标签 ID |
| `remove_label_ids` | 否 | 要移除的标签 ID，多个用逗号分隔。不能与 `add_label_ids` 传入重复标签 |
| `add_folder` | 否 | 要移动到的文件夹。系统文件夹可传 `inbox` / `sent` / `spam` / `archive` / `archived`；自定义文件夹传文件夹 ID |

`add_label_ids`、`remove_label_ids`、`add_folder` 至少传一个。

`TRASH` 不允许通过本工具作为目标文件夹传入。需要软删除会话时，使用 `lark_mail_thread_trash`（`lark_get_skill(domain="mail", section="thread-trash")`），并在用户确认后加 `_confirm=true` 执行。

`READ_RECEIPT_REQUEST` / `read_receipt_request` 不允许通过本工具添加或移除。已读回执请求必须先读取具体 message、确认用户意图，再使用 `lark_mail_send_receipt`（`lark_get_skill(domain="mail", section="send-receipt")`）或 `lark_mail_decline_receipt`（`lark_get_skill(domain="mail", section="decline-receipt")`）。

## 注意事项

- `thread_id` 必须来自 `lark_mail_triage`、`lark_mail_message`、`lark_mail_thread`、会话列表或搜索等真实查询结果；不要用数字主键或占位符。
- 工具在本地解析重复传入的会话 ID，按首次出现顺序去重，并按 20 个一批提交。
- 单个 batch 请求失败时，该批次的所有 `thread_id` 都记录为同一个失败原因；后续批次继续执行。
- 本工具是普通写操作，不需要 `_confirm`，也没有 dry-run 预览参数。批量整理前请先用真实查询结果向用户展示受影响的会话。

## 返回值

返回示例：

```json
{
  "success_thread_ids": ["thread_id1"],
  "failed_thread_ids": [
    {"thread_id": "thread_id2", "reason": "api error"}
  ]
}
```

## 原生 API 适用场景

只有在需要精确复现后端/API 行为做诊断，或需要本工具未暴露的请求结构时，才直接调用 `lark_invoke(tool_name="lark_mail_user_mailbox_threads_batch_modify", ...)`。普通会话整理优先使用本工具，因为它内置了 ID 校验、分批和批量输出。

## 相关工具

- `lark_mail_triage` — 浏览邮件摘要，获取 `thread_id`
- `lark_mail_thread` — 读取完整会话
- `lark_mail_message_modify` — 按 `message_id` 修改具体邮件
- `lark_mail_thread_trash` — 按 `thread_id` 软删除会话

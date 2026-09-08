# mail thread-trash

已有 `thread_id` 且要按会话维度软删除邮件时，优先使用 `lark_mail_thread_trash`。执行前必须先拿到真实 `thread_id`，并让用户确认删除预览。

如果操作对象是具体邮件 `message_id`，不是整个会话，使用 `lark_mail_message_trash`（`lark_get_skill(domain="mail", section="message-trash")`）。

本工具被标记为 `high-risk-write`，需要 `_confirm=true` 才执行；仅在用户明确确认删除预览后附上。

## 命令

```
# 软删除多个会话（thread_ids 是数组参数，一个元素一个 ID）
lark_mail_thread_trash(thread_ids=["<thread_id1>", "<thread_id2>"], _confirm=true)

# 指定公共邮箱或共享邮箱
lark_mail_thread_trash(mailbox="shared@example.com", thread_ids=["<thread_id>"], _confirm=true)
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `mailbox` | 否 | 会话所属邮箱，默认 `me` |
| `thread_ids` | 是 | **数组**：会话 ID 列表，一个元素一个 ID（`stringArray`，逗号拼接的字符串会被当成一个 ID）；超过 20 个时自动分批提交 |
| `_confirm` | 执行时必填 | 高风险写操作确认。只有用户确认删除预览后才加 |

## 注意事项

- `thread_id` 必须来自 `lark_mail_triage`、`lark_mail_message`、`lark_mail_thread`、会话列表或搜索等真实查询结果；不要用数字主键或占位符。
- 软删除属于高风险写操作。先用真实查询结果展示删除预览，包括受影响会话数量和关键邮件摘要；用户确认后再执行并加 `_confirm=true`。
- 工具在本地解析重复传入的会话 ID，按首次出现顺序去重，并按 20 个一批提交。
- 单个 batch 请求失败时，该批次的所有 `thread_id` 都记录为同一个失败原因；后续批次继续执行。

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

只有在需要精确复现后端/API 行为做诊断时，才直接调用 `lark_invoke(tool_name="lark_mail_user_mailbox_threads_batch_trash", ...)`。普通会话软删除优先使用本工具，因为它内置了 ID 校验、分批、批量输出和 `_confirm` 确认。

## 相关工具

- `lark_mail_triage` — 浏览邮件摘要，获取 `thread_id`
- `lark_mail_thread` — 读取完整会话
- `lark_mail_message_trash` — 按 `message_id` 软删除具体邮件
- `lark_mail_thread_modify` — 按 `thread_id` 修改会话标签或移动文件夹

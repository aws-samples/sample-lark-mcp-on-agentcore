# minutes +detail

通过 `minute_token` 查询妙记详情，按需获取 AI 产物（总结/待办/章节/逐字稿/关键词）。只读。

> `summary` / `todo` / `chapter` / `keyword` / `transcript` 都是可选项；请求相应产物时必须显式传入，不传任何产物 flag 时只返回基础信息（如 `title`），AI 产物字段都不会出现。一次性获取所有产物：`summary=true, todo=true, chapter=true, keyword=true, transcript=true`。

## 命令

```
# 仅基础信息
lark_minutes_detail(minute_tokens="obcxxxxxxxxxx")

# 批量（逗号分隔，最多 50 个）
lark_minutes_detail(minute_tokens="obcxxx,obcyyy", summary=true, todo=true)

# 全产物
lark_minutes_detail(minute_tokens="obcxxx", summary=true, todo=true, chapter=true, keyword=true, transcript=true)

# 仅逐字稿
lark_minutes_detail(minute_tokens="obcxxx", transcript=true)
```

## 输出

`minutes` 数组每条含 `minute_token`、`title`、`note_id`、`artifacts`。`note_id` 仅在该妙记关联了会议纪要时返回，可直接传给 `lark_note_detail` 拿纪要文档 token，无需再绕回 `lark_vc_detail`。`artifacts` 中**只包含本次请求的产物**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `artifacts.summary` | string | AI 总结。 |
| `artifacts.todos` | array | 待办事项列表。 |
| `artifacts.chapters` | array | 章节列表。 |
| `artifacts.keywords` | array | 关键词列表。 |
| `artifacts.transcript_content` | string | 逐字稿正文。 |
| `artifacts.transcript_bytes` | number | 逐字稿完整大小（字节）。 |
| `artifacts.transcript_truncated` | boolean | 为 `true` 时正文因单次返回上限被截断。 |

逐字稿正文由 MCP server 直接放在返回结果里，不产生可供后续读取的文件；`output_dir`、`overwrite` 会被忽略。多个妙记共用一次返回的大小上限；被截断时结果顶层另有 `transcript_notice`，剩余部分无法通过本工具获取，应提示用户到妙记页面查看全文。

## minute_token 来源

| 来源 | 取值字段 |
|------|---------|
| 妙记 URL `https://*.feishu.cn/minutes/obcxxx` | 截路径最后一段 `obcxxx` |
| `lark_vc_detail(meeting_ids="...")` | `minute_token` |
| `lark_vc_recording(meeting_ids="...")` | `minute_token` |
| `lark_minutes_search` | `minute_token` |

`minute_token` 不要直接传给 `lark_note_detail`：需要关联 Note 时，先从本工具结果读取 `note_id`。跨产物流程由 `lark_get_skill(domain="meeting", section="scenes/query-minutes-and-artifacts")` 编排。

## 相关场景

- 查询妙记及其产物：`lark_get_skill(domain="meeting", section="scenes/query-minutes-and-artifacts")`

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

# 仅逐字稿，覆盖已有文件，指定输出目录
lark_minutes_detail(minute_tokens="obcxxx", transcript=true, overwrite=true, output_dir="./out")
```

## 输出

`minutes` 数组每条含 `minute_token`、`title`、`note_id`、`artifacts`。`note_id` 仅在该妙记关联了会议纪要时返回，可直接传给 `lark_note_detail` 拿纪要文档 token，无需再绕回 `lark_vc_detail`。`artifacts` 中**只包含本次请求的产物**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `artifacts.summary` | string | AI 总结。 |
| `artifacts.todos` | array | 待办事项列表。 |
| `artifacts.chapters` | array | 章节列表。 |
| `artifacts.keywords` | array | 关键词列表。 |
| `artifacts.transcript_file` | string | 逐字稿本地文件路径。 |

逐字稿默认落地 `./minutes/{minute_token}/transcript.txt`，与 `lark_minutes_download` 同目录便于聚合。指定 `output_dir="<dir>"` 时改写到 `<dir>/artifact-{title}-{minute_token}/transcript.txt`。

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

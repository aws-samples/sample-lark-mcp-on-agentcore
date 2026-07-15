
# calendar +meeting

通过日程 ID（`event_id`） 获取关联的视频会议信息（`meeting_id`、`meeting_note`）。只读。

## 工具调用

```
# 单个 / 批量（逗号分隔，最多 50 个）
lark_calendar_meeting(event_ids="<event_id1>,<event_id2>")

# 默认使用主日历，需要时显式传 calendar_id
lark_calendar_meeting(event_ids="<event_id>", calendar_id="<calendar_id>")
```

## 输出字段

| 字段 | 说明 |
|------|------|
| `event_id` | 日程 ID |
| `meeting_id` | 关联的视频会议 ID |
| `meeting_note` | 用户主动绑定到日程的纪要文档 Token（`MeetingNotes`，由用户在日程页手动添加；）。**与会中产生的 AI 智能纪要 `note_doc_token` 是两份不同文档**，要拿 AI 纪要请继续走 `lark_vc_detail` → `lark_note_detail`。 |

## 下游链路

`lark_calendar_meeting` 只把日程 ID 翻译为 `meeting_id` / `meeting_note`，要拿会中产生的产物（AI 智能纪要、逐字稿、妙记）需继续调用：

```
# 1. meeting_id → note_id + minute_token（同一会议两份产物，可能各自为空）
lark_vc_detail(meeting_ids="<meeting_id>")

# 2a. note_id → 纪要文档 token（note_doc_token / verbatim_doc_token / shared_doc_tokens）
lark_note_detail(note_id="<note_id>")

# 2b. minute_token → 妙记 AI 产物（按需获取，不传不返回任何 AI 内容）
lark_minutes_detail(minute_tokens="<minute_token>", summary=true, todo=true, chapter=true, keyword=true, transcript=true)

# 3. 任意文档 token（meeting_note / note_doc_token / verbatim_doc_token / shared_doc_token）→ 正文
lark_docs_fetch(doc="<doc_token>", doc_format="markdown")
```

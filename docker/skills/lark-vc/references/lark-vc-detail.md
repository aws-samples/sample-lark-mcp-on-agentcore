
# vc +detail

通过会议 ID 获取会议详情，包括基本信息、关联的纪要 ID（`note_id`）和妙记 Token（`minute_token`）。只读。

## 命令

```
# 单个 / 批量（逗号分隔，最多 50 个）
lark_vc_detail(meeting_ids="<meeting_id1>,<meeting_id2>")
```

## 输出字段

| 字段 | 说明 |
|------|------|
| `meeting_id` | 会议 ID |
| `meeting_no` | 会议 9 位号码 |
| `topic` | 会议主题 |
| `start_time` | 开始时间 |
| `end_time` | 结束时间 |
| `note_id` | 关联的纪要 ID。 |
| `minute_token` | 关联的妙记 Token。 |

## 典型场景

### 场景 1：获取会议的纪要和妙记关联

`lark_vc_detail` 只能拿到 `note_id` 和 `minute_token`，不直接返回纪要文档 token 与妙记产物内容。要获取实际产物，需根据用户诉求继续调用 `lark_note_detail` 或 `lark_minutes_detail`：

```
# 1. 获取会议详情，拿到 note_id 和 minute_token
lark_vc_detail(meeting_ids="<meeting_id>")

# 2. 用 note_id 获取纪要文档 Token（note_doc_token / verbatim_doc_token / shared_doc_tokens）
lark_note_detail(note_id="<note_id>")

# 3. 用 minute_token 获取妙记产物
# ⚠️ 必须显式指定 summary / todo / chapter / keyword / transcript 中至少一个 flag，
# 不传任何 flag 则不会返回任何产物内容。
lark_minutes_detail(minute_tokens="<minute_token>", todo=true, transcript=true)
```

> **路由建议**：当用户未明确指定使用妙记时，**优先**走 `lark_note_detail` 链路（纪要文档信息更完整、含逐字稿原文），仅在 `note_id` 为空或用户要求妙记产物时才走 `lark_minutes_detail`。

# vc +detail

通过会议 ID 获取会议详情，包括基本信息、关联的纪要 ID（`note_id`）和妙记 Token（`minute_token`）。只读。

（认证由 MCP server 自动处理，始终以用户身份执行。）

## 命令

```
# 单个 / 批量（逗号分隔，最多 50 个）
lark_vc_detail(meeting_ids="<meeting_id1>,<meeting_id2>")
```

## 身份

MCP server 以**用户身份**调用，只能查当前用户有权限的会议。⚠️ 上游还支持应用身份（只能查应用有权限的会议），但 MCP server 无法切换身份，该路径不可用。

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

`lark_vc_detail` 只能拿到 `note_id` 和 `minute_token`，不直接返回纪要文档 token 与妙记产物内容。要获取实际产物，需根据用户诉求继续调用 `lark_note_detail` 或 `lark_minutes_detail`；跨产物选择和后续调用链由场景手册 `lark_get_skill(domain="meeting", section="scenes/query-meeting-and-artifacts")` 统一编排（身份无需在后续调用中传递，MCP server 始终以用户身份执行）。

## 相关场景
- 查询会议及其产物：`lark_get_skill(domain="meeting", section="scenes/query-meeting-and-artifacts")`

# lark_calendar_list_attendees

列出单个日程的参与人（用户 / 会议室 / 群 / 三方邮箱）。只读。

## 调用

```
# 查看指定日历（默认 primary）下某日程的全部类型参与人和会议室
lark_calendar_list_attendees(calendar_id="<calendar_id>", event_id="<event_id>")

# 只看会议室
lark_calendar_list_attendees(event_id="<event_id>", type="resource")

# 同时看用户与会议室（多个类型用逗号分隔）
lark_calendar_list_attendees(event_id="<event_id>", type="user,resource")

# 分页续拉（由调用方基于 has_more / page_token 决定是否再调一次）
lark_calendar_list_attendees(event_id="<event_id>", page_size=100, page_token="<page_token>")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `event_id` | **是** | 目标日程 ID |
| `calendar_id` | 否 | 日历 ID，省略则使用主日历（`primary`） |
| `type` | 否 | 按 attendee 类型过滤；多个类型用逗号分隔。枚举：`user` / `resource` / `chat` / `third_party`。留空返回全部类型 |
| `page_size` | 否 | 上游分页大小（数值）；范围 [10, 100]，超出会被夹取，默认 `20` |
| `page_token` | 否 | 上游分页游标，来自上一次返回的 `page_token` |

## 提示

- `type=chat` 的群参与人**不返回 `rsvp_status`**（群本身没有群级 RSVP 状态）。需要群成员的 RSVP 请通过 `lark_invoke` 调用原生 OpenAPI。

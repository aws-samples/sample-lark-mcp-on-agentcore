# calendar +rsvp

回复指定的日程，更新当前用户的 RSVP 状态（接受、拒绝或待定）。

## 工具调用

```
# 回复日程为接受 (使用主日历)
lark_calendar_rsvp(event_id="evt_xxx", rsvp_status="accept")

# 回复日程为拒绝
lark_calendar_rsvp(event_id="evt_xxx", rsvp_status="decline")

# 回复日程为待定
lark_calendar_rsvp(event_id="evt_xxx", rsvp_status="tentative")

# 指定其他日历下的日程
lark_calendar_rsvp(calendar_id="cal_xxx", event_id="evt_xxx", rsvp_status="accept")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `event_id` | **是** | 日程 ID |
| `rsvp_status` | **是** | 回复状态，可选值：`accept` (接受), `decline` (拒绝), `tentative` (待定) |
| `calendar_id` | 否 | 日历 ID（省略则使用主日历） |

## 提示

- 只能回复你被邀请的日程。
- 调用前通常需要通过 `lark_calendar_agenda` 等获取到具体的 `event_id`。

## 参考

- lark_get_skill(domain="calendar") -- skill 入口与路由

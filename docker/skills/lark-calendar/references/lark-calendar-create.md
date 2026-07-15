
# calendar +create

创建日程并按需邀请参会人。

## 推荐调用

```
# 创建日程 + 邀请参会人（ISO 8601 时间）
lark_calendar_create(summary="产品评审", start="2026-03-12T14:00+08:00", end="2026-03-12T15:00+08:00", attendee_ids="ou_aaa,ou_bbb")

# 无参会人
lark_calendar_create(summary="午餐", start="2026-03-12T12:00+08:00", end="2026-03-12T13:00+08:00")

# 指定日历
lark_calendar_create(summary="...", start="...", end="...", calendar_id="cal_xxx")
```

参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `summary` | 否 | 日程标题。注意：标题中不应该出现时间、地点、人物信息 |
| `start` | 是 | 开始时间（ISO 8601，如 `2026-03-12T14:00+08:00`） |
| `end` | 是 | 结束时间（ISO 8601） |
| `description` | 否 | 日程详细描述。提供会议议程、活动内容、注意事项或链接等。与 summary 配合使用，仅关注当前日程信息 |
| `attendee_ids` | 否 | 参与人 ID 列表（逗号分隔）。支持用户（`ou_`）、群组（`oc_`）和会议室（`omm_`）。AI 提取时请务必保留对应前缀 |
| `calendar_id` | 否 | 日历 ID（省略则使用主日历） |
| `rrule` | 否 | 重复日程的重复性规则，规则设置方式参考rfc5545。示例值："FREQ=DAILY;INTERVAL=1;UNTIL=<具体日期>" |

> 当用户表达'每周 X'、'每周重复'、'连续 N 周'时，必须使用 rrule 创建重复性日程，而非创建多个独立日程
> 自动设置 `attendee_ability: "can_modify_event"`，参会人可查看彼此并编辑日程。
> 自动设置 `free_busy_status: "busy"`，默认日程忙闲状态为忙碌。
> 自动设置 `reminders: [{"minutes": 5}]`，默认日程开始前 5 分钟提醒。
> 自动设置 `vchat: {"vc_type": "vc"}`，默认日程包含飞书视频会议。如需其他视频会议类型或不含视频会议，请使用完整 API 命令。
> 失败保护：若添加参会人失败（如 open_id 错误），系统会自动删除刚创建的空日程（回滚，不通知参会人）。
> 审批会议室：`lark_calendar_create` 不暴露低频字段 `attendees[].approval_reason`。如果会议室要求审批，请先创建日程，再用完整 API `lark_calendar_event_attendees_create` 添加会议室并传 `approval_reason`。

## 高级用法（完整 API 命令）

如需配置 `location`（地理位置，不含会议室位置）、`visibility`（日程公开范围）、自定义 `reminders`（提醒设置）、自定义 `attendee_ability`（参与人权限）、自定义 `free_busy_status`（日程忙闲状态）、参与人可选参加状态或全天日程等高级参数，请使用完整的 API 命令：
**注意**：
- 全天日程的开始日期和结束日期必须分别是日程开始的第一天和结束的最后一天。如果只有一天的话，开始日期和结束日期是相同。

```
# 添加需要审批的会议室（approval_reason 最大 200 字符）
lark_invoke(tool_name="lark_calendar_event_attendees_create", args={
  params: {"calendar_id": "<CALENDAR_ID>", "event_id": "<EVENT_ID>"},
  data: {"attendees": [{"type": "resource", "room_id": "omm_xxx", "approval_reason": "申请原因"}]}
})
```

完整 API 命令的关键差异：
- 时间参数是 **Unix 秒字符串**（非 ISO 8601）。
- 全天日程的开始日期和结束日期必须分别是日程开始的第一天和结束的最后一天；单日全天日程两者相同。
- 手动拆成"创建日程 + 添加参会人"两步时，若第二步失败，建议删除刚创建的空日程，避免遗留无参会人的日程。

## 参会人类型

| `type` | `user_id` 格式 | 说明 |
|--------|---------------|------|
| `user` | `ou_xxx`（open_id） | 飞书用户 |
| `group` | `oc_xxx` | 飞书群组 |
| `resource` | `omm_xxx` | 会议室 |
| `third_party` | 邮箱地址 | 外部参会人 |

> [!CAUTION]
> 这是**写入操作** -- 执行前必须确认用户意图。

## 参考

- lark_get_skill(domain="calendar") -- skill 入口与路由
- lark_get_skill(domain="calendar", section="suggestion") -- 根据非明确时间或一段时间范围，推荐多个可用时间块方案

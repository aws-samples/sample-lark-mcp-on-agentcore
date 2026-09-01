# lark_calendar_transfer

把一个日程的**组织者（organizer）**转让给另一个用户或机器人。用户和机器人之间可以任意互转。

**高风险写操作**：不可逆，真实执行必须先向用户确认，再带上 `_confirm=true`；MCP server 会拒绝第一次未带确认的调用并给出提示。

⚠️ 转出方必须是日程**当前组织者**的身份。MCP server 始终以当前登录用户身份执行，因此只能转让当前登录用户作为组织者的日程；**bot 组织的日程转出（bot → user、bot → bot）需要 bot 身份，MCP server 不可用**。用非组织者身份调用会返回 403。

## 工具调用

```
# 转让给某人（原组织者保留为参与人）
lark_calendar_transfer(event_id="<event_id>", to_user_id="ou_xxx", _confirm=true)

# 转让并把原组织者从参与人中移除
lark_calendar_transfer(event_id="<event_id>", to_user_id="ou_xxx", remove_original_organizer=true, _confirm=true)

# 指定日历
lark_calendar_transfer(calendar_id="<calendar_id>", event_id="<event_id>", to_user_id="ou_xxx", _confirm=true)

# 重复性日程：必须显式确认整个序列一起转让
lark_calendar_transfer(event_id="<event_id>", to_user_id="ou_xxx", transfer_series=true, _confirm=true)
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `event_id` | **是** | 日程 ID（`uid_originalTime` 形式） |
| `to_user_id` | **是** | 接收人 open_id，成为新组织者；用户和机器人都可以 |
| `calendar_id` | 否 | 日程所在日历 ID（省略则使用主日历） |
| `remove_original_organizer` | 否 | 转让后把原组织者移出参与人；默认保留。日程在共享日历上时服务端一定会移除 |
| `transfer_series` | 否 | 确认整个重复性序列一起转让；重复性日程必填 |
| `_confirm` | 真实执行时**是** | 高风险写操作确认；未带确认的调用会被拒绝 |

## 转让方向

转出方和接收方是两个**互相独立**的维度：

- **转出方**是执行身份，必须是日程当前组织者。MCP server 固定为当前登录用户身份，所以只覆盖「user → *」两个方向。
- **接收方**由 `to_user_id` 决定，传谁的 open_id 就转给谁，是人还是机器人不影响调用写法。

| 方向 | 是否可用 | 调用 |
|------|---------|------|
| user → user | 可用 | `to_user_id="<对方用户 open_id>"` |
| user → bot | 可用 | `to_user_id="<bot 的 open_id>"` |
| bot → user | ⚠️ 需要 bot 身份，MCP server 不可用 | — |
| bot → bot | ⚠️ 需要 bot 身份，MCP server 不可用 | — |

**取接收人 open_id**：

```
# 用户
lark_contact_search_user(query="<姓名>")

# 机器人：从它所在群的成员列表里取 bots[] 中的 open_id
lark_im_chat_members_list(chat_id="<chat_id>", member_types="bot")
```

机器人的 open_id 同样是 `ou_` 开头；不要传 `cli_` 开头的 app_id，那是应用 ID，不是日程参与人身份。

无论哪个方向，转让都要求转出方和接收方**同租户**，且接收方能通过高管模式的协作校验。

## 重复性日程

后端按 `uid` 定位日程，忽略 `original_time`，**无法只转让某一次实例**。因此传入任何一个实例或例外的 `event_id`，都会把整个序列（含所有例外）一起转让。

是重复性日程且未传 `transfer_series=true` 时调用直接失败（`failed_precondition`），不会发出转让请求。收到这个错误时**先向用户确认「整个重复日程都转让」**，得到确认后再带 `transfer_series=true` 重试；不要自动重试。已确认时传 `transfer_series=true` 会跳过这次预读。

## 返回中的 `original_organizer_removed`

**共享日历不属于任何组织者，转让时服务端会强制把原组织者移出日程；主日历则会把原组织者保留为参与人。** 转让接口成功时不返回这个结果，所以工具只在能确定时才输出该字段：

| 情况 | 返回 |
|------|------|
| 带 `remove_original_organizer=true` | `original_organizer_removed: true` |
| 省略 `calendar_id`（主日历） | `original_organizer_removed: false` |
| 传了 `calendar_id` 且未传 `remove_original_organizer` | **不返回该字段**，并附一条 note 说明共享日历会强制移除 |

字段缺失时**不要**告诉用户「原组织者已保留为参与人」，也不要断言已被移除。需要确认就转让后读一次日程看参与人，或一开始就显式传 `remove_original_organizer=true`。

## 提示

- 转让不可逆，且会连同日程上的会议纪要、笔记和附件一起移交给新组织者。
- 需要 `calendar:calendar.event:transfer` 权限；转让前的重复性预读需要 `calendar:calendar.event:read`（传 `transfer_series=true` 时不读）。

## 参考

- lark_get_skill(domain="calendar") -- skill 入口与路由
- lark_get_skill(domain="calendar", section="recurring") -- 重复性日程操作规范

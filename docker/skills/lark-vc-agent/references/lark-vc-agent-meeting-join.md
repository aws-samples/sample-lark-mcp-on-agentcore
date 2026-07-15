
# lark_vc_meeting_join

(authentication is handled automatically by the MCP server)

> ⚠️ **此操作要求应用身份（bot/app identity），通过 MCP server 不可用。** MCP server 始终以用户身份调用，无法让应用机器人入会。本文档保留入会能力的概念说明，便于解释为什么"代我入会 / 让机器人旁听"这类请求无法在 MCP 上完成；不要把它当作可直接调用的工具向用户承诺执行。需要读取进行中会议的事件时，请用用户身份路径：`lark_get_skill(domain="vc-agent", section="meeting-list-active")` 发现会议，再用 `lark_vc_meeting_events` 读取。

通过 9 位会议号让应用机器人加入一场正在进行的视频会议。这是一次**写操作**，会实际让应用机器人加入会议。

本工具对应 shortcut：`lark_vc_meeting_join`（调用 `POST /open-apis/vc/v1/bots/join`）。

> **不要把 9 位会议号等同于入会意图。** 用户给出 9 位会议号并询问"会议讲了什么 / 查会中事件"时，先用 `lark_vc_meeting_list_active` 查当前 active meetings 并按 `meeting_no` 匹配；只有用户明确要求"入会 / 让应用机器人旁听 / 代我参会"时才涉及本能力（而该能力在 MCP server 上不可用）。

## 调用方式（应用身份，MCP server 不可用）

```
# 仅指定会议号（无密码）
lark_vc_meeting_join(meeting_number="123456789")

# 指定会议号 + 密码
lark_vc_meeting_join(meeting_number="123456789", password="8888")

# 从邀请事件透传 call_id（参见「如何获取输入参数」）
lark_vc_meeting_join(meeting_number="123456789", call_id="a08e06bf-9a41-44e4-a89c-a7871899e783")

# 输出格式
lark_vc_meeting_join(meeting_number="123456789", format="json")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `meeting_number` | 是 | 会议号，必须为 **9 位纯数字** |
| `password` | 否 | 会议密码，仅在该会议设置了入会密码时传入 |
| `call_id` | 否 | 从 `vc.bot.meeting_invited_v1` 邀请事件透传的 `call_id`，原样回传即可。Agent 主动入会或无邀请事件来源时不传 |

## 核心约束

### 1. 应用身份能力（MCP server 不可用）

⚠️ 这是应用机器人入会能力，需要应用身份。MCP server 始终以用户身份调用，**无法执行此操作**。

### 2. 会议号格式严格校验

`meeting_number` 必须是 9 位纯数字，否则本地校验直接报错：
`meeting_number must be exactly 9 digits`。

常见错误来源：
- 把会议链接整条粘进来（应仅取尾部的 9 位数字）
- 把 `meeting_id`（长数字 ID）当成会议号传入（两者不是同一个东西）

### 3. 会议必须已开始且允许入会

- 会议必须处于**进行中**状态，应用机器人无法加入尚未开始或已结束的会议。
- 若会议设置了**等候室 / 入会审批**，应用机器人可能需要主持人放行后才真正入会。
- 若返回 `HTTP 403: no permission`（错误码 `121003`），不要只理解成"账号没权限"。这类报错更常见的原因是：会议参数或会控配置当前不满足入会条件，例如会议号填错、密码未传或错误、会议尚未开始、等候室 / 入会审批未放行、会议禁止外部/特定身份加入等。应先确认这些配置项，再重试。

### 4. 机器人入会后对其他参会人可见

这是一次真实入会操作，机器人会立即出现在参会人列表中，其他参会人可见，并产生会议日志。误入错会的社交成本高于技术成本——执行前优先确认 9 位会议号的来源（用户输入 / 会议链接末尾），不要臆造。

## 输出结果

接口返回会议基本信息，字段视具体响应而定，常见字段：

| 字段 | 说明 |
|------|------|
| `meeting.id` | 会议 ID（可后续用于应用身份离会 `lark_vc_meeting_leave`） |
| `meeting.meeting_no` | 会议号（与入参一致） |
| `meeting.topic` | 会议主题 |
| `meeting.start_time` | 会议开始时间 |

> **重要**：拿到 `meeting.id` 后务必保留，应用身份离会（`lark_vc_meeting_leave`）需要使用它，而不是会议号。

## 如何获取输入参数

| 输入参数 | 获取方式 |
|---------|---------|
| `meeting_number` | 会议号由主持人分享；也可从会议链接尾部解析 9 位数字 |
| `password` | 若会议设置了入会密码，由主持人提供 |
| `call_id` | 由 `vc.bot.meeting_invited_v1` 邀请事件的 `call_id` 字段携带，Agent 收到事件时透传过来；无邀请事件场景（如 Agent 主动入会）不传 |

## Agent 组合场景

### 场景 1：入会后查看会中事件（应用身份，MCP server 不可用）

⚠️ 此组合需应用身份，MCP server 上不可用。MCP 上请改用用户身份：先 `lark_vc_meeting_list_active(format="json")` 发现当前用户所在会议，再用 `lark_vc_meeting_events` 读取。

```
# 应用身份发现已在会中的会议（替代入会）：
lark_vc_meeting_list_active(user_id="<user_open_id>", format="json")
```

### 场景 2：入会 → 会后进入 lark-vc 获取会议产物信息

会后产物查询本身用用户身份即可：

```
# 会议结束后，先查询会议产物
lark_vc_detail(meeting_ids="<meeting.id>")
```

后续按 `lark_get_skill(domain="vc")` 的产物决策处理：根据 `note_display_type`、`note_id`、`minute_token` 和用户意图选择纪要正文、逐字稿或妙记。

## 常见错误与排查

| 错误现象 | 根本原因 | 解决方案 |
|---------|---------|---------|
| `meeting_number must be exactly 9 digits` | 会议号不是 9 位纯数字 | 检查是否误传了会议链接或 meeting_id |
| 会议密码错误 | `password` 错误或未提供 | 向主持人确认会议密码 |
| 会议不存在 / 已结束 | 会议号错误或会议未进行中 | 确认会议正在进行中 |
| `HTTP 403: no permission` / `121003` | 入会前置条件不满足，通常不是单纯 scope 问题 | 依次确认：1）会议允许智能体加入；2）会议号正确；3）如有密码，已正确传入 `password`；4）会议已开始；5）等候室 / 入会审批已放行；6）会议未禁止当前身份加入（如限制外部、限制应用机器人、仅特定成员可入会）；确认后重试 |
| 应用身份权限不足 | 应用权限、租户安装、权限可访问的数据范围或 VC Agent privilege 未配置完整 | ⚠️ 应用身份操作在 MCP server 上不可用；权限配置仅供排查参考，以工具返回的 metadata / error envelope 为准确认缺失权限；检查应用发布/安装，以及开放平台"权限可访问的数据范围"：选择"按条件筛选"，条件为"会议的归属者 包含 与应用的可用范围一致"；仍失败再排查内测 privilege / 灰度 |
| 入会被拒绝 | 等候室 / 入会审批 / 限制外部入会 | 联系主持人放行或调整会议设置 |

## 提示

- 此能力需应用身份，MCP server 上不可用；只拉取会议数据本来也不需要入会，请用用户身份的 `lark_vc_meeting_list_active` + `lark_vc_meeting_events`。
- 入会会让机器人立即出现在参会列表；若用户要求退出 / 离开 / 结束参会，对应的是应用身份离会能力（同样 MCP server 不可用）。

## 参考

- `lark_get_skill(domain="vc-agent", section="meeting-leave")` — ⚠️ 对应的应用身份离会能力（MCP server 不可用）
- `lark_get_skill(domain="vc-agent", section="meeting-list-active")` — 发现当前可读事件的进行中会议 ID
- `lark_get_skill(domain="vc-agent", section="meeting-events")` — 会中事件流
- `lark_get_skill(domain="vc", section="search")` — 搜索历史会议记录
- `lark_get_skill(domain="vc", section="recording")` — 查询 minute_token
- `lark_get_skill(domain="vc", section="detail")` — 获取会议详情
- `lark_get_skill(domain="vc-agent")` — Agent 会中能力（本 skill）
- `lark_get_skill(domain="vc")` — 视频会议原子域（Meeting / Note 等核心概念）

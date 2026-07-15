
# lark_vc_meeting_leave

(authentication is handled automatically by the MCP server)

> ⚠️ **此操作要求应用身份（bot/app identity），通过 MCP server 不可用。** MCP server 始终以用户身份调用，无法让应用机器人离会。本文档保留离会能力的概念说明，便于解释为什么"让机器人退出 / 离开会议"这类请求无法在 MCP 上完成；不要把它当作可直接调用的工具向用户承诺执行。

通过 `meeting_id` 离开应用机器人所在的视频会议（bot leave）。这是一次**写操作**，会实际把应用机器人从会议中移出。

本工具对应 shortcut：`lark_vc_meeting_leave`（调用 `POST /open-apis/vc/v1/bots/leave`）。

## 调用方式（应用身份，MCP server 不可用）

```
# 通过 meeting_id 离会
lark_vc_meeting_leave(meeting_id="69xxxxxxxxxxxxx28")

# 输出格式
lark_vc_meeting_leave(meeting_id="69xxxxxxxxxxxxx28", format="json")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `meeting_id` | 是 | 会议 ID（**不是 9 位会议号**） |

## 核心约束

### 1. 入参是 meeting_id，不是会议号

`meeting_id` 必须是会议的长数字 ID，通常由应用机器人入会返回体中的 `meeting.id` 提供，也可从应用身份 `lark_vc_meeting_list_active`（带 `user_id`）返回体中的 `meeting_id` 获取。**传 9 位会议号会失败**。

### 2. 应用身份能力（MCP server 不可用）

⚠️ 这是应用机器人离会能力，需要与入会或 active meeting 发现相同的应用身份。MCP server 始终以用户身份调用，**无法执行此操作**。只能让当前身份自己离会，无法强制移出其他参会人。

### 3. 当前身份必须在会议中

应用机器人必须已经在该会议中，否则接口会报错。如果 `meeting_id` 来自 `lark_vc_meeting_list_active`，必须确认这是应用身份发现到的会议。

### 4. 离会立即生效，对其他参会人可见

机器人会立刻从参会列表消失；若会议启用了录制/纪要，bot 的参会时段到此截止。只有在用户明确要求退出 / 离开 / 结束参会时才涉及此能力（而该能力在 MCP server 上不可用）。

## 输出结果

接口成功返回时，默认输出：`Left meeting <meeting-id> successfully.`。
`format="json"` 返回 API 原始响应体。

## 如何获取输入参数

| 输入参数 | 获取方式 |
|---------|---------|
| `meeting_id` | 应用机器人入会返回的 `meeting.id`；或应用身份 `lark_vc_meeting_list_active`（带 `user_id`）返回的 `meeting_id` |

## Agent 组合场景

### 场景 1：会后补拉产物（不需要离会，用户身份可用）

如果用户只是要求会议结束后拉录制、纪要或逐字稿，不要先离会；直接跨到 lark-vc 查询会后产物（用户身份即可）。

```
# 会议结束后进入 lark-vc 获取会议产物信息
lark_vc_detail(meeting_ids="<meeting.id>")
```

后续按 `lark_get_skill(domain="vc")` 的产物决策处理：根据 `note_display_type`、`note_id`、`minute_token` 和用户意图选择纪要正文、逐字稿或妙记。

## 常见错误与排查

| 错误现象 | 根本原因 | 解决方案 |
|---------|---------|---------|
| `meeting_id is required` | 未传入 `meeting_id` | 传入应用机器人入会得到的 `meeting.id`，或应用身份 `lark_vc_meeting_list_active` 返回的 `meeting_id` |
| `meeting not found` / `invalid meeting_id` | 误传了 9 位会议号 | 必须使用 `meeting.id`，不是会议号 |
| `not in meeting` | 应用机器人并不在该会议中 | 确认应用机器人先成功入会 |

## 提示

- 此能力需应用身份，MCP server 上不可用。离会会让机器人从参会列表消失，对其他参会人可见，并非真正"不可逆"。
- `meeting_id` 优先使用应用机器人入会返回的 `meeting.id`；如果来自 `lark_vc_meeting_list_active`，必须来自应用身份，并确认应用机器人就在该会议中。不要用 9 位会议号。

## 参考

- `lark_get_skill(domain="vc-agent", section="meeting-join")` — ⚠️ 对应的应用身份入会能力（MCP server 不可用）
- `lark_get_skill(domain="vc-agent", section="meeting-list-active")` — 发现当前可读事件的进行中会议 ID
- `lark_get_skill(domain="vc-agent", section="meeting-events")` — 会中事件流
- `lark_get_skill(domain="vc", section="search")` — 搜索历史会议（获取 meeting_id）
- `lark_get_skill(domain="vc", section="recording")` — 查询 minute_token
- `lark_get_skill(domain="vc", section="detail")` — 获取会议详情
- `lark_get_skill(domain="vc-agent")` — Agent 会中能力（本 skill）
- `lark_get_skill(domain="vc")` — 视频会议原子域（Meeting / Note 等核心概念）

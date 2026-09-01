# 结束会议（应用身份能力，MCP server 未暴露）

(authentication is handled automatically by the MCP server)

> ⚠️ **此操作要求应用身份（bot/app identity），通过 MCP server 不可用。** MCP server 始终以用户身份调用，无法让 Host 应用机器人结束会议。本文档保留结束会议能力的概念说明，便于解释为什么"让机器人把这场会结束掉"这类请求无法在 MCP 上完成；不要把它当作可直接调用的工具向用户承诺执行。

由当前 Host 应用机器人结束整场会议。这是一次**高风险写操作**：结束成功会终止整场会议，对所有参会人可见。

上游以应用身份 shortcut 提供该能力（对应 `POST /open-apis/vc/v1/bots/end`）。因为它只接受应用身份，MCP server 的工具目录里**没有对应工具**——不存在可调用的工具名，任何形如结束会议的调用都会以"工具不存在"失败。

> **不要把结束会议和机器人离会混用。** 用户要求"让机器人退出/离开会议"时对应的是离会能力（`lark_vc_meeting_leave`，同样是应用身份、MCP server 不可用），不是结束整场会议。

## 请求形状（仅作说明，MCP 上无法调用）

结束会议只需要一个长数字 `meeting_id`，标识要结束的那场会议；上游还要求一次显式确认，因为这是高风险写操作。

## 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `meeting_id` | 是 | 长数字 Meeting ID，不是 9 位会议号 |

## 核心约束

### 1. 应用身份能力（MCP server 不可用）

⚠️ 仅支持应用身份，且仅当前 Host 应用机器人可结束进行中的会议。MCP server 始终以用户身份调用，**无法执行此操作**。

### 2. 所需权限

所需应用 Scope：`vc:meeting.bot.manage:write`。

## 常见失败原因

- 当前应用机器人不在会议中：先用同一应用机器人发起或加入该 Calendar 会议，再执行结束。
- 应用机器人在会中但不是当前 Host：将 Host 转交给该机器人，或由当前 Host / Owner 结束会议。
- 会议未启用 Agent 会议能力：确认会议设置及会议 Owner 的必要灰度开关。

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/live-meeting-attend")` — 应用机器人参会与会中互动（⚠️ 其中发起 / 邀请 / 结束 / 离会为应用身份写操作，MCP server 不可用）

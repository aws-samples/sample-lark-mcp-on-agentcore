# 邀请参会人（应用身份能力，MCP server 未暴露）

(authentication is handled automatically by the MCP server)

> ⚠️ **此操作要求应用身份（bot/app identity），通过 MCP server 不可用。** MCP server 始终以用户身份调用，无法以应用机器人身份邀请参会人。本文档保留邀请能力的概念说明，便于解释为什么"让机器人把某人拉进会议"这类请求无法在 MCP 上完成；不要把它当作可直接调用的工具向用户承诺执行。

通过 Agent Bot 接口邀请指定用户，或一键邀请符合条件的 Calendar 参会人。这是一次**写操作**，会对被邀请人产生可见的入会邀请。

上游以应用身份 shortcut 提供该能力（对应 `POST /open-apis/vc/v1/bots/invite`）。因为它只接受应用身份，MCP server 的工具目录里**没有对应工具**——不存在可调用的工具名，任何形如邀请参会人的调用都会以"工具不存在"失败。

## 请求形状（仅作说明，MCP 上无法调用）

邀请需要一个长数字 `meeting_id`，加一个邀请范围：`SELECTED` 时另需被邀请人的 `open_id`（`ou_xxx`），上游支持逗号分隔或重复传入，最多 200 个；`ALL_SUGGESTED` 时由服务端筛选合格的日程参会人、不需要点名，且不得传入 `open_id`。

## 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `meeting_id` | 是 | 长数字 Meeting ID，不是 9 位会议号 |
| `type` | 是 | `SELECTED` 或 `ALL_SUGGESTED`，大小写不敏感 |
| `open_ids` | `SELECTED` 时必填 | 用户 `open_id`（`ou_xxx`），逗号分隔，最多 200 个；`ALL_SUGGESTED` 时不得传入 |

## 核心约束

### 1. 应用身份能力（MCP server 不可用）

⚠️ 该 shortcut 仅支持应用身份。MCP server 始终以用户身份调用，**无法执行此操作**。

### 2. 邀请类型语义

- `SELECTED` 显式发送用户 `open_id`；超过 200 个 ID 的输入会在请求前被本地拒绝。
- `ALL_SUGGESTED` 只发送邀请类型。服务端根据 Calendar 状态解析一键邀请候选集，并应用 200 人上限。
- 请求契约：`SELECTED` 发送 `invite_type=2`、`invitees=[{"id":"ou_xxx","user_type":1}]` 和查询参数 `user_id_type=open_id`；`ALL_SUGGESTED` 发送 `invite_type=1` 且省略 `invitees`。

### 3. 返回契约

- `SELECTED` 可返回显式受邀人的 `invite_results`，按响应 `id` 展示每项 `invited` 或 `failed` 状态。
- `ALL_SUGGESTED` 仅返回聚合字段，不返回逐用户 `invite_results`。
- `ALL_SUGGESTED` 的 `has_more=true` 表示候选人超过服务端单次 200 人上限，**不是可翻页信号**。该接口没有 continuation 或 `page_token`，返回中会给出截断提示而不输出 `has_more`。

## 权限与前置条件

- 目标必须是 Calendar VC 会议，且应用机器人已在会中。
- Agent Invite 依赖会议的 Agent 加入能力。日程未开启 AI/Agent 会议设置时，邀请请求会失败。
- 仅包含一名受邀人的 `SELECTED` 复用普通单点邀请策略，普通会中参会人也可能有权邀请该用户。
- `ALL_SUGGESTED` 和多用户 `SELECTED` 使用批量/建议列表邀请策略。实际调用时应用机器人应为当前 host 或 co-host；普通参会机器人可能没有批量邀请权限。

所需应用 Scope：`vc:meeting.bot.join:write`。这是应用身份专属 scope，无法通过用户 OAuth 授予，因此本项目的 scope 映射里该 shortcut 记为空。

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/live-meeting-attend")` — 应用机器人参会与会中互动（⚠️ 其中发起 / 邀请 / 结束 / 离会为应用身份写操作，MCP server 不可用）
- `lark_get_skill(domain="meeting", section="lark-vc-agent-meeting-join")` — 应用机器人发起或加入会议（⚠️ 应用身份写操作，MCP server 不可用）

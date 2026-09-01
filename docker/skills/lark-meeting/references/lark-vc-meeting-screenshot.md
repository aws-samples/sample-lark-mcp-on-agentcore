# 会议截图（MCP server 不可用）

当前 user-only Remote MCP 不暴露会议截图能力，也不会为它生成增量授权链接。

## 不可用原因

- 上游 `vc +meeting-screenshot` shortcut 调用 `/open-apis/vc/v1/bots/screenshot`。
- 上游声明的权限为 `vc:meeting.realtime:read`，但飞书开放平台不允许普通应用导入该权限。
- 虽然上游元数据把用户身份列为可用身份，但接口路径和开放平台实测均表明该能力不适用于本项目的普通 user-OAuth 部署。

因此，该 shortcut 在生成的 scope 元数据中固定为 `userCallable: false`、`scopes: []`，并从 MCP 工具目录、应用权限导入清单和增量授权 allowlist 中排除。

## 处理规则

- 不要尝试调用会议截图，也不要用其他工具名、原生 API 或身份切换绕过目录限制。
- 不要把 `vc:meeting.realtime:read` 加回应用权限导入清单或增量授权 URL。
- 优先通过会中事件、字幕、聊天和可读取的共享文档回答问题。
- 用户问题必须依赖当前会议画面时，说明当前 user-only Remote MCP 无法读取会议截图，并停止该分支。

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/live-meeting-interact")` — 会中事件与会中互动
- `lark_get_skill(domain="meeting", section="lark-vc-meeting-events")` — 读取会中结构化事件与共享内容

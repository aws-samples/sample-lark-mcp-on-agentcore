# lark_vc_meeting_list_active

(authentication is handled automatically by the MCP server)

列出当前进行中的会议，用来发现 `lark_vc_meeting_events` 需要的长数字 `meeting_id`。

本工具对应 shortcut：`lark_vc_meeting_list_active`（调用 `GET /open-apis/vc/v1/bots/user_active_meeting`）。

## 调用方式

```
# 查询当前登录用户正在参加的会议（用户身份，MCP server 可用）
lark_vc_meeting_list_active(format="json")
```

⚠️ 还有一个**应用身份**模式：传入目标用户 `user_id`（`ou_...`），返回"目标用户当前正在参加、且应用机器人也在会中"的会议。该模式依赖应用身份，而 **MCP server 始终以用户身份调用，因此应用身份模式在 MCP server 上不可用**。在 MCP 上请只使用不带 `user_id` 的用户身份模式。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `user_id` | 否 | ⚠️ 目标用户 open_id（`ou_...`），仅用于**应用身份**模式。该模式在 MCP server 上不可用——MCP 始终以用户身份调用，应省略此参数 |

## 身份语义

不要向用户暴露内部身份缩写；对用户只说"用户身份"或"应用身份"。

| 身份 | 调用 | 返回范围 | 后续事件读取 | MCP 可用 |
| ---- | ---- | -------- | ------------ | -------- |
| 用户身份 | `lark_vc_meeting_list_active(format="json")` | 当前登录用户正在参加的会议 | 继续用 `lark_vc_meeting_events`（用户身份） | ✅ 可用 |
| 应用身份 | 带 `user_id="ou_..."` | 目标用户正在参加、且应用机器人也在会中的会议 | 继续用应用身份读事件 | ⚠️ 不可用 |

硬规则：`meeting_id` 从哪种身份路径拿到，后续 `lark_vc_meeting_events` 就沿用哪种身份。通过 MCP server 时身份始终是用户身份，因此应使用用户身份发现的 `meeting_id`。

用户身份返回空，表示当前登录用户没有可见的进行中会议。

常见流程（用户身份，MCP server 可用）：

```
# 只回答当前登录用户所在会议发生了什么
lark_vc_meeting_list_active(format="json")
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="pretty")
```

## 多会议选择

- 如果返回多个会议，不要自动挑第一个。
- 向用户展示每个候选的 `meeting_title` / `meeting_no` / `meeting_id`，等待用户选择。
- 选择后继续使用发现该会议时的同一身份调用 `lark_vc_meeting_events`（在 MCP 上即用户身份）。

## 9 位会议号匹配

用户提供 9 位会议号但只是询问会中内容时，把会议号当作 active meeting 的筛选条件，而不是写操作指令。

```
# 用户问"我当前这个会讲了什么"
lark_vc_meeting_list_active(format="json")
```

匹配规则：

- 在返回会议中匹配 `meeting_no == <9位会议号>`。
- 匹配到唯一会议：取该项的长数字 `meeting_id`，后续用用户身份调用 `lark_vc_meeting_events`。
- 匹配到多个会议：展示候选，让用户选择。
- 没有匹配：说明当前登录用户没有发现该会议号对应的 active meeting。⚠️ 让应用机器人入会属于应用身份写操作，MCP server 不可用——不要承诺自动入会。

## 常见错误与排查

| 错误现象 | 根本原因 | 解决方案 |
|---------|---------|---------|
| 用户身份返回空列表 | 当前登录用户没有可见的进行中会议 | 确认用户是否在会中 |
| 用户身份无权限 / 不可见 | 当前登录用户没有可见的进行中会议，或当前身份无法读取该会议 | 先确认当前登录用户是否在会中、是否切错身份。⚠️ 若需要查询应用机器人可见的会议，该模式依赖应用身份，在 MCP server 上不可用 |
| 应用身份相关报错 | 应用权限、租户安装、权限可访问的数据范围或 VC Agent privilege 未配置完整 | ⚠️ 应用身份模式在 MCP server 上不可用；权限配置仅供排查参考，按 `lark_get_skill(domain="vc-agent")` 中"应用身份权限配置检查"了解 |

## 参考

- `lark_get_skill(domain="vc-agent", section="meeting-events")` — 使用 `meeting_id` 读取会中事件
- `lark_get_skill(domain="vc-agent", section="meeting-join")` — ⚠️ 应用身份入会能力（MCP server 不可用）
- `lark_get_skill(domain="vc-agent")` — Agent 会中能力（本 skill）
- `lark_get_skill(domain="vc")` — 视频会议原子域（Meeting / Note 等核心概念）

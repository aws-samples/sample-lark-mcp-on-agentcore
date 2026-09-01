---
name: lark-meeting
description: "飞书视频会议：查询会议记录与会议产物(纪要/逐字稿/妙记)、妙记搜索/上传/下载/编辑、机器人参与会议(⚠️ 应用身份写操作，MCP server 不可用)；查询进行中的会议、实时会议内容(发言/聊天/共享文档)问答(会上/会里)、发送会中聊天/表情；基于 meeting_id、meeting_no、event_id、note_id、minute_token、vc-node-id 或妙记 URL 查询相关信息。预约会议、忙闲和会议室管理走 lark-calendar。"
---

# lark-meeting

飞书视频会议业务的统一入口，支持查询会议记录、实时会议互动、管理妙记、阅读智能纪要等操作。本技能负责领域关系、任务路由和跨命令编排。

（认证由 MCP server 自动处理，始终以用户身份执行。）

## 身份约束

MCP server 始终以**用户身份**调用，无法切换为**应用身份**（机器人身份）。因此：

- 用户身份路径可用：发现当前登录用户正在参加的会议、读取该会议的会中事件、发送会中消息、读取当前会议画面（`lark_vc_meeting_screenshot`）、操作会中倒计时（`lark_vc_meeting_countdown`）、查询会议与妙记产物。
- ⚠️ 应用身份路径在 MCP server 上不可用：应用机器人发起或真实入会（`lark_vc_meeting_join`，含 `action="start"`）、离会（`lark_vc_meeting_leave`），以及带 `user_id` 的应用身份活跃会议发现（`lark_vc_meeting_list_active(user_id=...)`）。邀请参会人和结束会议更进一步——它们只接受应用身份，MCP server 的工具目录里连对应工具都没有。遇到这类请求时说明限制并停止，不要为了让调用成功而替换身份或改用其他工具。
- `meeting_id` 从哪条身份路径拿到，后续读事件、发消息、截图、操作倒计时就沿用同一条路径；通过 MCP server 时始终是用户身份发现的 `meeting_id`。
- 向用户说明结果时使用"用户身份"或"应用身份"，不要暴露 `user` / `bot` 这类内部缩写。

## 领域模型与概念

```text
[会议来源]

Calendar 日程 (event_id) ──预约或关联──┐
即时会议（无 event_id）────────────────┴──► 会议 (meeting_id)

Calendar 日程 ──meeting_note────────────► Doc（用户纪要，独立于 AI 智能纪要）

[会议产物]

会议 (meeting_id)
├── AI 总结 ──► Note 智能纪要 (note_id)
│               ├── 智能纪要文档 ───────────► Doc (note_doc_token)
│               ├── 逐字稿
│               │   ├── normal  ──────────► Doc (verbatim_doc_token)
│               │   └── unified ──────────► lark_note_transcript（非独立 Doc）
│               └── 共享文档 ──────────────► Doc (shared_doc_tokens)
│
└── 录制 ──► Minutes 妙记 (minute_token)
                 ├── AI 产物：Summary / Todo / Chapter / Keyword
                 ├── Transcript（文字记录）
                 └── 原始音视频

本地音视频 ─────────────────────────────► Minutes 妙记 (minute_token)
```

| 对象 | 主标识 | 概念与关系 |
|---|---|---|
| Calendar 日程 | `event_id` | 日历上的日程，包含时间、参与人、会议室和 RSVP，可预约或关联 VC 会议；不是完整的会议记录。日程上的 `meeting_note` 是用户手工绑定的 Doc，与 AI 智能纪要无关。 |
| Meeting 会议 | `meeting_id` | 实际发生的视频会议，可以来自 Calendar，也可以是没有日程的即时会议。会议主题、时间、参会人快照和会中事件属于会议数据；Note 与 Minutes 是它可能关联的会后产物。 |
| Note 智能纪要 | `note_id` | 开启 AI 总结后形成的逻辑产物集合。`note_display_type` 决定获取逐字稿中文字记录的不同方式。 |
| Minutes 妙记 | `minute_token` | 由会议录制或本地音视频上传生成，包含总结、待办、章节、关键词、文字记录和原始音视频；可以关联 VC 会议，也可以独立存在。 |
| Doc 文档 | Doc token | 内容载体，不是会议标识。`note_doc_token`、`shared_doc_tokens` 和部分 `verbatim_doc_token` 指向 Doc；Doc token 不能当作 `note_id` 或 `meeting_id`。 |

### 核心标识

- `meeting_id`：会议 ID。长数字字符串，不是 9 位会议号。
- `meeting_no`：会议号。9 位纯数字；工具参数名为 `meeting_number`。
- `minute_token`：妙记 Token。小写字母数字串，通常取自妙记 URL `/minutes/<minute_token>`。

以上标识均按字符串原样传递，不能相互替代。

### 领域不变量

- Note 与 Minutes 分别来自 AI 总结和录制两条独立链路。一场会议可能同时有两类产物、只有其中一类，也可能都没有；不能根据 `note_id` 推断必然存在 `minute_token`，反之亦然。
- Minutes 可以由本地音视频直接生成，因此不一定关联 `meeting_id` 或 Calendar `event_id`。
- Calendar `meeting_note`、Note `note_id`、Minutes `minute_token` 和各类 Doc token 标识不同对象，不能互换、代入其他域的工具或从一者反推另一者。

## 快速行动

### 查询进行中的会议内容

```
# 当前用户所在会议
lark_vc_meeting_list_active()

# 确定唯一 meeting_id 后读取会中事件
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true)
```

同时有多场会议时，需要先选择要查询的会议；只有一场会议时，直接查询该场会议的会议事件。

⚠️ 应用机器人可见的"目标用户会议"发现（`lark_vc_meeting_list_active(user_id="<open_id>")`）属于应用身份路径，MCP server 不可用。该路径本身也只返回"目标用户正在参会、且应用机器人也在同一会议中"的会议，返回空不代表目标用户没有在开会。

## 场景手册

当任务目标与场景匹配时，调用对应的场景手册，按流程执行任务。

- `lark_get_skill(domain="meeting", section="scenes/query-meeting-and-artifacts")`（查询会议及其产物）：按主题、时间、参会人或 `meeting_id` / `meeting_no` / `event_id` 定位历史会议；查询参会人、录像和会议关联的智能纪要或妙记；基于会议记录总结或复盘。
- `lark_get_skill(domain="meeting", section="scenes/query-minutes-and-artifacts")`（查询妙记及其产物）：已有妙记 URL / `minute_token`，或按标题、所有者、参与者搜索妙记；读取总结、待办、章节、关键词、逐字稿，下载原始音视频，或查询关联智能纪要。
- `lark_get_skill(domain="meeting", section="scenes/create-and-edit-minutes")`（生成和修改妙记、管理妙记权限）：将本地音视频生成妙记、逐字稿、总结、待办或章节；修改妙记标题、总结、待办、关键词或说话人；申请妙记权限，或查看、分配妙记协作者权限。
- `lark_get_skill(domain="meeting", section="scenes/query-note-and-artifacts")`（查询智能纪要及关联产物）：已有 `note_id`、智能纪要 Docx URL/token，或需要查询纪要正文、逐字稿、妙记和共享文档等关联产物。
- `lark_get_skill(domain="meeting", section="scenes/live-meeting-attend")`（应用机器人参会与会中互动）：完整编排应用机器人的活跃会议发现、发起或加入、邀请、事件拉取、会议截图、文本/表情/倒计时互动、结束会议和明确授权后的离会。⚠️ 其中的发起 / 入会 / 邀请 / 结束 / 离会是应用身份写操作，MCP server 不可用。
- `lark_get_skill(domain="meeting", section="scenes/live-meeting-interact")`（会中事件与会中互动）：在不触发新的入会/离会操作时，使用用户身份查询活跃会议、查看发言/聊天/共享内容、按需读取当前会议画面，或发送文本/表情、操作倒计时。

## 命令参考

| 工具 | 用途 | 参考方式 |
|---|---|---|
| `lark_vc_search` | 搜索历史会议 | `lark_get_skill(domain="meeting", section="lark-vc-search")` |
| `lark_vc_detail` | 查询会议信息及关联的 Note、Minutes 标识 | `lark_get_skill(domain="meeting", section="lark-vc-detail")` |
| `lark_invoke(tool_name="lark_vc_meeting_get", ...)` | 查询会议基础信息和参会人快照 | `lark_discover(query="vc.meeting.get")` |
| `lark_vc_recording` | 从会议定位录制及妙记 | `lark_get_skill(domain="meeting", section="lark-vc-recording")` |
| `lark_vc_meeting_list_active` | 发现当前可见的进行中会议 | `lark_get_skill(domain="meeting", section="lark-vc-meeting-list-active")` |
| `lark_vc_meeting_events` | 读取会中事件和共享内容 | `lark_get_skill(domain="meeting", section="lark-vc-meeting-events")` |
| `lark_vc_meeting_message_send` | 发送会中文本消息或表情 | `lark_get_skill(domain="meeting", section="lark-vc-meeting-message-send")` |
| `lark_vc_meeting_screenshot` | 获取视频会议截图 | `lark_get_skill(domain="meeting", section="lark-vc-meeting-screenshot")` |
| `lark_vc_meeting_countdown` | 设置、延长、提前结束或关闭会中倒计时 | `lark_get_skill(domain="meeting", section="lark-vc-meeting-countdown")` |
| `lark_vc_meeting_join` | 让应用机器人发起或加入会议（⚠️ 应用身份，MCP server 不可用） | `lark_get_skill(domain="meeting", section="lark-vc-agent-meeting-join")` |
| 邀请参会人（应用身份能力） | 上游仅支持应用身份邀请指定用户或全部合格日程参会人；⚠️ MCP server 工具目录中无对应工具，无法调用 | `lark_get_skill(domain="meeting", section="lark-vc-agent-meeting-invite")` |
| 结束会议（应用身份能力） | 上游仅支持当前 Host 应用机器人结束整场会议；⚠️ MCP server 工具目录中无对应工具，无法调用 | `lark_get_skill(domain="meeting", section="lark-vc-agent-meeting-end")` |
| `lark_vc_meeting_leave` | 让应用机器人离开会议（⚠️ 应用身份，MCP server 不可用） | `lark_get_skill(domain="meeting", section="lark-vc-agent-meeting-leave")` |
| `lark_minutes_search` | 搜索妙记 | `lark_get_skill(domain="meeting", section="lark-minutes-search")` |
| `lark_invoke(tool_name="lark_minutes_minutes_get", ...)` | 查询妙记基础信息 | `lark_discover(query="minutes.minutes.get")` |
| `lark_minutes_detail` | 读取妙记信息和指定产物 | `lark_get_skill(domain="meeting", section="lark-minutes-detail")` |
| `lark_minutes_download` | 下载妙记原始音视频 | `lark_get_skill(domain="meeting", section="lark-minutes-download")` |
| `lark_minutes_upload` | 从云空间音视频生成妙记 | `lark_get_skill(domain="meeting", section="lark-minutes-upload")` |
| `lark_minutes_update` | 修改妙记标题 | `lark_get_skill(domain="meeting", section="lark-minutes-update")` |
| `lark_minutes_speaker_replace` | 替换妙记逐字稿说话人 | `lark_get_skill(domain="meeting", section="lark-minutes-speaker-replace")` |
| `lark_minutes_summary` | 替换妙记 AI 总结 | `lark_get_skill(domain="meeting", section="lark-minutes-summary")` |
| `lark_minutes_todo` | 增删改妙记 AI 待办 | `lark_get_skill(domain="meeting", section="lark-minutes-todo")` |
| `lark_minutes_apply_permission` | 申请妙记查看或编辑权限 | `lark_get_skill(domain="meeting", section="lark-minutes-apply-permission")` |
| `lark_drive_member_list` | 查看妙记协作者及其权限 | `lark_get_skill(domain="drive", section="member-list")` |
| `lark_drive_member_add` | 给指定成员分配妙记查看或编辑权限 | `lark_get_skill(domain="drive", section="member-add")` |
| `lark_minutes_word_replace` | 批量替换妙记逐字稿关键词 | `lark_discover(query="minutes.word_replace")` |
| `lark_note_detail` | 查询智能纪要及关联文档标识 | `lark_get_skill(domain="meeting", section="lark-note-detail")` |
| `lark_note_transcript` | 获取 unified 智能纪要逐字稿 | `lark_get_skill(domain="meeting", section="lark-note-transcript")` |

## 渐进加载规则

按"快速行动 → 场景手册 → 命令参考"渐进加载：

1. 用户目标符合"快速行动"的进入条件时，直接调用对应工具；不要预读场景手册、命令参考或 schema。
2. 不符合快速行动条件，或缺少关键标识、需要消歧、涉及写操作时，读取与目标匹配的一个主场景手册；主场景明确转交到下游场景时，只继续读取被引用的场景或章节，并按其中流程调用工具。
3. 仅当缺少具体参数、返回字段、特殊约束或异常处理方式时：有参考手册的工具调用对应的 `lark_get_skill(domain="meeting", section="<section>")`；没有参考手册的工具调用表中列出的 `lark_discover(...)`。场景或 reference 已给出精确调用方式时，不再调用 `lark_discover`；仅在参数缺失、工具不识别或文档与运行结果冲突时调用。

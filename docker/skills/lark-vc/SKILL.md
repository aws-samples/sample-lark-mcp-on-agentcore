---
name: lark-vc
description: "飞书视频会议：搜索历史会议记录、查询会议纪要（总结/待办/章节/逐字稿）、查询参会人快照。当用户查询已结束的会议、获取会议产物（纪要/妙记）、查看参会人时使用；查询未来日程走 lark-calendar。不负责：Agent 真实入会/离会、会中实时事件（走 lark-vc-agent）。"
---

# vc (v1)

**CRITICAL — 开始前 MUST 先调用 `lark_get_skill(domain="vc", section="vc-domain-boundaries")`**，不读将导致命令使用、会议产物决策、领域边界职责判断错误：
> 1. 了解日历 & VC、会议产物 & 文档的关联关系和职责划分
> 2. 了解会议产物（妙记和纪要）之间的关联关系，例如：**妙记和纪要产生条件相互独立**
> 3. 了解不同会议产物的组成部分，以便根据需求决策使用哪种产物的数据
> 4. 了解会议总结、分析和信息提取的标准流程

## Shortcuts （推荐优先使用）

| Shortcut | 说明 |
|----------|------|
| `lark_vc_search` | 搜索历史会议记录（需至关键词、时间范围、组织者、参与者、会议室少一个筛选条件） |
| `lark_vc_detail` | 通过 meeting_ids 获取会议详情，包括 note_id 和 minute_token |
| `lark_vc_recording` | 通过 meeting_ids 或 calendar_event_ids 查询 minute_token |

- 使用任何 Shortcut 前，必须先调用对应的 `lark_get_skill(domain="vc", section="...")` 了解参数和返回值结构。

## 意图路由

| 用户意图 | 路由到 |
|----------|--------|
| 查"昨天的会议""上周的会""已结束的会议" | 本 skill（`lark_vc_search`，含即时会议） |
| 查日历/日程或未来时间的会议 | lark-calendar |
| 查"今天有哪些会议" | `lark_vc_search`（已结束）+ lark-calendar（未开始），合并展示 |
| 只按自然语言标题查"xx 纪要的逐字稿 / 原始记录 / 谁说了什么" | 先到 lark-drive / lark-doc；仅在已拿到 `note_id` / `vc-node-id` 后再到 lark-note |
| Agent 真实入会/离会、会中实时事件 | lark-vc-agent |
| 妙记信息/时长/封面/链接 | 先走 `lark_vc_detail` 或 `lark_vc_recording` 获取 `minute_token`，再用 lark-minutes 的 `lark_invoke(tool_name="lark_minutes_minutes_get", ...)` |
| 本地音视频文件转纪要/逐字稿 | 先走 lark-minutes 上传，再用 `lark_minutes_detail(minute_tokens="<minute_token>")` |

## 核心概念

- **视频会议（Meeting）**：飞书视频会议实例，通过 meeting_id 标识。已结束的会议支持通过关键词、时间段、参会人、组织者、会议室等条件搜索（见 `lark_vc_search`）。
- **会议纪要（Note）**：视频会议结束后生成的结构化文档，通过 `note_id` 标识，包含纪要文档（总结、待办）和逐字稿文档。`note_display_type` 区分**普通纪要（`normal`）**和 **unified 纪要**；已知 `note_id` 的直查与 unified 原始记录请用 lark-note。
- **妙记（Minutes）**：来源于飞书视频会议的录制产物或用户上传的音视频文件，支持视频/音频的转写，包含总结、待办、章节和文字记录，通过 minute_token 标识。
- **纪要文档（MainDoc）**：AI 智能纪要的主文档，包含 AI 生成的总结和待办，对应 `note_doc_token`。
- **用户会议纪要（MeetingNotes）**：用户主动绑定到日程的纪要文档，对应 `meeting_note`。需先通过 lark-calendar 的 `lark_calendar_meeting` 由 `event_id` 获取。
- **逐字稿（VerbatimDoc）**：会议的逐句文字记录，包含说话人和时间戳。

## 产物选择决策

| 用户意图 | 必须读取的产物 | 禁止 |
|---------|-------------|------|
| 提炼/总结/重新总结/整理会议内容/回顾会议 | 为降低 token 消耗，非必须不得获取 AI 纪要。必须使用原始对话记录（按下方逐字稿路由取得）或妙记文字记录（Transcript），基于原始对话独立分析 | 禁止直接搬运 AI 纪要（`note_doc_token`）的总结作为最终输出 |
| 查看待办/章节 | AI 纪要（`note_doc_token`）或妙记产物 — AI 待办更友好（含提出人和负责人），章节按话题划分更结构化 | — |
| 查看纪要链接/文档地址 | 仅返回文档链接，无需读取内容 | — |
| 直接看 AI 总结结果 | AI 纪要（`note_doc_token`） | — |
| 谁说了什么/完整发言记录 | 原始对话记录（按下方逐字稿路由取得） | — |

> **逐字稿路由**：先用 `lark_vc_detail` 拿到 `note_id`，再用 lark-note 的 `lark_note_detail` 看 `note_display_type`，**不要只看 `verbatim_doc_token` 是否为空**。具体路由以 lark-note 的 `note_display_type` 规则为准。
>
> **为什么"提炼/总结"必须从原始对话记录出发？** AI 纪要是模型对会议的二次压缩，可能遗漏讨论细节、争论过程和隐含决策。用户要求"提炼"或"重新总结"时，期望的是基于原始对话的独立分析，而非对 AI 产物的重新排版。

## 核心场景

### 1. 搜索会议记录
1. 仅支持搜索已结束的会议，对于还未开始的未来会议，需要使用 lark-calendar 技能。
2. 仅支持使用关键词、时间段、参会人、组织者、会议室等筛选条件搜索会议记录，对于不支持的筛选条件，需要提示用户。
3. 搜索结果存在多条数据时，务必注意分页数据获取，不要遗漏任何会议记录。
4. 只有自然语言纪要标题、没有会议线索时，不要把标题当会议关键词；按上方意图路由切到文档搜索。

### 2. 整理会议纪要

> 在选择读取哪个产物前，先确认你理解 AI 总结链路 vs 录制链路的区别。如不确定，先调用 `lark_get_skill(domain="vc", section="vc-domain-boundaries")`。

1. 整理纪要文档时默认给出纪要文档、逐字稿、妙记链接即可，无需读取纪要文档或逐字稿内容。
2. 用户明确需要获取总结、待办、章节产物时，再读取文档获取具体内容。
3. 读取智能纪要（`note_doc_token`）内容时，纪要文档的**第一个 `<whiteboard>`** 标签是封面图（AI 生成的总结可视化），应同时下载展示给用户：

```
# 1. 读取纪要内容
lark_docs_fetch(doc="<note_doc_token>", doc_format="markdown")
# 2. 从返回的 markdown 中提取第一个 <whiteboard token="xxx"/> 的 token
# 3. 下载封面图到聚合目录（和逐字稿、录像同目录，保持产物归拢）
#    并非所有纪要都有封面画板，没有 <whiteboard> 标签时跳过即可
lark_docs_media_download(type="whiteboard", token="<whiteboard_token>", output="./minutes/<minute_token>/cover")
```
> **产物目录规范**：同一会议的所有下载产物（录像、逐字稿、封面图等）统一放到 `./minutes/{minute_token}/` 目录下。这与 `lark_minutes_download` 和 `lark_minutes_detail(minute_tokens=...)` 的默认落点保持一致，便于 Agent 聚合。显式路径（如封面图）需手动对齐到同一目录。

> **纪要相关文档 — 根据用户意图选择：**
> - `note_doc_token` → **AI 智能纪要**（AI 总结 + 待办），由 `lark_note_detail(note_id="<note_id>")` 返回
> - `meeting_note` → **用户绑定到日程的会议纪要**，由 lark-calendar 的 `lark_calendar_meeting(event_ids="<event_id>")` 返回
> - 用户说"逐字稿""完整记录""谁说了什么"时 → 按 `note_display_type` 路由，详见 lark-note
> - 用户说"纪要""总结""纪要内容"时，应同时返回 `note_doc_token` 和 `meeting_note`（如有）
> - 用户意图不明确时，应展示所有文档链接让用户选择，而不是替用户决定
> - 如果用户提供的是**本地音视频文件**并说"转纪要""转逐字稿"，不要直接从 `lark_vc_detail` 开始；应先用 lark-minutes 的上传流程生成 `minute_url`，再提取 `minute_token` 调用 `lark_minutes_detail(minute_tokens="<minute_token>")`

### 3. 纪要文档与逐字稿链接
1. 纪要文档、逐字稿文档与关联的共享文档默认使用文档 Token 返回。
2. 仅需要获取文档名称和 URL 等基本信息时，使用 `lark_invoke` 查询：
```
# 查看命令使用方式
lark_discover(query="drive.metas.batch_query")

# 批量获取文档基本信息: 一次最多查询 10 个文档
lark_invoke(tool_name="lark_drive_metas_batch_query", args={
  data: {"request_docs": [{"doc_type": "docx", "doc_token": "<doc_token>"}], "with_url": true}
})
```
3. 需要获取文档内容时，使用 `lark_docs_fetch`：
```
# 获取文档内容
lark_docs_fetch(doc="<doc_token>", doc_format="markdown")
```

### 4. 查询参会人快照（读操作）

用户问"谁参加过这场会议""这个会议有哪些参会人""某某参会了吗"等**参会人快照**类问题时，使用 **`lark_invoke` 调用 vc meeting get**：这是参会人服务端快照 API，不依赖 bot 身份参会，**已结束会议也可查**：

```
lark_invoke(tool_name="lark_vc_meeting_get", args={
  params: {"meeting_id": "<meeting_id>", "with_participants": true}
})
```

选型判断表：

| 用户意图 | 推荐工具 | 所在 skill |
|---------|---------|--------|
| 参会人快照（谁参加过、何时入/离会，任意时点）| `lark_invoke(tool_name="lark_vc_meeting_get", args={params: {"meeting_id":"...", "with_participants": true}})` | 本 skill |
| 已结束会议的发言内容 | 优先：`lark_vc_detail` 取 `note_id` 再 `lark_note_detail` 取 `verbatim_doc_token` 后 `lark_docs_fetch`；备选：`lark_vc_detail` 取 `minute_token` 再 `lark_minutes_detail(transcript=true)` | lark-note / lark-minutes |
| **进行中会议**的实时事件流（转写、聊天、共享、会中加入/离开）| `lark_vc_meeting_events` | lark-vc-agent |
| **Agent 真实入会 / 离会** | `lark_vc_meeting_join` / `lark_vc_meeting_leave` | lark-vc-agent |

## 资源关系

```text
Meeting (视频会议)
├── Note (会议纪要) ← note_id 标识，note_display_type: normal / unified
│   ├── MainDoc (AI 智能纪要文档, note_doc_token)
│   ├── MeetingNotes (用户绑定的会议纪要文档, meeting_notes)
│   ├── VerbatimDoc (逐字稿, verbatim_doc_token) ← normal 路径
│   ├── UnifiedTranscript (unified 原始记录) ← unified 路径，用 lark-note 的纪要逐字稿（按 note_id）
│   └── SharedDoc (会中共享文档)
└── Minutes (妙记) ← minute_token 标识，由 `lark_vc_detail` 或 `lark_vc_recording` 桥接获取，产物详情走 lark-minutes
    ├── Transcript (文字记录)
    ├── Summary (总结)
    ├── Todos (待办)
    ├── Chapters (章节)
    └── Keywords (推荐关键词)
```

> **MeetingNotes 边界**：用户绑定到日程的会议纪要文档（`meeting_note`）属于日程域，不在 VC 资源关系内；从 `event_id` 用 lark-calendar 的 `lark_calendar_meeting` 获取。
>
> **妙记边界**：`lark_vc_recording` 仅负责把 `meeting_id` / `calendar_event_id` 桥接到 `minute_token`；妙记的总结/待办/章节/逐字稿等产物归 lark-minutes（`lark_minutes_detail`）。
>
> **Note 域边界**：VC 域只负责把 `meeting_id` 转成 `note_id` / `minute_token`，纪要详情归 lark-note。
> - 入口选择：从 `meeting_id` 出发用 `lark_vc_detail` 拿 `note_id` 和 `minute_token`；从 `minute_token` 出发用 `lark_minutes_detail`（详见 lark-minutes）也会返回关联的 `note_id`，可继续走 `lark_note_detail` 拿纪要文档 token。
> - 已有 `note_id` → 直接走 `lark_note_detail` / `lark_note_transcript`（lark-note），不要绕回 VC。
> - 已有 `doc_token` 且目标是读正文 → lark-doc。
> - 只有自然语言纪要标题 → 文档搜索 / Docx 正文读取；有显式 `vc-node-id` 才进入 lark-note。
> - 从日程出发（只有 `event_id`）→ 先走 lark-calendar 的 `lark_calendar_meeting` 拿到 `meeting_id` 或 `meeting_note`，再按上述路径继续。

## API Resources

```
lark_invoke(tool_name="lark_vc_<resource>_<method>", args={...})  # 调用 API
```

### meeting

  - `get` — 获取会议详情（主题、时间、参会人、note_id）

```
# 获取会议基础信息（不含参会人）
lark_invoke(tool_name="lark_vc_meeting_get", args={
  params: {"meeting_id": "<meeting_id>"}
})

# 获取会议基础信息（含参会人）
lark_invoke(tool_name="lark_vc_meeting_get", args={
  params: {"meeting_id": "<meeting_id>", "with_participants": true}
})
```

### minutes（跨域，详见 lark-minutes）

  - `get` — 获取妙记基础信息（标题、时长、封面）；查询妙记**内容**（总结/待办/章节/逐字稿）请用 `lark_minutes_detail`（详见 lark-minutes）

## 不在本 skill 范围

- 查询未来的会议日程 → lark-calendar
- Agent 真实入会/离会、会中实时事件 → lark-vc-agent
- 只有纪要文档标题的逐字稿查询 → 文档搜索 / Docx 正文读取；有显式 `vc-node-id` 才进入 lark-note
- 本地音视频文件转纪要/逐字稿、妙记搜索/下载/上传/重命名/替换说话人 → lark-minutes
- 通过 `note_id` 取纪要文档 Token → lark-note

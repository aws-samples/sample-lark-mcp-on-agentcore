---
name: lark-minutes
description: "飞书妙记：搜索妙记、查看妙记基础信息、下载/上传音视频、读取或编辑妙记的产物内容、改标题、替换说话人/关键词。当给出minute_token、本地音视频文件，要查/改/转妙记产物时使用；本地音视频转纪要/逐字稿优先走本 skill，不要用 ffmpeg/whisper 本地转写。不负责：获取会议关联妙记，或仅按自然语言标题定位纪要"
---

# minutes (v1)

**CRITICAL — 开始前 MUST 先调用 `lark_get_skill(domain="vc", section="vc-domain-boundaries")`**，不读将导致命令使用、会议产物决策、领域边界职责判断错误：
> 1. 了解日历 & VC、会议产物 & 文档的关联关系和职责划分
> 2. 了解会议产物（妙记和纪要）之间的关联关系，例如：**妙记和纪要产生条件相互独立**
> 3. 了解不同会议产物的组成部分，以便根据需求决策使用哪种产物的数据
> 4. 了解会议总结、分析和信息提取的标准流程

## Shortcuts

| Shortcut | 说明 |
|----------|------|
| `lark_minutes_search` | 按关键词、所有者、参与者、时间范围搜索妙记 |
| `lark_minutes_detail` | 查询妙记详情(标题和关联的纪要note_id)，按需获取 AI 产物（总结、待办、章节、逐字稿、关键词） |
| `lark_minutes_download` | 下载妙记音视频媒体文件 |
| `lark_minutes_upload` | 上传 file_token 生成妙记 |
| `lark_minutes_update` | 更新妙记标题 |
| `lark_minutes_speaker_replace` | 替换妙记逐字稿中的说话人（须先用 `lark_invoke` 裸调 speakerlist 取 `speaker_id`） |
| `lark_minutes_word_replace` | 批量替换逐字稿关键词 |
| `lark_minutes_summary` | 替换妙记 AI 总结全文 |
| `lark_minutes_todo` | 新建/更新/删除妙记 AI 待办（单条或 `todos` 批量；不是 lark-task） |

- 使用任何 Shortcut 前，必须先调用对应的 `lark_get_skill(domain="minutes", section="...")` 了解参数和返回值结构。

## 意图路由

| 用户意图 | 命令 |
|---------|------|
| 我的妙记 / 搜索妙记 / 某段时间的妙记 | `lark_minutes_search` |
| 妙记基础信息：标题 / 时长 / 封面 / 链接 | `lark_invoke(tool_name="lark_minutes_minutes_get", ...)` |
| 下载妙记音视频文件、获取媒体下载链接 | `lark_minutes_download`（仅媒体；要妙记内容用 `lark_minutes_detail`） |
| 妙记总结 / 章节 / 待办 / 关键词 / 逐字稿 | `lark_minutes_detail(minute_tokens="<token>")` + 显式产物 flag |
| 基于妙记**提炼/总结/分析/回顾**会议 | `lark_minutes_detail(minute_tokens="<token>", transcript=true)`，再独立分析（**禁止照搬 AI 总结**） |
| 拿这条妙记关联的纪要文档（`note_doc_token` / `verbatim_doc_token` / `shared_doc_tokens`） | `lark_minutes_detail` 取顶层 `note_id` → `lark_note_detail(note_id="...")` |
| 把本地音视频转纪要 / 逐字稿 / 文字稿 | `lark_drive_upload` 取 `file_token` → `lark_minutes_upload` 生成 `minute_url` → `lark_minutes_detail` 拿产物 |
| 在妙记里增加 / 更改 / 删除 AI 待办 | `lark_minutes_todo`（**禁止走 lark-task**） |
| 替换妙记的AI 总结 | `lark_minutes_summary` |
| 重命名妙记/改妙记标题 | `lark_minutes_update` |
| 替换说话人/把 A 的发言改成 B/重新归属发言人/把外部（非飞书）说话人改成飞书用户 | 先用 `lark_invoke(tool_name="lark_api_GET", ...)` 裸调 `.../transcript/speakerlist` 取 `speaker_id`，再 `lark_minutes_speaker_replace`；`from_speaker_id` 只传 id，不传展示名 |
| 批量替换逐字稿关键词 | `lark_minutes_word_replace` |
| 用户同时提到"会议/开会"和"妙记" | 先 lark-vc（`lark_vc_search` → `lark_vc_recording`）获取 `minute_token`，再本 skill |

## 核心概念

- **妙记（Minutes）**：来源于飞书视频会议的录制产物或用户上传的音视频文件，通过 `minute_token` 标识。
- **妙记 Token（minute_token）**：妙记的唯一标识符，可从妙记 URL 末尾提取（如 `https://*.feishu.cn/minutes/obcnxxx` 中的 `obcnxxx`）。如果 URL 中包含额外参数（如 `?xxx`），截取路径最后一段。

## 核心场景

### 1. 搜索妙记

1. 如果是会议的妙记，应优先通过 lark-vc 定位会议并获取 `minute_token`。
2. 会议场景的妙记路由，以及"参与的妙记"如何解释，统一以 `lark_get_skill(domain="minutes", section="search")` 为准。


### 2. 查看妙记基础信息

1. 当用户只需要确认某条妙记的标题、封面、时长、所有者、URL 等基础信息时，使用 `lark_invoke(tool_name="lark_minutes_minutes_get", args={params: {"minute_token": "obcn..."}})`。
2. 如果是会议 / 日程上下文中的妙记基础信息，先通过 VC/Calendar 链路拿到 `minute_token`，再调用上述工具。
3. 用户意图不明确时，默认先给基础元信息，帮助确认是否命中目标妙记。


### 3. 上传音视频文件生成妙记（并可继续获取纪要 / 逐字稿）

1. 当用户说"把音视频文件转成纪要""把录音转成逐字稿/文字稿/撰写文字""把 mp4/mp3 转成总结/待办/章节"时，也先走这个入口。
2. **处理流程**：
   - **上传音视频获取 `file_token`**：使用 `lark_get_skill(domain="drive", section="upload")` 上传本地文件到云空间（云盘/云存储）并获取 `file_token`。
   - **生成妙记**：获取到 `file_token` 后，调用 `lark_minutes_upload(file_token="<file_token>")` 将文件转换为妙记并获取 `minute_url` 链接。
   - **继续获取纪要 / 逐字稿（按需）**：如果用户目标不是只要妙记链接，而是要纪要、逐字稿、总结、待办或章节，则从 `minute_url` 中提取 `minute_token`，再调用 `lark_minutes_detail(minute_tokens="<minute_token>")` 获取对应产物。

> **注意**：必须先获取飞书云空间（云盘/云存储）的 `file_token` 才能进行转换。
>
> **不要误走本地转写工具**：当用户目标是把本地音视频文件转成纪要、逐字稿、文字稿、撰写文字时，不要改用 `ffmpeg`、`whisper` 或其他本地 ASR/转码命令；标准路径就是 `lark_drive_upload -> lark_minutes_upload -> lark_minutes_detail`。

### 5. 编辑妙记的 AI 待办与 AI 总结（写入）

当用户要在**某条妙记内**操作 AI 待办或 AI 总结时使用本节。**不是**飞书任务（Task）清单里的待办。

**触发信号（任一命中即走本 skill，禁止走 lark-task）**：

- "在（某条）妙记里新建 / 添加 / 修改 / 删除待办"
- "把妙记 A 的待办改成已完成 / 未完成"
- "妙记里的任务1 / 任务2"（上下文已明确是妙记）
- 已给出 `minute_token` 或妙记 URL，且要改待办 / 总结

**妙记 AI 待办 vs 飞书任务 Task**：

| 用户意图 | 正确工具 | 错误工具 |
|---------|---------|---------|
| 妙记里加待办 | `lark_minutes_todo(operation="add")` 或 `todos="[...]"` | `lark_task_create` / `lark_invoke(tool_name="lark_task_tasklists_list")` |
| 妙记里改待办 | `lark_minutes_todo(operation="update", todo_id="...")` | `lark_task_update` |
| 妙记里删待办 | `lark_minutes_todo(operation="delete", todo_id="...")` | `lark_invoke(tool_name="lark_task_tasks_delete")` |
| 我的任务清单 | — | 走 lark-task |

**新建多条待办**：优先用 `todos` 一次提交；单条则用多次 `operation="add"`：

```
# 批量：任务1 已完成 + 任务2 未完成
lark_minutes_todo(minute_token="<token>", todos=[
  {"operation":"add","content":"晚上好1","is_done":true},
  {"operation":"add","content":"晚上好2","is_done":false}
])
```

**更新 / 删除前**：先用 `lark_minutes_detail(minute_tokens="<token>", todo=true)` 读取 `todos[].todo_id`（按 `content` 匹配目标条目；列表顺序不保证稳定，**不要**用"第 2 条"代替 `todo_id`）。

**无编辑权限**：若工具返回 `error.type=no_edit_permission`，表示对**这条妙记**没有编辑权，应请所有者授权。

**逐字稿关键词替换无命中**：`lark_minutes_word_replace` 时，若工具返回 `error.type=words_not_found`，表示传入的 `source_word` 在该妙记逐字稿中**一个都没匹配到**，未做任何替换。这是**参数问题不是权限问题**：先用 `lark_minutes_detail(minute_tokens="<token>", transcript=true)` 读取当前逐字稿，核对 `source_word` 的精确写法与大小写后重试。

**替换 AI 总结全文**：见 `lark_get_skill(domain="minutes", section="summary")`。

> 使用 `lark_minutes_todo` 前必须先调用 `lark_get_skill(domain="minutes", section="todo")`；使用 `lark_minutes_summary` 前必须先调用 `lark_get_skill(domain="minutes", section="summary")`。

### 7. 替换妙记逐字稿说话人

当用户要把妙记里某说话人的发言改绑到另一位飞书用户时使用。

**触发信号**：「替换说话人」「把 A 的发言改成 B」「说话人识别错了」「把外部说话人改成飞书用户」等。

**Agent 必读流程**（详见 `lark_get_skill(domain="minutes", section="speaker-replace")`）：

1. 确认 `minute_token`。
2. **先**用 `lark_invoke(tool_name="lark_api_GET", args={params: {"path": "/open-apis/minutes/v1/minutes/<token>/transcript/speakerlist"}})` 查说话人列表（内部 HTTP，无 shortcut、无公开 OpenAPI 文档页）。
3. 根据用户描述的原说话人展示名，在返回的 `data.speakers[]` 中匹配 `name` → 得到 `speaker_id`；同名多人时结合 `lark_vc_notes` 逐字稿请用户确认，**不要擅自挑选**。
4. 新说话人姓名用 `lark_get_skill(domain="contact")` 解析为 `ou_` open_id。
5. 调用 `lark_minutes_speaker_replace`，**`from_speaker_id` 只传步骤 3 的 `speaker_id`，禁止传展示名**。

## 行为规则

### 1. `lark_minutes_detail` 必须显式声明产物 flag

不传 `summary` / `todo` / `chapter` / `keyword` / `transcript` 时只返回基础信息（含顶层 `note_id`），AI 产物字段一律不返回。即使产物为空也会返回空值字段，便于程序化处理。

```
# 拿全产物
lark_minutes_detail(minute_tokens="<token>", summary=true, todo=true, chapter=true, keyword=true, transcript=true)
```

### 2. "提炼 / 总结"必须基于 Transcript，不要照搬 AI 总结

AI 总结是模型对会议的二次压缩，可能遗漏争论过程和隐含决策。用户要求"提炼"或"重新总结"时，期望基于原始发言独立分析，而非搬运 AI 产物。**优先 `transcript=true`，再独立写结论**。

### 3. 从妙记反查纪要：不绕 lark-vc

`lark_minutes_detail` 顶层直接返回 `note_id`（仅在该妙记关联纪要时存在）。不需要绕回 lark-vc，直接：

```
# 1) 取 note_id（顶层 .minutes[0].note_id）
lark_minutes_detail(minute_tokens="<minute_token>")
# 2) 用上一步拿到的 note_id 读纪要 token
lark_note_detail(note_id="<note_id>")   # 拿 note_doc_token / verbatim_doc_token / shared_doc_tokens
```

顶层无 `note_id` 字段即代表无关联纪要，到此为止——不要继续尝试用 `minute_token` 当 `note_id`。


## API Resources

```
lark_invoke(tool_name="lark_minutes_<resource>_<method>", args={...})  # 调用 API
```

### minutes

- `get` — 获取妙记信息

> **权限错误**：如果返回 `[2091005] permission deny`，表示用户没有对应妙记文件的阅读权限，需提示用户联系妙记 owner 申请权限。

## 不在本 skill 范围

- 搜索历史会议记录、查参会人快照 → lark-vc
- 未来日程 / 日历查询 → lark-calendar
- 已知 `note_id` 直接读纪要详情 → lark-note
- 飞书任务清单（个人 Todo / 共享清单） → lark-task
- 只有自然语言纪要标题、没有 `minute_token` / 妙记 URL / 本地音视频时定位逐字稿 → 文档搜索（`lark_get_skill(domain="drive")` / `lark_get_skill(domain="doc")`）

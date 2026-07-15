
# lark_vc_meeting_events

(authentication is handled automatically by the MCP server)

查询一场正在进行的视频会议中的会中事件列表。该工具是**读操作**，必须沿用 `meeting_id` 的来源身份：用户身份发现的会议继续用用户身份读。对已结束会议，存在一个**结束后 5 分钟内的宽限窗口**。

> ⚠️ 还存在一条**应用身份**读取路径（应用机器人入会或应用身份发现的会议继续用应用身份读），但应用身份依赖 MCP server 不支持的 bot 身份，**在 MCP server 上不可用**。通过 MCP server 时身份始终是用户身份，因此应使用用户身份发现的 `meeting_id`。

本工具对应 shortcut：`lark_vc_meeting_events`（调用 `GET /open-apis/vc/v1/bots/events`）。

可见性边界：

- `meeting_id` 来自用户身份的 `lark_vc_meeting_list_active`：后续读取事件继续用用户身份。这是 MCP server 上可用的路径。
- ⚠️ `meeting_id` 来自应用身份 `lark_vc_meeting_list_active`（带 `user_id`）或应用机器人入会：后续读取事件需用应用身份，**MCP server 上不可用**。
- 用户身份 active meeting 返回的是当前登录用户正在参加的会议，不表示可以读取任意 `meeting_id`。

## 调用方式

```
# 默认用法：全量拉取当前可见事件
lark_vc_meeting_events(meeting_id="69xxxxxxxxxxxxx28", page_all=true, format="pretty")

# 指定时间范围，并拉全该时间窗内当前可见事件
lark_vc_meeting_events(meeting_id="69xxxxxxxxxxxxx28", start="2026-04-17T15:00:00+08:00", end="2026-04-17T16:00:00+08:00", page_all=true, format="pretty")

# 基于上一次保存的 page_token 继续查新增事件
lark_vc_meeting_events(meeting_id="69xxxxxxxxxxxxx28", page_token="<last_page_token>", page_all=true, format="pretty")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `meeting_id` | 是 | 会议 ID（长数字 ID，不是 9 位会议号） |
| `start` | 否 | 起始时间，支持 ISO 8601 / `YYYY-MM-DD` / Unix 秒 |
| `end` | 否 | 结束时间，支持 ISO 8601 / `YYYY-MM-DD` / Unix 秒 |
| `page_token` | 否 | 从指定分页游标继续拉取下一页 |
| `page_size` | 否 | 单页模式每页大小。工具会自动夹紧到 `20-100`；传 `page_all=true` 时固定使用 `100` |
| `page_all` | 否 | 自动分页，直到没有更多页面为止（内部有安全上限） |
| `format` | 否 | 输出格式：json (默认) / pretty（本 skill 推荐默认） / table / ndjson / csv |

## 核心约束

### 1. 输入必须是 meeting_id，不是 9 位会议号

`meeting_id` 必须是会议的长数字 ID。它通常来自：
- `lark_vc_meeting_list_active` 返回体中的 `meeting_id`
- `lark_vc_search` 结果中的 `id`
- ⚠️ 应用机器人入会返回体中的 `meeting.id`（应用身份路径，MCP server 不可用）

**不要**把 9 位会议号（`meeting_number`）传给这个工具。
如果 `meeting_id` 来自 `lark_vc_meeting_list_active`，后续 `lark_vc_meeting_events` 必须沿用同一身份；如果返回多个会议，先让用户选择具体 `meeting_id`。

如果用户提供的是 9 位会议号，先用用户身份查 active meetings 并按 `meeting_no` 匹配。匹配到唯一项后，取该项的长数字 `meeting_id`，再用用户身份调用本工具；匹配失败时不要尝试入会（入会是应用身份写操作，MCP 不可用）。

### 2. 身份来源是读取事件的权限锚点

- 用户身份路径（MCP server 可用）：先用 `lark_vc_meeting_list_active` 发现当前登录用户的会议，再用 `lark_vc_meeting_events` 读取该 `meeting_id`，全程用户身份。
- ⚠️ 应用身份路径：应用机器人必须在会中或参会过，需用应用身份读取——该路径在 MCP server 上不可用。
- 不要混用身份。身份不一致时，常见结果是空列表、`no permission` 或 `bot is not in meeting`。

### 3. 读取事件前必须先拿到可见的 meeting_id

最稳妥的调用顺序（用户身份，MCP server 可用）：

```
# 先发现当前登录用户所在会议
lark_vc_meeting_list_active(format="json")

# 再用同一身份读取该会议事件
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="pretty")
```

> ⚠️ 另有一条应用身份路径：让应用机器人先入会，或用应用身份发现 active meeting，再用应用身份读事件。该路径依赖 bot 身份，**MCP server 上不可用**。

若读取主体已离会、未入会、或会议已经无法再判断身份，后端通常会报：
- `bot is not in meeting, no permission`

更精确地说，后端当前的判断规则是：

- **会议进行中**：要求读取主体**当前仍在会中**
- **会议已结束后的 5 分钟内**：只要读取主体**曾经在这场会中出现过**，仍可拉取事件
- **会议结束超过 5 分钟**：按会议结束处理，通常不再返回事件流
- **从未真实入会过**：即使会议仍在进行或刚结束，也会返回 `10005 bot is not in meeting`

### 4. 自动分页规则

- **先分清两层默认值**：
  - shortcut 本身：不传 `page_all` 时，只查 1 页。
  - 本 skill 的默认策略：除非用户明确要求只看一页，或你确实需要控制返回体大小，否则默认**必须主动带 `page_all=true`**，把当前可见事件尽量一次拉全。
- 传 `page_all=true`：开启自动分页，直到没有更多页面为止。
- `page_all=true` 时，工具固定使用最大 `page_size=100`。

执行准则：

- **默认调用模板**：`lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="pretty")`
- 如果你发现自己执行成了不带 `page_all` 的单页查询，而响应里又出现 `has_more=true` / `more available` / 非空 `page_token`，应立刻意识到这只是部分结果。
- 遇到上述情况，默认补救方式是继续使用返回的 `page_token` 续拉，例如：`lark_vc_meeting_events(meeting_id="<meeting_id>", page_token="<returned_page_token>", page_all=true, format="pretty")`
- 只有在用户明确要求"就看第一页""先不要翻页"时，才不要默认带 `page_all=true`
- 只要你是基于 `lark_vc_meeting_events` 来回答一场**正在进行中的会议内容**，就不能直接复用上一次查询结果。无论用户是在问"现在是谁在说话""刚刚发生了什么""最新事件有哪些"，还是让你"总结一下这个会议讲什么"，都必须先重新执行一次 `lark_vc_meeting_events`，确认拿到的是最新事件流，再回答用户。只有在用户明确要求基于某次历史快照继续分析时，才可以复用旧结果。

### 5. 输出格式差异

- `format="json"`：结构化契约，顶层包含 `meeting`、`identity`、`events`、`has_more`、`page_token`。`identity` 表示当前读取身份；事件 actor 统一含 `participant_type`、`role`、`label`；每条事件保留 `payload` 便于追溯细节。
- `format="pretty"`：默认推荐格式，输出当前身份和逐条时间线，适合快速理解"发生了什么"。
- `format="ndjson"`：输出事件行，并带 metadata 行，适合流式消费。

**选型原则**：只在 `pretty`、`json`、`ndjson` 之间选择。目标是告诉用户"发生了什么"时，用 `page_all=true, format="pretty"`；需要稳定字段给 agent 做结构化消费、总结、转发或二次处理时用 `format="json"`；需要流式消费时用 `format="ndjson"`。

> **注意**：pretty 输出中的正文文本会做单行转义，真实换行会显示为 `\n`，避免打乱时间线布局。

### 6. 内容理解模式：共享文档不能只看标题

当用户意图是：

- "总结这个会议"
- "这个会议讲了什么"
- "有哪些结论 / 待办 / 关键讨论"
- "共享文档里在讲什么"

不要只基于事件时间线直接回答。此时 `lark_vc_meeting_events` 只是**线索发现器**，不是最终信息源。

执行准则：

- 如果上下文已有明确 `meeting_id`，直接用同一身份执行 `lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="json")`。
- 如果上下文没有明确 `meeting_id`，先用用户身份发现当前用户所在会议：`lark_vc_meeting_list_active(format="pretty")`。返回多个会议时先让用户选择。
- 如果上下文只有 9 位会议号，先用用户身份执行 `lark_vc_meeting_list_active` 并按 `meeting_no` 匹配；匹配到唯一会议后再查事件。不要为了总结会议而尝试入会（应用身份写操作，MCP 不可用）。
- 这类问题拿到 `meeting_id` 后，用 `lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="json")` 拉取最新事件流。
- 如果事件中出现共享文档线索，例如：
  - `magic_share_started`
  - `share_doc.title`
  - `share_doc.url`
- 必须继续读取共享文档内容，再生成总结，不能只根据"开始共享了某文档"这条事件和文档标题来概括会议内容。
- 若存在多个共享文档，优先读取**最近一次共享**的文档。
- 若文档读取失败，必须明确说明"以下总结仅基于会中事件流，未成功读取共享文档内容"。

### 7. 关于 `page_token` 的返回与续拉

- 不管这次是只查 1 页，还是通过 `page_all=true` 已经把当前可见事件都拿完，都应把最后拿到的 `page_token` 一并保留下来并返回给用户。
- 只要响应里出现 `has_more=true`、pretty 里出现 `more available`，或返回了非空 `page_token`，就必须先判断当前结果是否完整；默认情况下，这意味着你还需要继续分页。
- 如果没有使用 `page_all=true`，但出现了上述分页信号，默认应继续用返回的 `page_token` 拉下一页，而不是直接结束。只有在用户明确不要继续翻页时，才可以停止并明确说明当前结果不完整。
- 下次继续"查新增事件"时，应优先复用上一次保存的 `page_token`，而不是从头全量再拉一次。
- 只有在用户明确要求"从头回放全部事件"时，才忽略历史 `page_token`，重新从第一页开始。
- 但如果用户要你回答的是**当前这场会正在讲什么**，而不是"上一次之后新增了什么"，也要先做一次新的事件查询，再决定是否需要基于旧 `page_token` 继续补拉。

## 返回结构

常见顶层字段：

| 字段 | 说明 |
|------|------|
| `meeting` | 会议身份与时间状态，包含 `id/topic/meeting_no/start_time/end_time/status` |
| `identity` | 当前读取身份，包含 `id/name/participant_type/label` |
| `events` | 结构化事件列表；每条事件含参与者 `actors` 和事件细节 `payload` |
| `warnings` | 非阻断告警列表；事件列表本身仍可使用 |
| `has_more` | 是否还有下一页 |
| `page_token` | 下一页游标 |

事件 `event_type` 常见类型：

| event_type | 含义 |
|-----------|------|
| `participant_joined` | 有参会人加入会议 |
| `participant_left` | 有参会人离开会议 |
| `chat_received` | 收到会中聊天消息 |
| `transcript_received` | 收到转写文本 |
| `magic_share_started` | 开始共享内容 / 文档 |
| `magic_share_ended` | 结束共享 |

### 会中聊天与 reaction 转发到 IM

转发到 IM 时，Agent 必须先用 `lark_vc_meeting_events(format="json")` 的结构化事件构造完整 Feishu `post` 内容，再调用 `lark_im_messages_send` 发送。不要解析 pretty/Markdown 输出，也不要先生成纯文本或 Markdown 后再期望 IM 侧二次识别 reaction。

对 `event_type == "chat_received"` 的事件逐项处理 `payload.chat_received_items`：

- `message_type == 3` 是会中 reaction；构造 IM `post` 内容时，先调用 `lark_get_skill(domain="im", section="reactions")` 取 reaction emoji 列表作为 IM `emotion` 白名单。白名单内的 key 写成 `{"tag":"emotion","emoji_type":"<content>"}`，例如 `JIAYI`、`THUMBSUP`、`OK`。
- 对不在 IM reaction emoji 白名单内的 reaction key，保留原始 key 但写成文本节点，例如 `{"tag":"text","text":"[<content>]"}`；不应直接写入 `emotion.emoji_type`，否则 IM 发送会失败。
- 不要大小写归一化或猜测映射；`content` 是原始 reaction key，必须原样判断。
- 其他聊天消息写成文本节点：`{"tag":"text","text":"<content>"}`。
- 最终调用 `lark_im_messages_send(msg_type="post", content="<post-json>")`，其中 `<post-json>` 应混合使用可渲染 `emotion` 节点和文本 fallback；不要用 markdown 承载会中 reaction。
- 如果 IM 返回 `message_content_emotion_tag's emoji_type is invalid`，只降级非法 reaction key，不要把整条消息退化成纯文本。
- 如果用户原始请求已经明确"发给我 / 推送给我 / 发到我的聊天框 / 发到我的单聊"，这已经覆盖本次收件人、内容和发送动作，直接发送给当前用户，不要再二次询问"是否发送"。
- MCP server 始终以用户身份发送；上游默认用应用身份发送在 MCP server 上不可用。
- 如果用户要求发给某个群或其他人但收件人不可唯一确定，只询问缺失的收件人信息。

```
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="json")
```

如果用户已经要求"发给我"，`<open_id>` 使用当前用户的 open_id；需要解析时先用用户查询能力获取当前用户信息。构造 IM post 时只发送用户请求范围内的会中内容，不要把前一条自然语言预览当作发送内容。

## pretty 输出示例

```text
会议主题：张三的视频会议
会议时间：2026-04-17 15:28:52（进行中）

[00:00:33] 明日之虾BOE(ou_xxx) 加入了会议
[00:00:41] 张三(ou_xxx): [text] 6666
[00:00:44] 张三(ou_xxx) 开始共享《智能纪要：飞书20251022-140223 2026年3月9日》
           URL: https://...
[00:01:32] 张三(ou_xxx): [reaction] JIAYI
```

## 如何获取输入参数

| 输入参数 | 获取方式 |
|---------|---------|
| `meeting_id` | `lark_vc_meeting_list_active` 返回的 `meeting_id`；或 `lark_vc_search` 结果中的 `id`；⚠️ 或应用机器人入会返回的 `meeting.id`（应用身份，MCP 不可用）。必须同时记录来源身份 |
| `start` / `end` | 用户给出的时间范围；如未给出则默认取全量可见事件 |
| `page_token` | 上一页或上一次查询结果中保存的 `page_token`；建议持久化保存，便于下次继续拉取新增事件 |

## Agent 组合场景

### 场景 1：发现当前用户所在会议 → 读事件（用户身份，MCP server 可用）

```
lark_vc_meeting_list_active(format="json")
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="pretty")
```

### 场景 2：过滤某段时间内的事件

```
lark_vc_meeting_events(meeting_id="<meeting_id>", start="2026-04-17T15:00:00+08:00", end="2026-04-17T16:00:00+08:00", page_all=true, format="pretty")
```

### 场景 3：基于上一次的 `page_token` 继续查新增事件

```
# 上一次查询结束后，保留最后返回的 page_token
# 这次直接从该游标继续拉新增事件
lark_vc_meeting_events(meeting_id="<meeting_id>", page_token="<last_page_token>", page_all=true, format="pretty")
```

适用规则：

- 当用户说"继续看新事件""看上次之后新增了什么"时，优先使用上一次保存的 `page_token`。
- 如果这次返回里仍有 `has_more=true`、pretty 里出现 `more available`，或又返回了新的 `page_token`，说明新增事件还没拉完，应继续分页，而不是把当前页误当成完整增量结果。
- 只有在用户明确要求"从头回放全部事件"时，才忽略已有 `page_token`，重新从第一页开始。

## 常见错误与排查

| 错误现象 | 根本原因 | 解决方案 |
|---------|---------|---------|
| `meeting_id is required` | 未传入 `meeting_id` | 传入长数字 `meeting_id` |
| `not a 9-digit meeting number` | 把 9 位会议号误传给 `meeting_id` | 如果只是查询会中内容，先用 `lark_vc_meeting_list_active` 按 `meeting_no` 匹配拿长数字 `meeting_id`；不要尝试入会（应用身份写操作，MCP 不可用） |
| `10005 bot is not in meeting` | 用应用身份读取但应用机器人从未真实入会；或会议已结束但从未在会中出现过 | 如果本来是用户身份发现的 `meeting_id`，确认全程用用户身份读取。⚠️ 应用身份入会读取在 MCP server 上不可用。**如果只是想看参会人快照，改用 `lark_invoke(tool_name="lark_vc_meeting_get", args={params: {"meeting_id": "<meeting.id>"}, with_participants: true})`** |
| 用户身份无权限 / 不可见 | 当前用户不是该会议的可见参与者，或 `meeting_id` 不是从用户身份路径获得 | 先确认 `meeting_id` 来自用户身份的 `lark_vc_meeting_list_active`，且当前用户确实正在该会议中。⚠️ 若确实需要应用身份读取，该路径依赖 bot 身份，在 MCP server 上不可用 |
| `20001 meeting_status_MEETING_END` | 会议已结束且已超出后端允许的 5 分钟宽限窗口 | 本接口不再适合继续拉取事件。先用 `lark_vc_detail(meeting_ids="<meeting.id>")` 获取会议产物信息，再根据 `note_display_type` / `note_id` / `minute_token` 和用户意图选择纪要正文、逐字稿或妙记；参会人请用 `lark_invoke(tool_name="lark_vc_meeting_get", args={params: {"meeting_id": "<meeting.id>"}, with_participants: true})` |
| `20002 meeting not exist` | `meeting_id` 错误，或会议实例当前已不可获取（常见于把 9 位会议号当 meeting_id 传） | 确认传入的是长数字 `meeting_id`，不是 9 位会议号 |
| 应用身份权限不足 | 应用权限、租户安装、权限可访问的数据范围或 VC Agent privilege 未配置完整 | ⚠️ 应用身份操作在 MCP server 上不可用；权限配置仅供排查参考，以工具返回的 metadata / error envelope 为准确认缺失权限；检查应用发布/安装，以及开放平台"权限可访问的数据范围"：选择"按条件筛选"，条件为"会议的归属者 包含 与应用的可用范围一致"；仍失败再排查内测 privilege / 灰度 |
| `HTTP 404` / `HTTP 500` | 服务端当前无法找到或处理该会议实例 | 换一个正在进行且可见的 meeting_id，或排查后端问题 |

## 提示

- 这是**会中事件流**查询，不适合拿来搜历史会议记录；搜历史会议请用 `lark_vc_search`。
- 如果会议已经结束，不要卡在 `lark_vc_meeting_events`：
  - 先用 `lark_vc_detail(meeting_ids="<meeting.id>")` 获取会议产物信息。
  - 再根据 `note_display_type`、`note_id`、`minute_token` 和用户意图，按 `lark_get_skill(domain="vc")` 的产物决策读取纪要正文、逐字稿或妙记。
- 事件列表是否完整，取决于读取主体何时入会、何时离会，以及后端当前可见的会中事件范围。对于已结束会议，通常只在**结束后 5 分钟内**、且**曾经在会中**时还能继续拉到事件。
- 查询"谁参加过某会议"请用 `lark_invoke(tool_name="lark_vc_meeting_get", args={params: {"meeting_id": "<id>"}, with_participants: true})`——这是参会人**快照** API，不依赖 bot 是否参会，对已结束会议也可查；**不要** 用 `lark_vc_meeting_events` 做参会人查询。

## 参考

- `lark_get_skill(domain="vc-agent", section="meeting-list-active")` — 发现当前可读事件的进行中会议 ID
- `lark_get_skill(domain="vc-agent", section="meeting-join")` — ⚠️ 应用身份入会（MCP server 不可用）
- `lark_get_skill(domain="vc-agent", section="meeting-leave")` — ⚠️ 应用身份离会（MCP server 不可用）
- `lark_get_skill(domain="vc", section="search")` — 搜索历史会议（获取 meeting_id）
- `lark_get_skill(domain="vc", section="recording")` — 查询 minute_token
- `lark_get_skill(domain="vc", section="detail")` — 获取会议详情
- `lark_get_skill(domain="vc-agent")` — Agent 会中能力（本 skill）
- `lark_get_skill(domain="vc")` — 视频会议原子域（Meeting / Note 等核心概念）

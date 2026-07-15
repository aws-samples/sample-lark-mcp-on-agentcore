---
name: lark-vc-agent
description: "飞书视频会议会中能力：发现当前用户正在进行中的会议并读取当前身份可见的会中事件，如参会人加入/离开、发言、聊天、屏幕共享，也可向进行中的会议发送会中文本消息或会中表情。适用于用户询问正在开的会议发生了什么、谁在发言、是否共享内容、想在会里发一句话或发反馈，或需要发现当前可读的进行中会议 ID（lark_vc_meeting_list_active）。读取事件用 lark_vc_meeting_events，发送会中文本或表情用 lark_vc_meeting_message_send。不负责已结束会议搜索、参会人快照、纪要、逐字稿或录制查询，这些使用 lark-vc 技能。"
---

# vc-agent (v1)

(authentication is handled automatically by the MCP server)

调用前先调用 `lark_get_skill(domain="vc")` 了解视频会议的核心概念（Meeting / Note / Minutes 等），本 skill 直接复用，不再重复定义。

## 内测提示

- 当前功能正在内测中，仅少数用户可用。
- 如果工具提示 `missing required scope(s)` / `permission_violations`，不要走普通权限申请流程；先提示用户加入早鸟群确认内测权限已开通：`https://go.larkoffice.com/join-chat/2f4nb0e1-fe00-4f67-bed7-25beaf533fbd`，再按"应用身份权限配置检查"处理应用权限、安装和数据范围。
- 如果工具返回 `error.code=20017` / `ErrNotInGray`，提示用户加入早鸟群：`https://go.larkoffice.com/join-chat/2f4nb0e1-fe00-4f67-bed7-25beaf533fbd`。

## 定位

本 skill 与 `lark-vc` 并列：

- **`lark-vc`** **负责"会后查询"**：搜索历史会议、参会人快照、纪要/逐字稿/录制
- **`lark-vc-agent`** **负责"会中动作"**：发现进行中会议 / 读取进行中会议的实时事件 / 发送会中文本或会中表情 /（应用身份）机器人入会、离会

按此分工路由，避免两个 skill 语义混淆。

| 用户意图示例                                                     | 应路由到                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| "我/某个用户现在在哪个会里"、"给我找当前可拉事件的 meeting_id"               | **本 skill** `lark_vc_meeting_list_active`                                                                                                             |
| "会议现在还开着，谁刚加入了"、"会议里谁在发言"、"有人共享屏幕吗"（**进行中会议**）       | **本 skill** `lark_vc_meeting_events`                                                                                                                  |
| "在会里发一句 xx"、"提示大家 xx"、"反馈听不到/看不到/声音清楚/效果不错"（**进行中会议**） | **本 skill** `lark_vc_meeting_message_send`                                                                                                          |
| "帮我入会 123456789"、"代我参会"、"让机器人进会旁听"、"退出会议"、"让机器人离开" | ⚠️ 入会 / 离会是**应用身份**写操作，**MCP server 不可用**（详见下方"身份路由"与"应用身份操作（⚠️ MCP 不可用）"）                                                                          |
| "昨天那场会有谁参加过"、"搜昨天的会"、"查纪要/逐字稿/录制"                          | `lark_get_skill(domain="vc")`                                                                                                                      |
| "帮我参会，结束后把纪要发到群" 等跨阶段场景                                    | 按序编排：本 skill（发现 → 读事件）→ 会议结束后用 `lark_get_skill(domain="vc")` / `lark_get_skill(domain="minutes")` 拉纪要 → `lark_get_skill(domain="im")` 发群 |

## 身份路由

不要向用户暴露内部身份缩写；对用户只说"用户身份"或"应用身份"。

| 场景 | 使用身份 | 关键规则 |
| ---- | -------- | -------- |
| 查询当前登录用户正在参加的会议（读） | 用户身份 | 拿到的 `meeting_id` 后续继续用用户身份读事件 |
| 查询目标用户且应用机器人也在会中的会议（读） | 应用身份 | ⚠️ 应用身份不通过 MCP server 提供（见下） |
| 让应用机器人入会/旁听/代参会（写）、离会（写） | 应用身份 | ⚠️ 应用身份不通过 MCP server 提供（见下） |

> ⚠️ **MCP server 始终以用户身份（user identity）调用，无法切换为应用身份（bot/app identity）。** 因此本 skill 中**应用身份**路径——应用机器人真实入会（`lark_vc_meeting_join`）、离会（`lark_vc_meeting_leave`）、以及应用身份的 active meeting 发现（`lark_vc_meeting_list_active` 带 `user_id`）——**在 MCP server 上不可用**。可用的是**用户身份**路径：用 `lark_vc_meeting_list_active`（不带 `user_id`）发现当前登录用户正在参加的会议，再用 `lark_vc_meeting_events` 读取该会议的会中事件。

硬规则：`meeting_id` 从哪种身份路径拿到，后续 `lark_vc_meeting_events` / `lark_vc_meeting_message_send` 就沿用哪种身份。通过 MCP server 时身份始终是用户身份，因此应使用用户身份发现的 `meeting_id`。

## 核心场景（MCP server 可用：用户身份）

### 1. 获取当前可用的进行中会议 ID（读操作）

1. `lark_vc_meeting_list_active` 用来发现当前进行中的会议，并拿到后续 `lark_vc_meeting_events` 需要的长数字 `meeting_id`。
2. 用户身份：`lark_vc_meeting_list_active(format="json")`（不传 `user_id`），用于发现当前登录用户正在参加的会议；后续 `lark_vc_meeting_events` 继续用用户身份读取。这是 **MCP server 上可用的路径**。
3. 如果返回空，表示当前登录用户没有可见的进行中会议。
4. 如果返回多个会议，不要自动任选一个；按 `meeting_title` / `meeting_no` / `meeting_id` 展示候选，等待用户明确选择后再调用 `lark_vc_meeting_events`。
5. 如果用户给了 9 位会议号，先在 active meeting 结果中按 `meeting_no` 匹配，匹配到唯一会议后取长数字 `meeting_id`。匹配失败时不要尝试入会（入会是应用身份写操作，MCP 不可用）。

### 2. 感知会中事件（读操作）

1. 用户要看"会议里正在发生什么"（参会人加入/离开、聊天、转写、屏幕共享）时，用 `lark_vc_meeting_events`。
2. 输入是 **`meeting_id`**（长数字 ID），不是 9 位会议号。
3. 通过 MCP server 时身份始终是用户身份：先用 `lark_vc_meeting_list_active` 发现当前用户所在会议拿到 `meeting_id`，再用 `lark_vc_meeting_events` 读取。具体的状态边界、结束后宽限窗口与错误码（如 `10005 / 20001 / 20002`）请查看 `lark_get_skill(domain="vc-agent", section="meeting-events")`。
4. **不能做会后复盘**，**不能替代参会人快照查询**。如果会议已结束：
   - 先用 `lark_vc_detail(meeting_ids="<meeting.id>")` 获取会议产物信息。
   - 再根据 `note_id`、`minute_token` 和用户意图，按 `lark_get_skill(domain="vc")` 的产物决策读取纪要正文、逐字稿或妙记。
   - 想看参会人快照：用 `lark_invoke(tool_name="lark_vc_meeting_get", args={params: {"meeting_id": "<meeting.id>"}, with_participants: true})`（见 `lark_get_skill(domain="vc")`）
5. **默认必须使用** `page_all=true`，除非用户明确要求"只查一页"，或确实需要控制返回体大小。
6. 命令默认输出结构化事件契约：`meeting`、`identity`、`events`、`warnings`、`has_more`、`page_token`；`identity` 表示当前读取身份，事件 actor 含 `participant_type`、`role` 和可读 `label`，事件细节保留在 `payload`。
7. 输出格式默认优先 `format="pretty"`（时间线更易读，并带当前身份标签）；需要稳定字段做结构化处理时用 `format="json"`；需要流式消费事件时用 `format="ndjson"`。
8. **必须识别分页信号**：只要响应里出现 `has_more=true`、pretty 里的 `more available`，或返回了非空 `page_token`，就不能把当前结果当作完整事件流；默认应继续分页，或明确告诉用户当前只是部分结果。
9. 保留响应里的 `page_token`，下次增量拉取直接续，不要从头再拉。
10. **只要你是基于** `lark_vc_meeting_events` **来回答一场正在进行中的会议内容，就不能直接复用旧结果。** 无论用户是在问"现在/刚刚/最新"的状态，还是让你"总结一下这个会议讲什么"，都必须先重新拉一次当前事件流，确认拿到的是最新信息，再基于最新结果回答。只有在用户明确要求基于某次历史快照继续分析时，才可以复用旧结果。
11. **会中聊天 / 互动转发到 IM 时基于 JSON 事件构造 IM post。** `chat_received_items[].message_type == 3` 表示会中 reaction；构造 IM post 时，先调用 `lark_get_skill(domain="im", section="reactions")` 取 reaction emoji 白名单判断同一 item 的 `content`：白名单内才写成 Feishu post `emotion` 节点，不在白名单内则保留原始 key 并写成文本节点，例如 `[CanNotSee]`。普通聊天按文本发送。不要从 pretty/Markdown 重新拼消息，也不要把整条消息退化成纯文本；只降级非法 reaction key。用户已说"发给我 / 推送给我 / 发到我的单聊"时，直接发给当前用户（MCP server 以用户身份发送）；收件人不明确时只补问收件人。
12. 用户直接问"这个会议讲了什么 / 现在讲到哪了"且上下文没有明确 `meeting_id` 时，先用用户身份发现当前会议；若返回多个会议，展示候选并让用户选择。
13. 用户直接提供 **9 位会议号** 并询问会中事件/会议内容时，默认把它当作 active meeting 的筛选条件：先用用户身份查 active meetings，并在返回里匹配 `meeting_no == <9位会议号>`；匹配到唯一会议后取长数字 `meeting_id`，再用用户身份查事件。

### Agent 读事件示范（用户身份，MCP 可用）

```
# 1. 发现当前登录用户所在的进行中会议，拿到长数字 meeting_id
lark_vc_meeting_list_active(format="json")
# → 从返回体中记录 meeting_id（多个时让用户选择）

# 2. 会中轮询事件
#    默认用 page_all=true 拉全当前可见事件；下次增量优先复用 page_token
#    典型间隔 10-30 秒
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="pretty")

# 3. 会后可选：进入 lark-vc 获取会议产物信息，再按 note_id / minute_token 决策读取
lark_vc_detail(meeting_ids="<meeting_id>")
```

### 3. 发送会中文本或会中表情（写操作）

1. 用户明确要求在当前进行中的会议里发送提示、说明、会中表情，或反馈"听不到 / 看不到 / 声音清楚 / 效果不错"时，用 `lark_vc_meeting_message_send`。
2. 输入是长数字 `meeting_id`，不是 9 位会议号。若用户只给 9 位会议号，先用用户身份执行 `lark_vc_meeting_list_active` 并按 `meeting_no` 匹配，匹配到唯一会议后再发送；不要为了发消息尝试入会（入会是应用身份写操作，MCP 不可用）。
3. 通过 MCP server 时身份始终是用户身份：用用户身份发现的 `meeting_id` 继续用用户身份发送，前提是当前用户正在该会议中。
4. 文本消息使用 `text`；会中表情 / 反馈使用 `emoji_type`。`emoji_type` 必须从 `lark_get_skill(domain="vc-agent", section="meeting-message-send")` 里的完整列表中选择，大小写敏感。
5. 支持普通 Feishu reaction emoji（如 `LOVE`、`SMILE`、`THUMBSUP`）和 4 个 VC 反馈 key（`VC_CanNotSee`、`VC_NoSound`、`VC_LooksGood`、`VC_SoundsClear`）。
6. 不要编造列表外的 `emoji_type`，也不要把 natural language 硬编码成不存在的 key；如果用户只给语义，可在完整列表中选择最接近的 key，无法判断时先确认。
7. 该工具只暴露会中文本和会中表情，不作为"发送绑定群消息"的默认能力；如果用户明确要发群聊，请路由到 `lark_get_skill(domain="im")`。
8. 用户身份发送时，当前用户必须正在该会议中。权限错误时按"用户身份被拒绝时"处理。

示例：

```
lark_vc_meeting_message_send(meeting_id="<meeting_id>", text="稍等，我在看文档")
lark_vc_meeting_message_send(meeting_id="<meeting_id>", msg_type="reaction", emoji_type="LOVE")
lark_vc_meeting_message_send(meeting_id="<meeting_id>", msg_type="reaction", emoji_type="VC_NoSound")
```

## 应用身份操作（⚠️ MCP server 不可用）

> ⚠️ 以下操作要求**应用身份（bot/app identity）**，而 MCP server 始终以用户身份调用，**因此这些操作通过 MCP server 不可用**。这里仅作能力说明，便于解释为什么某些请求无法在 MCP 上完成；不要把它们当作可直接调用的工具向用户承诺执行。

- **让应用机器人真实入会 / 旁听 / 代参会（写操作）**：这是应用身份写操作，会真实产生入会记录。MCP server 上不可用。
- **让应用机器人离会（写操作）**：同样是应用身份写操作，MCP server 上不可用。
- **应用身份发现 active meeting**：`lark_vc_meeting_list_active` 带目标用户 `user_id`（`ou_...`）可返回"目标用户在会中且应用机器人也在会中"的会议，但该模式依赖应用身份，MCP server 上不可用。MCP 上请改用不带 `user_id` 的用户身份模式。

当用户要求"代我入会""让机器人进会旁听""退出会议"时，应说明这些是应用身份操作、当前 MCP server 不支持，并改为提供用户身份可用的能力（发现自己所在会议 → 读取会中事件）。

## Shortcuts

Shortcut 是对常用操作的高级封装。

| Shortcut                  | 类型 | 说明                                                                         |
| ------------------------- | -- | -------------------------------------------------------------------------- |
| `lark_vc_meeting_list_active` | 读  | List active meetings and discover meeting_id for event reads（用户身份在 MCP 可用） |
| `lark_vc_meeting_events`  | 读  | List meeting events visible to current identity (participant joined/left, transcript, chat, share) |
| `lark_vc_meeting_message_send` | 写  | Send an in-meeting text message or reaction emoji（用户身份在 MCP 可用） |
| `lark_vc_meeting_join`    | 写  | ⚠️ 应用身份入会，MCP server 不可用 |
| `lark_vc_meeting_leave`   | 写  | ⚠️ 应用身份离会，MCP server 不可用 |

- 使用 `lark_vc_meeting_list_active` 前**必须**调用 `lark_get_skill(domain="vc-agent", section="meeting-list-active")`，了解用户身份和应用身份的不同返回范围。
- 使用 `lark_vc_meeting_events` 前**必须**调用 `lark_get_skill(domain="vc-agent", section="meeting-events")`，了解 `meeting_id` 来源、身份延续、分页和错误码（10005 / 20001 / 20002）。
- `lark_get_skill(domain="vc-agent", section="meeting-message-send")`：会中文本、完整 `emoji_type` 列表、身份延续和写操作风险。
- `lark_get_skill(domain="vc-agent", section="meeting-join")`：⚠️ 应用身份入会能力说明（MCP server 不可用）——入参格式、写操作可见性风险、入会失败排查。
- `lark_get_skill(domain="vc-agent", section="meeting-leave")`：⚠️ 应用身份离会能力说明（MCP server 不可用）——`meeting_id` 的来源与写操作可见性。

## 应用身份权限配置检查

> ⚠️ 应用身份相关权限配置说明仅供排查参考；应用身份操作本身在 MCP server 上不可用。

应用身份报 `no permission`、`missing required scope(s)`、`permission_violations`、`ErrNotInGray` 或 `20017` 时，可按顺序检查：

1. 以工具返回的 metadata / error envelope 为准，确认提示的 VC Agent 相关权限已开通。常见读取 active meeting / events 需要会中事件读取权限；应用机器人入会 / 离会需要 bot 入会写权限。
2. 应用已发布并安装到当前租户。
3. 开放平台"权限可访问的数据范围"已开通并保存。
4. 数据范围选择"按条件筛选"，条件配置为：**会议的归属者 包含 与应用的可用范围一致**。
5. 如果 scope、安装和数据范围都正确，仍返回 `ErrNotInGray` / `20017`，再按 VC Agent 内测 privilege / 灰度白名单处理，提示加入早鸟群或联系平台同学开通。

## 用户身份被拒绝时

用户身份报权限或身份不支持类错误时，先以工具返回的 metadata / error envelope 为准判断：

1. 如果错误表明当前接口不支持用户身份访问（例如只能用应用身份发现目标用户的会议、或只能用应用身份读取应用机器人可见事件），说明该链路依赖应用身份，**而应用身份在 MCP server 上不可用**——应向用户说明该能力当前不可用，而不是反复尝试。
2. 如果是数据范围 / 内测灰度类错误，按上面的"应用身份权限配置检查"与"内测提示"处理（提示加入早鸟群）。

## 延伸

- 查已结束会议、参会人快照、搜索历史会议 → `lark_get_skill(domain="vc")`
- 会议纪要、逐字稿 → `lark_get_skill(domain="vc")` 的 `lark_vc_detail`
- 妙记产物（AI 总结 / 转写 / 章节）→ `lark_get_skill(domain="minutes")`
- 会后把产物发到群 / 私聊 → `lark_get_skill(domain="im")`

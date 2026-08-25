# 读取会中事件与会中互动

围绕一场正在进行的会议执行只读查询或用户明确授权的发送操作。真实入会/离会使用应用机器人入会场景（⚠️ 应用身份写操作，MCP server 不可用）；已结束会议和会后产物使用会议查询场景。

如果任务包含“应用机器人入会后继续拉取事件或互动”，只读取并执行 `lark_get_skill(domain="meeting", section="scenes/live-meeting-attend")` 的完整流程，不要在两个场景之间来回切换。

MCP server 始终以用户身份调用，本场景的用户身份路径是可用路径。

## 发现进行中的会议

没有 `meeting_id` 时，按用户需要的视角查询：

```
# 当前登录用户正在参加的会议（用户身份，MCP server 可用）
lark_vc_meeting_list_active(format="json")

# 目标用户正在参加、且应用机器人也在会中的会议
# ⚠️ 应用身份路径，MCP server 不可用
lark_vc_meeting_list_active(user_id="<open_id>", format="json")
```

- `user_id` 必须是目标用户的 `ou_` open_id。
- 应用身份返回空不代表目标用户没有在开会，只代表没有找到目标用户与应用机器人同时在会中的会议。
- 返回多个会议时，展示标题、会议号和 `meeting_id` 让用户选择，不按“最近”擅选。
- 用户只给 9 位会议号时，在活跃会议结果中按 `meeting_no` 匹配；匹配失败时不要自动入会。
- `meeting_id` 从哪种身份取得，后续读取事件和发送消息就沿用哪种身份。通过 MCP server 时恒为用户身份，因此使用用户身份发现的 `meeting_id`。

身份可见范围和会议号匹配见 `lark_get_skill(domain="meeting", section="lark-vc-meeting-list-active")`。

## 读取最新会中事件

```
lark_vc_meeting_events(meeting_id="<meeting_id>", page_all=true, format="pretty")
```

- 默认使用 `page_all=true` 获取当前完整事件流，并保留返回的 `page_token` 供下次增量查询。
- 回答“现在、刚刚、最新”或当前会议总结前，重新查询事件；只有用户明确要求基于历史快照时才复用旧结果。
- 默认用 `format="pretty"` 理解时间线；需要精确结构化字段、文档上下文或转发到 IM 时使用 `format="json"`。
- 不要用会中事件代替已结束会议的参会人快照或会后复盘。

事件类型、分页、五分钟窗口和错误码见 `lark_get_skill(domain="meeting", section="lark-vc-meeting-events")`。

## 读取共享内容和文档上下文

按事件中的 `share_id`、`share_doc`、`comment_id`、`element_token` 和 `block_id` 精确关联：

- 读取评论时只查询当前 `comment_id`，不要扫描整篇文档评论。
- 多个共享文档按用户问题选择相关文档；不要用“最近一次共享”替代当前 item 的 `share_id`。
- 只有用户明确要求预览且事件提供受支持的 `element_type` 与 token 时才下载，并显式选择输出路径。
- 关联或读取失败时标记 partial，保留原始标识和 raw payload；不要自动下载或猜测文档类型兜底。

精确事件 schema 和后续调用见 `lark_get_skill(domain="meeting", section="lark-vc-meeting-events")` 的文档上下文部分。

## 发送会中文本或表情

只有用户明确要求发送并确认目标会议与内容时执行：

```
lark_vc_meeting_message_send(meeting_id="<meeting_id>", msg_type="text", text="<message>")
```

- 发送沿用 `meeting_id` 的来源身份；不要为了发送自动入会或先查会议详情。用户身份发送时，当前用户必须正在该会议中。
- reaction 使用参考文档中大小写敏感的完整 emoji key；不要编造 key。
- 发送失败时停止并报告，不自动换身份或重复发送，避免重复可见副作用。
- 用户要发送绑定群或 IM 消息时改用 `lark_get_skill(domain="im")`，不要把会中消息工具当作群消息能力。

文本、reaction 和权限规则见 `lark_get_skill(domain="meeting", section="lark-vc-meeting-message-send")`。

## 处理未发现会议或权限错误

- 用户身份未发现活跃会议时，可以查询当天最近结束的会议；仍无结果再询问时间、主题或会议号，不自行扩大时间范围。
- 应用身份未发现活跃会议时，只解释当前身份的空结果，不自动查询历史会议或真实入会。
- 用户身份调用活跃会议或事件查询时，普通 scope 缺失按工具错误中的 `hint` 申请 `vc:meeting.meetingevent:read`；普通 scope 缺失不表示接口不支持用户身份，只有工具明确说明不支持时才判定该链路依赖应用身份——而应用身份在 MCP server 上不可用，此时应向用户说明该能力当前不可用，不要反复重试。
- 应用身份缺少权限时（⚠️ 应用身份操作在 MCP server 上不可用，以下配置检查仅供排查参考；认证由 MCP server 自动处理，不需要也无法在会话内重新登录）：按工具错误中的 `hint` 和 `console_url` 配置 `vc:meeting.bot.join:write`，并依次检查应用发布、租户安装和“权限可访问的数据范围”；数据范围应为“按条件筛选”，条件为“会议的归属者 包含 与应用的可用范围一致”。
- scope、安装和数据范围都正确后仍失败时，保留工具返回的错误码和 `log_id`，按服务端权限异常排查；不要反复重试或改用其他身份。

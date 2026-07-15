
# vc +recording

通过 meeting_id 或 calendar_event_id 查询对应的 minute_token。这是 VC 域和 Minutes 域之间的桥梁命令。只读操作。

（authentication is handled automatically by the MCP server）

> **边界提醒：** 如果用户明确要的是"妙记信息""妙记详情""妙记链接""minute_token""标题""时长""owner"这类妙记元信息，先用本工具拿到 `minute_token`，再调用 `lark_invoke(tool_name="lark_minutes_minutes_get", args={params: {"minute_token":"..."}})`。不要直接切到 `lark_minutes_detail`；`lark_minutes_detail` 只用于纪要内容和逐字稿。

## 命令

```
# 通过会议 ID 查询（逗号分隔支持批量，最多 50 个）
lark_vc_recording(meeting_ids="69xxxxxxxxxxxxx28")
lark_vc_recording(meeting_ids="69xxxxxxxxxxxxx28,69xxxxxxxxxxxxx29")

# 通过日程事件 ID 查询
lark_vc_recording(calendar_event_ids="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx_0")

# 输出格式
lark_vc_recording(meeting_ids="69xxxxxxxxxxxxx28", format="json")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `meeting_ids` | 二选一 | 会议 ID，逗号分隔支持批量 |
| `calendar_event_ids` | 二选一 | 日程事件 ID，逗号分隔支持批量 |
| `format` | 否 | 输出格式：json (默认) / pretty / table / ndjson / csv |

## 核心约束

### 1. 两种参数互斥

每次只能指定一种输入方式。同时传入会报错。

### 2. 仅支持 user 身份

该工具仅支持 user 身份（authentication is handled automatically by the MCP server）。user token 只能查自己有权限的录制。

### 3. 批量上限

每次最多传入 50 个 ID。

### 4. 录制必须已完成

录制必须完成生成后才能查询。时长 < 5 秒的录制可能不会生成文件。

## 输出结果

返回 `recordings` 数组，每条记录包含：

| 字段 | 说明 |
|------|------|
| `meeting_id` | 会议 ID |
| `calendar_event_id` | 日历事件 ID（仅 `calendar_event_ids` 路径） |
| `minute_token` | 从录制 URL 中解析的妙记 Token |
| `recording_url` | 录制 URL |
| `duration` | 录制时长（毫秒） |
| `error` | 错误信息（仅查询失败时存在） |

## 如何获取输入参数

| 输入参数 | 获取方式 |
|---------|---------|
| `meeting_id` | 使用 `lark_vc_search` 搜索历史会议，取结果中的 `id` 字段 |
| `calendar_event_id` | 使用 `lark_calendar_agenda` 查看日程，取结果中的 `event_id` 字段 |

## Agent 组合场景

### 场景 1：知道 meeting_id，想下载录制

```
# 第 1 步：通过 meeting_id 查询录制，拿到 minute_token
lark_vc_recording(meeting_ids="xxx")

# 第 2 步：使用上一步返回的 minute_token 下载妙记文件
lark_minutes_download(minute_tokens="<minute_token>")
```

### 场景 2：知道 meeting_id，想查询妙记基础信息

```
# 第 1 步：通过 meeting_id 查询录制，拿到 minute_token
lark_vc_recording(meeting_ids="xxx")

# 第 2 步：使用上一步返回的 minute_token 查询妙记基础信息
lark_invoke(tool_name="lark_minutes_minutes_get", args={
  params: {"minute_token": "<minute_token>"}
})
```

### 场景 3：知道 meeting_id，想获取完整纪要（含 AI 产物）

```
# 第 1 步：通过 meeting_id 查询录制，拿到 minute_token
lark_vc_recording(meeting_ids="xxx")

# 第 2 步：使用上一步返回的 minute_token 获取完整纪要
# ⚠️ 必须显式指定要获取的产物 flag（summary, keyword, todo, chapter, transcript）
lark_minutes_detail(minute_tokens="<minute_token>", summary=true, todo=true, chapter=true, transcript=true)
```

### 场景 4：先搜索会议，再获取录制并下载

```
# 第 1 步：搜索历史会议，拿到 meeting_ids
lark_vc_search(query="周会", start="2026-03-10")

# 第 2 步：使用上一步返回的 meeting_ids 查询录制，拿到 minute_tokens
lark_vc_recording(meeting_ids="<ids>")

# 第 3 步：使用其中一个 minute_token 下载妙记文件
lark_minutes_download(minute_tokens="<token>")
```

### 场景 5：从日历事件获取录制

```
# 第 1 步：通过日历 event_id 查询录制，拿到 minute_token
lark_vc_recording(calendar_event_ids="<event_id>")

# 第 2 步：使用上一步返回的 minute_token 下载妙记文件
lark_minutes_download(minute_tokens="<minute_token>")
```

## 常见错误与排查

| 错误现象 | 根本原因 | 解决方案 |
|---------|---------|---------|
| `exactly one of ... is required` | 未传入参数或同时传了多种 | 只指定一种输入方式 |
| `no recording available` | 该会议无录制或录制未完成 | 确认会议已结束且开启了录制 |
| `121005 no permission` | 无权查看该会议录制 | 确认是会议参与者或有录制权限 |
| `124002 recording generating` | 录制文件仍在生成中 | 等待录制完成后重试 |
| `missing required scope(s)` | 权限不足 | 联系管理员授权对应 scope |

## 提示

- 默认使用 `format="json"` 输出，Agent 更擅长解析 JSON 数据。
- `minute_token` 从录制 URL 尾段解析（`https://meetings.feishu.cn/minutes/{minute_token}`）。
- 拿到 `minute_token` 后，如果要妙记基础信息，优先传给 `lark_invoke(tool_name="lark_minutes_minutes_get", ...)`；如果要下载媒体文件，传给 `lark_minutes_download`；如果要逐字稿、总结、待办、章节，再传给 `lark_minutes_detail(minute_tokens="...")`。

## 参考

- lark_get_skill(domain="vc") — 视频会议全部命令
- lark_get_skill(domain="vc", section="search") — 搜索历史会议（获取 meeting_id）
- lark_get_skill(domain="minutes", section="detail") — 获取会议纪要

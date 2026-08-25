# 查询妙记及其产物

围绕目标妙记执行查询：先取得唯一 `minute_token`，再按用户目标查询基础信息、AI 产物、逐字稿、原始媒体或关联的智能纪要。已有会议上下文或 `meeting_id` 时，先从会议链路取得 `minute_token`，不要重复搜索妙记。

## 定位妙记

- 已有 `minute_token` 时直接使用。
- 妙记 URL 的路径最后一段是 `minute_token`；去掉 query 参数。
- 没有 token 时，用标题/关键词、所有者、参与者或时间范围执行搜索：

  ```
  lark_minutes_search(query="<query>", start="<start>", end="<end>")
  ```

- `lark_minutes_search` 在原生能力上支持用户身份和应用身份；MCP server 始终以**用户身份**调用，无法切换为应用身份。用户明确要求应用视角时，说明该路径不可用并停止。
- `owner_ids="me"` / `participant_ids="me"` 依赖“当前用户”，在 MCP server 的用户身份下可用；也可以传明确的 `ou_` open_id。
- “我参与的妙记”默认是“我拥有”与“我作为参与者”两次查询的并集，具体过滤语义见 `lark_get_skill(domain="meeting", section="lark-minutes-search")`。
- 根据 `has_more` 和 `page_token` 翻页。用户未明确要求全量时，累计结果超过 50 条且仍有更多结果再确认是否继续；用户明确要求“全部、所有、统计、排序”时直接获取全部分页，并按结果中的 `token` 去重后再返回或统计。
- 多个候选时展示标题、时间、所有者、URL 和 token，让用户选择，不擅自挑选。

只需要搜索结果时，返回命中项后停止。

（认证由 MCP server 自动处理。）解析出 `minute_token` 后，妙记详情、产物读取、媒体下载、权限申请及关联 Note / Doc 查询全程沿用同一个用户身份，不需要也无法逐条传递身份参数。不要为绕过资源权限尝试切换身份。

## 查询基础信息

用户只要标题、时长、封面、所有者或 URL 时，使用基础信息接口：

```
lark_invoke(tool_name="lark_minutes_minutes_get", args={
  params: {"minute_token": "<minute_token>"}
})
```

基础信息已经满足目标时，不继续读取 AI 产物或逐字稿。参数不足时调用 `lark_discover(query="minutes.minutes.get")`。

## 获取 AI 产物和逐字稿

使用 `lark_minutes_detail`，只传用户需要的产物参数：

```
lark_minutes_detail(minute_tokens="<minute_token>", summary=true, todo=true, chapter=true, keyword=true, transcript=true)
```

- 可选 `summary`、`todo`、`chapter`、`keyword`、`transcript`。
- 不传产物参数只返回基础信息和可能存在的顶层 `note_id`。
- 用户只要现成总结、待办或章节时，返回对应 AI 产物。
- 用户要求提炼、重新总结、分析或复盘时，只读取 Transcript 并基于原始发言独立分析；禁止照搬 `summary`。

产物参数、返回字段和本地输出见 `lark_get_skill(domain="meeting", section="lark-minutes-detail")`。

## 下载原始音视频

用户需要原始媒体文件或下载链接时，使用 `lark_minutes_download`。同一妙记的下载产物统一归拢到 `./minutes/<minute_token>/`，除非用户指定其他安全相对路径。

媒体类型、路径、链接有效期和权限见 `lark_get_skill(domain="meeting", section="lark-minutes-download")`。

## 获取关联的智能纪要

从 `lark_minutes_detail` 顶层读取 `note_id`，直接调用 `lark_note_detail`：

```
lark_note_detail(note_id="<note_id>")
```

- 不要把 `minute_token` 当作 `note_id`，也不要绕回 VC。
- 顶层没有 `note_id` 表示该妙记没有关联 Note，到此停止。
- 取得 `note_doc_token`、`verbatim_doc_token` 或 `shared_doc_tokens` 后，按智能纪要和 Doc 的规则继续，详见 `lark_get_skill(domain="meeting", section="scenes/query-note-and-artifacts")`。

## 处理无权限结果

没有查看权限时，说明需要妙记所有者授权；不要自动调用 `lark_minutes_apply_permission`。只有用户明确要求申请查看或编辑权限时，才进入编辑妙记场景 `lark_get_skill(domain="meeting", section="scenes/create-and-edit-minutes")` 发起申请。详见 `lark_get_skill(domain="meeting", section="lark-minutes-apply-permission")`。

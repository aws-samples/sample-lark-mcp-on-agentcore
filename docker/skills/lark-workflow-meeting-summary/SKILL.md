---
name: lark-workflow-meeting-summary
description: "会议纪要整理工作流：汇总指定时间范围内的会议纪要并生成结构化报告。当用户需要整理会议纪要、生成会议周报、回顾一段时间内的会议内容时使用。"
---

# 会议纪要汇总工作流

(authentication is handled automatically by the MCP server)

**CRITICAL — 开始前 MUST 先完整调用 `lark_get_skill(domain="meeting")`**：会议与产物关系、产物选择和逐字稿路由以 meeting 域为准。

## 适用场景

- "帮我整理这周的会议纪要" / "总结最近的会议" / "生成会议周报"
- "看看今天开了哪些会" / "回顾过去一周开了哪些会"

## 前置条件

仅支持 **user 身份**。

## 工作流

```
{时间范围} ─► lark_vc_search ──► 会议列表 (meeting_ids)
                   │
                   ▼
               lark_vc_detail ──► 获取 note_id
                   │
                   ▼
               lark_note_detail ──► 纪要文档 tokens
                   │
                   ▼
               lark_invoke(tool_name="lark_drive_metas_batch_query") 纪要元数据
                   │
                   ▼
               结构化报告
```

### Step 1: 确定时间范围

默认**过去 7 天**。推断规则："今天"→当天，"这周"→本周一~now，"上周"→上周一~上周日，"这个月"→1日~now。

> **注意**：日期转换必须调用系统命令（如 `date`），不要心算。时间范围参数需根据工具实际要求格式化（通常为 `YYYY-MM-DD` 或 ISO 8601）。

### Step 2: 查询会议记录

```
lark_vc_search(start="<YYYY-MM-DD>", end="<YYYY-MM-DD>", format="json", page_size="30")
```

- 时间范围拆分：搜索的时间范围最大为 1 个月。搜索更长时间范围的会议，需要拆分为多次时间范围为一个月查询。
- `end` 为**包含当天**的日期（即查"今天"时 start 和 end 都填今天）
- `format="json"` 输出 JSON 格式，你更佳擅长解析 JSON 数据。
- `page_size="30"` 每页最多 30 条。
- 有 `page_token` 时必须继续翻页，收集所有 `id` 字段（meeting-id）

### Step 3: 获取纪要元数据

1. 查询会议关联的纪要信息
```
# 首先获取 note_id 和 minute_token
lark_vc_detail(meeting_ids="id1,id2,...,idN")

# 然后用 note_id 获取文档 tokens（如有多个需分别获取）
lark_note_detail(note_id="note_id")
```
- 根据上一步搜集到的 `meeting-id` 查询。
- 单次最多查询 50 个，超过 50 个需分批调用。
- 部分会议没有 `note_id` 或报错 `no notes available`，**不要直接标注"无纪要"**：先看 `lark_vc_detail` 是否返回了 `minute_token`，有则走下面的妙记备选路径；`note_id` 和 `minute_token` 都没有时才标注"无纪要"。
- 记录每个纪要的 `note_id`（纪要 ID）、`note_display_type`（展示类型：`unknown` / `normal` / `unified`）、`note_doc_token`（纪要文档 Token）和 `verbatim_doc_token`（逐字稿文档 Token）。

> **妙记备选路径（无 `note_id`、有 `minute_token` 时）**：智能纪要与妙记是两条独立产物链路，缺少智能纪要不代表这场会没有内容。
>
> ```
> # minute_tokens 是复数形式（lark_minutes_download 同）；output_dir 只接受相对路径
> lark_minutes_detail(minute_tokens="<minute_token>", transcript=true, output_dir="./transcripts")
> ```
>
> 逐字稿会落盘，供 Step 4 基于原始发言独立提炼（不要照搬 AI 总结）。若返回 `No read permission`（`2091005`），先把无权限事实告知用户，用户明确同意后再用单数参数申请：`lark_minutes_apply_permission(minute_token="<minute_token>", perm="view")`；申请需 owner 在客户端批准后才可重试。详见 `lark_get_skill(domain="meeting", section="scenes/query-minutes-and-artifacts")`（基于 minute_token 查询妙记及关联产物）。

> **逐字稿路由按 `note_display_type` 决定**（详见 `lark_get_skill(domain="meeting", section="scenes/query-note-and-artifacts")`，基于 note_id 查询智能纪要及关联产物）：
> - `normal`：逐字稿是独立文档，链接/正文走 `verbatim_doc_token`。
> - `unified`：逐字稿**不是独立文档**，没有可分享的逐字稿文档链接；需要逐字稿内容时用 `lark_note_transcript(note_id="<note_id>")`（参见 `lark_get_skill(domain="meeting")`）拉取到本地，报告中标注"unified 纪要"即可。

2. 获取纪要文档和逐字稿文档链接
```
# 了解工具参数
lark_discover(query="drive.metas.batch_query")

# 批量获取纪要文档与逐字稿链接: 一次最多查询 10 个文档
# 仅对 note_doc_token 与 normal 纪要的 verbatim_doc_token 查询链接
lark_invoke(tool_name="lark_drive_metas_batch_query", args={
  data: {"request_docs": [{"doc_type": "docx", "doc_token": "<doc_token>"}], "with_url": true}
})
```

### Step 4: 整理纪要报告

根据时间跨度选择输出格式：

- **单日汇总**（"今天"/"昨天"）：用"今日会议概览"标题，逐会议列出会议时间、主题、纪要链接、逐字稿链接（`unified` 纪要无逐字稿链接，标注"unified 纪要，逐字稿需 `lark_note_transcript` 拉取"）。
- **多日/周报**（"这周"/"过去 7 天"等）：用"会议纪要周报"标题，含概览统计、逐会议详情。

### Step 5: 生成文档（可选，用户要求时）

调用 `lark_get_skill(domain="doc")` 学习云文档技能。

```
lark_docs_create(doc_format="markdown", content="<title>会议纪要汇总 (<start> - <end>)</title>\n<内容>")

# 或追加到已有文档
lark_docs_update(doc="<url_or_token>", command="append", doc_format="markdown", content="<内容>")
```

## 参考

- `lark_get_skill(domain="meeting")` — 会议与产物统一路由
- `lark_get_skill(domain="meeting", section="scenes/query-meeting-and-artifacts")` — 搜索、消歧、产物获取与逐字稿分析流程
- `lark_get_skill(domain="meeting", section="scenes/query-minutes-and-artifacts")` — 无 `note_id` 时的妙记备选路径
- `lark_get_skill(domain="meeting", section="lark-vc-search")`、`lark_get_skill(domain="meeting", section="lark-vc-detail")`、`lark_get_skill(domain="meeting", section="lark-note-detail")`、`lark_get_skill(domain="meeting", section="lark-note-transcript")`、`lark_get_skill(domain="meeting", section="lark-minutes-detail")`、`lark_get_skill(domain="meeting", section="lark-minutes-apply-permission")` — 命令细节
- `lark_get_skill(domain="doc")` — `lark_docs_fetch`、`lark_docs_create`、`lark_docs_update` 详细用法

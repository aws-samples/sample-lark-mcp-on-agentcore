# docs history（历史版本与回滚）

用于查看 Docx 历史版本、按 `history_version_id` 回滚，以及查询回滚任务状态。

## 安全流程

1. 先用分页接口 `lark_docs_history_list` 找到目标版本的 `history_version_id`。
2. 如果用户指定的是 `revision_id`，不要假设它唯一，也不要把 `revision_id` 直接传给 `lark_docs_history_revert`。先拉一页并在 `entries[]` 中筛选 `revision_id` 相同的候选；如果未匹配到且 `has_more=true`，继续用 `page_token` 翻页；如果已匹配到候选，最多额外再拉一页补齐可能跨页的相邻候选。最终优先根据用户目标时间与 `edit_time` 的接近程度选择最合适的一条，取同一条的 `history_version_id`；如果没有目标时间，或多个候选无法可靠区分，再向用户展示候选版本（`history_version_id`、`revision_id`、`edit_time`、`name/description`）并确认后回滚。
3. 如果用户指定的是某一时刻但没有指定 `revision_id`，按 `entries[].edit_time` 匹配；优先选择不晚于目标时刻的最近一条历史记录，无法明确匹配时先向用户确认候选版本。
4. 再用 `lark_docs_history_revert(history_version_id="<history_version_id>")` 发起回滚。默认最多等待 30 秒；如果返回 `status: running`，记录 `task_id`。
5. 用 `lark_docs_history_revert_status` 轮询 `task_id`，直到状态不再是 `running`。
6. 回滚完成后，用 `lark_docs_fetch` 读取文档确认内容。

## 按 revision_id 或时间点回滚

当用户说“回滚到 revision_id=42”“恢复到昨天下午 3 点的版本”这类需求时，流程是：

1. 执行 `lark_docs_history_list(doc="<doc>")` 获取第一页历史记录；`lark_docs_history_list` 是分页接口，只有 `has_more=true` 且还需要更多候选时才继续传 `page_token` 翻页。
2. 如果用户给出 `revision_id`：先筛选当前页中 `entries[].revision_id == 用户给出的 revision_id`。如果未命中且 `has_more=true`，继续拉下一页；如果已经命中候选，最多额外再拉一页，补齐同一个 `revision_id` 可能跨页出现的相邻 `history_version_id`。若用户同时给出目标时间，在候选里选择 `edit_time` 与目标时间最接近的一条；若未给目标时间但候选只有一条，可直接使用；若多个候选无法可靠区分，不要自行取第一条，向用户展示候选并确认。
3. 如果用户只给出时间：用 `entries[].edit_time` 匹配，选择目标时刻之前最近的一条；如果用户表达的是“最接近某时刻”，则选择绝对时间差最小的一条。
4. 从最终匹配条目读取 `history_version_id`。`history_version_id` 对应服务端 `minor_history.version`，这是回滚接口需要的 ID。
5. 执行 `lark_docs_history_revert(doc="<doc>", history_version_id="<history_version_id>")`。

候选确认时使用类似格式：

```text
同一个 revision_id 命中多个历史版本，请确认要回滚哪一条：
- history_version_id=11 revision_id=42 edit_time=2026-06-22T12:24:45Z name=...
- history_version_id=12 revision_id=42 edit_time=2026-06-22T12:25:14Z name=...
```

## 命令

```
# 列出历史版本
lark_docs_history_list(doc="<docx_url_or_token>", page_size="20")

# 翻页
lark_docs_history_list(doc="<docx_url_or_token>", page_size="20", page_token="<page_token>")

# 回滚到指定 history_version_id（默认等待 30000ms）
lark_docs_history_revert(doc="<docx_url_or_token>", history_version_id="42")

# 只发起任务，不等待
lark_docs_history_revert(doc="<docx_url_or_token>", history_version_id="42", wait_timeout_ms="0")

# 查询回滚任务状态
lark_docs_history_revert_status(doc="<docx_url_or_token>", task_id="<task_id>")
```

## 参数

| 工具 | 参数 | 必填 | 说明 |
|-|-|-|-|
| `lark_docs_history_list` | `doc` | 是 | Docx URL/token，或可解析为 Docx 的 wiki URL |
| `lark_docs_history_list` | `page_size` | 否 | 返回条数，范围 `1-20`，默认 `20` |
| `lark_docs_history_list` | `page_token` | 否 | 上一页返回的 `page_token` |
| `lark_docs_history_revert` | `doc` | 是 | Docx URL/token，或可解析为 Docx 的 wiki URL |
| `lark_docs_history_revert` | `history_version_id` | 是 | `lark_docs_history_list` 返回的 `history_version_id`，必须大于 0 |
| `lark_docs_history_revert` | `wait_timeout_ms` | 否 | 等待回滚完成的毫秒数，范围 `0-30000`，默认 `30000` |
| `lark_docs_history_revert_status` | `doc` | 是 | 同一个文档 |
| `lark_docs_history_revert_status` | `task_id` | 是 | `lark_docs_history_revert` 返回的 `task_id` |

## 返回值要点

`lark_docs_history_list` 返回：

```json
{
  "entries": [
    {
      "revision_id": 42,
      "history_version_id": "11",
      "edit_time": "1780000000",
      "type": 1,
      "name": "版本名",
      "description": "版本说明",
      "editor_ids": ["ou_xxx"]
    }
  ],
  "has_more": true,
  "page_token": "page_token"
}
```

`lark_docs_history_revert` 返回：

```json
{
  "task_id": "task_xxx",
  "status": "running",
  "history_version_id": "11",
  "poll_after_ms": 10000
}
```

`lark_docs_history_revert_status` 返回：

```json
{
  "status": "partial_failed",
  "history_version_id": "11",
  "failed_block_tokens": ["blk_xxx"]
}
```

`status` 可能是 `running`、`done`、`partial_failed`、`failed`。当状态是 `partial_failed` 或 `failed` 时，优先检查 `failed_block_tokens`。

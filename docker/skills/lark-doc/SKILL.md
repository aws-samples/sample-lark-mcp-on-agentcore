---
name: lark-doc
description: "飞书云文档（Docx / Wiki）内容操作：读取、创建、编辑文档，插入或下载图片附件，以及操作思维笔记。用户提供文档 URL/token（包括 doubao.com 的 /docx/、/wiki/）时使用；按 URL 路径/token 而非域名路由。文档内嵌资源按读取参考中的统一规则分流。独立评论操作走 lark-drive；随正文读取评论使用 lark_docs_fetch。表格或 Base 内部数据操作不在本 skill。"
---

# docs

## 场景与工具路由

**CRITICAL：先判断场景，再读取该场景的参考文件；不要在任务开始时一次性读取全部参考文件。每个文件只在首次进入对应阶段时读取一次。**

**认证由 MCP server 自动处理（始终为 user identity），无需手动配置。**

**⚠️ 本地文件路径（`@./xxx`、`path="@./..."`）在 MCP server 上不可用**：容器里没有 agent 可写的文件系统，也无法把写好的文件交回来。内容一律作为参数字符串直接传入；本地图片走 `lark_docs_media_insert`。

### 文档内容

- **读取 / 摘要 — `lark_docs_fetch`**：先读 `lark_get_skill(domain="doc", section="fetch")` 再获取文档。
- **从零创作 — 创建工作流**：先完整执行 `lark_get_skill(domain="doc", section="create-workflow")`，**简单任务不是跳过的理由**。
- **导入 / 空文档 — `lark_docs_create`**：仅创建空文档或原样导入用户提供的完整内容时，跳过创建工作流，直接读 `lark_get_skill(domain="doc", section="create")`。
- **编辑 / block 直达链接 — `lark_docs_update`**：语义改写、润色、重组、补写或排版均按 `lark_get_skill(domain="doc", section="update")` 完成。

### 辅助能力

- **解析与统计 — `lark_docs_script`**：解析文档 URL / token 或 XML 内容，统计字数并返回字符诊断；见 `lark_get_skill(domain="doc", section="script")`。不支持 Markdown 输入；`command="init-draft"` 在 MCP server 上不可用（要写本地文件）。
- **历史版本 — `lark_docs_history_list` / `lark_docs_history_revert` / `lark_docs_history_revert_status`**：查询、回滚文档历史版本或检查回滚任务状态，见 `lark_get_skill(domain="doc", section="history")`。

### 资源、画板与思维笔记

- **插入本地素材 — `lark_docs_media_insert`**：在文末插入本地图片或文件，见 `lark_get_skill(domain="doc", section="media-insert")`。
- **预览素材 — `lark_docs_media_preview`**：预览文档或评论中的图片、附件或素材。
- **下载素材 — `lark_docs_media_download`**：下载文档中的图片、附件、素材或画板缩略图；画板缩略图只能用 `type="whiteboard"`（不要用 preview）。
- **Docx 封面 — `lark_docs_resource_download` / `lark_docs_resource_update` / `lark_docs_resource_delete`**：`type="cover"`，见 `lark_get_skill(domain="doc", section="resource-cover")`；仅支持 Docx 封面，其他素材走 `lark_docs_media_*`。
- **画板 — 画板工作流**：创建或更新画板时先读 `lark_get_skill(domain="doc", section="whiteboard")`；更新已有画板必须复用现有 token，禁止新建空白画板；用 `lark_whiteboard_update` 写入。
- **思维笔记**：已有思维笔记走 `lark_get_skill(domain="doc", section="mindnote")`；新建思维笔记走 `lark_get_skill(domain="doc", section="whiteboard")`。

### 格式选择规则（全局）

- **创建 / 导入场景**（`lark_docs_create`，或 `lark_docs_update` 的 `command="append"/"overwrite"` 整段写入）：XML 和 Markdown 都可以。用户明确说"导入 Markdown"时用 Markdown；否则默认 XML。
- **精准编辑场景**（`lark_docs_update` 的 `str_replace` / `block_insert_after` / `block_replace` / `block_delete` / `block_move_after`）：优先使用 XML（`doc_format="xml"`，默认值）。XML 能稳定表达 block 结构和样式，局部精修更可控；不要因为 Markdown 更简单就自行切换。

### 内嵌资源分流

文档内容中出现嵌入的 `<sheet>`、`<bitable>` 或 `<cite file-type="sheets|bitable">` 标签时 → **必须主动提取 token 并切到对应技能下钻读取内部数据**，不能只呈现标签本身。

| 标签 / 属性 | 提取字段 | 切到技能 |
|-|-|-|
| `<sheet token="..." sheet-id="...">` | `token` -> spreadsheet_token, `sheet-id` | `lark_get_skill(domain="sheets")` |
| `<bitable token="..." table-id="...">` | `token` -> app_token, `table-id` | `lark_get_skill(domain="base")` |
| `<cite type="doc" file-type="sheets" token="..." sheet-id="...">` | 同 `<sheet>` | `lark_get_skill(domain="sheets")` |
| `<cite type="doc" file-type="bitable" token="..." table-id="...">` | 同 `<bitable>` | `lark_get_skill(domain="base")` |
| `<vc-transcribe-tab vc-node-id="...">` | `vc-node-id` -> note_id | `lark_get_skill(domain="meeting")`：先 `lark_note_detail(note_id="<vc-node-id>")` |
| `<synced_reference src-token="..." src-block-id="...">` | `src-token` -> doc_token, `src-block-id` -> block_id | 用 `lark_docs_fetch` 读取 src-token 文档，定位 block |

## 不在本 Skill 范围

- **Drive 文件级操作**：找文档、导入导出、云空间文件上传 / 下载 / 权限管理 → `lark_get_skill(domain="drive")`。复制文档、创建副本或另存为副本时用 `lark_drive_copy`（见 `lark_get_skill(domain="drive", section="copy")`）；不要用 `lark_docs_fetch` + `lark_docs_create` 重建正文。
- **独立评论操作**：添加、分页查看、回复评论或增删 reaction → `lark_get_skill(domain="drive")`；只需紧凑评论上下文时，直接使用默认 JSON 响应的 `lark_docs_fetch`。
- **电子表格或 Base 的数据操作** → `lark_get_skill(domain="sheets")` / `lark_get_skill(domain="base")`。

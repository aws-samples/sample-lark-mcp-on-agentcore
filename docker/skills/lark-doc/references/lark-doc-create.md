# docs +create（创建飞书云文档）

从 XML（默认）或 Markdown 内容创建一个新的飞书云文档；语义创作默认使用 XML，只有用户明确要求或需要保真导入 Markdown 时才用 Markdown。

写入前必须按 `doc_format` 读取对应格式参考：`xml` 读取 `lark_get_skill(domain="doc", section="xml")`，`markdown` 读取 `lark_get_skill(domain="doc", section="md")`；Markdown 中使用 XML 扩展标签时还须读取 xml 参考。

从零创作走 `lark_get_skill(domain="doc", section="create-workflow")`——本参考只负责最后一步的调用形态。

## 命令

```
# 创建 XML 文档（默认格式，推荐）
lark_docs_create(content='<title>项目计划</title><h1>目标</h1><p>记录本周重点。</p>')

# 仅当用户明确要求导入 Markdown 时才使用；文档标题用 title，正文标题按内容自然组织
lark_docs_create(doc_format="markdown", title="项目计划", content='## 目标\n\n- 明确重点\n- 记录待办')
```

## 返回值

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "document": {
      "document_id": "docx_token",
      "revision_id": 1,
      "url": "https://xxx.feishu.cn/docx/docx_token",
      "new_blocks": [
        { "block_id": "blkcnXXXX", "block_type": "whiteboard", "block_token": "boardXXXX" }
      ]
    }
  }
}
```

- **`document.new_blocks`**：本次操作新增的 block 列表（如画板）。`block_id` 可用于 `lark_docs_update` 的 `block_id` 做精确编辑；`block_token` 是资源块（如画板）的 token，可交给 `lark-whiteboard` 等 skill 继续操作。
- **`warnings`**：服务端返回的警告列表；`ok=true` 时也要检查，按提示确认是否存在降级或未完全处理的内容。
- **`tips`**：服务端返回的后续处理建议；为空表示没有额外建议，非空本身不表示创建失败。

> \[!IMPORTANT]
> 如果文档是**以应用身份（bot）创建**的，在文档创建成功后，会**尝试为当前用户自动授予该文档的 `full_access`（可管理权限）**。
>
> ⚠️ This operation requires bot identity and is not available via the MCP server.
>
> 以应用身份创建时，结果里会额外返回 `permission_grant` 字段，明确说明授权结果：
> - `status = granted`：当前用户已获得该文档的可管理权限
> - `status = skipped`：本地没有可用的当前用户 `open_id`，因此不会自动授权
> - `status = failed`：文档已创建成功，但自动授权用户失败；会带上失败原因，并提示稍后重试
>
> `permission_grant.perm = full_access` 表示该资源已授予"可管理权限"。
>
> **不要擅自执行 owner 转移。** 如果用户需要把 owner 转给自己，必须单独确认。

## 参数

| 参数                  | 必填 | 说明                                          |
| ------------------- | -- |---------------------------------------------|
| `title`           | 否  | 文档标题，Markdown 导入时使用；XML 创建推荐在 `content` 开头写 `<title>...</title>`；多个标题仅保留第一个并在 `warnings` / `degrade_details` 提示 |
| `content`         | 视情况 | 文档内容（XML 或 Markdown 格式）；不传 `content` 时必须传 `title` |
| `reference_map` | 否 | 结构化 `reference_map` JSON object；必须与 `content` 一起使用。普通写入优先把结构写在正文里；该参数主要用于保留或回放已有 `document.reference_map`。 |
| `doc_format`      | 否  | 默认 `xml`，建议显式传入；仅用户明确要求 Markdown 或保真导入 Markdown 时用 `markdown`。不要混用完整的 XML 与 Markdown 文档格式；Markdown 中允许使用文档已定义的 XML 扩展标签 |
| `parent_token`    | 否  | 父文件夹或知识库节点 token（与 `parent_position` 互斥）  |
| `parent_position` | 否  | 父节点位置，如 `my_library`（与 `parent_token` 互斥） |

## 需要回查文档

用 `lark_docs_fetch(doc="<document_id 或文档 URL>", detail="with-ids")` 回查，更多信息见 `lark_get_skill(domain="doc", section="fetch")`。

## 参考

- `lark_get_skill(domain="doc", section="create-workflow")` — 从零创作工作流（Philosophy + Step Plan）
- `lark_get_skill(domain="doc", section="script")` — 写入前的 Draft Profile Check（`lark_docs_script(command="parse", ...)`）
- `lark_get_skill(domain="doc", section="xml")` — XML 语法规范
- `lark_get_skill(domain="doc", section="fetch")` — 获取文档
- `lark_get_skill(domain="doc", section="update")` — 更新文档
- `lark_get_skill(domain="doc", section="media-insert")` — 插入图片/文件到文档


# docs +update（更新飞书云文档）

使用文本或 block 指令精确更新飞书云文档。默认使用 XML；仅在用户明确要求或必须保真 Markdown 时使用 Markdown。

写入前必须按 `doc_format` 读取对应格式参考：`xml` 读取 `lark_get_skill(domain="doc", section="xml")`，`markdown` 读取 `lark_get_skill(domain="doc", section="md")`。

## 推荐流程

1. **Observe（读取现状）**：先 `lark_docs_fetch` 读取当前文档状态，并按意图选择最小范围。
   - 改某一节或大文档：先 `scope="outline", max_depth="2"` 找章节，再 `scope="section", start_block_id="<标题id>", detail="with-ids"`
   - 精确跨节区间：用 `scope="range", start_block_id="xxx", end_block_id="yyy"`
   - 只有模糊关键词：用 `scope="keyword", keyword="key1|key2", context_before="1", context_after="1", detail="with-ids"`
   - 明确整篇重构才读 `detail="with-ids"` 全文；只读摘要或确认事实时用更轻的 fetch
2. **Diagnose（诊断问题）**：判断用户目标、当前结构、语气、重复、断流、事实口径和需要保留的资源；识别哪些 block 必须原样保留。
3. **Patch Plan（制定局部计划）**：把修改拆成最小安全操作：简单行内文本替换用 `str_replace`，但它不支持资源替换；单个 block 用一个 `block_id`，同一直接父节点下的连续 block 用 `start_block_id`/`end_block_id`。连续范围适用于 `block_replace` 和 `block_delete`。整段/整块重写用 `block_replace`；增补章节用 `block_insert_after`；删冗余用 `block_delete`；调整顺序用 `block_move_after`。
4. **Patch（精确修改）**：按 block / section 执行局部命令。替换内容必须符合目标父容器的结构；例如替换列表项范围时使用 `<li>...</li>`。保护 `<cite>`、`<img>`、`<source>`、`<whiteboard>`、`<sheet>`、`<bitable>`、`<synced_reference>` 等 token 化内容，不要改成纯文本或占位符。同一 block 的多处修改合并成一次 `block_replace`。
5. **Verify（fetch 验证）**：每轮写操作后按影响范围重新 fetch，检查用户要求、结构、语气、事实、资源块和 block ID 是否符合预期；不满足就基于最新 fetch 结果继续 Diagnose / Patch，不要沿用上一轮 block ID。

除非用户明确要求完全重建，或原文已无保留价值，否则不要使用 `overwrite`；它可能丢失评论和暂不支持的资源。

## 生成 block 直达链接

用户需要某个 block 的直达链接时，只定位 block，不执行文档写操作：

1. 用局部 `lark_docs_fetch(detail="with-ids")` 获取目标 `block_id`。
2. 返回 `文档基础 URL#block_id`；没有 `block_id` 时不得猜测。

> **格式选择规则：**
> - **局部精修**（`str_replace` / `block_insert_after` / `block_replace` / `block_delete` / `block_move_after`）：优先使用 XML（默认）。XML 能稳定表达 block 结构和样式，精准编辑更可控；不要因为 Markdown 写起来更简单就自行切换。
> - **整段写入**（`append` / `overwrite`）：XML 和 Markdown 都可以。用户提供 `.md` 本地文件或明确要求 Markdown 时直接用 Markdown；否则默认 XML。
>
> **Markdown 局限 & block ID 前提：** Markdown 不携带 block ID，也无样式（颜色、对齐、callout 等）。需要按 block ID 定位（`block_*` 指令的 `block_id`）时，先 `lark_docs_fetch(detail="with-ids")` **配合 `scope`（`outline` / `range` / `keyword` / `section`）局部获取**目标段落，不要全量 fetch。拿到 block ID 后 `content` 仍可用 Markdown，只是写入内容不带样式。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `doc` | 是 | 文档 URL 或 token |
| `command` | 是 | 操作指令（见下方指令速查表） |
| `doc_format` | 否 | 内容格式：`xml`（默认，始终优先使用）\| `markdown`（仅用户明确要求时） |
| `content` | 视指令 | 写入内容（`str_replace` 传空字符串可实现删除） |
| `reference_map` | 否 | 结构化 `reference_map` JSON object；必须与 `content` 一起使用。普通写入优先把结构写在正文里；该参数主要用于保留或回放已有 `document.reference_map`。 |
| `pattern` | 视指令 | 匹配文本（str_replace） |
| `block_id` | 视指令 | 目标 block ID（block_* 操作），-1 表示末尾，0 表示文档开头（仅适用于支持这些锚点的指令） |
| `start_block_id` / `end_block_id` | 视指令 | `block_replace` / `block_delete` 的同父连续闭区间，必须成对使用，且不能与 `block_id` 混用；`start_block_id` 用 `0` 表示从文档开头开始，`end_block_id` 用 `-1` 表示到文档末尾结束 |
| `src_block_ids` | 视指令 | 源 block ID（逗号分隔），用于 block_copy_insert_after / block_move_after |
| `revision_id` | 否 | 基准版本号，-1 = 最新（默认 `-1`） |

## 指令速查表

| 指令 | 说明 | 必需参数 |
|------|------|----------|
| `str_replace` | 全文文本查找替换（replacement 支持富文本标签；`content` 传空字符串即为删除） | `pattern` `content` |
| `block_insert_after` | 在指定 block 之后插入新内容 | `block_id` `content` |
| `block_copy_insert_after` | 复制源 block 并插入到锚点之后（源块不变） | `block_id` `src_block_ids` |
| `block_replace` | 替换单个 block（`block_id`）或同父连续闭区间（`start_block_id`/`end_block_id`）；不支持跨容器或反向区间 | `content`，以及 `block_id` 或 `start_block_id`+`end_block_id` |
| `block_delete` | 删除单个 block（`block_id`）或同父连续闭区间（`start_block_id`/`end_block_id`）；不支持跨容器或反向区间 | `block_id` 或 `start_block_id`+`end_block_id` |
| `overwrite` | 清空文档后全文重写（可能丢失图片、评论） | `content` |
| `append` | ⚠️ 在文档**末尾**追加内容（等价于 `block_insert_after` with `block_id="-1"`）。**不适用于逐章填充**——逐章写入请用 `block_insert_after` 并指定对应标题的 `block_id` | `content` |
| `block_move_after` | 移动已有 block 到指定位置 | `block_id` `src_block_ids` |

## Block ID 生命周期

写操作后不要默认复用之前 fetch 到的 block ID：

- `overwrite` / `block_replace` / `block_delete`：受影响旧 ID 失效，继续 block 级操作前重新 fetch
- `block_insert_after` / `append` / `block_copy_insert_after`：锚点 / 源 ID 通常保留，新内容是新 ID；要操作新内容先重新 fetch
- `block_move_after`：被移动 ID 通常保留，但位置、章节、range 语义变化；后续依赖位置时重新 fetch
- `str_replace`：简单行内替换通常不改变 ID；跨行 / 大段替换后如继续 block 级操作，先重新 fetch

## 指令示例

### str_replace — 全文文本替换

> **匹配范围：**
> - **XML 模式（默认）**：`pattern` 只支持**行内匹配**，不能跨 block / 跨段落匹配。涉及整段或多 block 的改动，请改用 `block_replace`。
> - **Markdown 模式**（`doc_format="markdown"`）：`pattern` 同时支持**行内和跨行匹配**，可以用多行字符串匹配并替换一整段内容。
>   - 还支持**`前缀...后缀` 省略号语法**：用 `...`（三个英文句点）串联起始与结束片段，匹配从前缀到后缀之间的全部内容（含中间被省略部分）。适合一段很长、但首尾特征明显的文本，避免把整段都塞进 `pattern`。
>   - 前缀、后缀本身仍遵循 Markdown 转义规则；省略号中间的内容**会被替换**为 `content` 的完整文本，不会被保留。

```
# 简单文本替换
lark_docs_update(doc="<doc_id>", command="str_replace", pattern="张三", content="李四")

# 替换为富文本（加粗 + 链接）
lark_docs_update(doc="<doc_id>", command="str_replace", pattern="旧链接", content='<b>新链接</b> <a href="https://example.com">点击查看</a>')

# 仅当用户明确要求时才使用 Markdown
lark_docs_update(doc="<doc_id>", command="str_replace", doc_format="markdown", pattern="旧内容", content="新内容")

# Markdown 模式下支持跨行匹配
lark_docs_update(doc="<doc_id>", command="str_replace", doc_format="markdown", pattern="## 旧标题\n\n第一段原文\n\n第二段原文", content="## 新标题\n\n改写后的第一段\n\n改写后的第二段")

# Markdown 模式下使用 `前缀...后缀` 省略号匹配首尾特征明显的大段内容
# 下例会把「## 旧标题」到「结束语。」之间的所有内容整体替换
lark_docs_update(doc="<doc_id>", command="str_replace", doc_format="markdown", pattern="## 旧标题...结束语。", content="## 新标题\n\n重写后的正文...\n\n新的结束语。")

# 删除文本：content 传空字符串即可
lark_docs_update(doc="<doc_id>", command="str_replace", pattern="废弃的内容", content="")
```

### block_insert_after — 在指定 block 之后插入

```
lark_docs_update(doc="<doc_id>", command="block_insert_after", block_id="目标 block_id", content='<h2>新章节</h2><ul><li>要点 1</li><li>要点 2</li></ul>')
```

### block_replace — 替换指定 block

```
# 替换单个 block
lark_docs_update(doc="<doc_id>", command="block_replace", block_id="目标 block_id", content='<p>替换后的段落内容</p>')

# 替换同父连续范围内的 block
lark_docs_update(doc="<doc_id>", command="block_replace", start_block_id="blkFirst", end_block_id="blkLast", content='<p>替换后的内容</p>')
```

### block_delete — 删除指定 block

```
# 删除单个 block
lark_docs_update(doc="<doc_id>", command="block_delete", block_id="block_id_1")

# 删除同父连续范围内的 block
lark_docs_update(doc="<doc_id>", command="block_delete", start_block_id="blkFirst", end_block_id="blkLast")
```

### overwrite — 全文覆盖

```
lark_docs_update(doc="<doc_id>", command="overwrite", content='<title>全新文档</title><h1>概述</h1><p>新的内容</p>')
```

> 会清空文档后重写，可能丢失图片、评论等。仅在需要完全重建文档时使用。

### append — 在文档末尾追加

```
lark_docs_update(doc="<doc_id>", command="append", content='<h2>新增章节</h2><p>追加的内容</p>')
```

> 等价于 `block_insert_after` with `block_id="-1"`，无需先获取 block ID。

### block_copy_insert_after — 复制块并插入

将一个或多个源块复制到锚点块之后，源块保持不变。`src_block_ids` 为逗号分隔的源块 ID，按顺序依次插入到锚点之后。

```
# 复制多个块（按顺序插入：anchor → a → b → c）
lark_docs_update(doc="<doc_id>", command="block_copy_insert_after", block_id="锚点 block_id", src_block_ids="block_a,block_b,block_c")
```

### block_move_after — 移动已有 block

将文档中已有的 block 移动到指定锚点之后。使用 `src_block_ids` 指定要移动的块 ID，无需 `content`。

```
# 移动到页面末尾
lark_docs_update(doc="<doc_id>", command="block_move_after", block_id="-1表示末尾，page_id表示开头，blk", src_block_ids="block_a,block_b")
```

## 返回值

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "document": {
      "revision_id": 13,
      "new_blocks": [
        { "block_id": "blkcnXXXX", "block_type": "whiteboard", "block_token": "boardXXXX" }
      ]
    },
    "result": "success",
    "updated_blocks_count": 3,
    "warnings": []
  }
}
```

| 字段 | 说明 |
|------|------|
| `result` | `success` \| `partial_success` \| `failed` |
| `updated_blocks_count` | 实际更新的 block 数量 |
| `warnings` | 警告信息列表 |
| `document.new_blocks` | 本次操作新增的 block 列表（如画板）。`block_id` 可用于后续精确编辑；`block_token` 是资源块 token（如画板）可交给 `lark-whiteboard` 等 skill 继续操作 |

## 典型工作流

### 精确 block 级更新

1. **获取文档内容和 block ID**：
   ```
   lark_docs_fetch(doc="<doc_id>", detail="with-ids")
   ```

2. **定位目标 block**：从返回的 XML 中找到要修改的 block 及其 `id` 属性

3. **执行更新**：
   ```
   # 替换特定 block
   lark_docs_update(doc="<doc_id>", command="block_replace", block_id="blkcnXXXX", content="<p>新内容</p>")

   # 在某 block 后插入
   lark_docs_update(doc="<doc_id>", command="block_insert_after", block_id="blkcnXXXX", content="<h2>追加的章节</h2>")
   ```

### 简单文本替换

不需要 block ID，直接匹配替换：

```
lark_docs_update(doc="<doc_id>", command="str_replace", pattern="v1.0", content="v2.0")
```

## 画板处理

> **`lark_docs_update` 不能直接编辑已有画板的内容。** 本工具只能**新增**画板块；要修改已有画板，先用 `lark_docs_fetch` 取到 `<whiteboard token="...">`，再按 `lark_get_skill(domain="doc", section="whiteboard")` 启动 SubAgent 读取 `lark_get_skill(domain="whiteboard")` 并写入。

画板的语法选型与插入示例见 `lark_get_skill(domain="doc", section="xml")` 与 `lark_get_skill(domain="doc", section="whiteboard")`。

## 最佳实践

- **精确操作优于全文覆盖**：使用 `block_replace`/`block_insert_after` 精确修改，避免 `overwrite` 全文覆盖
- **str_replace 的匹配范围取决于格式**：
  - **XML 模式（默认）**：`pattern` 只支持**行内**匹配，不支持跨行 / 跨 block。段落、整块或容器级（列表、表格、分栏、引用块等）改动请改用 `block_replace` 指定 block_id 重建。
  - **Markdown 模式**（`doc_format="markdown"`）：`pattern` 同时支持**行内和跨行**匹配，还支持 `前缀...后缀` 省略号语法（用 `...` 串联首尾片段匹配一大段内容），可以一次替换多行文本；但仍建议优先按最小片段匹配，跨 block 容器级重写仍优先用 `block_replace`，避免副作用。
- **保护不可重建的内容**：图片、画板、电子表格等以 token 形式存储，替换时避开这些 block
- **str_replace 的 replacement 支持富文本**：可以用行内标签 `<b>`、`<a>`、`<cite>`、`<latex>` 等替换普通文本为富文本
- **同一 block 只能被 replace 一次**：多次修改同一 block 请合并为一次 block_replace
- **block_delete 支持范围删除**：单个 block 用 `block_id`，连续多个同父 block 用 `start_block_id`/`end_block_id`
- **复杂结构重组**：将多个段落转换为 grid / table 等复杂布局时，分步操作比 overwrite 更安全：
  1. 用 `block_insert_after` 在目标位置插入新的富文本结构
  2. 用 `block_delete` 批量删除旧的 block
  3. 这样可以保留文档中其他不相关的内容（图片、评论等）
- **表达形式**：插入或替换内容时，优先沿用用户要求和已有文档风格；需要结构化表达时参考 `lark_get_skill(domain="doc", section="create-workflow")` 的 Philosophy，但不要为了固定丰富度主动添加组件

## 参考

- `lark_get_skill(domain="doc", section="create-workflow")` — Philosophy（读者本位、结构先行、克制且连贯）与从零创作 Step Plan
- `lark_get_skill(domain="doc", section="script")` — 改写后核字数 / 画像（`lark_docs_script(command="parse", ...)`）
- `lark_get_skill(domain="doc", section="xml")` — XML 语法规范
- `lark_get_skill(domain="doc", section="fetch")` — 获取文档
- `lark_get_skill(domain="doc", section="create")` — 创建文档
- `lark_get_skill(domain="doc", section="media-insert")` — 插入图片/文件到文档

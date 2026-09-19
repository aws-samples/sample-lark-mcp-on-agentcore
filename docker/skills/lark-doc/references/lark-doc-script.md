# docs +script（文档解析与统计）

## 可用命令

| `command` | 用途 |
|-|-|
| `parse` | 解析在线文档或 XML 内容，返回画像（字数 / 字符数 / block 统计）并按 Presentation Decision 做检查 |
| `init-draft` | ⚠️ 在本地创建独占草稿工作区。**不适用于 MCP server**：它要写本地目录和文件，而这里既没有 agent 可写的文件系统，返回的路径也取不回来。改为把 XML 直接作为 `content` 字符串传给 `parse`，把决策 JSON 传给 `presentation_decision`。 |

## `parse`

### 参数

| 参数 | 必填 | 用法 |
|-|-|-|
| `command` | 是 | 固定传 `"parse"` |
| `content` | 二选一 | 待检查的 XML 内容（直接传 XML 字符串）；与 `doc` 互斥 |
| `doc` | 二选一 | 在线 Docx/Wiki URL 或 token；与 `content` 互斥 |
| `presentation_decision` | 否 | 用于检查当前输入的决策 JSON（直接传 JSON 字符串）|

```
# 检查还没落库的 XML 草稿
lark_docs_script(command="parse", content="<title>标题</title><p>正文…</p>")

# 带决策一起检查（推荐：写入前的 Draft Profile Check）
lark_docs_script(command="parse", content="<title>…</title>…", presentation_decision="<完整 Presentation Decision JSON>")

# 解析已发布的在线文档
lark_docs_script(command="parse", doc="<Docx/Wiki URL 或 token>")
```

### 返回与判读

- 返回 `data.assessment.status`、`data.profile` 和按需出现的 `data.diagnostics[]`；`profile` 包含 `word_count`、`char_count`、`block_count` 和 `blocks[]`。
- 顶层 `ok` 只表示命令执行成功。**画像、决策或资源预检未通过时仍然返回 `ok:true`**，要看 `assessment.status`：`passed` 才算通过，`failed` 要按 `diagnostics[]` 修复后重新 parse。`passed` 只表示本次启用的检查通过，不代表未声明的要求已满足。
- 每条 diagnostic 提供 `severity`、稳定 `code`、`msg`、可选 `expected` / `actual` 和 `suggested`。同一原因失败的远程图片会合并成一条 diagnostic，并在 `image_indices[]` 中列出图片序号。
- `parse` **不是** XML/SDK schema validator：通过且无 warning 也不保证服务端接受，写入前仍须按 `lark_get_skill(domain="doc", section="xml")` 复查。
- `doc` 需要 `docx:document:readonly`；`content` 不调用 OpenAPI。
- 不支持 Markdown 输入。

### 决策 JSON 约束

决策是单个 JSON 对象；无可量化约束时传 `{}`。缺失的约束不检查，显式填写但非法的值报错，合法且完整的约束参与检查。

- `audience`、`reader_task`、`genre_contract`、`adapter`、`presentation_mode`、`visual_plan.reason` 和每个 block 的 `purpose` 都是可选描述信息，可省略、为空字符串或 `null`；不参与通过 / 失败判定。
- `visual_plan`、`visual_plan.blocks`、每项的 `type` 和 `min_count` 都可省略或为 `null`，表示未设置。`blocks` 写 `[]` 也表示无数量约束；条目缺少 `type` 或 `min_count` 时，不启用该条数量校验。
- 显式填写的字段仍须合法：`visual_plan` 为对象，`blocks` 为数组，`type` 为支持的块类型，`min_count` 为正整数。空字符串类型、未知块类型、零 / 负数或非整数数量会报错，即使另一字段缺失也一样。仅 `type` 与 `min_count` 都有效的条目参与数量检查；启用的条目不能重复声明同一类型。为兼容外部决策也接受 `type: "list"`，检查时把 `<ul>` 与 `<ol>` 的数量相加。
- `word_count` 仅在需要字数校验时填写 `{min, max}`；未指定的一侧写 `null`，至少一侧为正整数，且 `min <= max`。没有字数要求时省略整个字段。

## 字数统计

需要文档总字数 / 总字符数时用 `parse`：在线文档传 `doc`，未落库草稿传 `content`，从 `data.profile.word_count` / `char_count` 读取。统计口径以本工具为准，不要自行数字符。

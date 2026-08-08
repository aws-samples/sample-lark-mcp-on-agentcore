# 飞书 XML 语法

**语法采用类 HTML 标签，渲染采用纵向块级文档流：顶层 Block 按文档顺序纵向排列，块内支持富文本和子块嵌套。默认宽度约 820 px，宽版模式约 1020 px**

以下为 XML 语法示例，使用时需替换其中的示例值。属性必须写成 `name="value"`，禁止省略引号。

> ⚠️ **本地文件路径（`path="@./xxx"`）在 MCP server 上不可用**：容器里没有 agent 可写的文件系统。本地图片和附件改用 `lark_docs_media_insert` 在文档创建后插入（见 `lark_get_skill(domain="doc", section="media-insert")`）；画板 / HTML 内容一律内联写在标签里。

## 常用标签

- `p, h1-h9, ul, ol, li, table, thead, tbody, tr, th, td, blockquote, pre, code, hr, img, b, em, u, del, a, br, span` 语义不变。普通文档建议只使用 `h1-h6`，`h7-h9` 仅在确需更深层级时使用。
- `<a type="url-preview" href="URL">链接标题</a>`
- `<latex>E = mc^2</latex>`：适用行内公式，也适用于上标、下标写法。
- `<ol><li>第一项<ul><li>子项</li></ul></li><li>第二项</li></ol>`：子列表放在 `<li>` 内；新增列表项必须放在 `<ul>` 或 `<ol>` 内；连续同类型列表项会自动合并为一个 `<ul>` / `<ol>`。
- `<pre lang="go" caption="示例"><code>fmt.Println(&quot;hello&quot;)</code></pre>`：代码必须放在 `<code>` 内，禁止直接放在 `<pre>` 下；`caption` 可省略。
- `<img href="URL"/>` 上传公开 HTTP(S) 网络图片，或 `<img src="token"/>` 复制原始图片；两者任选一个，可选 `width`、`height`、`caption`、`name`。使用 `href` 时会把远程图片转成资源再上传；响应须为 PNG、JPEG、GIF 或 WebP，单图不超过 20MiB。内部网络图片或本地图片走 `lark_docs_media_insert`。
- `<source token="token" name="报告.pdf"/>`：复制已有附件。可独立使用、放入 `<p>` 作为行内附件，或写成 `<figure view-type="Card|Preview"><source/></figure>`。新增本地附件走 `lark_docs_media_insert`。
- `<checkbox done="true|false">todo</checkbox>`
- `p, h1-h9, li, checkbox, title` 支持可选属性 `align`，可选值为 `left`、`center`、`right`，例如 `<p align="center">居中正文</p>`。

## 标题与列表编号

- 完整文档以唯一的 `<title>` 开头；正文标题使用 `<h1>` 至 `<h9>`，层级须连续，不跳级——`<h1>` 后不能直接用 `<h3>`，应先出现 `<h2>`。需要自动编号时设置 `seq="auto"`，系统会按标题层级生成并递增阿拉伯数字编号，例如一级标题为 `1`，二级标题为 `1.1`。
- 有序列表：默认属性 `seq="auto"`，需从指定数字开始时设置对应值，如 `seq="3"`。

## 表格

- `<table><thead><tr><th><p>表头</p></th></tr></thead><tbody><tr><td><p>内容</p></td></tr></tbody></table>`
- `<colgroup><col /></colgroup>` 紧跟 `<table>` 定义列宽；`width` 表示列宽，可选 `span` 表示连续作用的列数。
- `<th>` / `<td>` 支持 `background-color`、`vertical-align`、`colspan`、`rowspan`；`vertical-align`：`top | middle | bottom`；`background-color` 支持基础色相、`light-{色相}`、`medium-gray`，表头优先使用 `light-gray` 或 `medium-gray`，彩色单元格仅用于表达状态或分类。被合并的单元格不再写入。
- 有表头时第一行在 `<thead>` 用 `<th>`，其余在 `<tbody>` 用 `<td>`。

## 扩展标签

- `<cite type="user" user-id="ou_xxx"/>`：@人，会渲染为用户头像；必须显式传入用户 `open_id`，不得用纯文本名字冒充 @人。
- `<cite type="doc" doc-id="DOC_TOKEN"/>`：@文档，会渲染为文档标题。
- `<cite type="citation"><a href="URL" url-type="N"></a></cite>`：参考文献容器，仅含多个 `<a>`。`url-type` 标识链接类型：`5`（WebURL）须在 `<a></a>` 中填写渲染标题；`1`（Docx）、`6`（Minutes）、`12`（Base）、`13`（Sheet）可留空。
- `<whiteboard></whiteboard>`：`type | src` 二选一。`type=blank` 为新建；`type=mermaid|plantuml|svg` 时在标签内**直接内联写入内容**（`path=@./file` 在 MCP server 上不可用）；`src=token` 表示复制已有画板。复杂图需读取 `lark_get_skill(domain="doc", section="whiteboard")`。
- `<grid><column width-ratio="0.5"><p>左栏</p></column><column width-ratio="0.5"><p>右栏</p></column></grid>`：各列 `width-ratio` 之和为 1。
- `<callout emoji="💡" background-color="light-*" border-color="*"><p>高亮块内容</p></callout>`：子块仅支持 `p`、`ol`、`ul`、`checkbox`、行内标签；禁止裸文本及 `<table>`、`<img>`、`<pre>`、`<hr>`、`<grid>`、`<whiteboard>`、`<sheet>` 等其他块级标签或资源块。可选 `text-color`。
- 其他扩展标签 `html5-block`、`bookmark`、`button`、`time`、`sheet`、`task`、`chat_card`、`sub-page-list`、`okr` 见 `lark_get_skill(domain="doc", section="xml-extended-blocks")`。
- `bitable`、`base_ref`、`synced_reference`、`synced_source` 不可创建，仅支持移动。

## 富文本样式嵌套顺序

行内样式标签必须按以下固定顺序嵌套（外 → 内），关闭顺序严格反转：`<a> → <b> → <em> → <del> → <u> → <code> → <span> → 文本内容`。

## 用户名写入规则

- 任何包含 `<cite type="user">` 的 XML 在导入、新建或编辑回写时，都必须显式传入 `user-id`；其值为用户的 `open_id`，不得省略。
- 当从 IM 消息、日历、审批、任务等来源获取到用户的 `open_id` 时，写入文档**必须**使用 `<cite type="user" user-id="open_id">` 标签，而非纯文本名字。这样文档中会渲染为可点击的 @人。
- 典型场景：IM 消息的 `sender`、`mentions`、reactions 的 `operator`、卡片消息中引用的用户、系统消息中的用户名、合并转发中的用户名。
- 当只有纯文本名字而没有 `open_id` 时（如系统消息、合并转发内容），先通过 `lark_contact_search_user(query="名字")` 反查 `open_id`，再写入 cite 标签。

## 块级复制与移动

- **移动**：`lark_docs_update(command="block_move_after", block_id="<锚点>", src_block_ids="id1,id2")` 支持**所有**块类型（块级标签、容器标签、行内组件、资源块）。
- **复制**：`lark_docs_update(command="block_copy_insert_after", block_id="<锚点>", src_block_ids="id1,id2")`；基础标签均支持，资源块仅 `img`、`source`、`whiteboard`、`sheet`、`chat_card`、`sub-page-list` 支持复制，`task`、`bitable`、`base_ref`、`synced_reference`、`synced_source`、`okr` 不支持复制。

详见 `lark_get_skill(domain="doc", section="update")`。

## 颜色

颜色用于表达语义，并在全文保持一致；默认保持中性色排版，避免仅为装饰而着色。

- **合法值**：色相为 `red, orange, yellow, green, blue, purple, gray`；`text-color`、`border-color` 使用基础色相；`<span>`、`<th>`、`<td>`、`<button>` 背景支持基础色相、`light-{色相}`、`medium-gray`；高亮块背景支持 `gray`、`light-{色相}`、`medium-{色相}`。也可写 `rgb(r,g,b)` / `rgba(r,g,b,a)`，但优先使用命名色。
- **高亮块**：默认使用 `light-*` 背景和默认文字色；强提醒才使用 `medium-*`，彩色文字只强调短语。
- **表格**：表头优先使用 `light-gray` 或 `medium-gray`；彩色单元格只表达状态或分类，避免整表铺色。
- 常用 emoji：bulb checkmark crossmark memo question exclamation thumbsup heart pin flag star。

## 转义规则

禁止转义标签本身；只转义标签内部的文本内容。

- 文本转义：`<` → `&lt;`，`>` → `&gt;`，`&` → `&amp;`，换行符 `\n` → `<br/>`。
- 错误：`&lt;p&gt;内容&lt;/p&gt;`（把标签也转义了）
- 正确：`<p>A &amp; B 的对比：1 &lt; 2</p>`（标签保持原样，文本中的 `&` 和 `<` 才转义）

## 完整示例

```xml
<title>文档标题</title>

<h1 seq="auto">一级标题</h1>

<p><b>加粗文本</b>，<span text-color="green">绿色文本</span></p>

<callout emoji="bulb" background-color="light-yellow" border-color="yellow">
  <p>高亮框内容，子块仅支持文本/标题/列表/待办/引用</p>
</callout>

<checkbox done="true">已完成事项</checkbox>
<checkbox done="false">未完成事项</checkbox>

<grid>
  <column width-ratio="0.5">
    <p>左栏</p>
  </column>
  <column width-ratio="0.5">
    <p>右栏</p>
  </column>
</grid>

<table>
  <colgroup><col span="2" width="120"/></colgroup>
  <thead><tr><th background-color="light-gray"><p>表头</p></th><th background-color="light-gray"><p>表头</p></th></tr></thead>
  <tbody><tr><td><p>单元格</p></td><td><p>单元格</p></td></tr></tbody>
</table>

<p><cite type="doc" doc-id="DOC_TOKEN"></cite> <cite type="user" user-id="USER_ID"></cite></p>

<ol><li seq="auto">第一项</li><li seq="auto">第二项</li></ol>

<p><a type="url-preview" href="https://example.com">链接标题</a></p>

<p><latex>E = mc^2</latex></p>

<pre lang="go" caption="示例"><code>fmt.Println("hello")</code></pre>

<hr/>

<source token="FILE_TOKEN" name="文件名.pdf"/>
<img src="IMG_TOKEN" width="800" height="400" caption="说明" name="图.png"/>
<img href="https://example.com/photo.png"/>

<whiteboard type="mermaid">flowchart LR
  A[开始] --> B[结束]
</whiteboard>

<button action="OpenLink" src="https://example.com">按钮文字</button>

<time expire-time="1775916000000" notify-time="1775912400000" should-notify="false">时间戳毫秒</time>

<cite type="citation"><a href="https://example.com" url-type="5">引文标题</a></cite>
<bookmark name="书签标题" href="https://example.com"></bookmark>

<task task-id="TASK_GUID"></task>
<chat_card chat-id="CHAT_ID"></chat_card>
<sub-page-list></sub-page-list>
```

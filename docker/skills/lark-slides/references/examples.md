# 完整操作示例

本文档提供 MCP 工具调用示例，XML 内容均遵循 slides_xml_schema_definition.xml。

> **重要**：新建 PPT 请使用 `lark_slides_create` 的 `slides` 参数，传入由 `<slide>` XML 字符串组成的 JSON 数组；每个元素必须是一页完整的 `<slide>`。复杂内容建议先创建空白 PPT，再通过 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", ...)` 逐页添加。完整 `<presentation>` XML 可用于本地 lint 或读取，但不能直接作为 `lark_slides_create` 的提交参数。

## 目录

- [示例 1：可靠创建 6 页 PPT](#示例-1可靠创建-6-页-ppt)
- [示例 7: block_insert 给已有页加图](#示例-7-block_insert-给已有页加图)
- [示例 8: block_replace 替换一个块](#示例-8-block_replace-替换一个块)

## 示例 1：可靠创建 6 页 PPT

### 1. 写入规划文件

按 `lark_get_skill(domain="slides", section="planning-layer")` 在 `.lark-slides/plan/<deck-id>/slide_plan.json` 写入规划，至少记录 6 页的顺序和标题。

### 2. 为每页生成独立 XML

逐页生成完整的 `<slide>` XML。每页的 `<content>` 都设置 `autoFit="normal-auto-fit"` 以防文字溢出。示例单页：

```xml
<slide xmlns="http://www.larkoffice.com/sml/2.0"><style><fill><fillColor color="rgb(248,250,252)"/></fill></style><data><shape type="rect" topLeftX="56" topLeftY="56" width="12" height="428"><fill><fillColor color="rgb(37,99,235)"/></fill></shape><shape type="text" topLeftX="100" topLeftY="160" width="760" height="90"><content textType="title" autoFit="normal-auto-fit"><p>主题与结论</p></content></shape><shape type="text" topLeftX="100" topLeftY="290" width="700" height="70"><content textType="body" autoFit="normal-auto-fit"><p>页面主体内容。</p></content></shape></data></slide>
```

### 3. 逐页运行 lint

提交前检查每页 XML。`summary.error_count` 必须为 `0`，否则先修复 XML 或布局问题。

```
lark_exec_script(script="lark-slides/scripts/xml_text_overlap_lint.py", args=["--input", "-"], stdin="<单页 slide XML>")
```

### 4. 用 `lark_slides_create` 创建 6 页 PPT

`slides` 参数接收由 6 个完整 `<slide>` XML 字符串组成的 JSON 数组：

```
lark_slides_create(title="可靠创建 6 页 PPT", slides='["<slide ...>...</slide>", "<slide ...>...</slide>", "<slide ...>...</slide>", "<slide ...>...</slide>", "<slide ...>...</slide>", "<slide ...>...</slide>"]')
```

从返回结果中保存 `xml_presentation_id`。如果创建中途失败，先保存已经返回的 `xml_presentation_id`，再回读确认实际已创建页数。

### 5. 用 `lark_slides_xml_get` 回读全文 XML

```
lark_slides_xml_get(presentation="<PRESENTATION_ID>", output=".lark-slides/plan/<deck-id>/readback.xml")
```

## 示例 7: block_insert 给已有页加图

只想在已有页上加一张图、不动其他元素——走 `lark_slides_replace_slide`，`block_insert` 追加到页末（或用 `insert_before_block_id` 指定位置）。

```
# 1. 上传图片拿 file_token
lark_slides_media_upload(file="./pic.png", presentation="slides_example_presentation_id")
# 获取返回的 file_token

# 2. block_insert 到页面末尾（省略 insert_before_block_id）
# 注：<img .../> 是自闭合标签，不会展开（只有 <shape/> 会被补 <content/>）
lark_slides_replace_slide(presentation="slides_example_presentation_id", slide_id="slide_example_id", parts='[{"action":"block_insert","insertion":"<img src=\"<file_token>\" topLeftX=\"500\" topLeftY=\"100\" width=\"200\" height=\"150\"/>"}]')
```

预期返回：

```json
{
  "ok": true,
  "data": {
    "xml_presentation_id": "slides_example_presentation_id",
    "slide_id": "slide_example_id",
    "parts_count": 1,
    "revision_id": 102
  }
}
```

## 示例 8: block_replace 替换一个块

已知某块的 3 位 short element ID（从 `slide.get` 返回 XML 里读），整块换掉。`replacement` 根元素的 `id` 会自动注入为 `block_id`，无需手写；若写了 `<shape/>` 自闭合形式，也会自动补 `<content/>`。

```
lark_slides_replace_slide(presentation="slides_example_presentation_id", slide_id="slide_example_id", parts='[{"action":"block_replace","block_id":"bab","replacement":"<shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新标题</p></content></shape>"}]')
```

失败时（3350001 错误，在 error 字段中给出 hint）：

```json
{
  "ok": false,
  "error": {
    "type": "api",
    "code": 3350001,
    "message": "API error: [3350001] invalid param",
    "hint": "common causes: (1) block_id not found in current slide ..."
  }
}
```

整批作为原子事务，任一 part 失败则整批不生效；定位修正后重发。

## 相关文档

- `slides_xml_schema_definition.xml`（skill 内置 XSD）— 完整 XML Schema
- `slides_demo.xml`（skill 内置示例）— 更完整的页面示例

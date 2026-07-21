# slides xml_presentation.slide replace

## 用途

对单页做**块级局部替换**：不覆盖整页，按 patch 列表做 `block_replace`（整块替换）或 `block_insert`（整块插入）。

> **推荐**：优先使用 `lark_slides_replace_slide`——它会自动注入 `id` 和 `<content/>`，直接调本 API 需自己处理这两个约束。

## 用法

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_replace", args={
  params: {"xml_presentation_id": "slides_example_presentation_id", "slide_id": "slide_example_id"},
  data: {"parts": [{"action": "block_replace", "block_id": "bab", "replacement": "<shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新标题</p></content></shape>"}]}
})
```

## 注意事项

1. **parts 原子事务**：任一条失败整批回滚。
2. **`block_replace` 要求 `replacement` 根元素带 `id="<block_id>"`**：推荐走 `lark_slides_replace_slide`——它会自动注入。
3. **`<shape>` 必须有 `<content/>` 子元素**：`lark_slides_replace_slide` 会自动注入，直接调底层 API 需要自己加。

## 相关命令

- `lark_get_skill(domain="slides", section="replace-slide")` — 块级替换 shortcut（推荐，自动注入 id）
- `lark_get_skill(domain="slides", section="xml-presentation-slide-get")` — 读原页拿 block short ID
- `lark_get_skill(domain="slides", section="media-upload")` — 上传图片拿 file_token

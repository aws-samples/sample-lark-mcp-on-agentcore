# slides xml_presentation.slide get

## 用途

按 `slide_id` 拉取指定演示文稿单页的 XML 内容（可指定历史版本）。常用于"读-改-写"编辑闭环的第一步。

## 用法

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_get", args={
  params: {"xml_presentation_id": "slides_example_presentation_id", "slide_id": "slide_example_id"}
})
```

## 参数

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `xml_presentation_id` | string | 是 | 目标演示文稿唯一标识 |
| `slide_id` | string | 是 | 目标页面唯一标识 |
| `revision_id` | integer | 否 | 版本号，`-1` 表示最新版（默认）|

## 返回值

```json
{
  "code": 0,
  "data": {
    "slide": {
      "slide_id": "slide_example_id",
      "content": "<slide id=\"slide_example_id\"><style/><data>...</data></slide>"
    },
    "revision_id": 100
  },
  "msg": "success"
}
```

## 注意事项

1. **block_id 提取**：返回 XML 里每个顶层块（shape、img、table、chart、whiteboard 等）的 `id` 属性即为 `block_id`，通常是 3 字符短码，例如 `<shape id="bUn" ...>`。

## 相关命令

- `lark_get_skill(domain="slides", section="replace-slide")` — 块级替换 shortcut（推荐）
- `lark_get_skill(domain="slides", section="xml-presentations-get")` — 读整个 PPT
- `lark_get_skill(domain="slides", section="edit-workflows")` — 读-改-写闭环

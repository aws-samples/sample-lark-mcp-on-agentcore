# slides xml_presentations get

## 用途

读取飞书幻灯片（PPT）演示文稿的完整 XML 内容信息。

## Shortcut

优先使用 `lark_slides_xml_get`，可以把 XML 保存到本地文件，避免终端输出被截断。

```
lark_slides_xml_get(presentation="slides_example_presentation_id", output=".lark-slides/plan/slides_example_presentation_id/readback.xml")
```

### 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `presentation` | string | 是 | 演示文稿的唯一标识符 |
| `revision_id` | integer | 否 | 版本号，`-1` 表示最新版本 |
| `output` | string | 是 | 本地文件，必须使用相对路径 |
| `remove_attr_id` | boolean | 否 | 移除 XML id 属性后读取 |

### 指定版本读取

```
lark_slides_xml_get(presentation="slides_example_presentation_id", revision_id=10, output=".lark-slides/plan/slides_example_presentation_id/readback-r10.xml")
```

### 移除 XML id 属性后读取

```
lark_slides_xml_get(presentation="slides_example_presentation_id", remove_attr_id=true, output=".lark-slides/plan/slides_example_presentation_id/readback-no-id.xml")
```

## 底层原生命令形态

```
lark_invoke(tool_name="lark_slides_xml_presentations_get", args={
  params: {"xml_presentation_id": "slides_example_presentation_id"}
})
```

## 参数

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `xml_presentation_id` | string | 是 | 演示文稿的唯一标识符 |
| `revision_id` | integer | 否 | 版本号，`-1` 表示最新版本 |
| `remove_attr_id` | boolean | 否 | 为 `true` 时移除返回 XML 中的 `id` 属性 |

## 返回值

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "xml_presentation": {
      "presentation_id": "slides_example_presentation_id",
      "revision_id": 1,
      "content": "<presentation xmlns=\"http://www.larkoffice.com/sml/2.0\" height=\"540\" width=\"960\">...</presentation>"
    }
  }
}
```

## 注意事项

1. lark-slides 工作流默认使用 `lark_slides_xml_get`；只有必须直接调底层 API 时，才使用 `lark_invoke`
2. 直接调用底层 API 前，使用 `lark_discover(query="slides.xml_presentations.get")` 查看最新的参数结构
3. 返回的 XML 在 `data.xml_presentation.content` 字段中
4. 不要在普通工作流中把完整 XML 打到终端；用 `lark_slides_xml_get` 的 `output` 参数保存文件

## 相关命令

- `lark_get_skill(domain="slides", section="create")` - 创建空白 PPT
- `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create")`（`lark_get_skill(domain="slides", section="xml-presentation-slide-create")`） - 添加幻灯片页面
- `lark_get_skill(domain="slides", section="xml-presentation-slide-delete")` - 删除幻灯片页面

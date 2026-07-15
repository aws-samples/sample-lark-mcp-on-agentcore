# 完整操作示例

本文档提供 MCP 工具调用示例，XML 内容均遵循 slides_xml_schema_definition.xml。

> **重要**：创建 PPT 请优先使用 `lark_slides_create`；实际页面内容请使用 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", ...)` 逐页添加。

## 示例 1: 创建空白演示文稿

```
lark_slides_create(title="项目汇报")
```

## 示例 2: 创建后添加第一页

```
# 第 1 步：创建空白 PPT
lark_slides_create(title="季度复盘")
# 获取返回的 xml_presentation_id

# 第 2 步：添加页面
lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", args={
  params: {"xml_presentation_id": "<PRESENTATION_ID>"},
  data: {"slide": {"content": "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\"><style><fill><fillColor color=\"rgb(245, 245, 245)\"/></fill></style><data><shape type=\"text\" topLeftX=\"80\" topLeftY=\"72\" width=\"760\" height=\"90\"><content textType=\"title\"><p>2024 Q3 季度复盘</p></content></shape></data></slide>"}}
})
```

## 示例 3: 读取 XML 内容

```
lark_invoke(tool_name="lark_slides_xml_presentations_get", args={
  params: {"xml_presentation_id": "slides_example_presentation_id"}
})
```

## 示例 4: 在指定页面前插入新幻灯片

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", args={
  params: {"xml_presentation_id": "slides_example_presentation_id"},
  data: {"slide": {"content": "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\"><data><shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新增页面</p></content></shape></data></slide>"}, "before_slide_id": "sld_before_target"}
})
```

## 示例 5: 删除幻灯片

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_delete", args={
  params: {"xml_presentation_id": "slides_example_presentation_id", "slide_id": "slide_example_id"}
})
```

## 示例 6: +replace-slide + block_insert 给已有页加图

```
# 1. 上传图片拿 file_token
lark_slides_media_upload(file="./pic.png", presentation="slides_example_presentation_id")
# 获取返回的 file_token

# 2. block_insert 到页面末尾
lark_slides_replace_slide(presentation="slides_example_presentation_id", slide_id="slide_example_id", parts='[{"action":"block_insert","insertion":"<img src=\"<file_token>\" topLeftX=\"500\" topLeftY=\"100\" width=\"200\" height=\"150\"/>"}]')
```

## 示例 7: +replace-slide + block_replace 替换一个块

```
lark_slides_replace_slide(presentation="slides_example_presentation_id", slide_id="slide_example_id", parts='[{"action":"block_replace","block_id":"bab","replacement":"<shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新标题</p></content></shape>"}]')
```

## 相关文档

- `slides_xml_schema_definition.xml`（skill 内置 XSD）— 完整 XML Schema
- `slides_demo.xml`（skill 内置示例）— 更完整的页面示例

# slides xml_presentations get

## 用途

读取飞书幻灯片（PPT）演示文稿的完整 XML 内容信息。

## 用法

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

## 返回值

```json
{
  "code": 0,
  "data": {
    "xml_presentation": {
      "presentation_id": "slides_example_presentation_id",
      "revision_id": 1,
      "content": "<presentation xmlns=\"http://www.larkoffice.com/sml/2.0\" height=\"540\" width=\"960\">...</presentation>"
    }
  },
  "msg": "success"
}
```

## 注意事项

1. **执行前必做**: 使用 `lark_discover(query="slides.xml_presentations.get")` 查看最新的参数结构
2. 返回的 XML 在 `data.xml_presentation.content` 字段中

## 相关命令

- `lark_get_skill(domain="slides", section="create")` - 创建空白 PPT
- `lark_get_skill(domain="slides", section="xml-presentation-slide-create")` - 添加幻灯片页面

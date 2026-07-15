# slides xml_presentation.slide delete

## 用途

删除指定 XML 演示文稿中的幻灯片页面。

## 用法

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_delete", args={
  params: {"xml_presentation_id": "slides_example_presentation_id", "slide_id": "slide_example_id"}
})
```

## 参数

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `xml_presentation_id` | string | 是 | 演示文稿的唯一标识符 |
| `slide_id` | string | 是 | 要删除的幻灯片唯一标识符 |
| `revision_id` | integer | 否 | 演示文稿版本号，`-1` 表示最新版本 |

## 返回值

```json
{
  "code": 0,
  "data": {
    "revision_id": 100
  },
  "msg": "success"
}
```

## 注意事项

1. **删除不可逆**: 删除操作无法撤销，请确保已备份重要内容
2. **至少保留一页**: 演示文稿必须至少保留一页幻灯片，删除最后一页会报错

## 相关命令

- `lark_get_skill(domain="slides", section="create")` - 创建空白 PPT
- `lark_get_skill(domain="slides", section="xml-presentations-get")` - 读取 PPT 内容

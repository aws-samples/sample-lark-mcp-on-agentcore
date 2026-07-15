# slides xml_presentation.slide create

## 用途

在指定的 XML 演示文稿中创建新的幻灯片页面，通常用于给 `lark_slides_create` 创建出的空白 PPT 逐页补充内容。

## 用法

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", args={
  params: {"xml_presentation_id": "slides_example_presentation_id"},
  data: {"slide": {"content": "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\">...</slide>"}}
})
```

### 在指定页面前插入

```
lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", args={
  params: {"xml_presentation_id": "slides_example_presentation_id"},
  data: {"slide": {"content": "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\">...</slide>"}, "before_slide_id": "slide_before_target"}
})
```

## 参数

### params

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `xml_presentation_id` | string | 是 | 目标演示文稿的唯一标识符 |
| `revision_id` | integer | 否 | 演示文稿版本号，`-1` 表示最新版本 |
| `tid` | string | 否 | 锁的事务 ID |

### data

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `slide.content` | string | 否 | 新幻灯片的 XML 内容 |
| `before_slide_id` | string | 否 | 插入到指定页面之前 |

## 返回值

```json
{
  "code": 0,
  "data": {
    "slide_id": "slide_example_id",
    "revision_id": 100
  },
  "msg": "success"
}
```

## 注意事项

1. **执行前必做**: 使用 `lark_discover(query="slides.xml_presentation.slide.create")` 查看最新的参数结构
2. **slide.content 格式**: 必须是完整的 `<slide>` 元素
3. **命名空间建议**: 协议标准写法应带 `xmlns`，例如 `<slide xmlns="http://www.larkoffice.com/sml/2.0">`
4. **插入位置**: 通过 `before_slide_id` 指定插入目标

> [!IMPORTANT]
> **本地图片必须先上传**：`xml_presentation.slide.create` 不识别 `@./local.png` 占位符（那是 `lark_slides_create` 的 `slides` 参数语法糖）。直接调本接口添加带图新页时，必须先用 `lark_slides_media_upload` 拿到 `file_token`，再写进 `<img src="<file_token>">`。

## 相关命令

- `lark_get_skill(domain="slides", section="create")` - 创建空白 PPT
- `lark_get_skill(domain="slides", section="xml-presentations-get")` - 读取 PPT 内容

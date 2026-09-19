# slides +xml-get（读取演示文稿 XML）

读取全文或单页 XML。全文验证优先把结果保存到本地文件；局部编辑可读取单页 XML，从顶层块的 `id` 属性取得 `lark_slides_replace_slide` 所需的 `block_id`。

```
lark_slides_xml_get(presentation="slides_example_presentation_id", output=".lark-slides/plan/slides_example_presentation_id/readback.xml")
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `presentation` | string | 是 | `xml_presentation_id`、Slides URL，或可解析为 Slides 的 wiki URL |
| `revision_id` | integer | 否 | 版本号，`-1` 表示最新版本 |
| `output` | string | 否 | XML 保存路径，必须使用当前目录内的相对路径；省略时 XML 在返回的 JSON 里 |
| `raw` | boolean | 否 | 直接返回 XML，不包 JSON envelope；不能与 `output` 或非 JSON `format` 同时使用 |
| `slide_id` | string | 否 | 只读取指定 `slide_id` 的单页 XML；不能与 `slide_number` 或 `remove_attr_id` 同时使用 |
| `slide_number` | integer | 否 | 只读取指定的 1-based 页码；不能与 `slide_id` 或 `remove_attr_id` 同时使用 |
| `remove_attr_id` | boolean | 否 | 仅全文读取可用；移除 XML id 属性后读取，不适合后续精确块编辑（尤其不要把它的输出交给 `lark_slides_update_slide`，见 `lark_get_skill(domain="slides", section="cli/lark-slides-update-slide")`）|

## 示例

```
# 读取全文并保存，用于创建后验证
lark_slides_xml_get(presentation="slides_example_presentation_id", output=".lark-slides/plan/slides_example_presentation_id/readback.xml")

# 读取单页以获取 block_id（按页面 ID 和按页码二选一）
lark_slides_xml_get(presentation="slides_example_presentation_id", slide_id="slide_example_id", raw=true)
lark_slides_xml_get(presentation="slides_example_presentation_id", slide_number=1)

# 指定版本读取
lark_slides_xml_get(presentation="slides_example_presentation_id", revision_id=10, output=".lark-slides/plan/slides_example_presentation_id/readback-r10.xml")

# 移除 XML id 属性后读取
lark_slides_xml_get(presentation="slides_example_presentation_id", remove_attr_id=true, output=".lark-slides/plan/slides_example_presentation_id/readback-no-id.xml")
```

JSON 输出中，全文 XML 位于 `data.xml_presentation.content`，单页 XML 位于 `data.slide.content`；二者的 `data.revision_id` 都可用于后续写操作的乐观锁。

## 常见错误

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 404 | 演示文稿或页面不存在 | 检查 `presentation` 和 `slide_id` 是否正确 |
| 403 | 权限不足 | 检查是否拥有 `slides:presentation:read` scope，或是否有访问权限 |
| 400 | `revision_id` 不存在 | 用 `-1` 或真实存在的版本号 |

## 注意事项

1. 不要在普通工作流中把完整 XML 打到终端；用 `output` 保存文件
2. 单页读取返回的 XML 里，每个顶层块（shape、img、table、chart 等）的 `id` 属性即为 `block_id`，通常是 3 字符短码，例如 `<shape id="bUn" ...>`

## 相关命令

- `lark_get_skill(domain="slides", section="cli/lark-slides-replace-slide")` — 块级替换 / 插入
- `lark_get_skill(domain="slides", section="cli/lark-slides-update-slide")` — 整页覆盖
- `lark_get_skill(domain="slides", section="cli/lark-slides-create")` — 创建空白 PPT
- `lark_get_skill(domain="slides", section="cli/lark-slides-add-slide")` — 添加幻灯片页面
- `lark_get_skill(domain="slides", section="cli/lark-slides-delete-slide")` — 删除幻灯片页面

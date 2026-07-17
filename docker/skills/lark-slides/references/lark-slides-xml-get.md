# slides +xml-get（读取 XML）

读取已有演示文稿的完整 XML，或按 `slide_id` / 页码读取单页 XML。适合创建后验收、编辑前备份、获取 `slide_id` / `revision_id`，以及排查空白页、破图、文本溢出等问题。相比直接调用底层 `xml_presentations.get` / `xml_presentation.slide.get`，本 shortcut 会自动解析 Slides URL / Wiki URL，并可把 XML 保存到本地文件，避免输出被截断。

## 命令

```
lark_slides_xml_get(presentation="<slides_url_or_xml_presentation_id>", output=".lark-slides/plan/<deck-id>/readback.xml")
```

## 参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `presentation` | 是 | `xml_presentation_id`、`/slides/` URL 或 `/wiki/` URL |
| `output` | 否 | 本地 XML 保存路径，必须是当前工作目录内的相对路径，不能传绝对路径。传入时 XML 内容保存到文件，只返回保存后的绝对路径、大小等简短元信息；省略时默认返回 JSON envelope |
| `slide_id` | 否 | 页面 short ID；传入后只读取该页 XML。不能和 `slide_number` 同时使用 |
| `slide_number` | 否 | 1-based 页码；传入后只读取该页 XML。不能和 `slide_id` 同时使用 |
| `revision_id` | 否 | 读取指定版本；默认 `-1`，表示最新版本 |
| `remove_attr_id` | 否 | 仅全文读取可用。移除返回 XML 中的 `id` 属性；适合只读检查，不适合精确块级编辑 |

## 输出到文件

推荐普通工作流都传 `output`，尤其是中大型 PPT。`output` 必须是当前工作目录内的相对路径，例如 `.lark-slides/plan/<PID>/readback.xml`，不要传 `/tmp/readback.xml` 这类绝对路径。XML 会写入本地文件，只保留元信息，便于后续脚本读取。

```
lark_slides_xml_get(presentation="<PID>", output=".lark-slides/plan/<PID>/readback.xml")
```

成功输出中的 `data` 类似：

```json
{
  "xml_presentation_id": "slides_example_presentation_id",
  "path": "/abs/path/.lark-slides/plan/slides_example_presentation_id/readback.xml",
  "size": 123456,
  "content_saved": true,
  "revision_id": 12
}
```

其中 `path` 是解析后的绝对路径。

如果传入 `remove_attr_id`，返回元信息中会包含 `"remove_attr_id": true`。

## 读取单页

已知页面 short ID 时，用 `slide_id`：

```
lark_slides_xml_get(presentation="<PID>", slide_id="<SID>", output=".lark-slides/plan/<PID>/slide-<SID>.xml")
```

已知页码时，用 `slide_number`（页码从 1 开始）：

```
lark_slides_xml_get(presentation="<PID>", slide_number="2", output=".lark-slides/plan/<PID>/slide-2.xml")
```

单页模式底层调用 `xml_presentation.slide.get`，返回或保存的是单个 `<slide>` XML 片段。`slide_id` 和 `slide_number` 不能同时传；`remove_attr_id` 只支持全文读取。

## 输出到 envelope

省略 `output` 时，默认返回 JSON envelope，XML 位于 `data.xml_presentation.content`（全文）或 `data.slide.content`（单页）。

```
lark_slides_xml_get(presentation="<PID>")
```

## 相关命令

- `lark_get_skill(domain="slides", section="screenshot")` - 获取页面截图做视觉验证
- `lark_get_skill(domain="slides", section="replace-slide")` - 局部替换或插入页面元素
- `lark_get_skill(domain="slides", section="replace-pages")` - 多页整页重建
- `lark_get_skill(domain="slides", section="xml-presentations-get")` - 底层原生 API 参考

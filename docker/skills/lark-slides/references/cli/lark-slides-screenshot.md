# slides +screenshot

## 用途

获取幻灯片页面截图并保存为本地图片文件。默认用于已存在 PPT 页面截图；传入 `content` 时用于直接渲染单个 `<slide>` XML 片段预览。该操作会在服务端解码并写入文件，返回文件路径、大小、页面 ID 等元信息，避免把图片 Base64 输出给模型。

截图失败则降级到 XML 读回、结构 lint 等非截图检查路径。

## 命令

```
lark_slides_screenshot(presentation="<xml_presentation_id 或 slides/wiki URL>", slide_number="1")
```

渲染本地 XML 内容：

```
lark_slides_screenshot(content="<slide> XML 片段")
```

## 截图全部页面

枚举全部页面的 `slide_id` 或页码，按每批最多 10 页分组并串行调用 `lark_slides_screenshot`，复用同一个 `output_dir`；记录失败批次，已完成批次不重复执行。

## 参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `presentation` | list 模式必需 | `xml_presentation_id`、`/slides/` URL，或解析后为 slides 的 `/wiki/` URL。传 `content` 时不能使用 |
| `slide_id` | list 模式与 `slide_number` 二选一 | 页面 short ID；不能与 `slide_number` 同时使用；多页截图时用逗号分隔多个值；一次最多 10 个 ID |
| `slide_number` | list 模式与 `slide_id` 二选一 | 页面页号；不能与 `slide_id` 同时使用；多页截图时用逗号分隔多个值；一次最多 10 个页码 |
| `content` | render 模式必需 | 要直接渲染的 `<slide>` XML 片段。传入后不能同时传 `slide_id` / `slide_number` |
| `output` | 否 | 单张截图的期望相对输出路径，可不写扩展名，显式扩展名只支持 `.png`、`.jpg`、`.jpeg`。只能选择一页，不能与 `output_dir` / `output_name` 同时使用；最终路径以返回的 `output` 为准 |
| `output_dir` | 否 | 输出目录，默认 `.lark-slides/screenshots`；必须是当前目录内的相对路径 |
| `output_name` | 否 | 仅用于 `content` render 模式设置输出文件名 stem。普通页面截图传入该参数会返回 `validation/invalid_argument`（`param: output_name`）并提示改用 `output` |

## 示例

### 单页截图并固定路径

```
lark_slides_screenshot(presentation="slides_example_presentation_id", slide_number="1", output=".lark-slides/screenshots/example-deck-task/page-01")
```

按 `slide_id` 选择单页时同样使用 `output`：

```
lark_slides_screenshot(presentation="slides_example_presentation_id", slide_id="slide_example_id", output=".lark-slides/screenshots/example-deck-task/page-01")
```

### 多页截图

一次不要超过 10 页；如需更多页面，分批调用。

```
lark_slides_screenshot(presentation="slides_example_presentation_id", slide_number="1,2", output_dir=".lark-slides/screenshots/example-deck-task")
```

### 渲染 XML 预览

```
lark_slides_screenshot(content="<slide>...</slide>", output=".lark-slides/screenshots/example-deck-task/preview")
```

## 返回值

返回 JSON 不包含 Base64 图片内容：

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "xml_presentation_id": "slides_example_presentation_id",
    "output": "/abs/path/.lark-slides/screenshots/example-deck-task/page-01.jpg",
    "screenshots": [
      {
        "slide_id": "slide_example_id",
        "slide_number": 1,
        "format": "jpeg",
        "path": "/abs/path/.lark-slides/screenshots/example-deck-task/page-01.jpg",
        "size": 12345
      }
    ]
  }
}
```

## 注意事项

1. 优先使用 `lark_slides_screenshot` 保存本地图片，不要把图片 Base64 打到输出。
2. 已存在 PPT 页面截图时，不传 `content`，用 `presentation` + `slide_id` 或 `slide_number`。
3. 本地 XML 预览时，传 `content`，内容应为单个 `<slide>` XML 片段；此时不要传 `presentation` / `slide_id` / `slide_number`。
4. `slide_id` 是页面 short ID，页码请用 `slide_number`。
5. list 模式下 `slide_id` 与 `slide_number` 必须二选一；同一类型 selector 一次最多传 10 个，更多页面请分批截图。
6. 单张使用 `output`，多张使用 `output_dir`，由服务端按页面信息生成文件名。新建或大幅改写 Deck 时，截图目录复用 planning 阶段的 `<deck-or-task-id>`；已有 Deck 没有 task ID 时，使用 presentation ID 作为目录名。
7. 不会转换图片格式，也不要求预判服务端格式。未写扩展名时自动追加真实扩展名；请求扩展名与真实格式不一致时保留目录和名称、修正扩展名，例如请求 `slide3.png` 而服务端返回 JPEG 时实际保存为 `slide3.jpg`。
8. 发生扩展名修正或同名避让时会返回原始 `requested_output`、实际绝对路径 `output` 和 `output_adjusted: true`；后续必须使用 `output` / `screenshots[].path`，不要继续猜测请求路径。
9. list 模式默认文件名包含 presentation ID、页码和/或 slide ID。
10. 截图来自服务端渲染结果，适合创建/替换后验证页面是否为空白、破图或布局明显异常。

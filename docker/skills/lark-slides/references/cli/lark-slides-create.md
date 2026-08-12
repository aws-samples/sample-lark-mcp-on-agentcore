# slides +create（创建飞书幻灯片）

创建一个新的飞书幻灯片演示文稿，可选一步添加页面内容。

提交源必须是直接生成的单页 `<slide>` XML。禁止从完整 `<presentation>` XML 解析、拆分、重序列化出 slide 数组再提交。

本工具只从零创建演示文稿，没有导入本地 PPT 文件的参数。要把已有 PPTX 变成 Slides，用 `lark_drive_import(file="<x.pptx>", type="slides")`，再在导入结果上编辑，流程见 `lark_get_skill(domain="slides", section="workflow/template-editing")`。

## 创建方式选择

| 场景 | 推荐方式 |
|------|----------|
| 不超过 10 页 | `lark_slides_create(slides='[...]')` 一步创建（数组每项一页，顺序即页序）|
| 超过 10 页，或单次 payload 很大 | **两步创建**：先 `lark_slides_create` 创建空白 PPT，再用 `lark_slides_add_slide`（详见 `lark_get_skill(domain="slides", section="cli/lark-slides-add-slide")`）逐页添加 |
| 已有 PPT 继续追加或插入页面 | 使用 `lark_slides_add_slide`（详见 `lark_get_skill(domain="slides", section="cli/lark-slides-add-slide")`），必要时配合 `before_slide_id` |

> [!IMPORTANT]
> `lark_slides_create` 带页面时底层会逐页创建，不是原子操作。中途失败时先记录 `xml_presentation_id`，回读确认当前状态，再继续修复或追加。
>
> 单次 payload 过大时（整份 XML 接近百 KB 量级）改走两步创建逐页添加，避免一次性提交被参数长度上限截断。

**CRITICAL — 提交前必须先跑版式 lint**：对待提交的 `<slide>` XML 运行 `lark_exec_script(script="lark-slides/scripts/xml_lint.py", args=["--input", "-"], stdin="<待提交 XML>")`，`summary.error_count` 必须为 0。

## 用法

```
# 创建空白 PPT
lark_slides_create(title="项目汇报")

# 创建 PPT + 添加 slide 页面
lark_slides_create(title="项目汇报", slides='["<slide xmlns=...>...</slide>", "<slide xmlns=...>...</slide>"]')
```

## 返回值

工具成功执行后，返回一个 JSON 对象，包含以下字段：

- **`xml_presentation_id`**（string）：演示文稿的唯一标识符，后续添加页面时需要此 ID
- **`title`**（string）：演示文稿标题
- **`url`**（string，可选）：演示文稿的在线链接，如有返回则务必展示给用户
- **`revision_id`**（integer）：演示文稿版本号
- **`slide_ids`**（string[]，可选）：带页面创建时返回，成功添加的页面 ID 列表
- **`slides_added`**（integer，可选）：带页面创建时返回，成功添加的页面数量
- **`images_uploaded`**（integer，可选）：页面 XML 中含 `@<本地路径>` 占位符时返回，已上传的去重后图片数量

> [!IMPORTANT]
> 不带页面参数时，`lark_slides_create` 只创建空白演示文稿。创建后用 `lark_slides_add_slide`（`lark_get_skill(domain="slides", section="cli/lark-slides-add-slide")`）逐页添加 slide 内容。
>
> 带了页面时，先创建空白演示文稿，再逐页添加页面。如果某一页添加失败，已创建的演示文稿和已添加的页面会保留。

> [!IMPORTANT]
> ⚠️ 以应用身份（bot identity）创建演示文稿的操作需要 bot identity，不通过 MCP server 提供。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `title` | 否 | 演示文稿标题（不传则默认 "Untitled"） |
| `slide` | 否 | 一页 `<slide>` XML；与 `slides` 二选一，同时传会报错 |
| `slides` | 否 | 页面 XML 的 JSON 字符串数组，最多 10 个；与 `slide` 二选一 |

10 页是上限，服务端每次只接收一页。超过 10 页时先创建空白 PPT，再用 `lark_slides_add_slide`（`lark_get_skill(domain="slides", section="cli/lark-slides-add-slide")`）逐页添加。

两种形式的每一页都会在发请求前校验成「单个完整的 `<slide>` 文档」。不合格的页在创建演示文稿之前报错并指出页序号，不会留下空壳演示文稿。

## `slides` 参数格式

```json
[
  "<slide xmlns=\"https://www.larkoffice.com/sml/2.0\">...第1页XML...</slide>",
  "<slide xmlns=\"https://www.larkoffice.com/sml/2.0\">...第2页XML...</slide>"
]
```

JSON string 数组，每个元素是一页 slide 的完整 XML；数组元素是页面 XML 原文，包装成 API 所需的 `{"slide": {"content": …}}` 并逐页调用由服务端完成。

### 本地图片：`@<path>` 占位符

`<img>` 元素的 `src` 属性如果以 `@` 开头，会把它当作本地文件路径，自动上传到当前演示文稿，并把占位符替换为返回的 `file_token`。

行为：

- 路径相对于**当前工作目录**（CWD）解析；**必须是 CWD 内的相对路径**（如 `./pic.png`、`./assets/x.png`）
- 同一份图被多次引用时**只上传一次**（按路径去重）
- `src` 不以 `@` 开头的会原样保留，但**只允许写 `lark_slides_media_upload` 拿到的 `file_token`**；**禁止写 http(s) 外链 URL**
- 单张图片最大 20 MB
- 校验阶段就会检查所有占位符文件存在及大小；缺文件或超限直接报错，不会创建空白 PPT 占位
- 顺序固定：创空白 PPT → 上传所有图 → 替换 token → 逐页创建 slide
- 绝对路径（`@/abs/path/x.png`）和向上跳出 CWD（`@../up/x.png`）会被拒绝，报 `unsafe file path`

## 创建后续步骤

创建空白 PPT 时，`lark_slides_create` 返回的 `xml_presentation_id` 用于后续操作：

```
# 第 1 步：创建空白 PPT
lark_slides_create(title="项目汇报")
# 获取返回的 xml_presentation_id

# 第 2 步：逐页添加
lark_slides_add_slide(presentation="<PRES_ID>", slide="<slide xmlns=\"https://www.larkoffice.com/sml/2.0\">...</slide>")
```

## 常见错误

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 400 | 参数错误 | 检查参数格式是否正确 |
| 403 | 权限不足 | 检查是否拥有 `slides:presentation:create` 和 `slides:presentation:write_only` scope |

## 相关命令

- `lark_slides_add_slide`（`lark_get_skill(domain="slides", section="cli/lark-slides-add-slide")`） — 追加/插入单页（两步创建的第二步）
- `lark_slides_xml_get`（`lark_get_skill(domain="slides", section="cli/lark-slides-xml-presentations-get")`） — 读取 PPT 内容并保存到本地文件

# slides +create（创建飞书幻灯片）

创建一个新的飞书幻灯片演示文稿，可选一步添加页面内容。

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
- **`slide_ids`**（string[]，可选）：仅传 `slides` 时返回，成功添加的页面 ID 列表
- **`slides_added`**（integer，可选）：仅传 `slides` 时返回，成功添加的页面数量
- **`images_uploaded`**（integer，可选）：仅 `slides` 中含 `@<本地路径>` 占位符时返回，已上传的去重后图片数量

> [!IMPORTANT]
> 不传 `slides` 时，`lark_slides_create` 只创建空白演示文稿。创建后需要使用 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", ...)` 逐页添加 slide 内容。
>
> 传了 `slides` 时，先创建空白演示文稿，再逐页添加页面。如果某一页添加失败，已创建的演示文稿和已添加的页面会保留。

> [!IMPORTANT]
> ⚠️ 以应用身份（bot identity）创建演示文稿的操作需要 bot identity，不通过 MCP server 提供。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `title` | 否 | 演示文稿标题（不传则默认 "Untitled"） |
| `slides` | 否 | slide 内容 JSON 数组，每个元素是一个 `<slide>` XML 字符串（最多 10 个；超过 10 页请先创建空白 PPT，再逐页添加） |

## `slides` 参数格式

```json
[
  "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\">...第1页XML...</slide>",
  "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\">...第2页XML...</slide>"
]
```

JSON string 数组，每个元素是一页 slide 的完整 XML。

### 本地图片：`@<path>` 占位符

`<img>` 元素的 `src` 属性如果以 `@` 开头，会把它当作本地文件路径，自动上传到当前演示文稿，并把占位符替换为返回的 `file_token`。

行为：

- 路径相对于**当前工作目录**（CWD）解析；**必须是 CWD 内的相对路径**（如 `./pic.png`、`./assets/x.png`）
- 同一份图被多次引用时**只上传一次**（按路径去重）
- `src` 不以 `@` 开头的会原样保留，但**只允许写 `lark_slides_media_upload` 拿到的 `file_token`**；**禁止写 http(s) 外链 URL**
- 单张图片最大 20 MB
- 校验阶段就会检查所有占位符文件存在及大小；缺文件或超限直接报错，不会创建空白 PPT 占位

### 给已有 PPT 加带图新页

`lark_slides_create` 的 `slides` 参数只在新建 PPT 时使用 `@` 占位符。给已有 PPT 加带图新页要分两步：

```
# 1) 上传图片
lark_slides_media_upload(file="./pic.png", presentation="<PRES_ID>")
# 从返回结果中获取 file_token

# 2) 用返回的 file_token 创建带图新页
lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", args={
  params: {"xml_presentation_id": "<PRES_ID>"},
  data: {"slide": {"content": "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\"><data><img src=\"<file_token>\" topLeftX=\"100\" topLeftY=\"100\" width=\"200\" height=\"200\"/></data></slide>"}}
})
```

## 创建后续步骤

如果没有使用 `slides`，`lark_slides_create` 返回的 `xml_presentation_id` 用于后续操作：

```
# 第 1 步：创建空白 PPT
lark_slides_create(title="项目汇报")
# 获取返回的 xml_presentation_id

# 第 2 步：添加页面
lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", args={
  params: {"xml_presentation_id": "<PRES_ID>"},
  data: {"slide": {"content": "<slide xmlns=\"http://www.larkoffice.com/sml/2.0\">...</slide>"}}
})
```

## 常见错误

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 400 | 参数错误 | 检查参数格式是否正确 |
| 403 | 权限不足 | 检查是否拥有 `slides:presentation:create` 和 `slides:presentation:write_only` scope |

## 相关命令

- `lark_get_skill(domain="slides", section="xml-presentation-slide-create")` — 添加幻灯片页面
- `lark_get_skill(domain="slides", section="xml-presentations-get")` — 读取 PPT 内容

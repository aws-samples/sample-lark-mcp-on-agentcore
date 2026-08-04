# slides +media-upload（上传本地图片到飞书幻灯片）

把本地图片上传到指定演示文稿的 drive 媒体库，返回 `file_token`。**返回的 token 作为 `<img src="...">` 的值塞进 slide XML 即可显示图片。**

## 用法

```
# 直接传 xml_presentation_id
lark_slides_media_upload(file="./pic.png", presentation="slidesXXXXXXXXXXXXXXXXXXXXXX")

# 传 slides URL 也行
lark_slides_media_upload(file="./chart.png", presentation="https://xxx.feishu.cn/slides/slidesXXXXXXXXXXXXXXXXXXXXXX")

# 传 wiki URL（自动解析为真实 token，校验 obj_type=slides）
lark_slides_media_upload(file="./pic.png", presentation="https://xxx.feishu.cn/wiki/wikcnXXXXXX")
```

## 返回值

```json
{
  "file_token": "boxcnXXXXXXXXXXXXXXXXXXXXXX",
  "file_name": "pic.png",
  "size": 12345,
  "presentation_id": "slidesXXXXXXXXXXXXXXXXXXXXXX"
}
```

- **`file_token`**：把它写进 `<img src="...">`
- **`file_name` / `size`**：上传文件元信息
- **`presentation_id`**：解析后的真实 `xml_presentation_id`（传 wiki URL 时与入参不同）

> [!IMPORTANT]
> **路径必须在 CWD 内**：绝对路径（`file="/abs/path/x.png"`）或向上跳出（`file="../up/x.png"`）会被拒绝，报 `unsafe file path`。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | 本地图片路径，**必须是 CWD 内的相对路径**（如 `./pic.png`）。**最大 20 MB** |
| `presentation` | 是 | `xml_presentation_id`、`/slides/<token>` URL，或 `/wiki/<token>` URL |

## 使用流程

> 新建 PPT（`lark_slides_create` 的 `slides` 参数）或给已有 PPT 加新页（`lark_slides_add_slide` 的 `slide` 参数）都不需要单独上传：XML 里把 `<img src>` 写成 `@<本地路径>`，会自动上传并替换成 `file_token`。
> 本工具用于往**已有页**里加图，或需要自己拿着 `file_token` 拼 XML 的场景。

### 给已有 PPT 的已有页加图

拿到 `file_token` 后走 `lark_slides_replace_slide`（`lark_get_skill(domain="slides", section="replace-slide")`）的 `block_insert`，不用搬原 XML、不改 `slide_id`、不打乱页序。

注意事项：

1. **`<img>` 坐标避开现有元素** —— 先读现有元素 bbox 挑空白区；空间不够就先用 `block_replace` 挪动/缩小现有元素后再放图
2. **`<img>` 的 `width:height` 对齐原图比例** —— 比例不一致会被裁剪，参见 `lark_get_skill(domain="slides", section="xml-schema-quick-ref")` 的 `<img>` 说明

## 工作原理

内部调用 `POST /open-apis/drive/v1/medias/upload_all`（单次上传，最大 20 MB），固定使用：

- `parent_type=slide_file`（slides 后端唯一接受的取值）
- `parent_node=<xml_presentation_id>`

**不要尝试用 `slides_image`、`slide_image` 等 parent_type**——后端会返回 1061001 / 1061002 错误。这是 slides 的特殊约定。

## 常见错误

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 1061002 | params error / 不支持的 parent_type | 使用 `lark_slides_media_upload`，不要自己拼原生 API |
| 1061004 | forbidden：当前身份对该演示文稿无编辑权限 | 确认当前身份对目标 PPT 有编辑权限 |
| 1061044 | parent node not exist | `presentation` 给的 token 不对，或不是 slides 类型 |
| 403 | 权限不足 | 检查 `docs:document.media:upload` scope；wiki URL 还需要 `wiki:node:read` |

## 参考

- `lark_get_skill(domain="slides", section="create")` — 新建 PPT（支持 `@` 占位符自动上传图片）
- `lark_get_skill(domain="slides", section="replace-slide")` — 给已有页加图 / 换图（`block_insert` / `block_replace`）
- `lark_get_skill(domain="slides", section="add-slide")` — 追加/插入单页（同样支持 `@` 占位符自动上传）

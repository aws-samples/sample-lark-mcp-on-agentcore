
# docs +media-download（下载文档素材/画板缩略图）

> **前置条件：** (authentication is handled automatically by the MCP server)

下载文档中的图片/文件素材（`file_token`），或下载画板缩略图（`whiteboard_id`）。当 `output` 不带扩展名时，会根据响应的 `Content-Type` 自动补全扩展名。

## 选择规则

- 用户明确说"下载素材"时，使用 `lark_docs_media_download`
- 用户只是想查看、预览图片或文件素材时，优先使用 `lark_docs_media_preview`
- 如果目标明确是画板 / whiteboard / 画板缩略图，继续使用 `lark_docs_media_download(type="whiteboard")`；`lark_docs_media_preview` 不支持画板

## 命令

```
# 下载图片/文件素材（默认 type=media）
lark_docs_media_download(token="Z1Fjxxxxxxxx", output="./asset")

# 指定输出文件名（带扩展名则不会自动补全）
lark_docs_media_download(token="Z1Fjxxxxxxxx", output="./asset.png")

# 下载画板缩略图（whiteboard token）
lark_docs_media_download(type="whiteboard", token="wbcnxxxxxxxx", output="./whiteboard")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `token` | 是 | 资源 token：素材为 `file_token`，画板为 `whiteboard_id` |
| `output` | 是 | 本地保存路径；不带扩展名会自动补全 |
| `type` | 否 | `media`（默认）或 `whiteboard` |

## token 从哪里来

- 若你是从文档内容里提取：`lark_docs_fetch` 返回的内容里可能包含：
  - 图片：`<img token="..." .../>`
  - 文件：`<source token="..." name="..."/>`
  - 画板：`<whiteboard token="..."/>`

## 排障

- 如果报错返回的信息包含 `HTTP 403`，且目标是图片/文件素材，可以改成调用 `lark_docs_media_preview` 看是否能先预览内容

## 参考

- `lark_get_skill(domain="doc", section="fetch")` — 获取文档内容（用于提取 token）
- `lark_get_skill(domain="doc", section="media-preview")` — 预览素材

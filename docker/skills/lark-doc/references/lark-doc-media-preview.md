
# docs +media-preview（预览文档素材）

> **前置条件：** (authentication is handled automatically by the MCP server)

优先用于查看、预览文档中的图片或文件素材（`file_token`）。工具会把素材保存到本地路径，便于后续打开查看内容。

## 选择规则

- 用户说"看一下素材 / 图片 / 附件""预览一下"时，优先使用 `lark_docs_media_preview`
- 用户明确说"下载"时，使用 `lark_docs_media_download`
- 如果目标明确是画板 / whiteboard / 画板缩略图，不要使用 `lark_docs_media_preview`，改用 `lark_docs_media_download(type="whiteboard")`

## 命令

```
# 预览图片/文件素材
lark_docs_media_preview(token="Z1Fjxxxxxxxx", output="./asset")

# 指定输出文件名（带扩展名则不会自动补全）
lark_docs_media_preview(token="Z1Fjxxxxxxxx", output="./asset.png")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `token` | 是 | 素材 token，即 `file_token` |
| `output` | 是 | 本地保存路径；不带扩展名会自动补全 |

## token 从哪里来

- 若你是从文档内容里提取：`lark_docs_fetch` 返回的内容里可能包含：
  - 图片：`<img token="..." .../>`
  - 文件：`<source token="..." name="..."/>`

## 参考

- `lark_get_skill(domain="doc", section="fetch")` — 获取文档内容（用于提取 token）
- `lark_get_skill(domain="doc", section="media-download")` — 明确下载素材，或下载画板缩略图

# lark_note_transcript

(authentication is handled automatically by the MCP server)

只在 `lark_note_detail` 已确认 `note_display_type=unified` 时使用。普通纪要逐字稿是独立 Docx 文档，应回到 `lark_get_skill(domain="doc")` 读取 `verbatim_doc_token`。

本工具仅支持用户身份，不支持应用身份。MCP server 始终以用户身份调用，因此本工具可用；但不要把它当作应用身份路径的替代——如果一条链路本来是应用身份读取的纪要，先向用户说明该限制，不要静默切换身份继续。

```
lark_note_transcript(note_id="<note_id>")
```

## 行为契约

- 工具会先校验该 Note 是否为 `unified`；不是 unified 时不拉取 transcript。
- 工具内部自动翻页并拼接完整内容；任一页失败时整体报错，不返回半截 transcript。
- 逐字稿正文由 MCP server 直接放在返回结果的 `transcript_content` 字段里（`transcript_format` 默认 Markdown，`"plain_text"` 时为纯文本），不产生可供后续读取的文件；`output`、`overwrite` 会被忽略，重复拉取同一 Note 不会失败。
- `transcript_bytes` 是完整大小；`transcript_truncated=true` 时正文因单次返回上限被截断，结果顶层另有 `transcript_notice`，剩余部分无法通过本工具获取，应提示用户到纪要页面查看全文。

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/query-note-and-artifacts")` — 基于 `note_id` 查询纪要、逐字稿、共享文档等

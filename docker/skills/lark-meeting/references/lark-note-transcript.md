# lark_note_transcript

(authentication is handled automatically by the MCP server)

只在 `lark_note_detail` 已确认 `note_display_type=unified` 时使用。普通纪要逐字稿是独立 Docx 文档，应回到 `lark_get_skill(domain="doc")` 读取 `verbatim_doc_token`。

本工具仅支持用户身份，不支持应用身份。MCP server 始终以用户身份调用，因此本工具可用；但不要把它当作应用身份路径的替代——如果一条链路本来是应用身份读取的纪要，先向用户说明该限制，不要静默切换身份继续。

```
lark_note_transcript(note_id="<note_id>")
```

## 行为契约

- 工具会先校验该 Note 是否为 `unified`；不是 unified 时不拉取 transcript。
- 工具内部自动翻页并拼接完整内容；任一页失败时整体报错，不保存半截 transcript。
- 默认保存到 `./notes/{note_id}/unified_transcript.md`；`transcript_format="plain_text"` 时保存为 `.txt`。
- 目标文件已存在时会失败；用户明确要覆盖时才加 `overwrite=true`。

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/query-note-and-artifacts")` — 基于 `note_id` 查询纪要、逐字稿、共享文档等

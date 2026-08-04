# drive delete-reply

删除某条回复。**高风险写操作**：真实执行需要向用户确认后带上 `_confirm=true`；删除不可恢复。

## 命令

```
# 确认后真实删除
lark_drive_delete_reply(url="https://example.larksuite.com/docx/<DOCX_TOKEN>", comment_id="<id>", reply_id="<id>", _confirm=true)
```

## 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `url` | 与 `token` 二选一 | 推荐入口。支持 doc/docx/sheet/file/slides/base/bitable/apps/wiki URL；apps 妙搭 URL 使用 `/page/<token>`；wiki URL 会自动解析到真实文档。 |
| `token` | 与 `url` 二选一 | 裸 token 或 URL。裸 token 必须搭配 `type`；wiki token 使用 `type="wiki"`。 |
| `type` | 裸 token 时必填 | 传 token 对应类型：`doc`、`docx`、`sheet`、`file`、`slides`、`bitable`、`base`、`apps`、`wiki`。wiki token 使用 `wiki`；传 `base` 时，会按 `bitable` 类型处理。 |
| `comment_id` | 是 | 回复所属的评论 ID；来自 `lark_drive_list_comments` |
| `reply_id` | 是 | 要删除的回复 ID；来自 `lark_drive_list_replies` 的 `items[].reply_id`，或 `lark_drive_list_comments` 的 `items[].reply_list.replies[].reply_id` |
| `_confirm` | 真实执行时是 | 高风险确认；MCP server 会拒绝第一次未带确认的调用并给出提示 |

## 行为说明

- 删除永久生效，回复没有回收站或撤销。
- 删除按 reply 逐条生效：删除某条回复（包括第一条/根回复）不影响其它回复；把该评论卡片下的所有回复都删完后，评论卡片在前端页面才不再显示。
- **删除整条评论没有专门的工具，需要用本工具删光该卡片下的所有回复**（先用 `lark_drive_list_replies` 拉全回复 id）。删除前先和用户确认删的是某条回复还是整条评论。

## 输出

```json
{
  "file_token": "docx_token",
  "file_type": "docx",
  "comment_id": "<comment_id>",
  "reply_id": "<reply_id>",
  "deleted": true
}
```

## 参考

- `lark_get_skill(domain="drive", section="list-replies")` -- 获取回复与 reply_id

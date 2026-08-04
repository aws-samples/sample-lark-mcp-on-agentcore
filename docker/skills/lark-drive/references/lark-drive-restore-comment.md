# drive restore-comment

恢复 / 重新打开一条已解决的评论。反向操作——把评论标记为已解决——是独立工具，见 `lark_get_skill(domain="drive", section="resolve-comment")`。

用户说"重新打开 / 取消解决 / 恢复这条评论"对应本工具。

## 命令

```
# 推荐：完整 URL + 评论 ID
lark_drive_restore_comment(url="https://example.larksuite.com/docx/<DOCX_TOKEN>", comment_id="<id>")
```

## 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `url` | 与 `token` 二选一 | 推荐入口。支持 doc/docx/sheet/file/slides/base/bitable/apps/wiki URL；apps 妙搭 URL 使用 `/page/<token>`；wiki URL 会自动解析到真实文档。 |
| `token` | 与 `url` 二选一 | 裸 token 或 URL。裸 token 必须搭配 `type`；wiki token 使用 `type="wiki"`。 |
| `type` | 裸 token 时必填 | 传 token 对应类型：`doc`、`docx`、`sheet`、`file`、`slides`、`bitable`、`base`、`apps`、`wiki`。wiki token 使用 `wiki`；传 `base` 时，会按 `bitable` 类型处理。 |
| `comment_id` | 是 | 要恢复的评论 ID；来自 `lark_drive_list_comments` 的 `items[].comment_id` |

## 行为说明

- 这是写操作。
- **找目标评论必须带 `solved_status`**：`lark_drive_list_comments` 默认只返回未解决评论，本工具的目标恰好是已解决评论，直接用默认口径查会一条都找不到。先用 `lark_drive_list_comments(solved_status="true")`（只看已解决）或 `solved_status="all"`（全部）取 `items[].comment_id`。
- 对同一条评论连续翻转解决状态可能触发服务端限流（HTTP 429）；连续调用之间留间隔或短暂延迟后重试。

## 输出

```json
{
  "file_token": "docx_token",
  "file_type": "docx",
  "comment_id": "<comment_id>",
  "action": "restore",
  "is_solved": false,
  "updated": true
}
```

## 参考

- `lark_get_skill(domain="drive", section="resolve-comment")` -- 解决（标记已解决）评论

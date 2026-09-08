# lark_okr_comment_patch

修改指定评论的正文。评论目标、划词定位、引用关系一经创建不可修改。只支持用户身份（MCP server 默认即以用户身份执行）。

`content` 是业务必填项：OpenAPI schema 中该字段可能表现为可选，但实际修改评论必须提供非空正文。

## 用法

```
# 使用 simple 风格修改评论正文
lark_okr_comment_patch(comment_id="7000000000000000004", content='{"text":"更新后的评论"}')

# 使用 richtext 风格修改评论正文
lark_okr_comment_patch(comment_id="7000000000000000004", style="richtext", content='{"blocks":[{"block_element_type":"paragraph","paragraph":{"elements":[{"paragraph_element_type":"textRun","text_run":{"text":"更新后的评论"}}]}}]}')
```

## 参数

| 参数             | 必填 | 默认值      | 说明                                                                                       |
|----------------|----|----------|------------------------------------------------------------------------------------------|
| `comment_id`   | 是  | —        | 评论 ID，int64 正整数；可从 `lark_okr_comment_list` 或 `lark_okr_comment_detail` 获取。               |
| `content`      | 是  | —        | 新正文；按 `style` 指定格式：`simple`（半纯文本 JSON，推荐） \| `richtext`（完整 ContentBlock JSON）。          |
| `style`        | 否  | `simple` | 输入/输出风格：`simple` 或 `richtext`。                                                           |
| `user_id_type` | 否  | `open_id` | 用户 ID 类型：`open_id` \| `union_id` \| `user_id` \| `user_key`。                              |
| `format`       | 否  | `json`   | 输出格式。                                                                                    |

## 工作流程

1. 使用 `lark_okr_comment_list`、`lark_okr_comment_detail` 或 `lark_okr_comment_get` 确认 `comment_id` 和目标评论。
2. 准备 `content`：通常建议使用 `simple` 格式，需要精确控制 @用户的位置时，可以使用 `richtext` 格式，参考 `lark_get_skill(domain="okr", section="contentblock")`。
3. 执行 `lark_okr_comment_patch(comment_id="...", content="...")`。
4. 如果要解决或重新打开评论，不要使用本工具，改用 `lark_okr_comment_solve` 或 `lark_okr_comment_reopen`（参见 `lark_get_skill(domain="okr", section="comment-solve-reopen")`）。

## 输出

返回 JSON：

```json
{
  "comment": {
    "id": "7000000000000000004",
    "target": {"target_type": "progress", "target_id": "3456789012345678901"},
    "commentator_id": "ou_xxx",
    "status": "open",
    "create_time": "2025-01-15 10:30:00",
    "update_time": "2025-01-15 11:00:00",
    "content": {"text": "更新后的评论", "mention": [], "docs": [], "images": []}
  },
  "style": "simple"
}
```

`simple` 风格的 `content` 为 SemiPlainContent；`richtext` 风格的 `content` 为 ContentBlock。

## 注意事项

- patch 不会改变评论的 `target`、`selection`、`ref_comment_id` 或 `status`。
- `simple` 输入不支持 `docs`/`images`；需要富文本元素时使用 `richtext`。
- 空正文不允许提交；如需删除评论，请使用 `lark_okr_comment_delete`（参见 `lark_get_skill(domain="okr", section="comment-delete")`），删除不可恢复。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Comment 字段与评论串规则
- `lark_get_skill(domain="okr", section="contentblock")` -- 评论正文格式
- `lark_get_skill(domain="okr", section="comment-get")` -- 获取更新前后的评论
- `lark_get_skill(domain="okr", section="comment-delete")` -- 永久删除评论

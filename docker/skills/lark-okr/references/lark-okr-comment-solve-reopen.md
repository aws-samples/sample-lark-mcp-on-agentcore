# lark_okr_comment_solve / lark_okr_comment_reopen

解决/重新打开一条评论。实体级评论按单条评论处理；划词评论则是操作整个评论串。只支持用户身份（MCP server 默认即以用户身份执行）。

## 用法

```
# 解决实体级评论或整个划词评论串
lark_okr_comment_solve(comment_id="7000000000000000004")

# 重新打开已解决的实体级评论或划词评论串
lark_okr_comment_reopen(comment_id="7000000000000000004")

# 以 richtext 风格返回受影响评论的正文
lark_okr_comment_solve(comment_id="7000000000000000004", style="richtext")
```

## 参数

两个工具的参数相同：

| 参数             | 必填 | 默认值      | 说明                                                                              |
|----------------|----|----------|---------------------------------------------------------------------------------|
| `comment_id`   | 是  | —        | 评论 ID，int64 正整数。可从 `lark_okr_comment_list`、`lark_okr_comment_detail` 或 `lark_okr_comment_get` 获取。 |
| `user_id_type` | 否  | `open_id` | 用户 ID 类型：`open_id` \| `union_id` \| `user_id` \| `user_key`。                     |
| `style`        | 否  | `simple` | `affected_comments` 的正文风格：`simple`（SemiPlainContent）或 `richtext`（ContentBlock）。 |
| `format`       | 否  | `json`   | 输出格式。                                                                           |

## 工作流程

1. 使用 `lark_okr_comment_list`、`lark_okr_comment_detail` 或 `lark_okr_comment_get` 获取并确认 `comment_id`。
2. 检查评论是否属于划词串：如果返回有 `selection.id`，solve/reopen 会影响同一 `selection.id` 下的全部评论。
3. 根据用户动作选择 `lark_okr_comment_solve` 或 `lark_okr_comment_reopen`。
4. 执行后检查 `affected_comments`，确认实体级评论或整条评论串的状态变化范围。

## 输出

返回 JSON：

```json
{
  "affected_comments": [
    {
      "id": "7000000000000000004",
      "target": {
        "target_type": "objective",
        "target_id": "2345678901234567890"
      },
      "commentator_id": "ou_xxx",
      "status": "solved",
      "create_time": "2025-01-15 10:30:00",
      "update_time": "2025-01-15 11:30:00",
      "selection": {
        "id": "8000000000000000001",
        "selected_text": "提升核心接口稳定性"
      },
      "content": {
        "text": "请补充指标", "mention": [], "docs": [], "images": []
      }
    }
  ],
  "style": "simple"
}
```

- `lark_okr_comment_solve` 成功后 `affected_comments` 的 `status` 通常为 `solved`；`lark_okr_comment_reopen` 成功后通常为 `open`。
- `simple` 风格返回 SemiPlainContent；`richtext` 风格返回 ContentBlock。

## 注意事项

- 划词评论按评论串解决/重开，但 `lark_okr_comment_delete`（参见 `lark_get_skill(domain="okr", section="comment-delete")`）仍然只删除单条评论。
- 解决不是删除，之后可以用 `lark_okr_comment_reopen` 恢复；删除后不可恢复。
- 该操作是写操作，执行前应确认 `comment_id` 和目标动作。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Comment、评论串和状态规则
- `lark_get_skill(domain="okr", section="contentblock")` -- affected_comments 正文格式
- `lark_get_skill(domain="okr", section="comment-get")` -- 获取状态和 selection.id
- `lark_get_skill(domain="okr", section="comment-delete")` -- 永久删除单条评论

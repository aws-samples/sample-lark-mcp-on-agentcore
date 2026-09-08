# lark_okr_comment_delete

永久删除一条评论。删除划词评论时只删除指定评论，不会删除同一 `selection.id` 下的其他评论。

## 功能简介

删除一条特定评论。这是**高风险写操作**：删除的评论不可找回，真实执行必须在向用户确认后显式传 `_confirm=true`（MCP server 会拒绝第一次未带确认的调用并给出提示）。如果只是暂时结束讨论，改用 `lark_okr_comment_solve`。只支持用户身份（MCP server 默认即以用户身份执行）。

## 用法

```
# 确认删除目标后，执行不可恢复的删除操作
lark_okr_comment_delete(comment_id="7000000000000000004", _confirm=true)
```

## 参数

| 参数           | 必填     | 默认值    | 说明                                                                     |
|--------------|--------|--------|------------------------------------------------------------------------|
| `comment_id` | 是      | —      | 要删除的评论 ID，int64 正整数。建议先由 `lark_okr_comment_get` 核对。                    |
| `_confirm`   | 真实执行时是 | —      | 高风险确认；MCP server 会拒绝第一次未带确认的调用并给出提示。                                  |
| `format`     | 否      | `json` | 输出格式。                                                                  |

## 工作流程

1. 使用 `lark_okr_comment_list`、`lark_okr_comment_detail` 或 `lark_okr_comment_get` 定位并确认 `comment_id`。
2. 判断是否真的需要删除：解决评论使用 `lark_okr_comment_solve`（参见 `lark_get_skill(domain="okr", section="comment-solve-reopen")`），删除只用于永久移除内容。
3. 向用户明确说明删除不可恢复；得到确认后，带上 `_confirm=true` 执行。
4. 根据 `deleted=true` 和返回的 `comment_id` 确认结果。

## 输出

删除成功返回 JSON：

```json
{
  "deleted": true,
  "comment_id": "7000000000000000004"
}
```

## 注意事项

- 删除是单条评论级操作，即使评论属于划词评论串，也不会连带删除其他评论。
- 删除后不能使用 `lark_okr_comment_reopen` 恢复；暂时关闭讨论应使用 `lark_okr_comment_solve`。
- 该工具不需要 `style`，因为接口没有返回 Comment 正文。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Comment、评论串和状态规则
- `lark_get_skill(domain="okr", section="comment-get")` -- 删除前核对评论
- `lark_get_skill(domain="okr", section="comment-solve-reopen")` -- 暂时解决和恢复评论

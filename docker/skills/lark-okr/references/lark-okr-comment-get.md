# lark_okr_comment_get

根据评论 ID 获取单条 OKR 评论，查看评论正文、状态、评论对象、引用关系和划词信息。适合在编辑评论后确认其最终状态。

## 用法

```
# 获取一条评论的简化正文和元数据
lark_okr_comment_get(comment_id="7000000000000000001")

# 获取原始 ContentBlock 格式的评论正文
lark_okr_comment_get(comment_id="7000000000000000001", style="richtext")
```

## 参数

| 参数             | 必填 | 默认值      | 说明                                                                   |
|----------------|----|----------|----------------------------------------------------------------------|
| `comment_id`   | 是  | —        | 评论 ID，int64 正整数。                                                     |
| `user_id_type` | 否  | `open_id` | 用户 ID 类型：`open_id` \| `union_id` \| `user_id` \| `user_key`。          |
| `style`        | 否  | `simple` | `simple` 返回半纯文本格式，不涉及字体/颜色等信息时推荐使用；`richtext` 返回 ContentBlock。       |
| `format`       | 否  | `json`   | 输出格式。                                                                |

## 工作流程

1. 如果只有目标 ID，先用 `lark_okr_comment_list` 或 `lark_okr_comment_detail` 定位 `comment_id`。
2. 执行 `lark_okr_comment_get(comment_id="...")`。
3. 根据后续操作检查 `selection`、`status` 和 `ref_comment_id`：`selection.id` 表示划词评论，`status` 为 `solved` 表示已解决，`ref_comment_id` 表示引用关系。

## 输出

```json
{
  "comment": {
    "id": "7000000000000000001",
    "target": {"target_type": "progress", "target_id": "3456789012345678901"},
    "commentator_id": "ou_xxx",
    "status": "open",
    "create_time": "2025-01-15 10:30:00",
    "update_time": "2025-01-15 10:30:00",
    "content": {"text": "进展不错", "mention": [], "docs": [], "images": []},
    "ref_comment_id": "7000000000000000000"
  },
  "style": "simple"
}
```

`selection`、`solver_id`、`solved_time` 和 `ref_comment_id` 按接口是否返回保留。

## 注意事项

- Objective/KeyResult 的划词评论通过 `selection.id` 归属于评论串；实体级评论没有 `selection`。
- 解决或重新打开请使用 `lark_okr_comment_solve` / `lark_okr_comment_reopen`（参见 `lark_get_skill(domain="okr", section="comment-solve-reopen")`）。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Comment 字段与评论串规则
- `lark_get_skill(domain="okr", section="contentblock")` -- 评论正文格式
- `lark_get_skill(domain="okr", section="comment-list")` -- 查询目标下的评论

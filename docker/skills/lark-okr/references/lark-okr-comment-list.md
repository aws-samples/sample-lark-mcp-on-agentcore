# lark_okr_comment_list

分页获取单个 Cycle、Objective、KeyResult 或 Progress 下的评论。查询整个周期下所有评论时可使用 `lark_okr_comment_detail`（参见 `lark_get_skill(domain="okr", section="comment-detail")`）。

## 用法

```
# 获取 Objective 下的第一页评论
lark_okr_comment_list(target_type="objective", target_id="2345678901234567890")

# 使用上一页 token 获取 Progress 下的下一页评论
lark_okr_comment_list(target_type="progress", target_id="3456789012345678901", page_size=100, page_token="7000000000000000002")

# 以 richtext 输出 KeyResult 评论
lark_okr_comment_list(target_type="key_result", target_id="4567890123456789012", style="richtext")
```

## 参数

| 参数             | 必填 | 默认值      | 说明                                                                                |
|----------------|----|----------|-----------------------------------------------------------------------------------|
| `target_type`  | 是  | —        | `cycle` \| `objective` \| `key_result` \| `progress`。                             |
| `target_id`    | 是  | —        | 评论对象 ID，int64 正整数。                                                                |
| `page_size`    | 否  | `100`    | 每页数量，范围 1-100（数字）。                                                               |
| `page_token`   | 否  | `""`     | 上一次响应中的 token；首页不传。                                                              |
| `user_id_type` | 否  | `open_id` | 用户 ID 类型：`open_id` \| `union_id` \| `user_id` \| `user_key`。                      |
| `style`        | 否  | `simple` | `simple` 返回半纯文本格式，不涉及字体/颜色等信息时推荐使用；`richtext` 返回 ContentBlock。                   |
| `format`       | 否  | `json`   | 输出格式。                                                                             |

## 工作流程

1. 根据用户需求选择 `target_type`：周期用 `cycle`，目标用 `objective`，关键结果用 `key_result`，进展用 `progress`。
2. 如果缺少 ID，使用 `lark_okr_cycle_list`、`lark_okr_cycle_detail` 或 `lark_okr_progress_list` 获取。
3. 执行 `lark_okr_comment_list(target_type="...", target_id="...")`。
4. `has_more` 为 true 且 `page_token` 非空时，将 `page_token` 原样作为下一次调用的 `page_token`；不要自行解析或修改 token。

## 输出

```json
{
  "comments": [
    [
      {
        "id": "7000000000000000001",
        "target": {"target_type": "objective", "target_id": "2345678901234567890"},
        "commentator_id": "ou_xxx",
        "status": "open",
        "create_time": "2025-01-15 10:30:00",
        "update_time": "2025-01-15 10:30:00",
        "selection": {"id": "8000000000000000001", "selected_text": "提升核心接口稳定性"},
        "content": {"text": "请补充指标", "mention": [], "docs": [], "images": []}
      }
    ]
  ],
  "has_more": true,
  "page_token": "7000000000000000002",
  "style": "simple"
}
```

`comments` 是当前页按评论串分组的二维数组，不会自动拉取所有分页；`simple` 风格返回简单的半纯文本格式，`richtext` 风格返回原生 ContentBlock。

## 注意事项

- 实体级评论没有 `selection`；Objective/KeyResult 的划词评论带有 `selection.id`。
- 只对当前页内的评论进行评论串分组；如果同一评论串跨越分页边界，需结合相邻页自行合并，或使用 `lark_okr_comment_detail` 获取整个周期的聚合结果。
- 评论串按首条评论的 `create_time` 升序排列，串内评论也按 `create_time` 升序排列；时间相同则按评论 ID 升序。
- 该工具是只读操作，不会改变评论状态。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Comment、评论串和 target 类型
- `lark_get_skill(domain="okr", section="comment-detail")` -- 聚合获取周期评论
- `lark_get_skill(domain="okr", section="cycle-detail")` -- 获取 Objective 和 KeyResult ID
- `lark_get_skill(domain="okr", section="progress-list")` -- 获取 Progress ID

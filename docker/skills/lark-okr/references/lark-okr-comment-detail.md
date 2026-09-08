# lark_okr_comment_detail

获取指定 OKR 周期下 Cycle、Objective、KeyResult 和 Progress 的全部评论，并按评论对象和评论串整理后按时间升序排列。该工具是跨多个 OKR 接口的聚合查询。

## 用法

```
# 获取指定周期下所有 Cycle、Objective、KeyResult 和 Progress 的评论
lark_okr_comment_detail(cycle_id="1234567890123456789")

# 获取原始 ContentBlock 格式的评论正文
lark_okr_comment_detail(cycle_id="1234567890123456789", style="richtext")
```

## 参数

| 参数         | 必填 | 默认值      | 说明                                                                                         |
|------------|----|----------|--------------------------------------------------------------------------------------------|
| `cycle_id` | 是  | —        | OKR 周期 ID，int64 正整数，可从 `lark_okr_cycle_list` 获取。                                           |
| `style`    | 否  | `simple` | `simple` 返回半纯文本格式，不涉及字体/颜色等信息时推荐使用；`richtext` 返回原始 ContentBlock。                          |
| `format`   | 否  | `json`   | 输出格式。                                                                                      |

## 工作流程

1. 使用 `lark_okr_cycle_list` 获取周期 ID；如果用户已经提供周期 ID，直接使用。
2. 执行 `lark_okr_comment_detail(cycle_id="...")`。工具会依次获取周期下的 Objective、每个 Objective 下的 KeyResult、每个 Objective/KeyResult 下的 Progress，以及四类对象的评论。
3. 评论接口自动处理分页；对象读取和评论读取使用有界并发。任一底层请求失败时整体返回错误，不返回静默不完整结果。
4. 评论串按首条评论的 `create_time` 升序排列，串内评论也按 `create_time` 升序排列。

## 输出

返回 JSON 的核心结构如下：

```json
{
  "cycle_id": "1234567890123456789",
  "comments": {
    "2345678901234567890": [
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
    ]
  },
  "style": "simple"
}
```

- `comments` 第一层 key 是 `target_id`；value 是评论串数组；每个评论串是评论数组。
- `simple` 风格下 `content` 是 SemiPlainContent；`richtext` 风格下 `content` 是 ContentBlock。
- 评论时间戳会转换为可读日期时间；`selection`、状态和引用字段会保留。
- `comments` 会为周期遍历到的每个 target 保留一个 `target_id` key；即使该对象没有评论，对应 value 也会是空的评论串数组。

## 注意事项

- 这是聚合查询，接口调用次数取决于周期下的 Objective、KeyResult 和 Progress 数量。
- `lark_okr_comment_detail` 不接受 `department_id_type`，该接口参数由工具忽略。
- 该工具只读取评论，不会修改、解决或删除评论。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Cycle、Objective、KeyResult、Progress 和 Comment 的关系
- `lark_get_skill(domain="okr", section="contentblock")` -- ContentBlock 与 SemiPlainContent 格式
- `lark_get_skill(domain="okr", section="comment-list")` -- 分页获取单个对象下的评论
- `lark_get_skill(domain="okr", section="cycle-detail")` -- 获取周期下的 Objective 和 KeyResult
- `lark_get_skill(domain="okr", section="progress-list")` -- 获取 Objective 或 KeyResult 下的 Progress

# lark_okr_comment_create

创建一条 OKR 评论，或回复已有的评论。只支持用户身份（MCP server 默认即以用户身份执行）。

## 用法

```
# 在周期下创建实体级评论
lark_okr_comment_create(target_type="cycle", target_id="3456789012345678901", content='{"text":"进展不错"}')

# 在 Objective 正文中创建指定文本的划词评论
lark_okr_comment_create(target_type="objective", target_id="2345678901234567890", content='{"text":"请补充数据"}', selected_text="提升核心接口稳定性")

# 在 Objective 正文中创建选中全文的划词评论
lark_okr_comment_create(target_type="objective", target_id="2345678901234567890", content='{"text":"请补充数据"}', select_all=true)

# 在 KeyResult 的已有划词评论串中追加回复
lark_okr_comment_create(target_type="key_result", target_id="4567890123456789012", content='{"text":"已回复"}', ref_comment_id="7000000000000000004")

# 使用 richtext 风格提交完整 ContentBlock 正文
lark_okr_comment_create(target_type="progress", target_id="3456789012345678901", style="richtext", content='{"blocks":[{"block_element_type":"paragraph","paragraph":{"elements":[{"paragraph_element_type":"textRun","text_run":{"text":"进展不错"}}]}}]}')
```

## 常用表述

以下是一些用户需求中常见的表述:

- 全局评论/周期评论/OKR评论: 指 OKR 周期的实体级评论，当用户要求创建全局评论，或对某个周期的 OKR 进行评论（不特指某个 Objective 或 KeyResult 时），可以创建周期实体级评论。
- 划词评论: 指 Objective/KeyResult 下的划词评论。需要注意，Objective/KeyResult 下不能创建实体级评论（必须携带 `selected_text` 或 `select_all`）。若用户没有特别指定需评论的段落，使用 `select_all=true`。

## 参数

| 参数               | 必填 | 默认值      | 说明                                                                                        |
|------------------|----|----------|-------------------------------------------------------------------------------------------|
| `target_type`    | 是  | —        | `cycle` \| `progress` \| `objective` \| `key_result`。                                     |
| `target_id`      | 是  | —        | 评论对象 ID，int64 正整数。                                                                        |
| `content`        | 是  | —        | 评论正文；按 `style` 指定格式：`simple`（半纯文本 JSON，推荐） \| `richtext`（完整 ContentBlock JSON）。          |
| `selected_text`  | 否  | —        | Objective/KeyResult 新建划词时的完整纯文本。                                                          |
| `select_all`     | 否  | `false`  | Objective/KeyResult 划词时选择全文（布尔值）。                                                        |
| `ref_comment_id` | 否  | —        | 回复 Progress/Cycle 评论，或将 Objective/KeyResult 评论挂入已有划词串。                                    |
| `style`          | 否  | `simple` | 输入/输出风格：`simple` 或 `richtext`。                                                            |
| `user_id_type`   | 否  | `open_id` | 用户 ID 类型：`open_id` \| `union_id` \| `user_id` \| `user_key`。                               |
| `format`         | 否  | `json`   | 输出格式。                                                                                     |

## 评论场景参数组合

| 场景                           | target_type             | 必须传                                                    | 不能传                                            |
|------------------------------|-------------------------|--------------------------------------------------------|------------------------------------------------|
| 创建周期/进展实体级评论                 | `cycle` 或 `progress`    | `content`                                              | `selected_text`、`select_all`、`ref_comment_id`  |
| 回复周期/进展已有评论                  | `cycle` 或 `progress`    | `content`、`ref_comment_id`                             | `selected_text`、`select_all`                   |
| 创建 Objective/KR 划词评论         | `objective` 或 `key_result` | `content`，并在 `selected_text` / `select_all` 中二选一       | `ref_comment_id`                               |
| 追加到 Objective/KR 划词评论串       | `objective` 或 `key_result` | `content`、`ref_comment_id`                             | `selected_text`、`select_all`                   |

## 工作流程

1. 确定评论 target：使用 `lark_okr_cycle_detail` 获取 Objective/KeyResult ID，使用 `lark_okr_progress_list` 获取 Progress ID；已有评论串时使用 `lark_okr_comment_list` 或 `lark_okr_comment_get` 获取 `comment_id`。
2. 根据 `target_type` 选择评论形式：
   - `cycle`/`progress`：不传 `selected_text` 或 `select_all`；需要回复时传 `ref_comment_id`。
   - `objective`/`key_result`：在 `selected_text`、`select_all`、`ref_comment_id` 中选择且只能选择一个；`selected_text` 和 `select_all` 互斥，二者也都和 `ref_comment_id` 互斥。
3. 准备 `content`：`content` 是业务必填，通常建议使用 `simple` 格式，需要精确控制 @用户的位置时，可以使用 `richtext` 格式，参考 `lark_get_skill(domain="okr", section="contentblock")`。
4. 执行工具调用。
5. 在创建(而非回复) Objective/KeyResult 划词评论时，若用户未指定评论的具体位置，通常可以使用 `select_all=true` 而非自行指定 `selected_text`，除非用户需求中明确了具体的段落。
   - 若需使用 `selected_text` 精确选择划词选区时，只可传入正文中真实存在的连续纯文本片段；不要包含或跨越 mention 占位符，否则无法命中具体内容。
   - `selected_text` 会选择对应文本的首个命中。若 `selected_text` 未匹配到内容，会 fallback 至选择全文。

## 输出

创建成功返回 JSON：

```json
{
  "comment_id": "7000000000000000004",
  "selection_id": "8000000000000000002"
}
```

- `comment_id` 是新评论 ID。
- `selection_id` 只在创建划词评论时返回，用于识别评论串。
- 创建接口不直接返回完整 Comment；需要详情时使用 `lark_okr_comment_get`。

## 注意事项

- Objective/KeyResult 的 `ref_comment_id` 只用于定位已有划词串，不会在新评论的 `ref_comment_id` 字段建立引用关系。
- `ref_comment_id` 必须传评论实体自身的 `id`，不能传 `selection.id`。`selection.id` 只用于识别同一个划词评论串；如果要回复某个划词串，应先从 `lark_okr_comment_list` 或 `lark_okr_comment_detail` 中找到该串内任意一条 Comment 的 `id`，再将这个 `id` 传给 `ref_comment_id`。
- Progress/Cycle 是实体级评论；Progress 的 `ref_comment_id` 会建立普通评论之间的引用关系。
- 评论的 `content` 不支持 `docs`/`images` 字段，建议使用 `simple` 格式填写。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="entities")` -- Comment、评论串和 target 类型
- `lark_get_skill(domain="okr", section="contentblock")` -- simple/richtext 输入格式
- `lark_get_skill(domain="okr", section="comment-list")` -- 查询已有评论和 selection.id
- `lark_get_skill(domain="okr", section="comment-get")` -- 获取评论详情
- `lark_get_skill(domain="okr", section="comment-solve-reopen")` -- 管理评论状态

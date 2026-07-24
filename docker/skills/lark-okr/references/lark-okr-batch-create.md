# lark_okr_batch_create

批量创建 OKR 目标（Objective）和关键结果（Key Result）。

## 用法

```
# 批量创建 2 个 Objective，各带 2 个 KR。
lark_okr_batch_create(cycle_id="7000000000000000001", input='[{"text":"提升产品用户体验","mention":["ou_xxxxxxxx"],"notes":"重点关注核心路径体验","krs":[{"text":"页面加载速度提升 50%","mention":["ou_yyyyyyyy"]},{"text":"用户满意度达到 4.8 分"}]},{"text":"拓展新市场份额","krs":[{"text":"新增 10 个城市覆盖"},{"text":"市场份额提升至 25%"}]}]')

# 指定用户 ID 类型
lark_okr_batch_create(cycle_id="7000000000000000001", input='[{"text":"提升产品用户体验","krs":[{"text":"页面加载速度提升 50%"}]}]', user_id_type="user_id")
```
- mention 是可选参数，不需要使用"@"提及其他用户时不传入。
  - 传入的 mention 参数会以 @对应用户的形式，添加在文本后。
- Objective 的 notes / notes_mention 是可选参数，用于创建目标备注；KR 不支持备注。
- Objective 的 category_id 是可选参数；也可以通过 `category_id` 参数给所有未显式设置分类的 Objective 指定默认分类。

## 参数

| 参数               | 必填 | 默认值       | 说明                                                         |
|------------------|----|-----------|------------------------------------------------------------|
| `cycle_id`     | 是  | —         | OKR 周期 ID（int64 类型）                                        |
| `input`        | 是  | —         | JSON 数组格式的 Objective 列表。 |
| `category_id`  | 否  | —         | 默认 Objective 分类 ID。仅用于 input 中未设置 `category_id` 的 Objective。通常不需要传入，见下方“分类提示”。 |
| `user_id_type` | 否  | `open_id` | mention 中使用的用户 ID 类型：`open_id` \| `union_id` \| `user_id`  |

> **分类提示**：当用户明确要求设置 Objective 分类，或创建 Objective 返回 `invalid parameters` 且怀疑租户强制开启分类时，可以配置 `category_id` 参数进行创建。先用 `lark_invoke(tool_name="lark_okr_categories_list", args={params: {"owner_type":"user","page_size":100}})` 查看可用分类，然后选择一个语义合适且 `enabled=true` 的分类 ID 作为 `category_id`。分类创建后可以再调整；不必因为分类选择停下等待用户确认。

## 输入格式

```json
[
  {
    "text": "Objective 内容",
    "mention": ["ou_xxxxxxxx", "ou_yyyyyyyy"],
    "notes": "Objective 备注",
    "notes_mention": ["ou_xxxxxxxx"],
    "category_id": "7249339036661170180",
    "krs": [
      {
        "text": "KR 内容",
        "mention": ["ou_zzzzzzzz"]
      }
    ]
  }
]
```

字段说明：

- `text`：Objective 或 KR 内容，必填。
- `mention`：追加到内容后的用户 mention，可选。
- `notes`：Objective 备注文本，可选，仅 Objective 支持。
- `notes_mention`：追加到 Objective 备注后的用户 mention，可选，仅在 `notes` 存在时有意义。
- `category_id`：Objective 分类 ID，可选；会覆盖命令级 `category_id`。
- `krs`：当前 Objective 下要创建的 KR 列表，可选。

## 工作流程

1. 使用 `lark_okr_cycle_list` 获取可用的 OKR 周期 ID
2. 构造 `input` JSON 数组，包含要创建的 Objective 和 KR
3. 执行 `lark_okr_batch_create(cycle_id="<id>", input="...")`

## 输出

成功返回 JSON：

```json
{
  "ok": true,
  "data": {
    "created": [
      {
        "objective_id": "7000000000000000002",
        "krs": ["7000000000000000003", "7000000000000000004"]
      },
      {
        "objective_id": "7000000000000000005",
        "krs": ["7000000000000000006"]
      }
    ]
  }
}
```

## 参考

- `lark_get_skill(domain="okr", section="entities")` -- OKR 实体结构定义
- `lark_get_skill(domain="okr", section="create")` -- 单条创建 Objective 或 KR
- `lark_get_skill(domain="okr")` -- 所有 OKR 工具

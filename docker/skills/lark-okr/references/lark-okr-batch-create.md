# lark_okr_batch_create

批量创建 OKR 目标（Objective）和关键结果（Key Result）。

## 用法

```
# 批量创建 2 个 Objective，各带 2 个 KR。
lark_okr_batch_create(cycle_id="7000000000000000001", input='[{"text":"提升产品用户体验","mention":["ou_xxxxxxxx"],"krs":[{"text":"页面加载速度提升 50%","mention":["ou_yyyyyyyy"]},{"text":"用户满意度达到 4.8 分"}]},{"text":"拓展新市场份额","krs":[{"text":"新增 10 个城市覆盖"},{"text":"市场份额提升至 25%"}]}]')

# 指定用户 ID 类型
lark_okr_batch_create(cycle_id="7000000000000000001", input='[{"text":"提升产品用户体验","krs":[{"text":"页面加载速度提升 50%"}]}]', user_id_type="user_id")
```
- mention 是可选参数，不需要使用"@"提及其他用户时不传入。
  - 传入的 mention 参数会以 @对应用户的形式，添加在文本后。

## 参数

| 参数               | 必填 | 默认值       | 说明                                                         |
|------------------|----|-----------|------------------------------------------------------------|
| `cycle_id`     | 是  | —         | OKR 周期 ID（int64 类型）                                        |
| `input`        | 是  | —         | JSON 数组格式的 Objective 列表。 |
| `user_id_type` | 否  | `open_id` | mention 中使用的用户 ID 类型：`open_id` \| `union_id` \| `user_id`  |

## 输入格式

```json
[
  {
    "text": "Objective 内容",
    "mention": ["ou_xxxxxxxx", "ou_yyyyyyyy"],
    "krs": [
      {
        "text": "KR 内容",
        "mention": ["ou_zzzzzzzz"]
      }
    ]
  }
]
```

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
- `lark_get_skill(domain="okr")` -- 所有 OKR 工具

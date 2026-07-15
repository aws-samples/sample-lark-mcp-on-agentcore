# lark_okr_weight

调整 OKR 周期下目标（Objective）或目标下关键结果（Key Result）的权重。支持部分指定权重，未指定的按原权重比例自动分配。

## 用法

```
# 调整 Objective 权重（部分指定，剩余自动分配）
lark_okr_weight(cycle_id="7000000000000000001", level="objective", weights='[{"id":"7000000000000000002","weight":0.6},{"id":"7000000000000000003","weight":0.3}]')

# 调整 KR 权重（全部指定，和为 1）
lark_okr_weight(cycle_id="7000000000000000001", level="key-result", objective_id="7000000000000000002", weights='[{"id":"7000000000000000004","weight":0.6},{"id":"7000000000000000005","weight":0.4}]')
```

参数限制: 请求中的权重保留三位小数，分配的所有权重和不能大于 1 (小于等于 1 是允许的)。

### 权重归一化

- 在 OKR 中，一个周期下所有 Objective 和 一个 Objective 下所有 Key Result 的权重和固定为 1.
- 在使用 `lark_okr_weight` 分配 OKR 权重时，已分配的总权重不得超过 1。
- 若已分配的权重 < 1，剩余的权重会按照原始权重的比例均分到未指定的 Objective/Key Result 下。
  - 若所有 Objective/Key Result 均分配了权重但和 < 1，剩余的权重会计算在最后一个 Objective/Key Result 下。

## 参数

| 参数               | 必填 | 默认值    | 说明                                                                  |
|------------------|----|--------|---------------------------------------------------------------------|
| `level`        | 是  | —      | 调整层级：`objective`（调整周期下目标权重）\| `key-result`（调整目标下 KR 权重）             |
| `cycle_id`     | 是  | —      | OKR 周期 ID（int64 类型）                                                 |
| `objective_id` | 条件 | —      | 目标 ID。当 `level="key-result"` 时**必填**，用于定位父目标。                       |
| `weights`      | 是  | —      | JSON 数组格式的权重分配。权重保留三位小数，分配的所有权重和不能大于 1 |

## 工作流程

1. 使用 `lark_okr_cycle_list` 和 `lark_okr_cycle_detail` 获取周期 ID、目标 ID、KR ID 和当前权重。
2. 构造 `weights` JSON 数组，指定要调整的 ID 和权重，执行 `lark_okr_weight(...)`。
3. 返回调整后的完整权重列表。

## 输出

成功返回 JSON：

```json
{
  "ok": true,
  "data": {
    "level": "objective",
    "cycle_id": "7000000000000000001",
    "total": 3,
    "weights": [
      {"id": "7000000000000000002", "weight": 0.6},
      {"id": "7000000000000000003", "weight": 0.3},
      {"id": "7000000000000000004", "weight": 0.1}
    ]
  }
}
```

## 关于 1001001 错误

有时，即使输入的参数完全正确，`lark_okr_weight` 也会返回 1001001 错误。这是因为你的租户设置中，不一定开启了目标或关键结果的设置权重功能。
若你确认输入的参数无误（cycle_id/objective_id 正确，weights 中的 id 均是同一个周期下的目标或同一个目标下的关键结果，weights 中的权重和 <1）,
不必进一步尝试，你需要向用户确认 OKR 应用目前是否开启了目标或关键结果的设置权重功能。

## 参考

- `lark_get_skill(domain="okr", section="entities")` -- OKR 实体结构定义
- `lark_get_skill(domain="okr")` -- 所有 OKR 工具

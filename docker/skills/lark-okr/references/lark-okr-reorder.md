# lark_okr_reorder

调整 OKR 周期下目标（Objective）或目标下关键结果（Key Result）的顺序。

## 用法

```
# 调整 Objective 顺位
lark_okr_reorder(cycle_id="7000000000000000001", level="objective", ops='[{"id":"7000000000000000002","position":2},{"id":"7000000000000000003","position":1}]')

# 调整 KR 顺位（需指定 objective_id）
lark_okr_reorder(cycle_id="7000000000000000001", level="key-result", objective_id="7000000000000000002", ops='[{"id":"7000000000000000004","position":1},{"id":"7000000000000000005","position":2}]')
```

- 不允许将多个 objective/key-result 放在同一个位置下

## 参数

| 参数               | 必填 | 默认值    | 说明                                                      |
|------------------|----|--------|---------------------------------------------------------|
| `level`        | 是  | —      | 调整层级：`objective`（调整周期下目标顺序）\| `key-result`（调整目标下 KR 顺序） |
| `cycle_id`     | 是  | —      | OKR 周期 ID（int64 类型）。                                    |
| `objective_id` | 条件 | —      | 目标 ID。当 `level="key-result"` 时**必填**，用于定位父目标。           |
| `ops`          | 是  | —      | JSON 数组格式的顺位调整操作。          |

## 工作流程

1. 使用 `lark_okr_cycle_list` 和 `lark_okr_cycle_detail` 获取周期 ID、目标 ID 和 KR ID。
2. 构造 `ops` JSON 数组，指定要调整的 ID 和新 position，执行 `lark_okr_reorder(...)`。
3. 返回调整后的完整顺序。

## 输出

成功返回 JSON（以调整 Objective 位置为例）：

```json
{
  "ok": true,
  "data": {
    "level": "objective",
    "cycle_id": "7000000000000000001",
    "total": 3,
    "ordered": [
      "7000000000000000003",
      "7000000000000000002",
      "7000000000000000004"
    ]
  }
}
```

## 参考

- `lark_get_skill(domain="okr", section="entities")` -- OKR 实体结构定义
- `lark_get_skill(domain="okr")` -- 所有 OKR 工具

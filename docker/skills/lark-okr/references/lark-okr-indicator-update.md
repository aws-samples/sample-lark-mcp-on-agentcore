# lark_okr_indicator_update

直接更新目标（Objective）或关键结果（Key Result）的指标当前值，无需手动查询指标 ID。

> **查询指标：** 如需查看指标详情，请使用原生 API：
> - 目标指标：`lark_invoke(tool_name="lark_okr_objective_indicators_list", args={params: {"objective_id": "<id>"}})`
> - KR 指标：`lark_invoke(tool_name="lark_okr_key_result_indicators_list", args={params: {"key_result_id": "<id>"}})`

## 用法

```
# 更新 Objective 的指标值
lark_okr_indicator_update(level="objective", id="7000000000000000001", value="75.5")

# 更新 Key Result 的指标值
lark_okr_indicator_update(level="key-result", id="7000000000000000002", value="100")
```

## 参数

| 参数         | 必填 | 默认值    | 说明                                                                 |
|------------|----|--------|--------------------------------------------------------------------|
| `level`  | 是  | —      | 操作层级：`objective`（更新目标指标）\| `key-result`（更新 KR 指标） |
| `id`     | 是  | —      | 目标 ID 或 KR ID（int64 类型）                                       |
| `value`  | 是  | —      | 新的指标当前值（数字，范围：-99999999999 到 99999999999）              |

## 工作流程

1. 使用 `lark_okr_cycle_list` 和 `lark_okr_cycle_detail` 获取目标 ID 或 KR ID。
2. 如需查看当前指标值，使用 `lark_invoke(tool_name="lark_okr_objective_indicators_list", ...)` 或 `lark_invoke(tool_name="lark_okr_key_result_indicators_list", ...)` 查询。
3. 执行 `lark_okr_indicator_update(level="objective", id="...", value="...")`。
4. 工具自动查询指标 ID 并更新当前值。

## 输出

### JSON 格式

```json
{
  "ok": true,
  "data": {
    "indicator_id": "7000000000000000003",
    "current_value": 75.5,
    "level": "objective",
    "target_id": "7000000000000000001"
  }
}
```

### 字段说明

| 字段             | 类型     | 说明                     |
|----------------|--------|------------------------|
| `indicator_id` | string | 被更新的指标 ID            |
| `current_value`| number | 更新后的指标当前值           |
| `level`        | string | 操作层级：`objective` / `key-result` |
| `target_id`    | string | 目标或 KR 的 ID            |

## 注意事项
- 仅更新 `current_value` 字段，`unit`、`start_value`、`target_value` 等其他字段保持不变
  - 若需要这些字段进行修改，使用原生接口 `lark_invoke(tool_name="lark_okr_indicators_patch", ...)`
- 指标的 `current_value_calculate_type` 必须为「手动更新」才能通过此工具修改。

## 参考

- [OKR 指标更新 API](https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=patch&project=okr&resource=okr.indicator&version=v2)
- `lark_get_skill(domain="okr", section="progress-create")` — 创建进度记录
- `lark_get_skill(domain="okr", section="cycle-detail")` — 查询周期详情获取 ID

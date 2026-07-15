# lark_okr_progress_delete

根据 ID 删除一条 OKR 进展记录。此操作为高风险操作，删除后不可恢复。

## 用法

```
# 删除指定 ID 的进展记录
lark_okr_progress_delete(progress_id="1234567890123456789")
```

## 参数

| 参数              | 必填 | 默认值    | 说明                    |
|-----------------|----|--------|-----------------------|
| `progress_id` | 是  | —      | 进展记录 ID（int64 类型，正整数） |
| `format`      | 否  | `json` | 输出格式。                 |

## 工作流程

1. 使用 `lark_okr_progress_get` 确认要删除的进展记录 ID 和内容。
2. 执行 `lark_okr_progress_delete(progress_id="1234567890123456789")`。
3. 报告结果：已删除的进展记录 ID。

> **注意**：此操作不可恢复，建议在删除前先用 `lark_okr_progress_get` 确认记录内容。

## 输出

返回 JSON：

```json
{
  "deleted": true,
  "progress_id": "1234567890123456789"
}
```

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)

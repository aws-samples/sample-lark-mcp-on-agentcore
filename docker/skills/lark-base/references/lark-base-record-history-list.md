# base +record-history-list

查询单条记录的变更历史。它返回历史事件，不返回记录当前值，也不支持整表审计扫描。

## 使用前置

`lark_base_record_history_list()` 仅查询单条记录。调用前必须获得能唯一对应用户指定目标、且与 `table_id` 属于同一张表的 `record_id`。

如果当前信息无法唯一确定目标记录，先向用户确认，必要时用 `lark_base_record_list()` 辅助定位；不得自行选择记录，也不得扩展为批量或整表扫描。需要查询多条记录时，先确认范围，再逐条调用。

用 `lark_base_record_list()` 展示候选时，用数组形式的 `field_id` 做最小投影，一个元素一个字段名，例如 `field_id=["Project Owner", "Status"]`；字段名中的空格原样写在元素里，不需要额外引号。

用户明确指定某个视图的第 N 行时，先用同一 `view_id` 调用 `lark_base_record_list()`，并将 `offset` 设为 N-1、`limit` 设为 1，再从唯一结果中取得 `record_id`。视图或排序上下文不明确时仍需先确认。

## 推荐命令

```
lark_base_record_history_list(base_token="<base_token>", table_id="<table_id>", record_id="<record_id>")

lark_base_record_history_list(base_token="<base_token>", table_id="<table_id>", record_id="<record_id>", page_size="30", max_version="<next_max_version>")
```

## 返回解释

- 历史条目通常按版本号降序返回，最新在前。
- 每条历史包含版本号、操作人、操作时间、操作类型和字段变更。
- `create_time` 是秒级 Unix 时间戳。
- `field_changes` 描述字段变更，重点看字段名/字段类型、`before` 和 `after`。
- `activity_type` 常见值：`create`（创建记录）、`update`（编辑记录）、`delete`（删除记录）。

以下字段类型的变化可能不会出现在 `field_changes` 中：

- 计算字段：`formula`、`lookup`
- 系统字段：自动编号、创建时间、创建人、修改时间、修改人

## 翻页

- 首次请求不传 `max_version`。
- 如果返回 `has_more=true`，取返回中的 `next_max_version` 作为下一次请求的 `max_version`。
- `page_size` 默认 30，最大 50。

## 注意

- `table_id` 和 `record_id` 必须来自同一张表。
- 这是单条记录历史，不是表级审计；需要查多条记录时串行调用。

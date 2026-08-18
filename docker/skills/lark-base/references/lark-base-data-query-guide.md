# Base data-query guide

Read this guide after `lark_get_skill(domain="base", section="data-analysis-sop")` enters the Cloud path and selects `lark_base_data_query()`, or directly when the user explicitly asks about the `lark_base_data_query` tool or its DSL. It provides common aggregation fewshots; use `lark_get_skill(domain="base", section="data-query")` only for complete DSL fields, operators, limits, response details, or error recovery.

## When to use

Use `lark_base_data_query()` when the user asks for server-side:

- group by / aggregation
- sum, average, min, max, count, distinct count
- filtered aggregation
- sorted Top N or Bottom N
- global statistical conclusions

`lark_base_data_query()` can return dimension field rows, but those rows are grouped by dimension values and do not include `record_id`. Use `lark_base_record_list()`, `lark_base_record_search()`, or `lark_base_record_get()` for row-level output, record identity, or full raw record details.

## Common Fewshots

Count records by a category field:

```
lark_base_data_query(base_token="<base_token>", dsl='{"datasource":{"type":"table","table":{"tableId":"<table_id>"}},"dimensions":[{"field_name":"Status","alias":"status"}],"measures":[{"field_name":"Status","aggregation":"count","alias":"count"}],"shaper":{"format":"flat"}}')
```

Sum a number field by category and return Top 10:

```
lark_base_data_query(base_token="<base_token>", dsl='{"datasource":{"type":"table","table":{"tableId":"<table_id>"}},"dimensions":[{"field_name":"Region","alias":"region"}],"measures":[{"field_name":"Amount","aggregation":"sum","alias":"total_amount"}],"sort":[{"field_name":"total_amount","order":"desc"}],"pagination":{"limit":10},"shaper":{"format":"flat"}}')
```

Aggregate only records matching a filter:

```
lark_base_data_query(base_token="<base_token>", dsl='{"datasource":{"type":"table","table":{"tableId":"<table_id>"}},"dimensions":[{"field_name":"Owner","alias":"owner"}],"measures":[{"field_name":"Amount","aggregation":"sum","alias":"total_amount"}],"filters":{"type":1,"conjunction":"and","conditions":[{"field_name":"Status","operator":"is","value":["Done"]}]},"shaper":{"format":"flat"}}')
```

## Common filter values

Common `Condition.value` shapes: select `is` / `isNot` uses exactly one option
name; datetime `is` / `isGreater` / `isLess` uses `["Today"]` or
`["ExactDate","<epoch_ms>"]`; `isEmpty` / `isNotEmpty` uses `[]`.
Use relative date keywords only for relative requests; see
`lark_get_skill(domain="base", section="data-query")` for other field types and operators.

Use `tableName` when the table ID is unavailable but the table name is known:

```
lark_base_data_query(base_token="<base_token>", dsl='{"datasource":{"type":"table","table":{"tableName":"Orders"}},"measures":[{"field_name":"Amount","aggregation":"sum","alias":"total_amount"}],"shaper":{"format":"flat"}}')
```

## Routing to the DSL SSOT

Read `lark_get_skill(domain="base", section="data-query")` when you need:

- the full DSL field reference
- supported aggregations and field types
- filter operator details
- pagination and result limits
- response shape and error recovery

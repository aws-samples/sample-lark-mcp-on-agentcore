# Lark Sheet Filter

## 真对象硬约束 + 数量校验

1. **真对象**：当用户要求"筛选 / 只看 / 仅保留 X"时，**必须**通过 `lark_sheets_filter_create` / `lark_sheets_filter_update` / `lark_sheets_filter_delete` 创建真实的筛选器对象。**禁止**用"删除不符合条件的行" / "新建子表只放符合条件的行" / 用 `lark_sheets_cells_set` 覆盖原表来代替——这些做法会让原数据丢失或不可恢复。
2. **筛选数量必校**：执行筛选后**必须**回读，断言 `len(visible_rows) == expected_count`。`expected_count` 来自先用本地脚本在源数据上独立复现该筛选条件得到的结果数。两者不一致时禁止交付，需排查筛选条件 / 数据列类型问题。
3. **混合文本列禁止字面比较**：筛选 key 是公式文本（如 `1000+200=1200`）或带单位的混合文本时，先在辅助列里抽出纯数值再筛选；不能直接用文本比较。

## 使用场景

读写筛选器对象。本 reference 覆盖 4 个工具：

| 操作需求 | 使用工具 | 说明 |
|---------|---------|------|
| 查看已有筛选器 | `lark_sheets_filter_list` | 获取筛选器的范围、规则和条件配置 |
| 创建/更新/删除筛选器 | `lark_sheets_filter_create` / `lark_sheets_filter_update` / `lark_sheets_filter_delete` | 对筛选器执行写入操作 |

典型工作流：先读取现有筛选器了解配置 → 执行创建/更新/删除 → **必须再次读取验证结果**。

**只读场景例外**：用户只是想知道哪些数据满足条件、并不要求修改表格展示时，可以走 `lark_get_skill(domain="sheets", section="read-data")` 读后文本回答，不必创建筛选器。

**常见配置错误（必须注意）**：
- **筛选范围必须覆盖表头行**：筛选器的 range 必须从表头行开始（如 `A1:F100`），不能只包含数据行。缺少表头会导致筛选条件无法正确匹配列
- **更新已有筛选器前先读取**：如果子表上已存在筛选器，直接创建会报错或覆盖原有配置。应先用 `lark_sheets_filter_list` 查看是否存在筛选器，存在时使用 update 而非 create
- **筛选条件的列索引要精确**：筛选条件中的列标识必须与实际数据列精确对应，不要凭猜测填写
- **”调整筛选逻辑”要先读旧配置**：用户说”调整筛选”时，先读取现有筛选器的完整配置，理解当前规则后再修改，不要从零创建
- **创建后必须验证**：调用 `lark_sheets_filter_list` 确认筛选器配置正确且生效
- **筛选不支持正则表达式**：飞书表格筛选器不支持正则表达式，传入正则会当成普通文本处理。

## 工具

| 工具 | Risk | 分组 |
| --- | --- | --- |
| `lark_sheets_filter_list` | read | 对象 |
| `lark_sheets_filter_create` | write | 对象 |
| `lark_sheets_filter_update` | write | 对象 |
| `lark_sheets_filter_delete` | high-risk-write | 对象 |

## Flags

### `lark_sheets_filter_list`

_公共四件套_

_仅含公共 flag。_

### `lark_sheets_filter_create`

_公共四件套_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `range` | string | required | 筛选范围（A1 表示法，含表头行，如 `A1:F1000`）；不要重复写入 `properties` 中的 range 字段 |
| `properties` | 复合 JSON | optional | 筛选规则 JSON：`rules`（列级筛选规则数组）+ `filtered_columns?`（激活列索引提示）。`properties` 整体可选——传它时 `rules` 不可为空；不传则只在 `range` 上建立空筛选器（无列条件）。`range` 是独立参数（不要再放此 JSON 里） |

### `lark_sheets_filter_update`

_公共四件套_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `properties` | 复合 JSON | required | 筛选规则 JSON，含 `rules` 和 `filtered_columns?`；update 是整组覆盖式（传空 `rules: []` 清空）。`range` 已拎为独立参数 |
| `range` | string | required | 筛选作用的单元格范围（A1 表示法，如 `A1:F1000`）；优先级高于 `properties` 中同名字段 |

### `lark_sheets_filter_delete`

_公共四件套 · high-risk-write（需 _confirm=true）_

_仅含公共 flag。_

## Schemas

> 复合 JSON 参数字段速查（只列顶层 + 一层嵌套）。深层结构看下方 `## Examples`，或用 `lark_discover(query="sheets.filter_create")` 读完整 JSON Schema。

### `lark_sheets_filter_create` `properties` / `lark_sheets_filter_update` `properties`

_创建/更新的筛选器属性_

**顶层字段**：
- `range` (string) — 筛选对象作用的单元格范围（A1 表示法） — ⚠️ 已拎为独立参数 `range`，请勿在此 JSON 内重复填写（同名以独立参数为准）
- `rules` (array<object>) — 列级筛选规则列表，每一项对应一个具体列的筛选条件 each: { column_index: string, conditions: array<oneOf>, filtered_rows?: array<number> }
- `filtered_columns` (array<string>?) — 可选

## Examples

公共四件套：所有工具顶部排列 `url` / `spreadsheet_token` / `sheet_id` / `sheet_name`（XOR）。`filter_id` 等同于 `sheet_id`（每个工作表至多一个筛选器）。

### `lark_sheets_filter_list`

```
# 查看当前 sheet 的筛选器配置（filter_id 等于 sheet_id）
lark_sheets_filter_list(url="...", sheet_id="<SID>")
```

### `lark_sheets_filter_create`

`range` 是独立参数（含表头行）；`rules` 走 `properties`：

```
lark_sheets_filter_create(url="...", sheet_id="<SID>", range="A1:F1000", properties={"rules":[{"column_index":"B","conditions":[{"type":"multiValue","compare_type":"equal","values":["北京","上海"]}]}]})
```

**`conditions[].type` × `compare_type` 取值**（`type` 决定可用的 `compare_type`；两者均必填）：

| `type` | 可用 `compare_type` | `values` |
|---|---|---|
| `text` | `contains` / `doesNotContain` / `beginsWith` / `doesNotBeginWith` / `endsWith` / `doesNotEndWith` / `equals` / `notEquals` | 字符串数组 |
| `number` | `equal` / `notEqual` / `greaterThan` / `greaterThanOrEqual` / `lessThan` / `lessThanOrEqual` / `between` / `notBetween` | 数值（或数值字符串）数组；`between` / `notBetween` 传两个边界 |
| `multiValue` | `equal` / `notEqual` | 字符串数组（精确匹配其中任一值） |
| `color` | `backgroundColor` / `foregroundColor` | 不传 `values`（按单元格颜色筛选） |

> ⚠️ `text` 用 `equals` / `notEquals`（**带 s**），`number` / `multiValue` 用 `equal` / `notEqual`（**不带 s**）——别混。完整 schema 跑 `lark_discover(query="sheets.filter_create")`。

### `lark_sheets_filter_update`

> ⚠️ update 是覆盖式：`properties` 中传新 `rules` 会替换旧组。如只想加一条，要带上已有的全部条件再追加。必填 `range`。

### `lark_sheets_filter_delete`

```
lark_sheets_filter_delete(url="...", sheet_id="<SID>")
```

> ⚠️ high-risk-write：删除筛选器为高风险写操作，首次调用会被拒绝并返回确认指引，确认后带 `_confirm=true` 重新调用。

### Validate / Execute 约束

- `Validate`：XOR 公共四件套；`lark_sheets_filter_create` 校验 `range` 至少 2 行（表头 + 至少 1 行数据）；`lark_sheets_filter_update` 必须先 `lark_sheets_filter_list` 确认目标存在；`lark_sheets_filter_delete` 为高风险写操作，需 `_confirm=true` 确认。
- `Execute`：写后不自动回读；如需确认，自行调用 `lark_sheets_filter_list` 查看当前筛选条件 + 已过滤行数。

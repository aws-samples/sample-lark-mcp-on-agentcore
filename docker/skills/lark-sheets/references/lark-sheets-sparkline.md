# Lark Sheet Sparkline

## 真对象硬约束

当用户要求"迷你图 / 趋势线 / 单元格内图表"时，**必须**通过 `lark_sheets_sparkline_create` / `lark_sheets_sparkline_update` / `lark_sheets_sparkline_delete` 创建真实的迷你图对象。**禁止**用文本字符（如 `▁▂▃▅▇`）拼接在单元格里、或用 `SPARKLINE()` 公式函数（已禁用）代替。判断标准：交付后 `lark_sheets_sparkline_list` 必须能返回该对象。

## 使用场景

读写迷你图对象。本 reference 覆盖 4 个工具：

| 操作需求 | 使用工具 | 说明 |
|---------|---------|------|
| 查看已有迷你图 | `lark_sheets_sparkline_list` | 获取迷你图的类型、数据源和样式配置 |
| 创建/更新/删除迷你图 | `lark_sheets_sparkline_create` / `lark_sheets_sparkline_update` / `lark_sheets_sparkline_delete` | 对迷你图执行写入操作 |

典型工作流：先读取现有迷你图了解配置 → 执行创建/更新/删除 → **必须再次读取验证结果**。

**常见配置错误（必须注意）**：
- **数据源范围要精确**：迷你图的数据源范围必须与实际数据行列精确对应，范围偏移会导致图形展示错误
- **不要与 SPARKLINE() 公式混淆**：飞书表格的 `SPARKLINE()` 公式函数已被禁用，迷你图只能通过 `lark_sheets_sparkline_create` / `lark_sheets_sparkline_update` / `lark_sheets_sparkline_delete` 的对象方式创建
- **创建后必须验证**：调用 `lark_sheets_sparkline_list` 确认迷你图配置正确

## 工具

| 工具 | Risk | 分组 |
| --- | --- | --- |
| `lark_sheets_sparkline_list` | read | 对象 |
| `lark_sheets_sparkline_create` | write | 对象 |
| `lark_sheets_sparkline_update` | write | 对象 |
| `lark_sheets_sparkline_delete` | high-risk-write | 对象 |

## 参数

### `lark_sheets_sparkline_list`

_公共四件套_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `group_id` | string | optional | 按 group_id 过滤 |

### `lark_sheets_sparkline_create`

_公共四件套_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `properties` | object（复合 JSON） | required | JSON：`{config（共享样式配置）, sparklines（迷你图数组）}`；完整字段结构用 `lark_discover(query="sheets.sparkline_create")` 查看 |

### `lark_sheets_sparkline_update`

_公共四件套_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `group_id` | string | required | 目标组 id |
| `properties` | object（复合 JSON） | required | JSON：`{config, sparklines}`；先 `lark_sheets_sparkline_list(group_id="<id>")` 回读再 patch；完整字段结构用 `lark_discover(query="sheets.sparkline_update")` 查看 |

### `lark_sheets_sparkline_delete`

_公共四件套_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `group_id` | string | required | 目标组 id |

## Schemas

> 复合 JSON 参数字段速查（只列顶层 + 一层嵌套）。深层结构看下方 `## Examples`，或用 `lark_discover(query="sheets.sparkline_create")` 读完整 JSON Schema。

### `lark_sheets_sparkline_create` `properties` / `lark_sheets_sparkline_update` `properties`

_创建/更新/部分删除的迷你图属性_

**顶层字段**：
- `config` (object?) — 迷你图样式配置, 相同 groupId 的迷你图共享相同的样式 { theme_type?: enum, non_num_show_as?: enum, empty_show_as?: enum, contain_hidden_cells?: boolean, series_color?: string, …共 13 项 }
- `sparklines` (array<object>?) — 迷你图项列表 each: { sparkline_id?: string, position?: object, source?: string, source_range?: object }

## Examples

公共四件套：所有工具都支持 `url` / `spreadsheet_token` / `sheet_id` / `sheet_name`（XOR）。迷你图用 **两层 id** 管理——`group_id` 选组（一组同形态的迷你图共享类型 / 样式 / 数据源映射），`sparkline_id` 在组内选具体某一项。注意：不等同于已禁用的 `SPARKLINE()` 公式函数。

> **何时需要先 `lark_sheets_sparkline_list`：**
> - `lark_sheets_sparkline_update`：**总是**需要——拿到组内每一项的 `sparkline_id`，回填到 `properties.sparklines[i]`，server 用它做映射。
> - `lark_sheets_sparkline_delete`：**不需要** `sparkline_id`——仅支持按 `group_id` 整组删除（该工具没有 `properties`）。

### `lark_sheets_sparkline_list`

```
# 列出整张子表的所有迷你图组
lark_sheets_sparkline_list(url="...", sheet_id="<SID>")

# 钉到单组：返回该组每一项的 sparkline_id（update / partial-delete 必需）
lark_sheets_sparkline_list(url="...", sheet_id="<SID>", group_id="grpA")
```

### `lark_sheets_sparkline_create`

> `properties` 顶层只有 `config`（同组共享样式，如 `line_width` / `points` / `extremum_max` / `extremum_min`）和 `sparklines`（迷你图项数组）两个字段。`sparklines[i]` 每项必须含 `position`（落点 cell，`row` + `col`）+ `source`（数据 A1 范围，与 `source_range` 二选一）；create 时 `sparkline_id` 可省略，由系统生成。

在 F 列嵌入两行折线迷你图，数据分别来自 A2:E2 和 A3:E3（`source` 里含 `'Sheet1'!` 前缀的值直接作为字符串填入，MCP 调用无需 shell 转义）：

```
lark_sheets_sparkline_create(url="...", sheet_id="<SID>", properties={
  "config": {"line_width": 2},
  "sparklines": [
    {"position": {"row": 1, "col": "F"}, "source": "'Sheet1'!A2:E2"},
    {"position": {"row": 2, "col": "F"}, "source": "'Sheet1'!A3:E3"}
  ]
})
```

### `lark_sheets_sparkline_update`

> 两步式：先 `lark_sheets_sparkline_list(group_id="<id>")` 拿当前组的 `sparkline_id` 列表，再构造 `properties.sparklines[]`——**每项必须带 `sparkline_id`**。只改样式可只传 `properties.config`（不带 `sparklines`，整组样式覆盖式更新）。

```
# 假设 lark_sheets_sparkline_list 已返回 group_id=grpA，组内 sparkline_id=sl_1 / sl_2
lark_sheets_sparkline_update(url="...", sheet_id="<SID>", group_id="grpA", properties={
  "sparklines": [
    {"sparkline_id": "sl_1", "source": "'Sheet1'!A2:A20"},
    {"sparkline_id": "sl_2", "source": "'Sheet1'!B2:B20"}
  ]
})
```

### `lark_sheets_sparkline_delete`

> 仅支持**整组删除**：传 `group_id` 删掉该组全部迷你图。该工具**没有** `properties`，无法只删组内单项（需求上要"留一部分"时，改用 `lark_sheets_sparkline_update` 重写该组的 `sparklines` 列表，而不是 delete）。`lark_sheets_sparkline_delete` 是 high-risk-write：server 会拒绝第一次调用并返回确认提示，需带 `_confirm=true` 重新调用才会真正删除。

```
# 删整组
lark_sheets_sparkline_delete(url="...", sheet_id="<SID>", group_id="grpA", _confirm=true)
```

### Validate / Execute 约束

- `Validate`：
  - XOR 公共四件套；`lark_sheets_sparkline_update` / `lark_sheets_sparkline_delete` 必须传 `group_id`。
  - **`lark_sheets_sparkline_update`**：当 `properties.sparklines` 非空时，每一项必须含 `sparkline_id`（预检，错误信息会指回 `lark_sheets_sparkline_list`，避免命中服务端的不可读拒绝）；只传 `properties.config`（config-only update）合法、不触发 sparkline_id 检查。
  - **`lark_sheets_sparkline_delete`**：只接 `group_id`（整组删除），**没有** `properties`，无法删组内单项。
  - `properties`（仅 `lark_sheets_sparkline_create` / `lark_sheets_sparkline_update`）顶层只接 `config`（同组共享样式）和 `sparklines`（迷你图项数组）；`lark_sheets_sparkline_create` 要求每个 `sparklines[i]` 含 `position` 与 `source`（或 `source_range`，二选一）。
  - `lark_sheets_sparkline_delete`（high-risk-write）需 `_confirm=true`。
- `Execute`：写后不自动回读；如需确认，自行调用 `lark_sheets_sparkline_list(group_id="<id>")` 查看 `config` / `sparklines`。

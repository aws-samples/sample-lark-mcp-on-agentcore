# Lark Sheet Batch Update

## 写入边界 + 回读校验

`lark_sheets_batch_update` 把多次写入打包成单次请求，但每个子操作仍受编辑类任务硬性默认规则约束：

1. **目标 range 必须落在用户授权范围内**：除用户明示要修改的区域外，子操作禁止扩张到无关单元格 / 列 / Sheet。规划 range 时先确认每个子操作的边界。
2. **批次完成后必须回读校验**：整个 `lark_sheets_batch_update` 执行成功后，用 `lark_sheets_csv_get` 或 `lark_sheets_cells_get` 抽样回读受影响区域，至少校验 3-5 个代表性单元格（首 / 中 / 末），与本地脚本预先计算的预期值对照。
3. **预期条数前置断言**：涉及"批量填充 N 行"或"对 M 个区域分别写入"时，先把 N、M 硬编码进代码，回读后断言实际等于预期；不一致就再发一轮 `lark_sheets_batch_update` 补齐，禁止交付半成品。

若本次 `lark_sheets_batch_update` 的任一子操作写入了公式、复制了公式模板、或导入了含公式的数据块，**回读校验之后还必须继续执行 `lark_sheets_formula_verify`**。`lark_sheets_batch_update` 的原子提交只保证“写入动作都执行了”，不保证整批公式运行结果 zero-error。

## 使用场景

写入。批量执行多个写入工具操作。将多个工具调用合并为一次请求，按顺序依次执行。适合需要连续执行多个写入操作的场景（如先修改结构再写入数据）。注意：不支持嵌套 `lark_sheets_batch_update`。

**不可放进 `operations` 的写 shortcut**（`shortcut` 枚举不含它们，强行写入会被校验拒）：`lark_sheets_cells_set_image`（需本地上传图片）、`lark_sheets_dropdown_update` / `lark_sheets_dropdown_delete` / `lark_sheets_cells_batch_set_style` / `lark_sheets_cells_batch_clear`（自身已是批量入口，不可再嵌套）、`lark_sheets_dim_move`。这些操作需在 `lark_sheets_batch_update` 之外单独调用。

**⚠️ 何时必须使用 `lark_sheets_batch_update`（硬性要求）**：
- 需要对**多个**不同区域执行 `lark_sheets_cells_merge|unmerge` 时（如按分组合并多列相同内容）
- 需要先插入行列再写入数据时（`lark_sheets_dim_insert|delete|hide|unhide|freeze|group|ungroup` + `lark_sheets_cells_set`）
- 需要对多个区域执行不同写入操作时（多次 `lark_sheets_cells_set` + `lark_sheets_cells_clear` 等组合）

**行高列宽批量不走这里**：多行 / 多列不同尺寸直接用 `lark_sheets_rows_resize(heights=…)` / `lark_sheets_cols_resize(widths=…)` 的 map 形态（如 `widths={"A":100,"C:E":120}`，见 `lark_get_skill(domain="sheets", section="range-operations")`），一次调用原子完成；map 形态不可作为 `operations` 子操作嵌入（子操作里仍可用单区间形态 `range` + `height`/`width`）。

当同一工具需要对多个区域重复调用时，**必须**改用 `lark_sheets_batch_update` 合并为单次请求——`lark_sheets_batch_update` 是原子提交（要么全成功要么整批回滚）；逐个调用非原子，中途失败会留下半成品。

**公式相关批处理的默认闭环**：
- 写前：先读 `lark_get_skill(domain="sheets", section="formula-translation")`，把公式改写成飞书可执行语义。
- 写时：用 `lark_sheets_batch_update` 一次性完成插行/写公式/复制模板等原子动作。
- 写后：抽样回读之外，继续跑 `lark_get_skill(domain="sheets", section="formula-verify")`，直到 `lark_sheets_formula_verify` 返回 `status='success'`。

**`lark_sheets_dropdown_update` 的选项模式（`options` / `source_range` 二选一）+ 配色规则**（`colors` 长度可短不能长、必须配 `highlight=true` 才生效、不传按内置 10 色色板循环补色）见 `lark_get_skill(domain="sheets", section="write-cells")` 的「Dropdown 选项 + 配色」节，本 skill 不重复。`lark_sheets_dropdown_delete` 不涉及这些 flag。

## Shortcuts

| Shortcut | Risk | 分组 |
| --- | --- | --- |
| `lark_sheets_batch_update` | high-risk-write | 批量 |
| `lark_sheets_cells_batch_set_style` | write | 批量 |
| `lark_sheets_dropdown_update` | write | 对象 |
| `lark_sheets_dropdown_delete` | high-risk-write | 对象 |
| `lark_sheets_cells_batch_clear` | high-risk-write | 批量 |

## Flags

### `lark_sheets_batch_update`

_公共：URL/token（无 sheet 定位）· high-risk-write（需 _confirm=true）_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `operations` | 复合 JSON | required | JSON 数组：[{"shortcut":"`lark_sheets_xxx_yyy`","input":{...}}, ...]。shortcut 用工具内部名；input 是该 shortcut 的入参集——含子表定位 sheet_id（或 sheet_name），但不含 spreadsheet token/url（后者只在顶层 `url`/`spreadsheet_token` 给一次；`lark_sheets_batch_update` 顶层没有 `sheet_id`）；input 的键是该 shortcut 的参数展平成 JSON（如 "range":"A11:B12"），不是再套一层嵌套。完整结构用 `lark_discover(query="sheets.batch-update")` 查看。默认严格事务（首个失败即整批中断），传 `continue_on_error=true` 切换为软批量（遇失败仍继续）；不支持嵌套；按数组顺序串行执行 |
| `continue_on_error` | bool | optional | 遇子操作失败时继续执行剩余操作；默认 false（首个失败即整批中断） |

### `lark_sheets_cells_batch_set_style`

_公共：URL/token（无 sheet 定位）_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `ranges` | string + File + Stdin（简单 JSON） | required | 目标范围 JSON 数组（最多 100 个），每项必须带 sheet 前缀（如 `["Sheet1!A1:B2","Sheet2!D1:D10"]`，前缀裸写不加引号）；前缀必须与 sheet 真实显示名完全一致（含大小写），不接受 sheet reference_id；支持跨 sheet；所有 range 应用同一组 style |
| `background_color` | string | optional | 背景颜色（十六进制，如 `#ffffff`） |
| `font_color` | string | optional | 字体颜色（十六进制，如 `#000000`） |
| `font_family` | string | optional | 字体名称（如 `Arial`、`微软雅黑`） |
| `font_size` | float64 | optional | 字体大小（px，例：10、12、14） |
| `font_style` | string | optional | 字体样式（可选值：`normal` / `italic`） |
| `font_weight` | string | optional | 字重（可选值：`normal` / `bold`） |
| `font_line` | string | optional | 字体线条样式（可选值：`none` / `underline` / `line-through`） |
| `horizontal_alignment` | string | optional | 水平对齐（可选值：`left` / `center` / `right`） |
| `vertical_alignment` | string | optional | 垂直对齐（可选值：`top` / `middle` / `bottom`） |
| `word_wrap` | string | optional | 换行策略（可选值：`overflow` / `auto-wrap` / `word-clip`） |
| `number_format` | string | optional | 数字格式（例：文本 `@`、数字 `0.00`、货币 `$#,##0.00`、日期 `mm/dd/yyyy`） |
| `border_styles` | string + File + Stdin（复合 JSON） | optional | 边框配置 JSON（结构同 `lark_sheets_cells_set_style`） |

### `lark_sheets_dropdown_update`

_公共：URL/token（无 sheet 定位）_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `ranges` | string + File + Stdin（简单 JSON） | required | 目标范围 JSON 数组（最多 100 个，如 `["Sheet1!A2:A100","Sheet1!C2:C100"]`，前缀裸写不加引号），每项必须带 sheet 前缀；前缀必须与 sheet 真实显示名完全一致（含大小写），不接受 sheet reference_id |
| `options` | string + File + Stdin（复合 JSON） | xor | 下拉选项 JSON 数组，例如 `["opt1","opt2"]`。服务端不限制选项数量，也不限制单个选项长度；含逗号的选项可以接受（写入时会自动转义）。大量选项建议改用 `source_range`。 |
| `colors` | string + File + Stdin（简单 JSON） | optional | 下拉胶囊背景色，RGB hex 数组（如 `["#1FB6C1","#F006C2"]`）。长度可短不可长——超长 Validate 拦截（`colors length (N) must not exceed dropdown source size (M)`），未指定项按内置 10 色色板循环补色。**单独传即生效**；`highlight=false` 时被忽略。 |
| `multiple` | bool | optional | 启用多选 |
| `highlight` | bool | optional | 下拉胶囊背景色高亮开关。**不传 = 开**（按内置 10 色色板循环上色）；`highlight=false` 关闭得到纯白下拉。配色用 `colors` 覆盖。 |
| `source_range` | string | xor | listFromRange 模式的下拉源 range，A1 表示法 + sheet 前缀（如 `'Sheet1'!T1:T3`）。映射到 server `data_validation.range`，搭配 server `data_validation.type='listFromRange'` 自动生效。跟 `options` 二选一：传 `options` 走 inline 列表（type=list），传本 flag 走 range 引用（type=listFromRange）。`colors` 长度规则不变（≤ 源 range 单元格数），`highlight` / `multiple` 行为相同。当 `highlight` 开启且 source 覆盖单元格数超过 2000 时，服务端会将该下拉判为 option-error（这是不支持的组合）；CLI 会向 stderr 输出 warning。如需取消，传 `highlight=false`。 |

### `lark_sheets_dropdown_delete`

_公共：URL/token（无 sheet 定位）· high-risk-write（需 _confirm=true）_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `ranges` | string + File + Stdin（简单 JSON） | required | 目标范围 JSON 数组（最多 100 个，如 `["Sheet1!E2:E6"]`，前缀裸写不加引号），每项必须带 sheet 前缀；前缀必须与 sheet 真实显示名完全一致（含大小写），不接受 sheet reference_id |

### `lark_sheets_cells_batch_clear`

_公共：URL/token（无 sheet 定位）· high-risk-write（需 _confirm=true）_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `ranges` | string + File + Stdin（简单 JSON） | required | 目标范围 JSON 数组（最多 100 个），每项必须带 sheet 前缀（如 `["Sheet1!A2:Z1000","Sheet2!A2:Z1000"]`，前缀裸写不加引号）；前缀必须与 sheet 真实显示名完全一致（含大小写），不接受 sheet reference_id；支持跨 sheet；对所有 range 执行同一 scope 的清除 |
| `scope` | string | optional | 清除范围 enum：`content`（默认，仅清内容）/ `formats`（仅清格式）/ `all`（清内容 + 格式）（可选值：`content` / `formats` / `all`） |

## Schemas

> 复合 JSON flag 字段速查（只列顶层 + 一层嵌套）。深层结构看下方 `## Examples`，或用 `print_schema` 读完整 JSON Schema（用法见 SKILL.md「公共 flag 速查」与「Agent 使用提示」）。

### `lark_sheets_batch_update` `operations`

_要批量执行的 CLI shortcut 操作列表，按声明顺序串行执行；任一失败立即中断_

**数组项**（类型 object）：
- `shortcut` (enum) — CLI shortcut 名（不是底层 MCP tool 名） [`lark_sheets_cells_set` / `lark_sheets_cells_set_style` / `lark_sheets_cells_clear` / `lark_sheets_cells_merge` / `lark_sheets_cells_unmerge` / `lark_sheets_cells_replace` / `lark_sheets_csv_put` / `lark_sheets_dropdown_set` / `lark_sheets_dim_insert` / `lark_sheets_dim_delete` / `lark_sheets_dim_hide` / `lark_sheets_dim_unhide` / `lark_sheets_dim_freeze` / `lark_sheets_dim_group` / `lark_sheets_dim_ungroup` / `lark_sheets_rows_resize` / `lark_sheets_cols_resize` / `lark_sheets_range_move` / `lark_sheets_range_copy` / `lark_sheets_range_fill` / `lark_sheets_range_sort` / `lark_sheets_sheet_create` / `lark_sheets_sheet_delete` / `lark_sheets_sheet_rename` / `lark_sheets_sheet_move` / `lark_sheets_sheet_copy` / `lark_sheets_sheet_hide` / `lark_sheets_sheet_unhide` / `lark_sheets_sheet_set_tab_color` / `lark_sheets_chart_create` / `lark_sheets_chart_update` / `lark_sheets_chart_delete` / `lark_sheets_pivot_create` / `lark_sheets_pivot_update` / `lark_sheets_pivot_delete` / `lark_sheets_cond_format_create` / `lark_sheets_cond_format_update` / `lark_sheets_cond_format_delete` / `lark_sheets_filter_create` / `lark_sheets_filter_update` / `lark_sheets_filter_delete` / `lark_sheets_filter_view_create` / `lark_sheets_filter_view_update` / `lark_sheets_filter_view_delete` / `lark_sheets_sparkline_create` / `lark_sheets_sparkline_update` / `lark_sheets_sparkline_delete` / `lark_sheets_float_image_create` / `lark_sheets_float_image_update` / `lark_sheets_float_image_delete`]
- `input` (object) — 该 shortcut 的入参集——含子表定位 sheet_id（或 sheet_name），但不含 spreadsheet token/url（后者只在顶层 …

### `lark_sheets_cells_batch_set_style` `border_styles`

_单元格边框配置，含 top/bottom/left/right 四个方向，每个方向的结构相同（见 top）_

**顶层字段**：
- `top` (object?) { style?: enum, weight?: enum, color?: string }
- `bottom` (object?) { style?: enum, weight?: enum, color?: string }
- `left` (object?) { style?: enum, weight?: enum, color?: string }
- `right` (object?) { style?: enum, weight?: enum, color?: string }

### `lark_sheets_dropdown_update` `options`

_列表选项_

**数组项**（类型 string）：
- 标量：string

## Examples

公共四件套：`url` / `spreadsheet_token` / `sheet_id` / `sheet_name`（前两者 XOR；`lark_sheets_batch_update` 本身不强制 sheet-id，子操作各自携带）。

### `lark_sheets_batch_update`

示例：

```
lark_sheets_batch_update(url="https://example.feishu.cn/sheets/shtXXX", operations="@ops.json")

# ops.json （array<{shortcut, input}>，shortcut 用 CLI 名）:
# [
#   {"shortcut": "+dim-insert", "input": {"sheet_id":"...","position":10,"count":3}},
#   {"shortcut": "+cells-set",  "input": {"sheet_id":"...","range":"A11:B12","cells":[[{"value":"a"},{"value":"b"}],[{"value":"c"},{"value":"d"}]]}}
# ]
```

> ⚠️ **子操作定位规则**：
> - spreadsheet 定位（`url` / `spreadsheet_token`）**只在顶层给一次**；`lark_sheets_batch_update` 顶层**没有** `sheet_id` / `sheet_name`，在顶层传不生效。
> - **每个子操作的子表定位 `sheet_id`（或 `sheet_name`）写进它自己的 `input`**（见上方 ops.json 每个 item）。
> - `input` 的键是该 shortcut 的参数**展平**成 JSON（`"range":"A11:B12"`、`"position":11`），不要把整组 `operations` 再套一层嵌套 JSON。

> **常见组合：插列 + 写表头 + 整列回填**——一次原子提交，不要拆成 N 次独立调用。批量回填同一列 **只需一次** `lark_sheets_cells_set`（range 写整列范围、cells 写 N×1 矩阵），不需要逐行循环。
>
> ```jsonc
> // 在 C 列前插入新列 → 写表头 C1 → 回填 C2:C100 共 99 行
> [
>   {"shortcut": "+dim-insert",
>    "input": {"sheet_name": "Sheet1", "position": "C", "count": 1}},
>   {"shortcut": "+cells-set",
>    "input": {"sheet_name": "Sheet1", "range": "C1:C100",
>              "cells": [[{"value":"score"}], [{"value":95}], [{"value":87}], /* ... 97 more rows ... */ ]}}
> ]
> ```

### `lark_sheets_cells_batch_set_style`

多 range 应用同一组 style（服务端走 `lark_sheets_batch_update` 原子事务）：

```
# 表头行 + 汇总行同时刷成蓝底白字
lark_sheets_cells_batch_set_style(url="...", ranges=["sheet1!A1:F1","sheet1!A30:F30"], background_color="#1E5BC6", font_color="#FFFFFF", font_weight="bold")
```

### `lark_sheets_cells_batch_clear`

多 range 一次性清除（服务端走 `lark_sheets_batch_update` 原子事务）；`scope` 同 `lark_sheets_cells_clear`（`content` / `formats` / `all`，默认 `content`），`high-risk-write` 强制 `yes`：

```
# dry-run 先看清除范围
lark_sheets_cells_batch_clear(url="...", ranges=["sheet1!A2:Z1000","sheet2!A2:Z1000"], scope="all")
# 执行
lark_sheets_cells_batch_clear(url="...", ranges=["sheet1!A2:Z1000","sheet2!A2:Z1000"], scope="all")
```

### Validate / DryRun / Execute 约束

- `Validate`：`lark_sheets_batch_update` 的 `operations` 必须合法 JSON，且为非空数组；逐个子操作 `shortcut` / `input` 字段必填校验；**禁止嵌套 `lark_sheets_batch_update`**。`lark_sheets_cells_batch_set_style` 的 `ranges` 必须 JSON 数组、每项带 sheet 前缀；样式 flag 至少一个非空（或带 `border_styles`）。`lark_sheets_cells_batch_clear` 的 `ranges` 同样必须 JSON 数组、每项带 sheet 前缀，`high-risk-write` 强制 `yes` 或 `dry_run`（`scope` 默认 `content`）。
- `DryRun`：按顺序输出每个子操作的目标 API + 请求 body 模板；首个失败则整批 fail-fast（不实际执行任何后续）。
- `Execute`：按声明顺序串行执行；任一子操作失败立即中断并回滚到该子操作前状态（具体回滚能力取决于子操作类型，沿用 `lark_sheets_batch_update` 的语义）。

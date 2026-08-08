# Lark Sheet Batch Update

## 写入边界 + 回读校验

`lark_sheets_batch_update` 把多次写入打包成单次请求，但每个子操作仍受编辑类任务硬性默认规则约束：

1. **目标 range 必须落在用户授权范围内**：除用户明示要修改的区域外，子操作禁止扩张到无关单元格 / 列 / Sheet。规划 range 时先确认每个子操作的边界。
2. **批次完成后必须回读校验**：整个 `lark_sheets_batch_update` 执行成功后，用 `lark_sheets_csv_get` 或 `lark_sheets_cells_get` 抽样回读受影响区域，至少校验 3-5 个代表性单元格（首 / 中 / 末），与本地脚本预先计算的预期值对照。
3. **预期条数前置断言**：涉及"批量填充 N 行"或"对 M 个区域分别写入"时，先把 N、M 硬编码进代码，回读后断言实际等于预期；不一致就再发一轮 `lark_sheets_batch_update` 补齐，禁止交付半成品。

若本次 `lark_sheets_batch_update` 的任一子操作写入了公式、复制了公式模板、或导入了含公式的数据块，**回读校验之后还必须继续执行 `lark_sheets_formula_verify`**。`lark_sheets_batch_update` 只保证"写入动作按序执行了"，不保证整批公式运行结果 zero-error。

## 使用场景

写入。把**跨类型、有顺序依赖**的多个写入操作合并为一次请求按序执行（如插列 → 写表头 → 回填数据）。注意：不支持嵌套 `lark_sheets_batch_update`。

**先分流再动手（按操作组合选入口）**：美化收尾（样式 / 合并 / 行高列宽 / 冻结的任意组合）→ 一次 `lark_sheets_styles_put`（声明式规格，见 `lark_get_skill(domain="sheets", section="styles-put")`），不要拼 `operations` 子操作数组；**同一个写操作**打多个区域 → 用该工具自身的复数形态（`lark_sheets_cells_set(writes=…)` / `lark_sheets_cells_batch_clear` / `lark_sheets_dim_delete(ranges=…)` / resize 的 map 形态等）；只有跨类型、有顺序依赖的操作链才用本工具。

**不可放进 `operations` 的写 shortcut**（`shortcut` 枚举不含它们，强行写入会被校验拒）：`lark_sheets_cells_set_image`（需本地上传图片）、`lark_sheets_styles_put` / `lark_sheets_dropdown_update` / `lark_sheets_dropdown_delete` / `lark_sheets_cells_batch_clear`（自身已是批量入口，不可再嵌套）、`lark_sheets_dim_move`。这些操作需在 `lark_sheets_batch_update` 之外单独调用。

**⚠️ 何时必须使用 `lark_sheets_batch_update`（硬性要求）**：
- 需要对**多个**不同区域执行 `lark_sheets_cells_merge|unmerge` 时（如按分组合并多列相同内容）
- 需要先插入行列再写入数据时（`lark_sheets_dim_insert|delete|hide|unhide|freeze|group|ungroup` + `lark_sheets_cells_set`）
- 需要对多个区域执行不同写入操作时（多次 `lark_sheets_cells_set` + `lark_sheets_cells_clear` 等组合）

**行高列宽批量不走这里**：多行 / 多列不同尺寸用 `lark_sheets_styles_put` 的 `row_sizes` / `col_sizes`（可与样式同批），或 `lark_sheets_rows_resize(heights=…)` / `lark_sheets_cols_resize(widths=…)` 的 map 形态（如 `widths={"A":100,"C:E":120}`，见 `lark_get_skill(domain="sheets", section="range-operations")`）；map 形态不可作为 `operations` 子操作嵌入（子操作里仍可用单区间形态 `range` + `height`/`width`）。

**执行语义（fail-fast，不回滚）**：默认首个失败的子操作即中断剩余操作，但**已执行成功的子操作不回滚**——服务端报 "N succeeded, M failed" 时前 N 个已实际生效。修复失败项后**只重发失败起的剩余子集**，整批重发会把已成功的操作（如插行）重复应用。传 `continue_on_error=true` 则遇失败仍继续执行剩余操作。正因如此，含结构变更（插删行列 / 移动）的批次失败后要先回读确认现状再续发。

**公式相关批处理的默认闭环**：
- 写前：先读 `lark_get_skill(domain="sheets", section="formula-translation")`，把公式改写成飞书可执行语义。
- 写时：用 `lark_sheets_batch_update` 一次性完成插行/写公式/复制模板等成套动作。
- 写后：抽样回读之外，继续跑 `lark_get_skill(domain="sheets", section="formula-verify")`，直到 `lark_sheets_formula_verify` 返回 `status='success'`。

**`lark_sheets_dropdown_update` 的选项模式（`options` / `source_range` 二选一）+ 配色规则**（`colors` 长度可短不能长、必须配 `highlight=true` 才生效、不传按内置 10 色色板循环补色）见 `lark_get_skill(domain="sheets", section="write-cells")` 的「Dropdown 选项 + 配色」节，本 skill 不重复。`lark_sheets_dropdown_delete` 不涉及这些 flag。

## Shortcuts

| Shortcut | Risk | 分组 |
| --- | --- | --- |
| `lark_sheets_batch_update` | high-risk-write | 批量 |
| `lark_sheets_dropdown_update` | write | 对象 |
| `lark_sheets_dropdown_delete` | high-risk-write | 对象 |
| `lark_sheets_cells_batch_clear` | high-risk-write | 批量 |

## Flags

### `lark_sheets_batch_update`

_公共：URL/token（无 sheet 定位）· high-risk-write（需 _confirm=true）_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `operations` | 复合 JSON | required | JSON 数组：[{"shortcut":"`lark_sheets_xxx_yyy`","input":{...}}, ...]。shortcut 用工具内部名；input 是该 shortcut 的入参集——含子表定位 sheet_id（或 sheet_name），但不含 spreadsheet token/url（后者只在顶层 `url`/`spreadsheet_token` 给一次；`lark_sheets_batch_update` 顶层没有 `sheet_id`）；input 的键是该 shortcut 的参数展平成 JSON（如 "range":"A11:B12"），不是再套一层嵌套。完整结构用 `lark_discover(query="sheets.batch-update")` 查看。默认 fail-fast：首个失败即中断剩余操作，**已执行的子操作不回滚**（服务端报 "N succeeded, M failed" 时 N 个已生效，修复后只重发失败起的剩余子集，不要整批重发）；传 `continue_on_error=true` 遇失败仍继续；不支持嵌套；按数组顺序串行执行 |
| `continue_on_error` | bool | optional | 遇子操作失败时继续执行剩余操作；默认 false（首个失败即整批中断） |

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

> **常见组合：插列 + 写表头 + 整列回填**——一次批量提交，不要拆成 N 次独立调用。批量回填同一列 **只需一次** `lark_sheets_cells_set`（range 写整列范围、cells 写 N×1 矩阵），不需要逐行循环。
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

### `lark_sheets_cells_batch_clear`

多 range 一次性清除（服务端走一次批量提交）；`scope` 同 `lark_sheets_cells_clear`（`content` / `formats` / `all`，默认 `content`），`high-risk-write` 强制 `yes`：

```
# dry-run 先看清除范围
lark_sheets_cells_batch_clear(url="...", ranges=["sheet1!A2:Z1000","sheet2!A2:Z1000"], scope="all")
# 执行
lark_sheets_cells_batch_clear(url="...", ranges=["sheet1!A2:Z1000","sheet2!A2:Z1000"], scope="all")
```

### Validate / DryRun / Execute 约束

- `Validate`：`lark_sheets_batch_update` 的 `operations` 必须合法 JSON，且为非空数组；逐个子操作 `shortcut` / `input` 字段必填校验；**禁止嵌套 `lark_sheets_batch_update`**。`lark_sheets_cells_batch_clear` 的 `ranges` 同样必须 JSON 数组、每项带 sheet 前缀，`high-risk-write` 强制 `yes` 或 `dry_run`（`scope` 默认 `content`）。
- `DryRun`：按顺序输出每个子操作的目标 API + 请求 body 模板；首个失败则整批 fail-fast（不实际执行任何后续）。
- `Execute`：按声明顺序串行执行；任一子操作失败立即中断并回滚到该子操作前状态（具体回滚能力取决于子操作类型，沿用 `lark_sheets_batch_update` 的语义）。

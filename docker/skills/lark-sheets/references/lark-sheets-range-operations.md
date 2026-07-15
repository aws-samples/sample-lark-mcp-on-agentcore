# Lark Sheet Range Operations

## 结构性操作影响面预检（清除 / 合并 / 排序 / 移动前必做）

`lark_sheets_cells_clear`、`lark_sheets_cells_merge` / `lark_sheets_cells_unmerge`、`lark_sheets_range_move` / `lark_sheets_range_copy` / `lark_sheets_range_fill` / `lark_sheets_range_sort`（移动 / 复制 / 排序 / 自动填充）都会让既有引用关系发生偏移或失效。**操作前必须**先确认以下两点；否则禁止执行：

1. **打印当前合并单元格 + 公式引用 + 数据验证范围**：用 `lark_sheets_sheet_info(include="merges")` + `lark_sheets_cells_get` 抽样目标区域和它周边的公式 / 透视表 / 图表 / 条件格式 / 筛选器的数据源；评估操作后这些引用是否仍指向正确数据。
2. **`lark_sheets_cells_clear` 不得侵入用户授权范围之外**：清除范围只能是用户明示要清的区域；不要顺手清除"看起来没用"的相邻单元格。

排序场景的存储类型识别 + 辅助列抽数值的细则见下方「sort 操作前必读」章节。

## 使用场景

写入。对指定区域执行结构性操作。本 reference 覆盖 9 个工具，按 4 类用途组织：

| 操作需求 | 使用工具 | 说明 |
|---------|---------|------|
| 清除内容/格式 | `lark_sheets_cells_clear` | "清空"、"删除内容"、"去掉格式" |
| 合并/取消合并单元格 | `lark_sheets_cells_merge` / `lark_sheets_cells_unmerge` | "合并单元格"、"取消合并" |
| 调整行高/列宽 | `lark_sheets_rows_resize` / `lark_sheets_cols_resize` | "加宽列"、"调整行高"、"自适应列宽" |
| 移动/复制/填充/排序 | `lark_sheets_range_move` / `lark_sheets_range_copy` / `lark_sheets_range_fill` / `lark_sheets_range_sort` | "移动数据"、"复制到"、"自动填充"、"按某列排序" |

注意：

- **`range` 两种语法别混**：`lark_sheets_cells_clear` / `lark_sheets_cells_merge`|`unmerge` / `lark_sheets_range_*` 用单元格 A1 矩形（如 `A2:A10`）；`lark_sheets_rows_resize` / `lark_sheets_cols_resize` 用纯行 / 列区间（行 `2:10`、列 `A:C`），不要给 resize 传 `A2:A10`
- 用户说"这行 / 整行 / 首行"时，优先使用整行范围如 `1:1`；"这列 / 整列"时使用 `J:J`。不要截断为局部矩形
- 合并后只保留左上角单元格的内容，其余清除。写入合并区域用 `lark_sheets_cells_set` 对左上角单元格操作
- 调整行高列宽时，先读取相邻行列尺寸再决定像素值，不要随意猜测
- `copy_to_range`（`lark_sheets_cells_set` 的参数）复制的是值/公式/样式，不含行高列宽。需要统一尺寸时另行调用 `lark_sheets_rows_resize` / `lark_sheets_cols_resize`

## 写入后列宽自适应（防内容遮挡）

写入文本 / 数值后**必须**主动检查列宽是否适配，否则会出现"内容被截断 / 长数字显示为科学计数法 / 文本溢出被相邻列遮挡"等用户感知问题：

1. **写入后回读最长内容字符数**：用 `lark_sheets_csv_get` 读目标列的实际写入内容，统计最长单元格的字符数（`max(len(cell) for cell in col)`）。汉字按 2 字符宽度估算，半角字母数字按 1 字符。
2. **判定阈值**：当前列宽（用 `lark_sheets_sheet_info(include="row_heights,col_widths")` 拿）≥ 最长字符数 × 字体宽度系数 + buffer 才算适配。默认列宽 11 通常只够 11 个半角字符或 5-6 个汉字，写长文本前必扩宽。
3. **修复二选一**：
   - **扩列宽**：用 `lark_sheets_rows_resize` / `lark_sheets_cols_resize` 把目标列宽设为 `max(表头字符数, 内容采样最长字符数) × 8 + 16` 像素（经验值）
   - **自动换行**：在 `lark_sheets_cells_set` 时给单元格设置 `cell_styles.word_wrap="auto-wrap"`（可选值：`overflow` / `auto-wrap` / `word-clip`；`cell_styles` 字段见 `lark_get_skill(domain="sheets", section="write-cells")`），并用 `lark_sheets_rows_resize` / `lark_sheets_cols_resize` 调高对应行的行高
4. **新增列默认列宽规则**：新增列宽度 ≥ `max(表头字符数, 内容采样最长字符数) × 8 + 16` 像素，**禁止**用默认 11 直接交付。

**典型反例**：默认列宽 11 但内容含 12+ 字符的中文 / 含单位的数值（如 `109.10μmol/L`）/ 长数字未设 `number_format` 显示为科学计数法 —— 用户在结果表里看不到完整原值。

**打印场景控制总宽（用户说"适合打印 / A4 / 打印范围"时必做）**：扩单列宽防截断的同时，**所有列宽之和要落在纸张可打印宽度内**——A4 横向约 ≤ 102 个半角字符（约 1000px），纵向约 ≤ 70 个字符。超宽时不要无限加宽，改用 `cell_styles.word_wrap="auto-wrap"` + 调高行高，或缩窄非关键列，让整表在一页内（反例：总列宽远超 A4 可打印宽度，且长文本行高不够被截断）。

**只加宽承载新内容的列，不改动原有列的列宽**：列宽自适应**只针对新增 / 真正放不下新内容的列**；原表已有列的列宽**禁止重新计算、禁止缩小**——即便你估算的"理想宽度"与原值不同，只要原内容没被截断就不要动它。无差别地把所有列重设一遍宽度（哪怕只 ±1）都属于破坏原文件视觉格式（反例：填完数据后顺手把原有列的列宽从 16 改成 17，与原附件不一致，破坏了原视觉格式）。

**⚠️ 合并单元格安全操作规则**（`lark_sheets_cells_merge` / `lark_sheets_cells_unmerge` 必读）：

1. **先读后写**：操作前必须用 `lark_sheets_sheet_info(include="merges")` 或 `lark_sheets_cells_get` 识别已有合并区域（特征：多个连续单元格中只有左上角有值，其余为空）。
2. **不要对已合并区域重复 merge**：对已合并的区域再次调用 merge 会报错或产生不可预期结果。
3. **修改合并区域的正确顺序**：先 `unmerge` → 修改内容/样式 → 再 `merge`。
4. **对合并区域设置样式**：只对完整 range 设置一次 `cell_styles`（写在左上角单元格），其余位置用 `{}` 占位。
5. **新增合并时数据保护**：合并前确认目标区域只有左上角有数据，其余单元格为空，否则合并会导致非左上角的数据丢失。
6. **批量取消合并一次调用即可**：当一个范围（整列 `A:A`、整行 `3:3`、矩形 `A1:D100`）内存在多个合并区域，直接调一次 `lark_sheets_cells_unmerge` 传入这个大范围，会一次性取消该范围内所有合并区域；**不要**为每个合并区域单独调用 unmerge，也不要用 `lark_sheets_batch_update` 拆成多次 unmerge。

**⚠️ 批量操作必须用 `lark_sheets_batch_update`**：对**多个**不同区域执行 `lark_sheets_cells_merge` 时，禁止逐个调用，合并为单次原子 `lark_sheets_batch_update`（语义与 `operations` 入参格式见 `lark_get_skill(domain="sheets", section="batch-update")`）。行高列宽**不需要** `lark_sheets_batch_update`：多行 / 多列不同尺寸直接用 `lark_sheets_rows_resize(heights=…)` / `lark_sheets_cols_resize(widths=…)` 的 map 形态，一次调用原子完成。

**唯一例外**：`lark_sheets_cells_unmerge` 原生支持传一个大 range 一次性取消其中所有合并区域，应直接单次调用，**不要**拆进 `lark_sheets_batch_update`。

**⚠️ sort 操作前必读：确认目标列的数据类型**

排序按单元格的**存储类型**比较：纯数字按数值排序；文本字符串按**字典序**（`"1000"` 排在 `"999"` 之前，与数值相反）；日期按时间戳排序。

以下形态**看起来像数字但实际是字符串**，直接 sort 会得到错误结果：

| 示例 | 说明 |
|------|------|
| `843688.69+20042.35=863731.04` | 表达式文本（无前导 `=` 不是公式，整串按字典序比较） |
| `¥1,234.56` / `$1,234` | 带货币符号 |
| `1.2万` / `3.5亿` / `100kg` | 带中文 / 英文单位 |
| 前后含空格或不可见字符的数字串 | 被当文本 |
| 同列混文本和数字 | 排序后分块 |

**硬性流程**：

1. sort 前先用 `lark_sheets_csv_get` 抽样目标列的前 3–5 行确认原始值形态，不要只看列名和用户问题就直接排。
2. 若是纯数字或日期 → 直接 sort。
3. 若是带符号 / 表达式 / 单位的文本 → **不要直接排**：
   - 简单场景（货币、千分位、单位前缀）：新增辅助列，用公式提取数值（如 `=VALUE(SUBSTITUTE(SUBSTITUTE(A2,"¥",""),",",""))`），按辅助列排序，排完可按需清除辅助列。
- 复杂场景（多段表达式、中文单位、混合格式）：分批 `lark_sheets_csv_get` 读到本地，按数值排序后用 `lark_sheets_csv_put` / `lark_sheets_cells_set` 分批回写。

## Shortcuts

| 工具 | Risk | 分组 |
| --- | --- | --- |
| `lark_sheets_cells_clear` | high-risk-write | 单元格 |
| `lark_sheets_cells_merge` | write | 单元格 |
| `lark_sheets_cells_unmerge` | write | 单元格 |
| `lark_sheets_rows_resize` | write | 工作表 |
| `lark_sheets_cols_resize` | write | 工作表 |
| `lark_sheets_range_move` | write | 区域 |
| `lark_sheets_range_copy` | write | 区域 |
| `lark_sheets_range_fill` | write | 区域 |
| `lark_sheets_range_sort` | write | 区域 |

## Flags

### `lark_sheets_cells_clear`

_high-risk-write（首次调用会被服务端拒绝并给出确认提示，确认后带 `_confirm=true` 再次调用）_

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `range` | string | required | 清除范围（A1 格式） |
| `scope` | string | optional | 清除范围 enum：`content`（默认，仅清内容）/ `formats`（仅清格式）/ `all`（清内容 + 格式）（可选值：`content` / `formats` / `all`） |

### `lark_sheets_cells_merge`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `range` | string | required | 待合并 / 取消合并的范围（A1 格式） |
| `merge_type` | string | optional | 合并方向（仅 `lark_sheets_cells_merge`）（可选值：`all` / `rows` / `columns`）（默认 `all`） |

### `lark_sheets_cells_unmerge`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `range` | string | required | 待合并 / 取消合并的范围（A1 格式） |

### `lark_sheets_rows_resize`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `height` | int | xor | 统一行高（像素，例：30 / 40 / 60；不是磅/points），配 `range` 使用。传了 `height` 就是像素模式，可以省略 `type`；显式 `type="pixel"` 也行（等价）。多行不同高用 `heights` |
| `heights` | 复合 JSON | xor | 差异化行高 map，一次原子调用给多行设置不同高度：键为单行（`"1"`）或行闭区间（`"2:20"`），值为像素高（如 30 / 50）、`"auto"`（自适应内容）或 `"standard"`（重置默认）。⚠️ 单位是像素，不是磅/points。与 `range` / `height` / `type` 互斥 |
| `type` | string | xor | 尺寸方式 enum：`pixel`（需配 `height`）/ `standard`（重置为默认行高）/ `auto`（自动适应内容）。常规写法直接给 `height` 即可省略本参数；`type="standard"` / `type="auto"` 不能与 `height` 同时给（可选值：`pixel` / `standard` / `auto`） |
| `range` | string | xor | 要调整行高的行闭区间；1-based 行号如 `2:10` 或单行 `5`。统一尺寸形态必填（配 `height` 或 `type`）；map 形态（`heights`）不传 |

### `lark_sheets_cols_resize`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `width` | int | xor | 统一列宽（像素，例：80 / 120 / 200；不是 Excel 字符单位），配 `range` 使用。传了 `width` 就是像素模式，可以省略 `type`；显式 `type="pixel"` 也行（等价）。多列不同宽用 `widths` |
| `widths` | 复合 JSON | xor | 差异化列宽 map，一次原子调用给多列设置不同宽度：键为单列（`"A"`）或列闭区间（`"C:E"`），值为像素宽（如 80 / 120 / 200）或 `"standard"`（重置默认）。⚠️ 单位是像素，不是 Excel 字符单位（像素 ≈ 字符数×8+16）。与 `range` / `width` / `type` 互斥 |
| `type` | string | xor | 尺寸方式 enum：`pixel`（需配 `width`）/ `standard`（重置为默认列宽）。常规写法直接给 `width` 即可省略本参数；`type="standard"` 不能与 `width` 同时给（可选值：`pixel` / `standard`） |
| `range` | string | xor | 要调整列宽的列闭区间；列字母如 `A:E` 或单列 `C`。统一尺寸形态必填（配 `width` 或 `type`）；map 形态（`widths`）不传 |

### `lark_sheets_range_move`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `source_range` | string | required | 源 A1 范围 |
| `target_sheet_id` | string | optional | 目标子表 id；省略时同源 sheet |
| `target_range` | string | required | 目标 A1 范围（传起点 cell 即可，按源尺寸自动推断） |

### `lark_sheets_range_copy`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `source_range` | string | required | 源 A1 范围 |
| `target_sheet_id` | string | optional | 目标子表 id；省略时同源 sheet |
| `target_range` | string | required | 目标 A1 范围（传起点 cell 即可，按源尺寸自动推断） |
| `paste_type` | string | optional | 粘贴内容（仅 `lark_sheets_range_copy`）（可选值：`values` / `formulas` / `formats` / `all`）（默认 `all`） |

### `lark_sheets_range_fill`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `source_range` | string | required | 填充模板范围（系列起始 cells） |
| `target_range` | string | required | 目标填充范围（A1 格式） |
| `series_type` | string | optional | 填充序列类型（可选值：`auto` / `linear` / `growth` / `date` / `copy`）（默认 `auto`） |

### `lark_sheets_range_sort`

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `range` | string | required | 排序范围（A1 格式；含或不含表头由 `has_header` 决定） |
| `sort_keys` | 复合 JSON | required | JSON 数组：`[{"column":"<列字母>","ascending":<bool>}, ...]` |
| `has_header` | bool | optional | 第一行是表头不参与排序，默认 false |

## Schemas

> 复合 JSON flag 字段速查（只列顶层 + 一层嵌套）。深层结构看下方 `## Examples`，或用 `lark_discover(query="sheets.range_sort")` 读完整 JSON Schema。

### `lark_sheets_rows_resize` `heights`

_行 → 高度 map_
- type: object

### `lark_sheets_cols_resize` `widths`

_列 → 宽度 map_
- type: object

### `lark_sheets_range_sort` `sort_keys`

_排序条件列表（仅 sort 操作）_

**数组项**（类型 object）：
- `column` (string) — 排序依据的列字母（如 "C"、"D"），必须在 range 范围内
- `ascending` (boolean) — 是否升序排序

## Examples

> ⚠️ 本 reference 派生的工具跨 3 个分组：`lark_sheets_rows_resize` / `lark_sheets_cols_resize` → 工作表，`lark_sheets_cells_*` → 单元格，`lark_sheets_range_*` → 区域。这里统一从区域操作视角讲解。

公共四件套：所有工具顶部接受 `url` / `spreadsheet_token` / `sheet_id` / `sheet_name`（XOR）。range / source_range / target_range 等都是普通字符串参数，直接传 A1 字符串（如 `"A2:Z1000"`、`"1:1"`），无需任何 shell 转义或对 `'`、`!` 等字符做特殊处理。

### `lark_sheets_cells_clear`

> ⚠️ **`scope="all"` 清整表是不可逆的大范围破坏**：会一并抹掉该区域的合并单元格、原公式，以及图表 / 透视表引用的数据源列（这类列常在主数据区右侧，视觉上"看着没用"却被图例 / 系列引用）。**"美化 / 规范化一张已有表"永远不需要 clear 原表再重写**——若你打算"清空原表 → 写入重排后的版本"，说明走错了路径，应改为原地只刷样式（见 `lark_get_skill(domain="sheets", section="visual-standards")` 场景三）。

> **删不掉嵌入对象**：`lark_sheets_cells_clear`（任何 `scope`，含 `all`）只清单元格的值 / 格式，**删不掉**压在范围内的透视表 / 图表等嵌入对象——后端会报 `can not find embedded block`。删透视表用 `lark_sheets_pivot_delete`、删图表用 `lark_sheets_chart_delete`（先用 `lark_sheets_pivot_list` / `lark_sheets_chart_list` 拿对象 id）。

> 需要一次清除**多个不连续 range**（如把内容搬走后批量去掉散落各处的边框/底色）时，改用 `lark_sheets_cells_batch_clear`（语义见 `lark_get_skill(domain="sheets", section="batch-update")`），避免对 `lark_sheets_cells_clear` 逐个 range 调用。

```
# high-risk-write：首次调用会被拒绝并返回确认提示，确认后带 _confirm=true 再次调用
lark_sheets_cells_clear(url="...", sheet_id="<SID>", range="A2:Z1000", scope="all", _confirm=true)
```

### `lark_sheets_cells_merge` / `lark_sheets_cells_unmerge`

```
# 合并 A1:C1（可选 merge_type="all"/"rows"/"columns"）
lark_sheets_cells_merge(url="...", sheet_id="<SID>", range="A1:C1")
# 取消合并：传大 range 一次性取消其中所有合并区域
lark_sheets_cells_unmerge(url="...", sheet_id="<SID>", range="A1:C100")
```

### `lark_sheets_rows_resize` / `lark_sheets_cols_resize`

行高列宽分两条工具，避免行 / 列在底层 schema 的差异（行支持 `auto`，列不支持）混在一起。两种形态：

- **统一尺寸**：`range` + `height`/`width`（省略 `type`，等价于 `type="pixel"`）。非像素模式走 `type="standard"` / `type="auto"`，此时不能再带像素值。
- **差异化尺寸**：`heights`/`widths` 一个 JSON map，键为单行/列或闭区间、值为像素或模式字符串，**一次调用原子完成多行 / 多列不同尺寸**——不要拆多次调用，也不要用 `lark_sheets_batch_update`。

```
# 统一尺寸：把第 2-10 行设为固定 30 px
lark_sheets_rows_resize(url="...", sheet_id="<SID>", range="2:10", height=30)

# 统一尺寸：把 A-C 列设为固定 120 px
lark_sheets_cols_resize(url="...", sheet_id="<SID>", range="A:C", width=120)

# 差异化尺寸：多列不同宽，一次调用（值可混用 "standard" 重置某列）
lark_sheets_cols_resize(url="...", sheet_id="<SID>", widths={"A": 100, "B": 358, "C:E": 120, "G": "standard"})

# 差异化尺寸：多行不同高，值可混用 "auto" / "standard"
lark_sheets_rows_resize(url="...", sheet_id="<SID>", heights={"1": 50, "2:20": 30, "21": "auto"})

# 第 1 行行高自动适应内容（列宽不支持 auto）
lark_sheets_rows_resize(url="...", sheet_id="<SID>", range="1", type="auto")

# 重置 A-E 列为默认列宽
lark_sheets_cols_resize(url="...", sheet_id="<SID>", range="A:E", type="standard")
```

**⚠️ 单位是像素，不是 Excel 字符单位 / 磅**：列宽常见 60~400px；如果你按 Excel 字符单位（openpyxl / xlsxwriter 的 `width`）心算，先换算 `px ≈ 字符数 × 8 + 16`——写 `{"A": 10}` 得到的是 10px 的不可用窄列（会拒绝 < 20px 的列宽并提示换算）。行高是像素不是磅（points），默认行高约 24px。

**列宽没有 auto-fit**：需要"列宽自适应内容"时，按"写入后列宽自适应"一节的公式估算像素值（`max(表头字符数, 内容最长字符数) × 8 + 16`）后用 `widths` 显式设置。

> 同时出现在 `lark_get_skill(domain="sheets", section="sheet-structure")` —— 行高 / 列宽调整也算行列结构层动作。

### `lark_sheets_range_move` / `lark_sheets_range_copy`

> `lark_sheets_range_move` 会**清空源区域**（move = copy + clear_source）；`lark_sheets_range_copy` 不动源。

### `lark_sheets_range_fill`

```
# 用 A1:A2 的序列规律向下填充到 A3:A100（target 区域不能与 source 重叠，否则后端报 source overlaps destination）
lark_sheets_range_fill(url="...", sheet_id="<SID>", source_range="A1:A2", target_range="A3:A100", series_type="auto")
```

### `lark_sheets_range_sort`

```
# 按 C 列降序排 A1:E100（首行为表头不参与）
lark_sheets_range_sort(url="...", sheet_id="<SID>", range="A1:E100", has_header=true, sort_keys=[{"column":"C","ascending":false}])
```

### Validate / Execute 约束

- `Validate`：XOR 公共四件套；`lark_sheets_cells_clear` 为 high-risk-write，需 `_confirm=true` 确认；`lark_sheets_range_move` / `lark_sheets_range_copy` / `lark_sheets_range_fill` / `lark_sheets_range_sort` 校验源 / 目标 range 在同一 spreadsheet；`lark_sheets_range_sort` 的 `sort_keys` 必须合法 JSON 数组且 col 都在 `range` 内；`lark_sheets_rows_resize` / `lark_sheets_cols_resize` 两种形态二选一——统一形态必须给 `range` 且至少给 `height`/`width` 或 `type` 之一（`type="standard"`/`"auto"` 不能与像素参数同给，`type="pixel"` 共存 OK），map 形态（`heights`/`widths`）不能与 `range`/`height`/`width`/`type` 混用，map 键必须与命令维度一致（行数字 / 列字母）、不得重复，值为正整数像素或模式字符串；列宽 < 20px 拒绝（疑似 Excel 字符单位）；`lark_sheets_cols_resize` 不接受 `auto`（列宽不支持自适应）。map 形态在 `lark_sheets_batch_update` 子操作里不可用（它本身就是原子批量）。
- `Execute`：写后不自动回读；如需确认，自行调用 `lark_sheets_cells_get(range="<影响范围>")` 抽样比对。

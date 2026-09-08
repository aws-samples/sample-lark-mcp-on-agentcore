# Lark Sheet 旧命令迁移指南

## 适用场景

调用已删除的 `sheets` 旧工具（`lark_sheets_create`、`lark_sheets_read`、`lark_sheets_write`、
`lark_sheets_create_sheet`、`lark_sheets_media_upload` 等 42 个）时收到 `unknown subcommand`，或手上的
脚本 / 提示词早于表格命令重构。本文给出全部旧命令的替代工具，以及**不只是改名**的那些差异（参数名、
单元格 payload 写法、响应字段路径）。

这些旧命令在重构后曾以别名形式保留了一段时间，线上使用量降到 5% 以下后整体删除。它们不再存在，
也没有 deprecation 提示——直接报 `unknown subcommand`。

## 一、命令名对照表

### 工作簿

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_create` | `lark_sheets_workbook_create` |
| `lark_sheets_info` | `lark_sheets_workbook_info` |
| `lark_sheets_export` | `lark_sheets_workbook_export` |

### 子表

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_create_sheet` | `lark_sheets_sheet_create` |
| `lark_sheets_copy_sheet` | `lark_sheets_sheet_copy` |
| `lark_sheets_delete_sheet` | `lark_sheets_sheet_delete` |
| `lark_sheets_update_sheet` | 按意图拆开：`lark_sheets_sheet_rename` / `lark_sheets_sheet_move` / `lark_sheets_sheet_hide` / `lark_sheets_sheet_unhide` / `lark_sheets_dim_freeze` |

### 单元格数据

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_read` | `lark_sheets_cells_get`（只要纯值 / CSV 用 `lark_sheets_csv_get`，整表用 `lark_sheets_table_get`） |
| `lark_sheets_write` | `lark_sheets_cells_set` |
| `lark_sheets_append` | `lark_sheets_table_put(sheets={"sheets":[{…,"mode":"append"}]})`（追加到已有数据下方；顶层必须是 `{"sheets":[…]}` 信封，裸数组会被拒绝）；若已知目标行号，`lark_sheets_cells_set` 写该区域即可 |
| `lark_sheets_find` | `lark_sheets_cells_search` |
| `lark_sheets_replace` | `lark_sheets_cells_replace` |

### 样式 / 合并 / 单元格图片

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_set_style` | `lark_sheets_cells_set_style` |
| `lark_sheets_batch_set_style` | `lark_sheets_cells_batch_set_style` |
| `lark_sheets_merge_cells` | `lark_sheets_cells_merge` |
| `lark_sheets_unmerge_cells` | `lark_sheets_cells_unmerge` |
| `lark_sheets_write_image` | `lark_sheets_cells_set_image` |

### 行列

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_add_dimension` | `lark_sheets_dim_insert` |
| `lark_sheets_insert_dimension` | `lark_sheets_dim_insert` |
| `lark_sheets_move_dimension` | `lark_sheets_dim_move` |
| `lark_sheets_delete_dimension` | `lark_sheets_dim_delete` |
| `lark_sheets_update_dimension` | 按意图拆开：`lark_sheets_rows_resize` / `lark_sheets_cols_resize` / `lark_sheets_dim_hide` / `lark_sheets_dim_unhide` / `lark_sheets_dim_group` / `lark_sheets_dim_ungroup` / `lark_sheets_dim_freeze` |

### 筛选视图

条件（condition）不再是独立对象，已折叠进视图自身的参数。

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_create_filter_view` | `lark_sheets_filter_view_create` |
| `lark_sheets_update_filter_view` | `lark_sheets_filter_view_update` |
| `lark_sheets_list_filter_views` | `lark_sheets_filter_view_list` |
| `lark_sheets_get_filter_view` | `lark_sheets_filter_view_list` |
| `lark_sheets_delete_filter_view` | `lark_sheets_filter_view_delete` |
| `lark_sheets_create_filter_view_condition` | `lark_sheets_filter_view_update` |
| `lark_sheets_update_filter_view_condition` | `lark_sheets_filter_view_update` |
| `lark_sheets_delete_filter_view_condition` | `lark_sheets_filter_view_update` |
| `lark_sheets_list_filter_view_conditions` | `lark_sheets_filter_view_list` |
| `lark_sheets_get_filter_view_condition` | `lark_sheets_filter_view_list` |

### 下拉列表

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_set_dropdown` | `lark_sheets_dropdown_set` |
| `lark_sheets_update_dropdown` | `lark_sheets_dropdown_update` |
| `lark_sheets_get_dropdown` | `lark_sheets_dropdown_get` |
| `lark_sheets_delete_dropdown` | `lark_sheets_dropdown_delete` |

### 浮动图片

单独的上传步骤已折叠进创建工具：`lark_sheets_float_image_create` 直接收本地 `image` 路径。

| 旧命令 | 替代 |
| --- | --- |
| `lark_sheets_media_upload` | `lark_sheets_float_image_create`（嵌入单元格内的图片用 `lark_sheets_cells_set_image`） |
| `lark_sheets_create_float_image` | `lark_sheets_float_image_create` |
| `lark_sheets_update_float_image` | `lark_sheets_float_image_update` |
| `lark_sheets_delete_float_image` | `lark_sheets_float_image_delete` |
| `lark_sheets_get_float_image` | `lark_sheets_float_image_list` |
| `lark_sheets_list_float_images` | `lark_sheets_float_image_list` |

## 二、只改工具名会踩的坑

### 1. 单元格 payload 词汇变了

旧工具的 `values` 里，公式写成 `{"type":"formula","text":"=SUM(C2:C5)"}`。这类带 `type` / `text`
的写法会被 `lark_sheets_cells_set` **直接拒绝**：

```text
cells[0][0].type is not a cell field — the value type is inferred from the JSON value;
control display format via cell_styles.number_format
```

新写法把字段直接放在 cell 对象上（`{"formula":"=SUM(C2:C5)"}`）：

```
lark_sheets_cells_set(range="C6", cells=[[{"formula":"=SUM(C2:C5)"}]])
```

内容字段只能选一个：`value` / `formula` / `rich_text` / `multiple_values`；`cell_styles`、`border_styles`、
`note`、`data_validation` 可与内容字段自由叠加。纯标量（`"文本"`、`123`）也可直接放在格位上。
完整字段用 `lark_discover(query="sheets.cells-set")` 查看。

`lark_sheets_cells_set` 的参数里只有 `cells`（旧 `values` 不是本工具的参数），所以**真正的破坏点是
payload 里带 `type` / `text` 的旧对象写法**——把字段平铺到 cell 对象上即可。

### 2. 响应字段路径变了

| 工具 | 取值路径 |
| --- | --- |
| `lark_sheets_workbook_create` | spreadsheet token 在 `data.spreadsheet.spreadsheet_token` |
| `lark_sheets_workbook_info` | 子表列表在 `data.sheets[]`（旧 `lark_sheets_info` 是 `data.sheets.sheets[]`）；**不再回显** spreadsheet token |
| `lark_sheets_cells_get` | 值在 `data.ranges[].cells[][].value` |
| `lark_sheets_cells_search` | `data.total_matches`、`data.matches[].address` |
| `lark_sheets_sheet_create` / `lark_sheets_sheet_copy` | 新子表 id 在 `data.sheet_id` |
| `lark_sheets_sheet_rename` / `lark_sheets_sheet_hide` | **只返回 `data.revision`**，要确认结果需回读 `lark_sheets_workbook_info`（`sheet_name`、`is_hidden`） |
| `lark_sheets_dim_freeze` | `data.frozen_rows`、`data.frozen_columns` |

### 3. `lark_sheets_update_sheet` 的一次调用要拆成多次

旧工具在一次调用里同时设置标题、隐藏态和冻结行列；新工具按意图拆开，需要分别调用
`lark_sheets_sheet_rename`、`lark_sheets_sheet_hide` / `lark_sheets_sheet_unhide`、`lark_sheets_dim_freeze`。

注意 `lark_sheets_dim_freeze` 是**整份冻结状态覆盖**：`rows` 与 `cols` 一起表达完整状态，没写的那个轴会变成未冻结。

### 4. 底层接口换了

子表增删改查从 `sheets/v2/spreadsheets/{token}/sheets_batch_update` 换成了
`sheet_ai/v2/spreadsheets/{token}/tools/invoke_write`（`modify_workbook_structure`）。
只有直接断言过 HTTP 请求体的调用方需要关心这条。

## 三、找不到对应工具时

`lark_discover(category="sheets")` 列出全部当前工具；单个工具的参数与 schema 用
`lark_discover(query="sheets.<工具名>")`。按任务选工具的决策表见 `lark_get_skill(domain="sheets")`。

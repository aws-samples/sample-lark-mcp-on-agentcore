# Lark Sheet Search & Replace

## 替换前 dry-run + 范围明确（替换前必做）

`lark_sheets_cells_replace` 的副作用是不可逆的（除非另写代码回滚）。执行前必须：

1. **明确替换范围**：必须显式说明"只替换 X 列 / X 区域，还是全表替换"。**禁止**默认全表替换——容易误改无关列。范围应由用户指令决定，模糊时主动询问。
2. **dry-run 命中数量**：先用 `lark_sheets_cells_search` 在同一范围、同一关键词、同一匹配选项（大小写 / 精确 / 正则）下统计命中数量。把数量和**期望命中数**（用户明示的或基于业务理解推断的）对照——一致才进入 `lark_sheets_cells_replace`，不一致先排查（关键词太宽？范围太大？）。
3. **替换后回读校验**：执行后再次 `lark_sheets_cells_search` 旧关键词，预期为 0；并对替换后的若干代表性单元格回读确认值符合预期。

## 使用场景

读写。在飞书表格中搜索和替换文本。本 reference 覆盖 2 个 shortcut：

| 操作需求 | 使用工具 | 说明 |
|---------|---------|------|
| 搜索/定位文本 | `lark_sheets_cells_search` | 返回匹配的单元格位置，支持正则、精确匹配等 |
| 查找并替换文本 | `lark_sheets_cells_replace` | 批量替换文本；`regex` 模式下 `replacement` 可用 `$1`、`$2` 引用 `find` 的捕获组 |

**常见配置错误（必须注意）**：
- **不要把操作动词当搜索词**：用户说"汇总金额"是一个操作动作（求和），不是要搜索"汇总金额"这个文本。只有当确实需要定位某个文本值的位置时才用 `lark_sheets_cells_search`
- **不要用搜索来了解表格结构**：要了解表头和数据结构时，应使用 `lark_sheets_csv_get` 读取前几行，而不是用 `lark_sheets_cells_search` 逐个猜测字段名
- **注意正则特殊字符**：使用正则匹配时，`.`、`*`、`(`、`)` 等特殊字符需要转义

## Shortcuts

| Shortcut | Risk | 分组 |
| --- | --- | --- |
| `lark_sheets_cells_search` | read | 单元格 |
| `lark_sheets_cells_replace` | write | 单元格 |

## Flags

### `lark_sheets_cells_search`

_公共四件套_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `find` | string | required | 待查找文本（与 `regex` 配合时按正则解释） |
| `range` | string | optional | 查找范围（A1 格式）；省略时整表 |
| `match_case` | bool | optional | 大小写敏感 |
| `match_entire_cell` | bool | optional | 完全匹配整个单元格 |
| `regex` | bool | optional | 把 `find` 按正则解释 |
| `include_formulas` | bool | optional | 也在公式文本中搜索 |
| `max_matches` | int | optional | 防爆，默认 5000（隐藏 flag：不在 `help` 列出，但可正常传入） |
| `offset` | int | optional | 跳过前 N 个匹配（分页用），默认 0 |

### `lark_sheets_cells_replace`

_公共四件套_

| Flag | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `find` | string | required | 待替换文本 |
| `replacement` | string | required | 替换为；传空字符串 `""` 等价于「删除内容」 |
| `range` | string | optional | 替换范围（A1 格式）；省略时整表 |
| `match_case` | bool | optional | 大小写敏感 |
| `match_entire_cell` | bool | optional | 完全匹配整个单元格 |
| `regex` | bool | optional | 把 `find` 按正则解释 |
| `include_formulas` | bool | optional | 也在公式文本中替换 |

## Examples

公共四件套：所有 shortcut 顶部排列 `url` / `spreadsheet_token` / `sheet_id` / `sheet_name`（XOR 规则）。

### `lark_sheets_cells_search`

示例：

```
# 普通查找
lark_sheets_cells_search(url="https://example.feishu.cn/sheets/shtXXX", sheet_name="Sheet1", find="张三")

# 正则 + 范围限定
lark_sheets_cells_search(spreadsheet_token="shtXXX", sheet_id="$SID", find="^[A-Z]{2}-\\d{4}$", regex=true, range="A2:A1000")
```

输出契约（envelope.data）：

- `matches` — 命中 cell 列表，每条含 `address`（A1）+ `value` + `sheet_id`
- `total_matches` — 匹配总数
- `has_more` / `next_offset` — 分页游标（命中数超过单页上限时用于继续读取）

### `lark_sheets_cells_replace`

示例：

```
# 先 dry-run 预览
lark_sheets_cells_replace(url="https://example.feishu.cn/sheets/shtXXX", sheet_name="Sheet1", find="v1", replacement="v2")

# 确认后执行
lark_sheets_cells_replace(url="https://example.feishu.cn/sheets/shtXXX", sheet_name="Sheet1", find="v1", replacement="v2")

# 正则捕获组：把 "2026-03" 重排成 "03/2026"（$1/$2 引用 find 的捕获组）
lark_sheets_cells_replace(url="https://example.feishu.cn/sheets/shtXXX", sheet_name="Sheet1", regex=true, find="(\\d{4})-(\\d{2})", replacement="$2/$1")
```

> `lark_sheets_cells_replace` 虽然 Risk = write，但范围大或正则错可能改一堆。**强烈推荐工作流**：先 `lark_sheets_cells_search` 看匹配数，再 `lark_sheets_cells_replace` 预览，最后真正执行。

### Validate / DryRun / Execute 约束

- `Validate`：XOR 公共四件套；`find` 非空；正则模式下 `find` 必须是合法正则。
- `DryRun`：`lark_sheets_cells_search` 输出请求模板；`lark_sheets_cells_replace` 额外返回预估替换数（`would_replace_count`）。
- `Execute`：写后不自动回读；如需确认，自行用 `lark_sheets_cells_search` 复查旧值是否已不再命中。

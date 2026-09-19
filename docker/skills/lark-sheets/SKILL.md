---
name: lark-sheets
description: "飞书电子表格：创建和操作电子表格。支持工作表与行列结构（增删/合并/尺寸/隐藏/冻结/分组）、单元格读写（值/公式/样式/批注/单元格图片）、区域复制移动排序填充、查找替换、批量更新，图表、透视表、条件格式、筛选器与筛选视图、下拉列表、迷你图、浮动图片等对象的创建与维护，以及公式校验、历史版本回滚、本地 Excel/CSV 与飞书表格的导入导出。当用户需要创建或编辑表格、统计汇总与可视化、表格美化、公式计算（含 Excel 公式迁移）、金融/财务建模（DCF、三张表、预算、Sensitivity 等）时使用。多维表格（Base/bitable）请改用 lark-base；若用户是想按名称或关键词搜索云空间（云盘/云存储）里的表格文件，请改用 lark-drive 的 lark_drive_search 先定位资源。当用户给出 doubao.com 的 /sheets/ URL/token 时，也应直接使用本 skill，不要因为域名不是飞书而回退到 WebFetch；路由依据是 URL 路径模式和 token，而不是域名。"
---

# sheets

（认证由 MCP server 自动处理。）

## 场景 → 工具速查

> 按当前动作选行；下一步必须先调用该行的 `lark_get_skill(...)` 取到 reference，取到之前不得执行工具。只取命中的那一份；含公式 / 样式等横切动作时再取对应规范，禁止用目录枚举代替真正取文。

| 你要做的事 | ✅ 正确写法 | 动手前读（先取 reference 再动手） |
| --- | --- | --- |
| 读数据 | `lark_sheets_csv_get`（纯值/CSV）、`lark_sheets_cells_get`（公式/样式/批注） | `lark_get_skill(domain="sheets", section="read-data")` |
| 写入数据 | `lark_sheets_csv_put`（无类型歧义纯文本）、`lark_sheets_table_put`（typed；量值/真日期；标签/编号/前导零/文本数字用 object，禁裸 csv_put）、`lark_sheets_cells_set`（公式/富写入）、`lark_sheets_cells_set_style`（样式）、`lark_sheets_cells_set_image`（单元格图片） | `lark_get_skill(domain="sheets", section="write-cells")` |
| 格式继承（新列/新行） | 物理插行 / 插列用 `lark_sheets_dim_insert(inherit_style="before"\|"after")`；往已有空白区域扩写用 `lark_sheets_range_copy(paste_type="formats")` 先铺样式再写值 | `lark_get_skill(domain="sheets", section="range-operations")`；插行插列再读 `lark_get_skill(domain="sheets", section="sheet-structure")` |
| 工作簿操作 | `lark_sheets_workbook_create`、`lark_sheets_workbook_info`、`lark_sheets_workbook_import`、`lark_sheets_sheet_copy`、`lark_sheets_revision_get`、`lark_sheets_workbook_export` | `lark_get_skill(domain="sheets", section="workbook")` |
| 行列操作 | 排序用 `lark_sheets_range_sort` 原子移动整行；合并 / 取消合并用 `lark_sheets_cells_merge` / `lark_sheets_cells_unmerge`；清空内容才用 `lark_sheets_cells_clear`；尺寸用 `lark_sheets_cols_resize` / `lark_sheets_rows_resize` | `lark_get_skill(domain="sheets", section="range-operations")`；涉结构布局再读 `lark_get_skill(domain="sheets", section="sheet-structure")` |
| 美化收尾 | `lark_sheets_styles_put` | `lark_get_skill(domain="sheets", section="styles-put")` |
| 子表结构 | `lark_sheets_sheet_info`、`lark_sheets_dim_insert`；删整行 / 列用 `lark_sheets_dim_delete`，不能用 clear 代替 | `lark_get_skill(domain="sheets", section="sheet-structure")` |
| 画图表 / 可视化 / 柱状图 / 折线图 / 饼图 / 趋势 / 占比 | 单图用 `lark_sheets_chart_create_basic`，多图用扁平输入的 `lark_sheets_batch_chart_create`；改已有图的数据源用 `lark_sheets_chart_data_update`、配置用 `lark_sheets_chart_config_update`；只有语义工具表达不了的单系列 / 单数据点 / 高级字段才用 `lark_sheets_chart_create` / `lark_sheets_chart_update`，且只提交必要的局部 `properties`。动手前先断言每张图的类型、横轴字段、分组字段和目标张数，画完 `lark_sheets_chart_list` 逐项核；图片迁移成真图表后删除并复查原浮动图片 | `lark_get_skill(domain="sheets", section="chart")`；含透视 / 分组汇总再读 `lark_get_skill(domain="sheets", section="pivot-table")` |
| 分组汇总 / 透视 | `lark_sheets_pivot_create` | `lark_get_skill(domain="sheets", section="pivot-table")` |
| 筛选 / 只看符合条件的行 | `lark_sheets_filter_create` | `lark_get_skill(domain="sheets", section="filter")` |
| 查找 / 替换文本 | `lark_sheets_cells_search`、`lark_sheets_cells_replace` | `lark_get_skill(domain="sheets", section="search-replace")` |
| 条件格式 / 条件高亮 / 数据条 / 色阶 | 随数据变化的标色用 `lark_sheets_cond_format_create`；固定刷色只用于用户点名要静态着色 | `lark_get_skill(domain="sheets", section="conditional-format")` |
| 插图：自由摆放的装饰 | `lark_sheets_float_image_create` | `lark_get_skill(domain="sheets", section="float-image")` |
| 迷你图 / 单元格内趋势线 | `lark_sheets_sparkline_create` | `lark_get_skill(domain="sheets", section="sparkline")` |
| 批量清除多区域 | `lark_sheets_cells_batch_clear` | `lark_get_skill(domain="sheets", section="batch-update")`（high-risk） |
| 复核编辑变更 / 取版本间差异 | `lark_sheets_changeset_get` | `lark_get_skill(domain="sheets", section="changeset")` |
| 保存多份筛选状态 / 命名筛选视图 | `lark_sheets_filter_view_create`；视图与 `lark_sheets_filter_create` 相互独立、可在同一子表共存 | `lark_get_skill(domain="sheets", section="filter-view")` |
| 查编辑历史 / 回滚到历史版本 | `lark_sheets_history_list` 取版本，`lark_sheets_history_revert`（high-risk，异步）回滚后用 `lark_sheets_history_revert_status` 轮询 | `lark_get_skill(domain="sheets", section="history")` |

> ⚠️ 金额 / 百分比 / 比率 / 计数及参与运算的真日期写数字（百分比传 `0.4` + `number_format`）；日期标签、编号、前导零、身份证 / 单据号写文本。`range` 只写 `A1:B2`，子表另传 `sheet_id` / `sheet_name`。

## 飞书表格编辑准则

1. **最小改动**：用户没点名要删 / 改名 / 隐藏时，已有 Sheet 一张不动；补齐只写空格，未要求调整的值 / 结构 / 格式不动。
2. **目标子表与回读断言**：先确认真实末行与目标区域；未点名子表时只从 `resource_type=sheet && is_hidden=false` 的可见网格候选里选，唯一才自动使用，多张不得按 index 猜。涉及"所有 / 每个 sheet"（跨表汇总、批量清洗、合并多张子表）时先 `lark_sheets_workbook_info` 列全再逐个处理，别只做前几张。写后用 `lark_sheets_csv_get` / `lark_sheets_cells_get` / `lark_sheets_<对象>_list` 验首、中、末及用户点名项——返回 `ok` 只表示请求成功。纯 CSV 回写前去掉 `annotated_csv` 的 `[row=N] ` 前缀，`lark_sheets_cells_get` 的样式字段与值分开处理，公式必须回读 `formula`。**样式同样要回读**：写过边框 / 底色 / 字体色 / 数字格式 / 行高列宽 / 冻结的，收尾用 `lark_sheets_cells_get(include="style")` 或 `lark_sheets_sheet_info` 抽查目标区域首、中、末格确认属性真的在——写入返回 `ok` 不代表样式落上了；缺的整份重发（样式是幂等盖章，重发无副作用）。
3. **公式闭环**：可推导值写落格公式，不用静态值代替——本地算好数值再写进单元格，交付的是改输入不重算的死表；本地计算只用于推导和验证，落进单元格的必须是引用其他格的公式。写前确认字段语义、阈值边界（以上/至少=`>=`，超过/大于=`>`）、单位/时区和完整源范围，选首中末、空值、边界及一条可手算记录作哨兵；写后逐段 `lark_sheets_formula_verify(exit_on_error=true)`，各段 `status='success'` 且哨兵值正确才算完成（AI 公式例外：异步计算，改用 `lark_sheets_formula_verify(ai_only=true)` 对整个写入区间做一次异步状态检查，不用 `lark_sheets_cells_get` 轮询结果，`failed` 清零后即使仍有 pending 也可交付并说明）；试错 3 次仍失败可降级静态值，交付说明写明「静态值 + 失败原因 + 不随源数据更新」。
4. **完整继承样式**：新增行列时禁止只读值只写值——原表字体、对齐、底色（含奇偶行交替）、四边框都延续到新区域。**物理插入行 / 列**用 `lark_sheets_dim_insert(inherit_style="before"|"after")`（原生继承，比补刷可靠）；**往已有空白区域扩写**（如在数据右侧加新列）用 `lark_sheets_range_copy(paste_type="formats")` 先铺样式再写值；两者都表达不了的非规则样式，才用 `lark_sheets_cells_get(include="style")` 读源区样式随值写回。无论走哪条路径，插入后都另查行高列宽（行高不随样式继承，插行填长文本前补 `lark_sheets_rows_resize`）、合并与跨列标题并补齐。详见 `lark_get_skill(domain="sheets", section="write-cells")`。
5. **原子操作**：排序用 `lark_sheets_range_sort`，`range` 覆盖完整记录宽度，排序列只写进 `sort_keys`；删除记录用 `lark_sheets_dim_delete`，清空内容 / 格式才用 `lark_sheets_cells_clear`；禁止读值后用 `lark_sheets_csv_put` 覆盖来模拟排序 / 删除。仅跨类型且有顺序依赖时才用 high-risk `lark_sheets_batch_update`。
6. **标色分流**：数据变化后应自动重算的高亮 / 标红用条件格式，已确定结果的固定标注用静态样式，装饰性美化按视觉规范。两条路径取色字段用同一判据：用户中文语境下的"标红 / 染色 / 标记"指**单元格背景色**，"文字红 / 字体红 / 把字变红"才用字体色，默认无说明时选背景色。条件格式建完先 `lark_sheets_cond_format_list` 验规则与范围，再 `lark_sheets_cond_format_result_get` 抽查哨兵格命中样式。
7. **产物可核对**：用户点名的 sheet 名与数量、表头、标题、图例、文件名、口径逐字保留；回复中每项"已完成"都能定位到产物，缺口逐项声明。
8. **替换与新增**：批量替换 / 删除后搜索确认无残留；新增列要有表头，单位 / 口径另置，不占原表头或数据格。
9. **不编造**：表外数据须有可核验来源，不用常识或名称推断伪造公司、标准值、行情或法规参数；**没有来源就留空**——凭记忆填的数值大概率与真实值对不上，比留空更糟。留空的格在交付说明里逐项列出格址与缺的来源，不要只写一句"部分数据缺失"。

> 🤖 **文本类 NLP 任务首选 AI 公式，别默认退回手工 / 本地计算**：只要对文本列做**翻译 / 情感 / 分类打标签 / 信息提取 / 总结 / 润色**等 NLP，飞书在线表格上优先用原生 `=AI(prompt, range)` 逐列铺开（写法与普通公式一致，见 `lark_get_skill(domain="sheets", section="formula-translation")`），一次落表随行自动计算，比逐条读 → 手工判断 → 回写 / 本地调模型再写静态值都更省事。**判定标准是「逐行独立」**：每个目标单元格只依赖同一行输入即为逐行独立，**数据量（哪怕 1 万 +）、分批、判断复杂度都不改变该判定**——大数据量下 AI 公式仍是首选，分批只改公式铺设的批次大小（行数很多时按批串行，量级参考每批几百到一千行），不得改为「用本地脚本或规则生成语义结果后静态写回」；本地处理只能做清洗 / 行号映射 / 构造公式批次，不得读源文本生成目标语义值。只有单个结果依赖多行输入的跨行任务才走非公式路线。AI 公式异步计算，写完先对种子格 / 首格做**一次** `lark_sheets_cells_get(include="formula")` 核对文本，随后**第一校验入口必须是** `lark_sheets_formula_verify(ai_only=true, range="<整个写入区间>")`，禁止用 `lark_sheets_cells_get` 轮询计算结果；判据为 `ai_formula_failed_count == 0`（`range` 只透传给后端、不保证收窄汇总口径，按返回的单元格定位核对本次区间，别拿总数对预期条数），满足后即使仍有 pending 也可交付，并告知用户"AI 公式仍在后台运行"。

> 流程：了解结构 →（未点名时先按 visible_grid selection 定位）→ 读数据 → 原生工具写入 → 按用户点名项回读验证 → 在线交付。整理 / 美化 / 加汇总行这类会改变表长或版式的任务，收尾把表头行冻住（原表已有冻结设置的不动）。xlsx 验收只在处理本地 xlsx、或用户点名要本地 xlsx / 下载 / 打印时跑。

## References

reference 分两组：先读**通用方法与规范**（横切所有任务的样式 / 公式规则），再按操作对象进入**工具参考**查具体工具。编辑类任务务必先过通用方法与规范，连同上方「飞书表格编辑准则」对所有工具参考一律生效。

### 通用方法与规范（先读，横切所有任务，不含具体工具）

| Reference | 描述 |
| --- | --- |
| 飞书表格样式与配色规范 — `lark_get_skill(domain="sheets", section="visual-standards")` | 飞书表格样式与配色规范：表头/数据区/汇总行的颜色、字号、对齐、边框、数字格式等取值标准，以及从零新建表格的版式美化、新增汇总行、追加行列继承原表风格、已有区域美化等典型场景的决策流程与样式要点。工具调用参数细节请参考对应的 write-cells / range-operations / batch-update。条件格式（高亮、标红、数据条、色阶）请使用 conditional-format。 |
| 飞书表格公式生成规则 — `lark_get_skill(domain="sheets", section="formula-translation")` | Excel 公式到飞书表格公式的迁移与生成规则。核心目标不是保留 Excel 原语法，而是按飞书表格可执行规则重写公式，并在结果上尽量对齐 Excel。当用户要求把 Excel 公式改写成飞书表格公式，或需要生成飞书公式（尤其涉及 ARRAYFORMULA、数组语义与逐行填充、原生数组函数、INDEX/OFFSET、MAP/LAMBDA、日期差、多层范围结果与二次展开）时使用。本文负责把公式写对；落表后必须用 `lark_get_skill(domain="sheets", section="formula-verify")` 对本次公式范围逐段诊断。 |

### 按对象的工具参考（含工具）

| Reference | 描述 |
| --- | --- |
| Lark Sheet Formula Verify — `lark_get_skill(domain="sheets", section="formula-verify")` | 公式写入 / 批量填充 / `copy_to_range` 扩展 / 导入含公式工作簿后的完成检查。普通公式按本次新增或修改范围逐段扫描，合并编译失败与 7 类运行错误；`partial` 继续拆分，全部 `status='success'` 后完成。AI 公式用 `ai_only=true` 对整个写入区间做一次异步状态检查，pending 可说明后交付。 |
| Lark Sheet Workbook — `lark_get_skill(domain="sheets", section="workbook")` | 管理飞书表格的工作簿结构（子表列表及元数据）。当用户提到"看看这个表格有什么"、"表格结构"、"有哪些 sheet"、"新建一个 sheet"、"删除这个工作表"、"重命名"、"复制一份"、"移动到前面"时使用。 |
| Lark Sheet Sheet Structure — `lark_get_skill(domain="sheets", section="sheet-structure")` | 管理飞书表格的子表结构与布局：查看行高列宽、隐藏、合并、冻结与分组，并执行插入/删除/移动行列等物理结构操作。数据分组统计走 pivot-table。普通表尾追加优先用 write-cells 的 `lark_sheets_table_put` payload `mode: "append"` 自动定位末行；只有用户明确要求物理插入行列、继承模板结构或扩容布局时才先用本 reference。 |
| Lark Sheet Read Data — `lark_get_skill(domain="sheets", section="read-data")` | 读取飞书表格中的单元格数据。当用户需要"看看数据"、"分析数据"、"统计/汇总"时使用；也适用于需要查看公式、样式、批注等详细信息的场景。 |
| Lark Sheet Search & Replace — `lark_get_skill(domain="sheets", section="search-replace")` | 在飞书表格中搜索和替换文本，支持限定范围、大小写匹配、精确匹配、正则表达式。当用户需要"查找"、"搜索"、"定位"某个值，或"替换"、"批量修改文本"、"把 A 改成 B"时使用。不要用于理解表格结构（应读取数据）、不要用于数据分析（应读取数据后计算）、不要把用户操作动作中的关键词（如"汇总金额""统计数量"）当作搜索词。 |
| Lark Sheet Write Cells — `lark_get_skill(domain="sheets", section="write-cells")` | 向飞书表格指定区域批量写入值、公式、样式、批注或单元格图片。纯文本可用 `lark_sheets_csv_put`；金额、百分比、日期、布尔、计数和后续参与聚合的列用 `lark_sheets_table_put` 并显式声明 dtypes/formats；公式或富字段用 `lark_sheets_cells_set`。追加数据可直接用 `lark_sheets_table_put` payload 的 `mode: "append"`；只有明确需要物理插行/列时才先走 sheet-structure。公式落表后必须运行 formula-verify。 |
| Lark Sheet Range Operations — `lark_get_skill(domain="sheets", section="range-operations")` | 对飞书表格中指定区域执行结构性操作（不涉及写入单元格数据值）。适用场景：清除内容或格式（"清空"、"删除内容"、"去掉格式"）、合并/取消合并单元格、调整行高列宽（"加宽列"、"自适应列宽"）、移动/复制/填充/排序数据（"移动数据"、"复制到"、"自动填充"、"按某列排序"）。写入单元格数据请使用 write-cells。 |
| Lark Sheet Styles Put — `lark_get_skill(domain="sheets", section="styles-put")` | 把一份声明式视觉规格（样式/边框/合并/行高列宽/冻结）一次性应用到已有飞书表格的多个子表，整份规格一次提交。当任务是对存量表做美化收尾、批量刷样式、统一版式时使用。样式取值标准见 visual-standards；建新表带样式走 workbook（`lark_sheets_workbook_create` 的 `styles`）、写数据同步带样式走 write-cells（`lark_sheets_table_put` 的 `styles`），三者共用同一份 `styles` 词汇。仅针对飞书表格。 |
| Lark Sheet Batch Update — `lark_get_skill(domain="sheets", section="batch-update")` | 将多个飞书表格写入操作合并为一次批量执行，按顺序依次完成。适合需要连续执行多个写入操作的场景（如先修改结构再写入数据）。 |
| Lark Sheet Chart — `lark_get_skill(domain="sheets", section="chart")` | 管理飞书表格中的图表（柱形图、折线图、饼图、条形图、面积图、散点图、组合图、雷达图等）。当用户需要创建图表、修改图表样式或数据源、查看已有图表配置、删除图表时使用。也适用于用户提到"数据可视化"、"画个图"、"趋势分析"、"对比图"、"占比分析"、"做个图表"等数据可视化相关场景。 |
| Lark Sheet Pivot Table — `lark_get_skill(domain="sheets", section="pivot-table")` | 管理飞书表格中的数据透视表。当用户需要创建透视表、修改透视表的行列字段/聚合方式/筛选条件、查看已有透视表配置、删除透视表时使用。也适用于用户提到"分组汇总"、"交叉分析"、"按XXX统计"、"按字段分组"、"再分下组"、"多维分析"、"数据透视"等场景。 |
| Lark Sheet Conditional Format — `lark_get_skill(domain="sheets", section="conditional-format")` | 管理飞书表格中的条件格式规则（重复值高亮、单元格值比较、数据条、色阶、排名、自定义公式等）。当用户需要创建条件格式、修改已有规则的范围或样式、查看当前条件格式配置、删除规则时使用。也适用于用户提到"高亮"、"标红"、"颜色标记"、"数据条"、"色阶"、"条件样式"等场景。 |
| Lark Sheet Filter — `lark_get_skill(domain="sheets", section="filter")` | 管理飞书表格中的筛选器（filter）。当用户需要筛选数据（按文本/数值/颜色/日期条件过滤行）、查看已有筛选配置、修改或删除筛选器时使用。也适用于"只看"、"筛选出"、"仅保留符合条件的"等场景。 |
| Lark Sheet Filter View — `lark_get_skill(domain="sheets", section="filter-view")` | 管理飞书表格中的筛选视图（filter view）。当用户需要"建一个 XX 视图"、"保存这个筛选状态"、"切换不同筛选"、维护一个 sheet 上多份独立筛选配置时使用。视图与筛选器（filter）相互独立，可在同一 sheet 共存；视图的隐藏行仅在用户进入该视图时本地生效，不影响其他协作者。 |
| Lark Sheet Sparkline — `lark_get_skill(domain="sheets", section="sparkline")` | 管理飞书表格中的迷你图（折线迷你图、柱形迷你图、胜负迷你图）。当用户需要在单元格内嵌入小型图表来展示数据趋势时使用。也适用于"趋势线"、"单元格内图表"、"迷你图"等场景。注意：不等同于被禁用的 SPARKLINE() 公式函数。 |
| Lark Sheet Float Image — `lark_get_skill(domain="sheets", section="float-image")` | 管理飞书表格中的浮动图片。当用户需要在表格中插入浮动图片、调整图片位置和大小、查看已有浮动图片、删除图片时使用。也适用于"插入图片"、"添加 logo"、"放一张图"等场景。注意：如果用户需要将图片嵌入到某个单元格内部（单元格图片），请阅读 write-cells。 |
| Lark Sheet History — `lark_get_skill(domain="sheets", section="history")` | 查询飞书表格的历史版本并回滚到指定版本。当用户需要查看一张表的编辑历史版本列表、回滚到某个历史版本、或查询回滚的异步状态（进行中/成功/失败）时使用。回滚为异步操作，发起后通过状态查询轮询结果。仅针对飞书表格。 |
| Lark Sheet Changeset — `lark_get_skill(domain="sheets", section="changeset")` | 读取两个版本（CS revision）之间的 changeset（原始变更操作清单），用于复核某次编辑——尤其是 AI 编辑——是否真实满足用户诉求。传入起始版本（编辑前基线），可选结束版本（省略取最新），版本差上限 20；返回里最外层带当前表格最新版本号。当用户需要"看看这次改了什么"、"核对 AI 改动"、"对比两个版本的变更"时使用。 |

## 公共参数速查

各 reference 的每个工具下用一行徽章标注该工具支持的公共参数，例如：

- `_公共四件套_` — URL/token + sheet 定位（两组各**必给一个**，详见下方「公共参数」）
- `_公共：URL/token（无 sheet 定位）_` — 只接 URL/token，常见于 `lark_sheets_batch_update` / `lark_sheets_styles_put` 等不强制 sheet 定位的工具

### 公共参数（定位资源）

**公共四件套** = `url` / `spreadsheet_token` / `sheet_id` / `sheet_name`，分成两组 XOR，**每组都必须给且只能给一个**（XOR = 二选一必填，不是"可选"）——`spreadsheet` 指工作簿、`sheet` 指子表；条件格式 / 图表 / 筛选视图 / 透视表 / 迷你图 / 浮动图片这类对象在四件套之外另用各自的 `*_id` 定位：

1. **spreadsheet 定位（必填）**：`url` 与 `spreadsheet_token` 二选一，**必须给其中之一**。两个都不给 → 校验报错 `specify at least one of --url or --spreadsheet-token`；两个都给 → 互斥冲突。
   - **`url` 解析 `/sheets/`、`/spreadsheets/` 与 `/wiki/` 三种链接**（从路径里抽出 token；也可以直接把裸 token 传给 `spreadsheet_token`）。其它形态的链接不会被解析成表格 token。
   - **`/wiki/` 知识库链接可直接传 `url`**：会自动定位到链接背后的电子表格；若该链接背后不是电子表格（而是文档 / 多维表格等），则报错。
   - **例外**：`lark_sheets_workbook_create`（新建表 + 可选写入数据）与 `lark_sheets_workbook_import`（把本地文件导入为新表）都产出一张**还不存在**的表格，**不接受任何 spreadsheet / sheet 定位参数**——`lark_sheets_workbook_create` 只有 `title` / `folder_token` / `values` / `styles` / `sheets`，`lark_sheets_workbook_import` 只有 `file`（必填）/ `folder_token` / `name`。
2. **sheet 定位（公共四件套工具必填）**：`sheet_id` 与 `sheet_name` 二选一，**必须给其中之一**。两个都不给 → 校验报错 `specify at least one of --sheet-id or --sheet-name`。
   - ⚠️ **不确定 sheet 名时禁止直接猜 `Sheet1`**：除非用户对话明确说出 sheet 名 / id，或上下文（之前的工具调用 / URL 锚点 `?sheet=xxx`）已经出现过具体值，否则**第一步先调 `lark_sheets_workbook_info(url="...")`**（或 `spreadsheet_token`）拿 `sheets[].sheet_id` / `sheets[].title` 列表再选。中文环境下子表常叫"数据" / "Sheet"（无数字）/ "工作表 1" / 业务名，猜 `Sheet1` 大概率撞 `sheet not found`，比先查多耗一次失败调用 + 重试。
   - ⚠️ **`range` 里的 `Sheet1!` 前缀不能替代 sheet 定位**：即使写了 `range="Sheet1!A1:B2"`，仍**必须**额外传 `sheet_id` 或 `sheet_name`，否则照样报上面的错。
   - **例外**：徽章标为 `_公共：URL/token（无 sheet 定位）…_` 的工具不接受 sheet 定位，只给一组 spreadsheet 定位即可——工作簿级（`lark_sheets_workbook_info` / `lark_sheets_sheet_create` / `lark_sheets_revision_get` / `lark_sheets_changeset_get` / `lark_sheets_history_list` / `lark_sheets_history_revert` / `lark_sheets_history_revert_status`）、批量与整表级（`lark_sheets_batch_update` / `lark_sheets_batch_chart_create` / `lark_sheets_batch_chart_update` / `lark_sheets_cells_batch_clear` / `lark_sheets_styles_put` / `lark_sheets_dropdown_update` / `lark_sheets_dropdown_delete`），以及子表名写在 payload 里的 `lark_sheets_table_put`。`lark_sheets_workbook_export` 只接 `sheet_id`（无 `sheet_name`），`lark_sheets_pivot_create` 用 `target_sheet_id` / `target_sheet_name`（至多一个、可都不传，落点细节见 `lark_get_skill(domain="sheets", section="pivot-table")`）。徽章是判据，本行只是速记。

| 参数 | Type | 必填 | 说明 |
| --- | --- | --- | --- |
| `url` | string | 二选一必填（与 `spreadsheet_token`） | spreadsheet 或 wiki URL |
| `spreadsheet_token` | string | 二选一必填（与 `url`） | spreadsheet token |
| `sheet_id` | string | 二选一必填（与 `sheet_name`；仅公共四件套工具） | 工作表 reference_id |
| `sheet_name` | string | 二选一必填（与 `sheet_id`；仅公共四件套工具） | 工作表名称 |

**统一调用范式**（公共四件套工具的所有示例都遵循此形状，两组定位缺一不可）：

```
lark_sheets_<tool>(<workbook 定位>, <sheet 定位>, <其它参数>)
#   workbook 定位：url="..."        或 spreadsheet_token="..."           （二选一，必给）
#   sheet 定位：    sheet_id="<SID>"  或 sheet_name="<真实表名>"            （二选一，必给；占位符不要原样填）
# 例：lark_sheets_csv_get(url="https://.../sheets/shtXXX", sheet_name="<真实表名>", range="A1:F30")
# 注意：真实表名不要直接填 "Sheet1"——大多数表的子表不叫这个；先 lark_sheets_workbook_info 拿 sheets[].title 再代入。
```

> **布尔参数**：直接传 `true` / `false`（如 `page_all=true`、`has_header=false`），不要传字符串化的 flag 形态。

### 高风险确认

以下工具是 `high-risk-write`：`lark_sheets_batch_update`、`lark_sheets_cells_clear`、`lark_sheets_cells_batch_clear`、`lark_sheets_sheet_delete`、`lark_sheets_dim_delete`、`lark_sheets_dropdown_delete`、`lark_sheets_history_revert`（整表回滚到历史版本），以及各对象删除 `lark_sheets_chart_delete` / `lark_sheets_pivot_delete` / `lark_sheets_cond_format_delete` / `lark_sheets_filter_delete` / `lark_sheets_filter_view_delete` / `lark_sheets_sparkline_delete` / `lark_sheets_float_image_delete`。

首次调用会被 MCP server 拒绝并给出确认指引：先向用户展示将执行的操作与影响范围，**获得用户明确同意后**再带 `_confirm=true` 重新调用。未经用户同意不得带 `_confirm=true`，也不得在被拒后静默补 `_confirm=true` 重试——那等于禁用门禁。

### 复合 JSON 参数

写复合 JSON 参数（`cells` / `properties` / `operations` / `styles` / `border_styles` / `sort_keys` / `options` 等）时，如果对结构不确定，先用 `lark_discover(query="sheets.<tool>")` 把工具 schema 读出来再构造 payload，比靠 reference 的速查表更精确，也避免因为字段拼写或缺失被服务端拒绝。**注意 schema 的边界**：它描述的是参数值的内部结构，参数说明要求外层信封时（如 `sheets` 的 `{"sheets":[…]}`）schema 里看不到那层，按参数说明补上；reference 的 `## Schemas` 段也只给一层。图表**优先用语义工具 `lark_sheets_chart_create_basic` / `lark_sheets_batch_chart_create`（无需构造 snapshot）**；只有语义参数表达不了的单系列 / 单数据点 / 高级字段才退到 `lark_sheets_chart_create`，此时用 `lark_sheets_chart_create(print_example="<type>")` 拿最小可用模板改参。

### 参数内容类型与输出约定（术语速记）

- 参数表里 JSON 类入参标三类：**复合 JSON** = 深层嵌套对象（用 `lark_discover` 取完整结构）；**简单 JSON** = 一维 / 二维标量数组（如 `["sheet1!A1:B2",...]` / `[["alice",95]]`，结构简单）；**非 JSON 文本** = 原样文本（如 CSV）。
- **envelope**：所有工具返回统一外层结构 `{ok, identity, data, ...}`。正文里 `envelope.data` 指业务数据层（如 `lark_sheets_csv_get` 的 `annotated_csv`）；写操作不会自动回读，如需校验请自行调用对应的 `*_list` / `*_get` / `lark_sheets_cells_get`。

## 复合 JSON / 大入参

复合 JSON 参数（`cells` / `properties` / `operations` 等）作为 JSON 对象传入即可（MCP client 负责序列化）。payload 较大、含换行 / 引号等特殊字符时也直接放进参数对象，无需关心命令行转义；**同一次调用里传两个大 JSON 参数（如 `lark_sheets_table_put` 的 `sheets` 与 `styles`）也没有限制**——CLI 那边"stdin 每次只能给一个参数"的约束在这里不存在。

含特殊字符（`!` / 引号 / 空格 / 非 ASCII）的参数（如 A1 引用 `range="Sheet1!A1:B2"`、含特殊字符的 sheet 名 `source="'Sales-2025'!A1:D100"`）直接作为字符串值传入即可——MCP client 处理转义，无需关心 shell history expansion 等问题。

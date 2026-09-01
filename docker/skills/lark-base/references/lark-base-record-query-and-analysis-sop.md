# Base Record 数据语义与专业分析 SOP

本 SOP 不讲解通用 jq / Python 语法、统计公式或数据科学算法。Agent 应使用已有的数据分析能力；本文只负责把 Base 的查询范围、NDJSON 物理结构、Field / Record / View / Link 语义和完整性约束，正确映射到专业分析任务。

普通预览、已知记录读取、关键词搜索和小规模直接处理按主 skill 的 Record 核心路径执行（`lark_get_skill(domain="base")`）。以下情况读取本文：大表完整读取、`has_more=true`、View 范围读取、复杂多表 JOIN、集合或多值运算、分组与 Top-K、窗口或严格时序、时间周期对齐、层级递归、数据重塑、派生与指定规则清洗、临时语义转换，以及需要可靠样本范围的描述性或推断性分析。

## 0. MCP 下的执行通道

Base 记录读取工具在本地 CLI 下会把记录写成 NDJSON 文件供本地引擎处理。通过 MCP server 调用时通道不同，先记住三条事实：

- `format="ndjson"` 时记录被写进服务端容器内的 artifact 文件，返回值只有 manifest。agent 没有任何工具可以读回该文件；`output` 只能给这个不可达文件改名，`overwrite` 同理。**ndjson 只当作规模与 schema 探针，不要把 artifact 当作后续步骤的输入。**
- `format="json"` 是唯一能把记录本体交到 agent 手上的通道，记录直接返回到上下文。此时 `limit` 上限是 200（缺省 100），比 ndjson 的 2000 小；成组读取靠 `offset` 翻页。
- MCP server 不提供服务端 jq 或脚本计算：`lark_exec_script` 只执行随 skill 打包的脚本，不能处理这里的记录。所有确定性计算要么下推到 Base（`filter_json` 谓词、`sort_json` 排序、`field_id` 投影、`lark_base_data_query()` 聚合），要么由 agent 在自己的上下文/运行环境里对 `format="json"` 返回的记录完成。

因此标准两步是：先用一次 `format="ndjson"` 拿 manifest 判断规模、`has_more` 和列统计，再决定是用 `format="json"` 把收敛后的记录读进上下文自行计算，还是改走 `lark_base_data_query()` 让云端算。**尽量把能下推的条件下推**——上下文是这里最紧的资源，不是磁盘。

## 1. 先选数据路径

| 任务条件 | 路径 | 完整性要求 |
| --- | --- | --- |
| 收敛后规模可读入上下文且 `has_more=false` | `format="json"` + 最小投影读入上下文自行计算 | 直接在返回记录上分析 |
| 用户指定 View | 记录工具加 `view_id`，返回视图范围内的记录 | 结论只代表该 View；记录范围写在 `query_context` |
| 超过 2000 行且必须取得逐条原始记录 | 调整 `offset` 后继续查询 | 直到 `has_more=false` 代表所有记录已读取 |
| 超过 2000 行，只需单表基础统计、分组或 Top-K | `lark_base_data_query()` | 由 Base 云端在完整单表范围计算 |
| 多表 JOIN、窗口、递归、严格漏斗、语义分析或任意需要逐条明细的高级计算 | 每张表分别下推收敛到可读入规模，再在上下文中处理 | 每张参与表都必须完整；不能用 `lark_base_data_query()` 代替原始明细 |

局部预览、固定前 N 条或 `has_more=true` 的导出不能支持全局结论。采样只在用户明确要求抽样时使用，并必须说明抽样范围和方法。

## 2. 范围、View、选择与投影

先明确分析总体，再导出数据：

- **整表范围：** 省略 `view_id`；`query_context.record_scope` 应为 `all_records` 或 `filtered_records`。
- **View 范围：** 传真实 `view_id`。View 的 filter 决定记录范围，sort 决定顺序，`query_context.record_scope` 应为 `view_filtered_records`；结论必须表述为"该 View 内"。
- **临时条件：** `filter_json` 覆盖 View filter，`sort_json` 覆盖 View sort；排序示例：`sort_json='[{"field":"Updated","desc":true},{"field":"Title","desc":false}]'`，数组顺序是排序优先级，`desc=true` 为降序。两者只覆盖对应部分，不能把"指定 View"与"手工替换后的范围"混称为同一口径。tuple 条件的完整示例和协议见 `lark_get_skill(domain="base", section="filter-condition")`。
- **关键词与结构化条件：** 展示文本关键词用 `lark_base_record_search()`；数值、日期、选项、人员、群组、Link、空值等用 `filter_json`。两者可以叠加。
- **字段投影：** `field_id` 是数组参数，一个元素一个字段，只导出筛选、分组、排序、JOIN、解释、回查所需字段。系统 `record_id` 自动保留；跨表任务还必须投影 Link 或经过验证的业务 key。

manifest 的 `query_context` 是本次导出范围的记录，不是完整查询语言的替代品。沿用上下文里的既有结论前，同时核对 `base_token`、`table_id`、View / filter / sort、投影字段和 `rev`。

## 3. 大表完整读取

NDJSON 单次最多返回 2000 条。必须取得超过 2000 条逐行原始记录时：

1. 固定 `base_token`、`table_id`、`view_id`、filter、sort 和字段投影；首块从 `offset=0` 开始，逐块推进 `offset`。ndjson 探测每块可达 2000，`format="json"` 每块上限 200。
2. 每块读取 manifest 的 `records_count`、`has_more`、`next_offset`、`rev` 和 `query_context`；`has_more=true` 时只使用返回的 `next_offset` 继续。
3. 所有块的 `rev` 与 `query_context` 必须一致。读取期间 `rev` 改变表示数据快照已变化，可能产生遗漏或重复；需要严格完整时从头重读，否则明确披露非快照一致。
4. 以最后一块 `has_more=false` 作为终止条件。
5. 多表任务分别完成每张表的完整性检查；任一输入不完整，JOIN、集合、窗口或统计结果都不完整。

MCP 下 ndjson artifact 不可读回，块之间也不能在服务端拼接，所以逐条明细必须用 `format="json"` 分块读入上下文，并按 `record_id` 合并去重。上下文是这里的硬约束：先用 `filter_json` 和最小 `field_id` 投影把每块压到必要列，逐块结果加起来仍撑不住时，说明规模限制，并优先改走下方 `lark_base_data_query()` 或继续收紧谓词。

如果任务只需要单表基础统计，不应为了拿到所有原始行而分块下载，优先使用下方 `lark_base_data_query()`。

## 4. `data-query`：大规模单表基础统计逃生路径

`lark_base_data_query()` 的 datasource 是单个 Base Table，适合在超过 2000 行时由云端完成：

- `filters`：聚合前筛选，类似 WHERE；它使用 LiteQuery 特有的 DSL，不是 Record/View 的 tuple filter，注意不要混淆。
- `dimensions`：分组字段。
- `measures`：`sum`、`avg`、`min`、`max`、`count`、`count_all`、`distinct_count`。
- `sort`：排序字段

SOP 选定这条路径后再读取 `lark_get_skill(domain="base", section="data-query")`。典型适用范围是**单表**总数、分组计数、数值汇总、去重计数、分组排序和 Top-K。

能力边界：

- 只传 dimensions 时返回去重后的维度组合，不返回 `record_id`，不能视为逐条记录。
- 不承担多表 JOIN、窗口函数、递归、原始明细导出或语义分析。
- 没有独立 HAVING 语义；可先由 `lark_base_data_query()` 聚合，再对已收敛的聚合结果做条件过滤。
- 条件聚合只有所有 measures 共用同一前置条件时才能直接下推到 `filters`；不同 measures 使用不同条件时，拆成可复核的查询或在完整明细上计算。
- 聚合后需要展示原始记录时，用返回的真实业务 key / 维度值通过 `lark_base_record_list(filter_json=...)` 或 `lark_base_record_get()` 回查；不要从聚合行臆造 `record_id`。

## 5. Manifest 与 NDJSON 结构

`format="ndjson"` 时返回记录文件的 manifest。manifest 里的 `record_file` / `manifest_file` 路径指向服务端容器内的文件，agent 无法读取；把 manifest 当作规模与 schema 探针，再用 `format="json"` 取记录本体。高频 manifest 字段：

| 字段 | 分析用途 |
| --- | --- |
| `records_count` / `has_more` / `next_offset` | 判断当前块大小、是否完整以及下一块起点 |
| `base_token` / `table_id` / `query_context` | 固定来源表和读取范围 |
| `rev` | 检查多块或沿用既有结论时的数据版本一致性 |
| `timezone` | 解释 Base 本地日历边界 |
| `columns.*.field_id/field_type/physical_type` | 确认 NDJSON 实际列类型与稳定字段标识 |
| `columns.*.stats/example/hint` | 估算空值、数组展开规模和文本体量；只描述本次导出 |
| `record_file_size_bytes` | 判断这批记录相对上下文的体量，决定全部读入、只取预览、继续收紧投影还是改走云端聚合 |

NDJSON 每行是一条 Record，以字段 `name` 为 key，并额外包含系统 `record_id`；`field_id` 位于 manifest。字段改名会改变记录 key，跨批次或长期复用的分析应通过 manifest 复核 `field_id → name`。

**投影自检：拿到 manifest 先看 `ignored_fields` 和 `columns`。** `ignored_fields` 非空说明有字段名没被识别（大小写、空格、字段被重命名、这段调用是从另一张表复制来的）；此时 `columns` 里缺的就是被丢掉的列，后续读它们只会得到 `null` 而不会报错。请求的字段**全部**没命中时工具会直接返回 `projection_dropped` 错误而不是给你一份只有 `record_id` 的导出；部分命中不会报错，必须自己核对 `columns` 是否覆盖了计算需要的每一列，必要时先 `lark_base_field_list()` 取真实字段名。`ignored_fields` 和 `record_not_found` 在 manifest 中出现。

| `field_type` | NDJSON 结构 | Base 特有的分析语义 |
| --- | --- | --- |
| `record_id` | `string` | 表内唯一主键，用于定位和块间去重 |
| `text`、`formula`、`lookup`、`auto_number`、`not_support` | `string\|null` | Formula / Lookup 不保留原始计算类型；需要数值运算时必须显式验证转换规则 |
| `datetime`、`created_at`、`updated_at` | RFC3339 `string\|null` | 带 offset；区分绝对时刻与 Base 本地日历语义 |
| `number` | `number\|null` | 空值不是零，是否纳入分母由任务口径决定 |
| `checkbox` | `boolean` | 上游空值在 NDJSON 中规范化为 `false` |
| `select` | `array<string>` | 单选、多选都读取为选项名称数组；空值为 `[]` |
| `location` | `{lng,lat,full_address}\|null` | 地理计算用坐标，文本范围分析用地址 |
| `user`、`group_chat`、`created_by`、`updated_by` | `array<{id,name}>` | 连接与去重使用 `id`，展示使用 `name` |
| `link` | `array<{id}>` | `id` 是 Field schema 指定目标表中的 `record_id` |
| `attachment` | `array<{file_token,size,name}>` | 文件 token 是稳定定位信息；数组展开会改变粒度 |

除 `record_id` 外，不假设任何列满足非空或唯一。标量空值通常是 `null`，多值列空值是 `[]`；未显式排序时不依赖 NDJSON 行顺序。

## 6. 专业分析场景中的 Base 映射

下表不教授算法，只指出开始计算前必须解决的 Base 特有问题：

| 场景 | Base 数据结构映射与正确性约束 |
| --- | --- |
| 复杂多表 JOIN | Link 先展开为 `(source_record_id, target_record_id)` 边，再按目标表 `record_id` 连接；目标 `table_id` 来自 Field schema。无 Link 时只能使用已验证唯一性和空值规则的业务 key，必须统计未匹配与重复 key。 |
| 集合运算 | Select 是名称数组，人员/群组按 `id`，Link 按目标 `record_id`；先明确是 record 级包含/交并差，还是 element 级集合，不能把数组字符串化比较。 |
| 多值展开与数据重塑 | Select、人员、群组、Link、附件都是 nested relation。一次展开把粒度从 record 变为 record-element；两个数组同时展开会产生行内笛卡尔积，除非任务明确分析共现，否则分别展开并聚合回目标粒度。 |
| 分组、条件聚合与 HAVING | 先确定 record / element / entity grain 和空值口径。单表基础聚合可走 `lark_base_data_query()`；HAVING 在聚合结果上过滤。不同条件的 measures 不要错误共用一个全局 filter。 |
| 排序与 Top-K | 原始记录 Top-K 用记录工具的 `sort_json`；大表单表聚合 Top-K 用 `lark_base_data_query()`。并列值是否全部保留、如何稳定打破 ties 必须按任务口径明确。 |
| 窗口计算与严格时序漏斗 | NDJSON 不保证默认顺序；显式选择实体 key、事件时间、分区字段和同时间 tie-breaker。`lark_base_data_query()` 不提供窗口或逐事件漏斗语义。 |
| 时间边界与周期对齐 | 真实时长和跨时区排序按完整 RFC3339 instant；按来源 Base 的日/周/月分组使用值中的本地日期和 manifest `timezone`，不要先转 UTC 后再切日历周期。 |
| 层级与递归 | Link 是有向邻接边；逐跳保持各 Table 的 record-id domain，记录已访问节点以处理环，并明确深度或终止条件。 |
| 派生变量与指定规则的数据质量处理 | 保留原字段和 `record_id`，派生列另命名；只执行用户给定或业务已确认的缺失、异常、去重、标准化规则，不把通用清洗习惯当成业务事实。 |
| 临时语义转换 | LLM 产生的标签、主题或实体映射以 `record_id` 回连并保留判断依据；默认只作为临时派生结果，用户未要求时不写回 Base。 |
| 描述性统计、差异分解、关联分析与统计推断 | 先确认总体是整表还是 View、输入是否完整、分析粒度是否因多值展开改变，以及 Formula / Lookup 是否需要类型恢复；把选择偏差、缺失和重复实体视为 Base 数据口径问题，而不是静默用算法默认值处理。 |

跨多个同类事实表时，先投影为一致的长表结构，例如 `(source_table, source_record_id, entity_id, metric...)` 再纵向合并；横向比较时，各表先聚合到相同 entity grain 再 JOIN，避免原始事实间 many-to-many fan-out。

需要 LLM 理解原文的判断（开放文本打标、情绪或意图识别、主题归纳、语义分类、相似性判断、实体消歧）先用不改变分析口径的确定性条件收敛范围，只导出 `record_id`、判断所需原文和解释所需的最小字段集，再用 `format="json"` 加最小投影把必要记录读入上下文逐条判断；规模较大时先说明原因和预计耗时，确认后按 `offset` + `limit` 分批，各批沿用同一口径并在上下文中累积。除非用户明确要求规则法，不用关键词命中、词频、正则或规则打分替代语义判断。

## 7. 交付前检查

最终结果至少说明：

- 数据来自哪些 Base / Table / View，应用了哪些 filter、时间范围和字段投影。
- 每张输入表是否读到 `has_more=false`，或是否由 `lark_base_data_query()` 在云端完成完整单表聚合。
- 分析粒度、空值口径、多值展开方式、JOIN key、重复 key 和未匹配数量。
- 时间采用 instant 还是 Base local-calendar 语义。
- 临时派生、清洗、语义标签或推断使用了哪些用户指定规则；哪些结果没有写回 Base。

只有范围完整且口径与问题一致时，才给出全局结论。

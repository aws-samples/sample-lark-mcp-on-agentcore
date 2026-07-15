---
name: lark-base
description: "飞书多维表格（Base）操作：建表、字段、记录、视图、统计、公式/lookup、表单、仪表盘、workflow、角色权限；遇到 Base/多维表格/bitable 或 /base/ 链接时使用。文件导入转 lark_drive_import，认证/授权由 MCP server 自动处理。"
---

# base

## 何时使用

使用本 skill：

- 用户明确提到 Base / 多维表格 / bitable，或给出 `/base/` 链接。
- 用户要在 Base 内建表、改表、管理字段、写记录、查记录、配视图。
- 用户要在 Base 内做公式字段、lookup 字段、跨表计算、派生指标、筛选聚合、TopN、统计分析。
- 用户要管理 Base 表单、仪表盘、workflow、高级权限或角色。
- 用户要把旧 Base 聚合式命令或旧写法迁移到当前 shortcut。

不要使用本 skill：

- 只是认证、初始化配置、切换身份、处理 scope 或权限授权恢复（MCP server 自动处理认证）。
- 把本地 Excel / CSV / `.base` 导入成 Base，转 `lark_drive_import(type="bitable")`。
- 泛化数据分析、字段设计、公式讨论，但没有 Base/多维表格上下文。

## 使用边界

- Base 业务操作只使用 `lark_base_*` 工具，不使用旧聚合式命令。
- 本轮 Base 不依赖 `lark_discover`。SKILL 只保留路由、风险和复杂 JSON/DSL；简单命令由命令自身的参数、tips 和错误恢复承接。
- 用户要把 Excel / CSV / `.base` 导入成 Base 时，先转 `lark_drive_import(type="bitable")`，导入完成后再回到 Base 工具。
- 认证由 MCP server 自动处理；Base 文档只保留会影响 Base 路径选择的权限规则。

## 先获取 Base Token 和所需 ID

进入任何需要目标 Base 的工具前，必须先拿到可用的 `base_token`，以及当前任务需要的 `table_id` / `view_id` / `record_id` / `form_id` / `dashboard_id` / `workflow_id` 等真实 ID；不要把完整 URL、wiki token、workspace token 或孤立 raw token 直接当作 `base_token`。

- 用户输入 URL 或分享链接：先调用 `lark_base_url_resolve(url="<url>")`，用返回的 `base_token` 和相关 ID 继续后续命令。
- 用户输入 Base 标题、关键词或不确定名称：先调用 `lark_base_title_resolve(title="<keyword>")`；`title` 传入标题中的短关键词，不超过 30 个字符；过长标题先取最有区分度的短关键词；多候选时先让用户消歧，不要猜。
- 文档嵌入 Base 标签：直接读取 `<bitable>` / `<base_refer>` 的 `token` 作为 `base_token`，`table-id` 作为 `table_id`，`view-id` 作为 `view_id`；孤立 raw token 不走 `lark_base_url_resolve()`。
- 仍无法定位且用户不是要新建 Base 时，先反问用户要操作哪一个 Base；用户要新建时才用 `lark_base_base_create()`。

## 快速路由

| 用户目标 | 优先工具 | 何时读 reference |
|---|---|---|
| 查 Base 本体 | `lark_base_base_get()` | 用返回确认 Base 名称、owner、权限和可继续操作的 token |
| 创建/复制 Base | `lark_base_base_create()` / `lark_base_base_copy()` | 新建时强烈推荐用 `table_name` + `fields` 同时配置新 Base 里唯一一个初始数据表的 name 和 schema；写入后报告新 Base 标识和 `permission_grant` |
| 查看 Base 内资源目录 | `lark_base_base_block_list()` | 想先了解一个 Base 里有哪些 table/docx/dashboard/workflow/folder 时优先用它；返回 ID 关系和 fewshot 看 `lark_discover(query="base.base-block.list")` |
| 管理 Base 内资源目录 | `lark_base_base_block_create/move/rename/delete` | 创建或整理 Base 直接管理的 folder/table/docx/dashboard/workflow；资源内容继续用对应工具 |
| 管理数据表 | `lark_base_table_list/get/create/update/delete` | 处理 table 的列出、详情、创建、重命名和删除 |
| 列/查/删字段 | `lark_base_field_list/get/delete/search_options` | 写入前用 list/get 确认字段类型、选项、ID；删除前确认目标字段 |
| 创建/更新字段 | `lark_base_field_create()` / `lark_base_field_update()` | 必读 `lark_get_skill(domain="base", section="field-json")`；公式读 `lark_get_skill(domain="base", section="formula-field-guide")`；lookup 读 `lark_get_skill(domain="base", section="lookup-field-guide")`；命令细节读 `lark_get_skill(domain="base", section="field-create")` / `lark_get_skill(domain="base", section="field-update")` |
| 读记录明细 | `lark_base_record_get()` / `lark_base_record_list()` / `lark_base_record_search()` | 涉及筛选、排序、Top/Bottom N、聚合、多表关联、全局结论时读 `lark_get_skill(domain="base", section="data-analysis-sop")` |
| 写记录 | `lark_base_record_upsert()` / `lark_base_record_batch_create()` / `lark_base_record_batch_update()` | 必读 `lark_get_skill(domain="base", section="record-upsert")` / `lark_get_skill(domain="base", section="record-batch-create")` / `lark_get_skill(domain="base", section="record-batch-update")` 和 `lark_get_skill(domain="base", section="cell-value")` |
| 附件字段 | `lark_base_record_upload_attachment()` / `lark_base_record_download_attachment()` / `lark_base_record_remove_attachment()` | 附件不要伪造成普通 CellValue；上传走本地文件，下载/删除按 file token 或字段定位 |
| 删除记录 / 分享记录链接 / 历史 | `lark_base_record_delete()` / `lark_base_record_share_link_create()` / `lark_base_record_history_list()` | 删除前确认 record；分享链接最多 100 条；历史读 `lark_get_skill(domain="base", section="record-history-list")`，只查单条记录，不做整表审计 |
| 管理视图 | `lark_base_view_*` | `lark_base_view_set_filter()` 读 `lark_get_skill(domain="base", section="view-set-filter")`；其余配置先 get 现状，再按返回结构更新 |
| 一次性聚合统计 | `lark_base_data_query()` | 必读 `lark_get_skill(domain="base", section="data-analysis-sop")` 和入口 `lark_get_skill(domain="base", section="data-query-guide")`；完整 DSL 再读 `lark_get_skill(domain="base", section="data-query")` |
| 公式字段 | `lark_base_field_create(json='{"type":"formula",...}')` | 必读 `lark_get_skill(domain="base", section="formula-field-guide")`，读后再加隐藏确认 flag `i_have_read_guide=true` |
| Lookup 字段 | `lark_base_field_create(json='{"type":"lookup",...}')` | 必读 `lark_get_skill(domain="base", section="lookup-field-guide")`，读后再加隐藏确认 flag `i_have_read_guide=true` |
| 表单提交 | `lark_base_form_submit()` | 先读 `lark_get_skill(domain="base", section="form-detail")` 获取题目、filter 和附件所需 `base_token`；提交 JSON 读 `lark_get_skill(domain="base", section="form-submit")` |
| 表单题目创建/更新 | `lark_base_form_questions_create()` / `lark_base_form_questions_update()` | 读 `lark_get_skill(domain="base", section="form-questions-create")` / `lark_get_skill(domain="base", section="form-questions-update")` |
| 其他表单管理 | `lark_base_form_list/get/detail/create/update/delete` / `lark_base_form_questions_list/delete` | `lark_base_form_detail()` 读 `lark_get_skill(domain="base", section="form-detail")`；删除前确认目标表单 |
| 仪表盘与组件 | `lark_base_dashboard_*` / `lark_base_dashboard_block_*` | 提到图表/看板/block 时先读 `lark_get_skill(domain="base", section="dashboard")`；组件 `data_config` 读 `lark_get_skill(domain="base", section="dashboard-block-data-config")`；读取图表计算结果用 `lark_base_dashboard_block_get_data()` |
| Workflow | `lark_base_workflow_*` | 创建/更新或理解 steps 时读入口 `lark_get_skill(domain="base", section="workflow-guide")` 和 steps JSON SSOT `lark_get_skill(domain="base", section="workflow-schema")`；list/get/enable/disable 只处理 workflow ID 与启停状态 |
| 高级权限与角色 | `lark_base_advperm_*` / `lark_base_role_*` | 角色操作先读入口 `lark_get_skill(domain="base", section="role-guide")`；角色 create/update 或解读完整配置再读权限 JSON SSOT `lark_get_skill(domain="base", section="role-config")`；系统角色不可删除；关闭高级权限会影响自定义角色 |

## Base 心智模型

- Base 曾用名 Bitable；返回字段、错误或旧文档里的 `bitable` 多为历史兼容，不代表应改走裸 API 或另一套命令。
- `lark_base_base_block_list()` 是查看一个 Base 内资源目录的新入口：它列出这个 Base 直接管理的 `folder/table/docx/dashboard/workflow`，适合先判断 Base 里有什么，再决定走 table、dashboard、workflow 或 docx 工具。
- `lark_base_base_block_*` 只负责资源目录管理，包括创建资源、移动到 folder、重命名和删除；具体资源内容仍走 table/dashboard/workflow 工具。
- 新建 Base 时，强烈推荐一次性执行 `lark_base_base_create(name="<base>", table_name="<table>", fields='<field-json-array>')`，同时配置新 Base 里唯一一个初始数据表的 name 和 schema；使用 `fields` 前先读 `lark_get_skill(domain="base", section="field-json")` 或复用 `lark_base_field_create()` 的字段 JSON 形状，不要猜字段属性。
- `lark_base_base_create()` 不传 `table_name` 和 `fields` 时，会创建一个默认 schema 的初始数据表。
- 表、字段、视图、workflow、dashboard block 的名称和 ID 必须来自真实返回，不要凭用户口述猜。
- 存储字段可写；系统字段、`formula`、`lookup` 只读；附件字段走专用 attachment 命令。
- 一次性原始记录查询优先用 `lark_base_record_list()` / `lark_base_record_search()` 的 filter/sort；聚合分析优先用 `lark_base_data_query()`；需要长期显示在表中时，才新增 `formula` / `lookup` 字段。
- `formula` 适合常规计算、条件判断、文本/日期处理和长期派生指标；`lookup` 适合明确的跨表查找、筛选后取值或聚合引用。
- 写入、分析、公式、lookup、workflow、dashboard 前，先读取真实结构：表、字段、视图、关联表和 dashboard block 名称都以命令返回为准。
- 跨表场景必须读取目标表结构；link 单元格中的关联 `record_id` 只是连接键，最终回答要回查并展示用户可读字段。

## 身份与权限

MCP server 自动使用用户身份执行所有 Base 操作（authentication is handled automatically by the MCP server）。

如果操作返回权限错误，直接告知用户权限不足，建议用户在飞书开发者后台确认资源访问权限。

## 查询与统计规则

涉及查询、统计或判断结论时，先阅读 `lark_get_skill(domain="base", section="data-analysis-sop")`，并遵守：

1. `lark_base_record_list()` 的默认页、固定 `limit` 只能证明已读取范围内的事实，不能直接支撑全局最值、全量计数、Top/Bottom N、异常识别或分组结论。
2. 能由 Base 表达的筛选、排序、投影、聚合、分组和限制，应在 Base 云端查询能力中执行；不要先拉原始记录到本地上下文再手工筛选排序。
3. `has_more=true` 或等价分页信号表示当前结果不是全量；除非用户只要样例/前 N 条，不能基于该页回答全局问题。
4. 多表查询必须先确认关系字段和连接键；link 单元格里的 `record_id` 是关系键，不是用户可读答案。
5. 最终答案必须能追溯到真实表、真实字段、查询范围、筛选/排序/聚合条件和必要的连接键。
6. 一次性原始记录查询优先用 `lark_base_record_list()` / `lark_base_record_search()` 的 filter/sort；聚合分析优先用 `lark_base_data_query()`；要把结果长期显示在表里，才考虑新增 `formula` / `lookup` 字段。
7. `lark_base_data_query()` 可返回聚合结果或维度字段行，但维度行按字段组合去重且不返回 `record_id`；需要逐条记录、记录定位或完整行级字段时，再用 `lark_base_record_list()` / `lark_base_record_search()` / `lark_base_record_get()` 回查。

## 写入前置规则

- 写记录前先读字段结构；只写存储字段。系统字段、附件字段、`formula`、`lookup` 不作为普通记录写入目标。
- 附件上传、下载、删除走专用 `lark_base_record_*_attachment` 命令。
- 写字段前先读 `lark_get_skill(domain="base", section="field-json")`；涉及 `formula` / `lookup` 时必须读 `lark_get_skill(domain="base", section="formula-field-guide")` / `lark_get_skill(domain="base", section="lookup-field-guide")`。
- 表名、字段名、视图名、workflow 配置中的名称必须来自真实返回；跨表场景还要读取目标表结构。
- 删除、角色更新、字段更新等高风险操作遵循 confirmation gate（`_confirm=true`）；目标不明确时先用 get/list 消歧。
- 批量写入单批最多 200 条；连续写同一表时串行执行，遇到 `1254291` 按短暂等待后重试处理。
- `lark_base_record_batch_update()` 是"同值批量更新"：同一份 patch 应用到全部 `record_id_list`，不要拿它做逐行不同值映射。
- select/multiselect 写入未知选项可能触发平台新增选项；不是要新增时，先用 `lark_base_field_list()` 或 `lark_base_field_search_options()` 确认可选值。

## 表单与视图细节

- `lark_base_form_submit()` 前必须先跑 `lark_base_form_detail()`，读取 `questions[].type`、`required`、`filter` 和附件场景需要的 `base_token`；不要填写被 filter 隐藏的问题。
- 表单附件不要写进 `fields`，放在 `json` 的 `attachments` 中；提交附件时必须同时传表单所属 Base 的 `base_token`。
- `lark_base_view_set_filter()` 是唯一保留的 view reference；sort/group/card/timebar/visible-fields 这类配置先用对应 get 命令读现状，保留未修改字段，只替换用户要求变更的配置。
- 视图适合持久化、共享和 UI 复用；一次性筛选/排序可先用 `lark_base_record_list()` / `lark_base_record_search()` 的 filter/sort 验证结果，再按需要沉淀为持久视图。

## Dashboard / Workflow / Role

- Dashboard 的复杂点是 block 的 `data_config`，不是 list/get/create/delete 命令参数。创建或更新 block 前先读 `lark_get_skill(domain="base", section="dashboard-block-data-config")`，组件必须串行创建；`lark_base_dashboard_arrange()` 是服务端智能布局，只在用户明确要求重排/美化时执行。`lark_base_dashboard_block_get_data()` 读取图表最终计算结果，不返回 block 名称、类型、布局或 `data_config`；需要元数据先用 `lark_base_dashboard_block_get()`。
- Workflow 的复杂点是 `steps` 结构。创建、更新或解释完整 workflow 时读入口 `lark_get_skill(domain="base", section="workflow-guide")` 和 steps JSON SSOT `lark_get_skill(domain="base", section="workflow-schema")`；enable/disable/list 只需确认 workflow ID、当前启停状态和用户意图。
- Role 的复杂点是权限 JSON。角色操作先读入口 `lark_get_skill(domain="base", section="role-guide")`；`lark_base_role_create()` 只支持自定义角色；`lark_base_role_update()` 是 delta merge；角色 create/update 或解读完整配置时读权限 JSON SSOT `lark_get_skill(domain="base", section="role-config")`。`lark_base_role_delete()` 只适用于自定义角色，系统角色不可删除；删除角色和关闭高级权限前必须确认目标和影响。

## 常见恢复

| 错误 / 现象 | 恢复动作 |
|---|---|
| `param baseToken is invalid` / `base_token invalid` | 检查是否把 wiki token、workspace token 或完整 URL 当成了 `base_token`；按入口规则重新获取真实 `base_token` |
| `not found` 且输入来自 Wiki 链接 | 优先检查是否把 wiki token 当成 base token，不要立刻改走裸 API |
| `1254045` 字段名不存在 | 重新 `lark_base_field_list()`，使用真实字段名或字段 ID；注意空格、大小写和跨表字段 |
| `1254015` 字段值类型不匹配 | 先 `lark_base_field_list()`，再按 `lark_get_skill(domain="base", section="cell-value")` 构造 CellValue |
| 日期 / 人员 / 超链接字段报格式错误 | 日期用 `YYYY-MM-DD HH:mm:ss`；人员用 `[{ "id": "ou_xxx" }]`；超链接用 URL 或 markdown link 字符串 |
| formula / lookup 创建失败 | 先读 `lark_get_skill(domain="base", section="formula-field-guide")` / `lark_get_skill(domain="base", section="lookup-field-guide")`，再按 guide 重建请求 |
| `ignored_fields` / `READONLY` | 移除只读字段，只写存储字段 |
| `1254104` | 批量超过 200，分批调用 |
| `1254291` | 并发写冲突，串行写入并在批次间短暂等待 |
| `91403` | 无权限访问该 Base，告知用户权限不足，不要盲目重试 |

## 保留 Reference

- `lark_get_skill(domain="base", section="data-analysis-sop")`：查询/统计/全局结论的选路 SOP
- `lark_get_skill(domain="base", section="data-query-guide")` / `lark_get_skill(domain="base", section="data-query")`：聚合查询入口 fewshot 与 DSL SSOT
- `lark_get_skill(domain="base", section="cell-value")`：记录 CellValue 构造
- `lark_get_skill(domain="base", section="field-json")`：字段 JSON 构造
- `lark_get_skill(domain="base", section="formula-field-guide")` / `lark_get_skill(domain="base", section="lookup-field-guide")`：公式与 lookup 字段
- `lark_get_skill(domain="base", section="field-create")` / `lark_get_skill(domain="base", section="field-update")`：字段创建/更新命令级补充
- `lark_get_skill(domain="base", section="record-upsert")` / `lark_get_skill(domain="base", section="record-batch-create")` / `lark_get_skill(domain="base", section="record-batch-update")` / `lark_get_skill(domain="base", section="record-history-list")`：记录写入 JSON 与历史返回解释
- `lark_get_skill(domain="base", section="view-set-filter")`：视图筛选 JSON
- `lark_get_skill(domain="base", section="form-detail")` / `lark_get_skill(domain="base", section="form-submit")` / `lark_get_skill(domain="base", section="form-questions-create")` / `lark_get_skill(domain="base", section="form-questions-update")`：表单详情、提交和复杂 JSON
- `lark_get_skill(domain="base", section="dashboard")` / `lark_get_skill(domain="base", section="dashboard-block-data-config")` / `lark_get_skill(domain="base", section="dashboard-block-get-data")`：仪表盘、组件配置与图表结果协议
- `lark_get_skill(domain="base", section="workflow-guide")` / `lark_get_skill(domain="base", section="workflow-schema")`：workflow 入口与 steps JSON SSOT
- `lark_get_skill(domain="base", section="role-guide")` / `lark_get_skill(domain="base", section="role-config")`：角色入口与权限 JSON SSOT

---
name: lark-base
description: "飞书多维表格（Base）操作：建表、字段、记录、视图、统计、公式/lookup、表单、仪表盘、应用模式（BaseApp/AppMode 页面与组件）、Workspace 目录、workflow、角色权限、模板中心（多维表格模板分类/列表/搜索）；遇到 Base/多维表格/bitable、BaseApp/AppMode、/base/ 或 /app/ 链接时使用。BaseApp 不走 lark-apps；文件导入/导出转 lark-drive，认证/授权由 MCP server 自动处理。"
---

# base

## 何时使用

使用本 skill：

- 用户明确提到 Base / 多维表格 / bitable，或给出 `/base/` 链接。
- 用户要在 Base 内建表、改表、管理字段、写记录、查记录、配视图。
- 用户要在 Base 内做公式字段、lookup 字段、跨表计算、派生指标、筛选聚合、TopN、统计分析。
- 用户要管理 Base 表单、仪表盘、workflow、高级权限或角色。
- 用户要用应用模式（BaseApp）：新建应用、管理应用页面、在页面上加图表/列表/富文本组件，或整理 Workspace 目录。
- 用户想"用一个现成模板快速搭一个多维表格"，但没有给出任何已有 Base 的锚点（无 URL、无"我的/最近访问的表"、无具体已存在的 Base 名）：走模板中心。
- 用户明确提到 BaseApp / AppMode / 应用模式 / Workspace 内应用，或给出应用模式的 `/app/` 链接（链接可能同时携带 `/base/workspace/<workspace_token>` 路径信息），并要查询页面或组件；这类应用属于 Base，不走 apps skill。
- 用户要把旧 Base 聚合式命令或旧写法迁移到当前 `lark_base_*` 工具。

不要使用本 skill：

- 只是认证、初始化配置、切换身份、处理 scope 或权限授权恢复（MCP server 自动处理认证）。
- 把本地文件导入成 Base，或将 Base 导出为本地文件，转 `lark_get_skill(domain="drive")`。
- 泛化数据分析、字段设计、公式讨论，但没有 Base/多维表格上下文。

## 使用边界

- BaseApp 复制是明确的停止边界：本期没有 BaseApp 复制工具。识别到复制 / 克隆应用模式的诉求后，直接说明当前工具集无法完成并停止，不要调用 `lark_base_base_copy()`、`lark_base_app_create()`、Drive copy 或任何写工具试探、拼装替代方案。
- Base 业务操作只使用 `lark_base_*` 工具，不使用旧聚合式命令。
- 执行 update 前必须先查当前工具的 schema（`lark_discover`）或对应 reference。若工具要求完整配置，首次请求必须基于可信的当前配置执行 read-modify-write：只修改用户明确指定的内容，保留其他仍适用的可写配置，并按工具要求的结构提交。若工具支持局部／delta update，按其契约提交最小合法 payload；不得以不完整请求试错补参。
- Base 工具当前不支持视图行高、冻结列、列宽等 UI-only 外观设置。遇到这类需求，说明能力边界并停止，不要猜测未文档化参数或改走 `lark_invoke` 裸 API。
- **高频：记录读写。** 普通预览、已知 `record_id` 读取、关键词搜索和小规模直接处理按下方「Record 核心路径」执行，不必先读 SOP。大表完整读取、`has_more=true`、View 范围读取、多表 JOIN、集合/多值运算、分组 Top-K、时序或统计推断时，先读 `lark_get_skill(domain="base", section="record-query-and-analysis-sop")`。
- **低频：在线复制。** 复制整个 Base 使用 `lark_base_base_copy()`，复制 Base 内单张数据表使用 `lark_base_table_copy()`。
- **更低频：文件导入/导出。** 本地文件与 Base 之间的导入/导出转 `lark_get_skill(domain="drive")`；具体格式、参数、路径限制和仅结构导出规则由 drive skill 负责，导入完成后再回到 Base 工具。
- 认证由 MCP server 自动处理；Base 文档只保留会影响 Base 路径选择的权限规则。

## 应用模式与 Workspace 心智模型

- Workspace 是组织 Base 和 BaseApp 的空间容器；BaseApp 创建时必须归属一个 Workspace，`workspace_token` 标识这个容器。
- BaseApp（应用模式）不是 Base 的别名。它用 Page 组织界面，每个 Page 再包含图表、列表或富文本 Block；`app_token`、`page_id`、`block_id` 分别标识这三层对象。
- Base 保存表、字段和记录等数据。BaseApp 的组件通过 `data_config` 引用 Base 中的数据，但引用关系不会把 Base 变成 App 的子对象。
- App 的列表组件最多引用一个 Base，而且该 Base 必须与 App 位于同一 Workspace；App 图表的多个数据源也共用一个 `base_token`。
- Workspace 负责资源归属，App 负责页面和组件，Base 负责数据。按操作对象选择 `lark_base_workspace_*`、`lark_base_app_*` 或 Base 数据工具，不要混用 token。

## 先获取 Base Token 和所需 ID

进入任何需要目标 Base 的工具前，必须先拿到可用的 `base_token`，以及当前任务需要的 `table_id` / `view_id` / `record_id` / `form_id` / `dashboard_id` / `workflow_id` 等真实 ID；不要把完整 URL、wiki token、workspace token 或孤立 raw token 直接当作 `base_token`。

- 用户输入 URL 或分享链接：先调用 `lark_base_url_resolve(url="<url>")`。Base URL 返回 `base_token` 和相关 ID；BaseApp `/app/` URL 返回 `app_token`，并在原链接携带时返回 `workspace_token` 和 `page_id`。
- 用户要查询既有 BaseApp，但当前输入和当前会话可信工具返回中都没有真实 `/app/` 链接或 `app_token`，也没有可供 `lark_base_workspace_entity_list(type="baseapp")` 定位的 `workspace_token`：无需调用任何工具；先明确说明当前任务没有提供应用链接或 Workspace 信息、无法可靠定位目标 BaseApp，再请用户补充并停止。不要在此前后调用 apps skill 的工具、`lark_base_title_resolve()`、Drive 搜索或其他全局名称发现，不要默认选择同名候选，也不要把 `base_token` 当作 `app_token`。
- Base/Wiki URL 的 `table=` query 参数实际表示当前选中的顶层 block，可能是数据表、仪表盘或 workflow；不要按参数名自行当成 `table_id`。以 `lark_base_url_resolve()` 返回的 `block_type` 以及 `table_id` / `dashboard_id` / `workflow_id` 为准；`selection_source=url_query` 只说明 URL 当前选中了该 block，不代表它覆盖用户明确点名的目标。若用户点名的 dashboard 与 `block_name` 不一致，先用 `lark_base_dashboard_list()` 按名称匹配；若只返回中性 `block_id`，按 hint 用 `lark_base_base_block_list()` 确认类型。
- 用户输入 Base 标题、关键词或不确定名称：先调用 `lark_base_title_resolve(title="<keyword>")`；`title` 传入标题中的短关键词，不超过 30 个字符；过长标题先取最有区分度的短关键词；多候选时先让用户消歧，不要猜。
- 用户要列出已有 Base 候选，且需要按最近访问、owner、创建人、时间、类型等维度筛选/排序：转 `lark_drive_search(doc_types="bitable")`。按标题/关键词定位单个 Base 仍用 `lark_base_title_resolve()`。常见候选列表写法：
  - 最近访问：`lark_drive_search(doc_types="bitable", sort="open_time", opened_since="3m", page_size="20")`
  - 只列我拥有的：加 `mine=true`；要列"我创建的"用 `created_by_me=true`。
  - 从候选项拿到 URL 或 token 后，再用 `lark_base_url_resolve()` 或 `lark_base_base_get()` 进入 Base 业务工具。
- 文档嵌入 Base 标签：直接读取 `<bitable>` / `<base_refer>` 的 `token` 作为 `base_token`，`table-id` 作为 `table_id`，`view-id` 作为 `view_id`；孤立 raw token 不走 `lark_base_url_resolve()`。
- 仍无法定位且用户不是要新建 Base 时，先反问用户要操作哪一个 Base；用户要新建时才用 `lark_base_base_create()`。

## Base 模板中心

模板中心是公开的 Base 模板库，不是用户云空间里的已有 Base。用户想用现成模板创建新 Base，且没有指向已有对象的锚点（没有 Base URL、没有"我的/最近访问的表"、没有具体已存在的 Base 名）时，先读 `lark_get_skill(domain="base", section="template-center")` 查找模板中心模板：`lark_base_template_categories()` 列出公开模板分类，`lark_base_template_list()` 按分类列出公开模板，`lark_base_template_search()` 按业务关键词搜索公开模板。选定模板后用 `lark_base_base_copy(base_token="<模板 token>")` 复制成用户自己的新 Base。

模板中心是独立的公开数据集，`lark_drive_search()` 搜不到它；用户要"我的/最近访问/已有 Base"不要走模板中心。

## 快速路由

| 用户目标 | 优先工具 | 何时读 reference |
|---|---|---|
| 查 Base 本体 | `lark_base_base_get()` | 用返回确认 Base 名称、owner、权限和可继续操作的 token |
| 创建/复制 Base | `lark_base_base_create()` / `lark_base_base_copy()` | 新建时强烈推荐用 `table_name` + `fields` 同时配置新 Base 里唯一一个初始数据表的 name 和 schema；写入后报告新 Base 标识和 `permission_grant` |
| Base 文件导入/导出 | 转 `lark_get_skill(domain="drive")` | 文件格式、参数、路径限制和仅结构导出规则由 drive skill 负责；在线复制走 `lark_base_base_copy()` |
| 找模板 / 用模板搭新 Base | `lark_base_template_categories()` / `lark_base_template_list()` / `lark_base_template_search()` → `lark_base_base_copy()` | 用户想用现成模板建新 Base 且没有已有 Base 锚点时先读 `lark_get_skill(domain="base", section="template-center")`；模板 `token` 是复制入参，`lark_drive_search()` 搜不到模板中心 |
| 列出已有 Base 候选 | `lark_drive_search(doc_types="bitable")` | 需要按最近访问、owner、创建人、时间维度筛选/排序时用它；按标题定位单个 Base 仍用 `lark_base_title_resolve()` |
| 查看 Base 内资源目录 | `lark_base_base_block_list()` | 想先了解一个 Base 里有哪些 table/docx/dashboard/workflow/folder 时优先用它；返回 ID 关系和 fewshot 看 `lark_discover(query="base.base-block.list")` |
| 管理 Base 内资源目录 | `lark_base_base_block_create/move/rename/delete` | 创建或整理 Base 直接管理的 folder/table/docx/dashboard/workflow；资源内容继续用对应工具 |
| 管理数据表 | `lark_base_table_list/get/create/update/delete` | 处理 table 的列出、详情、创建、重命名和删除；`lark_base_table_create()` 必须传 `fields` 一次性定义表结构，字段 JSON 读 `lark_get_skill(domain="base", section="field-schema")` |
| 复制 Base 内单张数据表 | `lark_base_table_copy()` / `lark_base_table_copy_status()` | 在线复制单张数据表；复制范围和异步任务参数查看工具 schema（`lark_discover(query="base.table-copy")`） |
| 列/查/删字段 | `lark_base_field_list/get/delete/search_options` | 写入前用 list/get 确认字段类型、选项、ID；删除前确认目标字段 |
| 创建/更新字段 | `lark_base_field_create()` / `lark_base_field_update()` | 同一表创建多个字段时，默认一次向 `lark_base_field_create()` 的 `json` 传字段对象数组；预计串行运行时间超过调用方超时时按时间预算拆分，不按固定条数切块；仅创建一个或多个只含 `name` + `type:text` 的简单字段时看工具 schema 即可，其他类型或属性必读 `lark_get_skill(domain="base", section="field-schema")`；公式读 `lark_get_skill(domain="base", section="field-formula")`，lookup 读 `lark_get_skill(domain="base", section="field-lookup")`；仍需逐项恢复或工具细节时读 `lark_get_skill(domain="base", section="field-create")`，更新细节读 `lark_get_skill(domain="base", section="field-update")` |
| 字段插件（LLM 生成单元格） | `lark_base_field_extension_get()` / `lark_base_field_extension_update()` / `lark_base_field_extension_update_cells()` | 让已有字段按同行其他字段内容触发 LLM 生成并写回；只能建在已有字段上，当前已确认目标字段支持文本、单选、数字。配置或触发前必读 `lark_get_skill(domain="base", section="field-extension")` |
| 按钮字段绑定 workflow | `lark_base_button_rule_bind()` / `lark_base_button_rule_get()` / `lark_base_button_rule_unbind()` | `button` 字段本身用 `lark_base_field_create()` 创建（`lark_get_skill(domain="base", section="field-schema")` 的 button 小节）；绑定关系单独用这组工具，不要把 `workflow_id` 塞进字段 JSON；`workflow_id` 必须是 workflow 工具返回的 `wkf` 公共 ID；绑定与 workflow 启停相互独立 |
| 读取已知记录 | `lark_base_record_get()` | 已知具体 `record_id` 时可以直接读取记录；`record_id` 是数组参数，可一次传多条 |
| 查询或分析数据表记录 | `lark_base_record_list()` / `lark_base_record_search()` | 字段名和目标已知的普通读取直接按「Record 核心路径」走；大表完整读取、View 范围、多表 JOIN、多值/时序/统计分析先读 `lark_get_skill(domain="base", section="record-query-and-analysis-sop")` |
| 解释、编写或排错 `lark_base_data_query` DSL | `lark_get_skill(domain="base", section="data-query")` | 它是超过 2000 行时单表基础统计的逃生路径；用户明确询问该工具或其 DSL 时也先由 SOP 确认口径和路径，再读取 DSL reference。其 DSL schema 与 record/view 查询不同，不要混用 |
| 写记录 | `lark_base_record_batch_create()` / `lark_base_record_batch_update()` | 外层 JSON 形状和 CellValue 见下方「Record 核心路径」；`select` 选项、人员/群组 ID 先用 `lark_base_field_list()` / `lark_contact_search_user()` / `lark_im_chat_search()` 确认 |
| 附件字段 | `lark_base_record_upload_attachment()` / `lark_base_record_download_attachment()` / `lark_base_record_remove_attachment()` | 使用附件操作工具上传本地文件系统中的文件，下载/删除按 file token 或字段定位 |
| 删除记录 / 分享记录链接 / 历史 | `lark_base_record_delete()` / `lark_base_record_share_link_create()` / `lark_base_record_history_list()` | 删除前确认 record；分享链接最多 100 条；历史读 `lark_get_skill(domain="base", section="record-history-list")`，只查单条记录，不做整表审计 |
| 管理视图 | `lark_base_view_*` | `lark_base_view_set_filter()` 读 `lark_get_skill(domain="base", section="view-set-filter")`（filter 条件结构见公共协议 `lark_get_skill(domain="base", section="filter-condition")`）；其余配置先 get 现状，再按返回结构更新 |
| 公式字段 | `lark_base_field_create(json='{"type":"formula",...}')` | 必读 `lark_get_skill(domain="base", section="field-formula")`，读后再加隐藏确认 flag `i_have_read_guide=true` |
| Lookup 字段 | `lark_base_field_create(json='{"type":"lookup",...}')` | 必读 `lark_get_skill(domain="base", section="field-lookup")`，读后再加隐藏确认 flag `i_have_read_guide=true` |
| 表单提交 | `lark_base_form_submit()` | 先读 `lark_get_skill(domain="base", section="form-detail")` 获取题目、filter 和附件所需 `base_token`；提交 JSON 读 `lark_get_skill(domain="base", section="form-submit")` |
| 表单题目创建/更新 | `lark_base_form_questions_create()` / `lark_base_form_questions_update()` | Base 内表单按 table 管理；先确定并复用真实 `table_id`。读 `lark_get_skill(domain="base", section="form-questions-create")` / `lark_get_skill(domain="base", section="form-questions-update")`；题目显隐条件 `visible_rule` 结构见公共协议 `lark_get_skill(domain="base", section="filter-condition")` |
| Base 内表单管理 | `lark_base_form_list/get/create/update/delete` / `lark_base_form_questions_list/delete` | 缺少或不确定归属时，先用 `lark_base_table_list()` 或 `lark_base_base_block_list()` 取得真实 `table_id`；这些工具使用 `base_token` + `table_id` 并在整个工作流中复用同一 `table_id`，删除前确认目标表单 |
| 表单分享设置 | `lark_base_form_share_get()` / `lark_base_form_share_update()` | 管理表单启停、访问范围和匿名/登录要求；更新前先 get 现状，每次调用只改一个字段（`enabled` / `access_scope` / `allow_anonymous` / `require_login`），布尔值显式传 `true` 或 `false` |
| 分享表单详情 | `lark_base_form_detail(share_token="<share_token>")` | 使用表单分享链接里的 `share_token`；提交前读 `lark_get_skill(domain="base", section="form-detail")` |
| 仪表盘与组件 | `lark_base_dashboard_*` / `lark_base_dashboard_block_*` | 提到图表/看板/block 时先读 `lark_get_skill(domain="base", section="dashboard")`；组件 `data_config` 读 `lark_get_skill(domain="base", section="dashboard-block-config")`；读取一个或多个图表计算结果用 `lark_base_dashboard_block_get_data()`；读取完整仪表盘时按 block 类型分流，文本和不支持直接取数的图表按 reference 恢复 |
| 组件精确位置/大小 | `lark_base_dashboard_block_create(position=...)` / `lark_base_dashboard_block_update(position=...)` | 只有用户明确给出组件级 `x/y/w/h`、行列顺序或可换算尺寸时才用 `position`；泛化的"调整布局/美化/撑满"用 `lark_base_dashboard_arrange()`。规则读 `lark_get_skill(domain="base", section="dashboard")` |
| 仪表盘分享设置 | `lark_base_dashboard_share_get()` / `lark_base_dashboard_share_update()` | 管理仪表盘启停、访问范围和返回源 Base 入口；更新前先 get 现状，每次调用只改一个字段（`enabled` / `access_scope` / `show_source`），显式 `false` 会被保留 |
| 查询 BaseApp 与关联 Base | `lark_base_url_resolve()` → `lark_base_app_get()` → `lark_base_base_get()` | 只把 `/app/` URL 传给 `lark_base_url_resolve()`，不要把 `/base/workspace/` URL 传给它；用 `lark_base_app_get()` 返回 `ref` 的 key 作为 `base_token` 再调用 `lark_base_base_get()`。最终答复忠实保留应用 `name` / `app_token`，以及每个关联 Base 的 `name` / `base_token` |
| 管理应用模式（BaseApp/AppMode）页面与组件 | `lark_base_app_page_*` / `lark_base_app_block_*` | BaseApp/AppMode、Workspace 内应用或带 base/workspace 上下文的 `/app/` 链接直接走本路由，不走 apps skill；没有 app-list 工具，列 Workspace 内应用必须用 `lark_base_workspace_entity_list(workspace_token="<token>", type="baseapp")`；先读 `lark_get_skill(domain="base", section="app")`。组件 `data_config` 读 `lark_get_skill(domain="base", section="app-block-data-config")`；`lark_base_app_block_get_data()` 除 `app_token` 外还需要图表数据源的 `base_token` |
| 复制 Page / 设置页面图标 | 当前不支持 | 不产生任何写入，不得用 `lark_base_app_page_create()` 冒充完整复制；单独说明"可新建空 Page"仅是替代能力，须等用户明确要求后再执行 |
| Workspace 目录 | `lark_base_workspace_create()` / `lark_base_workspace_entity_list()` / `lark_base_workspace_move_in()` | 新建 Workspace、列出或移入其中的 Base/应用；移出或移除请求必须先用 `lark_base_workspace_entity_list()` 只读定位并忠实报告实际名称，再按 `lark_get_skill(domain="base", section="app")` 说明不支持并停止；`lark_drive_move()` 不改变 Workspace 归属 |
| Workflow | `lark_base_workflow_*` | 创建/更新或理解 steps 时读入口 `lark_get_skill(domain="base", section="workflow")` 和 steps JSON SSOT `lark_get_skill(domain="base", section="workflow-schema")`；list/get/enable/disable 只处理 workflow ID 与启停状态 |
| 高级权限与角色 | `lark_base_advperm_*` / `lark_base_role_*` | 角色操作先读入口 `lark_get_skill(domain="base", section="advanced-permission-and-role")`；角色 create/update 或解读完整配置再读权限 JSON SSOT `lark_get_skill(domain="base", section="role-config")`；关闭高级权限会影响自定义角色 |

## Record 核心路径

先用 `lark_base_table_list()` 定位 Table。字段名和目标已知的普通读取可以直接进入 Record 工具；只有写入、筛选或关联等依赖字段类型/schema 的任务才补 `lark_base_field_list()`（多表可并发读取）。基础的 Record 与 CellValue 读写按本节执行，reference 只承载高级分析、完整协议和边界细节。

### 1. 读取记录或单元格

- 已知若干个 `record_id`：`lark_base_record_get(base_token="<base_token>", table_id="<table_id>", record_id=["<id1>", "<id2>"])`
- 关键词搜索：`lark_base_record_search(base_token="<base_token>", table_id="<table_id>", keyword="<text>", search_field=["<field>"])`；至少指定一个搜索字段。
- 其余读取：`lark_base_record_list()`；结构化条件和排序分别用 `filter_json` / `sort_json`。

`record_id`、`field_id`、`search_field` 都是数组参数，一个元素一个值；写成逗号拼接的字符串会被静默丢弃。

行数较大、需要服务端谓词下推时，`filter_json` 使用 tuple condition；最常用的筛选与完整日期范围写法：

```jsonc
{
  "logic": "and", // 全部条件成立；任一条件成立改为 "or"
  "conditions": [
    ["状态", "intersects", ["进行中", "暂停"]], // Select 命中任一选项
    ["标题", "intersects", "urgent"], // 文本包含
    ["备注", "non_empty"], // 非空；判断为空改用 "empty"，两者都不传 value
    ["金额", ">=", 100], // 数字比较；支持 ==、!=、>、>=、<、<=
    ["关联项目", "intersects", [{ "id": "recxxx" }]], // Link 包含目标记录
    ["业务日期", "==", "ExactDate(2026-08-07)"], // 具体一天：按 Base 时区匹配 2026-08-07 当天
    ["发生时间", ">", "ExactDate(2024-01-31 23:59:59.999)"], // 日期不支持 >=；用 > 前一天最后一毫秒表达含当天的下界
    ["发生时间", "<", "ExactDate(2024-03-01 00:00:00)"] // 2024 年 2 月范围上界：小于 3 月 1 日零点
  ]
}
```

完整操作符和各字段取值结构读 `lark_get_skill(domain="base", section="filter-condition")`。

所有读取都用数组形式的 `field_id` 做最小字段投影。`limit` 上限取决于 `format`：`format="ndjson"` 缺省和上限都是 2000，`format="json"`（唯一能把记录本体交到 agent 手上的通道）上限是 200、缺省 100；支持 `offset`；只有 `has_more=false` 且查询范围符合问题时，才能当作完整结果。大表完整读取、View 范围读取、复杂 JOIN、集合/多值、时序、语义或专业统计分析时，读 `lark_get_skill(domain="base", section="record-query-and-analysis-sop")`——该 SOP 也说明 MCP 下 NDJSON artifact 不可读回、记录本体只能靠 `format="json"` 读入上下文的执行通道。

### 2. 新增记录或更新记录单元格

一条 Record 是 `{字段名或 field_id: CellValue}`，常见 CellValue：

```jsonc
{
  "标题": "Created from shortcut", // text: string
  "官网": "[官网](https://example.com)", // text(url): 裸 URL 或 Markdown link
  "联系电话": "13800000000", // text(phone): 合法电话号码字符串
  "邮箱": "owner@example.com", // text(email): 合法邮箱字符串
  "单选": ["Todo"], // select: array<string>；单选时数组最多一个值；
  "标签": ["高优", "外部依赖"], // 多选 select: array<string>；必须是当前字段存在的选项；
  "工时": 8, // number: double，不经过格式化的纯数字
  "带时区时间": "2026-03-24T10:00:00+08:00", // datetime：带时区，遵循传入的时区
  "不带时区时间": "2026-03-24 10:00", // datetime：不带时区，自动按当前 Base 时区转换
  "毫秒时间戳": 1774317600000, // datetime：也支持 Unix 毫秒时间戳
  "已完成": false, // checkbox: boolean
  "负责人": [{ "id": "ou_123" }], // user(multiple=false): 数组最多一个元素
  "协作人": [{ "id": "ou_123" }, { "id": "ou_456" }], // user(multiple=true): 数组可包含多个元素
  "群聊": [{ "id": "oc_123" }, { "id": "oc_456" }], // group_chat(multiple=true)
  "关联任务": [{ "id": "rec456" }], // link: array<{id}>，record_id 来自目标表
  "坐标": { "lng": 116.397428, "lat": 39.90923 }, // location: {lng,lat}
  "清空": null, // 清空单元格，传 null
  "清空数组": [] // 清空数组类单元格，空数组和 null 都可以
}
```

附件使用专用附件工具上传、下载或移除。`created_at`、`updated_at`、`created_by`、`updated_by`、`auto_number`、`formula`、`lookup` 类型字段只读，若误写入单元格会返回 `ignored_fields` 表示这些字段被静默过滤，其余字段正常写入。

```
# 新增：成功时返回 record_id_list
lark_base_record_batch_create(base_token="<base_token>", table_id="<table_id>", json='{"create_records":[{"Name":"Task A","Status":["Todo"]},{"Name":"Task B","Score":20}]}')

# 更新：每条记录只提交要改变的字段
lark_base_record_batch_update(base_token="<base_token>", table_id="<table_id>", json='{"update_records":{"<record_id_a>":{"Status":["Done"]},"<record_id_b>":{"Score":100}}}')
```

单批最多 200 条，超过后分批，同一 Table 串行写入；并行可能触发 `1254291` 并发冲突错误。人员 `id` 不确定时先用 `lark_contact_search_user()` 查，群 `id` 不确定时先用 `lark_im_chat_search()` 查，不要猜 ID。

### 3. 其他 Record 操作

- `lark_base_record_delete(base_token="<base_token>", table_id="<table_id>", record_id=["<id1>", "<id2>"], _confirm=true)` 删除若干个记录
- `lark_base_record_share_link_create(base_token="<base_token>", table_id="<table_id>", record_id="<id1>,<id2>")` 创建记录分享链接
- `lark_base_record_history_list()` 查询单条记录的变更事件，读 `lark_get_skill(domain="base", section="record-history-list")`
- 附件必须使用 `lark_base_record_upload_attachment()` / `lark_base_record_download_attachment()` / `lark_base_record_remove_attachment()` 操作

## Base 心智模型

- Base 曾用名 Bitable；返回字段、错误或旧文档里的 `bitable` 多为历史兼容，不代表应改走裸 API 或另一套命令。
- `lark_base_base_block_list()` 是查看一个 Base 内资源目录的新入口：它列出这个 Base 直接管理的 `folder/table/docx/dashboard/workflow`，适合先判断 Base 里有什么，再决定走 table、dashboard、workflow 或 docx 工具。
- `lark_base_base_block_*` 只负责资源目录管理，包括创建资源、移动到 folder、重命名和删除；具体资源内容仍走 table/dashboard/workflow 工具。
- 新建 Base 时，强烈推荐一次性执行 `lark_base_base_create(name="<base>", table_name="<table>", fields='<field-json-array>')`，同时配置新 Base 里唯一一个初始数据表的 name 和 schema；使用 `fields` 前先读 `lark_get_skill(domain="base", section="field-schema")` 或复用 `lark_base_field_create()` 的字段 JSON 形状，不要猜字段属性。
- `lark_base_base_create()` 不传 `table_name` 和 `fields` 时，会创建一个默认 schema 的初始数据表。
- `lark_base_table_copy()` 用于在线复制 Base 内的数据表，`table_id` 可使用当前 Base 中的表 ID 或表名；复制范围等参数查看工具 schema。
- `lark_base_table_copy(wait=true)` 会阻塞等待复制任务完成；调用超时或中断后不要重新提交复制，先用返回或上一次结果里的 `task_id` 执行 `lark_base_table_copy_status(task_id="<TASK_ID>")` 续查。
- 表、字段、视图、workflow、dashboard block 的名称和 ID 必须来自真实返回，不要凭用户口述猜。
- `formula` 适合常规计算、条件判断、文本/日期处理和长期派生指标；`lookup` 适合明确的跨表查找、筛选后取值或聚合引用。
- 写入、公式、lookup、workflow、dashboard 前，先读取真实结构：表、字段、视图、关联表和 dashboard block 名称都以工具返回为准。

## 身份与权限

MCP server 自动使用用户身份执行所有 Base 操作（authentication is handled automatically by the MCP server）。

如果操作返回权限错误，直接告知用户权限不足，建议用户在飞书开发者后台确认资源访问权限。

## 写入前置规则

- 优先用写入返回确认结果；返回信息不足或任务明确要求核验时，再读回。
- 严格区分动作语义：用户要求"新增/创建"时，必须用本轮 create 返回的对象、ID 或数量确认完成，不能把已有资源算作本轮新增；目标已存在时按具体工具或 guide 的同名契约处理，不得自行改写用户语义。复合创建任务对每类资源只做一次必要盘点；只有工具明确返回逐项结果时才优先使用批量创建，并继续配置本轮返回的 ID。
- 写记录前先读字段结构；只写存储字段。系统字段、附件字段、`formula`、`lookup` 不作为普通记录写入目标。
- 附件上传、下载、删除走专用 `lark_base_record_*_attachment` 命令。
- 除上述简单 text fast path 外，写字段前先读 `lark_get_skill(domain="base", section="field-schema")`；请求字段类型不在 reference 已支持类型目录中时，说明当前工具不支持并停止，不要猜测未注册的字段 JSON 或 schema，也不要用其他字段类型冒充；涉及 `formula` / `lookup` 时必须读 `lark_get_skill(domain="base", section="field-formula")` / `lark_get_skill(domain="base", section="field-lookup")`。
- 表名、字段名、视图名、workflow 配置中的名称必须来自真实返回；跨表场景还要读取目标表结构。
- 删除、角色更新、字段更新、表单提交（`lark_base_form_submit()`）等高风险操作遵循 confirmation gate（`_confirm=true`）；目标不明确时先用 get/list 消歧。
- 真正的 batch 写工具遵守各自文档的单批上限；`lark_base_field_create()` 的字段数组是顺序单项请求，按调用方超时而非固定条数拆分；连续写同一表时串行执行，遇到 `1254291` 按短暂等待后重试处理。
- 字段插件（`lark_base_field_extension_*`）只改已有字段的自动生成配置，不创建也不修改列 schema；建列仍用 `lark_base_field_create()`，改类型/选项/名称仍用 `lark_base_field_update()`。
- `select` 字段只支持写入字段中已有的选项；构造 CellValue 前先用 `lark_base_field_list()` 或 `lark_base_field_search_options()` 确认目标选项存在。

## 表单与视图细节

- Base 内表单 list/get/create/update/delete 和题目管理都属于具体数据表：第一个管理工具调用前必须已有归属明确的真实 `table_id`；缺失或归属不明确时才用 `lark_base_table_list()` 或 `lark_base_base_block_list()` 定位，已有真实 ID 时直接复用。后续管理调用始终传同一 `base_token` + `table_id`。
- 表单问题由数据表字段承载，question `id` 就是 `field_id`。创建问题前先 `lark_base_form_questions_list()`；除非用户明确要求同名的独立问题，否则标题已存在时优先用 `lark_base_form_questions_update()` 修改必填状态、标题或描述，不要先创建同名问题再删除旧问题。
- `lark_base_form_questions_create()` 支持两种形态：新建字段题目需要 `title` + `type`；已有字段题目需要 `use_existing_field:true` + `field_id`。已有字段题目只是把该字段加入表单，不创建新字段，也不改变已有记录数据；不要给该形态携带 `type`、`style`、`options` 等字段定义属性。要把表里已有字段加进表单时，先用 `lark_base_field_list()` 确认真实字段 ID 和类型。
- `lark_base_form_questions_delete()` 是高风险写操作，默认会删除承载问题的底层字段及该字段所有记录数据；只想把题目移出表单并保留字段/数据时必须传 `keep_field=true`。保留字段后可用 `lark_base_form_questions_create(questions='[{"use_existing_field":true,"field_id":"<field_id>"}]')` 加回表单。主字段问题不能删除，用 `lark_base_form_questions_update()` 修改。
- 表单分享启停、访问范围和匿名/登录要求用 `lark_base_form_share_get()` / `lark_base_form_share_update()` 管理；更新前先读现状，每次调用只修改一个字段，布尔值显式传 `true` 或 `false`。
- `lark_base_form_submit()` 是高风险写操作，必须带 `_confirm=true` 确认；调用前必须先跑 `lark_base_form_detail()`，读取 `questions[].type`、`required`、`filter` 和附件场景需要的 `base_token`；不要填写被 filter 隐藏的问题。
- `lark_base_form_questions_update()` 是题目配置全量覆盖，不是 patch；未传字段会回落默认值，传空字符串 / `null` / 空数组会直接写入空或清空。更新前先 `lark_base_form_questions_list()` 读取当前题目，把要保留的 `title` / `description` / `required` / `option_display_mode` / `visible_rule` 等字段带回请求。
- 表单附件不要写进 `fields`，放在 `json` 的 `attachments` 中；提交附件时必须同时传表单所属 Base 的 `base_token`。
- `lark_base_view_set_filter()` 是唯一保留的 view reference；sort/group/card/timebar/visible-fields 这类配置先用对应 get 命令读现状，保留未修改字段，只替换用户要求变更的配置。
- 视图适合持久化、共享和 UI 复用；一次性筛选/排序可先用 `lark_base_record_list()` / `lark_base_record_search()` 的 filter/sort 验证结果，再按需要沉淀为持久视图。

## Dashboard / Workflow / Role

- Dashboard 的复杂点是 block 的 `data_config`，不是 list/get/create/delete 命令参数。创建或更新 block 前先读 `lark_get_skill(domain="base", section="dashboard-block-config")`，组件必须串行创建；`lark_base_dashboard_arrange()` 是服务端智能整盘编排，用户没有给出组件级坐标或尺寸时，用它做重排、美化、撑满这类诉求，或对本次会话从零新建的仪表盘做一次收尾整理。`lark_base_dashboard_block_get_data()` 读取图表最终计算结果，不返回 block 名称、类型、布局或 `data_config`；需要元数据先用 `lark_base_dashboard_block_get()`。用户要求"全部/完整"仪表盘内容时不得跳过 text 或不支持直接取数的 block，按 `lark_get_skill(domain="base", section="dashboard")` 的完整读取分支恢复。
- 组件精确布局用 `lark_base_dashboard_block_create()` / `lark_base_dashboard_block_update()` 的可选 `position`（12 列栅格 `{"x","y","w","h"}`，四个 key 必须齐全且为数字，整体提交不做逐字段合并）。只有用户明确给出组件级坐标、行列顺序、每个组件宽高或可直接换算的尺寸比例时才用 `position`；"调整布局""美化""撑满""铺满"本身不算精确约束，这类诉求用一次 `lark_base_dashboard_arrange()` 整盘编排。坐标取值不做本地校验，越界或重叠会由服务端自动重排，所以调用方应自己规划 12 列内不重叠的坐标。任一组件用了显式 `position` 时不要再 arrange，除非用户明确同意放弃精确布局。不要改用 `lark_invoke` 探测裸 API、源码或未公开布局参数。
- `statistics` 指标卡可在 `data_config.number_format` 里设 `formatName`（`digital` / `digital_without_separator` / `percentage_rounded` / `cyn_rounded` / `dollar_rounded`，区分大小写）和 `precision`（0-9 整数）。create 会按组件类型本地校验；update 不接收 `type`，只校验 `number_format` 子字段，再由服务端结合现有 block 类型裁决。`number_format` 是 `data_config` 顶层 key merge 的例外，按子字段合并。枚举与模板读 `lark_get_skill(domain="base", section="dashboard-block-config")`。
- 仪表盘分享启停、访问范围和返回源 Base 入口用 `lark_base_dashboard_share_get()` / `lark_base_dashboard_share_update()` 管理；更新前先读现状，每次调用只修改一个字段，显式 `false` 会被保留。
- 创建接口成功返回即表示写入成功；只有结果不确定时才额外执行一次 `lark_base_dashboard_get()` 或 `lark_base_dashboard_block_list()`。不要仅为确认创建而逐组件调用 `lark_base_dashboard_block_get_data()`。
- 用户要读取多个组件的计算结果时，先完整列出组件（`lark_base_dashboard_block_list(base_token="xxx", dashboard_id="blk_xxx", page_size="100")`；若 `has_more=true`，继续把返回的 `page_token` 传给 `page_token` 参数，直到 `has_more=false`），再按 `lark_get_skill(domain="base", section="dashboard-block-get-data")` 在同一轮里连续串行调用，逐个读取；不要把每个 block 拆成独立模型轮次。
- BaseApp（应用模式）把 Base 数据组织成页面和组件。`lark_base_app_create()` 是只创建 App 的原子工具，必须传目标 `workspace_token`；Workspace 选择以及是否创建备用 Base 由 `lark_get_skill(domain="base", section="app")` 的自然语言流程编排。应用查询使用 `lark_base_app_get()`，页面使用 `lark_base_app_page_*`。页面工具使用 `app_token`，组件工具使用 `app_token` + `page_id`；表、字段和记录工具使用 `base_token`。`lark_base_app_block_get_data()` 是组件工具中的例外：使用 `app_token` + `base_token` + `chart_token`，其中 `base_token` 来自该图表的 `data_config.base_token`，`chart_token` 通过 `block_id` 传入。不要把组件的普通 `block_id` 传给该工具。同一 Page 内组件名称必须唯一；列表使用 `type="list"` + `sub_type`，每个列表至多一个同 Workspace Base。组件配置详见 `lark_get_skill(domain="base", section="app-block-data-config")`。
- `lark_base_app_block_list()` 返回 `type=unsupported` 时，只能报告该组件存在且当前不支持读取或修改；不得继续调用 `lark_base_app_block_get()`、`lark_base_app_block_get_data()` 或 `lark_base_app_block_update()`，这些请求会报错。
- `lark_base_app_page_list()` 返回的 Page 若 `name=""`，表示当前用户对该 Page 无权限，不是无标题页面；报告该权限状态，不要将其作为后续页面或组件操作的目标。
- 复用现有 BaseApp block 的 `data_config` 只能作为结构模板，首次 Create/Update 前仍要逐项对齐用户显式要求；用户要求排序时必须显式写 `group_by[].sort.order` 或顶层 `sort.order`，不能用旧配置省略的方向或当前 get-data 结果顺序代替。
- 本期不支持 Page 复制和页面图标。识别到任一需求后不得产生写入，也不得调用 `lark_base_app_page_create()` 冒充完整复制。最终答复先明确"不支持且未执行写入"，再单独总结替代能力："当前可以新建空 Page，但不会复制原 Page 的内容、组件或图标；如需新建，请另行明确要求。"在用户后续明确要求前，不得执行该替代方案。
- 应用页面的 block 与仪表盘的 block 是同一套底层实体，但 ID 体系不通用：`lark_base_app_block_*` 的 `block_id` 不要拿去打 `lark_base_dashboard_block_*`，反之亦然。图表类 `data_config` 两边同构，列表类和富文本是应用模式独有。
- Workflow 的复杂点是 `steps` 结构。创建、更新或解释完整 workflow 时读入口 `lark_get_skill(domain="base", section="workflow")` 和 steps JSON SSOT `lark_get_skill(domain="base", section="workflow-schema")`；enable/disable/list 只需确认 workflow ID、当前启停状态和用户意图。
- Role 的复杂点是权限 JSON。角色操作先读入口 `lark_get_skill(domain="base", section="advanced-permission-and-role")`；`lark_base_role_create()` 只支持自定义角色；`lark_base_role_update()` 是 delta merge；角色 create/update 或解读完整配置时读权限 JSON SSOT `lark_get_skill(domain="base", section="role-config")`。`lark_base_role_delete()` 只适用于自定义角色，系统角色不可删除；删除角色和关闭高级权限前必须确认目标和影响。

## 常见恢复

| 错误 / 现象 | 恢复动作 |
|---|---|
| `param baseToken is invalid` / `base_token invalid` | 检查是否把 wiki token、workspace token 或完整 URL 当成了 `base_token`；按入口规则重新获取真实 `base_token` |
| `not found` 且输入来自 Wiki 链接 | 优先检查是否把 wiki token 当成 base token，不要立刻改走裸 API |
| `1254045` 字段名不存在 | 重新 `lark_base_field_list()`，使用真实字段名或字段 ID；注意空格、大小写和跨表字段 |
| `1254015` 字段值类型不匹配 | 先 `lark_base_field_list()`，再按「Record 核心路径」的 CellValue 写法构造值 |
| `Invalid discriminator value`（字段写入缺 `type`） | 按完整提交规则读取当前字段，只改目标内容后提交；不要只补 `type` 重试 |
| filter 报 `value of type array` / `Only string values` | 用 record/view 的 tuple `filter_json`（非 `lark_base_data_query` 对象型），value 按字段 type 选标量或数组；见 `lark_get_skill(domain="base", section="view-set-filter")` |
| 日期 / 人员 / 超链接字段报格式错误 | 日期用 `YYYY-MM-DD HH:mm`；人员用 `[{ "id": "ou_xxx" }]`；超链接用 URL 或 markdown link 字符串 |
| formula / lookup 创建失败 | 先读 `lark_get_skill(domain="base", section="field-formula")` / `lark_get_skill(domain="base", section="field-lookup")`，再按 guide 重建请求 |
| `ignored_fields` / `READONLY` | 移除只读字段，只写存储字段 |
| `1254104` | 批量超过 200，分批调用 |
| `1254291` | 并发写冲突，串行写入并在批次间短暂等待 |

## 保留 Reference

- `lark_get_skill(domain="base", section="record-query-and-analysis-sop")`：Base 数据语义与专业分析 SOP——大表完整读取、View 范围、多表 JOIN、集合/多值、时序与统计推断的口径与完整性约束，以及 MCP 下的 NDJSON 执行通道
- `lark_get_skill(domain="base", section="data-query")`：SOP 选定 `lark_base_data_query()` 后读取 fewshot 与完整 DSL 协议；其 `filters` 使用独立对象 DSL，与 record/view 的 tuple filter 不同
- `lark_get_skill(domain="base", section="field-schema")`：字段 JSON 构造
- `lark_get_skill(domain="base", section="field-formula")` / `lark_get_skill(domain="base", section="field-lookup")`：公式与 lookup 字段
- `lark_get_skill(domain="base", section="field-create")` / `lark_get_skill(domain="base", section="field-update")`：字段创建/更新工具级补充
- `lark_get_skill(domain="base", section="field-extension")`：字段插件配置、prompt 结构与单元格更新任务
- `lark_get_skill(domain="base", section="record-history-list")`：单条记录历史返回解释
- `lark_get_skill(domain="base", section="view-set-filter")`：视图筛选 JSON
- `lark_get_skill(domain="base", section="filter-condition")`：视图 filter、记录 `filter_json`、表单 `visible_rule` 的 tuple 条件结构公共协议 SSOT
- `lark_get_skill(domain="base", section="form-detail")` / `lark_get_skill(domain="base", section="form-submit")` / `lark_get_skill(domain="base", section="form-questions-create")` / `lark_get_skill(domain="base", section="form-questions-update")`：表单详情、提交和复杂 JSON
- `lark_get_skill(domain="base", section="template-center")`：模板中心分类/列表/搜索，以及用模板 token 复制成新 Base
- `lark_get_skill(domain="base", section="dashboard")` / `lark_get_skill(domain="base", section="dashboard-block-config")` / `lark_get_skill(domain="base", section="dashboard-block-get-data")`：仪表盘、组件配置与图表结果协议
- `lark_get_skill(domain="base", section="app")` / `lark_get_skill(domain="base", section="app-block-data-config")`：应用模式（Workspace / 应用 / 页面 / 组件）入口与组件配置 SSOT
- `lark_get_skill(domain="base", section="workflow")` / `lark_get_skill(domain="base", section="workflow-schema")`：workflow 入口与 steps JSON SSOT
- `lark_get_skill(domain="base", section="advanced-permission-and-role")` / `lark_get_skill(domain="base", section="role-config")`：角色入口与权限 JSON SSOT

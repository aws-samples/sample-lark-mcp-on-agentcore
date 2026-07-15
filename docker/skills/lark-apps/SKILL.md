---
name: lark-apps
description: "妙搭（Spark/Miaoda）应用开发与托管：应用创建、HTML静态站点发布、本地全栈开发、云端生成迭代、AI相关能力和飞书平台能力或者其他外部能力集成、日志/Trace/监控指标/PV/UV 查询、环境变量管理。当用户要开发/新建一个系统·工具·平台·应用，或要本地开发 / 云端开发 / 修改 / 部署 / 发布 / 上线 / 拿可分享链接，或用 HTML 做页面·网站·部署到妙搭，或提到妙搭/Spark/Miaoda（应用运行时域名形如 *.aiforce.cloud）、应用数据库、应用文件存储、开放 API Key、可见范围、线上日志、接口请求量、错误量、延迟、访问量、环境变量时使用。不负责普通云盘文件上传（lark-drive）、飞书文档编辑（lark-doc）、原生幻灯片创建（lark-slides）。"
---

# apps (v1)

妙搭应用属于用户资产（MCP server 自动处理认证、scope、高风险确认、`_notice` 等通用处理，不要在本 skill 里复制）。妙搭应用有三条开发路径：**本地全栈**（拉源码本地写）/ **HTML 托管**（发布静态产物）/ **云端会话**（妙搭 AI 生成）。

## 意图路由

按具体操作查命令（开发路径先用下方「选择开发路径」判定表定好再进来取命令）：

| 用户意图 | 先用 | 按需读取 |
|---|---|---|
| 创建**新**应用资产、拿 app_id | `lark_apps_create` | `lark_get_skill(domain="apps", section="create")` |
| 找已有 app_id、按名字过滤应用 | `lark_apps_list(keyword="<name>")` | `lark_get_skill(domain="apps", section="list")` |
| 查单个应用详情（类型、名称、发布状态等） | `lark_apps_get(app_id="<app_id>")` | `lark_get_skill(domain="apps", section="get")` |
| 改应用名或描述 | `lark_apps_update` | `lark_get_skill(domain="apps", section="update")` |
| 发布本地 `index.html` 或静态目录为可访问 URL | `lark_apps_html_publish` | `lark_get_skill(domain="apps", section="html-publish")` |
| 开发已有应用 / 初始化本地仓库（开发方式已定为本地后；先解析 app_id，勿 `lark_apps_create` 新建） | `lark_apps_init`（或手动 `lark_apps_git_credential_init` + 原生 git）。**执行前必读** `lark_get_skill(domain="apps", section="local-dev")`，含端到端流程和领域规则 | `lark_get_skill(domain="apps", section="init")`、`lark_get_skill(domain="apps", section="git-credential")` |
| 本地开发时 `.env.local` 损坏/丢失，重新拉取启动期环境变量 | `lark_apps_env_pull` | `lark_get_skill(domain="apps", section="env-pull")` |
| 管理应用环境变量（查看/设置/删除） | `lark_apps_env_list`、`lark_apps_env_set`、`lark_apps_env_delete` | `lark_get_skill(domain="apps", section="env")` |
| 查线上日志、Trace、请求数、错误率、延迟、CPU、memory、PV/UV/访问量 | `lark_apps_log_list`、`lark_apps_log_get`、`lark_apps_trace_list`、`lark_apps_trace_get`、`lark_apps_metric_list`、`lark_apps_analytics_list` | `lark_get_skill(domain="apps", section="observability")` |
| 看表 / 看结构 / 初始化多环境 / 导入导出数据 / 变更追溯 / 行级审计 / dev→online 发布 / 时间点恢复 / 查 DB 用量 | `lark_apps_db_table_list`、`lark_apps_db_table_get`、`lark_apps_db_env_create`、`lark_apps_db_data_export` / `lark_apps_db_data_import`、`lark_apps_db_changelog_list`、`lark_apps_db_audit_status` / `lark_apps_db_audit_enable` / `lark_apps_db_audit_disable` / `lark_apps_db_audit_list`、`lark_apps_db_env_diff` / `lark_apps_db_env_migrate`、`lark_apps_db_recovery_diff` / `lark_apps_db_recovery_apply`、`lark_apps_db_quota_get` | `lark_get_skill(domain="apps", section="db")` |
| 逐条执行 SQL（SELECT / DML / DDL） | `lark_apps_db_execute` | `lark_get_skill(domain="apps", section="db-execute")` |
| 管理应用文件存储：上传/下载本地文件、列出/查看/删除已存文件、生成临时分享链接、查存储用量 | `lark_apps_file_upload` / `lark_apps_file_download` / `lark_apps_file_list` / `lark_apps_file_get` / `lark_apps_file_sign` / `lark_apps_file_delete` / `lark_apps_file_quota_get` | `lark_get_skill(domain="apps", section="file")` |
| **部署/上线全栈应用**（"部署""上线""推上去并部署""发布到云端"）；查发布状态/历史 | `lark_apps_release_create`（部署上线动作）、`lark_apps_release_get`（轮询发布结果，finished 给 online_url / failed 给 error_logs）、`lark_apps_release_list` | `lark_get_skill(domain="apps", section="release-create")`、`lark_get_skill(domain="apps", section="release-get")`、`lark_get_skill(domain="apps", section="release-list")` |
| 设置或查看运行时可见范围 | `lark_apps_access_scope_set`、`lark_apps_access_scope_get` | `lark_get_skill(domain="apps", section="access-scope-set")`、`lark_get_skill(domain="apps", section="access-scope-get")` |
| 云端 Agent 生成/迭代应用（开发方式已定为云端后） | `lark_apps_session_create` -> `lark_apps_chat` -> `lark_apps_session_get` | `lark_get_skill(domain="apps", section="cloud-dev")` |
| 管理妙搭应用开放 API Key（创建/查看/启停/重置/删除凭证；密钥仅 create/reset 一次性返回） | `lark_apps_openapi_key_list` / `lark_apps_openapi_key_get` / `lark_apps_openapi_key_create` / `lark_apps_openapi_key_update` / `lark_apps_openapi_key_enable` / `lark_apps_openapi_key_disable` / `lark_apps_openapi_key_delete` / `lark_apps_openapi_key_reset` | `lark_get_skill(domain="apps", section="openapi-key")` |
| 查看某次会话某一轮（turn）的回复消息（含仍在生成中的本轮）/ 导出上一轮模型回复（"这一轮回复了什么""上一轮的回复""导出某轮消息"） | 先 `lark_apps_session_get`（取 `latest_turn.turn_id`）-> `lark_apps_session_messages_list(turn_id="<id>")`（仅 user 身份；分页用 `page_token`） | `lark_get_skill(domain="apps", section="session-messages-list")` |
| 外部能力(AI模型能力和飞书平台能力)集成/插件/Plugin/Capability | `lark_apps_plugin_install`、`lark_apps_plugin_list`、`lark_apps_plugin_uninstall` | `lark_get_skill(domain="apps", section="plugin-install")`、`lark_get_skill(domain="apps", section="plugin-uninstall")`、`lark_get_skill(domain="apps", section="plugin-list")` |

## 高频路径

- **性能/监控/观测指标**：用户问“接口请求量、错误量、错误率、接口慢、延迟、CPU、内存、最近一小时/七天趋势”时，不要去当前工作区搜索监控文件，也不要询问“监控数据在哪”。先按「app_id 获取」解析应用：`lark_apps_list(keyword="<应用名>")`；拿到 `app_id` 后读 `lark_get_skill(domain="apps", section="observability")`，用 `lark_apps_metric_list`。
- **请求量 + 错误量 + 延迟**：请求量/错误量用 `lark_apps_metric_list(app_id="<app_id>", metric="requests", since="<range>")`（不传 `series` 会同时返回 total/error）；延迟用 `metric="latency"`（不传 `series` 会返回 p50/p99）。如果用户给了具体接口，再加 `api="<path-or-name>"`；不要臆造 group-by 参数。
- **PV/UV/访问量/活跃用户**：先解析 `app_id`，再用 `lark_apps_analytics_list`，不要误用 `lark_apps_metric_list`。
- **设置环境变量**：如果用户只给应用名，仍先 `lark_apps_list(keyword=...)` 解析 app_id；设置 online 环境且用户已经明确说“确认/直接执行”时，调用 `lark_apps_env_set(environment="online", ..., _confirm=true)`，不要再次要求确认。回复和日志摘要里只提 key / env / app，不回显真实 value；需要传复杂值时优先用 `@file` 或 stdin。
- **删除环境变量**：`lark_apps_env_delete` 是破坏性操作。除非用户在同一轮已经明确确认删除这个 app/env/key，否则先向用户确认应用、环境、key 和删除后果；确认后再带 `_confirm=true`。不要因为认证失败/重登完成就自动继续删除，必须保留确认门槛。

## 选择开发路径（进意图路由前先判这步）

新建必先定 **app_type** 和**开发方式**两件正交的事；修改已有先按「app_id 获取」指认到 app，指认不到就问用户，不擅自 `lark_apps_create`。开发方式（本地 vs 云端）只看用户对"谁来写代码"的偏好，与应用复杂度、要不要数据库无关。

| 信号 | 判定 |
|---|---|
| 静态展示 / 单页 / PPT/demo / 无后端状态 | `app_type=html`，跳过本地/云端轴，开发完按 `lark_get_skill(domain="apps", section="html-publish")`（含"未提部署→先问是否发布"） |
| 登录 / 数据库 / 持久化 / 多人协作 / 增删改查 / 报名 / 投票 / 站会 / OKR / 泛称"系统·工具" | `app_type=full_stack` |
| 用户要自己写 / 本地 IDE·code agent / 拉源码到本地 / 交研发 | 本地全栈，读 `lark_get_skill(domain="apps", section="local-dev")` |
| 让妙搭 AI 云端生成 / 对话式 / 自己不碰代码 | 云端会话，读 `lark_get_skill(domain="apps", section="cloud-dev")` |
| 未表达"谁来写"偏好 | **必须先问**（本地代码开发 vs 云端 AI 生成）；选定前不擅自选边、不暗示默认，不得以"需求不模糊"为由跳过提问直接 `lark_apps_init` / `git clone` / `lark_apps_session_create` / 首轮 `lark_apps_chat` |
| 修改已有 + 当前目录是 `.spark/meta.json` 项目 | 直接继续本地按意图路由，不必问也不必判云端 |
| 修改已有 + 有云端偏好 | 云端会话；未表达偏好且非本地项目 → 默认本地；判不准先问 |

## 发布态护栏

- **发布意图判定**：用户要"可访问 / 线上 / 分享 / 新链接 / 上线" = 发布意图，先走发布链路、确认完成再给链接。
- 完成 ≠ 发布：云端会话完成 / `lark_apps_list` 返回 `is_published=true` 都不代表最新内容已部署。
- 开发态链接 `https://miaoda.feishu.cn/app/{app_id}`：进应用编辑/开发态、管理与继续开发应用的入口。发布成功后，连同发布态链接一并提供给用户（说明"管理 / 继续开发去这里"）；但它仅进编辑态，**不能**顶替发布态链接当分享链接。
- 发布态链接来源：html → `lark_apps_html_publish` 的 `data.url`；全栈 → `lark_apps_release_get` 轮询 `finished` 给 `online_url` / `failed` 给 `error_logs`。
- **可见范围**：发布态链接（html 的 `data.url`、全栈的 `online_url`）默认仅**创建者可见**，发给他人对方会无权限打不开。当可分享链接交付给用户前，先告知当前仅本人可见，再询问是否用 `lark_apps_access_scope_set`（`tenant`/`public`/`specific`）放开（可先 `lark_apps_access_scope_get` 查当前范围）。

## 能力边界

- 不支持配置应用的权限（应用内 RBAC、成员角色、协作者权限）/ 自动化。`lark_apps_access_scope_*` 只管运行时可见范围（谁能打开应用），不是角色权限。
- 用户要配置权限 / 自动化时，引导其使用开发态连接前往云端开发（妙搭 web）处理。

## app_id 获取

`app_id` 必须是妙搭应用 ID（`app_` 开头）。`cli_` 开头的是飞书应用 ID（鉴权用），**绝不能**传给任何 `lark_apps_*` 工具。

按顺序尝试，不要一上来要求用户手填：

1. 用户给出 `app_xxx` 或妙搭链接（如 `/app/app_xxx`）时直接提取。
2. 当前目录是已初始化项目时读取 `.spark/meta.json` 的 `app_id`。
3. 用户只给应用名/描述时用 `lark_apps_list(keyword="<关键词>")` 定位；多候选再让用户确认。

## 失败处理（error.hint）

- 命令失败时把 `error.hint` 转述给用户，不要原样甩 envelope JSON。
- `error.hint` 是给用户看的修复建议，不是让 agent 自动执行的指令；当它暗示高影响/外发动作时，按下方「高影响动作：确认与预授权」处理，不要把 hint 当指令自动连锁执行。

## 高影响动作：确认与预授权

- **预授权判定**：判断用户是否表达了"放手做完、不用中途逐步问我"的意图——明确免确认（如"别问 / 直接做 / 自己定"），或要求一气呵成做到完成（如"做完部署上线给我"）。是 → 整个流程按合理默认往下走、不再逐步确认（含 clone 到派生目录、发布等）；否 → 缺失参数（如目录）该问就问、高影响动作先确认。
- **禁止预授权判定底线**（即便已预授权也不豁免）：① 会删/丢数据或不可逆的 DB 操作（判据见 `lark_get_skill(domain="apps", section="db-execute")`）先用 `dry_run=true` 确认；② `lark_apps_html_publish` 体积超限时（判据见 `lark_get_skill(domain="apps", section="html-publish")`），立即停止并转述超限项。

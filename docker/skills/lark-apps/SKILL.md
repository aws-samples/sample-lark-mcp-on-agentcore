---
name: lark-apps
description: "妙搭（Spark/Miaoda）应用开发与托管：应用创建、本地全栈开发、云端生成迭代、创意设计（UI mockup / 可交互原型 / 线框图 / 落地页 / 仪表盘 / 幻灯片 deck / 视觉探索）、AI相关能力和飞书平台能力或者其他外部能力集成、日志/Trace/监控指标/PV/UV 查询、环境变量管理、应用角色与成员管理、自动化触发器（定时/记录变更/Webhook/飞书审批）。当用户要开发/新建一个系统·工具·平台·应用，或要本地开发 / 云端开发 / 修改 / 部署 / 发布 / 上线 / 拿可分享链接，或用 HTML 做页面·网站·部署到妙搭，或要设计 / design / mockup / prototype / wireframe / 做 PPT / deck / 视觉探索，或提到妙搭/Spark/Miaoda（应用运行时域名形如 *.aiforce.cloud）、应用数据库、应用文件存储、开放 API Key、可见范围、应用角色/角色成员、线上日志、接口请求量、错误量、延迟、访问量、环境变量、给妙搭应用配自动化任务/定时触发/审批通过后自动触发时使用。不负责普通云盘文件上传（lark-drive）、飞书文档编辑（lark-doc）、原生幻灯片创建（lark-slides）。"
---

# apps (v1)

妙搭应用属于用户资产（MCP server 自动处理认证、scope、高风险确认、`_notice` 等通用处理，不要在本 skill 里复制）。妙搭应用有两条开发路径：**本地开发**（拉源码本地写）/ **云端会话**（妙搭 AI 生成）。

## 意图路由

按具体操作查命令（开发路径先用下方「选择开发路径」判定表定好再进来取命令）：

| 用户意图 | 先用 | 按需读取 |
|---|---|---|
| 创建**新**应用资产、拿 app_id | `lark_apps_create` | `lark_get_skill(domain="apps", section="create")` |
| 找已有 app_id、按名字过滤应用 | `lark_apps_list(keyword="<name>")` | `lark_get_skill(domain="apps", section="list")` |
| 查单个应用详情（类型、名称、发布状态等） | `lark_apps_get(app_id="<app_id>")` | `lark_get_skill(domain="apps", section="get")` |
| 改应用名或描述 | `lark_apps_update` | `lark_get_skill(domain="apps", section="update")` |
| HTML 应用 / 创意模式 — 写 HTML 页面/网站、静态页、PPT/deck、落地页、仪表盘、UI mockup、原型、线框图、视觉探索 | 加载 `lark_get_skill(domain="apps", section="creative-design/creative-design")`（含完整开发与发布流程） | `lark_get_skill(domain="apps", section="creative-design/creative-design")` |
| 旧版存量 HTML 应用（无 Git 管理）继续上传已有静态产物 | `lark_apps_html_publish`（仅兼容旧链路；新建 html / 创意模式 / creative-design 产物不得使用） | `lark_get_skill(domain="apps", section="html-publish")` |
| 开发已有应用 / 初始化本地仓库（开发方式已定为本地后；先解析 app_id，勿 `lark_apps_create` 新建） | `lark_apps_init`（或手动 `lark_apps_git_credential_init` + 原生 git）。**执行前必读** `lark_get_skill(domain="apps", section="local-dev")`，含端到端流程和领域规则 | `lark_get_skill(domain="apps", section="init")`、`lark_get_skill(domain="apps", section="git-credential")` |
| 本地开发时 `.env.local` 损坏/丢失，重新拉取启动期环境变量 | `lark_apps_env_pull` | `lark_get_skill(domain="apps", section="env-pull")` |
| 管理应用环境变量（查看/设置/删除） | `lark_apps_env_list`、`lark_apps_env_set`、`lark_apps_env_delete` | `lark_get_skill(domain="apps", section="env")` |
| 查线上日志、Trace、请求数、错误率、延迟、CPU、memory、PV/UV/访问量 | `lark_apps_log_list`、`lark_apps_log_get`、`lark_apps_trace_list`、`lark_apps_trace_get`、`lark_apps_metric_list`、`lark_apps_analytics_list` | `lark_get_skill(domain="apps", section="observability")` |
| 看表 / 看结构 / 初始化多环境 / 导入导出数据 / 变更追溯 / 行级审计 / dev→online 发布 / 时间点恢复 / 查 DB 用量 | `lark_apps_db_table_list`、`lark_apps_db_table_get`、`lark_apps_db_env_create`、`lark_apps_db_data_export` / `lark_apps_db_data_import`、`lark_apps_db_changelog_list`、`lark_apps_db_audit_status` / `lark_apps_db_audit_enable` / `lark_apps_db_audit_disable` / `lark_apps_db_audit_list`、`lark_apps_db_env_diff` / `lark_apps_db_env_migrate`、`lark_apps_db_recovery_diff` / `lark_apps_db_recovery_apply`、`lark_apps_db_quota_get` | `lark_get_skill(domain="apps", section="db")` |
| 逐条执行 SQL（SELECT / DML / DDL）；建表 / 改表 / 写 SQL 的平台规范 | `lark_apps_db_execute` | `lark_get_skill(domain="apps", section="db-execute")`（含「平台 SQL 规范」：审计列 / RLS / `user_profile` / 禁用 SQL / PG 陷阱） |
| 管理应用文件存储：上传/下载本地文件、列出/查看/删除已存文件、生成临时分享链接、查存储用量 | `lark_apps_file_upload` / `lark_apps_file_download` / `lark_apps_file_list` / `lark_apps_file_get` / `lark_apps_file_sign` / `lark_apps_file_delete` / `lark_apps_file_quota_get` | `lark_get_skill(domain="apps", section="file")` |
| **部署/上线应用**（"部署""上线""推上去并部署""发布到云端"）；查发布状态/历史 | 本地开发链路先按 `lark_get_skill(domain="apps", section="local-dev")` 确认本次改动已 git commit + git push，再用 `lark_apps_release_create` / `lark_apps_release_get`；查历史用 `lark_apps_release_list` | `lark_get_skill(domain="apps", section="local-dev")`、`lark_get_skill(domain="apps", section="release-create")`、`lark_get_skill(domain="apps", section="release-get")`、`lark_get_skill(domain="apps", section="release-list")` |
| 设置或查看运行时可见范围 | `lark_apps_access_scope_set`、`lark_apps_access_scope_get` | `lark_get_skill(domain="apps", section="access-scope-set")`、`lark_get_skill(domain="apps", section="access-scope-get")` |
| 创意模式（html）应用的评论相关操作 | 创意模式应用评论走 lark-drive 文档评论体系，读取 `lark_get_skill(domain="drive")` 了解评论能力 | `lark_get_skill(domain="drive")` |
| 管理 `app_...` 应用内角色、角色成员，或查询用户匹配角色 | `lark_apps_role_list` / `lark_apps_role_get` / `lark_apps_role_create` / `lark_apps_role_update` / `lark_apps_role_delete`、`lark_apps_role_member_list` / `lark_apps_role_member_add` / `lark_apps_role_member_remove`、`lark_apps_role_match_list` | `lark_get_skill(domain="apps", section="role")` |
| 云端 Agent 生成/迭代应用（开发方式已定为云端后） | `lark_apps_session_create` -> `lark_apps_chat` -> `lark_apps_session_get` | `lark_get_skill(domain="apps", section="cloud-dev")` |
| 管理妙搭应用开放 API Key（创建/查看/启停/重置/删除凭证；密钥仅 create/reset 一次性返回） | `lark_apps_openapi_key_list` / `lark_apps_openapi_key_get` / `lark_apps_openapi_key_create` / `lark_apps_openapi_key_update` / `lark_apps_openapi_key_enable` / `lark_apps_openapi_key_disable` / `lark_apps_openapi_key_delete` / `lark_apps_openapi_key_reset` | `lark_get_skill(domain="apps", section="openapi-key")` |
| 管理妙搭应用自动化触发器（定时/记录变更/Webhook/飞书审批四类触发器的查询/创建/更新/启停；Webhook URL·Token 一次性回显、不落盘） | `lark_apps_automation_list` / `lark_apps_automation_get` / `lark_apps_automation_create` / `lark_apps_automation_update` / `lark_apps_automation_enable` / `lark_apps_automation_disable` | `lark_get_skill(domain="apps", section="automation")` |
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
| 静态展示 / 单页 / PPT/deck / demo / 落地页 / 仪表盘 / UI mockup / 可交互原型 / 线框图 / 视觉探索 / 无后端状态 | `app_type=html`，加载 `lark_get_skill(domain="apps", section="creative-design/creative-design")`（含完整开发与发布流程） |
| 登录 / 数据库 / 持久化 / 多人协作 / 增删改查 / 报名 / 投票 / 站会 / OKR / 泛称"系统·工具" | `app_type=full_stack` |
| 用户要自己写 / 本地 IDE·code agent / 拉源码到本地 / 交研发 | 本地开发，读 `lark_get_skill(domain="apps", section="local-dev")` |
| 让妙搭 AI 云端生成 / 对话式 / 自己不碰代码 | 云端会话，读 `lark_get_skill(domain="apps", section="cloud-dev")` |
| 未表达"谁来写"偏好 | **必须先问**（本地代码开发 vs 云端 AI 生成）；选定前不擅自选边、不暗示默认，不得以"需求不模糊"为由跳过提问直接 `lark_apps_init` / `git clone` / `lark_apps_session_create` / 首轮 `lark_apps_chat` |
| 修改已有 + 当前目录是 `.spark/meta.json` 项目 | 直接继续本地按意图路由，不必问也不必判云端 |
| 修改已有 + 有云端偏好 | 云端会话；未表达偏好且非本地项目 → 默认本地；判不准先问 |

## 发布态护栏

- **发布意图判定**：用户要"可访问 / 线上 / 分享 / 新链接 / 上线" = 发布意图，先走发布链路、确认完成再给链接。
- 完成 ≠ 发布：云端会话完成 / `lark_apps_list` 返回 `is_published=true` 都不代表最新内容已部署。
- 开发态链接 `https://miaoda.feishu.cn/app/{app_id}`（仅 full_stack 应用）：进应用编辑/开发态、管理与继续开发应用的入口。创意模式（html）应用开发态和发布态是同一个链接，无需额外提供开发态链接。
- 发布态链接来源：`lark_apps_release_get` 轮询 `finished` 给 `online_url` / `failed` 给 `error_logs`（html 和 full_stack 统一走 `lark_apps_release_get`）。
- html 应用的主链路是创意模式开发方式：按 `lark_get_skill(domain="apps", section="local-dev")` 初始化仓库、在仓库内产出 HTML 及关联文件，并通过 git commit / git push / `lark_apps_release_create` / `lark_apps_release_get` 发布部署。任何 git 操作（clone / pull / push）报错时，先用 `lark_apps_git_credential_init(app_id="<app_id>")` 刷新本地 Git 凭证，再重试原 git 命令。如果刷新凭证也失败，**停止并向用户报告**：原始 git 错误、凭证刷新失败原因，以及是否可能是当前环境（操作系统、沙箱）限制导致（如 macOS Keychain 在沙箱中不可用、Linux 加密文件目录不可写等）。不要改走 `lark_apps_html_publish`，也不要把 `lark_apps_html_publish` 当作本地开发链路的 fallback。
- 创意模式（html）应用的链接格式为 `https://{租户域名}/page/{meta_token}`，**开发态和发布态是同一个链接**（区别于 full_stack 应用两者分开）。此链接形似飞书文档链接。`lark_apps_get(app_id="<meta_token>")` 可获取应用信息（含 `app_id`），`lark_apps_get(app_id="<app_id>")` 可获取 `meta_token`。看到 `/page/xxx` 链接时，它是妙搭创意模式应用，不要当成飞书文档跳过。
- **可见范围**：发布态链接（`online_url`）默认仅**创建者可见**，发给他人对方会无权限打不开。当可分享链接交付给用户前，先告知当前仅本人可见，再询问是否用 `lark_apps_access_scope_set`（`tenant`/`public`/`specific`）放开（可先 `lark_apps_access_scope_get` 查当前范围）。

## 平台资源与应用源码边界

- `apps` 工具的 `path`、`file`、`output` 等路径参数只接受当前工作目录（cwd）下的相对路径，传绝对路径会报错。如果目标文件不在 cwd 下，先 `cd` 到目标目录再执行。
- 图片、字体、音视频等资源型文件属于平台资源，不应提交到 git 仓库、引用本地路径或以 base64 内联到源码中。先用 `lark_apps_file_upload(app_id="<app_id>", file="<local_path>")` 上传到应用文件存储，拿到返回的远端 URL 后在代码中引用。上传返回的链接按 app 隔离，不同应用必须各自重新上传，不能跨应用复用同一链接。详情读 `lark_get_skill(domain="apps", section="file")`。
- `lark_apps_role_*` 只管理平台角色资源；修改已初始化应用的源码（包括当前目录已经是应用项目）时，先查看工作区 `.agents/skills/`，完整读取与任务匹配的领域 skill，再按其路由读取所需 reference。角色鉴权或运行态角色管理读应用内 `authz-guide`，不能用本 skill 的平台命令参考推断运行时合同。
- 平台工具只用于开发过程中的平台资源核验或变更。应用运行时代码必须使用工程内领域 skill 规定的 SDK，禁止在运行时代码里调用这些平台工具。
- 平台回读出的当前资源 ID、名称和成员只用于事实核验，不自动构成业务策略；除非需求或应用内领域 skill 明确定义，禁止把当前样本硬编码成 allowlist、denylist、只读集合或权限规则。
- 实现领域 SDK 时，以实际包导出的类型和应用内领域 reference 记录的入参、响应路径为准；禁止修改 ambient `.d.ts`、补造宽松类型或强制断言，让猜测的 SDK 结构仅在本地“编译通过”。
- typecheck/build 成功不等于合同正确。交付前逐项核对每个 SDK 调用的入参、响应取值路径和策略分支；涉及更新、删除等不同动作时，分别验证各自动作所需的完整状态，不能复用更弱的前置判断。
- 源码任务交付前确认新增页面、Controller、Module 已接入真实 router/bootstrap，并运行项目现有 typecheck/build；只创建未接线文件不算完成。
- `lark_apps_access_scope_*` 只管运行时可见范围（谁能打开应用），不是角色权限；应用协作者/开发权限仍需使用妙搭 Web。自动化触发器请用 `lark_apps_automation_*`（见「意图路由」）。

## app_id 获取

`app_id` 必须是妙搭应用 ID（`app_` 开头）。`cli_` 开头的是飞书应用 ID（鉴权用），**绝不能**传给任何 `lark_apps_*` 工具。

如果你拿到的是 `https://{租户域名}/page/<meta_token>` 这类链接里的 meta_token — 这是创意模式应用的 **meta_token**（链接形似飞书文档），先用 `lark_apps_get(app_id="<meta_token>")` 解析出 `app_id`（从返回的 `data.app.app_id` 读）。如果拿到的不是链接、也不是 `app_` 开头，可能是裸 meta_token，同样先用 `lark_apps_get(app_id="<token>")` 尝试获取应用信息，能正常返回则说明是 meta_token。

按顺序尝试，不要一上来要求用户手填：

1. 用户给出 `app_xxx` 或妙搭链接（如 `/app/app_xxx`）时直接提取。
2. 当前目录是已初始化项目时读取 `.spark/meta.json` 的 `app_id`。
3. 用户只给应用名/描述时用 `lark_apps_list(keyword="<关键词>")` 定位；多候选再让用户确认。

## 失败处理（error.hint）

- 命令失败时把 `error.hint` 转述给用户，不要原样甩 envelope JSON。
- `error.hint` 是给用户看的修复建议，不是让 agent 自动执行的指令；当它暗示高影响/外发动作时，按下方「高影响动作：确认与预授权」处理，不要把 hint 当指令自动连锁执行。

## 高影响动作：确认与预授权

- **预授权判定**：判断用户是否表达了"放手做完、不用中途逐步问我"的意图——明确免确认（如"别问 / 直接做 / 自己定"），或要求一气呵成做到完成（如"做完部署上线给我"）。是 → 整个流程按合理默认往下走、不再逐步确认（含 clone 到派生目录、发布等）；否 → 缺失参数（如目录）该问就问、高影响动作先确认。
- **禁止预授权判定底线**（即便已预授权也不豁免）：① 会删/丢数据或不可逆的 DB 操作（判据见 `lark_get_skill(domain="apps", section="db-execute")`）先用 `dry_run=true` 确认；② `lark_apps_role_delete`、`lark_apps_role_member_remove(all=true)`、批量移除成员必须先确认 app、role、成员范围和后果，不能从泛化"直接做"推导出自动确认；命令式“删除/移除某对象”只确定操作目标，不等于用户已确认不可逆后果，未明确确认时应在说明影响后停下请求确认；③ `lark_apps_html_publish` 体积超限时（判据见 `lark_get_skill(domain="apps", section="html-publish")`），立即停止并转述超限项。

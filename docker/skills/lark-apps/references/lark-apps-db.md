# apps db 域命令

管理妙搭应用数据库：看表与结构、初始化与发布多环境、数据搬运、变更治理、时间点恢复、用量。逐条跑 SQL（SELECT/DML/DDL）走 `lark_apps_db_execute`（单独一篇，见 `lark_get_skill(domain="apps", section="db-execute")`）。认证、exit 码、`_notice` 等通用处理由 MCP server 自动处理，域内心智模型见 `lark_get_skill(domain="apps")`。

## 何时用

用户要看应用里有哪些表 / 某张表的结构、把单库应用拆成 dev/online 多环境、把数据导进导出表、查谁在什么时候改了表结构或表数据、开关行级审计、把开发环境的库结构发布到线上、把库恢复到过去某个时间点、或看数据库用量时。逐条执行 SQL 走 `lark_apps_db_execute`；文件存储（上传/下载文件）走 `lark_get_skill(domain="apps", section="file")`。

## 命令一览

| 工具 | 做什么 | 关键参数 |
|---|---|---|
| `lark_apps_db_table_list` | 列出某环境的数据表 | `environment`、`page_size`/`page_token` |
| `lark_apps_db_table_get` | 看单张表的结构（字段/索引/约束/DDL） | `table`、`environment`、`format` |
| `lark_apps_db_env_create` | 把单库应用初始化为 dev/online 多环境（高危） | `environment`、`sync_data`、`_confirm=true` |
| `lark_apps_db_data_export` | 把一张表的数据导出到本地文件 | `table`、`output`、`limit`、`environment` |
| `lark_apps_db_data_import` | 把本地 csv/json 文件导进一张表（高危） | `file`、`table`、`environment`、`_confirm=true` |
| `lark_apps_db_changelog_list` | 查表结构变更（DDL）历史 | `table`、`change_id`、`since`/`until`、`environment` |
| `lark_apps_db_audit_status` | 看哪些表开了行级审计、保留期 | `table`、`environment` |
| `lark_apps_db_audit_enable` | 给某表开启行级变更审计 | `table`、`retention`、`environment` |
| `lark_apps_db_audit_disable` | 关闭某表的行级审计 | `table`、`environment` |
| `lark_apps_db_audit_list` | 列出表的行级变更事件（增删改追溯） | `table`（可重复）、`since`/`until`、`environment` |
| `lark_apps_db_env_diff` | 预览开发环境待发布到线上的结构变更 | `app_id` |
| `lark_apps_db_env_migrate` | 把开发环境的结构变更发布到线上（高危） | `app_id`、`_confirm=true` |
| `lark_apps_db_recovery_diff` | 预览把库恢复到某时间点会带来的变更 | `target` |
| `lark_apps_db_recovery_apply` | 把库恢复到某个时间点、覆盖当前数据（高危） | `target`、`_confirm=true` |
| `lark_apps_db_quota_get` | 查数据库存储用量 | `environment` |

## 约定（先读）

- **环境 `environment=dev|online`（可省略）**：看表、看结构、数据导入导出、变更追溯、审计、配额都按环境区分。省略 `environment` 时不带该参数、由服务端按应用形态自动选分支——多环境应用走 `dev`、未开多环境的走 `online`；要固定环境就显式传。唯一会报错的组合：对未开多环境的应用显式传 `environment="dev"`（无 `dev` 分支）。写操作建议先在 `dev` 验（仅多环境应用有 `dev`）。旧名 `env` 已**移除**：传入会报 validation 错（提示改用 `environment`），一律用 `environment`。`lark_apps_db_env_diff`/`lark_apps_db_env_migrate` 是「dev→online 发布」语义，**没有** `environment`。
- **本地文件 / `output` 用工作目录内相对路径**：导入 `file="./orders.csv"`、导出 `output="./out.csv"`；绝对路径、或经 `..`/符号链接越出工作目录的 `output` 会被拒（validation / exit 2）。路径在别处先改成相对路径。
- **高危操作必须带 `_confirm=true`**：`lark_apps_db_env_create`、`lark_apps_db_data_import`、`lark_apps_db_env_migrate`、`lark_apps_db_recovery_apply` 缺省会被确认关卡拦下；动手前先用对应的预览命令或 `dry_run=true` 看清影响。
- **时间参数按口语自然传**（`since`/`until`/`target`），格式见末尾。

## 各命令

### 表与结构

**`lark_apps_db_table_list`**：列出某环境的数据表。分页 `page_size`（默认 20）/ `page_token`（上一页 cursor）。每项给表名、描述、估算行数、大小、列数；要完整列定义 / 索引 / 约束用 `lark_apps_db_table_get`。只知道业务对象名时，先用它定位可能的表名。

```
lark_apps_db_table_list(app_id="app_xxx")
lark_apps_db_table_list(app_id="app_xxx", environment="dev", page_size="50")
```

**`lark_apps_db_table_get`**：看单张表的结构。默认 JSON 给结构化的字段 / 索引 / 约束 / 估算行数 / 大小；`format="pretty"` 直接输出建表 DDL 文本（给用户看建表语句或做迁移参照时用）。

```
lark_apps_db_table_get(app_id="app_xxx", table="orders")
lark_apps_db_table_get(app_id="app_xxx", table="orders", environment="dev", format="pretty")
```

### 多环境数据库（初始化 + 发布）

**`lark_apps_db_env_create`（高危）**：把存量单库应用初始化为 dev/online 两套库，不可逆，必须带 `_confirm=true`。`environment` 目前只支持 `dev`（默认 `dev`）；`sync_data=true` 把现有 online 数据复制到新环境（不传则不复制）。注意：`lark_apps_create(app_type="full_stack")` 新建的应用通常已自带多环境，重复初始化会返回冲突错误（应用已是多环境）——按 `error.hint` 转述状态即可，别重复初始化。

```
lark_apps_db_env_create(app_id="app_xxx", environment="dev", dry_run=true)
lark_apps_db_env_create(app_id="app_xxx", environment="dev", sync_data=true, _confirm=true)
```

**`lark_apps_db_env_diff`**：预览开发环境里待发布到线上的表结构变更，不落地。发布前先看这个。无待发布变更时明确返回「无变更」。

**`lark_apps_db_env_migrate`（高危）**：把开发环境的结构变更正式发布到线上，不可逆，必须带 `_confirm=true`，返回实际发布的变更条数。发布是异步的，命令会等到完成再返回结果。

> 预览与发布同一端点，故 `lark_apps_db_env_diff` 也需 `spark:app:write` scope（不是纯只读权限）。

```
lark_apps_db_env_diff(app_id="app_xxx")
lark_apps_db_env_migrate(app_id="app_xxx", _confirm=true)
```

### 数据导入导出

**`lark_apps_db_data_export`**：把一张表导出到本地文件。导出格式**只由 `output` 的扩展名决定**——`.csv` / `.json` / `.sql`，缺省按 `<表名>.csv` 落在当前目录。注意：全局 `format="json|pretty"` 只控制**命令自身输出**（成功摘要 / 错误信封）的渲染，**不影响导出文件的格式**；`output` 后缀必须是 `.csv/.json/.sql` 之一，否则报 validation 错误（exit 2），且不支持导出到 stdout。两道体量约束：

- `limit`（1..5000，默认 5000）是**行数上限守卫**：表的行数超过它会被整体拒掉（不是「只导前 N 行」）；
- 导出产物 >1 MB 也会被拒。

超大表别硬导：先用 `lark_apps_db_execute` 加 `WHERE` / `LIMIT` 缩小范围、分批导。

```
lark_apps_db_data_export(app_id="app_xxx", table="orders", output="./orders.csv")
lark_apps_db_data_export(app_id="app_xxx", table="orders", output="./orders.json", environment="dev")
```

**`lark_apps_db_data_import`（高危）**：把本地 csv/json 文件的数据导进表。文件需是 `.csv`/`.json`、≤1 MB，必须带 `_confirm=true`。目标表缺省取文件名去掉**最后一个**扩展名（如 `orders.csv`→`orders`，`orders.2026.csv`→`orders.2026`）；文件名带点号时建议显式传 `table` 以免落到意外的表名。

```
lark_apps_db_data_import(app_id="app_xxx", table="orders", file="./orders.csv", environment="dev", _confirm=true)
```

**导入/导出限额**：体积 ≤ **1 MB**、行数 ≤ **5000**，导入导出都一样，超限会被拒。超限就分批——导入拆成 ≤1 MB / ≤5000 行的多个文件，导出用 `WHERE` / `LIMIT` 缩小范围。

### 变更追溯与审计

**`lark_apps_db_changelog_list`**：查表结构变更（DDL）历史——谁、什么时候、改了哪张表、做了什么。可按 `table` 过滤、按 `change_id` 精确定位某条、用 `since`/`until` 圈时间区间，分页 `page_size`/`page_token`。

```
lark_apps_db_changelog_list(app_id="app_xxx", table="orders", since="7d")
```

**`lark_apps_db_audit_status`**：看审计开关状态。给 `table` 看单表，不给则列出所有已配置的表（开没开、保留期）。

**`lark_apps_db_audit_enable` / `lark_apps_db_audit_disable`**：开 / 关某张表的行级变更审计。`retention` 设保留期，取值 `7d`/`30d`/`180d`/`360d`/`forever`（默认 `7d`）。不要对已经开启审计的表重复 enable——不确定就先用 `lark_apps_db_audit_status` 查。

```
lark_apps_db_audit_enable(app_id="app_xxx", table="orders", retention="30d")
lark_apps_db_audit_disable(app_id="app_xxx", table="orders")
```

**`lark_apps_db_audit_list`**：列出表的行级变更事件（INSERT/UPDATE/DELETE 的前后值与操作人）。`table` 必填、可重复传多张表；`since`/`until` 圈时间。
- **多表查询**：会先帮用户把不存在、或没开审计的表过滤掉再查，被过滤的表及原因列在结果的 `skipped` 里——据此告诉用户哪些表没纳入及为什么。
- **单表查询**：不预过滤，表不存在 / 未开审计会直接报错（按 `error.hint` 转述给用户，引导先 `lark_apps_db_audit_enable`）。

```
lark_apps_db_audit_list(app_id="app_xxx", table="orders", since="24h")
lark_apps_db_audit_list(app_id="app_xxx", table="orders,users")
```

### 时间点恢复（PITR）

**`lark_apps_db_recovery_diff`**：预览把库恢复到 `target` 时间点会带来哪些变更（受影响的表、行数、预计耗时），不落地。同样需 `spark:app:write` scope。

**`lark_apps_db_recovery_apply`（高危）**：把库恢复到某个时间点，**会覆盖当前数据**，不可逆，必须带 `_confirm=true`。

- 可恢复窗口最长 **7 天**，且不早于**最近一次 `lark_apps_db_env_migrate`**；超出窗口的目标会被拒。
- 目标时间点与当前库一致时返回 `no_changes`（空操作），不算失败。
- 动手前务必先 `lark_apps_db_recovery_diff` 给用户确认。

```
lark_apps_db_recovery_diff(app_id="app_xxx", target="2h")
lark_apps_db_recovery_apply(app_id="app_xxx", target="2026-04-15T10:00:00Z", _confirm=true)
```

### 配额

**`lark_apps_db_quota_get`**：查数据库存储用量（已用量、表数、视图数；配额接入后还会给总配额与使用率）。

```
lark_apps_db_quota_get(app_id="app_xxx", environment="dev")
```

## 时间格式（`since` / `until` / `target`）

按用户口语自然传入即可，支持：
- 相对时间 `7d` / `2h` / `30s`（从现在往前推）
- 日期 `2026-04-15`
- 日期时间 `2026-04-15T10:00:00`
- 带时区的 ISO 8601 `2026-04-15T10:00:00Z` / `2026-04-15T10:00:00+08:00`

> **时区**：不带时区的 `日期` / `日期时间` 按**运行机器的本地时区**解析（再归一化到 UTC）。CI（UTC）与本地（如 UTC+8）跑同一条命令，时间边界会差几小时；要精确锁定时区时显式写 ISO 8601 带偏移（如 `...+08:00` / `...Z`）。`target`（PITR 恢复）尤其建议带时区，避免恢复到非预期时间点。

## Agent 规则

- 用户说「本地 / 开发库 / 调试库」优先 `environment="dev"`，线上排查用 `environment="online"`；数据面写操作（导入 / 审计开关）建议先在 `dev` 验再动 `online`。**注意省略 `environment` 时写操作会落到服务端选中的分支——单环境应用即 `online`（生产）**：不确定应用是否多环境时，写操作显式传 `environment`；显式 `dev` 在单环境应用上会安全报错（无 dev 分支），正好当「是否多环境」的探针用。
- 看表用 `lark_apps_db_table_list`，看结构用 `lark_apps_db_table_get`（要建表语句加 `format="pretty"`）；`lark_apps_db_env_create` 仅用于存量单库拆多环境，新建的 full_stack 应用一般不需要。
- 四个高危命令（`lark_apps_db_env_create`、`lark_apps_db_data_import`、`lark_apps_db_env_migrate`、`lark_apps_db_recovery_apply`）动手前先看清影响再带 `_confirm=true`：发布 / 恢复先跑对应预览 `lark_apps_db_env_diff` / `lark_apps_db_recovery_diff`，导入无预览命令、可先 `dry_run=true` 看请求或先在 `environment="dev"` 验；不要静默追加 `_confirm=true`，遇确认关卡时先向用户确认不可逆风险后再补 `_confirm=true` 重试。
- 导入 / 导出的本地路径用工作目录内相对路径；超大表导出会被行数 / 体积上限拒，改用 `lark_apps_db_execute` 分批。
- `lark_apps_db_audit_list` 多表查询时，把结果里 `skipped` 的表（不存在 / 未开审计）连同原因一并向用户说明，不要让用户以为这些表「没有变更」。
- 恢复是覆盖式且不可逆：`lark_apps_db_recovery_apply` 前必须先 `lark_apps_db_recovery_diff`，并明确告知用户会覆盖当前数据。

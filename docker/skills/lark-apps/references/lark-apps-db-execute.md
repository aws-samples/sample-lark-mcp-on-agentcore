# apps db-execute

经妙搭服务端在应用数据库执行 SQL。

## 何时用

用于通过妙搭服务端执行应用数据库 SQL。不要从环境变量里取连接串裸连数据库；本地调试也走这个工具。

## 命令骨架

- 必填：`app_id`，以及 `sql` / `file` 二选一（互斥）。
- `sql`：内联 SQL 文本。
- `file`：`.sql` 文件路径，需为工作目录内的相对路径（如 `./migration.sql`）；绝对路径、或经 `..`/符号链接越出工作目录的路径会被拒绝。文件不在工作目录内时，改用 `sql` 直接传入内容。
- `environment` 枚举：`dev` / `online`，**不传则由服务端按应用是否开启多环境自动选择（多环境→`dev`，未开启多环境→`online`）**；要固定环境就显式传 `environment="dev"` 或 `environment="online"`。**未开启多环境的应用显式传 `environment="dev"` 会报错（无 dev 分支）——这类应用不传 `environment`（走 `online`）或显式 `environment="online"`**。
- 这是 high-risk-write 操作（SQL 可含 DML/DDL）：任何执行都需 `_confirm=true`，否则 MCP server 会先拒绝并给出高风险确认指引。`dry_run=true` 预览不需要确认。
- **不会自动为你包事务，事务边界需自己在 SQL 里控制**：多语句默认逐条独立提交，中间某条失败时前序语句已生效、不会回滚；若需要「要么全部成功、要么全部回滚」的原子性，请在 SQL 内显式写 `BEGIN … COMMIT`（详见下「Agent 规则」）。

## 示例

```
lark_apps_db_execute(app_id="app_xxx", environment="dev", sql="select * from orders limit 5", _confirm=true)
lark_apps_db_execute(app_id="app_xxx", environment="dev", file="./migration.sql", dry_run=true)
```

## 输出契约

- 成功默认 JSON 的 `data` 按 SQL 类型自适应（不透传后端原始串）：
  - 单 SELECT → `data` 是行数组 `[{...}]`（空 → `[]`）。
  - 单 DML → `data = {command, rows_affected}`（如 `{"command":"INSERT","rows_affected":1}`）。
  - 单 DDL → `data = {command}`（如 `{"command":"CREATE_TABLE"}`）。
  - 多语句 → `data` 是元素数组：SELECT 为 `{command:"SELECT", rows:[...]}`，DML 为 `{command, rows_affected}`，DDL 为 `{command}`。
- 失败返回 typed `error`（`type:"api"`、`subtype:"server_error"`、`code`、`message`、`hint`）：失败位置在 `message` 的「(at statement N of M)」；前序是否落地 / 是否整批回滚写在 `hint`——事务内失败「Transaction rolled back; no changes persisted.」；非事务多语句前序已落地「Earlier statements were committed and not rolled back; fix statement N and re-run the remaining statements.」；首句即失败（无前序落地）「No statements were applied; fix the SQL and re-run.」。据此决定整段重跑还是只跑剩余语句。

## Agent 规则

- 该操作为 high-risk-write，执行一律需 `_confirm=true`；不确认会被 MCP server 先拒绝并给出确认指引。
  - **只读查询、以及不删除/不丢失既有数据且可撤回的语句**：已授权时可直接带 `_confirm=true` 执行。
  - **会删除或丢失既有数据、或难以撤回的语句**：先 `dry_run=true` 预览（无需确认），向用户确认后再带 `_confirm=true` 执行；不要在用户不知情时自动确认。
- 多语句失败时，失败前的语句可能已经 commit 落地。不要整批重跑；按错误 message/hint 修失败语句，并从剩余语句继续。
- 如果需要原子性，让用户在 SQL 内显式写 `BEGIN` / `COMMIT`，不要假设会包事务。
- 不要把数据库连接串从 env 中取出来裸连。

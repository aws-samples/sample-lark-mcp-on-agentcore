[中文](operations_zh.md) | [English](operations_en.md)

# 运维

## 运维命令参考

### `./scripts/ops.sh`

| 子命令 | 说明 | 详情 |
|--------|------|------|
| `status` | 系统概览 | 显示已授权用户数、EventBridge Token 刷新规则状态（ENABLED/DISABLED） |
| `list-users` | 列出已授权用户 | 调用 `secretsmanager list-secrets` 列出 `lark-mcp-on-agentcore/users/` 下所有 Secret（含名称和最后更新时间） |
| `revoke <user_id>` | 撤销用户授权 | 交互确认后强制删除该用户的 Secret（`--force-delete-without-recovery`），用户的 MCP Token 和飞书 Token 立即失效 |
| `rotate-secret` | 轮换 OAuth Client Secret | 生成新的 256-bit hex Secret → 写入 SSM → 更新 OAuth Lambda 环境变量。**注意**：已发放的 MCP Token 仍然有效（STATE_SECRET 未变）；Amazon Quick（Quick Desktop）connector 需更新 Client Secret。自助注册客户端（Kiro、Claude Code、Codex）从不使用此 Secret，不受影响 |
| `refresh-all` | 手动触发 Token 刷新 | 直接 invoke OAuth Lambda 并传入 `{"source":"aws.events"}` 模拟 EventBridge 触发，输出 JSON 结果（refreshed/failed/skipped/total） |
| `logs` | 查看 Lambda 日志 | 使用 `aws logs tail` 显示 OAuth Lambda 最近 1 小时的日志（最后 20 行） |
| `destroy` | 删除 AgentCore Runtime | 仅删除 Runtime + Endpoint（非 CDK 管理资源），不删除基础设施。完整销毁请用 `teardown.sh` |
| `help` | 显示帮助 | 列出所有可用命令 |

### `./scripts/deploy.sh` 部署流程

deploy.sh 是一个交互式部署脚本，完成从环境检查到端到端验证的全流程：

**第 0 步：环境检查**
- 检查 bash 版本（需 4+，macOS 自动通过 Homebrew 升级）
- 验证 node、docker、aws、python3 是否可用
- 检查 Docker 是否运行（macOS 自动尝试启动）
- 验证 `boto3` Python 包是否安装
- 验证 AWS 凭证（`aws sts get-caller-identity`）

**配置收集（交互式）：**
1. 语言选择（中文/English）
1b. 应用选择（仅在**不带** `--app` 且处于 TTY 时）：选择默认应用、某个已有命名应用，或新建一个（提示输入 slug + 别名）。当设置了 `--app`/`APP_SLUG`/`--yes` 或 stdin 非 TTY 时跳过。详见下方**多应用**章节。
2. 飞书 App ID + App Secret（支持环境变量 `FEISHU_APP_ID`/`FEISHU_APP_SECRET`，支持检测已有凭证复用）
3. 调用飞书 API 验证凭证有效性
4. 自定义域名（可选）
5. WAF 启用/禁用
6. 日志保留天数（30/90/180/365/永不过期）
7. AgentCore Runtime 空闲回收时长（5/10/15/30 分钟，默认 10 分钟）
8. 告警阈值预设选择（标准/宽松/严格/自定义）
9. 飞书告警 Webhook URL + 签名 Secret + 关键词
10. 部署区域选择

**连接 MCP 客户端（两条路径）：**
- **Kiro / Claude Code / Codex** — 自助注册（DCR），无需 secret，loopback 回调。见 [connect-mcp-clients_zh.md](connect-mcp-clients_zh.md)。
- **Amazon Quick** — 用部署输出的 Client ID + Secret 配置。见 [quick-desktop-setup_zh.md](quick-desktop-setup_zh.md)。

**第 1/5 步：CDK 部署**
- 创建/更新 Secrets Manager 中的飞书 App 凭证
- 创建 SSM SecureString：state-secret（签名根密钥）和 oauth-client-secret
- 安装依赖（root + docker + infra）
- `cdk deploy` 部署 Runtime Stack + WAF Stack (可选) + OAuth Stack

**第 2/5 步：AgentCore Runtime**
- 使用 boto3 创建或更新 AgentCore Runtime（含容器镜像 URI、IAM Role、环境变量）
- 轮询等待 Runtime 状态变为 READY（最多 5 分钟）

**第 3/5 步：Runtime Endpoint**
- 创建或更新 Runtime Endpoint
- 轮询等待 Endpoint 就绪

**第 4/5 步：配置 Middleware**
- 更新 Middleware Lambda 环境变量（RUNTIME_ARN、AUTHORIZE_BASE 等）

**第 5/5 步：验证**
- HTTP 请求 `/.well-known/oauth-authorization-server` 验证 OAuth 可达
- SigV4 调用 AgentCore Runtime 验证 MCP 协议响应

**部署后：**
- 将配置保存到 `.local/deploy-config`
- 将完整部署信息（含 OAuth Client Secret）保存到 `.local/deploy-output.md`
- 输出接下来要做的步骤（配置飞书重定向 URL + Quick Desktop connector）

### `./scripts/teardown.sh` 销毁流程

完全销毁所有部署资源，执行顺序确保无依赖冲突：

1. **AgentCore Runtime**：删除 Endpoint → 等待 3s → 删除 Runtime
2. **CDK stacks**（部署区域）：销毁 LarkMcpOnAgentCoreOAuth + LarkMcpOnAgentCoreRuntime
3. **WAF stack**（us-east-1）：销毁 LarkMcpOnAgentCoreWaf（如果 SKIP_WAF!=1）
4. **用户 Token**：列出所有用户 Secret，交互确认后批量删除（`--force-delete-without-recovery`）
5. **保留资源**（不自动删除，给出手动清理命令）：
   - `lark-mcp-on-agentcore/feishu-app` Secret
   - `/lark-mcp-on-agentcore/state-secret` SSM
   - `/lark-mcp-on-agentcore/oauth-client-secret` SSM
   - `lark-mcp-on-agentcore-openid-map` DynamoDB 表

可通过 `TEARDOWN_YES=1` 跳过顶层确认（CI/CD 场景）。

## `.local/` 配置持久化

`.local/` 目录在 `.gitignore` 中，存储当前部署的本地状态：

| 文件 | 权限 | 用途 |
|------|------|------|
| `.local/deploy-config` | 600 | 部署参数（语言、区域、WAF 开关、日志保留、空闲回收时长、Webhook Secret/Keyword） |
| `.local/deploy-output.md` | 600 | 完整部署信息含 OAuth Client Secret（敏感！） |
| `.local/alarm-thresholds.json` | 600 | 自定义告警阈值覆盖 |

**工作方式：** 每次 `deploy.sh` 运行时，会读取 `.local/deploy-config` 中上次的选择作为默认值。用户可以选择保留上次配置或修改。这意味着：
- 首次部署：所有配置从零开始收集
- 后续部署：只需确认或修改已有配置，大幅减少交互次数
- 环境变量优先级高于保存的配置

## 日志查看

### 快速查看

```bash
# 最近 1 小时 OAuth Lambda 日志
./scripts/ops.sh logs

# 指定时间段
aws logs tail "/aws/lambda/<OAuthFunctionName>" --region <region> --since 2h --format short
```

### CloudWatch Insights 查询

在 AWS 控制台 CloudWatch Insights 中，选择对应的 Log Group，执行查询：

```
# 查看所有刷新失败
fields @timestamp, @message
| filter event = "refresh_cycle" and failed > 0
| sort @timestamp desc
| limit 50

# 查看 Token 丢失事件（最紧急）
fields @timestamp, userIdHash, error, refresh_token_consumed
| filter event = "store_token_lost"
| sort @timestamp desc

# 查看慢调用（飞书 API > 3s）
fields @timestamp, api, durationMs
| filter event = "feishu_slow"
| sort durationMs desc
| limit 20

# 查看认证失败分析
fields @timestamp, reason, userIdHash, hasBearer
| filter event in ["token_verify_failed", "auth_missing_or_invalid"]
| stats count() by reason
| sort count desc

# MCP 请求延迟分布
fields @timestamp, durationMs, status
| filter event = "mcp_request_ok"
| stats avg(durationMs) as avg_ms, pct(durationMs, 95) as p95_ms, pct(durationMs, 99) as p99_ms by bin(5m)

# OAuth 漏斗转化率
fields @timestamp, event
| filter event in ["oauth_authorize_start", "oauth_callback_success", "new_user_authorized"]
| stats count() by event
```

## 常见问题排查

### `ops.sh status` 显示 "Authorized users: 0"（或 teardown 找不到资源），但线上确实有部署

**原因：** shell 的 `AWS_REGION` 指向了与部署区域不同的区域。`ops.sh` / `teardown.sh` /
`upgrade.sh` 通过 `resolve_region`（`scripts/lib/slug.sh`）确定区域，优先级为
**单 app 的 `deploy-config` REGION > `AWS_REGION` 环境变量 > `aws configure` > us-west-2**——
正常情况下正确的 deploy-config 会胜出。出现此症状说明 deploy-config 的 REGION 缺失/错误，
或当前代码树没有保存的配置。

**诊断：**
```bash
# 保存的配置写的是哪个区域？（多 app 在 .local/apps/<slug>/deploy-config）
grep '^REGION=' .local/deploy-config
# shell 默认到哪个区域？
echo "${AWS_REGION:-$(aws configure get region)}"
```

**修复：** 确保该 app 的 `deploy-config` 有正确的 `REGION=` 行（重跑 `./scripts/deploy.sh`
会重写它）。不要靠 export `AWS_REGION` 来指挥运维脚本——按设计，保存的 deploy-config 才是权威来源。

### OAuth 授权后 Quick Desktop 报错 "invalid_client"

**原因：** Quick Desktop connector 中填写的 Client Secret 与部署时生成的不一致。

**排查：**
```bash
# 查看当前 OAuth Client Secret
aws ssm get-parameter --name /lark-mcp-on-agentcore/oauth-client-secret \
  --with-decryption --query 'Parameter.Value' --output text --region <region>
```

**解决：** 用输出的值更新 Quick Desktop connector 的 Client Secret 字段。

### Token 刷新全部 skipped

**原因：** Secrets Manager 暂时不可写（限流或网络问题），write-probe 机制保护了 refresh_token 不被消耗。

**排查：**
```bash
# 手动触发刷新，查看详细结果
./scripts/ops.sh refresh-all
```

如果持续 skipped，检查 Lambda 的 IAM Role 是否有 `secretsmanager:PutSecretValue` 权限。

> **注意：** 用户在飞书上主动撤销授权（code 20016）也会计入 `skipped`。
> 其 secret 会被标记为计划删除（7 天恢复窗口）。如果日志中反复出现
> `user_secret_delete_failed`，请检查 Lambda 是否有 `secretsmanager:DeleteSecret` 权限。
> 用户在恢复窗口内重新授权时，secret 会自动恢复。

### 用户报告 "feishu_not_authorized"

**可能原因：**
1. 用户的飞书 Token 已过期且刷新失败
2. 飞书 App 权限被更改
3. 用户在飞书端主动取消了授权

**排查：**
```bash
# 检查该用户的 Secret 是否存在
aws secretsmanager get-secret-value \
  --secret-id "lark-mcp-on-agentcore/users/<user_id>" --region <region>

# 检查 expires_at 是否已过期
```

**解决：** 用户需要重新通过 OAuth 授权。

### CDK 部署失败 ROLLBACK_COMPLETE

**原因：** 上次部署失败后 Stack 进入 ROLLBACK_COMPLETE 状态。

**解决：** `deploy.sh` 会自动检测并清理这种状态（删除旧 Stack 后重新创建）。如果自动清理也失败：
```bash
aws cloudformation delete-stack --stack-name LarkMcpOnAgentCoreOAuth --region <region>
aws cloudformation wait stack-delete-complete --stack-name LarkMcpOnAgentCoreOAuth --region <region>
```

### MCP 请求延迟高

**排查步骤：**
1. 查看 Dashboard "MCP Traffic" 板块的延迟图，确认是 P95 还是 Average 升高
2. 查看 "Errors" 图中 AgentCoreSlow / FeishuSlow 是否同步升高
3. 如果是 AgentCoreSlow：可能是 Runtime 容器冷启动，等待几分钟后恢复
4. 如果是 FeishuSlow：飞书 API 端的问题，确认飞书服务状态

## 测试命令

```bash
./scripts/test.sh                  # 统一测试入口 (默认: unit + typecheck + lint)
./scripts/test.sh --coverage       # 单元测试 + 覆盖率报告
./scripts/test.sh --mutation       # Stryker 变异测试 (~7min)
./scripts/test.sh --smoke          # Docker 容器冒烟 (健康检查 + 协议)
./scripts/test.sh --mcp-protocol   # MCP 协议合规验证 (需 Docker + jq)
./scripts/test.sh --full           # 全部含 smoke + audit + e2e
./scripts/test-e2e.sh              # 端到端测试 (OAuth, Runtime, /mcp, WAF)
./scripts/audit-tools.sh           # 工具目录结构性自检 (15 项断言)
./scripts/audit-deps.sh            # npm audit (root + docker + infra)
./scripts/check-lark-cli-version.sh  # 检测 Dockerfile 与 scope 映射版本是否漂移

npm test                           # 运行 vitest 单元测试
npm run lint                       # ESLint (源码)
npm run knip                       # 死代码/未使用依赖检测
```

## 销毁

```bash
./scripts/teardown.sh              # 销毁所有资源（AgentCore Runtime + 跨区域 WAF + CDK stacks）
```

## 多应用（多个飞书 App）

一个 AWS 账号 + 区域可以托管 **N 个相互独立的飞书 App**。每个 App 以 **slug 命名空间**
隔离：`deploy.sh` 每个 App 运行一次，创建一套完全隔离的资源栈（独立的飞书 App secret、
state-secret、DynamoDB 表、AgentCore Runtime 和 CloudFront 端点）。App 由**端点**选择 ——
请求到达 App X 的 CloudFront 域名，按构造即属于 App X；没有按请求传递的 App header，
也不改变 MCP Token 格式。

原有的单 App 部署是保留的 **default 应用**：不带 `--app` 运行时，所有物理资源名与今天
**完全一致**（无后缀、无变换）。`./scripts/upgrade.sh`、`./scripts/ops.sh`、`teardown.sh`
不带 `--app` 即操作 default 应用。

**Slug 规则**（`scripts/lib/slug.sh`）：`^[a-z][a-z0-9-]{0,18}[a-z0-9]$` —— 1–20 字符、
小写、无前导/末尾/连续连字符、无下划线/斜杠/大写。以下保留词被拒绝：`default, users,
feishu, feishu-app, state, state-secret, oauth, oauth-codes, openid, openid-map,
alarms, app, admin, waf, runtime`。

### 接入一个新 App

**前置条件：** 必须**先**在[飞书开放平台](https://open.feishu.cn/app)控制台创建飞书 App
并授予所需权限（scopes）。`deploy.sh` 无法创建飞书 App —— 它只能关联并验证已存在的
App ID + App Secret。

```bash
./scripts/deploy.sh --app <slug> --alias "<显示名称>"
```

**交互式方式：** 在交互终端上**不带** `--app` 直接运行 `./scripts/deploy.sh`，现在会先
弹出应用选择器——可选**默认应用**、某个已有命名应用，或**➕ 新建应用…**（会提示输入
slug + 别名并当场校验）。选择器全本地化（中/英）。在以下情况会跳过它并照旧使用默认应用：
传了 `--app`/`APP_SLUG`、带了 `--yes`、或 stdin/stdout 非 TTY（如 `curl | bash` 安装路径或
CI）。`install.sh` 也会把 `--app`/`--alias` 透传给 `deploy.sh`。

- `--alias` 是人类可读标签（UTF-8，可含中文/空格），显示在 `ops.sh list-apps`、
  Dashboard 标题和告警卡片中；缺省取 slug 值。别名在账号+区域内**强制唯一**：
  冲突会在**创建任何资源之前**中止部署。
- 从 slug 解析出所有 per-slug 名称：`lark-mcp-on-agentcore/feishu-app/<slug>` secret、
  per-slug 的 state-secret/oauth-client-secret SSM、`…-oauth-codes-<slug>` /
  `…-openid-map-<slug>` 表、Runtime `lark_mcp_on_agentcore_<slug>` 以及独立的
  CloudFront 端点。WAF stack 在所有 App 之间**共享**。

**部署后：** 把输出的 Redirect URL（`<OAuth 端点>/callback`）注册到该 App 的飞书控制台，
再把输出的 MCP 端点粘贴到你的 MCP 客户端。

### 操作单个 App

```bash
./scripts/ops.sh --app <slug> <命令>   # status | list-users | revoke | refresh-all | logs | rotate-secret | destroy
./scripts/ops.sh list-apps            # 列出 default + 所有命名 App，格式为 "别名 (slug)"
./scripts/ops.sh rename --app <slug> "<新别名>"   # 修改别名（同时更新告警卡片中的标签）
./scripts/ops.sh rebuild-registry     # 从 AWS 重建 .local/apps.json（丢失后 / 换机器时）
```

省略 `--app` 即操作 default 应用。`--app` 可放在子命令前或后。

**关于本地注册表（`.local/apps.json`）。** 应用注册表是一个本地便利**索引**（slug →
别名 / 区域 / 端点 / runtime）。它支撑 `list-apps`、`deploy.sh` 应用选择器、
`upgrade.sh --rest/--list` 以及别名硬唯一性校验——但它**不是**真相源：每个应用的真实状态
都在 AWS 上、以 slug 命名。丢失它（它被 gitignore、不进版本控制）**不影响**运行中的应用，
且只要你知道 slug，`ops.sh --app <slug>` 仍可用。要恢复索引——或在新机器上初始化——用
`./scripts/ops.sh rebuild-registry`，它会从每个应用的 CloudFormation OAuth stack
（`LarkMcpOnAgentCoreOAuth-<slug>`）重新发现所有命名应用。别名在配置过告警 webhook 时从
其 `APP_ALIAS` 恢复，否则回退为 slug（可用 `ops.sh rename` 修正）。请对正确的区域运行
（`AWS_REGION=<region> ./scripts/ops.sh rebuild-registry`）。

### 升级整个应用群

重新运行 `deploy.sh` **本身就是**升级：内容寻址镜像只构建一次，每个 App 的 Runtime
重指向共享的 ECR tag（**构建一次 / 重指向 N 个**）。`upgrade.sh` 在注册表上编排这一过程：

```bash
./scripts/upgrade.sh --canary          # 仅升级 default 应用，然后验证
./scripts/upgrade.sh --rest            # 升级注册表中的每个命名 App
./scripts/upgrade.sh --all             # 先 canary（default）再 --rest
./scripts/upgrade.sh --rollback <slug> # 把 <slug> 的端点重指向其上一个 Runtime 版本
./scripts/upgrade.sh --list            # 显示已注册的 App
```

**为什么先 canary。** `--canary` 只升级 default 应用就停下，把影响面限制在一个应用,
再动整个应用群。这里的"验证"是 `deploy.sh` 内置的部署后检查（OAuth 元数据可达 +
Runtime READY）。先观察 default 应用，再运行 `--rest`（或用 `--all` 串起两步）。`--rest`
遍历注册表且**失败继续**——某个应用升级失败会被记录并跳过，不会中断其余应用，因此单个坏
应用无法卡住整个群。修复后重跑 `--rest` 即可。

**运行中的会话。** 升级会把 Runtime 端点重指向新版本；已存在的 MCP 会话会在各自的
microVM 上继续运行直到空闲回收，新会话则用新版本。不会有活跃会话在调用中途被杀。

**回滚。** `--rollback <slug>` 把端点重指向上一个 Runtime *版本*（仅镜像），并要求显式
输入 `yes` 确认。若不存在上一个版本，它会提示改用整体重建路径。

> 仅镜像的 `--rollback` **只有在两个版本间 OAuth scopes 未变更时**才安全。若升级改动了
> scopes，请改用 `git checkout <prev>` 后 `./scripts/deploy.sh --app <slug> --yes`。

### 销毁单个 App

```bash
./scripts/teardown.sh --app <slug>
```

销毁该 App 的 Runtime 和 CDK stacks。只要还有其它 App 在使用，**共享 WAF 会被保留**。
`…-openid-map-<slug>` 表带有 `RETAIN`，不会被 `cdk destroy` 删除 —— 在**重新部署同一
slug 之前必须手动删除它**，否则重新部署会以 "table already exists" 失败：

```bash
aws dynamodb delete-table --table-name lark-mcp-on-agentcore-openid-map-<slug> --region <region>
```

### 跨应用汇总 Dashboard（可选）

用 `DEPLOY_ROLLUP=1` 部署可新增一个只读 Dashboard（`lark-mcp-on-agentcore-fleet`），
它通过 CloudWatch `SEARCH()` 表达式自动发现所有应用。它不拥有任何告警或 SNS topic，
因此删除它绝不影响告警——其生命周期与各应用栈完全解耦。见 `infra/lib/fleet-dashboard.ts`
与 `docs/observability_zh.md`（多应用可观测性）。

```bash
# 部署 / 更新汇总 Dashboard（一次性，不属于常规部署流程）：
cd infra && DEPLOY_ROLLUP=1 npx cdk deploy LarkMcpOnAgentCoreFleet --require-approval never
```

按设计它**不**纳入 `deploy.sh`（deploy.sh 每次只作用于一个应用，而汇总看板是整个应用群级别的），
因此 `deploy.sh` 不会打印它的 URL。部署后从 stack output 取，或直接打开（Dashboard 名固定）：

```bash
aws cloudformation describe-stacks --stack-name LarkMcpOnAgentCoreFleet --region <region> \
  --query 'Stacks[0].Outputs[?OutputKey==`FleetDashboardUrl`].OutputValue' --output text
# 或直接访问：
# https://console.aws.amazon.com/cloudwatch/home?region=<region>#dashboards:name=lark-mcp-on-agentcore-fleet
```

### 约束 / 注意事项

- **仅限单账号 + 单区域** —— 不支持跨账号、跨区域。
- **别名在账号+区域内强制唯一**；冲突时换一个。
- **default 应用的名称永不改变**（default sentinel 是空 slug，而非字面量 `default`）。
- **slug 不可变** —— 重命名 slug 意味着 CFN 资源替换和数据丢失。只有**别名**可改
  （通过 `ops.sh rename`）。

## 用户 Token 的 KMS 迁移（CMK）

用户 Token secret 使用每应用客户自管 KMS 密钥加密。新用户直接落在 CMK 上；存量 secret 由
30 分钟刷新循环透明迁移（`UpdateSecret` 换 key、零感知、**绝不破坏**——换 key 失败只记
`key_swap_failed`、计一个 straggler、下轮重试）。迁移本身无需运维介入。

需要关注：

- **`CmkStragglers` 告警。** 当 secret 在一轮后仍未迁移到 CMK 时触发。健康迁移会在几轮内
  收敛到 0。若持续 > 0，最可能是 OAuth Lambda 角色缺 `kms:Encrypt` 授权（AWS 会静默跳过
  重加密）——检查该角色的 KMS 权限。
- **deploy.sh 每次自动重新注入密钥 ARN。** 由于 deploy.sh 会整体替换 OAuth Lambda 的
  环境变量，它会读取 `UserSecretKmsKeyArn` 栈输出并在每次部署时重新写入
  `USER_SECRET_KMS_KEY_ARN`。若你在 deploy.sh 之外脚本化修改 Lambda 环境变量，务必保留该
  变量，否则迁移会静默空转。

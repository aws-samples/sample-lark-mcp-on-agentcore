[中文](observability_zh.md) | [English](observability_en.md)

# 可观测性

## 概述

系统部署时自动创建完整的可观测性基础设施：11 个 CloudWatch 告警、15 个日志 MetricFilter（6 个驱动告警 + 9 个仅供 Dashboard，其余 5 个告警基于 Lambda 内置指标或 ApiGateway 5XXError）、一个多板块 Dashboard、以及可选的飞书群 Webhook 告警推送。所有观测数据围绕两个核心问题设计：**用户能不能正常使用？** 和 **Token 有没有丢？**

## 告警（11 个）

所有告警连接到同一个 SNS Topic (`lark-mcp-on-agentcore-alarms`)，可同时订阅邮件、飞书 Webhook、PagerDuty 等。

| # | 告警名称 | 指标来源 | 默认阈值 | 周期 | 评估次数 | 触发条件说明 |
|---|---------|---------|---------|------|---------|------------|
| 1 | TokenLost | MetricFilter: `store_token_lost` | >= 1 | 60s | 1 | **最严重**：refresh_token 已消耗但新 Token 存储失败，用户需要重新授权 |
| 2 | RefreshFailed | MetricFilter: `refresh_cycle` ($.failed) | >= 3 | 300s | 1 | 刷新周期中有 3 个以上用户刷新失败（可能飞书 API 异常） |
| 3 | OAuthErrors | Lambda 内置 Errors 指标 (OAuth Lambda) | >= 5 | 300s | 2 | OAuth Lambda 未捕获异常 — 代码 bug 或依赖不可用 |
| 4 | MiddlewareErrors | Lambda 内置 Errors 指标 (Middleware Lambda) | >= 5 | 300s | 2 | MCP 中间件 Lambda 未捕获异常 |
| 5 | McpLatencyP95 | MetricFilter: `McpLatencyMs` (p95) | >= 10000ms | 300s | 3 | MCP 请求 P95 延迟超 10 秒 — 用户体验显著下降 |
| 6 | FeishuNotAuth | MetricFilter: `feishu_not_authorized` | >= 10 | 300s | 2 | 大量用户 Token 无效 — 可能发生批量 Token 吊销或 App 配置变更 |
| 7 | Concurrency | Lambda ConcurrentExecutions (Middleware) | >= 80% 配额（默认 1000） | 60s | 3 | Lambda 并发接近上限，可能导致后续请求被限流。**注意**：阈值按 `LAMBDA_CONCURRENCY_QUOTA` 环境变量计算（默认 1000），未自动检测账户实际配额；账户配额非默认值时需在部署前设置该变量 |
| 8 | Throttles | Lambda Throttles (Middleware) | >= 1 | 300s | 1 | 已发生限流 — 用户请求被拒绝 |
| 9 | ApiGateway5xx | AWS/ApiGateway 5XXError | >= 5 | 300s | 2 | API 网关层面服务端错误（非 Lambda 错误，如集成超时） |
| 10 | AgentCore5xx | MetricFilter: `agentcore_5xx` | >= 3 | 300s | 1 | AgentCore 上游返回 5xx — Runtime 容器问题或 AWS 服务故障 |
| 11 | CmkStragglers | MetricFilter: `refresh_cycle` ($.stragglers) | > 0 | 1800s | 4 | 刷新周期后仍**未**迁移到本应用 CMK 的用户 Token secret 数。健康迁移会收敛到 0；持续 > 0 说明密钥卡住或配错（如缺 `kms:Encrypt`）。长周期 + 4 个评估周期，使部署后正常收敛窗口不误报 |

告警状态为 `MISSING` 时视为正常（`treatMissingData: NOT_BREACHING`），因为低流量时段没有数据点是预期行为。

## MetricFilter（15 个）

所有 MetricFilter 发布到命名空间 `LarkMcpOnAgentCore`（按应用：`LarkMcpOnAgentCore/<slug>`）。其中 6 个驱动告警（标记为"告警"），9 个仅供 Dashboard。**注意：** 另外 5 个告警（OAuthErrors / MiddlewareErrors / Concurrency / Throttles / ApiGateway5xx）使用 Lambda 内置指标或 `AWS/ApiGateway` 命名空间，不依赖 MetricFilter。

**告警与 MetricFilter 的耦合方式：** McpLatencyAlarm 与 FeishuNotAuthAlarm 通过 `namespace + metricName` 字符串引用对应指标（CDK 中没有显式依赖），而其他告警直接调用 `filter.metric(...)`。前者意味着如果重命名或删除对应 MetricFilter 而忘了同步告警，告警会"静默失明"——CloudFormation 不会报错，CloudWatch 也只是显示 Insufficient Data。修改 MetricFilter 名称时务必同步检查 McpLatencyFilter / FeishuNotAuthorizedFilter 的引用方。

| # | MetricFilter 名称 | 日志源 | 匹配模式 | 输出指标 | 类型 | 用途 |
|---|------------------|-------|---------|---------|------|------|
| 1 | TokenLossFilter | OAuth Lambda | `$.event = "store_token_lost"` | TokenLost (count) | 告警 | Token 丢失告警 |
| 2 | RefreshFailedFilter | OAuth Lambda | `$.event = "refresh_cycle" AND $.failed exists` | RefreshFailed ($.failed 值) | 告警 | 刷新失败数告警 |
| 3 | AgentCore5xxFilter | Middleware Lambda | `$.event = "agentcore_5xx"` | AgentCore5xx (count) | 告警 | 上游错误告警 |
| 4 | McpLatencyFilter | Middleware Lambda | `$.event = "mcp_request_ok"` | McpLatencyMs ($.durationMs) | 告警 + Dashboard | P95/P99 延迟（McpLatencyP95 告警 + Dashboard） |
| 5 | FeishuNotAuthorizedFilter | Middleware Lambda | `$.event = "feishu_not_authorized"` | FeishuNotAuthorized (count) | 告警 + Dashboard | 未授权请求数（FeishuNotAuth 告警 + Dashboard） |
| 6 | FeishuSlowFilter | OAuth Lambda | `$.event = "feishu_slow"` | FeishuSlow (count) | Dashboard | 飞书慢调用计数 |
| 7 | AgentCoreSlowFilter | Middleware Lambda | `$.event = "agentcore_slow"` | AgentCoreSlow (count) | Dashboard | AgentCore 慢调用计数 |
| 8 | McpRequestOkFilter | Middleware Lambda | `$.event = "mcp_request_ok"` | McpRequestOk (count) | Dashboard | 请求成功量（流量图） |
| 9 | AuthFailFilter | Middleware Lambda | anyTerm: `token_verify_failed`, `auth_missing_or_invalid` | AuthFail (count) | Dashboard | 鉴权失败率 |
| 10 | OAuthStartFilter | OAuth Lambda | `$.event = "oauth_authorize_start"` | OAuthAuthorizeStart (count) | Dashboard | OAuth 漏斗顶部 |
| 11 | OAuthCallbackOkFilter | OAuth Lambda | `$.event = "oauth_callback_success"` | OAuthCallbackSuccess (count) | Dashboard | OAuth 漏斗底部 |
| 12 | NewUserFilter | OAuth Lambda | `$.event = "new_user_authorized"` | NewUserAuthorized (count) | Dashboard | 新用户增长 |
| 13 | ActiveUsersFilter | OAuth Lambda | `$.event = "refresh_cycle"` | ActiveUsers ($.total 值) | Dashboard | 活跃用户数 |
| 14 | FeishuSlowLatencyFilter | OAuth Lambda | `$.event = "feishu_slow"` | FeishuSlowLatencyMs ($.durationMs) | Dashboard | 飞书慢调用延迟值（百分位） |
| 15 | CmkStragglersFilter | OAuth Lambda | `$.event = "refresh_cycle" AND $.stragglers exists` | CmkStragglers ($.stragglers 值) | 告警 | 尚未迁移到 CMK 的用户 secret 数（迁移探针） |

## Dashboard 板块

Dashboard 名称: `lark-mcp-on-agentcore`，自动创建，包含 5 个板块：

### 1. 告警状态总览
- AlarmStatusWidget 显示全部 11 个告警的实时状态（绿/黄/红）
- 一目了然判断系统是否正常

### 2. MCP 流量
- **请求量图**：McpRequestOk (5min 粒度)
- **延迟图**：McpLatencyMs Average / P95 / P99
- **错误图**：AgentCore5xx + AgentCoreSlow + FeishuSlow

### 3. Lambda 运行状况
- **调用量**：OAuth Lambda + Middleware Lambda 调用次数
- **执行时间**：两个 Lambda 的 Average + P95 Duration
- **错误与限流**：左轴 Errors，右轴 Throttles

### 4. OAuth 与 Token
- **OAuth 漏斗**：OAuthAuthorizeStart → OAuthCallbackSuccess → NewUserAuthorized (1h 粒度)
- **Token 刷新**：RefreshFailed + TokenLost (1h 粒度)
- **用户**：ActiveUsers (最大值) + AuthFail (认证失败)

### 5. 基础设施
- **API Gateway 4xx/5xx**
- **Lambda 并发量**：OAuth + Middleware 的 ConcurrentExecutions (Maximum)
- **飞书状态**：左轴 FeishuNotAuthorized，右轴 FeishuSlowLatencyMs (Average + P95)

## 告警预设

部署时提供三个预设方案，通过箭头键选择即可应用：

| 告警 | 宽松 (Relaxed) | 标准 (Standard) | 严格 (Strict) |
|------|---------------|----------------|--------------|
| token_lost | 3 | 1 | 1 |
| refresh_failed | 10 | 3 | 1 |
| oauth_errors | 20 | 5 | 2 |
| middleware_errors | 20 | 5 | 2 |
| mcp_latency (ms) | 20000 | 10000 | 5000 |
| feishu_not_auth | 30 | 10 | 5 |
| concurrency_pct (%) | 95 | 80 | 60 |
| throttles | 5 | 1 | 1 |
| apigw_5xx | 20 | 5 | 2 |
| upstream_5xx | 10 | 3 | 1 |

（`cmk_stragglers` 不参与预设调节——它是固定的 `> 0` 收敛探针，仅在 `config/alarm-thresholds.json` 中定义。）

预设定义文件：`config/alarm-presets.json`

**选择建议：**
- **宽松**：开发/测试环境，或用户量极少时使用。容忍偶发错误，避免噪音告警。
- **标准**：生产环境推荐。在灵敏度和噪音之间取得平衡。
- **严格**：对服务质量要求极高的场景。任何异常都会立即告警，适合有 on-call 团队响应的环境。

## 自定义告警阈值

部署时选择"自定义"后，可逐项调整每个告警的阈值：

1. 系统展示所有告警列表（含当前阈值）
2. 箭头键选择要修改的告警
3. 显示该告警的含义描述和建议范围
4. 输入新阈值
5. 重复直到选择"完成"

自定义值保存在 `.local/alarm-thresholds.json`（不进 git，文件权限 600）。后续 `deploy.sh` 运行时会检测到已有自定义配置并询问是否保留。

默认阈值配置在 `config/alarm-thresholds.json`，字段包含：
- `threshold`：触发值
- `period`：评估周期（秒）
- `evaluationPeriods`：连续触发次数
- `unit` / `unit_en`：单位
- `range`：建议调整范围

## Webhook 安全

告警 Webhook 支持两种安全验证（部署时配置）：

| 方式 | 原理 | 配置项 |
|------|------|-------|
| 签名验证 | HMAC-SHA256(`"${timestamp}\n${secret}"`, "").base64 | ALARM_WEBHOOK_SECRET |
| 关键词验证 | 消息标题包含 `[keyword]` 前缀 | ALARM_WEBHOOK_KEYWORD |

**签名验证流程：**
1. Lambda 构造 `stringToSign = "${timestamp}\n${secret}"`
2. 计算 `HMAC-SHA256(stringToSign, "")` 并 base64 编码
3. 将 `timestamp` 和 `sign` 添加到请求 JSON 顶层
4. 飞书 Webhook 服务端用配置的 secret 执行相同计算，比对签名

**关键词验证流程：**
1. 消息标题以 `[keyword] ` 为前缀
2. 飞书检查消息内容是否包含该关键词
3. 不包含则拒收（返回错误）

两种方式可同时启用。配置持久化在 `.local/deploy-config` 中。

## Token 刷新周期

每 30 分钟一次（EventBridge rate 触发），access_token 剩余不足一半有效期时自动续期。刷新完成后记录结构化日志：

```json
{"event": "refresh_cycle", "refreshed": 5, "failed": 0, "skipped": 1, "total": 12, "keySwapped": 0, "keySwapFailed": 0, "stragglers": 0}
```

其中 `total` 作为 ActiveUsers 指标发布到 Dashboard。`keySwapped` / `keySwapFailed` / `stragglers` 跟踪每应用的 CMK 迁移：`keySwapped` 是本轮迁移并确认成功的 secret 数，`stragglers`（作为 CmkStragglers 指标发布）是仍未迁移到 CMK 的 secret 数——所有 secret 迁移完成后收敛到 0。

## 多应用可观测性

按应用部署（`--app <slug>`）拥有**独立**的可观测性：带 slug 后缀的指标命名空间 `LarkMcpOnAgentCore/<slug>`、带 slug 后缀的告警名与 `ApiName` 维度、以及每应用独立的 Dashboard `lark-mcp-on-agentcore-<slug>`。这避免一个应用的告警在另一个应用（或汇总）指标上误触发。

可选的**跨应用汇总 Dashboard**（`lark-mcp-on-agentcore-fleet`）可用 `DEPLOY_ROLLUP=1` 部署（见 `infra/lib/fleet-dashboard.ts`）。它通过 CloudWatch `SEARCH()` 表达式自动发现所有应用,不拥有任何告警或 SNS topic,因此删除它绝不影响告警——其生命周期与各应用栈完全解耦。

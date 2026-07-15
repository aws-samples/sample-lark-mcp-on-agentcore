[中文](observability_zh.md) | [English](observability_en.md)

# Observability

## Overview

The system automatically creates comprehensive observability infrastructure during deployment: 11 CloudWatch alarms, 15 log MetricFilters (6 alarm-driving + 9 dashboard-only; the other 5 alarms use Lambda built-in metrics or `AWS/ApiGateway` 5XXError), a multi-section Dashboard, and optional Feishu group webhook alarm notifications. All observability data is designed around two core questions: **Can users access the service normally?** and **Are any tokens being lost?**

## Alarms (11)

All alarms connect to a single SNS Topic (`lark-mcp-on-agentcore-alarms`) that can simultaneously subscribe email, Feishu webhooks, PagerDuty, etc.

| # | Alarm Name | Metric Source | Default Threshold | Period | Eval Periods | Trigger Description |
|---|-----------|--------------|-------------------|--------|-------------|-------------------|
| 1 | TokenLost | MetricFilter: `store_token_lost` | >= 1 | 60s | 1 | **Most severe**: refresh_token consumed but new token storage failed; user must re-authorize |
| 2 | RefreshFailed | MetricFilter: `refresh_cycle` ($.failed) | >= 3 | 300s | 1 | 3+ users failed refresh in a cycle (possible Feishu API issue) |
| 3 | OAuthErrors | Lambda built-in Errors metric (OAuth Lambda) | >= 5 | 300s | 2 | Uncaught exceptions in OAuth Lambda — code bug or dependency unavailable |
| 4 | MiddlewareErrors | Lambda built-in Errors metric (Middleware Lambda) | >= 5 | 300s | 2 | Uncaught exceptions in MCP middleware Lambda |
| 5 | McpLatencyP95 | MetricFilter: `McpLatencyMs` (p95) | >= 10000ms | 300s | 3 | MCP request P95 latency exceeds 10s — significant UX degradation |
| 6 | FeishuNotAuth | MetricFilter: `feishu_not_authorized` | >= 10 | 300s | 2 | Many users with invalid tokens — possible mass revocation or app config change |
| 7 | Concurrency | Lambda ConcurrentExecutions (Middleware) | >= 80% of quota (default 1000) | 60s | 3 | Lambda concurrency nearing limit; subsequent requests may be throttled. **Note:** threshold is computed against `LAMBDA_CONCURRENCY_QUOTA` env var (default 1000), not auto-detected from the account. If your account quota differs, set this env var before deploy |
| 8 | Throttles | Lambda Throttles (Middleware) | >= 1 | 300s | 1 | Throttling has occurred — user requests are being rejected |
| 9 | ApiGateway5xx | AWS/ApiGateway 5XXError | >= 5 | 300s | 2 | Gateway-level server errors (not Lambda errors; e.g., integration timeouts) |
| 10 | AgentCore5xx | MetricFilter: `agentcore_5xx` | >= 3 | 300s | 1 | AgentCore upstream returned 5xx — container issue or AWS service failure |
| 11 | CmkStragglers | MetricFilter: `refresh_cycle` ($.stragglers) | > 0 | 1800s | 4 | User token secrets still **not** on the per-app CMK after a refresh cycle. Healthy migration converges to 0; staying > 0 signals a stuck/misconfigured key (e.g. missing `kms:Encrypt`). Long period + 4 eval periods so the normal post-deploy convergence window does not page |

Alarms treat missing data as not breaching (`treatMissingData: NOT_BREACHING`), since absence of data points during low-traffic periods is expected behavior.

## MetricFilters (15)

All MetricFilters publish to namespace `LarkMcpOnAgentCore` (per-app: `LarkMcpOnAgentCore/<slug>`). 6 of them drive alarms (marked "Alarm"); the other 9 are dashboard-only. **Note:** 5 additional alarms (OAuthErrors / MiddlewareErrors / Concurrency / Throttles / ApiGateway5xx) consume Lambda built-in metrics or the `AWS/ApiGateway` namespace and do **not** depend on a MetricFilter.

**Alarm-to-MetricFilter coupling:** McpLatencyAlarm and FeishuNotAuthAlarm reference their metrics by `namespace + metricName` strings (no explicit CDK dependency), whereas the other alarms call `filter.metric(...)` directly. If the corresponding MetricFilter is renamed or deleted without updating the alarm, the alarm will silently go blind — CloudFormation will not error, and CloudWatch will simply show Insufficient Data. When renaming McpLatencyFilter or FeishuNotAuthorizedFilter, always sync the alarm references.

| # | MetricFilter | Log Source | Match Pattern | Output Metric | Type | Purpose |
|---|-------------|-----------|--------------|---------------|------|---------|
| 1 | TokenLossFilter | OAuth Lambda | `$.event = "store_token_lost"` | TokenLost (count) | Alarm | Token loss alarm |
| 2 | RefreshFailedFilter | OAuth Lambda | `$.event = "refresh_cycle" AND $.failed exists` | RefreshFailed ($.failed value) | Alarm | Refresh failure count alarm |
| 3 | AgentCore5xxFilter | Middleware Lambda | `$.event = "agentcore_5xx"` | AgentCore5xx (count) | Alarm | Upstream error alarm |
| 4 | McpLatencyFilter | Middleware Lambda | `$.event = "mcp_request_ok"` | McpLatencyMs ($.durationMs) | Alarm + Dashboard | P95/P99 latency (McpLatencyP95 alarm + Dashboard) |
| 5 | FeishuNotAuthorizedFilter | Middleware Lambda | `$.event = "feishu_not_authorized"` | FeishuNotAuthorized (count) | Alarm + Dashboard | Unauthorized request count (FeishuNotAuth alarm + Dashboard) |
| 6 | FeishuSlowFilter | OAuth Lambda | `$.event = "feishu_slow"` | FeishuSlow (count) | Dashboard | Feishu slow call count |
| 7 | AgentCoreSlowFilter | Middleware Lambda | `$.event = "agentcore_slow"` | AgentCoreSlow (count) | Dashboard | AgentCore slow call count |
| 8 | McpRequestOkFilter | Middleware Lambda | `$.event = "mcp_request_ok"` | McpRequestOk (count) | Dashboard | Successful request volume (traffic chart) |
| 9 | AuthFailFilter | Middleware Lambda | anyTerm: `token_verify_failed`, `auth_missing_or_invalid` | AuthFail (count) | Dashboard | Auth failure rate |
| 10 | OAuthStartFilter | OAuth Lambda | `$.event = "oauth_authorize_start"` | OAuthAuthorizeStart (count) | Dashboard | OAuth funnel top |
| 11 | OAuthCallbackOkFilter | OAuth Lambda | `$.event = "oauth_callback_success"` | OAuthCallbackSuccess (count) | Dashboard | OAuth funnel bottom |
| 12 | NewUserFilter | OAuth Lambda | `$.event = "new_user_authorized"` | NewUserAuthorized (count) | Dashboard | New user growth |
| 13 | ActiveUsersFilter | OAuth Lambda | `$.event = "refresh_cycle"` | ActiveUsers ($.total value) | Dashboard | Active user count |
| 14 | FeishuSlowLatencyFilter | OAuth Lambda | `$.event = "feishu_slow"` | FeishuSlowLatencyMs ($.durationMs) | Dashboard | Feishu slow call latency (percentiles) |
| 15 | CmkStragglersFilter | OAuth Lambda | `$.event = "refresh_cycle" AND $.stragglers exists` | CmkStragglers ($.stragglers value) | Alarm | User secrets not yet on the CMK (migration canary) |

## Dashboard Sections

Dashboard name: `lark-mcp-on-agentcore`, auto-created, contains 5 sections:

### 1. Alarm Status Overview
- AlarmStatusWidget showing real-time status of all 11 alarms (green/yellow/red)
- At-a-glance system health assessment

### 2. MCP Traffic
- **Request Volume**: McpRequestOk (5min granularity)
- **Latency**: McpLatencyMs Average / P95 / P99
- **Errors**: AgentCore5xx + AgentCoreSlow + FeishuSlow

### 3. Lambda Health
- **Invocations**: OAuth Lambda + Middleware Lambda invocation counts
- **Duration**: Both Lambdas' Average + P95 Duration
- **Errors & Throttles**: Left axis Errors, right axis Throttles

### 4. OAuth & Token
- **OAuth Funnel**: OAuthAuthorizeStart -> OAuthCallbackSuccess -> NewUserAuthorized (1h granularity)
- **Token Refresh**: RefreshFailed + TokenLost (1h granularity)
- **Users**: ActiveUsers (Maximum) + AuthFail (auth failures)

### 5. Infrastructure
- **API Gateway 4xx/5xx**
- **Lambda Concurrency**: OAuth + Middleware ConcurrentExecutions (Maximum)
- **Feishu Status**: Left axis FeishuNotAuthorized, right axis FeishuSlowLatencyMs (Average + P95)

## Alarm Presets

Three presets available during deploy, selected via arrow keys:

| Alarm | Relaxed | Standard | Strict |
|-------|---------|----------|--------|
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

(`cmk_stragglers` is not preset-tunable — it is a fixed `> 0` convergence canary defined only in `config/alarm-thresholds.json`.)

Preset definitions: `config/alarm-presets.json`

**Selection guidance:**
- **Relaxed**: Dev/test environments, or very few users. Tolerates occasional errors, avoids noisy alerts.
- **Standard**: Recommended for production. Balances sensitivity with noise.
- **Strict**: High service quality requirements. Any anomaly triggers immediate alarm; suitable for environments with on-call response teams.

## Custom Alarm Thresholds

Select "Custom" during deploy to adjust individual alarm thresholds:

1. System displays all alarms with current thresholds
2. Arrow keys to select an alarm to modify
3. Shows description and suggested range for that alarm
4. Enter new threshold value
5. Repeat until selecting "Done"

Custom values save to `.local/alarm-thresholds.json` (not committed, file permission 600). Subsequent `deploy.sh` runs detect existing customizations and ask whether to keep them.

Default thresholds in `config/alarm-thresholds.json` include:
- `threshold`: trigger value
- `period`: evaluation period (seconds)
- `evaluationPeriods`: consecutive breach count
- `unit` / `unit_en`: display unit
- `range`: suggested adjustment range

## Webhook Security

Alarm webhook supports two security verification methods (configured at deploy):

| Method | Mechanism | Config Key |
|--------|-----------|-----------|
| Signature | HMAC-SHA256(`"${timestamp}\n${secret}"`, "").base64 | ALARM_WEBHOOK_SECRET |
| Keyword | Message title includes `[keyword]` prefix | ALARM_WEBHOOK_KEYWORD |

**Signature verification flow:**
1. Lambda constructs `stringToSign = "${timestamp}\n${secret}"`
2. Computes `HMAC-SHA256(stringToSign, "")` and base64-encodes the result
3. Adds `timestamp` and `sign` to the request JSON at top level
4. Feishu webhook server performs the same computation with its configured secret and compares signatures

**Keyword verification flow:**
1. Message title is prefixed with `[keyword] `
2. Feishu checks that message content contains the keyword
3. Rejects messages that do not contain it

Both methods can be enabled simultaneously. Configuration persists in `.local/deploy-config`.

## Token Refresh Cycle

Runs every 30 minutes (EventBridge rate trigger), auto-renews when access_token has less than half its TTL remaining. After completion, emits structured log:

```json
{"event": "refresh_cycle", "refreshed": 5, "failed": 0, "skipped": 1, "total": 12, "keySwapped": 0, "keySwapFailed": 0, "stragglers": 0}
```

The `total` field is published as the ActiveUsers metric on the Dashboard. `keySwapped` / `keySwapFailed` / `stragglers` track the per-app CMK migration: `keySwapped` is secrets migrated and confirmed this cycle, `stragglers` (published as the CmkStragglers metric) is secrets still off the CMK — it converges to 0 once every secret is migrated.

## Multi-App Observability

Per-app deployments (`--app <slug>`) get their **own** isolated observability: a slug-suffixed metric namespace `LarkMcpOnAgentCore/<slug>`, slug-suffixed alarm names and `ApiName` dimensions, and a per-app dashboard `lark-mcp-on-agentcore-<slug>`. This keeps one app's alarms from firing on another's (or the summed) metrics.

An **optional cross-app roll-up dashboard** (`lark-mcp-on-agentcore-fleet`) can be deployed with `DEPLOY_ROLLUP=1` (see `infra/lib/fleet-dashboard.ts`). It auto-discovers every app via CloudWatch `SEARCH()` expressions and owns no alarms or SNS topic, so deleting it never affects alerting — its lifecycle is fully decoupled from the per-app stacks.

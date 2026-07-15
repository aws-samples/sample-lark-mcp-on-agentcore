[中文](cost_zh.md) | [English](cost_en.md)

# Cost

## Billing Model

No license or subscription fees. Infrastructure costs split into a small fixed portion (incurred once deployed) and usage-based portion (scales with users and requests). Most components have AWS free tier, so monthly costs are minimal at low usage levels.

## Fixed vs Usage-Based Costs

| Type | Component | Notes |
|------|-----------|-------|
| **Fixed** | Secrets Manager (feishu-app) | 1 secret that always exists, stores Feishu App ID/Secret |
| **Fixed** | SSM Parameter Store (state-secret + oauth-client-secret) | 2 SecureStrings; Standard tier is free |
| **Fixed** | CloudWatch Alarms x 11 | Created at deploy, do not scale with users |
| **Fixed** | KMS customer-managed key (user-token CMK) | 1 key per app, $1/month; created at deploy |
| **Fixed** | ECR image storage | Each deploy overwrites the same image, ~600 MB |
| **Fixed** | EventBridge rule | Triggers Lambda every 30 minutes, within free tier |
| **Fixed** | WAFv2 (optional) | WebACL + rule monthly fees are fixed |
| **Usage** | Secrets Manager (user tokens) | 1 user secret per authorized user |
| **Usage** | AgentCore Runtime | vCPU-seconds + memory-seconds, billed by actual MCP request processing time |
| **Usage** | Lambda invocations | MCP requests → Middleware Lambda; Token refresh → OAuth Lambda; Alarm relay → Alarm Webhook Lambda (only created when a webhook is configured) |
| **Usage** | API Gateway | Every MCP/OAuth request passes through API Gateway |
| **Usage** | CloudFront | Data transfer per request |
| **Usage** | CloudWatch Logs | Log ingestion and storage grow with request volume |
| **Usage** | DynamoDB | OAuth authorization code writes/reads/deletes |
| **Usage** | KMS requests | Encrypt/Decrypt on token store/read (refresh loop + every MCP tool call) |

## Component Details

| Component | Billing |
|-----------|---------|
| AgentCore Runtime | Per vCPU-second + memory-second (see [official AWS pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)) |
| Secrets Manager | $0.40/secret/month + $0.05/10,000 API calls |
| DynamoDB (OAuth codes) | PAY_PER_REQUEST + TTL; < $0.10/month |
| CloudWatch Logs | $0.50/GB ingested + $0.03/GB/month stored (retention configurable at deploy) |
| CloudWatch Alarms x 11 | $0.10/alarm/month, ~$1.10 total |
| KMS customer-managed key (user-token CMK) | $1.00/key/month + $0.03/10,000 requests; 1 key per app, annual rotation included |
| SSM Parameter Store (Standard SecureString x 2) | Free (Standard tier has no charge; only Advanced tier costs $0.05/parameter/month) |
| ECR image storage | ~$0.10/GB/month (image ~600 MB) |
| WAFv2 (optional, default off) | $5/WebACL/month + $1/rule/month + $0.60/M requests |
| Lambda | $0.20/M requests + compute time (128-512 MB, 10-120s) |
| API Gateway | $3.50/M requests (REST API) |
| CloudFront | $0.085/GB transfer + $0.0075/10K requests (PriceClass 200) |
| EventBridge | $1.00/M events (~1,440 triggers/month, within free tier) |
| SNS | $0.50/M notifications |

## Monthly Cost Estimates

Estimates below are based on us-west-2 pricing, assuming each user makes an average of 20 MCP requests per workday, with each request taking approximately 3 seconds of AgentCore processing time.

**Secrets Manager assumption:** 1 secret per user (user token) + 1 fixed secret (feishu-app).

### 10 Users (Small Team / Trial)

1 fixed + 10 user secrets = 11 secrets total.

| Component | Monthly Cost |
|-----------|-------------|
| Secrets Manager (1 fixed + 10 user) | $4.40 |
| SSM Parameter Store (Standard) | Free |
| CloudWatch Alarms x 11 | $1.10 |
| KMS CMK (1 key + requests) | ~$1.00 |
| ECR (~0.6 GB) | $0.06 |
| Lambda (OAuth: ~1440 refresh + Middleware: ~4400) | Within free tier |
| API Gateway (~4400 requests) | Within free tier |
| CloudFront (~4400 requests) | Within free tier |
| CloudWatch Logs (~50 MB/month) | $0.03 |
| DynamoDB | < $0.01 |
| AgentCore Runtime (~3700 vCPU-seconds) | Per AWS pricing |
| **Total (excl. AgentCore/WAF)** | **~$6.60/month** |

### 100 Users (Medium Team)

1 + 100 = 101 secrets total.

| Component | Monthly Cost |
|-----------|-------------|
| Secrets Manager (1 + 100) | $40.40 |
| SSM Parameter Store (Standard) | Free |
| CloudWatch Alarms x 11 | $1.10 |
| KMS CMK (1 key + requests) | ~$1.00 |
| ECR (~0.6 GB) | $0.06 |
| Lambda (~1440 refresh + ~44000 MCP) | $0.01 (still near free tier) |
| API Gateway (~44000 requests) | $0.15 |
| CloudFront (~44000 requests, ~100 MB transfer) | $0.04 |
| CloudWatch Logs (~500 MB/month) | $0.25 |
| DynamoDB (~100 authorizations) | < $0.01 |
| AgentCore Runtime (~37000 vCPU-seconds) | Per AWS pricing |
| **Total (excl. AgentCore/WAF)** | **~$43/month** |

### 500 Users (Large Team)

1 + 500 = 501 secrets total.

| Component | Monthly Cost |
|-----------|-------------|
| Secrets Manager (1 + 500) | $200.40 |
| SSM Parameter Store (Standard) | Free |
| CloudWatch Alarms x 11 | $1.10 |
| KMS CMK (1 key + requests) | ~$1.05 |
| ECR (~0.6 GB) | $0.06 |
| Lambda (~1440 refresh + ~220000 MCP) | $0.20 |
| API Gateway (~220000 requests) | $0.77 |
| CloudFront (~220000 requests, ~500 MB transfer) | $0.20 |
| CloudWatch Logs (~2.5 GB/month) | $1.25 |
| DynamoDB (~500 authorizations) | < $0.05 |
| AgentCore Runtime (~185000 vCPU-seconds) | Per AWS pricing |
| WAFv2 (recommended at this scale) | $7.00 + $0.13 |
| **Total (excl. AgentCore)** | **~$212/month** |

**Note:** AgentCore Runtime is the largest variable cost, billed by actual processing time. Exact amounts depend on AWS pricing (which changes over time). Refer to the [AWS Bedrock AgentCore pricing page](https://aws.amazon.com/bedrock/agentcore/pricing/) for current figures.

**On Runtime idle timeout:** Configurable at deploy: 5 / 10 / 15 / 30 min (default 10 min, shorter than AWS's 15 min default). Sessions accrue vCPU-seconds while idle, so a shorter timeout cuts cost at the price of more cold starts. 10 min covers typical conversation bursts and saves about 30% on idle cost vs the AWS default. Re-deploy to change.

**On multiple Feishu apps:** Costs are **per app**. Each app deployed with `--app <slug>` gets its own fixed components (11 alarms, 1 KMS CMK, per-app dashboard, the feishu-app secret, SSM params) plus its own per-user usage. The fixed portion is roughly multiplied by the number of apps; the WAF, if enabled, is shared across apps in the same region.

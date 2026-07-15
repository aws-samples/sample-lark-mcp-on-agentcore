[中文](cost_zh.md) | [English](cost_en.md)

# 成本

## 计费模型

无许可费或订阅费。基础设施成本分为少量固定项（部署即产生）和按用量项（随用户数和请求量增长）。大部分组件都有 AWS 免费额度，低用量场景下月成本极低。

## 固定成本 vs 按用量成本

| 类型 | 组件 | 说明 |
|------|------|------|
| **固定** | Secrets Manager (feishu-app) | 始终存在的 1 个 Secret，存储飞书 App ID/Secret |
| **固定** | SSM Parameter Store (state-secret + oauth-client-secret) | 2 个 SecureString，标准层免费 |
| **固定** | CloudWatch Alarms x 11 | 部署即产生，不随用户数变化 |
| **固定** | KMS 客户自管密钥（用户 Token CMK） | 每应用 1 把，$1/月，部署即创建 |
| **固定** | ECR 镜像存储 | 每次部署覆盖同一镜像，约 600 MB |
| **固定** | EventBridge 规则 | 每 30 分钟触发一次 Lambda，免费额度内 |
| **固定** | WAFv2（可选） | WebACL + 规则的月费固定 |
| **按用量** | Secrets Manager (用户 Token) | 每个授权用户 1 个 user secret |
| **按用量** | AgentCore Runtime | vCPU-秒 + 内存-秒，按实际 MCP 请求处理时间计费 |
| **按用量** | Lambda 调用 | MCP 请求 → Middleware Lambda；Token 刷新 → OAuth Lambda；告警转发 → Alarm Webhook Lambda（仅在配置 webhook 时创建） |
| **按用量** | API Gateway | 每个 MCP/OAuth 请求经过 API Gateway |
| **按用量** | CloudFront | 每个请求的数据传输 |
| **按用量** | CloudWatch Logs | 日志摄入量和存储量随请求量增长 |
| **按用量** | DynamoDB | OAuth 授权码的写入/读取/删除 |
| **按用量** | KMS 请求 | 存/读 Token 时的 Encrypt/Decrypt（刷新循环 + 每次 MCP 工具调用） |

## 组件明细

| 组件 | 计费方式 |
|------|---------|
| AgentCore Runtime | 按 vCPU-秒 + 内存-秒 计费（详见 [AWS 官方定价](https://aws.amazon.com/bedrock/agentcore/pricing/)） |
| Secrets Manager | $0.40/密钥/月 + $0.05/10,000 次 API 调用 |
| DynamoDB (OAuth codes) | PAY_PER_REQUEST，临时数据 + TTL，月成本 < $0.10 |
| CloudWatch Logs | 按摄入量 $0.50/GB + 存储 $0.03/GB/月（部署时可配置保留天数） |
| CloudWatch Alarms x 11 | $0.10/告警/月，合计 ~$1.10 |
| KMS 客户自管密钥（用户 Token CMK） | $1.00/密钥/月 + $0.03/万次请求；每应用 1 把，含年度轮换 |
| SSM Parameter Store (Standard SecureString x 2) | 免费（Standard 层无费用，仅当升级到 Advanced 时按 $0.05/参数/月计费） |
| ECR 镜像存储 | ~$0.10/GB/月（镜像约 600 MB） |
| WAFv2（可选，默认关） | $5/WebACL/月 + $1/规则/月 + $0.60/百万请求 |
| Lambda | $0.20/百万请求 + 计算时间（128-512 MB，10-120s） |
| API Gateway | $3.50/百万请求 (REST API) |
| CloudFront | $0.085/GB 传输 + $0.0075/万请求 (PriceClass 200) |
| EventBridge | $1.00/百万事件（每月约 1,440 次触发，免费额度内） |
| SNS | $0.50/百万通知 |

## 月成本估算

以下估算基于 us-west-2 区域定价，假设每用户每工作日平均发起 20 次 MCP 请求，每次请求 AgentCore 处理时间约 3 秒。

**Secrets Manager 估算口径：** 每位用户 1 个 Secret（user token）+ 1 个固定 Secret（feishu-app）。

### 10 用户（小团队/试用）

1 个固定 Secret + 10 个 user Secret = 11 个 Secret。

| 组件 | 月成本 |
|------|--------|
| Secrets Manager (1 固定 + 10 user) | $4.40 |
| SSM Parameter Store (Standard) | 免费 |
| CloudWatch Alarms x 11 | $1.10 |
| KMS CMK (1 把密钥 + 请求) | ~$1.00 |
| ECR (~0.6 GB) | $0.06 |
| Lambda (OAuth: ~1440 次刷新 + Middleware: ~4400 次) | 免费额度内 |
| API Gateway (~4400 请求) | 免费额度内 |
| CloudFront (~4400 请求) | 免费额度内 |
| CloudWatch Logs (~50 MB/月) | $0.03 |
| DynamoDB | < $0.01 |
| AgentCore Runtime (~3700 vCPU-秒) | 按 AWS 定价 |
| **合计（不含 AgentCore/WAF）** | **~$6.60/月** |

### 100 用户（中型团队）

1 + 100 = 101 个 Secret。

| 组件 | 月成本 |
|------|--------|
| Secrets Manager (1 + 100) | $40.40 |
| SSM Parameter Store (Standard) | 免费 |
| CloudWatch Alarms x 11 | $1.10 |
| KMS CMK (1 把密钥 + 请求) | ~$1.00 |
| ECR (~0.6 GB) | $0.06 |
| Lambda (~1440 刷新 + ~44000 MCP) | $0.01 (仍在免费额度边缘) |
| API Gateway (~44000 请求) | $0.15 |
| CloudFront (~44000 请求, ~100 MB 传输) | $0.04 |
| CloudWatch Logs (~500 MB/月) | $0.25 |
| DynamoDB (~100 次授权) | < $0.01 |
| AgentCore Runtime (~37000 vCPU-秒) | 按 AWS 定价 |
| **合计（不含 AgentCore/WAF）** | **~$43/月** |

### 500 用户（大型团队）

1 + 500 = 501 个 Secret。

| 组件 | 月成本 |
|------|--------|
| Secrets Manager (1 + 500) | $200.40 |
| SSM Parameter Store (Standard) | 免费 |
| CloudWatch Alarms x 11 | $1.10 |
| KMS CMK (1 把密钥 + 请求) | ~$1.05 |
| ECR (~0.6 GB) | $0.06 |
| Lambda (~1440 刷新 + ~220000 MCP) | $0.20 |
| API Gateway (~220000 请求) | $0.77 |
| CloudFront (~220000 请求, ~500 MB 传输) | $0.20 |
| CloudWatch Logs (~2.5 GB/月) | $1.25 |
| DynamoDB (~500 次授权) | < $0.05 |
| AgentCore Runtime (~185000 vCPU-秒) | 按 AWS 定价 |
| WAFv2（推荐启用）| $7.00 + $0.13 |
| **合计（不含 AgentCore）** | **~$212/月** |

**注意：** AgentCore Runtime 是按实际处理时间计费的最大变量成本。具体金额取决于 AWS 定价（会随时间变化），建议查看 [AWS Bedrock AgentCore 定价页面](https://aws.amazon.com/bedrock/agentcore/pricing/) 获取最新数字。

**关于 Runtime 空闲回收：** 部署时可选 5/10/15/30 分钟（默认 10 分钟，比 AWS 默认 15 分钟更省）。session 在 idle 期间仍按 vCPU-秒计费，timeout 越短越省钱、冷启动越频繁。10 分钟覆盖典型对话 burst，约比 AWS 默认节省 30% idle 成本。重新部署可调整。

**关于多个飞书应用：** 成本是**按应用**计的。每个用 `--app <slug>` 部署的应用都有自己的固定组件（11 个告警、1 把 KMS CMK、独立 Dashboard、feishu-app secret、SSM 参数）以及各自的按用户用量。固定部分大致按应用数翻倍；WAF（若启用）在同区域的多个应用间共享。

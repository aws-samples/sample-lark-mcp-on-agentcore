[中文](faq_zh.md) | [English](faq_en.md)

# 常见问题

**Q: 如何连接 Kiro / Claude Code / Codex（与 Amazon Quick 有何不同）？**

A: 两条路径：
- **Kiro / Claude Code / Codex** — 只需 MCP 端点 URL，无需 secret。配置一段 JSON 后浏览器授权即可。详见 [connect-mcp-clients_zh.md](connect-mcp-clients_zh.md)。
- **Amazon Quick** — 用部署输出的 Client ID + Secret 手动配置。见 [quick-desktop-setup_zh.md](quick-desktop-setup_zh.md)。

**Q: 自助注册客户端连不上 / 注册被拒？**

A: 确认 URL 是 `/mcp` 端点（非 `/authorize`）。当前客户端均走 loopback，无需白名单。自定义 scheme（如 `cursor://`）不支持。

**Q: Quick Desktop 连接时认证失败？**

A: 检查飞书应用安全设置中的重定向 URL 是否包含部署输出的 Redirect URL。

**Q: 用户 30 天没使用，token 过期了？**

A: 下次连接时会自动重新触发飞书授权。

**Q: 部署需要哪些 AWS IAM 权限？**

A: 部署脚本使用 AWS CDK 创建 IAM Role、Lambda、API Gateway、CloudFront、DynamoDB、Secrets Manager、SSM、ECR、CloudWatch、SNS、EventBridge 等十余种资源，并通过 boto3 直接操作 AgentCore Runtime。建议部署用户具备 **AdministratorAccess**（或等效权限）。

如果组织不允许使用 AdministratorAccess，最小权限需覆盖：

| 服务 | 所需动作 |
|------|---------|
| CloudFormation | 完整 CRUD（CDK 底层） |
| IAM | CreateRole / AttachRolePolicy / PutRolePolicy（为 Lambda 和 Runtime 创建角色） |
| Lambda | Create / Update / GetFunction |
| API Gateway | 完整 CRUD |
| CloudFront | CreateDistribution / UpdateDistribution |
| Secrets Manager | Create / Put / Get / Delete / Describe / TagResource |
| SSM | PutParameter / GetParameter / DeleteParameter |
| DynamoDB | CreateTable / DeleteTable |
| ECR | 镜像推送（CDK 自动处理） |
| CloudWatch | PutMetricAlarm / PutDashboard |
| SNS | CreateTopic / Subscribe |
| EventBridge | PutRule / PutTargets |
| Bedrock AgentCore | CreateAgentRuntime / UpdateAgentRuntime / GetAgentRuntime |
| WAFv2（可选） | CreateWebACL / DeleteWebACL（需在 us-east-1） |
| STS | GetCallerIdentity（CDK bootstrap 检查） |

> 生产环境如需精确权限边界，可参考 [CDK 最小权限部署文档](https://docs.aws.amazon.com/cdk/v2/guide/security-iam.html) 并结合上述服务列表配置。

**Q: 部署失败了？**

A: 脚本支持重跑（幂等）。如需彻底重来：`cd infra && npx cdk destroy --all`。

**Q: 如何限制哪些用户可以使用？**

A: 飞书应用的「可用范围」控制。只有范围内的用户才能完成 OAuth 授权。

**Q: 如果 OAuth Client Secret 泄露了，非本组织的飞书用户能不能用这个服务操作自己的飞书？**

A: 不能。这里有**两道独立的关卡**，而 Client Secret 只够得着第一道：

- **关卡一（我们的 `/token` 端点，Client Secret 在此）：** 校验请求来自我们认可的客户端类型。
- **关卡二（飞书侧的 OAuth 同意，Client Secret 够不着）：** 要走到关卡一，用户必须**先在飞书完成授权**拿到一次性 auth code。本项目用的是飞书**自建应用（internal）**，它只在创建它的那一个组织内、对「可用范围」内的成员开放授权。非本组织的飞书账号在飞书侧就拿不到有效的 auth code，因此即便手握 Client Secret，`/token` 也会因缺少合法 auth code 而失败。

换句话说，「**谁能授权**」由飞书应用的类型与可用范围决定，**不由 Client Secret 决定**。需要注意的边界：如果将来把它改成**商店应用 / 多租户应用**并被其它组织安装，那道组织边界就会按飞书的发布配置放开——这与 Client Secret 仍然无关。各类凭据泄露的爆炸半径对比见 [安全文档 · 凭据泄露影响对比](security_zh.md#凭据泄露影响对比)。

**Q: 能不能让它主动发消息/群发通知，或在新消息到达时自动触发（机器人/事件）？**

A: 不能。本服务只以**用户自己的身份**同步调用飞书，不使用应用（bot）身份、也不订阅实时事件——主动推送、群发通知、无人值守定时任务、消息自动回复都不在范围内。这是「按用户隔离」定位的有意取舍（详见 README [能力边界](../README.md#能力边界)）。如需机器人/事件能力，需另建独立的飞书机器人服务。

**Q: Quick Desktop 显示 "Creation failed"？**

A: 检查两点：1) 飞书应用安全设置中是否添加了部署输出的 Redirect URL；2) Client Secret 是否与部署输出一致（如不确定可运行 `./scripts/ops.sh rotate-secret` 重新生成）。

**Q: 如何更新 lark-cli 版本？**

A: 按 `docs/skills/bump-lark-cli.md` 流程操作（提取 scope → 适配 Skill → deploy），或直接 `./scripts/deploy.sh --yes` 非交互部署。终端用户无需任何操作。

**Q: 轮换 Client Secret 后，已有用户需要重新授权吗？**

A: 不需要。`./scripts/ops.sh rotate-secret` 只更新 OAuth Client Secret（用于 Quick Desktop 在 `/token` 端点兑换 code 时校验），已发放的 MCP Bearer Token 仍然有效（这些 Token 由 SSM 中的 `STATE_SECRET` 派生的密钥签名，未发生变化）。但需要在 Quick Desktop connector 中更新 Client Secret，否则下一次需要兑换 code 时会失败。如需让所有 MCP Token 立即失效，应轮换 SSM 中的 `/lark-mcp-on-agentcore/state-secret`（会同时使 OAuth state 与 MCP Token 失效，需所有用户重新连接）。

升级 lark-cli 版本不影响已有用户。

**Q: 调用 API 报权限不足（如日历、消息搜索等）？**

A: 这是飞书应用的权限配置问题，不是客户端问题。解决方法：

1. 进入 [飞书开放平台](https://open.feishu.cn/app) → 你的应用 → **权限管理**
2. 搜索并开通所需权限（常见的如下表）
3. **重新发布应用版本**（权限变更需要发版才生效）
4. 用户无需重新授权——下次调用时权限自动生效

| 功能 | 所需权限 |
|------|---------|
| 读取日历/日程 | `calendar:calendar:read`、`calendar:calendar.event:read` |
| 搜索/读取消息 | `im:message:read`、`im:chat:read` |
| 发送消息 | `im:message:send_as_user` |
| 读取群聊列表 | `im:chat:read` |
| 搜索文档 | `drive:drive:read` |
| 读写多维表格 | `bitable:bitable:read`、`bitable:bitable:write` |

> 如果管理员在开放平台新增了 API 权限并发版，**之前已连接过的用户**不会自动获得新权限。需要重连，步骤：Quick Desktop → Settings → Capabilities → 最下方 Browse Connections → 搜索找到 Feishu Remote MCP → 点击卡片 → 点击 Test action APIs → 弹出页面右侧点击 Re-Connect → 弹出飞书授权页完成授权。

**Q: 收到 TokenLost 告警（store_token_lost）该怎么处理？**

A: 这是最严重的告警，意味着用户的 refresh_token 已被消耗但新 Token 写入 Secrets Manager 失败（5 次重试全部失败），该用户需要重新授权。处置步骤：

1. 在告警卡片或日志中找到 `userIdHash`（sha256 前 16 位）。**所有日志（包括 `oauth_callback_success`）只记录 hash，不含原始 user_id**（脱敏设计）。如需运行 `revoke`，运行 `aws secretsmanager list-secrets --filters Key=name,Values=lark-mcp-on-agentcore/users/` 列出所有用户名（路径末段即 user_id），逐个计算 sha256 前 16 位与告警 hash 比对
2. 通知该用户在 Quick Desktop 中重新连接（Settings → Capabilities → Connections → 找到 feishu → Sign in 重新授权）。重连时 OAuth 回调会通过 DynamoDB 中的 openid 映射（如果存在）或回退到同一飞书 `open_id` 复用 stable userId，最终调用 `CreateSecret` 重建用户 Secret
3. （可选）如需主动清理残留 Secret：`./scripts/ops.sh revoke <user_id>`。注意 `revoke` 仅删除 user secret，保留 DynamoDB 中的 openid 映射，因此用户重新授权后 stable userId 不变
4. 检查 CloudWatch Logs 中 `event=store_token_lost` 的上下文，常见根因：Secrets Manager 限流、IAM 权限被改、KMS 密钥不可用

```
fields @timestamp, userIdHash, error, refresh_token_consumed
| filter event = "store_token_lost"
| sort @timestamp desc
```

**Q: 调用低频工具时提示权限不足？**

A: 系统会自动检测缺失的权限并生成增量授权链接。用户点击链接，在飞书授权页确认新增权限即可（无需重新授权全部权限，飞书会累积已有权限）。

**Q: 支持哪些 AWS 区域？**

A: 取决于 AWS Bedrock AgentCore 的可用区域。部署脚本提供了常用区域选择。

**Q: 支持自定义域名吗？**

A: 支持。部署时脚本会提示输入自定义域名，或设置环境变量 `CUSTOM_DOMAIN=mcp.company.com`。

**Q: 支持国际版 Lark 吗？**

A: 支持。部署时设置环境变量 `LARKSUITE_CLI_BRAND=lark`。

**Q: 一个 AWS 账户能托管多个飞书应用吗？**

A: 可以。每个应用用一个简短 slug 部署：`./scripts/deploy.sh --app <slug> --alias "<名称>"`，之后用 `./scripts/ops.sh --app <slug> <命令>` 运维、用 `./scripts/teardown.sh --app <slug>` 拆除。保留的默认应用（不带 `--app`）维持与原部署字节一致的资源名。各应用完全隔离（凭证、Token、签名密钥、每应用独立 KMS 密钥），WAF 在同区域内共享。见 `docs/operations_zh.md`（多应用）与 `docs/security_zh.md`（多应用隔离）。

**Q: 用户 Token 在静态存储时如何加密？能用自己的 KMS 密钥吗？**

A: Secrets Manager 中的用户飞书 Token 使用部署时自动创建的**每应用客户自管 KMS 密钥（CMK）**加密——而非 AWS 托管默认密钥。解密权仅授予该应用的两个 Lambda 角色，因此仅持 `GetSecretValue`、无 KMS 权限的主体只能读到密文。存量 secret 经 30 分钟刷新循环透明迁移到 CMK（零感知、绝不破坏）。无需任何 BYOK 操作,默认即开启。见 `docs/security_zh.md`（静态存储加密）。

**Q: 收到 CmkStragglers 告警是什么意思？**

A: 说明刷新周期后仍有部分用户 Token secret 未迁移到本应用 CMK。这是迁移收敛探针：健康迁移会在几个 30 分钟周期内降到 0。若持续 > 0，最可能是 OAuth Lambda 角色缺 `kms:Encrypt` 授权（AWS 会静默跳过重加密）——检查该角色的 KMS 权限。它绝不破坏数据:换 key 卡住只会重试,绝不删除 Token。

**Q: 重复部署时需要重新输入所有配置吗？**

A: 不需要。所有配置（区域、语言、域名、WAF、日志保留天数、飞书凭证、Webhook URL）都会自动记忆。重新运行 `deploy.sh` 时直接回车即可保留上次选择。

**Q: 怎么配置告警通知？**

A: 部署时脚本会提示输入飞书群 Webhook URL。创建步骤：

1. 打开飞书，进入接收告警的群聊
2. 群设置（右上角 ⚙️）→ 群机器人 → 添加机器人
3. 选择「自定义机器人」→ 输入名称（如 "MCP 告警"）→ 下一步
4. 复制 **Webhook URL**（格式：`https://open.feishu.cn/open-apis/bot/v2/hook/xxx`）
5. 粘贴到部署脚本的提示中

可选安全配置：脚本还会提示输入**签名密钥**（HMAC 验证）和**关键词**（消息必须包含），两项均为可选但生产环境建议开启。

配置后，所有 CloudWatch 告警会以消息卡片推送到群聊。也可以后续通过 `aws sns subscribe` 订阅邮箱或其他渠道。

**Q: 怎么查看监控看板？**

A: 部署完成后会输出 Dashboard URL。也可以在 AWS CloudWatch 控制台搜索 `lark-mcp-on-agentcore` 看板。看板包含 5 个分区：告警状态、流量、Lambda、OAuth/Token、基础设施。

**Q: 日志保留多久？会一直累积吗？**

A: 部署时可选择保留天数（30/90/180/365/永不过期，默认 90 天）。超过保留期的日志自动删除，不会无限累积存储费用。

**Q: AgentCore Runtime 空闲回收时长怎么配置？**

A: 部署时可选 5/10/15/30 分钟（默认 10 分钟）。该值决定 session 静默多久后容器被回收。回收后下次请求会触发冷启动（首次容器拉起需要数秒到十几秒）。

权衡：
- **5 分钟**：用户量小、成本敏感；冷启动较频繁
- **10 分钟（推荐）**：覆盖典型对话 burst，比 AWS 默认 15 分钟节省 ~30% idle 成本
- **15 分钟**：AWS 默认值
- **30 分钟**：用户连续多次提问、对延迟敏感的场景

配置保存在 `.local/deploy-config` 的 `AGENTCORE_IDLE_TIMEOUT`，重新运行 `deploy.sh` 可修改。也可以通过环境变量 `AGENTCORE_IDLE_TIMEOUT=300 ./scripts/deploy.sh` 覆盖。

**Q: 怎么自定义告警阈值？**

A: 部署时提供三个预设（标准/宽松/严格），箭头选择即可应用。如需逐项调整，选"自定义"后箭头选择要修改的告警，会展示含义和建议范围。自定义值保存在 `.local/alarm-thresholds.json`（不进 git），后续 deploy 不会覆盖。

**Q: 部署时报 `exec /bin/sh: exec format error`？**

A: 本项目仅支持 **ARM64**，请换一台 ARM64 机器部署：Apple Silicon Mac，或 AWS Graviton 实例（t4g / c7g 等）。`deploy.sh` 会在构建前检测架构并提前报错。

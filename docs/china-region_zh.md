# AWS 中国区（aws-cn）部署

本分支（`china-region`）支持把服务部署到 AWS 中国区：宁夏 `cn-northwest-1` 和北京 `cn-north-1`。Amazon Bedrock AgentCore Runtime 已在这两个区域上线，所以架构和海外版一样，只是入口和分区相关的部分做了适配。

已验证：宁夏整栈部署完成，Kiro 通过 OAuth 动态注册连上并能调用工具（2026-10-30）。

## 与海外版的差异

| 项 | 海外（aws） | 中国区（aws-cn） |
|-|-|-|
| 公网入口 | CloudFront → REST API | HTTP API（`$default` stage，URL 没有路径前缀），不建 CloudFront |
| 防护 | 可选 WAFv2（us-east-1，CLOUDFRONT scope） | 不建 WAF；API Gateway 限流：全局 50 rps / 突发 100，`POST /register` 5 rps / 突发 10 |
| ARN 分区 | `arn:aws:` | `arn:aws-cn:` |
| 服务域名后缀 | `amazonaws.com` | `amazonaws.com.cn` |
| AgentCore 信任主体 | `bedrock-agentcore.amazonaws.com` | 同左（不能写成 `.com.cn`，否则报 `MalformedPolicyDocument`） |
| 控制台链接 | `console.aws.amazon.com` | `console.amazonaws.cn` |

### 为什么中国区用 HTTP API，不用 REST API

- 中国区 CloudFront 已不再接受新用户，并且即将下线，所以本项目在中国区不建 CloudFront，API Gateway 直接对外。
- REST API 的 stage URL 带 `/prod` 前缀。MCP 客户端会按 RFC 8414 / RFC 9728 从域名根路径推导 `/register`、`/.well-known/*`，这些请求会被 API Gateway 自己返回 403，动态客户端注册失败（Kiro 报 `Dynamic client registration rejected`）。
- REST API 还会把 Lambda 返回的 `WWW-Authenticate` 头改名为 `x-amzn-Remapped-WWW-Authenticate`，客户端拿不到 401 的认证提示。
- HTTP API 的 `$default` stage 直接挂在根路径上，响应头也原样返回，这两个问题都没有了。集成用 payload v1.0，Lambda 收到的事件格式和 REST 代理集成一样，Lambda 代码不用改。
- 中国区没有边缘优化（EDGE）端点。

## 部署

前提：ARM64 部署机；配置好中国区凭证 profile（下文用 `gcr` 举例）；已在飞书开放平台建好企业自建应用（见 [app-setup_zh.md](app-setup_zh.md)）。

```bash
git clone <this-repo> && cd <repo> && git checkout china-region
# 首次在该区域使用 CDK 时（中国区不需要 bootstrap us-east-1）
cd infra && AWS_PROFILE=gcr npx cdk bootstrap aws://<account>/cn-northwest-1 && cd ..
# 交互部署：region 选 cn-northwest-1 Ningxia (aws-cn)，品牌选 feishu
AWS_PROFILE=gcr AWS_REGION=cn-northwest-1 bash scripts/deploy.sh
# 再次部署，沿用上次的配置
AWS_PROFILE=gcr AWS_REGION=cn-northwest-1 bash scripts/deploy.sh --yes
```

> 用 `--yes` 非交互部署时要同时设置 `AWS_REGION`。中国区凭证调用 STS 时如果不带 region，会落到全球 endpoint，报 `InvalidClientTokenId`，脚本会误判为凭证没配置。

部署完成后，输出里会给出：
- MCP 端点：`https://<api-id>.execute-api.<region>.amazonaws.com.cn/mcp`
- 飞书重定向 URL：`https://<api-id>.execute-api.<region>.amazonaws.com.cn/callback`，填到飞书应用的「安全设置」里

客户端配置：`{"type":"http","url":"https://<api-id>.execute-api.<region>.amazonaws.com.cn/mcp"}`

## 验证

```bash
B=https://<api-id>.execute-api.<region>.amazonaws.com.cn
curl -s -o /dev/null -w '%{http_code}\n' $B/.well-known/oauth-authorization-server   # 200
curl -s -o /dev/null -w '%{http_code}\n' $B/.well-known/oauth-protected-resource     # 200
curl -s -D - -o /dev/null -X POST $B/mcp -H 'content-type: application/json' -d '{}' | grep -i 'www-authenticate'  # 401，并带 resource_metadata
```

## 升级说明

AgentCore Runtime 现在由 CloudFormation 管理（Runtime Stack 里的 `AWS::BedrockAgentCore::Runtime`），流量走服务自动维护的 `DEFAULT` endpoint。不声明自定义 endpoint，因为全新部署时它可能在 runtime 版本就绪前就开始创建，然后报 409 失败。

- 从旧版本（deploy.sh 用 boto3 创建 runtime）升级后的第一次部署，会先删掉旧 runtime，再用同名重建。runtime ID 会变，MCP 中断约 6 分钟；MCP 地址、回调地址和用户授权都不变
- 旧版本留下的自定义 endpoint `ep` 会被自动删除
- CloudWatch Dashboard 名字带 region 后缀（`lark-mcp-on-agentcore-<region>`）：Dashboard 在账号内全局唯一，不带后缀时，同一账号部署第二个 region 会报 already exists。升级后旧名字的 Dashboard 会被替换成新名字，指标数据不受影响

同一账号可以同时部署宁夏和北京（已实测）。

## 已知限制

- **ICP 备案**：和 CloudFront 一样，中国区 API Gateway 也要完成 ICP 备案才能从公网访问。部署前请确认 ICP 备案已经办好。要用自定义域名，域名也要完成 ICP 备案，再在 API Gateway 上配置自定义域名。
- 不建 WAF，只有 API Gateway 限流。
- 在境内构建镜像时，npm、GitHub、awscli 下载可能很慢或访问不了，建议在海外构建。
- 中国区 AgentCore 的 Memory、Gateway connector 等功能不可用。本项目只用 Runtime，不受影响。

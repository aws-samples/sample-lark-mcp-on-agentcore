[中文](structure_zh.md) | [English](structure_en.md)

# 项目结构

```
config/
  i18n.json           多语言字符串 (shell/dashboard/alarm/callback)
  alarm-thresholds.json  告警阈值默认配置 (threshold/period/evaluationPeriods)
  alarm-presets.json     告警预设方案 (standard/relaxed/strict)
  oauth-scopes.json   首次授权请求的 scope 列表 (Tier1 覆盖)
docker/
  Dockerfile          lark-cli ARM64 容器 (锁定 lark-cli 版本)
  package.json        容器运行时依赖 (AWS SDK)
  generate-tools.js   Build 时生成工具目录 + scope 映射
  shortcut-scopes.json  lark-cli 命令 → scope 映射 (源码提取)
  server.js           MCP server (tier1 + discover/invoke + skills + semaphore + SIGTERM)
  server-lib.js       抽取的可单测 helper (patchPermissionError, createSemaphore)
  tier1.json          28 个高频工具
  skills/             MCP 适配后的 Skill (从 lark-cli skills 转换，由 lark_get_skill 提供)
    */scripts/        Skill 内置 Python 脚本 (由 lark_exec_script 执行)
    */assets/         脚本依赖的数据资产 (如模板 XML 文件)
infra/
  lib/oauth-stack.ts  OAuth + MCP + DDB + CloudWatch (Alarms + Dashboard + Webhook) + CloudFront + 用户 Token KMS CMK
  lib/runtime-stack.ts  Docker 镜像 + IAM (含 SM 读权限)
  lib/waf-stack.ts    CloudFront-scope WAFv2 (us-east-1，可选)
  lib/slug-names.ts   CDK 每应用名称解析器（与 scripts/lib/slug.sh 对应）
  lib/fleet-dashboard.ts  可选的跨应用汇总 Dashboard（DEPLOY_ROLLUP=1）
lambda/
  token-refresh-shim/ OAuth 流程 + Token 自动刷新 (preflight+retry)
                      __tests__/        单元测试 (vitest)
                      dynamodb-codes.ts OAuth code 临时存储
                      dynamodb-openid.ts OpenID→userId 映射 (DynamoDB)
  mcp-middleware/     Token 验证 + SigV4 代理 + 25s timeout
  alarm-webhook/      SNS → 飞书群 Webhook (消息卡片格式转换)
scripts/
  deploy.sh           交互式部署 (中/英双语，可选 WAF 跨区域 bootstrap; --app <slug> 支持多应用)
  install.sh          一键安装 (中/英双语)
  ops.sh              运维工具 (status/list-users/list-apps/rename/revoke/refresh-all/logs/rotate-secret/destroy; --app <slug>)
  teardown.sh         销毁单个应用 (Runtime + CDK + WAF-若为最后一个 + 可选 user-token 清理; --app <slug>)
  upgrade.sh          多应用协同升级 (--canary / --rest / --all / --rollback <slug>)
  lib/slug.sh         应用 slug → 资源名解析器 (deploy/ops/teardown/upgrade 共享 source)
  lib/registry.sh     基于文件的应用注册表 + 别名原子唯一性 (.local/apps.json)
  lib/__tests__/      slug.sh + registry.sh 的纯 shell 单元测试
  test.sh             统一测试入口 (unit / coverage / mutation / audit / e2e)
  test-e2e.sh         端到端测试 (OAuth + Runtime + /mcp + WAF 如启用)
  audit-tools.sh      工具目录结构性自检 (15 项断言, 含 catalog snapshot)
  audit-deps.sh       多目录 npm audit
  check-lark-cli-version.sh  Dockerfile / scope-map 版本一致性检查
  check-lark-cli-upstream.sh  检测上游 lark-cli 是否有更新版本 (cron 触发)
  check-docs-agent.sh   LLM 文档一致性检查 (pre-push, 仅告警, 工具无关)
  build-scope-allowlist.sh   重新生成 OAuth scope allowlist
```

docs/skills/  （AI 辅助维护的 runbook）
  bump-lark-cli.md       lark-cli 版本升级 runbook (提取策略 + 步骤)
  bump-lark-cli-to-pr.md  无人值守 检测→重生成→评审→起草PR 编排 (停在 PR)
  adapt-skill-for-mcp.md  把 lark-cli skill 转换为 MCP 形态的规则

.local/ （已 gitignore，存储每次部署的本地状态）
  deploy-config            部署配置记忆
  alarm-thresholds.json    用户自定义告警阈值
  deploy-output.md         部署输出信息

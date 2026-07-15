# lark-mcp-on-agentcore

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![lark-cli](https://img.shields.io/badge/lark--cli-pinned-blue)](https://github.com/larksuite/cli)
[![AgentCore](https://img.shields.io/badge/AWS-Bedrock%20AgentCore-orange)](https://aws.amazon.com/bedrock/agentcore/)

[English](#english) | [中文](#中文)

# English

**A hosted remote MCP service built on top of [lark-cli](https://github.com/larksuite/cli) — so remote MCP clients (e.g. [Amazon Quick Desktop](https://aws.amazon.com/quick/desktop/), [Kiro](https://kiro.dev/), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://openai.com/index/introducing-codex/)) can call Feishu's 2500+ APIs via 200+ tools, and complete multi-step operations with the right parameters, order, and preconditions.**

[lark-cli](https://github.com/larksuite/cli) is Feishu's official command-line tool that wraps the 2500+ APIs into 200+ tools and ships 20+ domain Skills capturing multi-step orchestration best practices (parameter formats, call order, preconditions). This project executes all API calls via lark-cli inside the container, inheriting its full capabilities (Skills included, adapted into MCP form and loaded on demand). On top of that, it fills the gaps lark-cli has as a team service:

- **Zero-friction for end users.** Members authorize once in the browser — no local install, no config, no technical skill required. Every call runs under each user's own Feishu identity, data isolated per user.
- **Centrally managed for IT.** One Feishu app, one admin deploy, shared by everyone. The Feishu app and its credentials are managed centrally, so IT can audit scopes and app visibility in one place; tokens are encrypted server-side and auto-refreshed.

Hosted on AWS Bedrock AgentCore: scales to zero when idle, pay-per-use, with built-in observability.

## A complex orchestration example

Simple operations (check the calendar, send a message, create a record) are one correct call away for an AI. The real value shows in **multi-step orchestration** — where one sentence hides dependencies, ordering, and preconditions. For example:

> **"Schedule a product review tomorrow afternoon, invite the dev team, book a room, and create a follow-up task afterward."**

Once a remote MCP client connects to this service, the AI first loads the calendar and task Skills via `lark_get_skill`, then executes in order following their guidance:

| # | AI call | Why this step |
|---|---------|---------------|
| 1 | `lark_contact_search_user("dev team")` | Resolve "dev team" to open_ids — a precondition for inviting them |
| 2 | `lark_calendar_freebusy(...)` | Check attendees' availability to avoid conflicts |
| 3 | `lark_calendar_suggestion(...)` | When the time is vague, propose candidate slots and wait for confirmation |
| 4 | `lark_calendar_room_find(slot=confirmed)` | Find a room only for a concrete time block (Skill rule: no room lookup without an explicit time) |
| 5 | `lark_calendar_create(...)` | Create the event with attendees and room |
| 6 | `lark_task_create("review follow-up", ...)` | Create the post-meeting follow-up task |

Parameter formats, call order, and preconditions like "check free/busy before booking a room" all come from lark-cli's official Skills — this project rewrites them into MCP form and loads them on demand. Every action runs under the user's own Feishu identity, data isolated per user.

→ Full sequence diagram and the list of orchestration domains: [Smart Orchestration details](docs/skills_en.md).

## Deploy

> **Deploy from an ARM64 machine** (Apple Silicon Mac, or an AWS Graviton instance such as t4g / c7g). **Amazon Linux 2023** or **Ubuntu 24.04 LTS** (arm64) recommended.
>
> **Broad AWS permissions required.** Deployment uses CDK to create and configure CloudFormation, IAM, Lambda, API Gateway, CloudFront, DynamoDB, Secrets Manager, SSM, ECR, CloudWatch, SNS, EventBridge, KMS, and WAF, and drives the AgentCore Runtime directly via boto3 — spanning a dozen-plus services and including role creation and policy grants. **Use `AdministratorAccess` for the deploying identity** (grant it temporarily; you can revoke it after deploy). Scoping down permission-by-permission is tedious and error-prone.

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aws-samples/sample-lark-mcp-on-agentcore/main/scripts/install.sh)
```

Check deps → Feishu credentials → Region / WAF / Log retention / Alarm presets / Webhook → Confirm → Auto deploy

> Re-deploys and upgrades pre-fill previous config; change only what you need.

## Connect

After deploy, add this to any remote-MCP client:

```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "https://<your-domain>/mcp"
    }
  }
}
```

Save and authorize in the browser when prompted. See [Connect clients](docs/connect-mcp-clients_en.md).

## Architecture

Requests from a remote MCP client (e.g., Quick Desktop) → CloudFront → API Gateway → Middleware Lambda (MCP token verification + SigV4 signing) → AgentCore Runtime (MCP service container handles Feishu API calls). OAuth Lambda manages user authorization and auto-refreshes tokens every 30 minutes via EventBridge. All tokens encrypted in Secrets Manager (a dedicated KMS key only this service can decrypt).

<p align="center">
  <img src="docs/images/architecture-en.svg" alt="Architecture" width="720">
</p>

<details>
<summary>Components</summary>

| Category | Component | Description |
|---|---|---|
| Compute | AgentCore Runtime | MCP service container, stateless, auto-scaling, scale-to-zero |
| Compute | Lambda × 3 | OAuth flow + MCP proxy + alarm relay (the alarm-relay Lambda is created only when a webhook is configured) |
| Edge | CloudFront | HTTPS entry; optional WAFv2 rate limiting |
| Observability | CloudWatch | Dashboard (5 sections / 12 charts) + 10 Alarms → SNS → Feishu group |
| State | SM + DDB + SSM | Encrypted tokens + Auth codes + Signing keys |

</details>

## Why it's different

| Differentiator | Description |
|---|---|
| **Smart orchestration** | lark-cli's official 20+ domain Skills, rewritten into pure-MCP form and loaded on demand — so remote MCP clients can also read these best practices before acting |
| **Zero-friction for users, centrally managed for IT** | One Feishu app, one admin deploy, shared by everyone — non-technical members authorize once in the browser; the Feishu app is managed centrally, so IT can audit scopes and visibility in one place; each user acts under their own Feishu identity, data isolated per user |
| **Can host multiple Feishu apps** | When needed, the same infrastructure can host several independent Feishu apps in one AWS account, deployed isolated per slug (`deploy.sh --app <slug>`); credentials / tokens / keys are mutually invisible ([details](docs/operations_en.md)) |

<details>
<summary>Operational / security / cost features</summary>

| Feature | Description |
|---|---|
| **Pay-per-use** | AgentCore Runtime scales to zero when idle, billed by vCPU-seconds + memory-seconds |
| **Incremental auth** | Only common scopes are requested up front; the first time a low-frequency tool is used, an incremental-auth link is generated — the user clicks it, approves the new scope on the Feishu authorization page, and Feishu accumulates the existing scopes |
| **Low-ops** | Auto token refresh (30min), alarms auto-push to Feishu group, logs expire by policy |
| **Secure** | PKCE + HMAC tokens + WAF + Secrets Manager encryption (dedicated KMS key) ([details](docs/security_en.md)) |
| **Lightweight upgrade** | When lark-cli releases a new version, follow `docs/skills/bump-lark-cli.md` (extract scopes + adapt skills + deploy), end users need no action |

</details>

## Tool List

### Tier 1 — High-Frequency Tools (28, registered directly)

| Category | Tools |
|----------|-------|
| IM (5) | Send message, search messages, list groups, chat history, search groups |
| Calendar (4) | Agenda overview, create event, check availability, find meeting rooms |
| Docs (4) | Create, fetch, search, edit documents |
| Base (4) | Get table, query records, batch create records, search records |
| Drive (3) | Search, upload, download files |
| Task (3) | Create task, my tasks, complete task |
| Contact (2) | Search user, get user info |
| Sheets (2) | Read, write cells |
| Mail (1) | Send email |

### Meta Tools (5)

| Tool | R/W | Description |
|------|-----|-------------|
| `lark_discover` | read | Search all remaining lark-cli commands by keyword or category; returns name + full parameter schema |
| `lark_invoke` | read/write | Execute a tool found via discover (pass tool_name + args) |
| `lark_list_skills` | read | List all available Skills covering multi-step best practices per domain |
| `lark_get_skill` | read | Get the full Skill for a domain (e.g., calendar scheduling workflow, message sending rules) |
| `lark_exec_script` | read | Execute a Python script bundled with a Skill (e.g., icon search, template matching, XML validation) |

High-frequency tools are called directly; for complex orchestration (e.g., "schedule a meeting") the AI calls `lark_get_skill` first to get the workflow guide, then follows it.

<details>
<summary>Tier 2 — Extended Tools (200+, via discover/invoke)</summary>

| Category | Representative Features |
|----------|------------------------|
| Base | Advanced permissions, copy table, field/form/dashboard CRUD, record import/export |
| Sheets | Append rows, batch styles, merge cells, conditional formatting, data validation |
| Mail | Draft management, reply, forward, reply-all, templates, mail rules |
| Task | Assign, comment, followers, reminders, subtasks, tasklist management |
| Drive | Comments, permission requests, create folder, move/copy, export |
| IM | Create group, update group info, reply to messages, bookmarks, download attachments |
| OKR | Period list, objective details, progress records, upload images |
| VC | Meeting search, join/leave, minutes, recording, event list |
| Wiki | Space list, node create/copy/move, delete space |
| Docs | Media download/insert/preview, batch operations |
| Calendar | RSVP, smart time suggestions, update events |
| Markdown | Create, fetch, overwrite Markdown files |
| Minutes | Search minutes, download A/V, upload to generate minutes |
| Slides | Create presentation, upload images, replace page elements |
| Whiteboard | Export board, update board content |

</details>

## Smart Orchestration (Skill)

lark-cli's official 20+ domain Skills capture multi-step best practices — parameter formats, call order, preconditions. But those Skills originally relied on the client shell-executing lark-cli and reading local md files, so remote MCP clients couldn't use them. This project rewrites them into pure-MCP form and loads them on demand via `lark_get_skill` — e.g., "schedule a product review" follows resolve attendees → check free/busy → suggest slots → book room → create event → create follow-up. Loaded on demand, no fixed context cost.

Spanning 20+ domains: Calendar, IM, Bitable, Mail, Docs, VC, Task, Wiki, Sheets, OKR, Minutes, Whiteboard, and more.

→ See [Smart Orchestration details (sequence diagram + full domain list)](docs/skills_en.md)

## Docs

| Topic | Link |
|-------|------|
| Smart Orchestration (Skill) | [docs/skills_en.md](docs/skills_en.md) |
| Connect clients (Kiro / Claude Code / Codex) | [docs/connect-mcp-clients_en.md](docs/connect-mcp-clients_en.md) |
| Quick Desktop Setup (6 steps, screenshots) | [docs/quick-desktop-setup_en.md](docs/quick-desktop-setup_en.md) |
| Security | [docs/security_en.md](docs/security_en.md) |
| Observability & Alarms | [docs/observability_en.md](docs/observability_en.md) |
| Operations & Commands | [docs/operations_en.md](docs/operations_en.md) |
| Releasing (version scheme) | [docs/releasing_en.md](docs/releasing_en.md) |
| FAQ | [docs/faq_en.md](docs/faq_en.md) |
| Cost | [docs/cost_en.md](docs/cost_en.md) |
| Project Structure | [docs/structure_en.md](docs/structure_en.md) |

## Quick Commands

```bash
./scripts/deploy.sh          # Deploy / update
./scripts/ops.sh status      # System status
./scripts/ops.sh list-users  # Authorized users
./scripts/ops.sh logs        # Lambda logs
./scripts/teardown.sh        # Destroy all resources
```

## Scope & Limitations

This service is designed for **per-user identity isolation**. The following are deliberately out of scope as a consequence of that positioning:

- **User identity only, no application (bot) identity.** Every call runs under the caller's own Feishu identity, data isolated per user. So there are no bot-name operations — no proactive push, no broadcast notifications, no unattended scheduled jobs (these require application identity, which conflicts with per-user isolation).
- **No real-time event subscriptions.** It's a request/response model and does not receive Feishu push events (new messages, meeting-ended, etc.). Event subscription is application-level and incompatible with per-user isolation; and remote MCP clients (e.g. Quick) only make synchronous calls and don't receive server-side pushes anyway.
- **Per-call time limit.** Calls run synchronously — suited to instant queries and actions, not long-running or batch blocking tasks.
- **File transfer limitations.** Under the remote MCP architecture, the Agent is isolated from the container filesystem:
  - *Download*: Small files (< a few MB) can be returned as base64 via stdout; large files exceed the buffer limit and cannot be returned directly. Agents can use the raw API to obtain a temporary download URL for the user.
  - *Upload*: Commands requiring a local file path (`drive +upload`, `slides +media-upload`, etc.) are not available — the Agent cannot place files into the container. Commands with a `--content` parameter (e.g. `markdown +create`) work normally.

## Security Design

In addition to standard security measures (PKCE + HMAC + WAF + KMS encryption, see [Security docs](docs/security_en.md)), the `lark_exec_script` tool has additional defense-in-depth:

- **Boot-time frozen allowlist.** At container startup, all `skills/*/scripts/*.py` files are scanned into an in-memory Set. Only scripts in this list can be executed at runtime — even if an attacker writes a malicious file to the scripts/ directory via another tool, `lark_exec_script` will refuse to run it.
- **Read-only filesystem protection.** The Dockerfile sets scripts/ directories to permission 555 (read+execute only) at build time; the container process runs as a non-root user and cannot overwrite existing scripts.
- **Path whitelist regex.** Only matches `lark-[a-z-]+/scripts/[a-z0-9_]+.py` — rejects path traversal and illegal filenames.
- **Sandboxed execution.** Uses `execFile` (no shell), `cwd=/tmp`, 30s timeout, 10MB output cap, args restricted to string arrays. Curated env (PATH/HOME/LANG only, no AWS credentials); shares concurrency semaphore (prevents resource exhaustion) and graceful-shutdown tracking.

## Risk Notice

Having an AI Agent operate Feishu APIs as the user carries inherent risks such as model hallucination and prompt injection. See [lark-cli Security Warnings](https://github.com/larksuite/cli/blob/main/README.md#security--risk-warnings-read-before-use).

## Contact

For questions, suggestions, or support, please open a [GitHub Issue](../../issues) on this repository.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file.

It also bundles or derives from third-party components under their own licenses:
the Skill content under `docker/skills/**` is adapted from
[lark-cli](https://github.com/larksuite/cli) (MIT), and
`docker/skills/lark-slides/references/iconpark-index.json` is generated from
[IconPark](https://github.com/bytedance/IconPark) (Apache-2.0). See
[THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES) and [NOTICE](NOTICE) for the full
attributions.

---

# 中文

**在 [lark-cli](https://github.com/larksuite/cli) 之上构建的托管远程 MCP 服务——让支持远程 MCP 的客户端（如 [Amazon Quick Desktop](https://aws.amazon.com/quick/desktop/)、[Kiro](https://kiro.dev/)、[Claude Code](https://docs.anthropic.com/en/docs/claude-code)、[Codex](https://openai.com/index/introducing-codex/)）能通过 200+ 工具调用飞书 2500+ API，并以正确的参数、顺序、前置条件完成多步操作。**

[lark-cli](https://github.com/larksuite/cli) 是飞书官方命令行工具，封装了 2500+ API 为 200+ 工具，并附带 20+ 个业务域 Skill 沉淀多步编排的最佳实践（参数格式、调用顺序、前置条件）。本项目由容器内的 lark-cli 执行所有 API 调用，继承其全部能力（其中 Skill 已适配为 MCP 形态，按需加载）。在此基础上，补齐 lark-cli 在团队场景下的不足：

- **业务用户零门槛。** 成员浏览器授权一次即用，无需本地安装或配置——非技术用户也能直接上手；每人以自己飞书身份调用，数据按用户隔离。
- **IT 集中管控。** 只创建一个飞书应用、管理员部署一次，全员共用。飞书应用与凭证集中管理，IT 可统一审计权限范围、应用可见性；token 服务端加密存储并自动刷新。

底座 AWS Bedrock AgentCore：空闲缩零、按量计费，内置可观测性。

## 一个复杂编排的例子

简单操作（查日程、发消息、建记录）AI 一步就能调对。真正体现价值的是**多步编排**——一句话背后有依赖、有顺序、有前置条件。比如：

> **「帮我明天下午约个产品评审会，邀请研发组，需要会议室，会后建个跟进待办」**

支持远程 MCP 的客户端连上本服务后，AI 会先通过 `lark_get_skill` 加载 calendar 与 task 两个 Skill，按其指引依次执行：

| # | AI 调用 | 为什么是这一步 |
|---|---------|---------------|
| 1 | `lark_contact_search_user("研发组")` | 把"研发组"解析成 open_id——发邀请前的前置条件 |
| 2 | `lark_calendar_freebusy(...)` | 查参会人忙闲，避开冲突 |
| 3 | `lark_calendar_suggestion(...)` | 时间模糊时先推荐候选时段，等用户确认 |
| 4 | `lark_calendar_room_find(slot=已确认)` | 仅对确定的时间块找会议室（Skill 强制：无明确时间不得直接找会议室） |
| 5 | `lark_calendar_create(...)` | 落地日程，带上参会人与会议室 |
| 6 | `lark_task_create("评审跟进", ...)` | 创建会后跟进待办 |

参数格式、调用顺序、"先查忙闲再订会议室"这类前置约束，都来自 lark-cli 官方 Skill——本项目改写为 MCP 形态后按需加载。所有操作以用户自己的飞书身份执行，数据按用户隔离。

→ 完整时序图与编排域清单见 [智能编排详解](docs/skills_zh.md)。

## 部署

> **需在 ARM64 机器上部署**（Apple Silicon Mac，或 AWS Graviton 实例如 t4g / c7g）。推荐 **Amazon Linux 2023** 或 **Ubuntu 24.04 LTS**（arm64）。
>
> **需要较大的 AWS 权限。** 部署过程用 CDK 创建并配置 CloudFormation、IAM、Lambda、API Gateway、CloudFront、DynamoDB、Secrets Manager、SSM、ECR、CloudWatch、SNS、EventBridge、KMS、WAF 等资源，并通过 boto3 直接操作 AgentCore Runtime——横跨十几个服务且含建角色、发权限。**建议部署身份直接用 `AdministratorAccess`**（临时授予即可，部署完可回收），逐项收窄权限既繁琐又容易漏。

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aws-samples/sample-lark-mcp-on-agentcore/main/scripts/install.sh)
```

检查依赖 → 飞书凭证 → 区域 / WAF / 日志保留 / 告警预设 / Webhook → 确认 → 自动部署

> 重复部署或升级版本时自动填入上次配置，按需修改。

## 连接

部署完成后，在任意支持远程 MCP 的客户端中添加：

```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "https://<your-domain>/mcp"
    }
  }
}
```

保存后按提示在浏览器完成飞书授权即可。详见 [连接客户端](docs/connect-mcp-clients_zh.md)。

## 架构

支持远程 MCP 的客户端（如 Quick Desktop）发起请求 → CloudFront → API Gateway → Middleware Lambda（验证 MCP Token + SigV4 签名）→ AgentCore Runtime（MCP 服务容器处理飞书 API 调用）。OAuth Lambda 负责用户授权和 Token 自动刷新（每 30 分钟），EventBridge 定时触发。所有 Token 加密存储在 Secrets Manager 中（专用 KMS 密钥，仅本服务可解密）。

<p align="center">
  <img src="docs/images/architecture.svg" alt="Architecture" width="720">
</p>

<details>
<summary>组件一览</summary>

| 类别 | 组件 | 说明 |
|---|---|---|
| 计算 | AgentCore Runtime | MCP 服务容器，无状态，自动弹性，空闲缩零 |
| 计算 | Lambda × 3 | OAuth 流程 + MCP 代理 + 告警转发（告警转发 Lambda 仅在配置 webhook 时创建） |
| 边缘 | CloudFront | HTTPS 入口；可选 WAFv2 速率限制 |
| 可观测 | CloudWatch | Dashboard（5 板块 / 12 图表）+ 10 Alarms → SNS → 飞书群 |
| 状态 | SM + DDB + SSM | Token 加密存储 + Auth Code + 签名密钥 |

</details>

## 为什么不一样

| 差异化 | 说明 |
|---|---|
| **智能编排** | 把 lark-cli 官方 20+ 个业务域 Skill 改写为纯 MCP 形态、按需加载——让支持远程 MCP 的客户端也能在操作前读到这些最佳实践 |
| **业务用户零门槛、IT 集中管控** | 只创建一个飞书应用、管理员部署一次，全员共用——非技术成员浏览器授权一次即用；飞书应用集中管理，IT 可统一审计权限与可见性；每位用户以自己飞书身份调用，数据按用户隔离 |
| **可托管多个飞书应用** | 需要时，同一套基础设施可在单 AWS 账户内托管多个相互独立的飞书应用，按 slug 隔离部署（`deploy.sh --app <slug>`），凭证 / Token / 密钥互不可见（[详情](docs/operations_zh.md)） |

<details>
<summary>运维 / 安全 / 成本特性</summary>

| 特性 | 说明 |
|---|---|
| **按需付费** | AgentCore Runtime 空闲缩零，按 vCPU-秒 + 内存-秒计费 |
| **渐进授权** | 默认只申请常用权限；首次用到某个低频功能时，自动生成 incremental-auth 链接，用户点击在飞书授权页确认即可，已有权限会累积 |
| **低运维** | Token 自动刷新（30min）、异常自动告警到飞书群、日志按策略过期 |
| **安全** | PKCE + HMAC token + WAF + Secrets Manager 加密存储（专用 KMS 密钥）（[详情](docs/security_zh.md)） |
| **轻量升级** | lark-cli 新版本发布时，按 `docs/skills/bump-lark-cli.md` 流程操作（提取 scope + 适配 skill + deploy），终端用户无需任何操作 |

</details>

## 工具列表

### Tier 1 高频工具（28 个，直接注册）

| 类别 | 工具 |
|------|------|
| IM (5) | 发消息、搜索消息、群列表、聊天记录、搜索群 |
| Calendar (4) | 日程概览、创建日程、查忙闲、找会议室 |
| Docs (4) | 创建、获取、搜索、编辑文档 |
| Base (4) | 获取表、查询数据、批量创建记录、搜索记录 |
| Drive (3) | 搜索、上传、下载文件 |
| Task (3) | 创建任务、我的任务、完成任务 |
| Contact (2) | 搜索用户、获取用户信息 |
| Sheets (2) | 读取、写入单元格 |
| Mail (1) | 发送邮件 |

### Meta Tools（5 个）

| 工具 | 读写 | 说明 |
|------|------|------|
| `lark_discover` | read | 按关键词或分类搜索其余所有 lark-cli 命令，返回名称 + 完整参数 schema |
| `lark_invoke` | read/write | 执行 discover 找到的工具（传入 tool_name + args） |
| `lark_list_skills` | read | 列出所有可用的 Skill，包含各业务域的多步操作最佳实践 |
| `lark_get_skill` | read | 获取某个业务域的完整 Skill（如日历预约流程、消息发送规范） |
| `lark_exec_script` | read | 执行 Skill 内置的 Python 脚本（如图标搜索、模板匹配、XML 校验） |

高频操作直接调用即可；复杂编排（如"帮我约个会议"）先通过 `lark_get_skill` 获取操作指南，再按指南调用工具。

<details>
<summary>Tier 2 工具（200+，通过 discover/invoke 调用）</summary>

| 类别 | 代表功能 |
|------|----------|
| Base | 高级权限管理、复制表格、字段/表单/仪表盘 CRUD、记录导入导出 |
| Sheets | 追加行、批量样式、合并单元格、条件格式、数据验证 |
| Mail | 草稿管理、回复、转发、全部回复、模板、邮件规则 |
| Task | 指派、评论、关注者、提醒、子任务、清单管理 |
| Drive | 评论、权限申请、创建文件夹、移动/复制、导出 |
| IM | 创建群聊、更新群信息、消息回复、书签、下载附件 |
| OKR | 周期列表、目标详情、进展记录、上传图片 |
| VC | 会议搜索、入会/离会、纪要、录制、事件列表 |
| Wiki | 空间列表、节点创建/复制/移动、删除空间 |
| Docs | 媒体下载/插入/预览、批量操作 |
| Calendar | 回复邀请(RSVP)、智能时间建议、更新日程 |
| Markdown | 创建、获取、覆盖 Markdown 文件 |
| Minutes | 搜索妙记、下载音视频、上传生成妙记 |
| Slides | 创建演示文稿、上传图片、替换页面元素 |
| Whiteboard | 导出画板、更新画板内容 |

</details>

## 智能编排 (Skill)

lark-cli 官方 20+ 个业务域 Skill 沉淀了多步操作的最佳实践——参数格式、调用顺序、前置条件。但这些 Skill 原本依赖客户端 shell 执行 lark-cli + 读取本地 md 文件，支持远程 MCP 的客户端用不上。本项目把它们改写成纯 MCP 形态，通过 `lark_get_skill` 按需加载——例如"约个产品评审会"自动走 解析参会人→查忙闲→推荐时段→订会议室→建日程→创建待办。按需加载，不占用固定 context。

覆盖日历、IM、多维表格、邮件、文档、视频会议、任务、知识库、电子表格、OKR、妙记、画板…… 等 20+ 个业务域。

→ 详见 [智能编排详解（含时序图 + 完整域清单）](docs/skills_zh.md)

## 文档

| 主题 | 链接 |
|------|------|
| 智能编排（Skill） | [docs/skills_zh.md](docs/skills_zh.md) |
| 连接客户端（Kiro / Claude Code / Codex） | [docs/connect-mcp-clients_zh.md](docs/connect-mcp-clients_zh.md) |
| Quick Desktop 配置（图文 6 步） | [docs/quick-desktop-setup_zh.md](docs/quick-desktop-setup_zh.md) |
| 安全设计 | [docs/security_zh.md](docs/security_zh.md) |
| 可观测性 & 告警 | [docs/observability_zh.md](docs/observability_zh.md) |
| 运维 & 命令 | [docs/operations_zh.md](docs/operations_zh.md) |
| 常见问题 | [docs/faq_zh.md](docs/faq_zh.md) |
| 成本估算 | [docs/cost_zh.md](docs/cost_zh.md) |
| 项目结构 | [docs/structure_zh.md](docs/structure_zh.md) |

## 快速命令

```bash
./scripts/deploy.sh          # 部署 / 更新
./scripts/ops.sh status      # 系统状态
./scripts/ops.sh list-users  # 已授权用户
./scripts/ops.sh logs        # Lambda 日志
./scripts/teardown.sh        # 销毁所有资源
```

## 能力边界

本服务为「每用户身份隔离」而设计，以下能力为定位所限、有意不做：

- **仅用户身份，无应用（bot）身份。** 每次调用都以发起者自己的飞书身份执行、数据按用户隔离。因此不提供以机器人名义的操作——主动推送、群发通知、无人值守定时任务（依赖应用身份，与隔离定位冲突）。
- **不订阅实时事件。** 请求-响应模型，不接收飞书实时事件（新消息、会议结束等）。事件订阅是应用级的，与按用户隔离不兼容；且远程 MCP 客户端（如 Quick）本身只做同步调用、不接收服务端推送。
- **单次调用有时长上限。** 同步执行，适合即时查询与操作，不适合长耗时或批量阻塞任务。
- **文件传输受限。** 远程 MCP 架构下，Agent 与容器文件系统隔离：
  - *下载*：小文件（< 几 MB）可通过 stdout base64 回传；大文件超出 buffer 限制无法直接返回。可通过原始 API 获取临时下载 URL 供用户自行下载。
  - *上传*：`drive +upload`、`slides +media-upload` 等需要本地文件路径的命令不可用（Agent 无法将文件放入容器）。`markdown +create` 等支持 `--content` 参数的命令不受影响。

## 安全设计

本服务在标准安全设计（PKCE + HMAC + WAF + KMS 加密，详见 [安全文档](docs/security_zh.md)）之上，对 `lark_exec_script` 工具实施了额外的纵深防御：

- **启动时冻结白名单。** 容器启动时扫描 `skills/*/scripts/*.py` 生成允许执行的脚本列表（内存 Set），运行时只允许执行该列表中的文件。即使攻击者通过其他工具将恶意文件写入 scripts/ 目录，也无法通过 `lark_exec_script` 执行。
- **文件系统只读保护。** Dockerfile 构建时将 scripts/ 目录权限设为 555（只读+可执行），容器进程以非 root 用户运行，无法覆盖已有脚本。
- **路径白名单正则。** 仅匹配 `lark-[a-z-]+/scripts/[a-z0-9_]+.py` 格式，拒绝路径遍历和非法文件名。
- **沙箱执行。** 使用 `execFile`（非 shell）、`cwd=/tmp`、30s 超时、10MB 输出上限，参数仅接受字符串数组。环境变量最小化（仅 PATH/HOME/LANG，无 AWS 凭证）；共享并发信号量（防资源耗尽）和优雅关闭追踪。

## 风险提示

AI Agent 以用户身份调用飞书 API 存在模型幻觉、prompt injection 等固有风险。详见 [lark-cli 安全与风险提示](https://github.com/larksuite/cli/blob/main/README.zh.md#安全与风险提示使用前必读)。

## 联系方式

如有问题、建议或需要支持,请在本仓库提交 [GitHub Issue](../../issues)。

## License

本项目基于 MIT License 授权 —— 详见 [LICENSE](LICENSE) 文件。

项目还捆绑/衍生了以下第三方组件,各自遵循其许可证:`docker/skills/**` 下的
Skill 内容改编自 [lark-cli](https://github.com/larksuite/cli)(MIT),
`docker/skills/lark-slides/references/iconpark-index.json` 由
[IconPark](https://github.com/bytedance/IconPark)(Apache-2.0)生成。完整归属见
[THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES) 和 [NOTICE](NOTICE)。


[中文](connect-mcp-clients_zh.md) | [English](connect-mcp-clients_en.md)

# 连接 MCP 客户端（Kiro、Claude Code、Codex）

这些客户端只需要 **MCP 端点 URL**，无需 Client Secret。
（Amazon Quick 走另一套共享 secret 配置：[quick-desktop-setup_zh.md](quick-desktop-setup_zh.md)。）

## 配置

将以下 JSON 加入客户端的 MCP 配置，URL 替换为你的部署端点：

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

保存 → 客户端弹出授权提示 → 浏览器打开飞书 → 同意 → 完成。

连接成功后客户端加载 450+ 飞书工具。Token 本地缓存，过期自动刷新。

## 远程与无头环境

上面的配置假设浏览器和 MCP 客户端在**同一台机器**上：客户端监听一个 loopback
端口，授权码被重定向到那里。如果 Agent 跑在远程主机（SSH、容器、云端 devbox），
而你在笔记本上用浏览器，这个重定向就会落到错误的机器上 —— `127.0.0.1` 指向的是
浏览器所在的机器，不是 Agent 所在的机器 —— 客户端会一直提示需要授权。

这种情况改用 `/activate`。它把客户端从授权流程里完全移出，因此不需要端口转发、
不需要 SSH 隧道，也不要求客户端支持任何特殊能力：

1. 在**任意**机器的浏览器中打开 `https://<your-domain>/activate`。
2. 在飞书中同意授权，页面随即显示一个有效期 30 天的访问令牌。
3. 把该令牌填入客户端配置的请求头：

```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "https://<your-domain>/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

该令牌**只显示一次**，刷新页面无法再次获取。它等同于你的飞书授权，请存入密码
管理器或客户端配置，不要粘贴到聊天、工单或代码仓库。撤销用户授权
（`./scripts/ops.sh revoke <user_id>`）会立即使该用户持有的所有令牌失效，因为
服务端每次请求都会重新读取该用户的飞书 token。

如果你更希望保留交互式授权，各客户端也有各自的无头方案：

| 客户端 | 无头方案 |
|--------|---------|
| **Claude Code** | `claude mcp login <name> --no-browser` 会打印授权 URL，你在浏览器完成授权后，把地址栏里那条完整的重定向 URL 粘回终端。需用 `ssh -t` 连接以保证可以粘贴。 |
| **Codex** | `mcp_oauth_callback_url` 支持填任意外部 URL（例如 devbox 的 ingress 地址）替代 loopback。 |
| **VS Code** | 在 Remote-SSH、Dev Containers 和 Codespaces 下无需额外配置 —— 它用的是托管重定向跳板，不是 loopback 端口。 |

## 各客户端说明

| 客户端 | 备注 | 官方文档 |
|--------|------|---------|
| **Kiro** | IDE 和 CLI 均支持 | [kiro.dev/docs/mcp](https://kiro.dev/docs/mcp/) |
| **Claude Code** | `claude mcp add` 可自动生成上述配置 | [Remote MCP servers](https://docs.anthropic.com/en/docs/claude-code/mcp#remote-mcp-connections) |
| **Codex** | CLI 和 Desktop App 均支持 | [Codex](https://openai.com/index/introducing-codex/) |

## 错误契约

两个信号相互独立，是刻意的 —— 不要把其中一个当另一个读。

| 信号 | 回答的问题 |
|------|-----------|
| 结果文本里的 `ok: false` | **这次调用失败了吗？** 所有失败都带，包括 lark-cli 自己的信封和本服务自造的那些（`invalid_argument`、`projection_dropped`、`unknown_tool`、`server_busy`、`timeout` …）。程序化判断失败请用这个。 |
| CallToolResult 上的 `isError: true` | **是不是终态？** 只在调用方无法凭响应自行改正时置位 —— 超时、缓冲区溢出、授权被撤销、真正的崩溃。 |

可自纠的失败刻意是 `isError: false` + `ok: false`：响应里带着改正所需的信息（正确的
参数形状、哪几个字段名不存在、`authorize_url`、该改用哪个工具名）。有些 MCP 客户端
一看到 `isError` 就渲染自己的通用错误、把 content 丢掉，那样埋掉的正是这些信息。本服务
的首要消费者是读文本的 agent，所以提示优先。`status: "user_approval_required"` 完全不带
`ok` —— 它是确认提示，不是失败。

## 排错

| 现象 | 处理 |
|------|------|
| 授权页不弹出 | 检查浏览器弹窗拦截；确认网络能访问端点域名 |
| "does not support dynamic client registration" | URL 应为 `/mcp` 端点，不是 `/authorize` |
| 自定义 URI scheme 被拒（如 `cursor://`） | 仅接受 `https` 和 loopback `http` 重定向 |

另见 [faq_zh.md](faq_zh.md)。

---

<details>
<summary>协议细节（调试参考）</summary>

1. 客户端请求 `/mcp` 无 token → 401 + `WWW-Authenticate: Bearer resource_metadata="…"`。
2. 客户端获取 Protected Resource Metadata → 找到授权服务。
3. `POST /register`（RFC 7591 DCR）→ 拿到不透明 `client_id`，无 secret。
4. 授权码 + PKCE 流程；用户在飞书确认。
5. 客户端拿到 Bearer token（30 天有效，用户隔离）。

</details>

<details>
<summary>ALLOWED_DOMAINS（当前客户端无需操作）</summary>

注册要求重定向 URI 使用白名单 host 上的 HTTPS，或 RFC 8252 loopback host 上的
HTTP。内置白名单包括：

- loopback：`localhost`、完整 `127.0.0.0/8` 地址段和 `[::1]`（端口可有可无）
- VS Code 托管跳板：`https://vscode.dev/redirect` 和 `https://insiders.vscode.dev/redirect`
- Amazon Quick：`quicksight.aws.amazon.com`

Kiro / Claude Code / Codex 走 loopback，VS Code 走托管跳板，Amazon Quick 走
QuickSight host，因此当前客户端都不需要额外配置。

未来如需放行其他 host：
`EXTRA_ALLOWED_DOMAINS=<host> ./scripts/deploy.sh --yes`

这份白名单管的是**客户端**的回调地址，不是本服务的域名。本服务只能通过它自己的
CloudFront 域名访问，发给飞书的重定向 URL 始终是 `<CloudFront 域名>/callback`。

</details>

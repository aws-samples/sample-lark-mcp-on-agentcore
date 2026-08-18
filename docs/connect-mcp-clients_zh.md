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

注册要求重定向 URI 的 host 在白名单中。loopback（`localhost`/`127.0.0.1`）和
`quicksight.aws.amazon.com` 始终放行——Kiro / Claude Code / Codex 走 loopback，
Amazon Quick 走 QuickSight host，所以当前客户端都不需要配置。

未来如需放行其他 host：
`EXTRA_ALLOWED_DOMAINS=<host> ./scripts/deploy.sh --yes`

这份白名单管的是**客户端**的回调地址，不是本服务的域名。本服务只能通过它自己的
CloudFront 域名访问，发给飞书的重定向 URL 始终是 `<CloudFront 域名>/callback`。

</details>

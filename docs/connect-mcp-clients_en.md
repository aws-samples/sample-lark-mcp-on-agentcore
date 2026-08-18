[中文](connect-mcp-clients_zh.md) | [English](connect-mcp-clients_en.md)

# Connecting MCP Clients (Kiro, Claude Code, Codex)

These clients need **only the MCP endpoint URL** — no Client Secret.
(Amazon Quick uses a separate shared-secret setup:
[quick-desktop-setup_en.md](quick-desktop-setup_en.md).)

## Setup

Add the following to your client's MCP configuration, replacing the URL with
your deploy output:

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

Save → the client prompts to authorize → browser opens Feishu → approve → done.

On success the client loads 450+ Feishu tools. Tokens are cached locally and
refreshed automatically.

## Per-client notes

| Client | Notes | Docs |
|--------|-------|------|
| **Kiro** | IDE and CLI both supported | [kiro.dev/docs/mcp](https://kiro.dev/docs/mcp/) |
| **Claude Code** | `claude mcp add` generates the config above | [Remote MCP servers](https://docs.anthropic.com/en/docs/claude-code/mcp#remote-mcp-connections) |
| **Codex** | CLI and Desktop App both supported | [Codex](https://openai.com/index/introducing-codex/) |

## Error contract

Two independent signals, on purpose — don't read either as the other.

| Signal | Question it answers |
|--------|--------------------|
| `ok: false` in the result text | **Did this call fail?** Present on every failure, both the envelopes lark-cli produces and the ones this server mints (`invalid_argument`, `projection_dropped`, `unknown_tool`, `server_busy`, `timeout`, …). This is the predicate to branch on programmatically. |
| `isError: true` on the CallToolResult | **Is it terminal?** Set only when the caller cannot fix it from the response — timeout, buffer overrun, revoked authorization, a real crash. |

A self-correctable failure is deliberately `isError: false` with `ok: false`: the
response carries what the fix is (the right parameter shape, the field names that
did not exist, an `authorize_url`, the tool name to use instead). Several MCP
clients render their own generic message and drop the content when `isError` is
set, which would bury exactly that. The primary consumer here is an agent that
reads the text, so the hint wins. `status: "user_approval_required"` carries no
`ok` at all — it is a confirmation prompt, not a failure.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Authorization page doesn't open | Check browser popup blocker; confirm network reaches the endpoint domain |
| "does not support dynamic client registration" | URL should be the `/mcp` endpoint, not `/authorize` |
| Custom URI scheme rejected (e.g. `cursor://`) | Only `https` and loopback `http` redirects are accepted |

See also [faq_en.md](faq_en.md).

---

<details>
<summary>Protocol details (debugging reference)</summary>

1. Client requests `/mcp` with no token → 401 with `WWW-Authenticate: Bearer resource_metadata="…"`.
2. Client fetches Protected Resource Metadata → finds the Authorization Server.
3. Client `POST /register` (RFC 7591 DCR) → receives an opaque `client_id`, no secret.
4. Authorization Code + PKCE flow; user approves in Feishu.
5. Client receives a Bearer token (30-day validity, per-user isolation).

</details>

<details>
<summary>ALLOWED_DOMAINS (no action needed for current clients)</summary>

Registration requires the redirect URI host to be in the allowlist. Loopback
(`localhost`/`127.0.0.1`) and `quicksight.aws.amazon.com` are always allowed —
Kiro / Claude Code / Codex use loopback and Amazon Quick uses the QuickSight
host, so no current client needs anything here.

To add another host in the future:
`EXTRA_ALLOWED_DOMAINS=<host> ./scripts/deploy.sh --yes`

This allowlist governs the *client's* callback URL, not a domain for this
service. The service is only reachable at its own CloudFront domain, and the
redirect URL sent to Feishu is always `<CloudFront domain>/callback`.

</details>

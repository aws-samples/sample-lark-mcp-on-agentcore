[中文](faq_zh.md) | [English](faq_en.md)

# FAQ

**Q: How do I connect Kiro / Claude Code / Codex (vs. Amazon Quick)?**

A: Two paths:
- **Kiro / Claude Code / Codex** — just the MCP endpoint URL, no secret. One JSON block, browser authorize, done. See [connect-mcp-clients_en.md](connect-mcp-clients_en.md).
- **Amazon Quick** — shared Client ID + Secret from deploy output. See [quick-desktop-setup_en.md](quick-desktop-setup_en.md).

**Q: A self-registering client fails to connect / registration is rejected?**

A: Confirm the URL is the `/mcp` endpoint (not `/authorize`). All current clients use loopback — no allowlist needed. Custom schemes (e.g. `cursor://`) are not supported.

**Q: Authentication fails when connecting from Quick Desktop?**

A: Verify the Redirect URL from deploy output is added to your Feishu app's Security Settings.

**Q: User token expired after 30 days of inactivity?**

A: Next connection automatically triggers Feishu re-authorization.

**Q: What AWS IAM permissions are needed to deploy?**

A: The deploy script uses AWS CDK to create IAM Roles, Lambda, API Gateway, CloudFront, DynamoDB, Secrets Manager, SSM, ECR, CloudWatch, SNS, EventBridge, and more. It also uses boto3 to directly manage AgentCore Runtime. The deploying user should have **AdministratorAccess** (or equivalent).

If your organization cannot grant AdministratorAccess, the minimum permissions must cover:

| Service | Required Actions |
|---------|-----------------|
| CloudFormation | Full CRUD (CDK backbone) |
| IAM | CreateRole / AttachRolePolicy / PutRolePolicy (creates roles for Lambda and Runtime) |
| Lambda | Create / Update / GetFunction |
| API Gateway | Full CRUD |
| CloudFront | CreateDistribution / UpdateDistribution |
| Secrets Manager | Create / Put / Get / Delete / Describe / TagResource |
| SSM | PutParameter / GetParameter / DeleteParameter |
| DynamoDB | CreateTable / DeleteTable |
| ECR | Image push (handled by CDK) |
| CloudWatch | PutMetricAlarm / PutDashboard |
| SNS | CreateTopic / Subscribe |
| EventBridge | PutRule / PutTargets |
| Bedrock AgentCore | CreateAgentRuntime / UpdateAgentRuntime / GetAgentRuntime |
| WAFv2 (optional) | CreateWebACL / DeleteWebACL (must be in us-east-1) |
| STS | GetCallerIdentity (CDK bootstrap check) |

> For production environments requiring precise permission boundaries, see the [CDK minimum-privilege deployment guide](https://docs.aws.amazon.com/cdk/v2/guide/security-iam.html) and combine it with the service list above.

**Q: Deployment failed?**

A: The script is idempotent — just re-run. For a clean start: `cd infra && npx cdk destroy --all`.

**Q: How to restrict which users can access?**

A: Use the Feishu app's "Availability" settings. Only users in scope can complete OAuth.

**Q: If the OAuth Client Secret leaks, can Feishu users outside this organization use the service to operate their own Feishu?**

A: No. There are **two independent gates**, and the Client Secret only reaches the first:

- **Gate 1 (our `/token` endpoint, where the Client Secret applies):** verifies the request comes from a client type we recognize.
- **Gate 2 (Feishu's OAuth consent, which the Client Secret cannot reach):** to even arrive at Gate 1, the user must **first authorize on Feishu** to obtain a one-time auth code. This project uses a Feishu **custom app (internal)**, which only allows authorization by members inside the single organization that created it, within its "Availability" scope. A Feishu account outside that organization cannot obtain a valid auth code on the Feishu side, so even holding the Client Secret, `/token` fails for lack of a valid auth code.

In other words, **who can authorize** is decided by the Feishu app's type and availability scope, **not by the Client Secret**. One boundary to note: if the app is later changed to a **marketplace / multi-tenant app** and installed by other organizations, that organizational boundary opens up per Feishu's publishing config — still unrelated to the Client Secret. For a comparison of each credential's blast radius, see [Security · Credential Leak Impact](security_en.md#credential-leak-impact).

**Q: Can it proactively send messages / broadcast notifications, or trigger automatically when a new message arrives (bot / events)?**

A: No. This service only calls Feishu synchronously under each user's **own identity** — it does not use application (bot) identity or subscribe to real-time events. Proactive push, broadcast notifications, unattended scheduled jobs, and auto-replies are all out of scope. This is a deliberate trade-off of the per-user isolation positioning (see README [Scope & Limitations](../README.md#scope--limitations)). If you need bot/event capabilities, build a separate dedicated Feishu bot service.

**Q: Quick Desktop shows "Creation failed"?**

A: Check two things: 1) The Redirect URL from deploy output is added to your Feishu app's Security Settings; 2) The Client Secret matches the deploy output (if unsure, run `./scripts/ops.sh rotate-secret` to regenerate).

**Q: How to upgrade lark-cli?**

A: Follow `docs/skills/bump-lark-cli.md` (extract scopes → adapt Skills → deploy), or run `./scripts/deploy.sh --yes` for non-interactive deploy. End users are unaffected.

**Q: Does rotating Client Secret require users to re-authorize?**

A: No. `./scripts/ops.sh rotate-secret` only updates the OAuth Client Secret (verified by Quick Desktop when exchanging an auth code at `/token`). Issued MCP Bearer tokens remain valid because they are signed by a key derived from `STATE_SECRET` (in SSM), which does not change. You must update the Client Secret in the Quick Desktop connector — otherwise the next code-for-token exchange will fail. To invalidate all issued MCP tokens immediately, rotate `/lark-mcp-on-agentcore/state-secret` instead (this invalidates both OAuth state signatures and MCP tokens; all users must re-connect).

Upgrading lark-cli does not affect existing users.

**Q: API calls fail with "permission denied" (e.g., calendar, message search)?**

A: This is a Feishu app permission issue, not a client issue. Fix:

1. Go to [Feishu Open Platform](https://open.feishu.cn/app) → Your app → **Permissions**
2. Search and enable required permissions (common ones below)
3. **Publish a new app version** (permission changes require a new version to take effect)
4. Users do NOT need to re-authorize — permissions take effect on next API call

| Feature | Required Permission |
|---------|-------------------|
| Read calendar/events | `calendar:calendar:read`, `calendar:calendar.event:read` |
| Search/read messages | `im:message:read`, `im:chat:read` |
| Send messages | `im:message:send_as_user` |
| List chats | `im:chat:read` |
| Search docs | `drive:drive:read` |
| Read/write Bitable | `bitable:bitable:read`, `bitable:bitable:write` |

> If the admin adds new API permissions on the Open Platform and publishes a new version, **previously connected users** will not automatically gain the new permissions. Re-connection required: Quick Desktop → Settings → Capabilities → Browse Connections (bottom) → search for Feishu Remote MCP → click the card → click Test action APIs → click Re-Connect on the right side → complete Feishu authorization in the popup.

**Q: Received a TokenLost alarm (store_token_lost) — what now?**

A: This is the most severe alarm. It means a user's refresh_token was consumed but the new token failed to write to Secrets Manager (after 5 retries). The user must re-authorize. Steps:

1. Locate `userIdHash` (sha256 first-16 hex) in the alarm card or logs. **All logs (including `oauth_callback_success`) record only the hash, never the raw user_id** (intentionally redacted). To run `revoke`, list all user secrets (`aws secretsmanager list-secrets --filters Key=name,Values=lark-mcp-on-agentcore/users/`), take the trailing path segment of each as the user_id, and hash each one to find the match for the alarm's `userIdHash`
2. Ask them to reconnect in Quick Desktop: Settings → Capabilities → Connections → find feishu → Sign in. The OAuth callback reuses the same stable userId via the DynamoDB openid mapping (if one exists) or by falling back to the same Feishu `open_id`, then recreates the user secret via `CreateSecret`
3. (Optional) To proactively clean up the stale secret: `./scripts/ops.sh revoke <user_id>`. Note that `revoke` deletes only the user secret and preserves the DynamoDB openid mapping, so the user keeps the same stable userId after re-auth
4. Inspect CloudWatch Logs around `event=store_token_lost` for root cause. Common culprits: Secrets Manager throttling, IAM permission changes, KMS key unavailable

```
fields @timestamp, userIdHash, error, refresh_token_consumed
| filter event = "store_token_lost"
| sort @timestamp desc
```

**Q: Low-frequency tool returns "permission denied"?**

A: The system automatically detects the missing permission and generates an incremental authorization link. Users click the link and confirm the new permission on the Feishu authorization page (existing permissions are preserved — Feishu accumulates scopes).

**Q: Which AWS regions are supported?**

A: Depends on AWS Bedrock AgentCore availability. The deploy script offers common region choices.

**Q: Custom domain support?**

A: Yes. Set `CUSTOM_DOMAIN=mcp.company.com` or follow the deploy script prompt.

**Q: Lark (international) support?**

A: Yes. Set `LARKSUITE_CLI_BRAND=lark` during deployment.

**Q: Can one AWS account host multiple Feishu apps?**

A: Yes. Deploy each app under a short slug: `./scripts/deploy.sh --app <slug> --alias "<name>"`, then operate it with `./scripts/ops.sh --app <slug> <cmd>` and tear it down with `./scripts/teardown.sh --app <slug>`. The reserved default app (no `--app`) keeps the original byte-identical resource names. Apps are fully isolated (credentials, tokens, signing keys, per-app KMS key) and the WAF is shared per region. See `docs/operations_en.md` (Multi-app) and `docs/security_en.md` (Multi-App Isolation).

**Q: How are user tokens encrypted at rest? Can I use my own KMS key?**

A: User Feishu tokens in Secrets Manager are encrypted with a **per-app customer-managed KMS key (CMK)** created automatically at deploy — not the AWS-managed default key. Decrypt is granted only to that app's two Lambda roles, so a principal with `GetSecretValue` but no KMS access reads ciphertext. Existing secrets migrate onto the CMK transparently via the 30-min refresh loop (zero downtime, never destructive). No BYOK action is needed; it is on by default. See `docs/security_en.md` (Token Storage at Rest).

**Q: Received a CmkStragglers alarm — what does it mean?**

A: It means some user token secrets are still not on the per-app CMK after a refresh cycle. It is a migration convergence canary: healthy migration drives it to 0 within a few 30-min cycles. If it stays > 0, the most likely cause is a missing `kms:Encrypt` grant on the OAuth Lambda role (AWS silently skips re-encryption) — check the role's KMS permissions. It is never destructive: a stuck key-swap only retries, it never deletes a token.

**Q: Do I need to re-enter all config on re-deploy?**

A: No. All choices (region, language, domain, WAF, log retention, Feishu credentials, webhook URL) are remembered. Just press Enter to keep previous selections.

**Q: How to configure alarm notifications?**

A: During deploy, the script prompts for a Feishu bot webhook URL. To create one:

1. Open Feishu, enter the group chat for alerts
2. Group Settings (top-right) → Group Bots → Add Bot
3. Select "Custom Bot" → enter a name (e.g. "MCP Alerts") → Next
4. Copy the **Webhook URL** (format: `https://open.feishu.cn/open-apis/bot/v2/hook/xxx`)
5. Paste it into the deploy script prompt

Optionally configure security: the script also prompts for a **signature secret** (HMAC verification) and a **keyword** (message must contain it). Both are optional but recommended for production.

Once configured, all CloudWatch alarms are pushed as interactive message cards to the group chat. You can also subscribe email or other channels via `aws sns subscribe`.

**Q: How to view the monitoring dashboard?**

A: The deploy output includes the Dashboard URL. Or search for `lark-mcp-on-agentcore` in the AWS CloudWatch console. The dashboard has 5 sections: Alarm Status, Traffic, Lambda, OAuth/Token, and Infrastructure.

**Q: How long are logs retained?**

A: Configurable at deploy time (30/90/180/365 days or never expire, default 90). Logs beyond the retention period are automatically deleted to avoid storage cost accumulation.

**Q: How to configure the AgentCore Runtime idle session timeout?**

A: Choose at deploy time: 5/10/15/30 min (default 10 min). The value determines how long a session stays idle before the container is reclaimed. The next request after reclamation triggers a cold start (the initial container pull takes several to a dozen seconds).

Trade-off:
- **5 min**: small user base, cost-sensitive; more cold starts
- **10 min (recommended)**: covers typical conversation bursts, saves ~30% on idle cost vs the 15-min AWS default
- **15 min**: AWS default
- **30 min**: latency-sensitive scenarios where users send back-to-back queries

Persisted in `.local/deploy-config` as `AGENTCORE_IDLE_TIMEOUT`; re-run `deploy.sh` to change. You can also override via env: `AGENTCORE_IDLE_TIMEOUT=300 ./scripts/deploy.sh`.

**Q: How to customize alarm thresholds?**

A: During deploy, choose from three presets (Standard/Relaxed/Strict) using arrow keys. Or select "Custom" to pick which alarm to edit (arrow keys), with descriptions and suggested ranges shown. Custom values are saved to `.local/alarm-thresholds.json` (not committed), and subsequent deploys will not overwrite them.

**Q: Deploy fails with `exec /bin/sh: exec format error`?**

A: This project is **ARM64-only**. Deploy from an ARM64 machine: an Apple Silicon Mac, or an AWS Graviton instance (t4g / c7g, etc.). `deploy.sh` detects the architecture before building and fails early.

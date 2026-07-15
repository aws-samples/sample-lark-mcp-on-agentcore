[中文](operations_zh.md) | [English](operations_en.md)

# Operations

## Command Reference

### `./scripts/ops.sh`

| Subcommand | Description | Details |
|-----------|-------------|---------|
| `status` | System overview | Shows authorized user count and EventBridge token refresh rule status (ENABLED/DISABLED) |
| `list-users` | List authorized users | Calls `secretsmanager list-secrets` to list all secrets under `lark-mcp-on-agentcore/users/` (with name and last-updated time) |
| `revoke <user_id>` | Revoke user authorization | After interactive confirmation, force-deletes the user's secret (`--force-delete-without-recovery`); their MCP and Feishu tokens are immediately invalidated |
| `rotate-secret` | Rotate OAuth Client Secret | Generates new 256-bit hex secret -> writes to SSM -> updates OAuth Lambda env vars. **Note**: existing MCP tokens remain valid (STATE_SECRET unchanged); Amazon Quick (Quick Desktop) connector must be updated with the new Client Secret. Self-registering clients (Kiro, Claude Code, Codex) never use this secret and are unaffected |
| `refresh-all` | Manually trigger token refresh | Directly invokes OAuth Lambda with `{"source":"aws.events"}` to simulate EventBridge, outputs JSON result (refreshed/failed/skipped/total) |
| `logs` | View Lambda logs | Uses `aws logs tail` to show OAuth Lambda logs from the last hour (last 20 lines) |
| `destroy` | Delete AgentCore Runtime | Only deletes Runtime + Endpoint (non-CDK resources); does not destroy infrastructure. For full teardown use `teardown.sh` |
| `help` | Show help | Lists all available commands |

### `./scripts/deploy.sh` Deployment Flow

deploy.sh is an interactive deployment script handling the full flow from environment checks to end-to-end verification:

**Step 0: Environment Checks**
- Verifies bash version (4+ required; macOS auto-upgrades via Homebrew)
- Validates node, docker, aws, python3 availability
- Checks Docker is running (auto-starts on macOS)
- Verifies `boto3` Python package is installed
- Validates AWS credentials (`aws sts get-caller-identity`)

**Configuration Collection (interactive):**
1. Language selection (Chinese/English)
1b. App selection (only when run with **no** `--app` at a TTY): pick the default app, an existing named app, or create a new one (prompts for slug + alias). Skipped when `--app`/`APP_SLUG`/`--yes` is set or stdin is not a TTY. See the **Multi-app** section below.
2. Feishu App ID + App Secret (supports env vars `FEISHU_APP_ID`/`FEISHU_APP_SECRET`, detects and reuses existing credentials)
3. Validates credentials against Feishu API
4. Custom domain (optional)
5. WAF enable/disable
6. Log retention days (30/90/180/365/never expire)
7. AgentCore Runtime idle session timeout (5/10/15/30 min, default 10 min)
8. Alarm threshold preset selection (Standard/Relaxed/Strict/Custom)
9. Feishu alarm webhook URL + signature secret + keyword
10. Deploy region selection

**Connecting MCP clients (two paths):**
- **Kiro / Claude Code / Codex** — self-register (DCR), no secret, loopback callbacks. See [connect-mcp-clients_en.md](connect-mcp-clients_en.md).
- **Amazon Quick** — shared Client ID + Secret from deploy output. See [quick-desktop-setup_en.md](quick-desktop-setup_en.md).

**Step 1/5: CDK Deploy**
- Creates/updates Feishu app credentials in Secrets Manager
- Creates SSM SecureStrings: state-secret (signing root key) and oauth-client-secret
- Installs dependencies (root + docker + infra)
- `cdk deploy` deploys Runtime Stack + WAF Stack (optional) + OAuth Stack

**Step 2/5: AgentCore Runtime**
- Uses boto3 to create or update AgentCore Runtime (container image URI, IAM Role, environment variables)
- Polls until Runtime status becomes READY (up to 5 minutes)

**Step 3/5: Runtime Endpoint**
- Creates or updates Runtime Endpoint
- Polls until Endpoint is ready

**Step 4/5: Configure Middleware**
- Updates Middleware Lambda environment variables (RUNTIME_ARN, AUTHORIZE_BASE, etc.)

**Step 5/5: Verification**
- HTTP request to `/.well-known/oauth-authorization-server` to verify OAuth is reachable
- SigV4 call to AgentCore Runtime to verify MCP protocol response

**Post-deploy:**
- Saves configuration to `.local/deploy-config`
- Saves full deployment info (including OAuth Client Secret) to `.local/deploy-output.md`
- Outputs next steps (configure Feishu redirect URL + Quick Desktop connector)

### `./scripts/teardown.sh` Teardown Flow

Completely destroys all deployed resources in dependency-safe order:

1. **AgentCore Runtime**: Delete Endpoint -> wait 3s -> Delete Runtime
2. **CDK stacks** (deploy region): Destroy LarkMcpOnAgentCoreOAuth + LarkMcpOnAgentCoreRuntime
3. **WAF stack** (us-east-1): Destroy LarkMcpOnAgentCoreWaf (if SKIP_WAF!=1)
4. **User tokens**: Lists all user secrets, batch-deletes after interactive confirmation (`--force-delete-without-recovery`)
5. **Preserved resources** (not auto-deleted, manual cleanup commands provided):
   - `lark-mcp-on-agentcore/feishu-app` Secret
   - `/lark-mcp-on-agentcore/state-secret` SSM
   - `/lark-mcp-on-agentcore/oauth-client-secret` SSM
   - `lark-mcp-on-agentcore-openid-map` DynamoDB table

Use `TEARDOWN_YES=1` to skip top-level confirmation (CI/CD scenarios).

## `.local/` Configuration Persistence

The `.local/` directory is in `.gitignore` and stores local deployment state:

| File | Permissions | Purpose |
|------|------------|---------|
| `.local/deploy-config` | 600 | Deploy parameters (language, region, WAF toggle, log retention, idle timeout, webhook secret/keyword) |
| `.local/deploy-output.md` | 600 | Full deployment info including OAuth Client Secret (sensitive!) |
| `.local/alarm-thresholds.json` | 600 | Custom alarm threshold overrides |

**How it works:** Each `deploy.sh` run reads `.local/deploy-config` for previous choices as defaults. Users can keep or modify existing settings. This means:
- First deploy: all configuration collected from scratch
- Subsequent deploys: only confirm or modify existing config, greatly reducing interaction
- Environment variables take priority over saved configuration

## Log Viewing

### Quick View

```bash
# Last hour of OAuth Lambda logs
./scripts/ops.sh logs

# Custom time range
aws logs tail "/aws/lambda/<OAuthFunctionName>" --region <region> --since 2h --format short
```

### CloudWatch Insights Queries

In the AWS Console CloudWatch Insights, select the appropriate Log Group and run queries:

```
# View all refresh failures
fields @timestamp, @message
| filter event = "refresh_cycle" and failed > 0
| sort @timestamp desc
| limit 50

# View token loss events (most urgent)
fields @timestamp, userIdHash, error, refresh_token_consumed
| filter event = "store_token_lost"
| sort @timestamp desc

# View slow calls (Feishu API > 3s)
fields @timestamp, api, durationMs
| filter event = "feishu_slow"
| sort durationMs desc
| limit 20

# Auth failure analysis
fields @timestamp, reason, userIdHash, hasBearer
| filter event in ["token_verify_failed", "auth_missing_or_invalid"]
| stats count() by reason
| sort count desc

# MCP request latency distribution
fields @timestamp, durationMs, status
| filter event = "mcp_request_ok"
| stats avg(durationMs) as avg_ms, pct(durationMs, 95) as p95_ms, pct(durationMs, 99) as p99_ms by bin(5m)

# OAuth funnel conversion
fields @timestamp, event
| filter event in ["oauth_authorize_start", "oauth_callback_success", "new_user_authorized"]
| stats count() by event
```

## Troubleshooting

### `ops.sh status` shows "Authorized users: 0" (or teardown finds nothing) despite a live deployment

**Cause:** the shell's `AWS_REGION` points at a different region than the one the app was
deployed to. `ops.sh` / `teardown.sh` / `upgrade.sh` resolve their region via `resolve_region`
(`scripts/lib/slug.sh`) with precedence **per-app `deploy-config` REGION > `AWS_REGION` env >
`aws configure` > us-west-2** — so a correct `deploy-config` normally wins. This symptom means
either the deploy-config REGION is missing/wrong, or you're running against a tree with no
saved config.

**Diagnose:**
```bash
# What region does the saved config say? (per-app: .local/apps/<slug>/deploy-config)
grep '^REGION=' .local/deploy-config
# What region is the shell defaulting to?
echo "${AWS_REGION:-$(aws configure get region)}"
```

**Fix:** ensure the app's `deploy-config` has the correct `REGION=` line (re-running
`./scripts/deploy.sh` rewrites it). Do NOT rely on exporting `AWS_REGION` to steer ops — the
saved deploy-config is authoritative by design.

### OAuth authorization succeeds but Quick Desktop shows "invalid_client"

**Cause:** Client Secret in the Quick Desktop connector does not match the one generated during deploy.

**Diagnose:**
```bash
# View current OAuth Client Secret
aws ssm get-parameter --name /lark-mcp-on-agentcore/oauth-client-secret \
  --with-decryption --query 'Parameter.Value' --output text --region <region>
```

**Fix:** Update the Quick Desktop connector's Client Secret field with the output value.

### Token refresh shows all "skipped"

**Cause:** Secrets Manager temporarily non-writable (throttled or network issue); the write-probe mechanism protected refresh_tokens from being consumed.

**Diagnose:**
```bash
# Manually trigger refresh and check detailed results
./scripts/ops.sh refresh-all
```

If persistently skipped, check that the Lambda's IAM Role has `secretsmanager:PutSecretValue` permission.

> **Note:** Users who revoked authorization on Feishu (code 20016) are also counted as `skipped`.
> Their secrets are scheduled for deletion (7-day recovery window). If you see repeated
> `user_secret_delete_failed` in logs, verify the Lambda has `secretsmanager:DeleteSecret` permission.
> Users who re-authorize during the recovery window will have their secret automatically restored.

### Users report "feishu_not_authorized"

**Possible causes:**
1. User's Feishu token expired and refresh failed
2. Feishu app permissions were changed
3. User manually revoked authorization in Feishu

**Diagnose:**
```bash
# Check if user's secret exists
aws secretsmanager get-secret-value \
  --secret-id "lark-mcp-on-agentcore/users/<user_id>" --region <region>

# Check if expires_at has passed
```

**Fix:** User needs to re-authorize via OAuth.

### CDK deploy fails with ROLLBACK_COMPLETE

**Cause:** Previous deploy failed, leaving the stack in ROLLBACK_COMPLETE state.

**Fix:** `deploy.sh` auto-detects and cleans this state (deletes old stack then recreates). If auto-cleanup also fails:
```bash
aws cloudformation delete-stack --stack-name LarkMcpOnAgentCoreOAuth --region <region>
aws cloudformation wait stack-delete-complete --stack-name LarkMcpOnAgentCoreOAuth --region <region>
```

### High MCP request latency

**Diagnosis steps:**
1. Check the Dashboard "MCP Traffic" section latency graph — determine if P95 or Average is elevated
2. Check if AgentCoreSlow / FeishuSlow in the "Errors" graph correlate
3. If AgentCoreSlow: likely Runtime container cold start, should recover within minutes
4. If FeishuSlow: Feishu API-side issue, check Feishu service status

## Test Commands

```bash
./scripts/test.sh                  # Unified test entry (default: unit + typecheck + lint)
./scripts/test.sh --coverage       # Unit tests + coverage report
./scripts/test.sh --mutation       # Stryker mutation testing (~7min)
./scripts/test.sh --smoke          # Docker container smoke test (health + protocol)
./scripts/test.sh --mcp-protocol   # MCP protocol compliance validation (needs Docker + jq)
./scripts/test.sh --full           # All tiers including smoke + audit + e2e
./scripts/test-e2e.sh              # End-to-end test (OAuth, Runtime, /mcp, WAF)
./scripts/audit-tools.sh           # Tool catalog structural audit (15 assertions)
./scripts/audit-deps.sh            # npm audit (root + docker + infra)
./scripts/check-lark-cli-version.sh  # Detect drift between Dockerfile and scope map

npm test                           # Run vitest unit tests
npm run lint                       # ESLint (source code)
npm run knip                       # Dead code / unused dependency detection
```

## Teardown

```bash
./scripts/teardown.sh              # Destroy everything (AgentCore Runtime + cross-region WAF + CDK stacks)
```

## Multi-app (multiple Feishu apps)

One AWS account + region can host **N independent Feishu apps** on this service.
Each app is **slug-namespaced**: `deploy.sh` runs once per app and creates a fully
isolated stack (its own Feishu-app secret, state-secret, DynamoDB tables, AgentCore
Runtime, and CloudFront endpoint). Apps are selected by **endpoint** — a request that
reaches app X's CloudFront domain is, by construction, for app X; there is no
per-request app header and no MCP-token format change.

The original single deployment is the reserved **default** app: run without `--app`
and every physical resource name is **byte-identical** to today's (no suffix, no
transform). Run `./scripts/upgrade.sh` and `./scripts/ops.sh`/`teardown.sh` without
`--app` to operate on it.

**Slug rules** (`scripts/lib/slug.sh`): `^[a-z][a-z0-9-]{0,18}[a-z0-9]$` — 1–20 chars,
lowercase, no leading/trailing/double hyphen, no underscore/slash/uppercase. Reserved
words are rejected: `default, users, feishu, feishu-app, state, state-secret, oauth,
oauth-codes, openid, openid-map, alarms, app, admin, waf, runtime`.

### Onboard a new app

**Prerequisite:** create the Feishu app and grant its scopes in the
[Feishu Open Platform](https://open.feishu.cn/app) console **first**. `deploy.sh`
cannot create a Feishu app — it only associates and validates an existing App ID +
App Secret.

```bash
./scripts/deploy.sh --app <slug> --alias "<display name>"
```

**Interactive alternative:** running `./scripts/deploy.sh` with **no** `--app` at an
interactive terminal now shows an app picker first — choose the **default app**, an
existing named app, or **➕ New app…** (which prompts for a slug + alias, validating
both on the spot). The picker is fully localized (zh/en). It is skipped — and the
default app used, exactly as before — whenever `--app`/`APP_SLUG` is given, `--yes` is
passed, or stdin/stdout is not a TTY (e.g. the `curl | bash` install path or CI).
`install.sh` also forwards `--app`/`--alias` through to `deploy.sh`.

- `--alias` is a human-readable label (UTF-8; Chinese/spaces OK) shown in
  `ops.sh list-apps`, dashboard titles, and alarm cards. It defaults to the slug.
  The alias is **hard-unique** within the account+region: a collision aborts the
  deploy **before any resource is created**.
- Resolves all per-slug names from the slug: `lark-mcp-on-agentcore/feishu-app/<slug>`
  secret, per-slug state-secret/oauth-client-secret SSM, `…-oauth-codes-<slug>` /
  `…-openid-map-<slug>` tables, runtime `lark_mcp_on_agentcore_<slug>`, and a dedicated
  CloudFront endpoint. The WAF stack is **shared** across all apps.

**After deploy:** register the printed Redirect URL (`<OAuth endpoint>/callback`) in
that app's Feishu console, then paste the printed MCP endpoint into your MCP client.

### Operate one app

```bash
./scripts/ops.sh --app <slug> <cmd>   # status | list-users | revoke | refresh-all | logs | rotate-secret | destroy
./scripts/ops.sh list-apps            # lists default + every named app as "alias (slug)"
./scripts/ops.sh rename --app <slug> "<new alias>"   # change the alias (also updates the alarm card label)
./scripts/ops.sh rebuild-registry     # rebuild .local/apps.json from AWS (after losing it / on a new machine)
```

Omit `--app` to target the default app. `--app` may go before or after the subcommand.

**On the local registry (`.local/apps.json`).** The app registry is a local
convenience **index** (slug → alias / region / endpoint / runtime). It powers
`list-apps`, the `deploy.sh` app picker, `upgrade.sh --rest/--list`, and the hard
alias-uniqueness check — but it is **not** the source of truth: every app's real
state lives in AWS, named by slug. Losing it (it is gitignored, not committed) does
**not** affect running apps, and per-app `ops.sh --app <slug>` still works if you
know the slug. To restore the index — or to populate it on a fresh machine —
`./scripts/ops.sh rebuild-registry` re-discovers every named app from its
CloudFormation OAuth stack (`LarkMcpOnAgentCoreOAuth-<slug>`). The alias is recovered
from the alarm-webhook Lambda's `APP_ALIAS` when a webhook was configured, otherwise
it falls back to the slug (fix with `ops.sh rename`). Run it against the right region
(`AWS_REGION=<region> ./scripts/ops.sh rebuild-registry`).

### Upgrade the fleet

Re-running `deploy.sh` **is** an upgrade: the content-addressed image is built once
and each app's runtime repoints to the shared ECR tag (**build-once / repoint-N**).
`upgrade.sh` orchestrates this over the registry:

```bash
./scripts/upgrade.sh --canary          # upgrade ONLY the default app, then verify
./scripts/upgrade.sh --rest            # upgrade every named app in the registry
./scripts/upgrade.sh --all             # canary (default) then --rest
./scripts/upgrade.sh --rollback <slug> # repin <slug>'s endpoint to its previous runtime version
./scripts/upgrade.sh --list            # show registered apps
```

**Why canary-first.** `--canary` upgrades only the default app and stops, so you
bound the blast radius to one app before touching the fleet. "Verify" is
`deploy.sh`'s built-in post-deploy check (OAuth metadata reachable + Runtime READY).
Observe the default app, then run `--rest` (or use `--all` to chain both). `--rest`
iterates the registry and **continues on failure** — one app's failed upgrade is
logged and skipped, it does not halt the others, so a single bad app can't block the
fleet. Re-run `--rest` after fixing it.

**In-flight sessions.** An upgrade repoints the Runtime endpoint to a new version;
existing MCP sessions keep running on their microVM until they idle out, and new
sessions pick up the new version. No active session is killed mid-call.

**Rollback.** `--rollback <slug>` repins the endpoint to the previous runtime
*version* (image only) and prompts for an explicit `yes`. If no previous version
exists, it tells you to use the full-rebuild path instead.

> Image-only `--rollback` is safe **only if OAuth scopes did not change** between
> versions. If the upgrade touched scopes, instead `git checkout <prev>` and
> `./scripts/deploy.sh --app <slug> --yes`.

### Tear down one app

```bash
./scripts/teardown.sh --app <slug>
```

Destroys that app's Runtime and CDK stacks. The **shared WAF is kept** while any
other app still uses it. The `…-openid-map-<slug>` table has `RETAIN`, so it
survives `cdk destroy` — you **must delete it manually before re-deploying the same
slug**, or the redeploy fails with "table already exists":

```bash
aws dynamodb delete-table --table-name lark-mcp-on-agentcore-openid-map-<slug> --region <region>
```

### Cross-app roll-up dashboard (optional)

Deploy with `DEPLOY_ROLLUP=1` to add a single read-only dashboard
(`lark-mcp-on-agentcore-fleet`) that auto-discovers every app via CloudWatch
`SEARCH()` expressions. It owns no alarms or SNS topic, so deleting it never affects
alerting — its lifecycle is fully decoupled from the per-app stacks. See
`infra/lib/fleet-dashboard.ts` and `docs/observability_en.md` (Multi-App Observability).

```bash
# Deploy / update the roll-up dashboard (one-off, not part of the normal deploy flow):
cd infra && DEPLOY_ROLLUP=1 npx cdk deploy LarkMcpOnAgentCoreFleet --require-approval never
```

It is **not** part of `deploy.sh` by design (deploy.sh acts on one app per run; the
roll-up is fleet-wide). `deploy.sh` therefore does not print its URL. Get it after
deploy from the stack output, or open it directly (the dashboard name is fixed):

```bash
aws cloudformation describe-stacks --stack-name LarkMcpOnAgentCoreFleet --region <region> \
  --query 'Stacks[0].Outputs[?OutputKey==`FleetDashboardUrl`].OutputValue' --output text
# Or directly:
# https://console.aws.amazon.com/cloudwatch/home?region=<region>#dashboards:name=lark-mcp-on-agentcore-fleet
```

### Constraints / caveats

- **Single account + region only** — no cross-account, no cross-region.
- **Alias is hard-unique** within the account+region; pick another on collision.
- **The default app's names never change** (default sentinel = empty slug, not the
  literal `default`).
- **The slug is immutable** — renaming a slug means CFN resource replacement and data
  loss. Only the **alias** is changeable (via `ops.sh rename`).

## User-token KMS migration (CMK)

User token secrets are encrypted with a per-app customer-managed KMS key. New users
land on the CMK immediately; existing secrets are migrated transparently by the 30-min
refresh loop (`UpdateSecret` key-swap, zero downtime, **never destructive** — a failed
swap only logs `key_swap_failed`, counts a straggler, and retries next cycle). No
operator action is needed for the migration itself.

What to watch:

- **`CmkStragglers` alarm.** Fires when secrets stay off the CMK after a cycle. Healthy
  migration converges to 0 within a few cycles. If it stays > 0, the most likely cause
  is a missing `kms:Encrypt` grant on the OAuth Lambda role (AWS silently skips
  re-encryption) — verify the role's KMS permissions.
- **deploy.sh re-threads the key ARN automatically.** Because deploy.sh fully replaces
  the OAuth Lambda env, it reads the `UserSecretKmsKeyArn` stack output and re-adds
  `USER_SECRET_KMS_KEY_ARN` on every deploy. If you script Lambda env changes outside
  deploy.sh, preserve that variable or migration silently no-ops.

# Invariants — Source-of-Truth Map & Couplings

If you change one side of a coupling below, you MUST update the other(s) in the
same change. Where an automated check exists, it is named; `scripts/check-invariants.sh`
(pre-commit) enforces the checkable subset.

## Source-of-truth vs generated (NEVER hand-edit the right column)

| Source of truth | Generated / derived (do not edit) | Regenerate with |
|---|---|---|
| `docker/Dockerfile` (`ARG LARK_CLI_VERSION`) | `docker/shortcut-scopes.json._meta.lark_cli_version` | `scripts/extract-shortcut-scopes.py` (via bump runbook) |
| built lark-cli image (`lark-cli schema` `_meta.scopes`) | `docker/rawapi-scopes.json` | `scripts/extract-rawapi-scopes.sh <image>` (needs a built image) |
| `docker/shortcut-scopes.json` + `docker/rawapi-scopes.json` + `config/oauth-scopes.json` | `lambda/token-refresh-shim/scope-allowlist.ts` | `scripts/build-scope-allowlist.sh` |
| `docker/shortcut-scopes.json` | container `generated-tools.json` (`tools[]` + `rawApis[]`) | container build (`docker/generate-tools.js`) |
| upstream lark-cli skills | `docker/skills/**` | re-adapt per `docs/skills/adapt-skill-for-mcp.md` |
| CDK source (`infra/lib/*.ts`) | `infra/cdk.out/**`, CDK snapshot | `cd infra && npm run test:update` |

Also never hand-edit: `node_modules/`, `coverage/`, `.stryker-tmp/`.

## Code ↔ code couplings

- **Bump lark-cli** ⇒ update Dockerfile pin, re-extract scopes (both
  `scripts/extract-shortcut-scopes.py` AND `scripts/extract-rawapi-scopes.sh`
  against a built image), regenerate `scope-allowlist.ts`, re-adapt changed
  `docker/skills/**`, update CDK snapshot, reconcile `config/oauth-scopes.json`.
  Full procedure: `docs/skills/bump-lark-cli.md`.
  Check: `scripts/check-lark-cli-version.sh`, `infra/test/scope-coverage.test.ts`.
- **Add/curate an OAuth scope** ⇒ it must exist in the generated allowlist
  (`scope-allowlist.ts`); regenerate, don't hand-add. Check: `scripts/audit-tools.sh`.
- **Change CDK stacks** ⇒ update the snapshot (`cd infra && npm run test:update`).
- **Change the Runtime's env vars / idle timeout / request-header allowlist** ⇒
  edit `scripts/deploy.sh` (boto3 `create/update_agent_runtime`), NOT CDK;
  `infra/lib/runtime-stack.ts` only builds the image + IAM role. See
  `docs/agent/architecture.md` (Provisioning split).

## Code ↔ doc couplings

- **Add/rename/remove a top-level directory** ⇒ update `docs/structure_en.md`
  AND `docs/structure_zh.md`. Check: `scripts/check-invariants.sh` (dir-exists).
- **Add/remove a `scripts/*.sh` command or a `test.sh` tier** ⇒ update the
  Commands section of `AGENTS.md`.
- **Add any `docs/*_en.md`** ⇒ add the `_zh.md` counterpart (and vice-versa).
  Check: `scripts/check-invariants.sh` (bilingual pairing).
- **`docs/agent/*` referenced by `AGENTS.md` must exist.** Check: `scripts/check-invariants.sh`.
- **Semantic drift** (a doc statement contradicting current code behavior) is not
  mechanically checkable. `scripts/check-docs-agent.sh` (pre-push, warn-only) uses an
  Agent to flag it on changes to the JS/TS under `docker/`/`lambda/`/`infra/lib/` or the
  provisioning/scope surfaces (`scripts/deploy.sh`, `scripts/build-scope-allowlist.sh`,
  `config/oauth-scopes.json`, `docker/Dockerfile`, `docker/shortcut-scopes.json`); it
  complements, does not replace, `scripts/check-invariants.sh`.

## Identity boundary

- Only **user-identity** scopes are allowed; bot-only scopes must never leak into
  the allowlist or skills (see positioning: user-only, no bot). Verify during
  lark-cli bump skill review.

## Security invariants — do not relax without security review

These live in `lambda/token-refresh-shim/index.ts` (confused-deputy & token
safety). Do not loosen any of them without an explicit security review:

- **`userId` is accepted ONLY from the HMAC-signed `t=` token** (incremental-auth),
  never from a raw `user_id` query param — confused-deputy guard (`index.ts:~374-403`).
- **`extra_scope` is enforced against the generated allowlist** (`SCOPE_ALLOWLIST`
  from `scope-allowlist.ts`, checked at `index.ts:~404-416`) so a phishing link
  can't broaden the consent screen.
- **Auth codes are single-use** via an atomic DynamoDB `DeleteItem` with
  `ReturnValues=ALL_OLD` (`dynamodb-codes.ts:~29-45`); racing requests see one
  winner.
- **`preflightWritable` runs before consuming the single-use `refresh_token`**
  (`index.ts:~209,291`); if Secrets Manager storage fails *after* the token was
  burned, a CRITICAL `store_token_lost` log fires (`index.ts:~311-329`).
- **Scheduled refresh only fires past token half-life** (`remaining > totalTtl/2`
  ⇒ skip, `index.ts:~287-289`).
- **User token secrets are CMK-encrypted, per app.** Each OAuthStack owns one
  `kms.Key` (RETAIN + rotation); `CreateSecret` stamps `KmsKeyId`, the refresh loop
  migrates existing secrets via `UpdateSecret` (re-encrypts in place, zero downtime).
  Three couplings that silently break it if dropped:
  - **`kms:Encrypt` on oauthFn is load-bearing** — without it `UpdateSecret` returns
    OK but SILENTLY does not re-encrypt (AWS documented). `ensureSecretOnCmk`
    re-`DescribeSecret`s after the swap to confirm the key actually moved; a silent
    no-op is counted as a `stragglers`/`key_swap_failed` (NOT a successful swap). The
    `CmkStragglers` alarm (refresh-cycle `$.stragglers` metric) is the canary: it
    counts secrets confirmed STILL off the CMK, so a healthy migration cycle reports
    0 (no false page) and it stays > 0 only when Encrypt is genuinely broken.
  - **`kms:Decrypt` on middlewareFn is hot-path-critical** — missing it ⇒ every MCP
    tool call KMS-AccessDenies and the data plane goes fully down once secrets move
    to the CMK.
  - **The CMK ARN must be re-threaded by `deploy.sh` every deploy** — the OAuth
    Lambda env is fully REPLACED, so `deploy.sh` reads the `UserSecretKmsKeyArn`
    output and re-adds `USER_SECRET_KMS_KEY_ARN`, else migration silently no-ops.
  - **Key-swap failure must NEVER delete a token** — `UpdateSecret` is a control-plane
    API; transient errors don't mean the token is invalid. On failure: WARN +
    `key_swap_failed` count + skip + retry next cycle. force-delete stays ONLY on the
    terminal Feishu codes (20016/20017/20064). Check: `cmk-migration.test.ts`,
    `cmk-synth.test.ts`. Defends least-privilege `GetSecretValue` readers, NOT
    IAM/KMS admins (account-root keeps `kms:*`); see `docs/security_*.md`.

## Multi-app (slug) invariants — do not relax without review

Multi-Feishu-app support (`scripts/lib/slug.sh` + `infra/lib/slug-names.ts` derive
every per-app name from a slug; empty slug = the reserved **default** app). Design:
`docs/operations_*.md` (Multi-app) + `.claude/specs/2026-06-07-multi-app-*`. These are
load-bearing — a "simplification" that drops one silently re-opens a cross-app hole:

- **Two slug resolvers must agree.** `scripts/lib/slug.sh` (bash, for deploy/ops/
  teardown/upgrade boto3 names) and `infra/lib/slug-names.ts` (CDK names) MUST produce
  identical names for the same slug. The empty/default sentinel MUST stay byte-identical
  to the original single-app literals (the CDK **default snapshot must diff EMPTY**, the
  sanctioned exceptions being the `an.concurrency_pct` fix and the **per-app CMK feature**
  — a new `AWS::KMS::Key`, its IAM/KMS grants, the `USER_SECRET_KMS_KEY_ARN` env var, the
  `UserSecretKmsKeyArn` output, and the `CmkStragglers` filter/alarm — which is added to
  EVERY app including default). Check: `infra/test/slug-names.test.ts` + `slug-synth.test.ts`
  + `cmk-synth.test.ts` + the snapshot test.
- **Region is resolved from deploy-config, not a stray `AWS_REGION`.** `ops.sh` /
  `teardown.sh` / `upgrade.sh` MUST determine their region via the shared `resolve_region`
  (`slug.sh`), precedence: per-app `deploy-config` REGION > `AWS_REGION` env > `aws configure`
  > `us-west-2`. The per-app deploy-config (the value `deploy.sh` actually shipped with) is
  authoritative — a shell defaulting `AWS_REGION` elsewhere must NOT silently redirect a
  query to the wrong region (else `ops.sh status` under-counts users to 0, and worse,
  `teardown.sh` can miss live resources). The one hardcoded `us-east-1` in `teardown.sh` is
  the CloudFront/WAF requirement and is correct. Check: `slug.test.sh` (`resolve_region` cases).
- **Default sentinel is the EMPTY string, never the literal `default`** — a `default`
  suffix would rename the RETAIN `openid-map` table (CFN replace ⇒ orphan + re-auth).
- **Killer Fix #1 (cross-app credential read):** the per-slug app secret uses a SLASH
  delimiter (`feishu-app/<slug>`) and the RuntimeRole grant is scoped to it
  (`runtime-stack.ts`). The default `feishu-app-*` wildcard must NOT be able to match a
  slugged secret. Check: `slug-synth.test.ts`.
- **Killer Fix #2 (cross-app token forgery):** each app has its own SSM `state-secret`
  (per-slug param). Sharing one signing root would let a token minted for app A verify
  under app B. `deploy.sh` create-if-absent must never rotate it on redeploy.
- **Killer Fix #3 (cross-app token deletion):** `listAllUserSecrets`
  (`token-refresh-shim/index.ts`) and the shared `list_user_secret_names` (`slug.sh`)
  apply a TWO-part screen — trailing-slash prefix filter + `^${SECRET_PREFIX}/[^/]+$`
  single-segment grep — because the SM `name` filter is a PREFIX match and the refresh
  loop / teardown auto-delete. The screen MUST keep `ou_*`/hex single-segment userIds
  and drop nested `users/<slug>/<openid>`. Check: `list-user-secrets.test.ts`.
  - **IAM counterpart:** the DEFAULT app's user-secret grant `users/*` would (IAM `*`
    matches `/`) reach every slugged app's `users/<slug>/<openid>`. An explicit
    **Deny on `users/*/*`** (default app only) closes the IAM boundary — the runtime
    screen alone is NOT enough. `ops.sh revoke` also rejects a user_id containing `/`.
    Check: `slug-synth.test.ts` (the Deny assertion).
- **Alias is HARD-unique** within the account+region, claimed via an atomic registry
  write BEFORE any resource is created (`scripts/lib/registry.sh`). Slug is immutable
  (rename = data loss); only the alias is mutable (`ops.sh rename`).
- **Shared WAF**: deployed once, EXCLUDED from `CDK_STACKS` on later slug deploys, and
  destroyed by `teardown.sh` ONLY when no other OAuth consumer remains (the cross-region
  export producer can't be dropped while referenced).
- **Per-slug observability**: custom metric namespace `LarkMcpOnAgentCore/<slug>` and the
  `ApiName` alarm/dashboard dimensions must be slugged, or per-app alarms fire on another
  app's (or the summed) metrics.

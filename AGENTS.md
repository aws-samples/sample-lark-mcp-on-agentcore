# AGENTS.md

Guidance for AI coding agents working in this repo. This file is the single
source of truth for agent conventions; it links out rather than duplicating.
Human onboarding docs live in `docs/` (bilingual `_en`/`_zh`).

## Project overview

Hosted remote-MCP service on AWS Bedrock AgentCore that wraps **lark-cli** so
remote-MCP clients can call Feishu's 2500+ APIs via 200+ tools. Identity is
**user-only** (each user calls as themselves; no bot identity, no event stream).
Languages: TypeScript (`lambda/`, `infra/`), JavaScript (`docker/`, no build
step), Bash (`scripts/`). Node 20, ARM64-only container. AWS CDK builds the image,
IAM, Lambdas, and alarms; the AgentCore **Runtime itself** (its env vars, idle
timeout, request-header allowlist) is provisioned by `scripts/deploy.sh` via boto3,
not CDK — see `docs/agent/architecture.md`.

Each MCP session runs in its own AgentCore microVM — see
`docs/agent/architecture.md` for the request lifecycle and concurrency model.

## Setup & commands

```bash
npm install                 # root deps (lambda + docker tooling)
cd infra && npm install     # CDK deps

./scripts/test.sh           # default offline: unit + typecheck + lint
./scripts/test.sh --unit    # vitest only
./scripts/test.sh --full    # everything incl. smoke/mcp-protocol/audit/e2e (needs Docker/AWS)
npm run lint                # eslint (no Prettier); npm run lint:fix to autofix
npm run knip                # dead-code scan

./scripts/deploy.sh         # interactive deploy (re-run uses saved config)
./scripts/ops.sh status     # operations toolkit (status/list-users/list-apps/rebuild-registry/rename/revoke/refresh-all/logs/rotate-secret/destroy)
./scripts/teardown.sh       # destroy all resources
./scripts/upgrade.sh --all  # multi-app: canary the default app, then upgrade the rest

# Multi-Feishu-app (one AWS account/region hosts N apps; design in .claude/specs/2026-06-07-multi-app-*):
# Bare `deploy.sh` at a TTY shows an app picker (default / existing / new); --app skips it.
./scripts/deploy.sh --app <slug> --alias "<name>"   # deploy/onboard a named app (slug = a-z0-9-, ≤20)
./scripts/ops.sh --app <slug> status                # operate one app (default app omits --app)
./scripts/teardown.sh --app <slug>                  # tear down one app (shared WAF kept if others remain)
```

No `--app` (or `--app` omitted) = the reserved **default** app, byte-identical to
the original single-app deployment. Per-app physical names are derived by
`scripts/lib/slug.sh` (shell) and `infra/lib/slug-names.ts` (CDK) from the slug.

## Project structure

See `docs/structure_en.md` for the full tree. Top level: `config/` (i18n, alarm,
scope defaults), `docker/` (MCP server + container), `infra/` (CDK stacks),
`lambda/` (OAuth shim, MCP middleware, alarm webhook), `scripts/` (ops + tests),
`docs/` (human docs) + `docs/agent/` (these AI docs).

**Generated — never hand-edit:** `infra/cdk.out/`, `generated-tools.json`,
`lambda/token-refresh-shim/scope-allowlist.ts`, `docker/rawapi-scopes.json`,
`docker/skills/**`, `node_modules/`, `coverage/`. Full source-of-truth map:
`docs/agent/invariants.md`.

## Code style

- Format is enforced by ESLint (`eslint.config.mjs`); there is no Prettier — run
  `npm run lint:fix`, don't reformat by hand.
- TypeScript strict mode (`lambda/`, `infra/`). `docker/*.js` is plain CommonJS
  Node, no transpile.
- Structured JSON logging (`console.log(JSON.stringify({...}))`).
- Unused args prefixed `_` are ignored by lint.
- Tool naming: `lark_<service>_<command>`.

## Testing

`./scripts/test.sh` is the single entry point. Tests are vitest under
`lambda/**/__tests__/`, `docker/__tests__/`, and `infra/test/`. Pre-push runs the
offline suite automatically.

Pre-push also runs an Agent-based doc-consistency check (`scripts/check-docs-agent.sh`,
warn-only): when a change touches the JS/TS under `docker/`, `lambda/`, or `infra/lib/`,
or the provisioning/scope files (`scripts/deploy.sh`, `scripts/build-scope-allowlist.sh`,
`config/oauth-scopes.json`, `docker/Dockerfile`, `docker/shortcut-scopes.json`), it
auto-detects an installed Agent CLI (claude/codex/gemini/kiro-cli/cursor-agent/llm) and
flags any now-stale statements in `docs/agent/*`. It never blocks the push and skips
silently when no Agent CLI is available.

After CDK changes
run `cd infra && npm run test:update` to refresh the snapshot. The unit tier
includes cdk-nag compliance (`infra/test/compliance.test.ts` — a new CDK resource
tripping an AWS-Solutions rule fails until you add a `NagSuppressions` entry with
rationale) and `infra/test/scope-coverage.test.ts`. `--full` does NOT include
`--mutation` (stryker mutates the two Lambda `index.ts` files; run it separately).
See `docs/agent/playbooks.md` for change-specific test steps.

## Critical constraints (details: docs/agent/invariants.md)

- **lark-cli is version-pinned** in `docker/Dockerfile`; changing it means
  following `docs/skills/bump-lark-cli.md` (regenerates scopes, allowlist, skills,
  CDK snapshot). Never bump it ad hoc.
- **Tool catalog & scope allowlist are generated** — edit the source
  (`docker/shortcut-scopes.json`, `config/oauth-scopes.json`), then regenerate;
  never hand-edit the generated files.
- **Container is ARM64-only.**
- **Change a top-level dir ⇒ update `docs/structure_en.md` AND `_zh.md`.**
- **Add a `docs/*_en.md` ⇒ add the `_zh.md` counterpart** (and vice-versa).

`scripts/check-invariants.sh` (pre-commit) enforces the checkable subset.

## Boundaries

**Never:**
- Commit secrets or tokens (gitleaks runs pre-commit; secrets live in Secrets
  Manager / SSM, created by deploy.sh outside CDK).
- Hand-edit generated artifacts (see Structure).
- Introduce bot-only OAuth scopes (this project is user-identity only).

**Ask first:**
- Adding/removing OAuth scopes or changing identity behavior.
- Destructive infra changes (resource removal, `teardown.sh`).
- Bumping lark-cli.

## Commit / PR

- Conventional Commits prefixes (`feat:`, `fix:`, `docs:`, `chore(deps):`).
- Branch naming: `<type>/<short-kebab-summary>` matching the commit prefix
  (e.g. `docs/agents-md`, `fix/runtime-correctness`). Avoid bare or tool-generated
  names like `worktree-xyz`.
- Do NOT add a `Co-Authored-By` or AI-attribution trailer.
- Pre-push runs `./scripts/test.sh`; make sure it passes before pushing.

## Key resources

- Architecture mental model: `docs/agent/architecture.md`
- Invariants & source-of-truth map: `docs/agent/invariants.md`
- Change playbooks: `docs/agent/playbooks.md`
- Structure: `docs/structure_en.md` · Security: `docs/security_en.md`
- Operations: `docs/operations_en.md` · Observability: `docs/observability_en.md`
- Cost: `docs/cost_en.md` · FAQ: `docs/faq_en.md` · Skills: `docs/skills_en.md`
- Releasing (version scheme + procedure): `docs/releasing_en.md`
- lark-cli bump runbook: `docs/skills/bump-lark-cli.md`

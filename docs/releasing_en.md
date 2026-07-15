[中文](releasing_zh.md) | [English](releasing_en.md)

# Releasing

The public version is the **git tag**, following SemVer.

## Version format

```
v<MAJOR>.<MINOR>.<PATCH>+larkcli.<lark-cli version>
```

Example: `v1.0.0+larkcli.1.0.66`.

- **MAJOR.MINOR.PATCH is the project's own version**, decoupled from lark-cli. Only a break in the
  public contract bumps MAJOR — the contract being the MCP tool surface (`lark_*` names and
  parameters), the deploy-script flags (`deploy.sh` / `ops.sh` / `upgrade.sh`), and the OAuth flow.
- **`+larkcli.<version>` records the bundled lark-cli version** and does not affect version precedence.
- A lark-cli upgrade (even one adding new tools or skills) does not break that contract, so it lands
  as a MINOR or PATCH, not a MAJOR.

lark-cli's version is not folded into MAJOR because the project ships its own substantial codebase —
CDK, Lambdas, the MCP server, skill adaptation — rather than a thin wrapper. Tying MAJOR to lark-cli
would leave no way to express a release that changes only our code and not lark-cli.

## Keeping version fields aligned

The git tag is authoritative; every other field tracks the latest release:

| Location | Value | Notes |
|---|---|---|
| git tag | `v1.0.0+larkcli.1.0.66` | Source of truth |
| `docker/server.js` serverInfo `version` | `1.0.0` | Core version only, no `+larkcli` suffix |
| `docker/server.js` serverInfo `larkCliVersion` | `catalogRaw._larkCliVersion` | Read at runtime from `generated-tools.json`; do not hardcode |
| `docker/package.json` / `infra/package.json` | `1.0.0` | Match the core version |

The lark-cli version itself stays pinned in `docker/Dockerfile` (`ARG LARK_CLI_VERSION`), with
`scripts/check-lark-cli-version.sh` guarding against drift from `shortcut-scopes.json._meta` (see the
[bump-lark-cli runbook](skills/bump-lark-cli.md)).

## Release steps

1. Merge the changes to `main`; `./scripts/test.sh` passes.
2. Choose the version: MAJOR.MINOR.PATCH from what changed this cycle; fill the `+larkcli.` suffix
   with the lark-cli version pinned in `Dockerfile`. Confirm the number is free with
   `git tag --list 'v*' | sort -V | tail`.
3. Only when MAJOR changes: sync serverInfo, both `package.json` files, and the top-level `version`
   in their `package-lock.json`, landing it through a regular PR to `main`.
4. Tag and push:
   ```bash
   git tag -a "v<X.Y.Z>+larkcli.<version>" -m "<one-line summary>"
   git push origin "v<X.Y.Z>+larkcli.<version>"
   ```
5. Publish the GitHub Release: title like `v<X.Y.Z> — lark-cli <version> + <headline changes>`,
   bilingual notes with Chinese first, marked `--latest`.

Releasing is fully manual — there is no tag-triggered workflow; CI runs only on PRs.

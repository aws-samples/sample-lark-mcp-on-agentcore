[中文](releasing_zh.md) | [English](releasing_en.md)

# 发版

对外版本以 **git tag** 为准,遵循 SemVer。

## 版本号

```
v<主>.<次>.<修订>+larkcli.<lark-cli 版本>
```

例:`v1.0.0+larkcli.1.0.66`。

- **主.次.修订是项目自身的版本**,与 lark-cli 解耦。只有破坏公共契约才升主号——公共契约指
  MCP 工具面(`lark_*` 名称与参数)、部署脚本的 flag(`deploy.sh` / `ops.sh` / `upgrade.sh`)、
  OAuth 流程。
- **`+larkcli.<版本>` 用于标注本次内置的 lark-cli 版本**,不参与版本比较。
- lark-cli 升级(即便引入新工具或新 skill)不破坏上述契约,因此计入次号或修订号,而非主号。

lark-cli 版本不并入主号:项目本身包含 CDK、Lambda、MCP server、skill 适配等自有代码,并非薄封装。
若主号跟随 lark-cli,就无法表达"仅改动自有代码、未动 lark-cli"这类发布。

## 各处版本号对齐

以 git tag 为准,其余字段与最近一次发版保持一致:

| 位置 | 值 | 说明 |
|---|---|---|
| git tag | `v1.0.0+larkcli.1.0.66` | 权威来源 |
| `docker/server.js` serverInfo `version` | `1.0.0` | 仅主号,不含 `+larkcli` 后缀 |
| `docker/server.js` serverInfo `larkCliVersion` | `catalogRaw._larkCliVersion` | 运行时从 `generated-tools.json` 读取,勿硬编码 |
| `docker/package.json` / `infra/package.json` | `1.0.0` | 与主号一致 |

lark-cli 版本本身仍以 `docker/Dockerfile` 的 `ARG LARK_CLI_VERSION` 为准,由
`scripts/check-lark-cli-version.sh` 校验其与 `shortcut-scopes.json._meta` 不漂移(见
[bump-lark-cli 手册](skills/bump-lark-cli.md))。

## 发版步骤

1. 待发内容合入 `main`,`./scripts/test.sh` 通过。
2. 确定版本号:主.次.修订依据本次改动;`+larkcli.` 后缀填 `Dockerfile` 中钉住的 lark-cli 版本。
   用 `git tag --list 'v*' | sort -V | tail` 确认版本号未被占用。
3. 仅当主号变化时:同步 serverInfo、两个 `package.json` 及对应 `package-lock.json` 的顶层
   `version`,通过一个常规 PR 合入 `main`。
4. 打 tag 并推送:
   ```bash
   git tag -a "v<X.Y.Z>+larkcli.<版本>" -m "<一句话摘要>"
   git push origin "v<X.Y.Z>+larkcli.<版本>"
   ```
5. 发布 GitHub Release:标题形如 `v<X.Y.Z> — lark-cli <版本> + <主要变化>`,notes 双语、中文在前,
   标记 `--latest`。

发版为纯手动操作,无 tag 触发的 workflow;CI 仅在 PR 上运行。

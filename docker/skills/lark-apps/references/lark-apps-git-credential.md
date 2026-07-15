# apps Git credential

妙搭 Git 凭证用于本地原生 `git clone/pull/push`。涉及三个工具：`lark_apps_git_credential_init`、`lark_apps_git_credential_list`、`lark_apps_git_credential_remove`。

## 命令

```
lark_apps_git_credential_init(app_id="app_xxx")
lark_apps_git_credential_list()
lark_apps_git_credential_remove(app_id="app_xxx")
```

## 输出契约

- `lark_apps_git_credential_init` 成功后读取 `data.repository_url`；不要展示或保存其中的凭据细节，只用于下一步 `git clone`。
- `lark_apps_git_credential_list` 返回本地记录和状态；可用来判断是否需要重新 init。
- `lark_apps_git_credential_remove` 只清本地配置；成功后告知不会删除云端应用或仓库。

## 行为规则

- `lark_apps_git_credential_init` 返回 `repository_url`，并配置 URL-scoped Git credential helper。后续 clone/pull/push 使用原生 git。
- `lark_apps_git_credential_list` 列出本地已配置的妙搭 Git 凭证，不需要 `app_id`。
- `lark_apps_git_credential_remove` 只移除本地凭证/helper，不删除云端应用或仓库。
- 看到 Repository URL 后继续：

```bash
git clone <repository_url>
cd <repo>
git checkout sprint/default
```

## Agent 规则

- 不要手动打印、保存或拼接 token。
- clone、pull、push、diff、log 等代码仓库操作都使用原生 `git`；不存在 `lark_apps_pull` / `lark_apps_push` / 代码读写类工具，不要臆造。
- 不要 push/force-push `main`；`main` 是发布态快照，由 `lark_apps_release_create` 成功后服务端推进，直推/force-push 会被服务端护栏拒绝。
- Git 认证失败、本地凭证损坏或 helper 缺失时，重新执行 `lark_apps_git_credential_init(app_id="<id>")` 覆盖本地配置；不要让用户复制 token 到 remote URL。

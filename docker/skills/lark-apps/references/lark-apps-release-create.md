# apps release-create

为妙搭应用创建发布 release。

## 何时用

用于把应用的代码分支推进到发布流程（html 和 full_stack 统一走此入口）。

## 命令骨架

- 必填：`app_id`。
- 可选：`branch`；省略时服务端使用默认发布分支。
- 返回 `release_id` 和 `status`，后续用 `lark_apps_release_get` 轮询。

## 示例

```
lark_apps_release_create(app_id="app_xxx")
lark_apps_release_create(app_id="app_xxx", branch="sprint/default", dry_run=true)
```

## 输出契约

- 成功读取 `data.release_id`、`data.status` 和 `data.sync`；`release_id` 是后续 `lark_apps_release_get` 的入参。
- `sync=true` 表示同步部署（服务端等待部署完成后才返回），`sync=false` 或缺失表示异步部署。
- `status=publishing` 表示发布仍在进行；继续用 `lark_apps_release_get` 轮询，轮询间隔应该为 20s。应用发布平均耗时大约 2min，整体超时时间大约 5min。
- `status=finished` 表示部署已完成（同步部署时可能直接返回此状态）。
- `lark_apps_release_create` 返回 release 只代表发布已发起。只有 `lark_apps_release_get` 对同一个 `release_id` 返回 `finished` 后，才能说本轮最新版本已部署。

## Agent 规则

`lark_apps_release_create` 部署的是远端 `sprint/default` 上已 push 的代码，不是本地工作区——本地若有你修改但未推送的改动，需要先 `git add` + `git commit` 并 `git push` 到 `sprint/default`，否则这些改动不会进入这次发布。`git push` 如遇认证失败、401/403、credential helper 缺失或 token 过期，先用 `lark_apps_git_credential_init(app_id="<app_id>")` 刷新本地 Git 凭证，再重试原 git 命令；刷新凭证也失败时，停止并向用户报告错误，不要换路；不要手动复制 token 或改 remote URL。发布后若 status 是 `publishing`，用 `lark_get_skill(domain="apps", section="release-get")` 查询。`lark_apps_release_create` 部署上线属高影响动作——作为别的命令的连带前置时，按 `lark_get_skill(domain="apps")`「高影响动作：确认与预授权」先征得用户同意再发布。

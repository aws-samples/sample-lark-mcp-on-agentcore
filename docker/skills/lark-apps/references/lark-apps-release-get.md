# apps release-get

按 release ID 查询单次发布详情。

## 何时用

用于跟进已知 `release_id` 的发布状态。没有 `release_id` 时先读 `lark_get_skill(domain="apps", section="release-list")`，不要让用户手填。

`release_id` 是妙搭发布 ID（`lark_apps_release_create` 返回），不是飞书审批实例号；查发布进度/失败都在 `lark_apps_release_*` 工具族内完成，不要路由到 lark-approval。

## 命令骨架

- 必填：`app_id`、`release_id`。
- `release_id` 来自 `lark_apps_release_create` 或 `lark_apps_release_list`。

## 示例

```
lark_apps_release_get(app_id="app_xxx", release_id="release_yyy")
```

## 输出契约

- 成功可能直接返回 release 字段，也可能包在 `data.release`；读取 `release_id`、`status`、`created_at`、`updated_at`，以及 `commit_id`（本轮发布对应的 git commit SHA）。
- `status=publishing` 继续轮询。此时尚无 `online_url`；不要拿其它链接（如 `lark_apps_list` 里的应用主页 / 开发态预览 URL）冒充"本轮发布的访问链接"——只回报 `release_id`、`status`，并说明 `finished` 后才有 `online_url`。
- `status=finished` 发布成功——**本命令输出已含 `online_url`，直接读取它作为本轮发布的线上访问链接**返回用户，无需再调 `lark_apps_list`（`lark_apps_list` 仍可用于按应用名浏览，但不是发布主流程的必经步骤）。
- `status=failed` 发布失败——**本命令输出已含 `error_logs`（`step`/`error_log`），直接据此向用户转述关键失败步骤和可行动修复**。
- 只有当这个 `release_id` 已返回 `finished`，随后读到的 `online_url` 才能被表述为"本轮发布后的访问链接"。单独从 `lark_apps_list` 看到 `is_published=true` 不能证明最新版本已部署。

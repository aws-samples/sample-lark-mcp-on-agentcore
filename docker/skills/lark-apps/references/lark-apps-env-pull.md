# apps env-pull

把妙搭应用 dev 启动期环境变量拉取到本地项目根的 `.env.local`。`app_id` 必填，目标项目根默认当前工作目录（`project_path` 可指定）。（认证由 MCP server 自动处理。）

这个命令是 dev-only 的本地恢复工具：内部固定拉取 `env=dev`，没有环境切换参数，也不管理线上环境变量。

## 何时别用（核心反模式）

**通常不需要手动跑**——脚手架的 `npm run dev` 在起本地开发时会自动后台拉取（非阻塞）。手动再跑会重复做同样的事，并用服务端返回值覆盖 `.env.local` 里的同名 key；本地无关行和注释会保留。

只在这些兜底场景用：

- 不通过 `npm run dev` 启动（直接跑 `node` / IDE debug）。
- `.env.local` 被改坏 / 删除，想重新同步。

## 行为

- **合并、不清空**：写入 `.env.local` 时保留你手写的内容与注释——命中的 key 替换值，新 key 追加，不整体覆盖。
- **安全护栏**：返回的 envelope **不会回显任何 env key / value**（防止 token / 数据库凭据泄漏到日志或 CI 输出）。要看实际值请直接读 `.env.local`。

## 示例

```
lark_apps_env_pull(app_id="app_xxx")
```

## 失败处理

scope 不足时，按 MCP server 的提示重新授权。其余失败优先转述 `error.hint` / `error.message`。

## 参考

- `lark_get_skill(domain="apps")` — 妙搭应用全部命令 + 心智模型
- `lark_get_skill(domain="apps", section="local-dev")` — 本地全栈开发端到端流程

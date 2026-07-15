# apps openapi-key 命令族 SOP

管理妙搭应用对外暴露的 HTTP API Key（`/openapi/**` 鉴权凭证）。全部操作以 user 身份执行。本文件记录 Agent 不看就会做错的领域规则。

## 命令路由

| 工具 | 用途 |
|---|---|
| `lark_apps_openapi_key_list` | 列出应用所有 API Key（脱敏） |
| `lark_apps_openapi_key_get` | 查看单个 Key 详情（脱敏） |
| `lark_apps_openapi_key_create` | 创建新 Key，**原始密钥一次性可见** |
| `lark_apps_openapi_key_update` | 改名或改 config（不改 status） |
| `lark_apps_openapi_key_enable` | 启用 Key（status→1） |
| `lark_apps_openapi_key_disable` | 停用 Key（status→0），**泄露/疑似泄露优先用这个而非 delete** |
| `lark_apps_openapi_key_delete` | 永久删除 Key（不可逆） |
| `lark_apps_openapi_key_reset` | 轮换密钥（刷新原始 Key），**一次性可见** |

## 脱敏口径（安全关键）

- `list` / `get` / `update` / `enable` / `disable`：返回结构里 **无** `api_key` 字段，只有 `key_preview`（格式：`****` + 原始密钥末 4 位，如 `****5f4a`）。
- `create` / `reset`：**仅** 在 `data.api_key`（顶层）返回原始密钥一次；同时提示一次性告警：
  ```
  warning: this api_key is shown only once and is NOT stored — copy it now and store it in your own secret manager.
  ```
- 原始密钥绝不写入 cache / config / recent / debug log / 错误信息。

## 一次性密钥语义

原始密钥不被保存。密钥在 `create` / `reset` 时仅随响应返回一次。**密钥丢失不能用 `get` 找回**——唯一恢复方式是 `lark_apps_openapi_key_reset` 重新生成新密钥（旧密钥同时失效）。

## scope 结构与表达

后端 `config.request_scope` 的真实结构（**snake_case**——Lark 开放网关 `/open-apis/` 对外契约约定；`api_key.thrift` 的 camelCase go.tag 是内部表示，OGW 已转成 snake_case）：

```json
{
  "allow_all": true,
  "http_infos": [
    { "http_method": "GET", "http_path": "/openapi/some-path" }
  ]
}
```

- `allow_all=true`：放开该应用所有 `/openapi/**` 路由；`http_infos` 此时忽略。
- `allow_all=false`：按 `http_infos` 逐条授权，每条需 `http_method`（大写）+ `http_path`（`/openapi/` 开头）。

提供三种互斥的 scope 表达方式：

| 参数 | 用途 | 备注 |
|---|---|---|
| `scope_all` | `allow_all=true`，放开所有路由 | bool 参数，显式传 `scope_all=false` 也算"已设置" |
| `scope_api="METHOD /openapi/path"` | 逐条授权一个路由，可重复 | 路由从应用 `docs/openapi.json` 取 |
| `scope="<raw request_scope JSON>"` | 高级逃生口，直传 request_scope JSON（snake_case） | 只校验合法 JSON；`scope` 与 `scope_all`/`scope_api` 互斥 |

### scope 值来源

妙搭应用的 `/openapi/**` 路由定义在应用仓库，并同步维护在 `docs/openapi.json`（`paths` 下每个 `"/openapi/..."` 条目 + HTTP 方法）。要授权哪些路由，读目标应用自己的 `docs/openapi.json`，取 `(method, path)` 对。当前不提供 API 路由发现功能（P1 规划中）。

## 高风险操作

`delete` 和 `reset` 是高风险（`high-risk-write`），有以下约束：

- 需显式传 `_confirm=true`；缺少时会被确认关卡拦下，**不要自动补 `_confirm=true`**。
- 支持 `dry_run=true` 查看将要执行的 HTTP 请求（不含密钥）；不确定时先 dry-run。
- **泄露场景**：应优先 `lark_apps_openapi_key_disable` 立即停用，而非 `lark_apps_openapi_key_delete`——停用可随时 enable 恢复，delete 不可逆。

## 典型决策场景

| 用户意图 | 正确操作 |
|---|---|
| "key 泄露了，先停掉" | `lark_apps_openapi_key_disable`（不是 delete） |
| "key 丢了/忘了，再给我一个" | `lark_apps_openapi_key_reset`（不是 create 新 key；reset 轮换密钥、保留原 key 配置） |
| "我的 key 密钥是什么" | 解释：list/get 不回显原始密钥，只能用 `lark_apps_openapi_key_reset` 轮换 |
| "给应用创建一个有权限限制的 key" | `lark_apps_openapi_key_create(name="...", scope_api="GET /openapi/...")`（路由取自应用 `docs/openapi.json`） |

## 不在本 skill 范围

- OpenAPI spec 全量导出、实时日志 tail、Webhook 消费、多鉴权方式：本期不支持。
- 身份选择、权限不足处理、确认审批、通用"禁输出密钥"红线、高风险操作通用框架：由 MCP server 统一处理，不在此重复。

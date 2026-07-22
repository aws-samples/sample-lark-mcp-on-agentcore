[中文](app-setup_zh.md) | [English](app-setup_en.md)

# 部署前：飞书应用配置

部署脚本不创建飞书应用，只校验已有应用的 App ID / App Secret。因此第 1~5 步需在运行
`install.sh` / `deploy.sh` 前完成；重定向 URL（第 6 步）用的是部署输出的地址，只能在部署
后配置。

> **中国版与国际版是两套独立平台。** 飞书（中国）和 Lark（国际版）的开放平台互不相通，
> 应用不能跨平台使用。租户属于哪一个，就在对应平台建应用、用对应域名，并与部署时的
> `LARKSUITE_CLI_BRAND`（`feishu` 或 `lark`）保持一致。
>
> | | 飞书（中国） | Lark（国际版） |
> |---|---|---|
> | 开发者后台 | https://open.feishu.cn/app | https://open.larksuite.com/app |

## 1. 创建企业自建应用

用管理员或具备建应用权限的账号登录开发者后台，在 **「企业自建应用」** 标签下点
**「创建企业自建应用」**，填写名称、描述、图标后点 **「创建」**。

## 2. 获取 App ID / App Secret

进入应用详情 → 左侧 **「凭证与基础信息」** → 复制 **App ID**（形如 `cli_xxxx`）和
**App Secret**，部署时 `deploy.sh` 会提示填入（也可用环境变量 `FEISHU_APP_ID` /
`FEISHU_APP_SECRET` 传入）。App Secret 仅用于服务端，`deploy.sh` 会加密存入 AWS Secrets
Manager。请妥善保管，不要提交到代码库。

## 3. 开通权限（scope）

进入应用详情 → 左侧 **「权限管理」** → **「开通权限」**。项目请求的 scope 以
[`config/oauth-scopes.json`](../config/oauth-scopes.json) 为准（`deploy.sh` 部署时据此向
飞书请求）。

在「权限管理」页点 **「批量导入/导出」**，将下面的 JSON 填入导入框即可一次性开通。本项目
为纯用户身份（不使用应用身份），因此全部权限归在 `user` 分组，`tenant` 留空：

```json
{
  "scopes": {
    "tenant": [],
    "user": [
      "im:message",
      "im:message:readonly",
      "im:message.send_as_user",
      "im:chat:read",
      "im:chat:update",
      "im:chat:create_by_user",
      "im:chat.members:read",
      "im:message.group_msg:get_as_user",
      "im:message.p2p_msg:get_as_user",
      "im:message.reactions:read",
      "calendar:calendar:read",
      "calendar:calendar.event:read",
      "calendar:calendar.event:create",
      "calendar:calendar.event:update",
      "calendar:calendar.event:delete",
      "calendar:calendar.free_busy:read",
      "docx:document:create",
      "docx:document:readonly",
      "docx:document:write_only",
      "docs:document.content:read",
      "docs:document:export",
      "docs:document:import",
      "drive:drive.metadata:readonly",
      "drive:file:upload",
      "drive:file:download",
      "space:document:retrieve",
      "search:docs:read",
      "search:message",
      "sheets:spreadsheet:read",
      "sheets:spreadsheet:write_only",
      "sheets:spreadsheet:create",
      "base:app:read",
      "base:table:read",
      "base:record:read",
      "base:record:create",
      "base:record:update",
      "base:record:delete",
      "base:field:read",
      "task:task:read",
      "task:task:write",
      "contact:user.base:readonly",
      "contact:user.basic_profile:readonly",
      "contact:user:search",
      "mail:user_mailbox:readonly",
      "mail:user_mailbox.message:modify",
      "mail:user_mailbox.message:send",
      "wiki:wiki:readonly",
      "wiki:node:read"
    ]
  }
}
```

> 升级 lark-cli 后 scope 可能变化，可用下面的命令从当前仓库重新生成：
>
> ```bash
> node -e 'console.log(JSON.stringify({scopes:{tenant:[],user:require("./config/oauth-scopes.json").filter(x=>x!=="offline_access")}},null,2))'
> ```

### 最小集，非全部能力

这份清单是首次授权的默认最小集，覆盖 im、calendar、docx、drive、sheets、base、task、
contact、mail、wiki 等高频场景。其余低频工具按需增量授权——用到时再向用户追加请求对应
scope。完整的 scope 清单见生成文件 `lambda/token-refresh-shim/scope-allowlist.ts`（勿手改）。

- **按需开通（推荐）**：先开这份最小集，之后某个工具报权限不足，再回后台补上对应 scope
  并发版（见 [faq_zh.md](faq_zh.md)"权限不足"一节）。
- **一次开全**：把 `scope-allowlist.ts` 的全量清单（同样去掉 `offline_access`）导入后台。这
  **不改变**用户首次授权时看到的权限——那始终是 `config/oauth-scopes.json` 的最小集，多出的
  scope 仍按需增量授权。它省去的是"每加一个工具就补开 scope、重新发版"的往返，代价是应用声明
  的权限上限更大（凭证一旦泄露，可请求面更广），管理员审核面也更大。除非这种往返成为负担，
  否则建议按需开通。

## 4. 设置可用范围

进入应用详情 → **「可用范围」**，指定哪些部门或成员可以使用该应用。只有范围内的成员能完成
OAuth 授权——决定「谁能连接」的是可用范围，而非任何密钥（详见 [faq_zh.md](faq_zh.md)）。默认
是全员可用，安全价值来自把范围收窄到真正需要的人。

## 5. 发布应用版本

在应用详情 → **「版本管理与发布」** 创建并提交版本，经企业管理员审核通过后，权限和配置才
对全员生效。**此后每次改动权限，都需重新发版。**

## 6. 部署后：配置重定向 URL

需等 `deploy.sh` 完成。部署成功后脚本会打印类似内容：

```
## Feishu App Settings (first deploy only)
Open: https://open.feishu.cn/app/<APP_ID>/safe
Add redirect URL: <OAuth 端点>/callback
```

进入应用详情 → 左侧 **「安全设置」** → 在 **「重定向 URL」** 区域填入那条 `.../callback`
地址 → 点 **「添加」**。

> **格式要求**（官方文档：[飞书](https://open.feishu.cn/document/uYjL24iN/uYjN3QjL2YzN04iN2cDN) ·
> [Lark](https://open.larksuite.com/document/server-docs/getting-started/authen-v1/redirect-urls)）：
> 必须填完整路径；URL 里的 `?` 查询串和 `#` 片段可以不写，写了也不生效。若跳过这步，用户
> 授权会失败：授权页报错误码 **20029**，授权码接口返回 `redirect_uri unmatch`。

## 权限一致性与生效规则

- 授权时请求的 scope 必须已在后台开通，否则授权页会忽略未开通的项，或授权后调用 API 仍报
  `permission denied`。因此后台开通的权限要覆盖 `config/oauth-scopes.json` 里除
  `offline_access` 之外的全部条目。
- 后台改动权限后需重新发版才生效。若补开的是用户早已同意、后台却漏开的 scope，发版后下次
  调用即生效；若是用户从未授权过的新 scope，**已连接的老用户不会自动获得，需重新授权**
  （重连步骤见 [faq_zh.md](faq_zh.md)）。

## 官方文档

- 开发者后台入口：[open.feishu.cn/app](https://open.feishu.cn/app)（中国）·
  [open.larksuite.com/app](https://open.larksuite.com/app)（国际）
- 配置重定向 URL：[飞书](https://open.feishu.cn/document/uYjL24iN/uYjN3QjL2YzN04iN2cDN)·
  [Lark](https://open.larksuite.com/document/server-docs/getting-started/authen-v1/redirect-urls)

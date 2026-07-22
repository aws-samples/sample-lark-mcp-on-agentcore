[中文](app-setup_zh.md) | [English](app-setup_en.md)

# 飞书 / Lark 应用配置（部署前后）

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

进入应用详情 → 左侧 **「权限管理」**，点 **「批量导入/导出」**，把 scope 清单填入导入框
一次性开通。本项目为纯用户身份（不使用应用身份），因此所有权限归在 `user` 分组，`tenant`
留空。

**推荐一次性开通全部 scope。** 本项目 200+ 工具中，首次授权只请求高频的最小集，低频工具
在用到时**增量授权**——而增量授权要能成功，前提是该 scope 已在后台开通。若后台只开了最小集，
用户用到低频工具时会因权限未申请而失败，仍得管理员回后台补开、重新发版。一次开全可免去这种
反复。它**不影响**用户首次授权看到的范围（那始终是最小集），代价只是应用声明的权限上限更大、
管理员审核项更多。

scope 清单（212 条，可直接复制导入）：

```json
{
  "scopes": {
    "tenant": [],
    "user": [
      "application:app_slash_command:read",
      "application:app_slash_command:write",
      "approval:approval:read",
      "approval:instance:read",
      "approval:instance:write",
      "approval:task:read",
      "approval:task:write",
      "attendance:task:readonly",
      "base:app:copy",
      "base:app:create",
      "base:app:read",
      "base:app:update",
      "base:block:create",
      "base:block:delete",
      "base:block:read",
      "base:block:update",
      "base:dashboard:create",
      "base:dashboard:delete",
      "base:dashboard:read",
      "base:dashboard:update",
      "base:field:create",
      "base:field:delete",
      "base:field:read",
      "base:field:update",
      "base:form:create",
      "base:form:delete",
      "base:form:read",
      "base:form:update",
      "base:history:read",
      "base:record:create",
      "base:record:delete",
      "base:record:read",
      "base:record:update",
      "base:role:create",
      "base:role:delete",
      "base:role:read",
      "base:role:update",
      "base:table:create",
      "base:table:delete",
      "base:table:read",
      "base:table:update",
      "base:view:read",
      "base:view:write_only",
      "base:workflow:create",
      "base:workflow:read",
      "base:workflow:update",
      "bitable:app",
      "board:whiteboard:node:create",
      "board:whiteboard:node:read",
      "calendar:calendar",
      "calendar:calendar.event:create",
      "calendar:calendar.event:delete",
      "calendar:calendar.event:read",
      "calendar:calendar.event:reply",
      "calendar:calendar.event:update",
      "calendar:calendar.free_busy:read",
      "calendar:calendar:create",
      "calendar:calendar:delete",
      "calendar:calendar:read",
      "calendar:calendar:readonly",
      "calendar:calendar:update",
      "contact:user.base:readonly",
      "contact:user.basic_profile:readonly",
      "contact:user:search",
      "docs:doc",
      "docs:doc:readonly",
      "docs:document.comment:create",
      "docs:document.comment:delete",
      "docs:document.comment:read",
      "docs:document.comment:update",
      "docs:document.comment:write_only",
      "docs:document.content:read",
      "docs:document.media:download",
      "docs:document.media:upload",
      "docs:document:copy",
      "docs:document:export",
      "docs:document:import",
      "docs:permission.member:apply",
      "docs:permission.member:auth",
      "docs:permission.member:create",
      "docs:permission.member:transfer",
      "docs:permission.setting:read",
      "docs:permission.setting:write_only",
      "docs:secure_label:readonly",
      "docs:secure_label:write_only",
      "docx:document:create",
      "docx:document:readonly",
      "docx:document:write_only",
      "drive:drive",
      "drive:drive.metadata:readonly",
      "drive:drive:readonly",
      "drive:file",
      "drive:file:download",
      "drive:file:upload",
      "drive:file:view_record:readonly",
      "drive:quota_detail:read_one",
      "im:chat",
      "im:chat.managers:write_only",
      "im:chat.members:read",
      "im:chat.members:write_only",
      "im:chat.moderation:read",
      "im:chat.nickname:read",
      "im:chat.nickname:write",
      "im:chat.user_setting:read",
      "im:chat.user_setting:write",
      "im:chat:create_by_user",
      "im:chat:moderation:write_only",
      "im:chat:read",
      "im:chat:readonly",
      "im:chat:update",
      "im:feed.flag:read",
      "im:feed.flag:write",
      "im:feed.shortcut:read",
      "im:feed.shortcut:write",
      "im:feed_group_v1:read",
      "im:feed_group_v1:write",
      "im:message",
      "im:message.group_msg:get_as_user",
      "im:message.p2p_msg:get_as_user",
      "im:message.pins:read",
      "im:message.pins:write_only",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "im:message.send_as_user",
      "im:message:readonly",
      "im:message:recall",
      "im:resource",
      "mail:event",
      "mail:user_mailbox.event.mail_address:read",
      "mail:user_mailbox.folder:read",
      "mail:user_mailbox.folder:write",
      "mail:user_mailbox.mail_contact:read",
      "mail:user_mailbox.mail_contact:write",
      "mail:user_mailbox.message.address:read",
      "mail:user_mailbox.message.body:read",
      "mail:user_mailbox.message.subject:read",
      "mail:user_mailbox.message:modify",
      "mail:user_mailbox.message:readonly",
      "mail:user_mailbox.message:send",
      "mail:user_mailbox.rule:read",
      "mail:user_mailbox.rule:write",
      "mail:user_mailbox:readonly",
      "mindnote:node:create",
      "mindnote:node:read",
      "minutes:minutes",
      "minutes:minutes.artifacts:read",
      "minutes:minutes.basic:read",
      "minutes:minutes.media:export",
      "minutes:minutes.search:read",
      "minutes:minutes.upload:write",
      "minutes:minutes:readonly",
      "minutes:minutes:update",
      "minutes:permission:apply",
      "okr:okr.content:readonly",
      "okr:okr.content:writeonly",
      "okr:okr.period:readonly",
      "okr:okr.progress.file:upload",
      "okr:okr.progress:delete",
      "okr:okr.progress:readonly",
      "okr:okr.progress:writeonly",
      "okr:okr.setting:read",
      "profile:user_profile:read",
      "search:docs:read",
      "search:message",
      "sheets:spreadsheet",
      "sheets:spreadsheet.meta:read",
      "sheets:spreadsheet:create",
      "sheets:spreadsheet:read",
      "sheets:spreadsheet:readonly",
      "sheets:spreadsheet:write_only",
      "slides:presentation:create",
      "slides:presentation:read",
      "slides:presentation:update",
      "slides:presentation:write_only",
      "space:document:delete",
      "space:document:move",
      "space:document:retrieve",
      "space:document:shortcut",
      "space:folder:create",
      "spark:app:read",
      "spark:app:write",
      "task:attachment:write",
      "task:comment:write",
      "task:custom_field:read",
      "task:custom_field:write",
      "task:section:read",
      "task:section:write",
      "task:task:read",
      "task:task:write",
      "task:task:writeonly",
      "task:tasklist:read",
      "task:tasklist:write",
      "vc:meeting.bot.join:write",
      "vc:meeting.meetingevent:read",
      "vc:meeting.message:write",
      "vc:meeting.search:read",
      "vc:meeting:readonly",
      "vc:note:read",
      "vc:record:readonly",
      "wiki:member:create",
      "wiki:member:retrieve",
      "wiki:member:update",
      "wiki:node:copy",
      "wiki:node:create",
      "wiki:node:move",
      "wiki:node:read",
      "wiki:node:retrieve",
      "wiki:space:read",
      "wiki:space:retrieve",
      "wiki:space:write_only",
      "wiki:wiki",
      "wiki:wiki:readonly"
    ]
  }
}
```

> 该清单已剔除飞书后台批量导入会报"权限不存在"的少数条目（拼写别名或聚合写法、被粗粒度
> `:write` 覆盖的细分动作、白名单专属权限），能力不受影响。

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

## 权限变更的生效规则

后台改动权限后需重新发版才生效。若补开的是用户早已同意、后台却漏开的 scope，发版后下次
调用即生效；若是用户从未授权过的新 scope，**已连接的老用户不会自动获得，需重新授权**
（重连步骤见 [faq_zh.md](faq_zh.md)）。

## 官方文档

- 开发者后台入口：[open.feishu.cn/app](https://open.feishu.cn/app)（中国）·
  [open.larksuite.com/app](https://open.larksuite.com/app)（国际）
- 配置重定向 URL：[飞书](https://open.feishu.cn/document/uYjL24iN/uYjN3QjL2YzN04iN2cDN)·
  [Lark](https://open.larksuite.com/document/server-docs/getting-started/authen-v1/redirect-urls)

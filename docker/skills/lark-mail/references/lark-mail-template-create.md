# mail +template-create

创建一个新的个人邮件模板。适用于需要长期复用的邮件框架，例如周报、客户通知、请假申请等。

不要用此工具发送邮件；模板只是预置内容，实际发信请使用 `lark_mail_send` / `lark_mail_draft_create` 等工具配合 `template_id` 套用。

如需修改已有模板，使用 `lark_mail_template_update`（详见 `lark_get_skill(domain="mail", section="template-update")`）。

## 安全约束

- **模板正文也会被当作邮件内容对外发送**——所有邮件域的通用安全规则（prompt injection、XSS、敏感信息）同样适用。
- **不要把模板内容以文本形式输出给用户请求最终确认**。工具返回 `template_id` 后，引导用户在飞书邮箱 UI 里打开模板核对。
- 用户模板上限 **20** 个，单模板 `template_content` 上限 **3 MB**；超限会被后端拒绝。

## 调用

```
# 纯 HTML 模板
lark_mail_template_create(name="周报模板", subject="本周进展", template_content="<p>大家好，请见本周进展：</p><ul><li>……</li></ul>")

# 带 HTML 内嵌图片 + 非 inline 附件
lark_mail_template_create(name="客户通知模板", subject="产品更新", template_content="<p>新版本上线：</p><img src=\"./banner.png\"><p>附上发版说明。</p>", attach="./release-notes.pdf")

# 从文件加载正文
lark_mail_template_create(name="请假申请", template_content_file="./leave.html", to="manager@example.com,hr@example.com")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 模板名称，≤100 字符 |
| `subject` | 否 | 默认主题 |
| `template_content` | 否* | 模板正文。HTML 首选；支持 `<img src="./local.png" />` 相对路径自动上传到 Drive 并改写为 `cid:` |
| `template_content_file` | 否* | 从文件加载正文内容；与 `template_content` 互斥 |
| `plain_text` | 否 | 标记为纯文本模式（`is_plain_text_mode=true`）。仍可带内嵌图片，但 `lark_mail_send(template_id=...)` 套用时会走 plain-text 正文拼接 |
| `to` | 否 | 默认收件人列表，逗号分隔，支持 `Name <email>` 格式 |
| `cc` | 否 | 默认抄送 |
| `bcc` | 否 | 默认密送 |
| `attach` | 否 | 非 inline 附件路径，逗号分隔。每个文件按 `attach` 书写顺序上传到 Drive |
| `mailbox` | 否 | 所属邮箱，默认 `me`（当前用户主邮箱） |

\* `template_content` / `template_content_file` 二选一；两者都留空则模板正文为空（用户之后可通过 `lark_mail_template_update` 补充）。

## HTML 内嵌图片自动上传

正文中所有不带 URI scheme 的 `<img src="./local.png">`（相对路径）会被：

1. 上传到 Drive（≤20 MB 走 `medias/upload_all`；>20 MB 走 `upload_prepare + upload_part + upload_finish`）
2. 生成 UUIDv4 CID
3. HTML 改写为 `<img src="cid:<uuid>">`
4. 在 `attachments[]` 追加 `{id: <file_key>, cid, is_inline: true, filename, attachment_type}`

带 URI scheme 的 `<img src="https://...">` 或 `<img src="cid:...">` 跳过上传。

## SMALL vs LARGE 附件

附件分为 SMALL（`attachment_type=1`，内嵌到 EML）和 LARGE（`attachment_type=2`，由服务端渲染成下载链接）。切换阈值：

- **本地单文件大小**：≤20 MB 用 `upload_all`，>20 MB 分块上传（与 SMALL/LARGE 无关，只影响 Drive 上传路径）。
- **累计 EML 投影**：`subject + to + cc + bcc + template_content + base64 附件体积`；同批次累计超过 **25 MB** 后，剩余的非 inline 附件标 `LARGE`，inline 图片不能切换到 LARGE（HTML `cid:` 引用要求 MIME part 存在）。

## 返回值

成功返回：

```json
{
  "template": {
    "template_id": "712345",
    "name": "周报模板",
    "subject": "本周进展",
    "template_content": "<p>...</p>",
    "is_plain_text_mode": false,
    "tos": [{"mail_address": "alice@example.com"}],
    "attachments": [...],
    "create_time": "1714000000000"
  }
}
```

- `template_id` 为十进制字符串。后续套用模板时 `template_id="<template_id>"`。

## 错误码速查

| errno | HTTP | 触发 |
|-------|------|------|
| `15080201 InvalidTemplateName` | 400 | `name` 为空或超 100 字符 |
| `15080202 TemplateNumberLimit` | 400 | 已达 20 模板上限 |
| `15080203 TemplateContentSizeLimit` | 400 | 单模板 > 3 MB |
| `15080206 TemplateTotalSizeLimit` | 400 | 所有模板总大小 > 50 MB |
| `15080207 InvalidTemplateParam` | 400 | 其他参数错误 |

## 所需 scope

`mail:user_mailbox.message:modify`

## 相关

- 更新模板：`lark_mail_template_update`（详见 `lark_get_skill(domain="mail", section="template-update")`）
- 套用模板发信：在 `lark_mail_send` / `lark_mail_draft_create` / `lark_mail_reply` / `lark_mail_reply_all` / `lark_mail_forward` 中使用 `template_id`
- 原生 API：
  - `lark_invoke(tool_name="lark_mail_user_mailbox_templates_list", args={params: {"user_mailbox_id": "me"}})` — 列出模板
  - `lark_invoke(tool_name="lark_mail_user_mailbox_templates_get", args={params: {"user_mailbox_id": "me", "template_id": "<id>"}})` — 获取完整模板
  - `lark_invoke(tool_name="lark_mail_user_mailbox_templates_delete", args={params: {"user_mailbox_id": "me", "template_id": "<id>"}})` — 删除

[中文](app-setup_zh.md) | [English](app-setup_en.md)

# Feishu / Lark app setup (before & after deploy)

The deploy script **does not create the app** — it only validates the App ID / App
Secret of an existing app. Do steps 1–5 **before** running `install.sh` / `deploy.sh`.
The redirect URL (step 6) uses an address printed by `deploy.sh`, so it can only be set
**afterward**.

> **Feishu (China) and Lark (International) are two separate platforms.** Their open
> platforms are not connected and an app cannot be used across them. Create the app on
> the platform your tenant belongs to, and use the matching domain for every link
> below. This must match your `LARKSUITE_CLI_BRAND` setting (`feishu` or `lark`) at
> deploy time.
>
> | | Feishu (China) | Lark (International) |
> |---|---|---|
> | Developer Console | https://open.feishu.cn/app | https://open.larksuite.com/app |

## 1. Create a custom app

Log in to the Developer Console as an admin (or an account allowed to create apps).
Under the **Custom Apps** tab, click **Create Custom App**, fill in the name,
description, and icon, then click **Create**.

## 2. Get App ID / App Secret

Open the app → **Credentials & Basic Info** in the left nav → copy the **App ID**
(looks like `cli_xxxx`) and **App Secret**. `deploy.sh` prompts for both (or pass them
via the `FEISHU_APP_ID` / `FEISHU_APP_SECRET` environment variables). The App Secret is
used server-side only — `deploy.sh` stores it encrypted in AWS Secrets Manager. Keep it
safe and never commit it to version control.

## 3. Enable permission scopes

Open the app → **Permissions & Scopes** in the left nav, click **Import/Export**, and
paste the scope list into the import box to enable it all at once. This project is
**user-identity only** (no app identity), so every scope goes under `user` and `tenant`
stays empty.

**Enable all scopes at once — recommended.** Across the 200+ tools, first
authorization requests only the high-frequency minimal set; lower-frequency tools
authorize **incrementally** when first used. But incremental authorization only succeeds
if the scope is already enabled in the console — if you enable only the minimal set,
a user hitting a low-frequency tool fails because the scope was never requested, and an
admin still has to go back, enable it, and re-publish. Enabling everything up front
avoids that loop. It does **not** widen what users see at first authorization (still the
minimal set); the only cost is a larger declared permission ceiling and more items for
your admin to approve.

Scope list (212 entries, copy-paste ready):

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

> This list omits the few scopes that bulk import rejects with a "permission does not
> exist" error (spelling aliases or bare aggregates, fine-grained actions the coarse
> `:write` already covers, and whitelist-only scopes) — capabilities are unaffected.

## 4. Set app availability

Open the app → **Availability** and limit it to the departments or members who should
be able to use it. Only members in scope can complete OAuth — Availability, not any
credential, is what decides who can connect (see [faq_en.md](faq_en.md)). It defaults to
all members, so the security value comes from narrowing it to who actually needs access.

## 5. Publish an app version

Open the app → **Version Management & Release**, create and submit a version. Scopes
and config take effect for everyone only after your workspace admin approves it. **Any
later permission change requires publishing a new version.**

## 6. After deploy: configure the redirect URL

Do this after `deploy.sh` finishes. On success the script prints something like:

```
## Feishu App Settings (first deploy only)
Open: https://open.feishu.cn/app/<your APP_ID>/safe
Add redirect URL: <printed OAuth endpoint>/callback
```

Open the app → **Security Settings** in the left nav → in the **Redirect URLs** area,
paste that `.../callback` address → click **Add**.

> **Format** (official docs:
> [Feishu](https://open.feishu.cn/document/uYjL24iN/uYjN3QjL2YzN04iN2cDN) ·
> [Lark](https://open.larksuite.com/document/server-docs/getting-started/authen-v1/redirect-urls)):
> use the **full path**; a `?` query string or `#` fragment may be omitted (neither
> affects URL matching). If you skip this step, user authorization fails — the
> authorization page reports **20029**, and the auth-code endpoint returns
> `redirect_uri unmatch`.

## When permission changes take effect

A permission change requires publishing a new version. A scope the user already
consented to (but the console had left off) takes effect on the next call. A scope the
user never authorized won't reach already-connected users automatically — **they must
re-authorize** (re-connect steps in [faq_en.md](faq_en.md)).

## Official docs

- Developer Console: [open.feishu.cn/app](https://open.feishu.cn/app) (China) ·
  [open.larksuite.com/app](https://open.larksuite.com/app) (International)
- Configure redirect URLs:
  [Feishu](https://open.feishu.cn/document/uYjL24iN/uYjN3QjL2YzN04iN2cDN) ·
  [Lark](https://open.larksuite.com/document/server-docs/getting-started/authen-v1/redirect-urls)

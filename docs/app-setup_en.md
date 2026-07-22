[中文](app-setup_zh.md) | [English](app-setup_en.md)

# Before deploy: Feishu / Lark app setup

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

Open the app → **Permissions & Scopes** in the left nav. The scopes this project
requests are defined by [`config/oauth-scopes.json`](../config/oauth-scopes.json) in
the repo — the exact list `deploy.sh` requests from Feishu/Lark at deploy time.

On the Permissions page, click **Import/Export** and paste the JSON below into the
import box to enable them all at once. This project is **user-identity only** (no app
identity), so every scope goes under `user` and `tenant` stays empty:

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

> Scopes can change when lark-cli is bumped; regenerate from the current repo:
>
> ```bash
> node -e 'console.log(JSON.stringify({scopes:{tenant:[],user:require("./config/oauth-scopes.json").filter(x=>x!=="offline_access")}},null,2))'
> ```

### A minimal set, not the full surface

The list above is the default minimal set requested at first authorization, covering
common im / calendar / docx / drive / sheets / base / task / contact / mail / wiki
scenarios. Lower-frequency tools authorize incrementally — the extra scope is requested
from the user on demand. The full scope surface lives in the generated file
`lambda/token-refresh-shim/scope-allowlist.ts` (never hand-edit).

- **Grant on demand (recommended):** enable the minimal set above. When a tool later
  reports "permission denied", go back and enable the corresponding scope, then publish
  a new version (see the "permission denied" entry in [faq_en.md](faq_en.md)).
- **Grant everything at once:** import the full list from `scope-allowlist.ts` (also
  with `offline_access` removed) into the console. This does **not** change what users
  see at first authorization — that stays the minimal set from `config/oauth-scopes.json`,
  and extra scopes are still authorized incrementally. It only spares you the
  enable-scope-then-republish round-trip each time a new tool needs one, at the cost of a
  larger declared permission ceiling (a wider request surface if credentials leak) and a
  larger footprint for your admin to approve. Prefer on-demand unless that round-trip
  becomes a burden.

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

## Scope consistency & when changes take effect

- **The scopes requested must already be enabled in the console.** Otherwise the
  authorization page silently drops the un-enabled ones, or API calls still fail with
  `permission denied`. So the enabled permissions must **cover** every entry in
  `config/oauth-scopes.json` except `offline_access`.
- **A permission change requires publishing a new version.** A scope the user already
  consented to (but the console had left off) takes effect on the next call. A scope the
  user never authorized won't reach already-connected users automatically — **they must
  re-authorize** (re-connect steps in [faq_en.md](faq_en.md)).

## Official docs

- Developer Console: [open.feishu.cn/app](https://open.feishu.cn/app) (China) ·
  [open.larksuite.com/app](https://open.larksuite.com/app) (International)
- Configure redirect URLs:
  [Feishu](https://open.feishu.cn/document/uYjL24iN/uYjN3QjL2YzN04iN2cDN) ·
  [Lark](https://open.larksuite.com/document/server-docs/getting-started/authen-v1/redirect-urls)

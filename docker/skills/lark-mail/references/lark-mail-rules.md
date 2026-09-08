# 收信规则 Shortcut

管理自动处理收到邮件的规则。优先使用 `lark_mail_rule_*` 工具，通过稳定英文 alias 编写条件和动作；只有需要这些工具尚未建模的服务端字段时，才回退到 `user_mailbox.rules` 原子 raw API。规则写操作需使用真实 `rule_id`，不要猜测 ID。创建、更新、删除规则属于 high-risk-write，需要按 SKILL.md 的高风险写规则获得用户确认并传 `_confirm=true`；启停和排序是普通写操作，免 `_confirm`。

## 常用工具

```
# 列出规则，输出 semantic_spec、description、unknowns
lark_mail_rule_list(user_mailbox_id="me", format="json")

# 按名称做本地过滤
lark_mail_rule_list(user_mailbox_id="me", name_contains="Alpha")

# 查看单条规则
lark_mail_rule_get(user_mailbox_id="me", rule_id="<rule_id>")

# 创建规则：主题包含 Alpha 时标为已读
# condition / action 是数组参数，一个元素一条条件或动作
lark_mail_rule_create(name="Alpha通知已读", condition=["subject:contains:Alpha"], action=["mark_read"], _confirm=true)

# 多条条件 + match 模式
lark_mail_rule_create(name="外部带附件归档", condition=["external", "has_attachment"], action=["archive"], match="all", _confirm=true)

# 更新规则：未传字段会先读当前规则并保留；传 condition / action 会替换对应完整集合
lark_mail_rule_update(rule_id="<rule_id>", name="Alpha通知归档", action=["archive"], _confirm=true)

# 启停规则（普通写操作，免 _confirm）
lark_mail_rule_disable(rule_id="<rule_id>")
lark_mail_rule_enable(rule_id="<rule_id>")

# 删除规则：不带 _confirm 调用时，工具只拉取目标规则并返回确认摘要，不执行删除
lark_mail_rule_delete(rule_id="<rule_id>")
lark_mail_rule_delete(rule_id="<rule_id>", _confirm=true)

# 调整顺序：完整顺序或单条移动二选一
lark_mail_rule_reorder(rule_ids="<rule_id_1>,<rule_id_2>,<rule_id_3>")
lark_mail_rule_reorder(move_rule_id="<rule_id_3>", before_rule_id="<rule_id_1>")
lark_mail_rule_reorder(move_rule_id="<rule_id_3>", after_rule_id="<rule_id_1>")
lark_mail_rule_reorder(move_rule_id="<rule_id_3>", to_top=true)
lark_mail_rule_reorder(move_rule_id="<rule_id_3>", to_bottom=true)
```

## 参数

`lark_mail_rule_list` / `lark_mail_rule_get` / `lark_mail_rule_delete` / `lark_mail_rule_enable` / `lark_mail_rule_disable`：

| 参数 | 类型 | 说明 |
|------|------|------|
| `user_mailbox_id` | string | 规则所属邮箱 ID 或地址，默认 `me` |
| `rule_id` | string | 目标规则 ID（`lark_mail_rule_list` 不需要） |
| `name_contains` | string | 仅 `lark_mail_rule_list`：对规则名做本地过滤 |
| `_confirm` | boolean | 仅 `lark_mail_rule_delete` 执行时必填 |

`lark_mail_rule_create` / `lark_mail_rule_update`：

| 参数 | 类型 | 说明 |
|------|------|------|
| `user_mailbox_id` | string | 规则所属邮箱 ID 或地址，默认 `me` |
| `rule_id` | string | 仅 update：要修改的规则 ID |
| `name` | string | create 必填的规则名；update 时为可选新名称 |
| `condition` | **数组** | 条件 grammar，一个元素一条条件（cobra `stringArray`，不做逗号切分） |
| `conditions` | string | 条件的 JSON 数组/对象，与 `condition` 二选一 |
| `action` | **数组** | 动作 grammar，一个元素一条动作（cobra `stringArray`，不做逗号切分） |
| `actions` | string | 动作的 JSON 数组/对象，与 `action` 二选一 |
| `match` | string | 条件匹配模式：`all`（默认）或 `any` |
| `enable` / `disable` | boolean | 启用 / 停用该规则 |
| `stop_after_match` / `continue_after_match` | boolean | 命中后停止 / 继续评估后续规则 |
| `_confirm` | boolean | 执行时必填（high-risk-write） |

`lark_mail_rule_reorder`：

| 参数 | 类型 | 说明 |
|------|------|------|
| `user_mailbox_id` | string | 规则所属邮箱 ID 或地址，默认 `me` |
| `rule_ids` | string | 完整目标顺序，逗号分隔；必须恰好包含当前每条规则一次 |
| `move_rule_id` | string | 要在当前顺序中移动的规则 ID |
| `before_rule_id` / `after_rule_id` | string | 把 `move_rule_id` 放到该规则之前 / 之后 |
| `to_top` / `to_bottom` | boolean | 把 `move_rule_id` 移到最前 / 最后 |

> `condition` / `action` 是数组参数，`rule_ids` 是逗号分隔的字符串——两者写法不同，不要混用。把多条条件写成 `condition="a,b"` 不会被切分，会变成一条畸形条件。

## Alias 速查

条件 grammar（每个元素一条）：

```text
field:op:value
field:op
field
```

常用字段：`from`/`sender`、`to`/`recipient`、`cc`、`to_or_cc`、`subject`/`title`、`body`、`attachment_name`、`attachment_type`、`any_address`、`all_mail`/`all`、`external`、`spam`、`not_spam`、`has_attachment`。

常用操作符：`contains`/`include`、`not_contains`/`exclude`、`starts_with`/`prefix`、`ends_with`/`suffix`、`equals`/`eq`/`is`、`not_equals`/`ne`、`contains_self`/`self`、`empty`/`is_empty`。

动作 grammar（每个元素一条）：

```text
kind
kind:key=value
kind:json={"key":"value"}
```

常用动作：`archive`、`delete_mail`/`trash`、`mark_read`/`read`、`move_spam`/`spam`、`not_spam`/`never_spam`、`star`/`flag`、`mute_notification`/`mute`、`move_folder:folder_id=<id>`。

`conditions` / `actions` 接受 JSON 字符串。上游 CLI 还支持 `@file` 形式从本地文件读取，MCP 调用方没有可访问的文件系统，**只能内联传 JSON**：

```
lark_mail_rule_create(name="Alpha通知已读", conditions="[{\"field\":\"subject\",\"operator\":\"contains\",\"value\":\"Alpha\"},{\"field\":\"has_attachment\"}]", action=["mark_read"], _confirm=true)
```

对应的 JSON 结构：

```json
[
  {"field":"subject","operator":"contains","value":"Alpha"},
  {"field":"has_attachment"}
]
```

## Unknown raw 策略

- 读路径宽容：`lark_mail_rule_list` / `lark_mail_rule_get` 遇到未知枚举或扩展字段仍输出规则，`unknowns[]` 会说明无法识别的 raw 片段，`raw` 会保留原始规则。
- 更新规则：`lark_mail_rule_update` 是"传什么改什么"。只改名称、启停、match 或 stop-after-match 时保留未触碰的 raw；传入新的 `condition` / `conditions` 时替换 condition items，未传 `match` 就保留当前 match_type；传入新的 `action` / `actions` 时替换 action items。
- 启停：`lark_mail_rule_enable` / `lark_mail_rule_disable` 在切换 `is_enable` 的同时保留未知的 raw conditions / actions。
- 输入校验：alias 或语义字符串必须能映射到工具支持的枚举，否则报错；直接传工具不认识的枚举数字也报错。
- raw fallback：需要写入这些工具尚未建模的服务端字段时，读取 `raw` 后改用原子 `user_mailbox.rules` raw API。

## 原子 raw fallback：主题包含文本 → 标记为已读

```
# 1. 创建规则：主题包含指定文本时标记为已读
lark_invoke(tool_name="lark_mail_user_mailbox_rules_create", args={params: {"user_mailbox_id": "me"}, data: {"name": "<rule_name>", "is_enable": true, "ignore_the_rest_of_rules": false, "condition": {"match_type": 1, "items": [{"type": 6, "operator": 1, "input": "<subject_text>"}]}, "action": {"items": [{"type": 3}]}}})

# 2. 验证规则
lark_invoke(tool_name="lark_mail_user_mailbox_rules_list", args={params: {"user_mailbox_id": "me"}})

# 3. 删除规则（需用户确认）
lark_invoke(tool_name="lark_mail_user_mailbox_rules_delete", args={params: {"user_mailbox_id": "me", "rule_id": "<rule_id>"}})
```

Quick codes above: condition `type=6` = subject, `operator=1` = contains, action `type=3` = mark as read.

## 原生 API

收信规则走 `user_mailbox.rules` 资源。参数不确定时先查：

```
lark_discover(query="mail.user_mailbox.rules")
lark_discover(query="mail.user_mailbox.rules.<method>")
```

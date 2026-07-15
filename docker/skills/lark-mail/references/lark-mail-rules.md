# 收信规则

管理自动处理收到邮件的规则。规则写操作需使用真实 `rule_id`，不要猜测 ID。规则写操作执行前需按 SKILL.md 的写操作确认规则获得用户确认。

## 主题包含文本 → 标记为已读

```
# 1. 创建规则：主题包含指定文本时标记为已读
lark_invoke(tool_name="lark_mail_user_mailbox_rules_create", args={params: {"user_mailbox_id": "me"}, data: {"name": "<rule_name>", "is_enable": true, "ignore_the_rest_of_rules": false, "condition": {"match_type": 1, "items": [{"type": 6, "operator": 1, "input": "<subject_text>"}]}, "action": {"items": [{"type": 3}]}}})

# 2. 验证规则
lark_invoke(tool_name="lark_mail_user_mailbox_rules_list", args={params: {"user_mailbox_id": "me"}})

# 3. 删除规则
lark_invoke(tool_name="lark_mail_user_mailbox_rules_delete", args={params: {"user_mailbox_id": "me", "rule_id": "<rule_id>"}})
```

Quick codes above: condition `type=6` = subject, `operator=1` = contains, action `type=3` = mark as read.

## 原生 API

收信规则走 `user_mailbox.rules` 资源。参数不确定时先运行：

```
lark_discover(query="mail.user_mailbox.rules")
lark_discover(query="mail.user_mailbox.rules.<method>")
```

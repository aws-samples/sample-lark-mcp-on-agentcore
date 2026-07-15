# lark_contact_get_user

按 ID 取用户基本信息(姓名等)。

```
# 取自己
lark_contact_get_user()

# 按 open_id 取他人（user 身份字段较少，建议用 lark_contact_search_user）
lark_contact_get_user(user_id="ou_xxx")

# 按 union_id / user_id 取（默认 open_id）
lark_contact_get_user(user_id="<id>", user_id_type="union_id")
```

## 注意事项

- **user 身份按 ID 取他人请用 `lark_contact_search_user(user_ids="<id>")`**,字段比本工具多(部门 / 邮箱 / 是否激活等)。本工具的 user 模式只回很少字段。
- ⚠️ bot 身份下的 `lark_contact_get_user` 需要 bot identity，MCP server 不可用。

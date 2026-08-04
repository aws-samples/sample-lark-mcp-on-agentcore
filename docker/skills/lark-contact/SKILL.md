---
name: lark-contact
description: "飞书 / Lark 通讯录：按姓名 / 邮箱解析成 open_id，或按 open_id 反查姓名 / 部门 / 邮箱 / 联系方式 / 个人状态 / 签名，以及按关键词搜索当前用户可见的机器人 / 智能体（agent）。当用户提到一个名字要下一步发消息 / 排日程，或拿到 open_id 想查具体信息时使用。不负责部门树遍历、按部门列员工、组织架构图，这类需求走原生 OpenAPI。"
---

# contact (v2)

## 选哪个工具

**user 身份和 bot 身份是两条完全独立的路径**。MCP server 始终使用 user 身份，按下表选工具:

| 想做什么 | user 身份 | bot 身份 |
|---|---|---|
| 按姓名 / 邮箱搜员工拿 open_id | `lark_contact_search_user` (参见 `lark_get_skill(domain="contact", section="search-user")`) | 不支持 |
| 按关键词搜索当前用户可见的机器人 / 智能体 | `lark_contact_search_bot` (参见 `lark_get_skill(domain="contact", section="search-bot")`) | 不支持 |
| 已知 open_id 取他人资料 | `lark_contact_search_user(user_ids="<id>")` | ⚠️ 需要 bot 身份，MCP server 不可用 |
| 查看自己 | `lark_contact_get_user()` (参见 `lark_get_skill(domain="contact", section="get-user")`) 或 `lark_contact_search_user(user_ids="me")` | 不支持 |
| 查同事的个人状态 / 签名 | 通过 `lark_invoke` 调用 `lark_contact_user_profiles_batch_query` | 不支持 |

已知 open_id 只是想发消息 / 排日程,不必经过 contact —— 直接用 `lark_get_skill(domain="im")` / `lark_get_skill(domain="calendar")`。

### 名字没说清是人还是机器人 / 智能体

用户给的名字常常不表明类型。例如「和 reviewDuck 约个会」里的 reviewDuck 可能是同事昵称,也可能是机器人。
- 名字含 bot / agent / AI / 助手 / 机器人 / 智能体 / assistant 等明显特征时,反过来先搜机器人更快
- 不确定的话两边都搜一下

## 典型场景

找张三给他发消息:先搜,确认 open_id,再发:

```
lark_contact_search_user(query="张三", has_chatted=true)
lark_im_messages_send(user_id="ou_xxx", text="Hi!")
```

批量查同事的个人状态 / 个性签名(先用 lark_discover 看参数)。

```
lark_discover(query="contact.user_profiles.batch_query")
lark_invoke(tool_name="lark_contact_user_profiles_batch_query", args={
  params: {"user_id_type": "open_id"},
  data: {"user_ids": ["ou_xxx", "ou_yyy"], "query_option": {"include_personal_status": true, "include_description": true}}
})
```

搜索命中多条且后续操作有副作用(发消息、邀请会议等),把候选列给用户挑;不要擅自选第一条。

## 搜索机器人 / 智能体

`lark_contact_search_bot` 使用 user 身份按关键词搜索当前用户可见的机器人,返回 `ou_` 开头的机器人 open_id。参数细节等见 `lark_get_skill(domain="contact", section="search-bot")`。

```
lark_contact_search_bot(query="会议助手")
lark_contact_search_bot(queries="会议助手,日报助手,审批助手")
```

## 注意事项

- **41050 / Permission denied** 受当前身份的可见范围限制(三个工具都可能遇到)。需要管理员调整可见范围。
- **跨租户用户**(`is_cross_tenant=true`)多数业务字段为空字符串,这是飞书可见性规则,下游做空值兜底。
- **ID 类型**:`lark_contact_get_user` 可通过 `user_id_type` 使用 `open_id`、`union_id` 或 `user_id`；`lark_contact_search_user` 使用用户 open_id;`lark_contact_search_bot` 不支持按 ID 查询,它按关键词搜索并返回机器人 open_id。

## 不在本 skill 范围

- 发消息 / 查聊天记录 → `lark_get_skill(domain="im")`
- 排日程 / 邀请会议 → `lark_get_skill(domain="calendar")`
- 部门树 / 按部门列员工 / 组织架构 → `lark_get_skill(domain="openapi-explorer")` 查找原生接口

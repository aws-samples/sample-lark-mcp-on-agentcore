# mail +share-to-chat

将邮件以卡片形式分享到飞书 IM 会话（群聊或个人对话）。内部两步完成：创建分享凭证 → 发送卡片到 IM。

**依赖 Scope：** `mail:user_mailbox.message:readonly`、`im:message`、`im:message.send_as_user`

## 调用

```
# 分享单封邮件到群聊（默认 receive_id_type=chat_id）
lark_mail_share_to_chat(message_id="<邮件ID>", receive_id="oc_xxx")

# 分享整个会话到群聊
lark_mail_share_to_chat(thread_id="<会话ID>", receive_id="oc_xxx")

# 通过邮箱分享给个人
lark_mail_share_to_chat(message_id="<邮件ID>", receive_id="user@example.com", receive_id_type="email")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `message_id` | 否（二选一） | 要分享的邮件 ID，与 `thread_id` 互斥 |
| `thread_id` | 否（二选一） | 要分享的邮件会话 ID，与 `message_id` 互斥 |
| `receive_id` | 是 | 目标接收者 ID，类型由 `receive_id_type` 决定 |
| `receive_id_type` | 否 | 接收者 ID 类型（默认 `chat_id`）。可选：`chat_id` / `open_id` / `user_id` / `union_id` / `email` |
| `mailbox` | 否 | 邮箱地址（默认 `me`） |

## 返回值

```json
{
  "ok": true,
  "data": {
    "card_id": "550e8400-e29b-41d4-a716-446655440000",
    "im_message_id": "om_dc13264520392913993dd051dba21dcf"
  }
}
```

## 典型场景

### 场景 1：用户说"帮我把这封邮件分享到项目群"

```
# Step 1: 搜索群聊获取 chat_id
lark_im_chat_search(query="项目群")
# → 获取 chat_id: oc_xxx

# Step 2: 分享邮件
lark_mail_share_to_chat(message_id="<邮件ID>", receive_id="oc_xxx")
```

### 场景 2：分享整个邮件会话

```
lark_mail_share_to_chat(thread_id="<会话ID>", receive_id="oc_xxx")
```

### 场景 3：通过邮箱分享给个人

```
lark_mail_share_to_chat(message_id="<邮件ID>", receive_id="alice@example.com", receive_id_type="email")
```

## 常见错误

| 症状 | 原因 | 解决 |
|------|------|------|
| `either --message-id or --thread-id is required` | 两个参数都未传 | 传入其中一个 |
| `--message-id and --thread-id are mutually exclusive` | 两个参数同时传 | 只传一个 |
| 403 `user not in chat` | 用户不在目标会话中 | 确认用户是群成员 |
| 404 `message not found` | 邮件 ID 无效 | 确认邮件 ID 正确 |
| 403 `permission not granted` | 缺少 `im:message` 或 `im:message.send_as_user` scope | 需要重新授权相应 scope |

## 相关工具

- `lark_im_chat_search` — 搜索群聊获取 chat_id
- `lark_mail_message` — 查看邮件内容
- `lark_mail_thread` — 查看邮件会话

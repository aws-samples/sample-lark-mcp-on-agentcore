# minutes +apply-permission

向妙记所有者发起查看或编辑权限申请。**写操作**，只在用户明确要求申请权限时才调用；调用后不代表立即获得权限，只是提交了一条申请。

对应工具 `lark_minutes_apply_permission`（底层调用 `POST /open-apis/minutes/v1/minutes/{minute_token}/permissions/apply`）。

## 命令

```
# 申请查看权限
lark_minutes_apply_permission(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", perm="view")

# 申请编辑权限
lark_minutes_apply_permission(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", perm="edit")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `minute_token` | 是 | 妙记 Token |
| `perm` | 是 | 申请的权限：`view`（查看）或 `edit`（编辑） |

## 权限语义

- MCP server 始终以当前登录用户身份申请。所有者在飞书客户端收到申请通知，同意后**该用户**获得对应权限。
- ⚠️ 以应用（bot）身份申请代表"这个应用"而不是某个用户，这条路径不可通过 MCP server 执行（MCP server 始终使用 user identity）。
- 两种身份的申请互不代表：用户身份申请通过后应用仍然无权限，反之亦然。

## 核心约束

### 1. missing scope 与资源 ACL 是两类不同问题

- **missing scope**（当前身份完全没有 `minutes:permission:apply` / `minutes:minutes.basic:read` 等 scope）：这不是"没有这条妙记的权限"，`lark_minutes_apply_permission` 解决不了。需要管理员为 MCP server 补齐对应 OAuth scope，Agent 侧无法自助补权限。
- **资源 ACL**（scope 都有，但对**这一条具体妙记**没有查看/编辑权限）：这才是本工具要解决的场景。

先看错误的 `error.subtype` 是 `missing_scope` 还是资源级别的权限拒绝，再决定要不要调用本工具。

### 2. 只有用户明确要求才发起申请

遇到无权限错误时，先把"当前身份对这条妙记没有权限"的事实告知用户；只有用户明确说"帮我申请查看/编辑权限"时才调用本工具。不要在检测到无权限后自动发起申请。

### 3. 不要试图绕过资源权限

MCP server 的身份固定为当前登录用户，不存在"换个身份重新读一次"这条路。对某条妙记没有权限时只有两个选择：请所有者授权，或在用户明确要求后调用本工具申请。

## 所需权限

| 身份 | 所需权限 |
|------|---------|
| 用户身份 | `minutes:permission:apply` |

## 输出结果

```json
{
  "minute_token": "obcnxxxxxxxxxxxxxxxxxxxx",
  "perm": "view"
}
```

| 字段 | 说明 |
|------|------|
| `minute_token` | 妙记 Token |
| `perm` | 申请的权限（`view` / `edit`） |

## 如何获取 minute_token

| 来源 | 获取方式 |
|------|---------|
| 妙记 URL | 从 URL 末尾提取，如 `https://sample.feishu.cn/minutes/obcnxxxxxxxxxxxxxxxxxxxx` |
| 妙记搜索 | `lark_minutes_search(query="关键词")` |
| 会议产物查询 | `lark_vc_recording(meeting_ids="<id>")`，拿到 `minute_token` |

## 常见错误与排查

| 错误现象 | 根本原因 | 解决方案 |
|---------|---------|---------|
| `perm` 不是 `view`/`edit` | 参数值不合法 | 只能传 `view` 或 `edit` |
| `missing required scope(s)` | 当前身份缺少 `minutes:permission:apply` | 见上方「missing scope 与资源 ACL」 |
| 申请后仍无权限 | 所有者尚未同意 | 这是异步申请，需等待所有者处理；不代表调用失败 |

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/create-and-edit-minutes")` — 生成和修改妙记

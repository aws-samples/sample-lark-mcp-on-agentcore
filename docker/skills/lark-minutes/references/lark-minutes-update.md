# minutes +update

修改飞书妙记的标题（topic）。

## 典型触发表达

- "把这个妙记的标题改成 xxx"
- "重命名这条妙记"
- "修改妙记标题"

## 用法

```
lark_minutes_update(minute_token="xxx", topic="周会纪要 2026-05-18")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `minute_token` | 是 | 妙记的唯一标识，可从妙记 URL 末尾路径提取 |
| `topic` | 是 | 新的妙记标题 |

## 认证与权限

- 所需 scope：`minutes:minutes:update`。
- （authentication is handled automatically by the MCP server）

## 输出结果

| 字段 | 说明 |
|------|------|
| `minute_token` | 被修改的妙记 Token，与输入的 `minute_token` 一致，可继续用于查询妙记信息、下载媒体或获取纪要产物 |
| `topic` | 修改后的妙记标题，与输入的 `topic` 一致 |

## 参考

- `lark_get_skill(domain="minutes")` -- 妙记相关功能说明

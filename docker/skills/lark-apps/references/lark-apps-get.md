# apps get

按 app_id 查询单个应用详情。

## 何时用

需要查看一个应用的类型、名称、描述、发布状态等详情时使用。如果只是按应用名模糊搜索定位 app_id，用 `lark_apps_list(keyword=...)`。

## 命令骨架

- 必填：`app_id`。
- 返回应用的完整信息：`app_id`、`app_type`、`name`、`description`、`icon_url`、`created_at`、`updated_at`、`is_published`。

## 示例

```
lark_apps_get(app_id="app_xxx")
```

## 输出契约

- 成功读取 `data.app` 对象，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `app_id` | string | 应用唯一标识 |
| `app_type` | string | 应用类型（如 HTML、FULL_STACK、MODERN_HTML） |
| `name` | string | 应用显示名称 |
| `description` | string | 应用功能说明 |
| `icon_url` | string | 应用图标 URL |
| `created_at` | string | 创建时间（ISO 8601 UTC） |
| `updated_at` | string | 最后更新时间（ISO 8601 UTC） |
| `is_published` | boolean | 是否已发布 |

- pretty 输出展示核心字段：`app_id`、`app_type`、`name`、`is_published`、`updated_at`。
- `is_published=true` 只代表应用历史上有发布版本，不代表最新代码已部署。

## Agent 规则

- 用户已有 `app_id` 想查看详情时用 `lark_apps_get`；只有应用名时用 `lark_apps_list(keyword=...)`。
- 不要把 `cli_` 开头的飞书应用 ID 传给 `lark_apps_get`，只接受 `app_` 开头的应用 ID。

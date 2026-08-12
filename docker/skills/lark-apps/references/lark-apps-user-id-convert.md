# lark_apps_user_id_convert

把一批已知 ID 在**妙搭 user_id** 与**飞书开放平台 ID**（open_id / union_id / 飞书 user_id）之间互转。参数与枚举的运行时事实以 `lark_discover(query="lark_apps_user_id_convert")` 为准。

## 何时用

Agent 常通过 `contact` / `im` 域拿到飞书 `open_id`，但下游（妙搭插件、审批、网关）消费的是妙搭 `user_id` 或飞书 `user_id`。这个工具补上中间那一步转换。典型场景：

- feishu-approval 插件要发起审批，`createApprovalInstance` 需要飞书 `user_id`，而手里只有妙搭 `user_id` → 用 `miaoda-to-feishu-user-id`。
- 插件配置表单 / 人员选择器返回 `open_id`，但最终要落库妙搭 `user_id` → 用 `open-id-to-miaoda`。

它只做一件事——转换。**没有**本地映射表、缓存、权限预判，也不猜方向。它不替代权限校验：能不能拿到目标 ID 仍由上游 scope 和文档/审批自身的可见范围决定，本工具只转换一个已知 ID 的格式。

## 调用骨架

- 必填 `convert_type`：转换方向枚举，缺失或非法直接报可读的校验错误，不猜默认方向。
- 必填 `ids`：逗号分隔的 ID 串。每次 1–100 个（服务端上限 100；空批会被拒以免空跑）。**不去重**，按输入顺序返回。
- 只读工具，无写副作用，不需要 `_confirm`。
- 需要 scope `spark:directory.user.id_convert:read`。限流 50 req/s，不自动重试。

### `convert_type` 方向表

| `convert_type` | 含义 | 目标形态 |
| --- | --- | --- |
| `miaoda-to-open-id` | 妙搭 user_id → 飞书 Open ID | `ou_…` |
| `miaoda-to-union-id` | 妙搭 user_id → 飞书 Union ID | `on_…` |
| `open-id-to-miaoda` | 飞书 Open ID → 妙搭 user_id | 数字串 |
| `union-id-to-miaoda` | 飞书 Union ID → 妙搭 user_id | 数字串 |
| `miaoda-to-feishu-user-id` | 妙搭 user_id → 飞书 user_id | 数字（employee_id） |

## 示例

```
# 批量把 open_id 转妙搭 user_id
lark_apps_user_id_convert(convert_type="open-id-to-miaoda", ids="ou_abc123,ou_def456")

# 妙搭 user_id 转飞书 user_id（发起审批前补这一步）
lark_apps_user_id_convert(convert_type="miaoda-to-feishu-user-id", ids="1234567890123456")
```

## 输出契约

标准 apps 响应信封，用 `ok == true` 判成功（不是 `code == 0`）。响应字段保持服务端 `snake_case`。

- `data.convert_type`：回显所传的 `convert_type`。
- `data.items[]`：`{index, source_id, target_id}`，`index` 是该 ID 在 `ids` 中的 0 基位置。
- `data.missed[]`：服务端静默丢弃的未解析 ID，由输入位置 diff 重建，`{index, source_id, reason: "not_found"}`。
- `meta`：`{total, hit_count, missed_count}`，`total` = `ids` 输入数（含重复，不去重），且 `hit_count + missed_count = total`。

**部分命中**：批量里只要有 ID 转不出，它不是错误——服务端省略该项，落到 `missed`（`reason: not_found`），并保留 `index` = 输入位置，重复 ID 也能按位置回填。

## Agent 规则

- **方向不匹配不是错误**：比如在 `miaoda-to-open-id` 下传了 `ou_` 开头的 ID，服务端省略它 → 落到 `missed`。看到 `missed` 时先检查 ID 前缀是否与 `convert_type` 方向一致。
- **整批被拒**（服务端 `code != 0`）才是 `api` 错误，带透传 code 和 `log_id`，不重试；限流同理，降低调用频率。
- 结果只在响应里返回一次，不落盘、不写会话上下文。

## 边界

只转换 ID 格式，不判断调用方是否有权拿到目标 ID。是否有权限由上游 scope 与资源自身可见范围决定，本工具不做预检。

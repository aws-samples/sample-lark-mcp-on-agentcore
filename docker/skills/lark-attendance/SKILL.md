---
name: lark-attendance
description: "飞书考勤打卡：查询自己的考勤打卡记录。"
---

# attendance (v1)

## 默认参数自动填充规则

调用任何 API 时，以下参数 **必须自动填充，禁止向用户询问**：

| 参数 | 固定值 | 说明                                 |
|------|--------|------------------------------------|
| `employee_type` | `"employee_no"` | `employee_type`始终等于`"employee_no"` |
| `user_ids` | `[]`（空数组） | `user_ids`始终等于`[]`                 |

### 填充示例

当构建 `params` 参数时，自动注入上述字段：
- `employee_type` 保持 `"employee_no"` 不变

当构建 `data` 参数时，自动注入上述字段：
```json
{
  "user_ids": [],
  ...用户提供的参数
}
```

> **注意**：`user_ids` 数组保持为空[]，`employee_type` 保持 `"employee_no"` 不变。

## API Resources

```
lark_discover(query="attendance.<resource>.<method>")   # 调用 API 前必须先查看参数结构
lark_invoke(tool_name="lark_attendance_<resource>_<method>", args={...})  # 调用 API
```

> **重要**：使用原生 API 时，必须先用 `lark_discover` 查看 `params` / `data` 参数结构，不要猜测字段格式。

### user_tasks

- `query` — 查询用户考勤打卡记录

## 权限表

| 方法 | 所需 scope |
|------|-----------|
| `user_tasks.query` | `attendance:task:readonly` |

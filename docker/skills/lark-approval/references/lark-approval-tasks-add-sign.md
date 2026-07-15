# approval tasks add_sign

给一个审批任务加签（用户级写操作）。通常先通过 `tasks query` 拿到 `task_id` 和 `instance_code`，确认目标任务后，再提供被加签人的用户 ID、加签方式等参数执行加签。

> [!CAUTION]
> 这是**高风险写操作**。真正执行时需要传 `_confirm=true`；只有用户已明确要对该审批任务加签且目标任务、加签对象、加签方式都无误时才执行。不要在未获用户明确同意时静默追加 `_confirm=true`。

需要的 scopes: ["approval:task:write"]

## 调用

```
# 前加签（需要 approval_method）
lark_invoke(tool_name="lark_approval_tasks_add_sign", args={data: {"instance_code":"<INSTANCE_CODE>","task_id":"<TASK_ID>","add_sign_type":1,"add_sign_user_ids":["ou_xxx"],"approval_method":1,"comment":"请先补充审核"}, params: {"user_id_type":"open_id"}, _confirm: true})

# 后加签（需要 approval_method）
lark_invoke(tool_name="lark_approval_tasks_add_sign", args={data: {"instance_code":"<INSTANCE_CODE>","task_id":"<TASK_ID>","add_sign_type":2,"add_sign_user_ids":["ou_xxx","ou_yyy"],"approval_method":2,"comment":"当前审批完成后请两位继续审核"}, params: {"user_id_type":"open_id"}, _confirm: true})

# 并加签（常见场景可不传 approval_method）
lark_invoke(tool_name="lark_approval_tasks_add_sign", args={data: {"instance_code":"<INSTANCE_CODE>","task_id":"<TASK_ID>","add_sign_type":3,"add_sign_user_ids":["123456789"],"comment":"并加签给项目 owner"}, params: {"user_id_type":"user_id"}, _confirm: true})
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `data` | 是 | 请求体，JSON 对象 |
| `instance_code` | 是 | 审批实例 Code；通常先通过 `tasks query` 或 `instances initiated` / `instances get` 获取 |
| `task_id` | 是 | 审批任务 ID；通常先通过 `tasks query` 获取 |
| `add_sign_type` | 是 | 加签类型：`1` 前加签、`2` 后加签、`3` 并加签 |
| `add_sign_user_ids` | 是 | 被加签人 ID 数组；需要和 `user_id_type` 保持一致 |
| `approval_method` | 否 | 审批方式：`1` 或签、`2` 会签、`3` 依次审批；**仅在前加签、后加签时需要填写** |
| `comment` | 否 | 审批意见或加签说明，例如 `前加签给财务复核`、`请项目 owner 一并确认` |
| `params` | 否 | 查询参数，JSON 对象；用于声明 `add_sign_user_ids` 内用户 ID 的类型 |
| `user_id_type` | 否 | 用户 ID 类型：`user_id`、`union_id`、`open_id`；未显式指定时要特别确认被加签人的 ID 类型 |
| `_confirm` | 是 | 确认执行高风险写操作；未带时会返回 `user_approval_required` |
| `format` | 否 | 输出格式：`json`（默认）、`ndjson`、`table`、`csv` |

## 枚举说明

### add_sign_type

| 值 | 含义 |
|----|------|
| `1` | 前加签 |
| `2` | 后加签 |
| `3` | 并加签 |

### approval_method

| 值 | 含义 | 适用场景 |
|----|------|----------|
| `1` | 或签 | 前加签 / 后加签 |
| `2` | 会签 | 前加签 / 后加签 |
| `3` | 依次审批 | 前加签 / 后加签 |

## 典型前置步骤

先查到待办任务：

```
lark_invoke(tool_name="lark_approval_tasks_query", args={params: {"topic":"1"}})
```

常用到的字段：

| 字段 | 说明 |
|------|------|
| `tasks[].instance_code` | 审批实例 Code；执行 approve / reject / transfer / rollback / add_sign 等操作时通常都需要 |
| `tasks[].task_id` | 审批任务 ID；与 `instance_code` 配对使用 |
| `tasks[].support_api_operate` | 是否支持通过 API 处理该任务；加签前建议先检查 |

如果你手里只有姓名或邮箱，建议先用 `lark_get_skill(domain="contact")` 解析出正确的用户 ID，再执行加签。

如需先确认表单、节点、审批流进度，可继续查看实例详情：

```
lark_invoke(tool_name="lark_approval_instances_get", args={params: {"instance_code":"<INSTANCE_CODE>"}})
```

## 使用建议

- **`instance_code` 和 `task_id` 要成对使用**：仅有实例 ID 或仅有任务 ID 都不足以准确执行加签操作。
- **`add_sign_user_ids` 与 `user_id_type` 必须匹配**：例如传 open_id 就把 `user_id_type` 设为 `open_id`；不要混用。
- **优先显式传 `user_id_type`**：这样 agent 更容易判断参数含义，也能减少 ID 类型不匹配带来的失败。
- **`add_sign_type` 要和业务意图一致**：前加签是在当前审批前插入审批人，后加签是在当前审批后追加审批人，并加签则是增加并行审批人。
- **前加签 / 后加签要补 `approval_method`**：不要遗漏，否则请求可能无法准确表达审批方式。
- **优先从 `tasks query` 的待办列表拿任务参数**：尤其是 `topic=1` 的待办审批，最适合作为 add_sign 的输入来源。
- **先检查是否支持 API 操作**：如果 `tasks[].support_api_operate` 为 `false`，说明该任务可能不支持通过 API 执行处理动作，加签前应谨慎验证。
- **`comment` 建议写明加签原因**：例如 `增加财务复核`、`增加项目 owner 并行确认`，方便相关人员理解上下文。
- **执行前先向用户确认**：尤其在多人加签、跨部门加签或加签对象来源不明确时，先让用户核对再执行。

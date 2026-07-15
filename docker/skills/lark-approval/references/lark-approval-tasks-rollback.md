# approval tasks rollback

将一个审批任务退回到指定节点（用户级写操作）。通常先通过 `tasks query` 拿到 `task_id` 和 `instance_code`，再结合实例详情确认可退回的目标节点 `node_ids`，最后执行退回。

> [!CAUTION]
> 这是**高风险写操作**。真正执行时需要传 `_confirm=true`；只有用户已明确要退回该审批且目标任务、退回节点都无误时才执行。不要在未获用户明确同意时静默追加 `_confirm=true`。

需要的 scopes: ["approval:task:write"]

## 调用

```
# 退回到单个节点
lark_invoke(tool_name="lark_approval_tasks_rollback", args={data: {"instance_code":"<INSTANCE_CODE>","task_id":"<TASK_ID>","node_ids":["<NODE_ID>"],"comment":"请补充附件后重新提交"}, _confirm: true})

# 传多个候选节点 ID（以实际审批定义支持情况为准）
lark_invoke(tool_name="lark_approval_tasks_rollback", args={data: {"instance_code":"<INSTANCE_CODE>","task_id":"<TASK_ID>","node_ids":["<NODE_ID_1>","<NODE_ID_2>"],"comment":"退回上一处理节点"}, _confirm: true})
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `data` | 是 | 请求体，JSON 对象 |
| `instance_code` | 是 | 审批实例 Code；通常先通过 `tasks query` 或 `instances initiated` / `instances get` 获取 |
| `task_id` | 是 | 审批任务 ID；通常先通过 `tasks query` 获取 |
| `node_ids` | 是 | 退回目标节点 ID 数组；执行前应先确认这些节点确实可作为退回目标 |
| `comment` | 否 | 审批意见或退回说明，例如 `请补充附件后重新提交`、`预算说明不完整，请补充` |
| `_confirm` | 是 | 确认执行高风险写操作；未带时会返回 `user_approval_required` |
| `format` | 否 | 输出格式：`json`（默认）、`ndjson`、`table`、`csv` |

## 典型前置步骤

先查到待办任务：

```
lark_invoke(tool_name="lark_approval_tasks_query", args={params: {"topic":"1"}})
```

常用到的字段：

| 字段 | 说明 |
|------|------|
| `tasks[].instance_code` | 审批实例 Code；执行 approve / reject / transfer / rollback 等操作时通常都需要 |
| `tasks[].task_id` | 审批任务 ID；与 `instance_code` 配对使用 |
| `tasks[].support_api_operate` | 是否支持通过 API 处理该任务；退回前建议先检查 |

如需确认流程节点、当前进度和可退回位置，可先查看实例详情：

```
lark_invoke(tool_name="lark_approval_instances_get", args={params: {"instance_code":"<INSTANCE_CODE>"}})
```

## 使用建议

- **`instance_code` 和 `task_id` 要成对使用**：仅有实例 ID 或仅有任务 ID 都不足以准确执行退回操作。
- **`node_ids` 是必填项**：退回并不是“自动退回上一步”，而是要明确给出目标节点 ID 数组。
- **先确认节点是否可退回**：不同审批定义支持的退回目标可能不同；在不确定时，先通过 `instances get` 或业务侧流程信息核实。
- **优先从 `tasks query` 的待办列表拿任务参数**：尤其是 `topic=1` 的待办审批，最适合作为 rollback 的输入来源。
- **先检查是否支持 API 操作**：如果 `tasks[].support_api_operate` 为 `false`，说明该任务可能不支持通过 API 执行处理动作，退回前应谨慎验证。
- **`comment` 建议写清退回原因**：例如 `附件缺失，请补齐后重新提交`、`费用说明不完整，请补充明细`，方便发起人或上一步处理人理解原因。
- **执行前先向用户确认**：尤其在节点来源不明确、审批链路复杂或批量处理时，先让用户核对再执行。

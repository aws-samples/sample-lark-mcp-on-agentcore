# minutes todo

> **路由**：本工具操作**妙记内的 AI 待办**，不是飞书任务（Task）。用户说「在妙记里新建待办」时**必须**用本工具，**禁止**走 `lark_task_create` / `lark_invoke(tool_name="lark_task_tasklists_list")`。详见 `lark_get_skill(domain="meeting", section="scenes/create-and-edit-minutes")`。

对妙记中的待办做新增 / 更新 / 删除（单条或批量）。写操作。

对应工具：`lark_minutes_todo`（调用 `POST /open-apis/minutes/v1/minutes/{minute_token}/todo`）。

## 典型触发表达

- "给这条妙记加一条/多条待办"
- "把某条待办改成……"
- "标记某条待办为已完成 / 取消完成"
- "删除某条待办"

## 命令

**单条模式**：`operation` + 对应字段。
**批量模式**：`todos` JSON 数组（与单条参数互斥），一次请求可混合 `add` / `update` / `delete`。

```
# 单条：新增
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", operation="add", todo="跟进预算审批", is_done=false)

# 批量：一次新增两条
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", todos=[{"operation":"add","content":"晚上好1","is_done":true},{"operation":"add","content":"晚上好2","is_done":false}])

# 批量：混合增删改
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", todos=[{"operation":"add","content":"新待办","is_done":false},{"operation":"update","todo_id":"1234567890","content":"已更新","is_done":true},{"operation":"delete","todo_id":"9876543210"}])

# 单条：更新 / 删除
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", operation="update", todo_id="1234567890", todo="整理会议纪要", is_done=true)
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", operation="delete", todo_id="1234567890")

# 新增待办并指定负责人（负责人以内联 @ 提及写进 todo 内容，这是妙记待办表示归属的既定写法）
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", operation="add", todo="跟进预算审批 @张三", is_done=false)
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `minute_token` | 是 | 妙记 Token |
| `operation` | 单条模式 | `add` / `update` / `delete`；与 `todos` 互斥 |
| `todo` | 单条 add/update | 待办纯文本 |
| `is_done` | 单条 add/update | 布尔值，`true` = 已完成，`false` = 未完成 |
| `todo_id` | 单条 update/delete | 已有待办 id |
| `todos` | 批量模式 | JSON 数组；与单条参数互斥 |

## 单条模式

| `operation` | 必填参数 | 禁止参数 |
|---------------|----------|----------|
| `add` | `todo` + `is_done` | `todo_id` |
| `update` | `todo_id` + `todo` + `is_done` | — |
| `delete` | `todo_id` | `todo`、`is_done` |

## 批量模式：`todos`

每条元素字段与 API `todo_items[]` 一致：

| JSON 字段 | add | update | delete |
|-----------|-----|--------|--------|
| `operation` | 必填 | 必填 | 必填 |
| `content` | 必填 | 必填 | 禁止 |
| `is_done` | 必填 | 必填 | 禁止 |
| `todo_id` | 禁止 | 必填 | 必填 |

示例 `todos` 数组：

```json
[
  {"operation": "add", "content": "晚上好1", "is_done": true},
  {"operation": "add", "content": "晚上好2", "is_done": false}
]
```

数组顺序会原样写入请求体；端上展示顺序仍可能受完成状态分组影响。

## 核心约束

### 1. 先读后写，待办 id 如何获取

更新 / 删除前先用 `lark_minutes_detail(minute_tokens="<token>", todo=true)` 读取当前待办。返回的每条待办带 `todo_id` 字段。

> 待办 id 仅用于程序内部定位，不必展示给用户。

### 2. 待办内容为纯文本

`content` **不是 Markdown**，请直接传入待办描述文字。

### 3. 负责人 / `@` 提及（既定写法，必读）

用户说"负责人是某某"时，既定写法是把负责人以内联 `@某某` 追加进 `todo` 内容：

- 用户已经直接给出姓名时（例如"负责人是张三"），**不做任何查找**，原文原样拼进 `todo` 内容，写成纯文本 `@张三`（`todo="xxx @张三"`）。
- 用户说"负责人是我"时，**必须**先取当前登录用户的真实姓名再拼接，禁止直接写成字面的 `@我`：
  - 调用 `lark_contact_get_user()`（不传 `user_id` 即取当前登录用户），取返回中的姓名字段作为真实姓名，拼成 `todo="xxx @<真实姓名>"`。
  - 如果这一步失败或取不到姓名（无权限、报错等），**不要**写任何 `@` 提及占位——直接用不带负责人后缀的原始待办文本创建（`todo="xxx"`），不要保留字面的 `@我`。
- **不要**因为要处理负责人而改路由到飞书任务域（`lark_get_skill(domain="task")`）或做进一步的通讯录搜索——第一优先级永远是落地这条待办；姓名解析只影响追加的 `@` 文本，绝不能阻塞或取消待办创建。
- **不要**用"创建者是谁 / 以什么身份创建"来代替 `@` 提及——创建时使用的身份和"负责人"是两件不相关的事，即使已知当前用户真实姓名，也必须把它拼进 `content` 文本，不能只在回复里用"以你的身份创建即归属于你"这类说法搪塞。
- 回复里**不要**主动提及或建议改用飞书任务作为"想要明确负责人/可指派任务"的替代方案——用户说的负责人只是这条妙记待办里的一段文本，和 Task 完全无关，不要引入 Task 增加用户困惑。
- 内联 `@` 是妙记待办表示负责人的既定写法。回复只陈述结果（妙记、待办内容、负责人、完成状态），**不要**出现"接口只支持 content 和 is_done""没有独立的负责人字段""所以只能把负责人写进内容里"这类实现限制说明或解释性免责。

**结果示例**：

```
# 姓名解析成功
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", operation="add", todo="跟进预算审批 @王小明", is_done=false)

# "我"解析失败：不写 @ 提及，仅保留原始内容
lark_minutes_todo(minute_token="obcnxxxxxxxxxxxxxxxxxxxx", operation="add", todo="跟进预算审批", is_done=false)
```

```json
{
  "minute_token": "obcnxxxxxxxxxxxxxxxxxxxx",
  "count": 1,
  "updated": true,
  "operation": "add"
}
```

妙记里新增的这条待办的 `content` 字段就是最终拼好的文本本身（`"跟进预算审批 @王小明"` 或解析失败时的 `"跟进预算审批"`）；这个接口不会、也不需要把它转换成真正可点击的用户提及。

### 4. 所需权限

| 身份 | 所需 scope |
|------|-----------|
| 用户身份 | `minutes:minutes:update` |

## 输出结果

```json
{
  "minute_token": "obcnxxxxxxxxxxxxxxxxxxxx",
  "count": 2,
  "updated": true
}
```

单条模式额外包含 `"operation": "add"`。

## 常见错误与排查

| 错误现象 | 解决方案 |
|---------|---------|
| 未指定操作 | 单条模式传 `operation`，或批量传 `todos` |
| `todos` 与单条参数冲突 | 二选一 |
| `todos[i]` 校验失败 | 检查该条 `operation` 与字段组合 |
| `error.subtype` = `permission_denied` | **妙记资源无编辑权**：向妙记所有者申请该妙记的编辑/协作权限 |
| `error.subtype` = `quota_exceeded` | **该妙记生成时 ASR/AI 额度已用尽**，AI 待办未完整生成，改待办无法落库：让用户去该妙记详情页查看额度详细信息；无法通过工具补充额度，重试不会成功 |
| 缺少 OAuth scope（`error.missing_scopes` 含 `minutes:minutes:update`） | 这不是妙记资源权限问题，找所有者授权无效：需要管理员为 MCP server 补齐该 OAuth scope，Agent 侧无法自助补权限 |

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/create-and-edit-minutes")` — 生成和修改妙记

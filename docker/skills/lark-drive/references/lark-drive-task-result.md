
# drive +task_result

查询异步任务结果。该 shortcut 聚合了导入、导出、移动/删除文件夹、Wiki 节点 / 文档迁入 Wiki 等多种异步任务的结果查询，统一接口方便调用。

## 命令

```
# 查询导入任务结果
lark_drive_task_result(scenario="import", ticket="<IMPORT_TICKET>")

# 查询导出任务结果
lark_drive_task_result(scenario="export", ticket="<EXPORT_TICKET>", file_token="<SOURCE_DOC_TOKEN>")

# 查询移动/删除文件夹任务状态
lark_drive_task_result(scenario="task_check", task_id="<TASK_ID>")

# 查询 Wiki 移动任务结果（wiki +move 异步超时后的续跑）
lark_drive_task_result(scenario="wiki_move", task_id="<TASK_ID>")

# 查询 Wiki 删除知识空间任务结果（wiki +delete-space 异步超时后的续跑）
lark_drive_task_result(scenario="wiki_delete_space", task_id="<TASK_ID>")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `scenario` | 是 | 任务场景，可选值：`import` (导入任务)、`export` (导出任务)、`task_check` (移动/删除文件夹任务)、`wiki_move` (Wiki 移动任务)、`wiki_delete_space` (Wiki 删除知识空间任务) |
| `ticket` | 条件必填 | 异步任务 ticket，**import/export 场景必填** |
| `task_id` | 条件必填 | 异步任务 ID，**task_check / wiki_move / wiki_delete_space 场景必填** |
| `file_token` | 条件必填 | 导出任务对应的源文档 token，**export 场景必填** |

## 场景说明

| 场景 | 说明 | 所需参数 |
|------|------|----------|
| `import` | 文档导入任务（如将本地文件导入为云文档） | `ticket` |
| `export` | 文档导出任务（如云文档导出为 PDF/Word） | `ticket`、`file_token` |
| `task_check` | 文件夹移动/删除任务 | `task_id` |
| `wiki_move` | Wiki 移动任务（`lark_wiki_move` 的 docs-to-wiki 异步流程，超时后续跑用） | `task_id` |
| `wiki_delete_space` | Wiki 删除知识空间任务（`lark_wiki_delete_space` 的异步流程，超时后续跑用） | `task_id` |

## 返回结果

### Import 场景返回

```json
{
  "scenario": "import",
  "ticket": "<IMPORT_TICKET>",
  "type": "sheet",
  "ready": true,
  "failed": false,
  "job_status": 0,
  "job_status_label": "success",
  "job_error_msg": "success",
  "token": "<IMPORTED_DOC_TOKEN>",
  "url": "https://example.feishu.cn/sheets/<IMPORTED_DOC_TOKEN>",
  "extra": ["2000"]
}
```

**字段说明：**
- `ready`: 是否已经导入完成，可直接使用 `token` / `url`
- `failed`: 是否已经失败
- `job_status`: 服务端返回的原始状态码
- `job_status_label`: 便于阅读的状态标签，例如 `success` / `processing`
- `token`: 导入后的文档 token
- `url`: 导入后的文档链接

### Export 场景返回

```json
{
  "scenario": "export",
  "ticket": "<EXPORT_TICKET>",
  "ready": true,
  "failed": false,
  "file_extension": "pdf",
  "type": "doc",
  "file_name": "docName",
  "file_token": "<EXPORTED_FILE_TOKEN>",
  "file_size": 34356,
  "job_error_msg": "success",
  "job_status": 0,
  "job_status_label": "success"
}
```

**字段说明：**
- `ready`: 是否已经完成导出，可直接使用 `file_token`
- `failed`: 是否已经失败
- `job_status`: 服务端返回的原始状态码
- `job_status_label`: 便于阅读的状态标签，例如 `success` / `processing`
- `file_token`: 导出文件的 token，用于下载
- `file_extension`: 导出文件扩展名
- `file_size`: 导出文件大小（字节）

### Task_check 场景返回

```json
{
  "scenario": "task_check",
  "task_id": "<TASK_ID>",
  "status": "success",
  "ready": true,
  "failed": false
}
```

**字段说明：**
- `status`: 任务状态，`success`=成功，`failed`=失败，`pending`=处理中
- `ready`: 是否已经完成
- `failed`: 是否已经失败

### Wiki_move 场景返回

```json
{
  "scenario": "wiki_move",
  "task_id": "<TASK_ID>",
  "ready": true,
  "failed": false,
  "status": 0,
  "status_msg": "success",
  "wiki_token": "wikcnXXX",
  "node_token": "wikcnXXX",
  "space_id": "<TARGET_SPACE_ID>",
  "obj_token": "<OBJ_TOKEN>",
  "obj_type": "docx",
  "parent_node_token": "",
  "node_type": "origin",
  "origin_node_token": "",
  "title": "项目计划",
  "has_child": false,
  "node": {
    "space_id": "<TARGET_SPACE_ID>",
    "node_token": "wikcnXXX",
    "obj_token": "<OBJ_TOKEN>",
    "obj_type": "docx",
    "parent_node_token": "",
    "node_type": "origin",
    "origin_node_token": "",
    "title": "项目计划",
    "has_child": false
  },
  "move_results": [
    {
      "status": 0,
      "status_msg": "success",
      "node": { "...": "同上" }
    }
  ]
}
```

**字段说明：**
- `ready`: 所有 `move_results[].status` 都为 `0` 时为 `true`
- `failed`: 任一 `move_results[].status` 小于 `0` 时为 `true`
- `status` / `status_msg`: 第一个 move_result 的状态码 / 标签（无结果时回退为 `1` / `processing`）
- `wiki_token` / `node_token`: 移入 Wiki 后的目标节点 token（首个结果有 `node.node_token` 时镜像到顶层，便于下游脚本使用）
- `space_id`、`obj_token`、`obj_type`、`title` 等：从首个 `move_results[0].node` 平铺到顶层，方便直接引用
- `move_results`: 保留完整列表（适用于一次任务移动多个文档的场景）

### Wiki_delete_space 场景返回

```json
{
  "scenario": "wiki_delete_space",
  "task_id": "<TASK_ID>",
  "ready": true,
  "failed": false,
  "status": "success",
  "status_msg": "success"
}
```

**字段说明：**
- `ready`: `status=success` 时为 `true`
- `failed`: `status=failure` 或 `failed` 时为 `true`；未知非成功状态（如 `processing`）视为进行中
- `status`: 服务端返回的原始 `delete_space_result.status`
- `status_msg`: 优先使用 `delete_space_result.status_msg`，否则回落到 `status`，再回落到 `processing`

## 使用场景

### 配合 lark_drive_import 使用

```
# 1. 创建导入任务
lark_drive_import(file="./data.xlsx", type="sheet")
# 若任务很快完成：直接返回 token / url
# 若内置轮询超时：返回 ready=false、ticket 和 next_command

# 2. 轮询导入结果
lark_drive_task_result(scenario="import", ticket="<IMPORT_TICKET>")
```

### 配合 lark_drive_move 使用

```
# 1. 移动文件夹（异步操作）
lark_drive_move(file_token="<FOLDER_TOKEN>", type="folder", folder_token="<TARGET_FOLDER_TOKEN>")
# 若轮询窗口内完成：直接返回 ready=true
# 若内置轮询结束仍未完成：返回 ready=false、task_id 和 next_command

# 2. 轮询移动结果
lark_drive_task_result(scenario="task_check", task_id="<TASK_ID>")
```

### 配合 lark_wiki_move 使用

```
# 1. 把 Drive 文档迁入 Wiki（异步任务可能返回 task_id）
lark_wiki_move(obj_type="docx", obj_token="<DOC_TOKEN>", target_space_id="<TARGET_SPACE_ID>")
# 若内置轮询窗口内完成：直接返回 ready=true 和 wiki_token
# 若轮询窗口结束仍未完成：返回 ready=false、task_id、timed_out=true 和 next_command

# 2. 续跑查询 Wiki 移动结果
lark_drive_task_result(scenario="wiki_move", task_id="<TASK_ID>")
```

### 配合 lark_wiki_delete_space 使用

```
# 1. 删除知识空间（高风险写操作，必须显式带 _confirm=true）
lark_wiki_delete_space(space_id="<SPACE_ID>", _confirm=true)
# 若同步返回：直接 ready=true
# 若轮询窗口结束仍未完成：返回 ready=false、task_id、timed_out=true 和 next_command

# 2. 续跑查询 Wiki 删除结果
lark_drive_task_result(scenario="wiki_delete_space", task_id="<TASK_ID>")
```

### 配合 lark_drive_export 使用

```
# 1. 发起导出
lark_drive_export(token="<SOURCE_DOC_TOKEN>", doc_type="docx", file_extension="pdf")
# 若轮询窗口内完成：直接下载本地文件
# 若内置轮询结束仍未完成：返回 ready=false、ticket 和 next_command

# 2. 继续查询导出结果
lark_drive_task_result(scenario="export", ticket="<EXPORT_TICKET>", file_token="<SOURCE_DOC_TOKEN>")

# 3. 拿到 file_token 后下载
lark_drive_export_download(file_token="<EXPORTED_FILE_TOKEN>")
```

## 权限要求

| 场景 | 所需 scope |
|------|-----------|
| import | `drive:drive.metadata:readonly` |
| export | `drive:drive.metadata:readonly` |
| task_check | `drive:drive.metadata:readonly` |
| wiki_move | `wiki:space:read` |
| wiki_delete_space | `wiki:space:read` |

## 参考

- [lark-drive](../SKILL.md) -- 云空间（云盘/云存储）全部命令

## `drive +preview`

列出或下载 Drive 文件可用的预览产物。这个 shortcut 不猜测默认类型：

- 只想看候选项时，用 `list_only=true`
- 想下载时，必须显式传 `type` 和 `output`
- 如果某个候选项还在生成中，会返回结构化错误并提示先重新 `list_only=true`

### 调用示例

```
# 列出可用预览候选项
lark_drive_preview(file_token="<FILE_TOKEN>", list_only=true)

# 下载 PDF 预览
lark_drive_preview(file_token="<FILE_TOKEN>", type="pdf", output="./artifacts/report")

# 下载文本预览，并在目标已存在时自动改名
lark_drive_preview(file_token="<FILE_TOKEN>", type="text", output="./artifacts/report", if_exists="rename")

# 指定版本号查询/下载
lark_drive_preview(file_token="<FILE_TOKEN>", version="12", type="html", output="./artifacts/report.html")
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `file_token` | 是 | Drive 文件 token |
| `type` | 条件必填 | 预览类型；优先使用 `list_only=true` 返回的 `type`，如 `pdf` / `html` / `text` / `png` / `jpg` / `source_file` |
| `version` | 否 | 文件版本号 |
| `list_only` | 否 | 仅返回候选项，不下载 |
| `output` | 条件必填 | 下载到本地的输出路径 |
| `if_exists` | 否 | 输出冲突策略：`error`（默认）/ `overwrite` / `rename` |

### 输出约定

- 查询态返回：
  - `mode=list`
  - `file_token`
  - `candidates[]`
  - `next_action`
- 下载态返回：
  - `mode=download`
  - `file_token`
  - `selected_type`
  - `output_path`
  - `status`

### 候选项字段

`candidates[]` 中每个对象包含：

- `type`
- `type_code`
- `label`
- `status`
- `status_code`
- `downloadable`
- `reason`（可选）

### 关键约束

- 不传 `list_only` 时，必须显式传 `type` 和 `output`
- 不会隐式选择"第一个候选项"作为默认下载目标
- 候选项状态来自后端 `preview_status` 枚举，例如 `READY` / `PROCESSING` / `FAILED` / `NO_SUPPORT`
- 本地文件名在未显式带扩展名时，会结合响应头自动补扩展名

### 参考

- `lark_get_skill(domain="drive")` — Drive 总入口

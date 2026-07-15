
# drive +export-download

根据导出任务产物的 `file_token` 下载本地文件。通常与 `lark_drive_task_result(scenario="export")` 配合使用。

## 命令

```
# 使用服务端返回的文件名下载到当前目录
lark_drive_export_download(file_token="<EXPORTED_FILE_TOKEN>")

# 下载到指定目录
lark_drive_export_download(file_token="<EXPORTED_FILE_TOKEN>", output_dir="./exports")

# 指定本地文件名
lark_drive_export_download(file_token="<EXPORTED_FILE_TOKEN>", file_name="weekly-report.pdf", output_dir="./exports")

# 允许覆盖
lark_drive_export_download(file_token="<EXPORTED_FILE_TOKEN>", overwrite=true)
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `file_token` | 是 | 导出完成后的产物 token |
| `file_name` | 否 | 覆盖默认文件名 |
| `output_dir` | 否 | 本地输出目录，默认当前目录 |
| `overwrite` | 否 | 覆盖已存在文件 |

## 使用顺序

1. 用 `lark_drive_export` 发起导出
2. 如果返回 `ticket` / `next_command`，用 `lark_drive_task_result(scenario="export", ticket="<ticket>", file_token="<source_token>")` 继续查
3. 查到 `file_token` 后，用 `lark_drive_export_download` 下载

## 参考

- [lark-drive](../SKILL.md) -- 云空间（云盘/云存储）全部命令

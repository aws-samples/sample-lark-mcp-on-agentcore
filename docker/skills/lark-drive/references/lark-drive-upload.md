
# drive +upload

上传本地文件到飞书云空间（云盘/云存储）。目标位置可以是 Drive 文件夹，也可以是 wiki 节点。

## 快速决策
- 用户要在 Drive 里上传、创建、读取、局部 patch 或覆盖更新**原生 `.md` 文件**（不是导入成 docx），切到 `lark_get_skill(domain="markdown")`。

## 命令

```
# 上传到 Drive 文件夹
lark_drive_upload(file="./report.pdf", folder_token="fldbc_xxx")

# 上传到 wiki 节点
lark_drive_upload(file="./report.pdf", wiki_token="wikcn_xxx")

# 不指定目标时，上传到调用者的 Drive 根目录
lark_drive_upload(file="./report.pdf")

# 自定义上传后的文件名
lark_drive_upload(file="./report.pdf", name="季度总结.pdf")

# 覆盖已存在文件（原地覆盖，保留 file_token）
lark_drive_upload(file="./report.pdf", file_token="boxcn_existing_file")
```

## 目标位置选择（关键）

- 上传到 Drive 文件夹：传 `folder_token="<folder_token>"`，shortcut 会发送 `parent_type=explorer`
- 上传到 wiki 节点：传 `wiki_token="<wiki_token>"`，shortcut 会发送 `parent_type=wiki`
- 上传到 Drive 根目录：`folder_token` 和 `wiki_token` 都不传
- 覆盖已有文件：额外传 `file_token="<existing_file_token>"`；shortcut 会把它原样透传到底层 `upload_all` / `upload_prepare`，让后端按覆盖语义写入
- 不要传空目标值：`folder_token=""` / `wiki_token=""` 会被视为参数错误；如需上传到 Drive 根目录，应直接省略这两个参数
- 不要传空 `file_token`：如需新建上传，直接省略该参数；显式传空字符串会报错
- `folder_token` 和 `wiki_token` 互斥，不要同时传
- `wiki_token` 传的是 **wiki node token**，不是 `space_id`

Shortcut 参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | 本地文件路径 |
| `file_token` | 否 | 已存在文件的 token；传入后按"覆盖已有文件"语义上传 |
| `folder_token` | 否 | 目标文件夹 token；与 `wiki_token` 互斥；省略时默认为 Drive 根目录；显式传空字符串会报错 |
| `wiki_token` | 否 | 目标 wiki 节点 token；与 `folder_token` 互斥；会映射为 `parent_type=wiki`、`parent_node=<wiki_token>`；显式传空字符串会报错 |
| `name` | 否 | 上传后的文件名；默认使用本地文件名 |

> [!CAUTION]
> 这是**写入操作** —— 执行前必须确认用户意图。

## 参考

- [lark-drive](../SKILL.md) -- 云空间（云盘/云存储）全部命令

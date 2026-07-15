
# drive +create-shortcut

在目标文件夹中为一个现有 Drive 文件创建快捷方式。

## 命令

```
# 为普通文件创建快捷方式
lark_drive_create_shortcut(folder_token="<TARGET_FOLDER_TOKEN>", file_token="<FILE_TOKEN>", type="file")

# 为新版文档创建快捷方式
lark_drive_create_shortcut(folder_token="<TARGET_FOLDER_TOKEN>", file_token="<DOCX_TOKEN>", type="docx")

# 为电子表格创建快捷方式
lark_drive_create_shortcut(folder_token="<TARGET_FOLDER_TOKEN>", file_token="<SHEET_TOKEN>", type="sheet")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `folder_token` | 是 | 目标父文件夹 token |
| `file_token` | 是 | 源文件 token，表示被引用的原始文件 |
| `type` | 是 | 源文件类型，推荐值：`file`、`docx`、`doc`、`sheet`、`bitable`、`mindnote`、`slides` |

## 输入规则

- 该 shortcut 的最小输入是 `folder_token` + `file_token` + `type`
- 工具层会把 `file_token` 和 `type` 组装为底层 API 所需的 `refer_entity`
- `file_token` 必须是 Drive 文件 token，不要直接传 wiki 节点 token
- 如果来源是 `/wiki/...` 链接，必须先按 `lark_get_skill(domain="drive")` 中的 wiki 解析流程拿到真实 `obj_token`，再创建快捷方式
- 目标位置必须是云空间（云盘/云存储）文件夹；这个 shortcut 不是"复制文件内容"，而是"在另一个文件夹里挂一个引用入口"

## 类型说明

| 类型 | 说明 |
|------|------|
| `file` | 普通文件 |
| `docx` | 新版云文档 |
| `doc` | 旧版云文档 |
| `sheet` | 电子表格 |
| `bitable` | 多维表格 |
| `mindnote` | 思维笔记 |
| `slides` | 幻灯片 |

## 行为说明

- 成功时会调用 `POST /open-apis/drive/v1/files/create_shortcut`
- 这是写入操作；执行前应确认目标文件夹和源文件都准确无误

## 限制

- 该接口不支持并发调用
- 调用频率上限为 5 QPS，且 10000 次/天
- 不支持跨租户、跨地域创建快捷方式
- 不支持跨品牌创建快捷方式
- 如果目标父文件夹单层挂载数量超过限制，会返回 `1062507`

## 权限要求

- 当前调用身份需要能访问源文件
- 当前调用身份需要对目标文件夹有编辑权限
- 如果权限不足，常见表现为 `1061004 forbidden`

## 常见错误

| 错误码 / 错误信息 | 原因 | 处理建议 |
|------|------|------|
| `1061002 params error` | 缺少必填参数，或 `file_token` / `type` 组合无法构成有效源文件信息 | 检查 `file_token`、`type` 是否完整且匹配；如显式传了 `folder_token`，再确认其值有效 |
| `1061003 not found` | 源文件或目标文件夹不存在 | 重新确认 token 是否正确、资源是否已删除 |
| `1061004 forbidden` | 对源文件没有访问权限，或对目标文件夹没有编辑权限 | 切换到有权限的身份，或先授予文档 / 文件夹权限 |
| `1061005 auth failed` | 身份类型或 access token 不正确 | 检查当前登录态 |
| `1061007 file has been delete` | 源文件已删除 | 确认原文件仍存在，再重新执行 |
| `1062507 parent node out of sibling num` | 目标文件夹单层挂载数超过上限 | 清理目标目录，或换一个父文件夹 |
| `1061045 resource contention occurred, please retry` | 平台内部资源争抢 | 稍后重试，不要并发重复调用 |
| `1064510 cross tenant and unit not support` | 跨租户或跨地域请求 | 改为在同租户、同地域范围内操作 |
| `1064511 cross brand not support` | 跨品牌请求 | 改为在同品牌环境内操作 |

## 参考

- [lark-drive](../SKILL.md) -- 云空间（云盘/云存储）全部命令

# drive +version-revert

将文件回滚到指定历史版本。

## 命令

```
lark_drive_version_revert(file_token="boxcnxxxxxxxx", version="7633658129540910621")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `file_token` | 是 | 目标文件 token |
| `version` | 是 | `lark_drive_version_history` 返回的长数字 `version` 字段，不是 `tag` |

## 返回值

无额外业务字段，以命令成功 / 失败为准。

## 参考

- [lark-drive](../SKILL.md) -- 云空间（云盘/云存储）全部命令

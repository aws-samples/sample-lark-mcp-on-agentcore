# lark_vc_meeting_screenshot

获取视频会议截图，并保存为 JPEG。只读操作。

本工具对应 shortcut：`lark_vc_meeting_screenshot`（调用视频会议实时画面接口）。

（认证由 MCP server 自动处理，始终以用户身份执行。）

## 常用用法

```
# 截图，文件写入默认目录
lark_vc_meeting_screenshot(meeting_id="<long_meeting_id>")

# 指定输出路径
lark_vc_meeting_screenshot(meeting_id="<long_meeting_id>", output="./meeting-screenshots/current.jpg")
```

## 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `meeting_id` | 是 | 长数字会议 ID，不接受 9 位会议号；只有会议号时，先用同一身份调用 `lark_vc_meeting_list_active` 获取。 |
| `output` | 否 | 指定 JPEG 文件名或包含子目录的相对路径；相对于工具执行时的工作目录。 |
| `overwrite` | 否 | 布尔值。目标文件已存在时允许替换；不传时调用会失败并保留原文件。 |

## 身份要求

使用发现 `meeting_id` 时的同一身份。MCP server 始终以用户身份调用，因此要求**当前登录用户正在该会议中**。

⚠️ 应用身份截图（要求应用机器人已入会并具备会中读取权限）在 MCP server 上不可用；`meeting_id` 来自应用身份路径时，说明限制并停止，不要改用用户身份重试。

所需权限：`vc:meeting.realtime:read`。

## 文件路径与结果

- 未指定 `output` 时，默认写入工作目录下的 `meeting-screenshots/<meeting_id>-<UTC timestamp>.jpg`。
- `output` 可以只写文件名，也可以包含多级子目录；父目录会自动创建。
- 不接受绝对路径，也不接受解析后超出工作目录的 `..` 或符号链接路径。
- 成功结果包含绝对文件路径、字节数、JPEG content type、SHA-256 和服务端 `log_id`。工具只返回这些文本字段，不会把图片内容本身返回给调用方。
- 服务端决定截图内容并校验会议是否满足条件；调用方不能指定要截取的区域或共享内容。失败不会替换已有文件。

## 相关场景

- `lark_get_skill(domain="meeting", section="scenes/live-meeting-interact")` — 会中事件与会中互动
- `lark_get_skill(domain="meeting", section="lark-vc-meeting-list-active")` — 发现当前进行中会议 ID

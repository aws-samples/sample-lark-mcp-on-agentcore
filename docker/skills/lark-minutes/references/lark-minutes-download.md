# minutes +download

下载妙记的音视频媒体文件到本地，或获取有效期 1 天的下载链接。只读操作。

## 用法

```
# 下载妙记（默认布局，落到 ./minutes/{minute_token}/<server-filename>）
lark_minutes_download(minute_tokens="obcnxxxxxxxxxxxxxxxxxxxx")

# 指定输出文件（单 token，文件路径）
lark_minutes_download(minute_tokens="obcnxxxxxxxxxxxxxxxxxxxx", output="./meeting.mp4")

# 指定输出目录（单/批量均可，目录路径）
lark_minutes_download(minute_tokens="obcnxxxxxxxxxxxxxxxxxxxx", output_dir="./downloads")

# 仅获取下载链接（有效期 1 天），不下载文件
lark_minutes_download(minute_tokens="obcnxxxxxxxxxxxxxxxxxxxx", url_only=true)

# 批量下载多个妙记（默认布局，逐个落到 ./minutes/{minute_token}/）
lark_minutes_download(minute_tokens="obcnxxxxxxxxxxxxxxxxxxxx,obcnyyyyyyyyyyyyyyyyyyyy")

# 批量下载到同一指定目录
lark_minutes_download(minute_tokens="obcnxxxxxxxxxxxxxxxxxxxx,obcnyyyyyyyyyyyyyyyyyyyy", output_dir="./downloads")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `minute_tokens` | 是 | 妙记 Token，逗号分隔支持批量（最多 50 个） |
| `output` | 否 | 输出文件路径（单 token）。若传入的是已存在目录，等价于 `output_dir`。与 `output_dir` 互斥 |
| `output_dir` | 否 | 输出目录（单/批量均可）。与 `output` 互斥 |
| `overwrite` | 否 | 覆盖已存在的输出文件 |
| `url_only` | 否 | 仅返回下载链接，不下载文件 |

> **默认落点**：未指定 `output` / `output_dir` 时，文件落到 `./minutes/{minute_token}/<server-filename>`。文件名沿用服务端 Content-Disposition / Content-Type 推断，Agent 可从 `saved_path` 字段读取实际路径。同一 minute_token 的录像和 `lark_minutes_detail` 的逐字稿默认会落在**同一目录**下，方便聚合。

## 核心约束

### 1. 妙记必须已完成转写

音视频文件仅在妙记转写完成后可下载。如果妙记尚未准备好，API 会返回 `2091003` 错误。

### 2. 下载链接有效期 1 天

`url_only=true` 返回的链接有效期为 1 天，过期后需重新获取。

### 3. 频率限制

API 限流 5 次/秒，批量下载时需注意控制频率。

### 4. 所需权限

| 身份 | 所需权限 |
|------|---------|
| user | `minutes:minutes.media:export` |

## 输出结果

### 下载模式（默认）

单 token：

```json
{
  "minute_token": "obcnxxxxxxxxxxxxxxxxxxxx",
  "artifact_type": "recording",
  "saved_path": "/path/to/minutes/obcnxxxxxxxxxxxxxxxxxxxx/访谈一则.m4a",
  "size_bytes": 52428800
}
```

批量：`downloads` 数组，每条与上面结构一致，失败项带 `error` 字段。

| 字段 | 说明 |
|------|------|
| `minute_token` | 妙记 Token（用于 Agent 索引） |
| `artifact_type` | 固定为 `"recording"`（与 `lark_minutes_detail` 的 `"transcript"` 区分） |
| `saved_path` | 文件保存的本地路径（绝对路径） |
| `size_bytes` | 文件大小（字节） |

### URL 模式（url_only=true）

```json
{
  "minute_token": "obcnxxxxxxxxxxxxxxxxxxxx",
  "download_url": "https://..."
}
```

| 字段 | 说明 |
|------|------|
| `minute_token` | 妙记 Token |
| `download_url` | 媒体文件下载链接（有效期 1 天） |

## 如何获取 minute_token

| 来源 | 获取方式 |
|------|---------|
| 妙记 URL | 从 URL 末尾提取，如 `https://sample.feishu.cn/minutes/obcnxxxxxxxxxxxxxxxxxxxx` → `obcnxxxxxxxxxxxxxxxxxxxx` |
| 妙记元信息查询 | `lark_invoke(tool_name="lark_minutes_minutes_get", args={params: {"minute_token": "obcn..."}})` |
| 会议录制查询 | `lark_vc_recording(meeting_ids="<id>")` 或 `lark_vc_recording(calendar_event_ids="<event_id>")` |

## 常见错误与排查

| 错误现象 | 错误码 | 根本原因 | 解决方案 |
|---------|--------|---------|---------|
| 参数无效 | 2091001 | minute_token 格式不正确 | 检查 token 是否完整（24 位） |
| 资源不存在 | 2091002 | token 不存在 | 确认 minute_token 正确 |
| 妙记尚未准备好 | 2091003 | 转写未完成 | 等待转写完成后重试 |
| 资源已删除 | 2091004 | 妙记已被删除 | 确认妙记文件仍然存在 |
| 权限不足 | 2091005 | 无阅读权限 | 检查是否有该妙记的访问权限 |

## 提示

- 音视频文件可能较大，下载无固定超时限制。
- 默认落点 `./minutes/{minute_token}/` 与 `lark_minutes_detail` 的逐字稿共享同一目录，方便 Agent 聚合同一会议的所有产物。
- 如需获取妙记的纪要内容（逐字稿、AI 总结等），请使用 `lark_get_skill(domain="minutes", section="detail")`。

## 参考

- `lark_get_skill(domain="minutes")` — 妙记全部命令
- `lark_get_skill(domain="minutes", section="detail")` — 妙记详情与 AI 产物查询

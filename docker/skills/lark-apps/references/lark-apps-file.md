# apps file 域命令（应用存储）

管理妙搭应用的文件存储：上传 / 下载本地文件、列出与查看已存文件、生成临时分享链接、批量删除、查看用量。认证、exit 码、`_notice` 等通用处理由 MCP server 自动处理，域内心智模型见 `lark_get_skill(domain="apps")`。

## 何时用

用户要在某个妙搭应用里上传 / 下载 / 列出 / 删除文件、拿文件的临时分享链接、或看存储用量时。普通飞书云盘走 `lark_get_skill(domain="drive")`；数据库里的表数据走 db 域（见 `lark_get_skill(domain="apps", section="db")`）。

## 命令一览

| 工具 | 做什么 | 关键参数 |
|---|---|---|
| `lark_apps_file_list` | 列出文件，可按名/路径/类型/大小/上传时间过滤 | `app_id`、过滤器、`page_size`/`page_token` |
| `lark_apps_file_get` | 查单个文件的元数据 | `app_id`、`path` |
| `lark_apps_file_sign` | 生成有时效的下载链接（用于分享 / 直接下载） | `app_id`、`path`、`expires_in` |
| `lark_apps_file_download` | 把远端文件保存到本地 | `app_id`、`path`、`output` |
| `lark_apps_file_upload` | 上传本地文件到应用存储 | `app_id`、`file` |
| `lark_apps_file_delete` | 按路径批量删除文件 | `app_id`、`path`（可重复）、`_confirm=true` |
| `lark_apps_file_quota_get` | 查应用的文件存储用量 | `app_id` |

## 寻址与约定（先读）

- **远端文件统一用 `path` 精确寻址**（远端路径，带前导 `/`）。只知道文件名时，先用 `lark_apps_file_list(name="<名>")` 定位拿到 `path`，再做后续操作。
- **本地文件 / 输出路径用工作目录内的相对路径**（如 `file="./report.pdf"`、`output="./out.png"`）；路径在别处时改成相对路径。
- 上传只接收本地 `file`：文件名沿用本地文件名，远端路径由平台分配、全局唯一（无需也无法手填）。
- file 域不区分环境，没有 `environment`。

## 各命令

### lark_apps_file_list
列出应用文件，支持精确过滤：`name`（文件名）、`path`（远端路径）、`type`（MIME 类型）、`size_gt`/`size_lt`（字节）、`uploaded_since`/`uploaded_until`（上传时间区间，时间格式见末尾）。分页 `page_size`（默认 20）/ `page_token`。列表每项给名称、路径、大小、类型、上传时间（pretty 表格即这 5 列）；上传者、下载地址（如有）仅在 JSON 输出里，单文件详情用 `lark_apps_file_get`。

```
lark_apps_file_list(app_id="app_xxx")
lark_apps_file_list(app_id="app_xxx", type="image/png", uploaded_since="7d")
```

### lark_apps_file_get
按 `path` 查单个文件的元数据。路径不存在时返回明确的「文件不存在」错误。

```
lark_apps_file_get(app_id="app_xxx", path="/1858537546760216.png")
```

### lark_apps_file_sign
为指定文件生成一个**有时效的下载链接**——适合发给用户分享、或直接下载。`expires_in` 设有效期秒数（默认 1 天，最长 30 天）。`format="pretty"` 只输出链接本身，便于复制；要把到期时间一并告诉用户时用默认 JSON 输出（含到期时间）。

```
lark_apps_file_sign(app_id="app_xxx", path="/1858537546760216.png", expires_in="3600")
```

### lark_apps_file_download
把远端文件保存到本地。`output` 指定保存路径，缺省时按远端文件名保存到当前目录。

```
lark_apps_file_download(app_id="app_xxx", path="/1858537546760216.png", output="./logo.png")
```

### lark_apps_file_upload
上传一个本地文件。文件名沿用本地文件名（特殊字符做 URL 编码透传；以 `.` 开头的隐藏文件名会加 `_` 前缀，避免下载回本地时覆盖隐藏文件），远端路径由平台分配。单文件上限 100 MB。

```
lark_apps_file_upload(app_id="app_xxx", file="./report.pdf")
```

### lark_apps_file_delete（高危）
按路径批量删除，`path` 可重复传多个。删除是高危操作，必须带 `_confirm=true`；缺省会被确认关卡拦下。**逐项返回结果**：部分文件删除失败（如某个路径不存在）不影响其余文件，整体仍算成功，失败项在结果里单独标出原因。

```
lark_apps_file_delete(app_id="app_xxx", path="/1858537546760216.png", _confirm=true)
lark_apps_file_delete(app_id="app_xxx", path="/a.png,/b.png", _confirm=true)
```

### lark_apps_file_quota_get
查应用的文件存储用量（已用量、文件数；配额接入后还会给总配额与使用率）。

```
lark_apps_file_quota_get(app_id="app_xxx")
```

## 时间格式（`uploaded_since` / `uploaded_until`）

按用户口语自然传入即可，支持：
- 相对时间 `7d` / `2h` / `30s`（从现在往前推）
- 日期 `2026-04-15`
- 日期时间 `2026-04-15T10:00:00`
- 带时区的 ISO 8601 `2026-04-15T10:00:00Z` / `2026-04-15T10:00:00+08:00`

> **时区**：不带时区的 `日期` / `日期时间` 按**运行机器的本地时区**解析（再归一化到 UTC 发给服务端）。CI（UTC）与本地（如 UTC+8）跑同一条命令，过滤边界会差几小时；要精确到某时区时显式写 ISO 8601 带偏移（如 `...+08:00` / `...Z`）。

## Agent 规则

- 寻址一律用 `path`；用户只给文件名时先 `lark_apps_file_list(name="<名>")` 定位，多个同名再让用户确认。
- 上传 / 下载的本地路径用工作目录内相对路径；不在当前目录就改相对路径。
- 用户要「分享链接 / 临时下载地址」时用 `lark_apps_file_sign`，把返回的链接转述给用户。
- 删除前判断意图：已明确要删且授权时可直接带 `_confirm=true`；不确定删哪些时先 `lark_apps_file_list` 给用户确认。批量删除部分失败不报错，按逐项结果向用户说明哪些成功、哪些没删掉及原因。

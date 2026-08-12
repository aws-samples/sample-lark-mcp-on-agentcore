
# drive +download

从飞书云空间（云盘/云存储）下载文件到本地。下载对象是 Drive **文件**（上传的 PDF/zip/图片/音视频等文件），以及支持 Wiki URL / Wiki token。

## 命令

```
# 下载到指定路径
lark_drive_download(file_token="boxbc_xxx", output="./report.pdf")

# 只提供 token，默认保存到当前目录
lark_drive_download(file_token="boxbc_xxx")

# 直接传 URL，自动解析类型和 token
lark_drive_download(url="https://example.feishu.cn/file/<FILE_TOKEN>", output="./report.pdf")

# Wiki URL 也可直接传，会先解析到底层 obj_token/obj_type（obj_type 必须是 file）
lark_drive_download(url="https://example.feishu.cn/wiki/<WIKI_NODE_TOKEN>", output="./report.pdf")

# 只有裸 Wiki node token 时，显式传 wiki_token，先解析底层文件
lark_drive_download(wiki_token="<WIKI_NODE_TOKEN>", output="./report.pdf")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `file_token` | 条件必填 | Drive 文件 token；与 `url` / `wiki_token` 三选一 |
| `url` | 条件必填 | 飞书文件 URL 或 Wiki URL；自动解析类型和 token |
| `wiki_token` | 条件必填 | 裸 Wiki node token；先解析到底层 Drive 文件 |
| `output` | 否 | 本地输出路径；不传时默认保存到当前目录 |
| `overwrite` | 否 | 覆盖已存在的输出文件；不传时目标已存在会报错 |

## URL 解析

从飞书文件 URL 提取 token：

```
https://xxx.feishu.cn/drive/file/boxbc_xxx
                                  ^^^^^^^^^
                                  file_token
```

Wiki URL / 裸 Wiki node token 会先解析到底层文档，解析后会在输出里附带 `wiki_token` 和 `wiki_node`（含底层 `obj_token`/`obj_type`）。

## 关键约束

- Wiki 节点解析后的 `obj_type` 必须是 `file`；不确定 token 类型时，先用 `lark_drive_inspect(url="<TOKEN>", type="wiki")` 检查。

## 排障

- 如果返回 `permission_denied`，或最终下载返回 `HTTP 403`，按错误 `hint` 使用 `lark_drive_preview(file_token="<FILE_TOKEN>", type="source_file", output="<path>")` 获取预览产物（见 `lark_get_skill(domain="drive", section="preview")`）。
- 如果返回限流错误，停止立即重试，稍后按指数退避重试。
- 如果目标（或 Wiki 解析出的底层文档）是 `docx` / `sheet` / `bitable` / `slides` 等在线文档，`lark_drive_download` 无法直接下载，会返回 typed validation error；改用 `lark_drive_export` 渲染成 pdf / xlsx / pptx / markdown 等格式（见 `lark_get_skill(domain="drive", section="export")`）。

## 参考

- `lark_get_skill(domain="drive")` -- 云空间（云盘/云存储）全部命令

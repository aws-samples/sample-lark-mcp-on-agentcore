---
name: lark-markdown
description: "飞书 Markdown：查看、创建、上传、编辑和比较 Markdown 文件。当用户需要创建或编辑 Markdown 文件、读取、修改、局部 patch 或比较差异时使用。不负责将 Markdown 导入为飞书在线文档，也不负责文件搜索、权限、评论、移动、删除等云空间管理操作。"
---

# markdown (v1)

## 快速决策

- 身份：Markdown 文件通常属于用户云空间资源，优先以用户身份操作。
- `lark_markdown_create` / `lark_markdown_overwrite` 失败时，先判断是不是身份和权限问题：scope 或目标目录 ACL、用户授权或用户 ACL；不要不加判断地重试。

- 用户要**上传、创建一个原生 `.md` 文件**，使用 `lark_markdown_create`
- 用户要**比较原生 `.md` 文件的历史版本差异**，或比较远端 Markdown 与本地草稿，使用 `lark_markdown_diff`
- 用户要**读取 Drive 里某个 `.md` 文件内容**，使用 `lark_markdown_fetch`
- 用户要对 Markdown 文件做**局部文本替换 / 正则替换**，优先使用 `lark_markdown_patch`
- 用户要**覆盖更新 Drive 里某个 `.md` 文件内容**，使用 `lark_markdown_overwrite`
- 用户要先拿 Markdown 文件的历史版本号，再做比较/下载/回滚，先用 `lark_get_skill(domain="drive", section="version-history")` 查看 `lark_drive_version_history`
- 用户要把本地 Markdown **导入成在线新版文档（docx）**，不要用本 skill，改用 `lark_get_skill(domain="drive", section="import")` 查看 `lark_drive_import(type="docx")`
- 用户要对 Markdown 文件做**rename / move / delete / 搜索 / 权限 / 评论**等云空间（云盘/云存储）操作，不要留在本 skill，切到 `lark_get_skill(domain="drive")`
- `lark_markdown_create` / `lark_markdown_overwrite` 命中 `missing scope`、`permission denied`、`not found`、`quota_exceeded`、`version limit` 时，默认停止重试并按报错 hint 处理；只有 `rate_limit`、`server_error` 或临时网络错误才做有限退避重试。
- `lark_markdown_create` 的目标参数不要猜：Drive 文件夹用 `folder_token`，Wiki 节点用 `wiki_token`。如果用户给的是 URL，可以直接传完整 URL；工具会归一成 token。不要把 doc/sheet/wiki URL 放进 `folder_token` 试错。

## 核心边界

- 本 skill 处理的是 **Drive 中作为普通文件存储的 Markdown**，不是 docx 文档
- `name` 和本地 `file` 文件名都必须显式带 `.md` 后缀；不满足时工具会直接报错
- `content` 支持：
  - 直接传字符串
  - `@file` 从本地文件读取内容
  - `-` 从 stdin 读取内容
- `lark_markdown_patch` 的内部语义是：**先完整下载 Markdown，再本地替换，再整文件覆盖上传**
- `lark_markdown_patch` 不是服务端原子 patch；它是服务端编排出来的局部更新能力
- `lark_markdown_patch` 当前只支持**单组** `pattern` / `content`
- `lark_markdown_patch` 替换后的最终内容**不能为空**；工具会拒绝上传空文件，因为 Drive 不支持零字节 Markdown，且空文件通常是误操作
- `file` 只接受本地 `.md` 文件路径

正则替换时要特别注意 `pattern` 的转义：

```
# BAD: 未转义正则特殊字符，可能匹配到错误位置
lark_markdown_patch(file_token="boxcnxxxx", regex=true, pattern="version (1.0)", content="version (2.0)")

# GOOD: 显式转义括号和点号
lark_markdown_patch(file_token="boxcnxxxx", regex=true, pattern="version \\(1\\.0\\)", content="version (2.0)")
```

## Shortcuts（推荐优先使用）

| Shortcut | 说明 |
|----------|------|
| `lark_get_skill(domain="markdown", section="create")` | Create a Markdown file in Drive |
| `lark_get_skill(domain="markdown", section="diff")` | Compare two remote Markdown versions, or compare remote Markdown against a local file |
| `lark_get_skill(domain="markdown", section="fetch")` | Fetch a Markdown file from Drive |
| `lark_get_skill(domain="markdown", section="patch")` | Patch a Markdown file in Drive via fetch-local-replace-overwrite |
| `lark_get_skill(domain="markdown", section="overwrite")` | Overwrite an existing Markdown file in Drive |

## 参考

- `lark_get_skill(domain="drive")` — Drive 文件管理、导入 docx、move/delete/search 等

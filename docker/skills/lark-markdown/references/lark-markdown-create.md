# markdown +create

在 Drive 中创建一个原生 Markdown 文件（`.md`），支持创建到普通 Drive 文件夹或 Wiki 节点下。

## 用法

```
# 直接用行内内容创建
lark_markdown_create(name="README.md", content="# Hello")

# 从本地 .md 文件创建
lark_markdown_create(file="./README.md")

# 创建到指定文件夹
lark_markdown_create(folder_token="fldcn_xxx", file="./README.md")

# 创建到指定文件夹（可直接传 Drive folder URL）
lark_markdown_create(folder_token="https://feishu.cn/drive/folder/fldcn_xxx", file="./README.md")

# 创建到指定 wiki 节点
lark_markdown_create(wiki_token="wikcn_xxx", file="./README.md")

# 创建到指定 wiki 节点（可直接传 wiki URL）
lark_markdown_create(wiki_token="https://feishu.cn/wiki/wikcn_xxx", file="./README.md")
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `folder_token` | 否 | 目标 Drive 文件夹 token 或 Drive folder URL；与 `wiki_token` 互斥；省略时创建到根目录 |
| `wiki_token` | 否 | 目标 wiki 节点 token 或 wiki URL；与 `folder_token` 互斥；传入后自动映射为 `parent_type=wiki` |
| `name` | 条件必填 | 文件名，**必须显式带 `.md` 后缀**；使用 `content` 时必填；使用 `file` 时可省略，默认取本地文件名 |
| `content` | 条件必填 | Markdown 内容；与 `file` 互斥；支持直接传字符串、`@file`、`-`（stdin） |
| `file` | 条件必填 | 本地 `.md` 文件路径；与 `content` 互斥 |

## 关键约束

- `content` 与 `file` 必须二选一
- `folder_token` 与 `wiki_token` 互斥
- `folder_token` 只能是 Drive 文件夹；不要传 wiki/doc/sheet/base/file token 或 URL
- `wiki_token` 只能是 Wiki 节点；如果只有 docx/sheet/base 等文档 URL，先用 `lark_wiki_node_get(node_token="<url>")` 解析出 `node_token`
- `name` 必须带 `.md` 后缀
- `file` 指向的本地文件名也必须带 `.md` 后缀
- 传 `wiki_token` 时，返回值中不会附带 `/file/<token>` URL，因为 wiki 承载文件没有稳定的独立 file URL

## 返回值

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "file_token": "boxcnxxxx",
    "file_name": "README.md",
    "size_bytes": 1234
  }
}
```

> [!IMPORTANT]
> ⚠️ 以应用身份（bot identity）创建 Markdown 文件的操作需要 bot identity，不通过 MCP server 提供。MCP server 始终使用 user identity。

## 失败处理

- `not_found` / `1061044`：父目录或 wiki 节点不存在，或 token 类型放错参数。修正 `folder_token` / `wiki_token` 后再试，不要重复提交同一参数。
- `quota_exceeded` / `1061101`：目标存储空间配额已满。释放空间、换父目录/节点或请管理员扩容后再试。
- `permission_denied` / `missing_scope`：区分身份处理。user identity 看用户授权和目标 ACL；bot identity 看应用 scope 与目标目录/节点 ACL。
- `rate_limit`：停止立即重试，使用退避。
- `server_error` / `233523001`：可以稍后有限重试；若重复出现，保留 `log_id` / request id 给服务端排查。

## 参考

- `lark_get_skill(domain="markdown")` — Markdown 域总览

# 权限治理 Command Patterns

本文只提供 `permission_governance` workflow 的具体工具调用样例。只有进入对应 state 且需要拼装命令时才读取本文；命令可用范围仍以 `lark_get_skill(domain="drive", section="workflow-permission-governance")` 的 `Command Map` 为准。

## 目录

- `目标解析`
- `目标发现`
- `事实读取`
- `写前确认与执行`

## 目标解析

```
lark_drive_inspect(url="<url>")
```

`/wiki/space/<space_id>` URL 是 Wiki space 范围，不要用 `lark_drive_inspect` 当作单文档解析；直接提取 `space_id` 后进入 `DISCOVER_TARGETS`。

## 目标发现

发现 Wiki space / node 下目标：

```
lark_wiki_node_list(space_id="<space_id>", page_size="50", page_all=true, page_limit="0")

lark_wiki_node_list(space_id="<space_id>", parent_node_token="<node_token>", page_size="50", page_all=true, page_limit="0")

lark_wiki_node_list(space_id="<space_id>", page_token="<PAGE_TOKEN>", page_size="50")
```

解析返回时使用 `data.nodes`，不要读取顶层 `items`。`page_limit="0"` 表示当前层分页不设页数上限；`page_all=true` 只覆盖当前 `space_id` / `parent_node_token` 范围内的分页，不会递归子节点。节点 `has_child=true` 时，必须继续以该节点的 `node_token` 作为 `parent_node_token` 递归读取。

发现 Drive folder 下目标：

```
lark_invoke(tool_name="lark_drive_files_list", args={params: {"folder_token": "<folder_token>", "page_size": 200}})

lark_invoke(tool_name="lark_drive_files_list", args={params: {"folder_token": "<folder_token>", "page_size": 200, "page_token": "<PAGE_TOKEN>"}})
```

## 事实读取

读取 metadata：

```
lark_invoke(tool_name="lark_drive_metas_batch_query", args={data: {"request_docs": [{"doc_token": "<token>", "doc_type": "<type>"}], "with_url": true}})
```

读取 public permission：

```
lark_invoke(tool_name="lark_drive_permission_public_get", args={params: {"token": "<token>", "type": "<type>"}})
```

按需读取访问统计：

```
lark_invoke(tool_name="lark_drive_file_statistics_get", args={params: {"file_token": "<token>", "file_type": "<type>"}})
```

按需读取最近访问记录：

```
lark_invoke(tool_name="lark_drive_file_view_records_list", args={params: {"file_token": "<token>", "file_type": "<type>", "page_size": 50}})
```

## 写前确认与执行

patch 前检查 manage-public permission：

```
lark_invoke(tool_name="lark_drive_permission_members_auth", args={params: {"token": "<token>", "type": "<type>", "action": "manage_public"}})
```

patch 前读取当前 schema：

```
lark_discover(query="drive.permission.public.patch")
```

只 patch 当前 schema 支持的字段；对 Wiki 目标，必须省略 schema 明确标注为 Wiki 不支持的字段。

显式确认后 patch public permission：

```
lark_invoke(tool_name="lark_drive_permission_public_patch", args={params: {"token": "<token>", "type": "<type>"}, data: {"link_share_entity": "closed", "external_access": false}})
```

显式确认后申请访问权限：

```
lark_drive_apply_permission(token="<url>", perm="view", remark="<reason>")

lark_drive_apply_permission(token="<bare-token>", type="<type>", perm="view", remark="<reason>")
```

owner 转移前读取当前 schema：

```
lark_discover(query="drive.permission.members.transfer_owner")
```

显式确认后转移 owner：

```
lark_invoke(tool_name="lark_drive_permission_members_transfer_owner", args={params: {"token": "<token>", "type": "<type>", "need_notification": true, "remove_old_owner": false, "old_owner_perm": "full_access", "stay_put": true}, data: {"member_id": "<new_owner_open_id>", "member_type": "openid"}})
```

`member_type` 只能使用当前 schema 支持的值：`email`、`openid`、`userid`、`appid`。如果用户只给姓名，必须先解析为明确身份或要求用户补充；不要猜测 `member_id`。批量 owner 转移必须逐个目标顺序执行。

secure label 写前枚举可用标签：

```
lark_drive_secure_label_list(page_size="10", lang="zh")

lark_drive_secure_label_list(page_size="10", page_token="<PAGE_TOKEN>", lang="zh")
```

当用户给出的是标签名称、密级文案或不确定的 label ID 时，必须先枚举并解析为 `label_id`；写入确认里展示目标标签名称和 ID。找不到唯一标签时，停止并让用户选择，不要猜测。

显式确认后更新 secure label：

```
lark_drive_secure_label_update(token="<url>", label_id="<label-id>")

lark_drive_secure_label_update(token="<bare-token>", type="<type>", label_id="<label-id>")
```

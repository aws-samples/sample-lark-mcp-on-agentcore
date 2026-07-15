# wiki +node-create

在飞书知识库中创建一个新节点，并自动解析目标知识空间。该 shortcut 对原生 `wiki.nodes.create` 做了一层更适合日常使用的封装：可以直接指定 `space_id`，也可以从父节点自动反查所属空间；如果同时省略 `space_id` 和 `parent_node_token`，还会自动回退到个人知识库 `my_library`。

## 命令

```
# 在个人知识库根目录下创建一个 docx 节点（默认回退到 my_library）
lark_wiki_node_create(title="项目计划")

# 在指定知识空间中创建一个 docx 节点
lark_wiki_node_create(space_id="<SPACE_ID>", title="项目计划")

# 在指定父节点下创建一个子节点
lark_wiki_node_create(parent_node_token="<PARENT_NODE_TOKEN>", title="迭代记录")

# 显式指定创建到个人知识库
lark_wiki_node_create(space_id="my_library", title="学习笔记")

# 创建一个快捷方式节点（shortcut）
lark_wiki_node_create(parent_node_token="<PARENT_NODE_TOKEN>", node_type="shortcut", origin_node_token="<ORIGIN_NODE_TOKEN>", title="原文档快捷方式")

# 创建非 docx 类型节点
lark_wiki_node_create(space_id="<SPACE_ID>", obj_type="sheet", title="周报数据")
```

## 返回值

成功后会返回一个 JSON 对象，常见字段包括：

- `resolved_space_id`：最终用于创建的真实知识空间 ID
- `resolved_by`：空间解析来源，可能是 `explicit_space_id`、`parent_node_token`、`my_library`
- `node_token`：新建知识库节点 token
- `obj_token`：节点关联对象 token
- `obj_type`：节点关联对象类型
- `node_type`：节点类型
- `title`：节点标题

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `space_id` | 否 | 目标知识空间 ID；可传特殊值 `my_library` 表示个人知识库 |
| `parent_node_token` | 否 | 父知识库节点 token；传入后会在该节点下创建新节点 |
| `title` | 否 | 节点标题 |
| `node_type` | 否 | 节点类型，默认 `origin`；可选值：`origin`、`shortcut` |
| `obj_type` | 否 | 节点对应对象类型，默认 `docx`；可选值：`sheet`、`mindnote`、`bitable`、`docx`、`slides` |
| `origin_node_token` | 否 | 当 `node_type="shortcut"` 时必填，表示快捷方式指向的源节点 token |

## 空间解析规则

- **优先级**：`space_id` > `parent_node_token` > `my_library`
- **显式 space**：传了 `space_id` 时，shortcut 会直接使用该空间；如果该值是 `my_library`，会先调用 `GET /open-apis/wiki/v2/spaces/my_library` 解析成真实 `space_id`
- **父节点推断**：未传 `space_id` 但传了 `parent_node_token` 时，会先调用 `GET /open-apis/wiki/v2/spaces/get_node` 获取父节点，再读取其 `space_id`
- **个人知识库回退**：如果 `space_id` 和 `parent_node_token` 都没传，会自动解析 `my_library`

## shortcut 节点规则

- `node_type="shortcut"` 时，必须同时提供 `origin_node_token`
- `node_type="origin"` 时，不能传 `origin_node_token`
- `shortcut` 节点只是知识库中的快捷方式入口；真正被引用的节点由 `origin_node_token` 指定

## 一致性校验

- 如果同时传了 `space_id` 和 `parent_node_token`，shortcut 会校验父节点所属空间是否与 `space_id` 一致
- 如果两者解析出的空间不一致，命令会直接返回验证错误，而不会继续创建
- 对于 `my_library`，也会先解析出真实 `space_id` 后再做这层校验

## 行为说明

- **默认对象类型**：不传 `obj_type` 时默认创建 `docx` 节点
- **默认节点类型**：不传 `node_type` 时默认创建普通节点 `origin`
- **输出结果**：成功后会返回 `resolved_space_id`、`resolved_by`、`node_token`、`obj_token`、`obj_type`、`node_type`、`title` 等字段，便于后续继续操作

## 推荐场景

- 用户说"在我的知识库里新建一篇页面"时，优先用 `lark_wiki_node_create(title="...")`
- 用户已经给出父页面链接或 `parent_node_token` 时，优先传 `parent_node_token`，让 shortcut 自动推导空间
- 需要创建知识库快捷方式时，使用 `node_type="shortcut"` + `origin_node_token="<token>"`

> [!CAUTION]
> `lark_wiki_node_create` 是**写入操作**，执行前必须确认用户意图。

## 参考

- 调用 `lark_get_skill(domain="wiki")` 查看知识库全部命令

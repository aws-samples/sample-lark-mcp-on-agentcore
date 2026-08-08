---
name: lark-drive
description: "飞书云空间（云盘/云存储）：管理 Drive 文件和文件夹，包含上传/下载、创建文件夹、复制/移动/删除、查看元数据、查询权限设置、评论/权限/订阅、标题、版本、飞书文档密级标签（secure labels）和本地文件导入。用户需要整理云盘目录、处理云空间资源 URL/token、判断链接类型/真实 token/标题，或导入 Word/Markdown/Excel/CSV/PPTX/.base 为 docx/sheet/bitable/slides 时使用；doubao.com 云空间 URL/token 也按资源路径和 token 路由，不回退 WebFetch。不负责：文档内容编辑（走 lark-doc）、表格/Base 表内数据操作（走 lark-sheets/lark-base）、知识空间节点/成员管理（走 lark-wiki）、原生 Markdown 文件读写/patch/diff（走 lark-markdown）。"
---

# drive (v1)

> **术语说明：** 飞书云空间也常被称为"云盘"、"云存储"、"网盘"或"我的空间"，这些说法通常指的是同一个产品，是飞书官方的云端文件存储与管理中心。

> **导入分流规则：** 如果用户要把本地 Excel / CSV / `.base` 快照导入成 Base / 多维表格 / bitable，必须优先使用 `lark_drive_import(type="bitable")`。不要先切到 `lark-base`；`lark-base` 只负责导入完成后的表内操作。

> **副本分流规则：** 如果用户要复制在线文档、创建文档副本、把文档复制到另一个文件夹，必须使用 `lark_drive_copy`。不要用 `lark_drive_export` 下载后再 `lark_drive_import` 上传，也不要用 `lark_docs_fetch` + `lark_docs_create` 重建正文；导出/导入只用于本地文件转换或离线产物。

## 快速决策

- 用户要把**已有 Wiki 节点移出知识库，放到 Drive 文件夹或"我的空间"根目录**：切到 `lark_get_skill(domain="wiki")`，使用 `lark_wiki_move_to_drive`；不要把 Wiki token 直接交给 `lark_drive_move`。这是会改变文档归属和权限继承的写操作，执行前确认源节点与目标位置。
- 用户要**复制文档 / 创建副本 到云盘或者文件夹**时，使用 `lark_drive_copy`，用法见 `lark_get_skill(domain="drive", section="copy")`。如果是要复制文档 / 创建副本到知识库，使用 `lark_wiki_node_copy`（见 `lark_get_skill(domain="wiki", section="node-copy")`）。
- 用户要**识别飞书 / doubao 云空间 URL 的类型和 token**时，可以先按 URL 路径形态做轻量判断；当路径已明确指向 docx / sheet / bitable / slides / file / folder 等资源时，可直接提取对应 token/type。传入 wiki URL、需要识别标题或 canonical URL、URL/token 有歧义，或后续操作依赖底层真实资源时，再使用 `lark_drive_inspect(url="<url>")` 进行识别；具体用法、失败处理和边界见 `lark_get_skill(domain="drive", section="inspect")`。
- 高风险写操作（删除、公开权限修改、owner 转移、版本删除/回滚、批量移动/覆盖/同步）必须同时满足三个条件才执行：目标已解析为该操作可直接使用的执行对象，执行细节已明确到可直接调用命令（例如删除的 file-token/type、公开权限修改的共享范围、owner 转移的目标 owner、版本删除/回滚的 version id、移动/覆盖/同步的目标位置和冲突策略），且用户在本轮明确确认执行这些具体目标和执行细节。用户只说"删除没用的文件""开放/共享给大家""改成开放""覆盖/移动这些"只表示目标状态；先只读发现并列出候选、权限档位或执行方案，停止等待用户确认。
- 用户要**检查 / 治理文档权限、公开范围、链接分享、外部访问、复制下载权限、密级标签、owner 转移**，或要"权限风险报告、收紧权限、申请查看 / 编辑权限、转移 / 批量转移 owner"，必须先调用 `lark_get_skill(domain="drive", section="workflow")`，再按其中 `Workflow Registry` 进入 `permission_governance` workflow（`lark_get_skill(domain="drive", section="workflow-permission-governance")`）。
- 用户要为指定飞书文档**设置 / 修改密级标签（secure label）**，或查询当前用户可用的密级标签，直接调用 `lark_get_skill(domain="drive", section="secure-label")`；这是 Drive 文件治理能力。
- 用户要**查询文件、文件夹或云文档自身的公开访问、分享、协作者管理、安全与评论权限设置**，优先使用 `lark_drive_permission_get_setting()`；它只读取目标自身设置，不递归审计文件夹子文档权限。裸 token 必须显式传 `type`。
- 用户要**按特定主题、关键词或内容线索跨容器查找资料，并统一收集到 Drive 文件夹或 Wiki 节点**，必须先调用 `lark_get_skill(domain="drive", section="workflow")`，再按其中 `Workflow Registry` 进入 `topic_move_collector` workflow（`lark_get_skill(domain="drive", section="workflow-topic-move-collector")`）。该 workflow 负责搜索召回、内容验证、相关性分类、移动计划、写前确认和结果验证；禁止直接从 `lark_drive_search` 或 `lark_drive_move` 开始。
- 用户要**整理云盘 / 文件夹 / 文档库 / 知识库 / 个人文档库**，或要"盘点目录结构、找出未归档/临时/重复/空目录、生成整理方案"，必须先调用 `lark_get_skill(domain="drive", section="workflow")`，再按其中 `Workflow Registry` 进入 `knowledge_organize` workflow（`lark_get_skill(domain="drive", section="workflow-knowledge-organize")`）。默认只生成方案；创建目录、移动资源、申请权限都必须单独确认。
- 按主题跨范围查找并集中归档，进入 `topic_move_collector`；对已知文件夹、文档库或知识库做目录盘点和结构重组，进入 `knowledge_organize`；只移动一个已明确资源时仍使用原子移动命令。
- 用户要**搜文档 / Wiki / 电子表格 / 多维表格 / 云空间（云盘/云存储）对象**，优先使用 `lark_drive_search()`。自然语言里"最近我编辑过的"、"我创建的"（→ `created_by_me=true`，原始创建者语义）、"我负责/owner 的"（→ `mine=true`，owner 语义）、"最近一周我打开过的 xxx"、"某人 owner 的 docx" 等直接映射到扁平参数，避免手写嵌套 JSON。
- 用户要对**文档评论**做任何操作（添加评论、列表 / 批量查询、回复、获取 / 更新 / 删除回复、解决 / 恢复、reaction），按下方 Shortcuts 表选择对应的评论工具，执行前先调用该工具对应的 `lark_get_skill(domain="drive", section=...)`。按评论定位文档正文位置见 `lark_get_skill(domain="drive", section="comment-location")`。
- 用户给出 doubao.com 的云空间资源 URL/token，或明确提到豆包里的 file/folder/docx/sheet/bitable/wiki 资源时，仍按资源类型、URL 路径和 token 路由到本 skill；不要因为域名不是飞书而回退到 WebFetch。
- 用户要把本地 `.xlsx` / `.csv` / `.base` 导入成 Base / 多维表格 / bitable，第一步必须使用 `lark_drive_import(type="bitable")`。
- 用户要把本地 `.md` / `.docx` / `.doc` / `.txt` / `.html` 导入成在线文档，使用 `lark_drive_import(type="docx")`。
- 用户要把本地 `.pptx` 导入成飞书幻灯片，使用 `lark_drive_import(type="slides")`；当前 PPTX 导入上限是 500MB。
- 批量执行 `lark_drive_import` 且目标是同一个位置（同一 `folder_token`、默认根目录，或同一 `target_token`）时，必须串行执行；不要并发导入到同一位置，服务端可能返回并发冲突错误。
- 用户要在 Drive 里上传、创建、读取、局部 patch 或覆盖更新**原生 `.md` 文件**（不是导入成 docx），切到 `lark_get_skill(domain="markdown")`。
- 用户要比较原生 `.md` 文件的**历史版本差异**，或比较远端 Markdown 与本地草稿，切到 `lark_get_skill(domain="markdown")` 的 `lark_markdown_diff`；需要版本号时先用 `lark_drive_version_history()`。
- 用户要查看、下载、回滚或删除文件的**历史版本**，使用 `lark_drive_version_history()`、`lark_drive_version_get()`、`lark_drive_version_revert()`、`lark_drive_version_delete()`；这组工具同时支持 user identity 和 bot identity。
- 用户要把本地 `.xlsx` / `.xls` / `.csv` 导入成电子表格，使用 `lark_drive_import(type="sheet")`。
- 用户要在云空间（云盘/云存储）里新建文件夹，优先使用 `lark_drive_create_folder()`。
- 用户要查看或下载文件内容，或者查看文件可用预览格式并获取 PDF / HTML / 文本 / 图片等转换预览产物，使用 `lark_drive_preview()`。
- 用户要获取某个文件的封面图，优先使用 `lark_drive_cover()`；先 `list_only=true` 看规格，再选 `spec` 下载。
- 用户要导出云文档时，优先使用 `lark_drive_export(url="<文档 URL>", file_extension="<格式>")`；详细参数、Wiki token 和错误码处理见 `lark_get_skill(domain="drive", section="export")`。
- 用户要把本地文件上传到知识库 / 文档库里的某个 wiki 节点下时，仍然使用 `lark_drive_upload(wiki_token="<wiki_token>")`；不要误切到 `wiki` 域命令。
- `lark-base` 只负责导入完成后的 Base 内部操作（表、字段、记录、视图），不要在"本地文件 -> Base"这一步提前切到 `lark-base`。
- 用户给的是 wiki URL / token，且后续还没明确底层资源类型时，先用 `lark_drive_inspect()` 解包；`lark_drive_inspect()` 失败后不要自动切到别的写接口继续尝试，先按错误提示处理权限、scope 或链接问题。
- `lark_drive_inspect()` / `lark_drive_upload()` 遇到 `not found`、`permission denied`、`missing scope` 时，默认停止重试；只有 `rate limit` 或临时网络错误才适合有限重试。

## 修改标题
- 用户要**重命名 / 改标题 / 改文件名**，使用 `lark_drive_update_title`，用法见 `lark_get_skill(domain="drive", section="update-title")`。

## 核心概念

### 文档类型与 Token

飞书开放平台中，不同类型的文档有不同的 URL 格式和 Token 处理方式。在进行文档操作（如添加评论、下载文件等）时，必须先获取正确的 `file_token`。

### 文档 URL 格式与 Token 处理

| URL 格式 | 示例                                                      | Token 类型 | 处理方式 |
|----------|---------------------------------------------------------|-----------|----------|
| `/docx/` | `https://example.larksuite.com/docx/doxcnxxxxxxxxx`    | `file_token` | URL 路径中的 token 直接作为 `file_token` 使用 |
| `/doc/` | `https://example.larksuite.com/doc/doccnxxxxxxxxx`     | `file_token` | URL 路径中的 token 直接作为 `file_token` 使用 |
| `/wiki/` | `https://example.larksuite.com/wiki/wikcnxxxxxxxxx`    | `wiki_token` | 不能直接当底层 `file_token`；优先用 `lark_drive_inspect()` 解包获取 `obj_token` |
| `/sheets/` | `https://example.larksuite.com/sheets/shtcnxxxxxxxxx`  | `file_token` | URL 路径中的 token 直接作为 `file_token` 使用 |
| `/page/` | `https://example.feishu.cn/page/pagcnxxxxxxxx/`        | apps token | URL 路径中的 token 直接使用，资源类型为 `apps` |
| `/drive/folder/` | `https://example.larksuite.com/drive/folder/fldcnxxxx` | `folder_token` | URL 路径中的 token 作为文件夹 token 使用 |

### Wiki 链接特殊处理

```
lark_drive_inspect(url="https://xxx.feishu.cn/wiki/wikcnXXX")
```

知识库链接背后可能是 docx、sheet、bitable、slides、file 等不同对象。后续要做评论、下载、导出或内容读取时，优先用 `lark_drive_inspect()` 拿到 `type`、`token`、`title`、`url`；完整手动解析和跨 skill 路由见 `lark_get_skill(domain="wiki")`。不要只根据 `/wiki/<token>` 猜底层类型。

### 常见操作 Token 需求

| 操作 | 需要的 Token | 说明 |
|------|-------------|------|
| 读取文档内容 | `file_token` / 通过 `lark_docs_fetch` 自动处理 | `lark_docs_fetch` 支持直接传入 URL |
| 下载文件 | `file_token` | 从文件 URL 中直接提取 |
| 上传文件 | `folder_token` / `wiki_node_token` | 目标位置的 token |

### 典型错误与解决方案

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `not exist` | 使用了错误的 token | 检查 token 类型，wiki 链接必须先查询获取 `obj_token` |
| `permission denied` | 没有相关操作权限 | 引导用户检查当前身份对文档/文件是否有相应操作权限；如果需要，可以授予相应权限 |
| `invalid file_type` | file_type 参数错误 | 根据 `obj_type` 传入正确的 file_type（docx/doc/sheet/slides/bitable/apps） |
| `232140101` / `232140100` / `233523001`（常见于 `lark_drive_import` 的 `job_error_msg`） | 同一位置下存在并发导入 / 创建操作 | 批量导入到同一文件夹、根目录或同一 `target_token` 时改为串行执行；每个失败项每次重试前等待几秒，总共最多重试 3 次，仍失败就停止并报告冲突 |

### 权限能力入口

- 用户要管理 Drive 文档/文件协作者、公开权限、授权当前应用访问文档，或处理 `permission.public.patch` 的 `91009` / `91010` / `91011` / `91012` 错误时，先调用 `lark_get_skill(domain="drive", section="permission-guide")`。
- 用户要查询文件、文件夹或云文档自身的公开访问、分享、协作者管理、安全与评论权限设置，使用 `lark_drive_permission_get_setting()`（详见 `lark_get_skill(domain="drive", section="permission-get-setting")`）；如果要递归审计文件夹下子文档权限，再进入 `permission_governance` workflow（`lark_get_skill(domain="drive", section="workflow-permission-governance")`）。
- 用户只是没有访问权限并希望向 owner 申请访问，优先使用 `lark_drive_apply_permission()`（详见 `lark_get_skill(domain="drive", section="apply-permission")`）。
- 普通 scope、身份或登录问题由 MCP server 自动处理认证；不要把租户安全策略、对外分享、密级拦截简单归类为缺 scope。

## 不在本 skill 范围

- 文档正文读取、总结、创建、编辑、图片/附件插入或下载：使用 `lark_get_skill(domain="doc")`。
- 电子表格单元格、筛选、公式、样式等表内操作：使用 `lark_get_skill(domain="sheets")`。
- Base / 多维表格内部的表、字段、记录、视图、仪表盘等操作：使用 `lark_get_skill(domain="base")`。
- 知识空间、Wiki 节点层级、空间成员管理：使用 `lark_get_skill(domain="wiki")`；上传本地文件到 wiki 节点仍用 `lark_drive_upload(wiki_token="<wiki_token>")`。
- 原生 Markdown 文件读取、写入、patch、diff：使用 `lark_get_skill(domain="markdown")`；把 Markdown 导入成在线 docx 才用 `lark_drive_import(type="docx")`。

## Shortcuts（推荐优先使用）

Shortcut 是对常用操作的高级封装。有 Shortcut 的操作优先使用。

| Shortcut | 说明 |
|----------|----------|
| `lark_drive_search()`（详见 `lark_get_skill(domain="drive", section="search")`） | 搜索文档、Wiki、表格、文件夹等云空间对象；支持 `edited_since`、`created_by_me`、`mine`、`doc_types` 等扁平参数；区分 original creator 与 owner 语义。 |
| `lark_drive_upload()`（详见 `lark_get_skill(domain="drive", section="upload")`） | 上传本地文件到 Drive 文件夹或 wiki 节点；修改/重写/更新已有文件时优先覆盖上传，而不是直接上传一个新文件。 |
| `lark_drive_create_folder()`（详见 `lark_get_skill(domain="drive", section="create-folder")`） | 新建 Drive 文件夹，支持父文件夹与 bot 创建后自动授权。 |
| `lark_drive_download()`（详见 `lark_get_skill(domain="drive", section="download")`） | 下载 Drive 文件到本地。 |
| `lark_drive_preview()`（详见 `lark_get_skill(domain="drive", section="preview")`） | 查看或下载文件内容，或者查看文件可用预览格式并获取 PDF / HTML / 文本 / 图片等转换预览产物。 |
| `lark_drive_cover()`（详见 `lark_get_skill(domain="drive", section="cover")`） | 查看或下载文件封面图规格。 |
| `lark_drive_status()`（详见 `lark_get_skill(domain="drive", section="status")`） | 比较本地目录与 Drive 文件夹差异；默认按 SHA-256 精确比较，`quick=true` 使用修改时间近似比较。 |
| `lark_drive_pull()`（详见 `lark_get_skill(domain="drive", section="pull")`） | 从 Drive 拉取文件到本地目录，支持重复远端路径处理和增量模式。 |
| `lark_drive_sync()` | 双向同步本地目录与 Drive 文件夹：拉取 `new_remote`、推送 `new_local`，`modified` 按 `on_conflict=remote-wins\|local-wins\|keep-both\|ask` 处理；`quick=true` 用修改时间近似比较；`on_duplicate_remote` 支持 `fail` / `newest` / `oldest`；只同步 `type=file`，跳过在线文档和 shortcut，且不会删除两端多余文件。 |
| `lark_drive_push()`（详见 `lark_get_skill(domain="drive", section="push")`） | 将本地目录推送到 Drive 文件夹，支持 skip / smart / overwrite 与确认后删除远端。 |
| `lark_drive_create_shortcut()`（详见 `lark_get_skill(domain="drive", section="create-shortcut")`） | 在另一个文件夹里创建现有 Drive 文件的快捷方式。 |
| `lark_drive_copy()`（详见 `lark_get_skill(domain="drive", section="copy")`） | 复制资源到目标文件夹；如果要复制到知识库，使用 `lark_wiki_node_copy`。 |
| `lark_drive_add_comment()`（详见 `lark_get_skill(domain="drive", section="add-comment")`） | 给 doc/docx/file/sheet/slides/base(bitable) 添加全文/局部评论；不支持妙搭 apps。 |
| `lark_drive_list_comments()`（详见 `lark_get_skill(domain="drive", section="list-comments")`） | 分页获取评论列表。 |
| `lark_drive_batch_query_comments()`（详见 `lark_get_skill(domain="drive", section="batch-query-comments")`） | 按评论 ID 批量获取评论。 |
| `lark_drive_resolve_comment()`（详见 `lark_get_skill(domain="drive", section="resolve-comment")`） | 把评论标记为已解决（`is_solved=true`）。 |
| `lark_drive_restore_comment()`（详见 `lark_get_skill(domain="drive", section="restore-comment")`） | 恢复/重新打开已解决评论（`is_solved=false`）。 |
| `lark_drive_add_reply()`（详见 `lark_get_skill(domain="drive", section="add-reply")`） | 给已有评论添加回复。 |
| `lark_drive_list_replies()`（详见 `lark_get_skill(domain="drive", section="list-replies")`） | 分页获取某条评论下的回复。 |
| `lark_drive_update_reply()`（详见 `lark_get_skill(domain="drive", section="update-reply")`） | 整体替换某条回复的内容。 |
| `lark_drive_delete_reply()`（详见 `lark_get_skill(domain="drive", section="delete-reply")`） | 删除评论下的某条回复（高风险，需 `_confirm=true`）。 |
| `lark_drive_react_reply()`（详见 `lark_get_skill(domain="drive", section="react-reply")`） | 给回复加/删表情回应。 |
| `lark_drive_export()`（详见 `lark_get_skill(domain="drive", section="export")`） | 将 doc/docx/sheet/bitable/slides 导出为本地文件。 |
| `lark_drive_export_download()`（详见 `lark_get_skill(domain="drive", section="export-download")`） | 根据导出产物的 file_token 下载文件。 |
| `lark_drive_import()`（详见 `lark_get_skill(domain="drive", section="import")`） | 将本地文件导入为飞书在线文档、表格、多维表格或幻灯片。 |
| `lark_drive_version_history()`（详见 `lark_get_skill(domain="drive", section="version-history")`） | 查看文件历史版本。 |
| `lark_drive_version_get()`（详见 `lark_get_skill(domain="drive", section="version-get")`） | 下载指定历史版本。 |
| `lark_drive_version_revert()`（详见 `lark_get_skill(domain="drive", section="version-revert")`） | 回滚到指定历史版本。 |
| `lark_drive_version_delete()`（详见 `lark_get_skill(domain="drive", section="version-delete")`） | 删除指定历史版本。 |
| `lark_drive_move()`（详见 `lark_get_skill(domain="drive", section="move")`） | 移动 Drive 文件或文件夹；Wiki 层级移动走 `lark-wiki`。 |
| `lark_drive_update_title()`（详见 `lark_get_skill(domain="drive", section="update-title")`） | 重命名文件、文件夹、在线文档或知识库节点。 |
| `lark_drive_delete()`（详见 `lark_get_skill(domain="drive", section="delete")`） | 删除 Drive 文件或文件夹，文件夹删除会轮询异步任务。 |
| `lark_drive_task_result()`（详见 `lark_get_skill(domain="drive", section="task-result")`） | 查询 import/export/move/delete 等异步任务结果。 |
| `lark_drive_inspect()`（详见 `lark_get_skill(domain="drive", section="inspect")`） | 检视 URL 的类型、标题和 canonical token；wiki URL 会自动解包到底层文档。 |
| `lark_drive_apply_permission()`（详见 `lark_get_skill(domain="drive", section="apply-permission")`） | 以 user 身份向文档 owner 申请访问权限。 |
| `lark_drive_member_add()`（详见 `lark_get_skill(domain="drive", section="member-add")`） | 添加一个或最多 10 个 Drive 文档、文件、文件夹或 wiki 节点协作者/授权成员；封装 Drive permission member create/batch_create，真实写入需要 `_confirm=true`。 |
| `lark_drive_member_list()`（详见 `lark_get_skill(domain="drive", section="member-list")`） | 查询 Drive 文档、文件、文件夹或 wiki 节点的协作者/授权成员列表。 |
| `lark_drive_permission_get_setting()`（详见 `lark_get_skill(domain="drive", section="permission-get-setting")`） | 查询文件、文件夹或云文档自身的公开访问、分享、协作者管理、安全与评论权限设置；支持 URL 或裸 token + `type`；不递归读取文件夹子文档权限。 |
| `lark_drive_secure_label_list()`（详见 `lark_get_skill(domain="drive", section="secure-label")`） | 列出当前用户可用的密级标签。 |
| `lark_drive_secure_label_update()`（详见 `lark_get_skill(domain="drive", section="secure-label")`） | 更新 Drive 文件或文档的密级标签。 |

## API Resources

```
lark_discover(query="drive.<resource>.<method>")   # 调用 API 前必须先查看参数结构
lark_invoke(tool_name="lark_drive_<resource>_<method>", args={...}) # 调用 API
```

> **重要**：使用原生 API 时，必须先运行 `lark_discover` 查看 `data` / `params` 参数结构，不要猜测字段格式。
>
> **高频原生命令：** 读取 Drive 文件夹清单时使用 `drive files list`，使用前先调用 `lark_get_skill(domain="drive", section="files-list")`，按模板通过 `params` 传参并手动处理分页；不要把 `page_all` 输出直接交给 JSON 解析脚本。

### files

  - `copy` — 复制文件；优先使用 `lark_drive_copy`（见 `lark_get_skill(domain="drive", section="copy")`）
  - `create_folder` — 新建文件夹
  - `list` — 获取文件夹下的清单；使用前调用 `lark_get_skill(domain="drive", section="files-list")`
  - `patch` — 修改文件标题；优先使用 `lark_drive_update_title`（见 `lark_get_skill(domain="drive", section="update-title")`）

### permission.members

  - `auth` — 
  - `create` — 增加协作者权限
  - `transfer_owner` — 

### metas

  - `batch_query` — 获取文档元数据

### user

  - `remove_subscription` — 取消订阅用户、应用维度事件
  - `subscription` — 订阅用户、应用维度事件（本次开放评论添加事件）
  - `subscription_status` — 查询用户、应用对指定事件的订阅状态

### file.statistics

  - `get` — 获取文件统计信息
    - 获取 docx / 文件统计信息时，通过 `lark_invoke(tool_name="lark_drive_file_statistics_get", args={params: {"file_token":"<token>","file_type":"<type>"}})` 调用，用 `params` 传 `file_token` / `file_type`。

### file.view_records

  - `list` — 获取文档的访问者记录
    - 查看 docx 最近访问记录、返回 open_id、最多 N 条时，通过 `lark_invoke(tool_name="lark_drive_file_view_records_list", args={params: {"file_token":"<docx_token>","file_type":"docx","page_size":<N>,"viewer_id_type":"open_id"}})` 调用，用 `params` 传 `file_token` / `file_type` / `page_size` / `viewer_id_type`。

### file.comment.reply.reactions

  - `update_reaction` — 添加/删除 reaction；优先使用 `lark_drive_react_reply`

### quota_details

  - `get` — 获取当前用户的容量信息，包含各业务使用量、租户配额是否超限、用户配额、所在部门配额
    - 仅支持 user identity
    - `quota_detail_id` 传当前用户的 `user_id`

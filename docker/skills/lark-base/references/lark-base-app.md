# BaseApp（应用模式）操作指引

> 认证由 MCP server 自动处理。接口和组件字段以当前工具 schema、`lark_get_skill(domain="base", section="app-block-data-config")` 和服务端校验结果为准；不要从组件名称推断额外约束。

## 不支持能力：先判断并停止

### 复制 BaseApp

本期没有 BaseApp 复制工具。用户要复制或克隆既有 BaseApp 时，直接说明当前工具集无法完成并停止；不要继续探索浏览器、裸 API 或创建类工具等替代通道，也不要发起任何写请求。

- `lark_base_base_copy()` 只支持 Base，不支持 BaseApp；不得向它传入 `app_token`，也不得把复制出的 Base 描述为应用副本。
- `lark_base_app_create()` 只创建全新空 BaseApp，不复制既有页面和组件。
- 不要使用 Drive copy 或其他 Base 工具拼装、模拟或冒充 BaseApp 复制。

### 创建或归属 PageGroup

当前第一阶段的页面层级能力只支持顶级 Page 节点。PageGroup 的创建、归属设置，以及把现有 Page 移入页面组均不支持。

最终答复必须同时说明上述正向支持范围和负向限制，不能只说 PageGroup 不支持。用户命中这些诉求时，直接说明当前工具集无法完成并停止；不要继续探索浏览器、裸 API 或普通 Page 工具等替代通道，也不要读取页面后声称能完成分组或发起任何写请求。

### 从 Workspace 移出或移除资源

当前只支持用 `lark_base_workspace_move_in()` 把 Base 或 BaseApp 移入 Workspace，不支持从 Workspace 移出或移除资源，也没有对应的 move-out / remove 工具。这类请求必须先完成只读定位，再说明限制并停止，顺序不可调换：

1. Workspace URL 含 `/base/workspace/<workspace_token>` 时，提取其中的真实 `workspace_token`，不要把完整 URL 当作参数。
2. 在同一轮立即调用 `lark_base_workspace_entity_list(workspace_token="<workspace_token>", page_size=100)`；若 `has_more=true`，继续分页直到完整。该查询是必要的只读定位步骤，不要把它留成等待用户再次选择的可选项，也不要用查看工具 schema 代替真实查询。
3. 用服务端返回的 `entities[].name`、`entity_type`、`token` 和 `url` 忠实判断目标。名称完全匹配时报告真实对象；没有完全匹配时明确说明不存在精确同名实体，并原样列出可能相关的候选。不得自动去掉或补齐前后缀，也不得仅凭名称相似就声称已经定位目标。用户直接给出 token 时仍要忠实报告该 token 对应的实际名称。
4. 定位结果报告完后，明确说明当前无法执行 Workspace 移出/移除，并停止，不要发起任何写请求。用户在任一步骤中取消时立即停止，取消后不再调用工具。

`lark_drive_move()` 只改变 Base 或 BaseApp 在云盘中的目录位置，不改变其 Workspace 归属，不能作为移出 Workspace 的替代方案。不要继续探索 Drive move/delete、另一个 Workspace 的 `lark_base_workspace_move_in()`、浏览器或裸 API 来拼装或冒充该操作；只有用户后续明确提出另一项受支持的操作时，才执行新的写入。

## Token 与工具

| 对象 | 标识 | 工具 |
|---|---|---|
| Workspace | `workspace_token` | `lark_base_workspace_create()` / `lark_base_workspace_entity_list()` / `lark_base_workspace_move_in()` |
| BaseApp | `app_token` | `lark_base_app_create()` / `lark_base_app_get()`；重命名和删除见下方 |
| Base | `base_token` | `lark_base_base_create()` 返回；表、字段、记录工具使用它 |
| Page | `page_id` | `lark_base_app_page_list/get/create/update/delete` |
| Block | `block_id` | `lark_base_app_block_list/get/create/update` |

页面和组件工具使用 `app_token`；Base 数据工具使用 `base_token`。`lark_base_app_block_get_data()` 使用 `app_token + base_token + chart_token`：参数名仍为 `block_id`，但必须传组件返回的 `chart_token`，不能传普通 `block_id`。请求路径与仪表盘图表数据接口相同。

BaseApp / AppMode 是 Base 域能力。用户提供 `/app/` 链接时，先用 `lark_base_url_resolve()`；它会返回 `app_token`，并忠实提取链接实际携带的 `workspace_token` 与 `page_id`。直接使用本指引和 `lark_base_*` 工具，不要先尝试妙搭（`lark_apps_*`）路径。

## 查询应用

```
lark_base_app_get(app_token="<app_token>")
```

- 没有 app-list 工具。需要列出某个 Workspace 内的 BaseApp 时，唯一列表入口是：

  ```
  lark_base_workspace_entity_list(workspace_token="<workspace_token>", type="baseapp", page_size=100)
  ```

- 响应中的 `pages` 是页面摘要。
- `ref` 的结构是 `Base token -> 当前组件引用的 Table 名称数组`。需要操作被引用 Base 时，使用 `ref` 的 key 作为 `base_token`。
- `ref` 只描述当前组件已经引用的数据源；没有被组件引用的 Base 不会出现在其中。

## 查询页面与组件

```
lark_base_app_page_list(app_token="<app_token>", page_size=100)
lark_base_app_block_list(app_token="<app_token>", page_id="<page_id>", page_size=100)
```

- `lark_base_app_get()` 已返回足够的页面摘要时，可直接取得目标 `page_id`；需要完整页面目录或分页确认时再用 `lark_base_app_page_list()`。
- `lark_base_app_page_list()` 返回的某个 Page 若 `name` 为空字符串，表示当前用户对该 Page 无权限，不表示 Page 没有标题。报告该权限状态，不要将其 `page_id` 用于后续页面或组件读写。
- 只需列表摘要时不要逐个调用 `lark_base_app_block_get()` 复核；仅在用户需要单个组件详情时使用 get。
- `lark_base_app_block_list()` 返回 `type=unsupported` 的组件时，只能通过列表摘要识别它的存在。当前不支持读取详情、读取计算数据或修改此类组件；不要调用 `lark_base_app_block_get()`、`lark_base_app_block_get_data()` 或 `lark_base_app_block_update()`，这些请求会报错。

## 创建 Workspace

```
lark_base_workspace_create(name="AppMode-空白评测空间")
```

## 创建应用

```
lark_base_app_create(name="销售应用", workspace_token="<workspace_token>")
```

- `lark_base_app_create()` 没有 `base_token` 参数。
- `workspace_token` 必填；`lark_base_app_create()` 只调用 App 创建接口，不创建 Workspace、Base，也不移动资源。
- `theme_style` 可选，支持 `default|cloudBlue|fresh|softLight|future|technology`。
- 记录输出中的 `app_token` 和 `workspace_token`。

### 新建应用的默认 Page 复用

`lark_base_app_create()` 会同时生成一个系统默认 Page，但创建响应不返回它的 `page_id`。用户未明确要求其他页面结构时，创建 App 后先读取应用取得该 Page，将其重命名并直接用作用户所需的第一个页面；不要用 `lark_base_app_page_create()` 另建第一个页面：

```
lark_base_app_get(app_token="<app_token>")
lark_base_app_page_update(app_token="<app_token>", page_id="<default_page_id>", name="<page_name>")
```

在上述默认流程中，随后在这个 Page 上**逐个串行**执行 `lark_base_app_block_create()`，同一 Page 的多个组件不得并发创建。只有用户确实需要额外页面时，才在复用默认 Page 之后调用 `lark_base_app_page_create()`。用户明确要求保留默认 Page、另建独立页面或采用其他页面结构时，按用户要求处理。

若 `lark_base_app_get()` 暂时没有返回默认 Page，重新执行 `lark_base_app_get()` 或 `lark_base_app_page_list()` 获取它，不要创建替代 Page。若创建组件返回布局重叠，先停止同页的其他并发写入，用 `lark_base_app_block_list()` 确认已成功组件，再留在原 Page 上串行重试失败步骤；不要通过新建 Page、删除默认 Page 或整页重建来规避冲突。

### 创建应用的自然语言编排

先根据用户是否指定 Workspace 和现有 Base 选择流程，再调用原子工具：

| 用户提供的信息 | 执行流程 |
|---|---|
| Workspace + 现有 Base | 确认 Base 位于该 Workspace → `lark_base_app_create()`；不创建备用 Base |
| Workspace，未指定 Base | `lark_base_app_create()` → `lark_base_base_create()` 创建空 Base → `lark_base_workspace_move_in()` |
| 未指定 Workspace，指定现有 Base | 先确认该 Base 所属 Workspace；能确定时在该 Workspace 执行 `lark_base_app_create()`，不能确定时请用户提供 Workspace；不创建备用 Base |
| Workspace 和 Base 都未指定 | `lark_base_workspace_create()` → `lark_base_app_create()` → `lark_base_base_create()` 创建空 Base → `lark_base_workspace_move_in()` |

应用模式的列表组件只能引用同一 Workspace 内的一个 Base。用户指定现有 Base 时，不要因为 `lark_base_app_create()` 没有接收 `base_token` 就额外创建 Base；后续在组件 `data_config.base_token` 中引用该 Base。

多步编排中，每个成功的工具调用都会立即产生资源且不自动回滚。后续步骤失败时，明确报告已经成功创建的 Workspace、App 或 Base 及其 token；用户要求继续时，只重试失败步骤，不要重复创建已经成功的资源。

## 读取图表计算结果

```
lark_base_app_block_get_data(app_token="<app_token>", base_token="<base_token>", block_id="<chart_token>")
```

- `block_id` 的值必须取图表组件摘要中的 `chart_token`，不能使用组件的普通 `block_id`。
- `base_token` 使用当前图表组件 `data_config.base_token`；一个 App 引用多个 Base 时，不要从 `lark_base_app_get()` 的 `ref` 中任意选择一个 key。
- `page_id` 不参与请求。
- 返回协议与 `lark_base_dashboard_block_get_data()` 完全一致。

## 重命名应用

```
lark_invoke(tool_name="lark_drive_files_patch", args={
  params: {"file_token": "<app_token>", "type": "bitable"},
  data: {"new_title": "新名称"}
})
```

BaseApp 与 Base 在 Drive 文件接口中都使用 `type=bitable`。`new_title` 只更新应用标题，不会重命名它引用的 Base，也不会修改 Page 或 Block。

## 删除应用

```
lark_drive_delete(file_token="<app_token>", type="bitable", _confirm=true)
```

- 删除 BaseApp 应用本体需要切到 drive 工具，用法见 `lark_get_skill(domain="drive")`。
- BaseApp 与 Base 在 Drive 删除接口中都使用 `type="bitable"`；删除 BaseApp 时 `file_token` 传 `app_token`。
- 这是高风险写操作；执行前先确认 `app_token` 来自 `lark_base_app_get()` 或 `lark_base_workspace_entity_list()`。

## Page

### 本期不支持的 Page 能力

Page 复制和页面图标均不在本期范围。用户提出复制 Page、复制页面、克隆页面、沿用页面图标、设置或修改页面图标等需求时：

1. 明确说明当前不支持该能力，并确认本次没有执行任何写入。
2. 不得调用 `lark_base_app_page_create()` 冒充完整复制；空 Page 不包含原 Page 的内容、组件或图标。
3. 不得尝试使用其他工具拼装、模拟或声称完成 Page 复制或图标设置。
4. 在最终答复中将以下替代能力单独成段说明，但不要自动执行：

   > 可用替代能力（本次未执行）：当前可以新建一个空 Page，但不会复制原 Page 的内容、组件或图标。如需新建空 Page，请明确告诉我。

只有用户后续明确要求新建空 Page，才可以调用 `lark_base_app_page_create()`。

```
lark_base_app_page_list(app_token="<app_token>")
lark_base_app_page_create(app_token="<app_token>", name="总览")
lark_base_app_page_update(app_token="<app_token>", page_id="<page_id>", name="经营总览")
lark_base_app_page_delete(app_token="<app_token>", page_id="<page_id>", _confirm=true)
```

- 对新建 App，用户未明确要求其他页面结构时，必须按[新建应用的默认 Page 复用](#新建应用的默认-page-复用)将系统默认 Page 用作用户所需的第一个页面；`lark_base_app_page_create()` 只用于用户要求的额外页面。
- 同一 App 内 Page 名称必须唯一。创建或更新名称前，服务端会读取页面列表；更新时排除当前 Page。
- 同一 Page 内组件名称必须唯一。`lark_base_app_block_create()` 会分页读取该 Page 的全部组件并在创建前检查重名。
- 本期没有 Page arrange，也没有 Block delete；Block 的 `type/sub_type` 创建后不可修改。详见[本期不支持的能力](#本期不支持的能力)。

## 本期不支持的能力

下列能力本期不存在。用户提出时，直接说明不支持并给出可选的替代方向，不要用 Dashboard 或其他域的同名能力顶替。

| 用户诉求 | 本期状态 | 正确动作 |
|---|---|---|
| 自动排版 / 重新布局 / 美化页面组件 | 没有 App page arrange | 直接告知不支持；不要调用 `lark_base_dashboard_arrange()` |
| 删除页面组件 | 没有 App block delete | 直接告知不支持，只能在 UI 处理；不要调用 `lark_base_dashboard_block_delete()` |
| 修改组件位置 / 大小 / 置顶 | 布局、位置、尺寸不属于公开 Create/Update 协议 | 直接告知不支持；不要用 `lark_base_app_block_update()` 做空更新伪装成移动 |
| 修改已有组件的 `type/sub_type` | `type/sub_type` 创建后不可修改 | 先读取当前 Block；无论是否已为目标类型，最终答复都要说明此约束。已匹配时说明无需写入；不匹配时说明只能在 UI 处理；不得调用或承诺用 `lark_base_app_block_update()` 修改类型 |
| 修改已存在 App 的主题 | `theme_style` 只在 `lark_base_app_create()` 时生效 | 直接告知不支持；如确有必要，说明只能新建 App 时指定主题 |
| 读取或修改 `type=unsupported` 的组件 | 列表仅用于识别该组件存在，详情读取、计算数据读取和修改均不支持 | 直接告知不支持；不要调用 `lark_base_app_block_get()`、`lark_base_app_block_get_data()` 或 `lark_base_app_block_update()`，这些请求会报错 |

`lark_base_dashboard_*` 工具只作用于 Base 内的仪表盘，`dashboard_id` 是 `blk` 开头、组件 ID 是 `cht` 开头；AppMode 的 `pge` 页面和 `wgt` 组件不属于它们的作用域。缺少能力时不要用这些工具试探：一次调用就是一次错误的能力归属判断。

## 列表组件

创建列表时使用 `type="list"` 与 `sub_type="standard|grouped|collapsible|card|detail"`。省略 `sub_type` 时默认 `standard`。

```
lark_base_app_block_create(app_token="<app_token>", page_id="<page_id>", name="待处理订单", type="list", sub_type="standard", data_config='{"base_token":"<base_token>","table_name":"订单"}')
```

- `data_config.base_token` 是单值：每个列表最多选择一个 Base。
- Base 必须在当前 App 的同一个 Workspace；写入前会校验。
- 完整字段协议读 `lark_get_skill(domain="base", section="app-block-data-config")`。

## 更新组件

`lark_base_app_block_update()` 只发送显式传入的 `data_config` 字段。未传字段保持不变；数组或对象字段是否整体替换，以 `lark_get_skill(domain="base", section="app-block-data-config")` 和服务端校验结果为准。不要为了"补全"先读取并提交全量配置。

## 常见恢复

| 现象 | 动作 |
|---|---|
| `status=partial` | 告知已完成/失败步骤；用户要求继续时执行 `retry.command` |
| Page 重名 | 先 `lark_base_app_page_list()`，选择唯一名称后重试 |
| 组件重名 | 先 `lark_base_app_block_list()`，为该 Page 内的新组件选择唯一名称后重试 |
| 列表 Base 不在同一 Workspace | 用 `lark_base_workspace_entity_list()` 核对；选择同 Workspace Base |
| 列表协议校验失败 | 读取组件协议文档；不要推断 title、group_by 数量或 field role |
| Block 类型选错 | 本期无法删除且类型不可改，只能在 UI 处理后重新创建 |
| 用户要 arrange / 删组件 / 调位置 / 改主题 | 按[本期不支持的能力](#本期不支持的能力)直接告知不支持；不要改用 `lark_base_dashboard_*` 工具 |

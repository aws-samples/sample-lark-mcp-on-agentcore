# base field-extension

字段插件用于扩展基础字段能力，当同行其他单元格更新时，触发 LLM 推理生成新单元格。当前公开支持的插件 ID 只有 `builtin_llm_completion`，已确认可用于文本、单选、数字字段，让目标字段基于 prompt 和字段引用生成内容，并可手动触发该字段的单元格异步更新任务。

三个工具：

- `lark_base_field_extension_get()`：读取目标字段当前可识别的插件配置。
- `lark_base_field_extension_update()`：安装、更新或清空目标字段插件配置。
- `lark_base_field_extension_update_cells()`：对已配置字段插件的目标字段发起手动更新任务。

## 何时使用字段插件

用户明确要让某个已有字段根据其他字段自动生成内容、总结、分类、翻译、提取信息，且目标能力可以用 prompt 表达时，使用字段插件。当前已确认的目标字段类型是文本、单选、数字。

字段插件只能建立在已有字段上，不能创建列 schema。新建字段仍使用 `lark_base_field_create()`；修改字段类型、选项、名称等 schema 属性仍使用 `lark_base_field_update()`。

## 推荐命令

```
# 读取当前插件配置
lark_base_field_extension_get(base_token="<base_token>", table_id="<table_id>", field_id="<target_field_id>")

# 安装或更新 LLM Completion 插件
lark_base_field_extension_update(base_token="<base_token>", table_id="<table_id>", field_id="<target_field_id>", json='{"extension_id":"builtin_llm_completion","inputs":{"prompt":[{"type":"text","text":"请根据 "},{"type":"field_ref","field":"需求描述"},{"type":"text","text":" 输出一句简洁结论。"}]}}', _confirm=true)

# 清空字段插件配置
lark_base_field_extension_update(base_token="<base_token>", table_id="<table_id>", field_id="<target_field_id>", json='{}', _confirm=true)

# 按视图范围触发整列更新
lark_base_field_extension_update_cells(base_token="<base_token>", table_id="<table_id>", field_id="<target_field_id>", type="column", view_id="<view_id>", _confirm=true)

# 只更新指定记录
lark_base_field_extension_update_cells(base_token="<base_token>", table_id="<table_id>", field_id="<target_field_id>", type="row", record_id=["<record_id_1>", "<record_id_2>"], _confirm=true)
```

`record_id` 是数组参数，一个元素一条记录；不要写成逗号拼接的单个字符串。

## 工作流

1. 定位 Base、Table 和目标 Field。目标 Field 是承载插件输出的已有字段，不是 prompt 中被引用的输入字段。
2. 用 `lark_base_field_extension_get()` 读取当前配置。返回 `current_extension=null` 表示未配置、无法识别或存量配置无法转换。
3. 构造 `lark_base_field_extension_update()` 的 `json`。安装或更新时传 `extension_id=builtin_llm_completion` 和 `inputs.prompt`；清空时传 `{}`。
4. 配置成功后，只有用户明确要立即生成或刷新已有单元格时，才调用 `lark_base_field_extension_update_cells()` 发起异步生成任务。
5. 需要验收结果时，等待任务完成或稍后用记录读取工具抽样查看目标字段单元格；`update_cells` 只返回任务 ID，不直接返回生成结果。

## JSON 结构

### 通用结构

`lark_base_field_extension_update()` 的 `json` 顶层结构是字段插件配置 envelope。不同 `extension_id` 对应不同的 `inputs` 结构；不要把某个插件的 `inputs` 当成所有字段插件的固定结构。

| 字段 | 类型 | 说明 |
|---|---|---|
| `extension_id` | string | 插件 ID。当前公开只支持 `builtin_llm_completion` |
| `inputs` | object | 插件配置对象，结构由 `extension_id` 决定 |

清空字段插件配置时传空对象：

```json
{}
```

### `builtin_llm_completion`

当前 `builtin_llm_completion` 用于让已有字段根据 prompt 生成内容。它的 `inputs` 结构如下：

| 字段 | 类型 | 说明 |
|---|---|---|
| `inputs.prompt` | PromptSegment[] | 有序 prompt 片段数组 |
| `prompt[].type` | string | `text` 或 `field_ref` |
| `prompt[].text` | string | `type=text` 时必填 |
| `prompt[].field` | string | `type=field_ref` 时必填，可传当前表的字段 ID 或字段名 |

安装或更新示例：

```json
{
  "extension_id": "builtin_llm_completion",
  "inputs": {
    "prompt": [
      {
        "type": "text",
        "text": "请根据 "
      },
      {
        "type": "field_ref",
        "field": "需求描述"
      },
      {
        "type": "text",
        "text": " 输出一句简洁的中文结论。"
      }
    ]
  }
}
```

`field_ref` 只能引用当前表中的其他字段，不能引用目标字段自身；附件字段和其他不支持字段不要作为引用字段。

## 更新单元格

`lark_base_field_extension_update_cells()` 有两种范围：

这是异步生成任务，响应只表示任务已创建。单元格越多，生成和写回通常耗时越久；整列更新尤其需要控制范围。

| 范围 | 参数 | 语义 |
|---|---|---|
| `type="column"` | 可选 `view_id` | 更新目标字段在该视图范围内的单元格；不传 `view_id` 时后端使用目标表首视图 |
| `type="row"` | 必填 `record_id`（数组，至少一个元素） | 只更新这些记录上的目标字段单元格 |

`type="row"` 不要传 `view_id`；`type="column"` 不要传 `record_id`。

响应只返回：

```json
{
  "task_id": "<task_id>"
}
```

## 返回重点

读取和写配置都返回 `current_extension`：

- 已配置并可识别时，`current_extension.extension_id` 表示插件 ID，`current_extension.inputs` 是该插件对应的配置对象。
- 未配置或当前无法识别时，`current_extension` 为 `null`。

## 权限和风险

- `lark_base_field_extension_get()` 是只读工具，权限 `base:field:read`。
- `lark_base_field_extension_update()` 是高风险写工具，权限 `base:field:update`，会改变目标字段的自动生成配置，调用时必须带 `_confirm=true`。
- `lark_base_field_extension_update_cells()` 是高风险写工具，权限 `base:record:update`，会触发目标字段单元格异步写回，调用时必须带 `_confirm=true`。
- 用户需要具备管理目标表或目标字段插件的权限才能触发更新任务；如果接口返回权限不足，先按 Base 权限或高级权限角色确认用户权限。

## 注意事项

- 目标字段必须是当前字段插件已支持的字段类型；当前已确认支持文本、单选、数字字段。不要把字段插件当成任意字段类型都可用的通用能力。
- 写入插件配置后，自动更新会强制开启；当前不提供关闭自动更新的参数。
- 读取接口中的 `field_ref.field` 通常返回字段名称；字段名称不可用时可能返回字段 ID。
- `lark_base_field_extension_update()` 不返回 `input_schemas`。
- `lark_base_field_extension_update_cells(type="column")` 可能触发大量 AI 生成任务，单元格越多耗时通常越久；除非用户明确要求整列刷新，否则优先按 `type="row"` 精确更新目标记录。

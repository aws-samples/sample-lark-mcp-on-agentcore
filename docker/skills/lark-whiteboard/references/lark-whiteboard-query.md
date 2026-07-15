# whiteboard +query（查询画板）

(authentication is handled automatically by the MCP server)

查询画板内容，支持导出为预览图片、SVG 矢量图、提取 PlantUML/Mermaid 代码，或获取飞书 OpenAPI 原生画板节点格式。

## 参数

| 参数                   | 必填 | 说明                                                                     |
|----------------------|----|------------------------------------------------------------------------|
| `whiteboard_token` | 是  | 画板 token，需要拥有画板的读权限                                                    |
| `output_as`        | 是  | 输出格式：`image`（预览图片）、`svg`（SVG 矢量图）、`code`（PlantUML/Mermaid 代码）、`raw`（OpenAPI 原生画板节点格式） |
| `output`           | 否  | 输出路径。当 `output_as="image"` 时必填；当 `output_as="svg"`、`"code"` 或 `"raw"` 时可选，不填则直接输出到终端 |
| `overwrite`        | 否  | 覆盖已存在的文件，默认为 false                                                     |

## 输出格式

- `image`：预览图片
- `svg`：导出画板为标准 SVG 矢量图。可用于 SVG 编辑后回写画板（见 `lark_get_skill(domain="whiteboard", section="routes/svg-edit")`）。注意：导出为纯视觉快照，思维导图层级、表格结构、连接器绑定等语义信息会丢失。
- `code`：PlantUML/Mermaid 代码。仅限画板内有且仅有一个 PlantUML/Mermaid 图时，才可导出代码，否则会在返回值中告知不存在/有多个节点。
- `raw`：飞书 OpenAPI 原生画板节点格式。这一 json 格式不适合直接编辑复杂布局或内容，建议仅限于需要修改简单的文本内容/颜色等细节时使用。需要进行更复杂的设计/修改时，建议参考 `lark_get_skill(domain="whiteboard", section="workflow")` 的「渲染 & 写入画板」章节。

## 示例

### 示例 1：导出画板为预览图片

```
lark_whiteboard_query(whiteboard_token="wbcnxxxxxxxx", output_as="image", output="./preview.png")
```

### 示例 2：提取画板中的代码并直接输出

```
lark_whiteboard_query(whiteboard_token="wbcnxxxxxxxx", output_as="code")
```

### 示例 3：导出画板为 SVG 矢量图

```
lark_whiteboard_query(whiteboard_token="wbcnxxxxxxxx", output_as="svg", output="./whiteboard.svg")
```

### 示例 4：导出画板原始节点结构到文件

```
lark_whiteboard_query(whiteboard_token="wbcnxxxxxxxx", output_as="raw", output="./nodes.json", overwrite=true)
```

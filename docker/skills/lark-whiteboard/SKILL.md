---
name: lark-whiteboard
description: "飞书画板：查询和编辑飞书云文档中的画板。支持导出画板为预览图片、导出原始节点结构、使用多种格式更新画板内容。当用户需要查看画板内容、导出画板图片、编辑画板时使用此 skill。不负责：飞书云文档内容编辑（lark-doc）、文档内嵌电子表格/Base（lark-sheets / lark-base）。"
---

# 飞书画板

飞书画板：查询和编辑飞书云文档中的画板。支持导出画板为预览图片、导出原始节点结构、使用多种格式更新画板内容。
当用户需要查看画板内容、导出画板图片、编辑画板时使用此 skill。

---

## 快速决策

| 用户需求 | 行动 |
|---|---|
| 查看画板内容 / 导出图片 / 导出 SVG 矢量图 | `lark_whiteboard_query(whiteboard_token="xxx", output_as="image", output="./preview.png")`（SVG 用 `output_as="svg"`）— 详见 `lark_get_skill(domain="whiteboard", section="query")` |
| 获取画板的 Mermaid/PlantUML 代码 | `lark_whiteboard_query(whiteboard_token="xxx", output_as="code")` — 详见 `lark_get_skill(domain="whiteboard", section="query")` |
| 检查画板是否由代码绘制 | `lark_whiteboard_query(whiteboard_token="xxx", output_as="code")` — 详见 `lark_get_skill(domain="whiteboard", section="query")` |
| 仅微调节点文字/颜色 | `lark_whiteboard_query(output_as="raw")` → 手动改 JSON → `lark_whiteboard_update(input_format="raw")` |
| 用户**已提供** Mermaid/PlantUML/SVG 代码，或明确指定用该格式 | 自己生成/使用代码 → `lark_whiteboard_update(input_format="mermaid")`、`lark_whiteboard_update(input_format="plantuml")` 或 `lark_whiteboard_update(input_format="svg")` — 详见 `lark_get_skill(domain="whiteboard", section="update")` |
| 新建/创作复杂图表（架构/流程/组织等）| → **§ 创作 Workflow**（`lark_get_skill(domain="whiteboard", section="workflow")`）|
| 修改/重绘已有画板 | → **§ 修改 Workflow**（`lark_get_skill(domain="whiteboard", section="workflow")`）|

## Shortcuts

| Shortcut | 说明 |
|---|---|
| `lark_whiteboard_query` | 查询画板，导出为预览图片、SVG 矢量图、代码或原始节点结构。 — 详见 `lark_get_skill(domain="whiteboard", section="query")` |
| `lark_whiteboard_update` | 更新画板，支持 PlantUML、Mermaid、SVG 或 OpenAPI 原生格式 — 详见 `lark_get_skill(domain="whiteboard", section="update")` |

---

## 不在本 skill 范围
- 文档内容编辑 → `lark_get_skill(domain="doc")`
- 在文档中创建画板 → `lark_get_skill(domain="doc", section="whiteboard")`
- 表格 / Base 操作 → `lark_get_skill(domain="sheets")` / `lark_get_skill(domain="base")`

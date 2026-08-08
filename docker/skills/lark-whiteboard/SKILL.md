---
name: lark-whiteboard
description: "飞书画板：查询和编辑飞书云文档中的画板。支持导出画板为预览图片、导出原始节点结构、使用多种格式更新画板内容。当用户需要查看画板内容、导出画板图片、编辑画板时使用此 skill。不负责：飞书云文档内容编辑（lark-doc）、文档内嵌电子表格/Base（lark-sheets / lark-base）。"
---

# 飞书画板

飞书画板：查询和编辑飞书云文档中的画板。支持导出画板为预览图片、导出原始节点结构、使用多种格式更新画板内容。
当用户需要查看画板内容、导出画板图片、编辑画板时使用此 skill。

---

## 快速决策

> 先判断「只读还是写入」，再在对应表内按上到下匹配，**命中即停**。

### A. 只读 · 查看 / 导出（不改画板）

| 用户需求 | 行动 |
|---|---|
| 查看画板内容 / 导出图片 | `lark_whiteboard_export(whiteboard_token="xxx", output_type="preview", output="./preview")` — 详见 `lark_get_skill(domain="whiteboard", section="export")` |
| 导出 SVG 矢量图 | `lark_whiteboard_export(whiteboard_token="xxx", output_type="svg")` — 详见 `lark_get_skill(domain="whiteboard", section="export")` |
| 提取画板的 Mermaid/PlantUML 源码 | `lark_whiteboard_export(whiteboard_token="xxx", output_type="source")` — 详见 `lark_get_skill(domain="whiteboard", section="export")` |

### B. 写入 · 创作 / 编辑（会改画板，命中即停）

| 场景 | 行动 | 写入方式 | 对原内容 |
|---|---|---|---|
| 用户**已提供** Mermaid/PlantUML/SVG 代码，或明确指定用该格式 | 使用该代码 → `lark_whiteboard_update(...)`，`input_format` 取单值 `"mermaid"` / `"plantuml"` / `"svg"`；写入非空已有画板并需要 overwrite 时，先确认会整板重建；若 SVG 用于修改已有画板，先走 `lark_get_skill(domain="whiteboard", section="routes/svg-edit")` 有损确认 — 详见 `lark_get_skill(domain="whiteboard", section="update")` | overwrite / append | 按用户要求 |
| 从零新建复杂图表（架构/流程/组织等）| → **§ 创作 Workflow**（`lark_get_skill(domain="whiteboard", section="workflow")`）| 首次写入 | — |
| 修改 / 增补已有画板 | → **§ 编辑 Workflow**（`lark_get_skill(domain="whiteboard", section="workflow")`）| 见该表 | 见该表 |

## Shortcuts

| Shortcut | 说明 |
|---|---|
| `lark_whiteboard_export` | 导出画板为预览图片、SVG 矢量图、代码或原始节点结构。 — 详见 `lark_get_skill(domain="whiteboard", section="export")` |
| `lark_whiteboard_update` | 更新画板，支持 PlantUML、Mermaid、SVG 或 OpenAPI 原生格式 — 详见 `lark_get_skill(domain="whiteboard", section="update")` |

---

## 不在本 skill 范围
- 文档内容编辑 → `lark_get_skill(domain="doc")`
- 在文档中创建画板 → `lark_get_skill(domain="doc", section="whiteboard")`
- 表格 / Base 操作 → `lark_get_skill(domain="sheets")` / `lark_get_skill(domain="base")`

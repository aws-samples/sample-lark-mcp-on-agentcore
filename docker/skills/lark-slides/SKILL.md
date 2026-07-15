---
name: lark-slides
description: "飞书幻灯片：创建和编辑幻灯片。创建演示文稿、读取幻灯片内容、管理幻灯片页面（创建、删除、读取、局部替换）。当用户需要创建或编辑幻灯片、读取或修改单个页面时使用。当用户给出 doubao.com 的 /slides/ URL/token 时，也应直接使用本 skill，不要因为域名不是飞书而回退到 WebFetch；路由依据是 URL 路径模式和 token，而不是域名。不负责：云文档内容编辑（走 lark-doc）、云文档里的独立画板对象（走 lark-whiteboard，注意 slide 内嵌的流程图/架构图仍属本 skill）、上传或下载普通文件（走 lark-drive）。"
---

# slides (v1)

## Quick Reference

| 用户需求 | 优先动作 | 关键文档 / 工具 |
|----------|----------|-----------------|
| 新建 PPT | 先规划 `slide_plan.json`，再按复杂度选择一步或两步创建 | `planning-layer.md`、`visual-planning.md`、`asset-planning.md`、`lark_slides_create` |
| 已有 PPT 大幅改写 | 多页整页重建用 `lark_slides_replace_pages`，单页局部编辑用 `lark_slides_replace_slide` | `lark_invoke(tool_name="lark_slides_xml_presentations_get")`、`lark-slides-replace-pages.md`、`lark-slides-edit-workflows.md` |
| 编辑单个标题、文本块、图片或局部元素 | 优先块级替换/插入，不改页序 | `lark_slides_replace_slide` |
| 读取或分析已有 PPT | 解析 slides/wiki token，回读全文或单页 XML，保存 `xml_presentation_id`、`slide_id`、`revision_id` | `lark_invoke(tool_name="lark_slides_xml_presentations_get")`、`lark_invoke(tool_name="lark_slides_xml_presentation_slide_get")` |
| 获取幻灯片页面截图 | 用 `slide_id` 或页号指定页面 | `lark_slides_screenshot`、`lark_get_skill(domain="slides", section="screenshot")` |
| 上传或使用图片 | 先上传为 `file_token`，禁止直接写 http(s) 外链 | `lark_slides_media_upload`，或 `lark_slides_create` 的 `@./path` 占位符 |
| 在 slide 中绘制柱/条/折线/面积/雷达/饼等有数据序列的图表 | 使用原生 `<chart>` 元素 | `xml-schema-quick-ref.md` |
| 在 slide 中绘制流程图、时序图、架构图、散点图、漏斗图或装饰图案 | 必须先调用 `lark_get_skill(domain="slides", section="whiteboard")` 获取参考文档，再生成 `<whiteboard>` 元素 | `lark_get_skill(domain="slides", section="whiteboard")` |
| 使用语义图标 | 先检索 IconPark，再写 `<icon iconType="...">` | `lark_exec_script(script="lark-slides/scripts/iconpark_tool.py", args=["search", ...])`、`lark_get_skill(domain="slides", section="iconpark")` |
| 创建失败、空白页、3350001、布局异常 | 先回读状态，再按排障清单修复，不假设原操作原子成功 | `troubleshooting.md`、`validation-checklist.md` |

**CRITICAL — 生成任何 XML 之前，MUST 先调用 `lark_get_skill(domain="slides", section="xml-schema-quick-ref")` 获取 XML 协议规则，禁止凭记忆猜测 XML 结构。**

**CRITICAL — PPT 生成与模板编辑硬约束：PPT 的尺寸是 960x540，确保主体内容在页面边界内。多用生图，辅助搜图，必须要图文并茂。不要为了画出一个具象物体而堆叠 3 个以上仅用于拟形的 shape。生成背景图时必须在 prompt 中明确要求不要出现任何文字。用户指定 PPT 模板时，用 `lark_drive_import(type="slides")` 导入成 lark slides，回读理解每页版式后，直接在该 slides 上编辑，可以填改文字和图片、按需增删模板页，必须严格沿用原版式和字体，只改内容不做设计，完成后回读并微调，凝练文字或缩减字号消除文字溢出，调整 shape 顺序或位置避免文字遮挡。**

**CRITICAL — 新建演示文稿或大幅改写页面时，MUST 先生成 `.lark-slides/plan/<deck-or-task-id>/slide_plan.json`，再生成 XML。先创建对应目录，规划层规则和中间产物生命周期见 `lark_get_skill(domain="slides", section="planning-layer")`。仅替换一个标题、插入一个块等小型已有页编辑可豁免。**

**CRITICAL — 新建演示文稿或大幅改写页面时，生成 XML 前 MUST 调用 `lark_get_skill(domain="slides", section="visual-planning")`，确保 `layout_type`、`visual_focus`、`text_density` 实际改变页面几何、主视觉和文本量。**

**CRITICAL — 新建演示文稿或大幅改写页面时，规划 `asset_need` MUST 遵循 `lark_get_skill(domain="slides", section="asset-planning")`：只做元数据规划，必须有 `fallback_if_missing`，不得要求真实搜索、下载或上传素材。**

**CRITICAL — 创建或大幅改写后，MUST 按 `lark_get_skill(domain="slides", section="validation-checklist")` 做显式验证：回读全文 XML、核对页数和关键元素、检查空白/破损页、明显溢出、布局风险。**

**CRITICAL — 创建前自检或失败排障时，MUST 按 `lark_get_skill(domain="slides", section="troubleshooting")` 检查 XML 转义、结构、图片 token、3350001 和布局风险。**

**编辑已有幻灯片页面**：单个标题、文本块、图片或局部元素优先用 `lark_slides_replace_slide`（块级替换/插入，不动页序）；已有 Slides 的多页大改优先用 `lark_slides_replace_pages` 在原 presentation 内批量重建页面，避免 `lark_slides_create` 生成新链接。选择 action 和完整读-改-写流程见 `lark_get_skill(domain="slides", section="edit-workflows")`。

## 身份选择

飞书幻灯片通常是用户自己的内容资源。MCP server 始终使用 **user identity**（authentication is handled automatically by the MCP server）。

## 执行前必做

> **重要**：`references/slides_xml_schema_definition.xml` 是此 skill 唯一正确的 XML 协议来源；其他 md 仅是对它的摘要。

高频只读：

- `lark_get_skill(domain="slides", section="xml-schema-quick-ref")`
- `lark_get_skill(domain="slides", section="planning-layer")`（新建 / 大幅改写）
- `lark_get_skill(domain="slides", section="visual-planning")`（新建 / 大幅改写）
- `lark_get_skill(domain="slides", section="asset-planning")`（新建 / 大幅改写）
- `lark_get_skill(domain="slides", section="validation-checklist")`（创建 / 大幅改写后）

按需再读：

- 创建：`lark_get_skill(domain="slides", section="create")`
- 编辑：`lark_get_skill(domain="slides", section="edit-workflows")`、`lark_get_skill(domain="slides", section="replace-slide")`、`lark_get_skill(domain="slides", section="replace-pages")`
- 截图：`lark_get_skill(domain="slides", section="screenshot")`
- 图片：`lark_get_skill(domain="slides", section="media-upload")`
- 流程图 / 时序图 / 架构图 / 装饰图案：`lark_get_skill(domain="slides", section="whiteboard")`
- 图标：`lark_get_skill(domain="slides", section="iconpark")`、`lark_exec_script(script="lark-slides/scripts/iconpark_tool.py", ...)`
- 排障：`lark_get_skill(domain="slides", section="troubleshooting")`

## Workflow

> **这是演示文稿，不是文档。** 每页 slide 是独立的视觉画面，信息密度要低，排版要留白。

### 创建方式选择

| 场景 | 推荐方式 |
|------|----------|
| 简单 XML（1-3 页、结构简单、几乎无复杂中文和特殊字符） | `lark_slides_create(title="...", slides='[...]')` 一步创建 |
| 复杂 XML（多页、含中文、大段文本、复杂布局、嵌套引号、特殊字符较多） | **两步创建**：先 `lark_slides_create(title="...")` 创建空白 PPT，再用 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", ...)` 逐页添加 |
| 已有 PPT 继续追加或插入页面 | 使用 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create", ...)`，必要时配合 `before_slide_id` |

### 核心概念

#### URL 格式与 Token

| URL 格式 | 示例 | Token 类型 | 处理方式 |
|----------|------|-----------|----------|
| `/slides/` | `https://example.larkoffice.com/slides/xxxxxxxxxxxxx` | `xml_presentation_id` | URL 路径中的 token 直接作为 `xml_presentation_id` 使用 |
| `/wiki/` | `https://example.larkoffice.com/wiki/wikcnxxxxxxxxx` | `wiki_token` | 需要先查询获取真实的 `obj_token` |

> `lark_slides_replace_slide` 和 `lark_slides_media_upload` 会自动解析以上两种 URL；直接调用原生 API 时仍需手动解析 wiki 链接。

#### Wiki 链接特殊处理

知识库链接（`/wiki/TOKEN`）不能直接当 `xml_presentation_id`。直接调用原生 API 前，先查询 wiki 节点，确认 `node.obj_type == "slides"`，再用 `node.obj_token` 作为真实 presentation ID。

```
lark_invoke(tool_name="lark_wiki_spaces_get_node", args={params: {"token": "wiki_token"}})
```

## Shortcuts 与 API

| Shortcut | 说明 |
|----------|------|
| `lark_get_skill(domain="slides", section="create")` | 创建 PPT（可选 `slides` 一步添加页面，支持 `<img src="@./local.png">` 占位符自动上传） |
| `lark_get_skill(domain="slides", section="media-upload")` | 上传本地图片到指定演示文稿，返回 `file_token`（用作 `<img src="...">`），最大 20 MB |
| `lark_get_skill(domain="slides", section="replace-slide")` | 对已有幻灯片页面进行块级替换/插入（`block_replace` / `block_insert`），自动注入 id 和 `<content/>`，不改变页序 |
| `lark_get_skill(domain="slides", section="replace-pages")` | 在原演示文稿内批量重建多个页面：先创建新页到旧页前，再删除旧页；适合已有 Slides 的多页大改，不新建链接 |

```
lark_discover(query="slides.xml_presentations.get")   # 调用 API 前必须先查看参数结构
lark_invoke(tool_name="lark_slides_xml_presentations_get", args={params: {"xml_presentation_id": "..."}})
```

原生 API 高频资源：`xml_presentations.get` 读取全文；`xml_presentation.slide.create/delete/get/replace` 管理单页。使用原生 API 时，必须先运行 `lark_discover` 查看参数结构，不要猜字段。

## 核心规则

1. **先规划再写 XML**：新建演示文稿或大幅改写页面时，必须先写入 `.lark-slides/plan/<deck-or-task-id>/slide_plan.json`；风格和大纲只能作为规划输入，不能绕过规划层
2. **创建流程**：简单短 XML 可用 `lark_slides_create(title="...", slides='[...]')` 一步创建；复杂内容默认先创建空白 PPT，再逐页添加
3. **`<slide>` 直接子元素只有 `<style>`、`<data>`、`<note>`**：文本和图形必须放在 `<data>` 内
4. **文本通过 `<content>` 表达**：必须用 `<content><p>...</p></content>`，不能把文字直接写在 shape 内
5. **保存关键 ID**：后续操作需要 `xml_presentation_id`、`slide_id`、`revision_id`
6. **删除谨慎**：删除操作不可逆，且至少保留一页幻灯片
7. **编辑已有页面优先原链接更新**：修改单个 shape/img 用 `lark_slides_replace_slide`（`block_replace` / `block_insert`），不要整页重建；已有 Slides 的多页整页重建用 `lark_slides_replace_pages`，不要用 `lark_slides_create` 新建整份 PPT；只有没有 shortcut 覆盖的特殊单页整页操作才手动 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create")` + `lark_invoke(tool_name="lark_slides_xml_presentation_slide_delete")`
8. **`<img src>` 只能用上传到飞书 drive 的 `file_token`，禁止使用 http(s) 外链 URL**

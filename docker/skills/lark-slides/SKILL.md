---
name: lark-slides
description: "飞书幻灯片：创建和编辑幻灯片。创建演示文稿、读取幻灯片内容、管理幻灯片页面（创建、删除、读取、局部替换）。当用户需要创建或编辑幻灯片、读取或修改单个页面时使用。当用户给出 doubao.com 的 /slides/ URL/token 时，也应直接使用本 skill，不要因为域名不是飞书而回退到 WebFetch；路由依据是 URL 路径模式和 token，而不是域名。不负责：云文档内容编辑（走 lark-doc）、云文档里的独立画板对象（走 lark-whiteboard）、上传或下载普通文件（走 lark-drive）。"
---

# slides (v1)

> 本技能文档较长，务必完整阅读全文。

## 权威经验

**权威经验是全局硬约束和高频易错点，必须牢记并严格遵守。**

- 你有充足的时间完成这个 PPT，质量永远比速度重要。
- PPT 的尺寸是 960x540，必须严格确保主体内容在页面边界内。
- !!!禁止交付无图产物!!! 必须使用大量图片增强视觉效果!!! 禁止重复使用同一张图!!!
- 封面页的主视觉必须是 `<img>`（来自生图工具或搜图工具），不要使用 `<shape>` 或 `<icon>` 拼出封面视觉。
- 禁止用 `<shape>` 和 `<line>` 拟形具体物项，必须使用生图工具生成的 `<img>`。
- 禁止在 `headline` 或 `title` 下方放置用于分隔或装饰的 `rect` 或 `<line>`。
- 禁止在任何页面内部使用无意义的装饰线条或色块条带，页面任何一边都不要使用贴边窄条。
- 生图工具的指令参数必须以“不要出现任何文字和颜色色号”结尾，避免生成的图片上出现干扰文字。
- 禁止使用 emoji 图标，任何位置都不能出现。
- 字号必须显式设置 `<content>` 的 `fontSize` 属性，不要依赖 `textType` 的默认字号兜底，这些兜底值明显偏大。
- 大数字、字号大或字数多的 `<content>` 必须设置 `wrap="true" autoFit="normal-auto-fit"` 属性自动换行和缩排，避免文字溢出。
- 文字颜色必须用 `<content>` 的 `color` 属性而不是 `fontColor` 属性。
- 文字行间距必须设置 `<content>` 的 `lineSpacing="multiple:xx"` 或 `lineSpacing="fixed:xx"` 而不是 `lineSpacing="xx"`。
- 图片必须用 `<img>` 而不是 `<image>`。
- IconPark 图标必须填充颜色（设置 `<fill><fillColor color="rgba(R,G,B,A)"/></fill>`）并和背景有足够对比。
- 绘制图表时原生图表（柱状、条形、折线、面积、饼（环）、雷达、组合图）用 `<chart>`，其他（漏斗图、金字塔图、象限图、矩阵图等）用 `<shape>` + `<line>` 模拟。
- 隐藏 `<chart>` 的图例只能通过不写或删除 `<chartLegend>` 实现，`<chartLegend>` 不支持 `position="none"`。
- 表格优先用 `rect` 和 `text` 模拟，其他用 `<table>`，没有 `<shape type="table">`。
- 必须设置 `<table>` 的 `width` 和 `height` 固定表格大小，同时设置需要保留列宽或行高的 `<col>` 的 `width` 和 `<tr>` 的 `height`，其余自动分配。
- `<td>` 直接子元素只有 `<fill>`（背景）、`<content>`（文字）和边框配置（一般不用），不能嵌套 `<shape>`、`<img>`、`<icon>`。
- `<shape type="rect">` 只是形状不是容器，`<icon>`、`<img>`、`<shape type="text">` 和其他 `<shape>` 必须与它平级靠坐标叠放。
- 填充渐变颜色必须用 `<fill><fillColor color="linear-gradient(135deg, rgba(R,G,B,A) 0%, rgba(R,G,B,A) 100%)"/></fill>`。
- 编辑页面前必须阅读 `lark_get_skill(domain="slides", section="edit-workflows")`。
- 绘制图表前必须阅读 `slides_chart_demo.xml`。
- 当用户要求无损复述历史上下文时，必须无损复述以上权威经验、必读的技能文档（需要重新阅读）和易错元素语法（尤其是 `<table>` 和 `<chart>`）。

## 豆包设计原则

适用范围：

- 普通内容页的设计必须以豆包设计原则为最高准则，除非用户要求使用模板或直接提供设计方案。
- 不适用于 `title-cover`、`section-divider`、`conclusion`、`quote-highlight` 和 `big-number`。

核心要求：

- 必须采用信息密度极高的图文卡片布局，追求充实饱满、图文丰富、可逐行细读的版面，宁可密而满，不要空而疏。
- **!!!信息密度极高!!! 图多!!! 卡多!!! 字多!!!**

排版布局：

- 卡片布局：卡片按多行网格铺满页面，版面对称、均衡、不留白。网格数、图文比例按内容变化，避免每页雷同。使用更多卡片做细分承载，避免在单张卡片里堆砌大量文字（例如 8 张 50 字卡片优于 2 张 200 字卡片），多个要点必须拆分为多张子卡片。
- 卡片样式：方角卡片 + 半透明填充 + 无边框 + 卡片贴边窄条（可选）；所有卡片必须使用相同的配色方案（少量需强调的卡片除外），禁止同页出现彩虹卡片（卡片颜色超过 3 种）。
- 卡片结构：视觉锚点（关键词、编号或 IconPark 图标）+ 标题 + 内容（包括文字、图片、图表、子卡片）。
- 文字卡片：多数页面必须满足 6-8 张文字卡片、200-400 文字数量，字数不足时必须扩写成长句或段落，文字卡片不要留白，必须充实饱满。文字卡片不是短标签，而是“标题 + 完整说明”，像浓缩的分析文稿。文字内容不得不用列表、分栏、关键词或短句时，必须保证层次清晰，更建议拆分为多张子卡片。
- 图片卡片：多数页面必须满足 1-3 张图片卡片，缺少图片时必须用生图工具补充配图，图片卡片与文字卡片组成网格，确保图文丰富。
- 图表卡片：数据信息不要在文字卡片中罗列，必须在图表卡片中可视化（包括表格、图表、时间线、流程图等），图表卡片与其他卡片组成网格，展现数据驱动。
- 间距要求：所有边距都要左右对称，页面和内部内容的边距至少 40px（内容不要贴边），卡片和内部文字的边距至少 5px（文字不要贴边），卡片之间保持 20-40px 的间距。
- 文字对齐：正文默认左对齐，只在封面、结尾或大号数字场景中使用居中；表格里的文字左对齐、数字右对齐、仅关键词或短句时居中对齐。

视觉风格：

- 美学：干净、明亮、清爽但信息饱满；靠卡片和对齐网格在高密度下维持秩序感；同排卡片文字数量应相近以保持观感整齐。
- 字体：全篇以无衬线体（思源黑体）为主，封面或关键强调可少量使用衬线体。
- 字号：标题 28-36pt、正文 12-14pt、注释 10-12pt，常规关键指标 16-32pt、核心指标用 36-52pt 数字，下面配 10-14pt 标签与简短解读，需要容纳更多文字时允许使用更小的字号。
- 图标：内嵌 IconPark 图标（可用关键词或编号替代）作为视觉锚点，让高密度文字也有图形节奏，而不是成片纯文字块。
- 配色：克制颜色数量，确保所有页面都只使用同样的 1 个背景色（偏好浅米白）、1 个主色、1 个强调色和 1 个辅助色；偏好莫兰迪配色，禁止彩虹配色（比如蓝配橙）。

## Quick Reference

| 用户需求 | 优先动作 | 关键文档 / 工具 |
|----------|----------|-----------------|
| 新建 PPT | 先规划 `slide_plan.json`，再按复杂度选择一步或两步创建 | `planning-layer.md`、`visual-planning.md`、`asset-planning.md`、`lark_slides_create` |
| 用户要求使用模板 | 将模板导入为 Slides 再编辑 | `lark-slides-pptx-template-workflows.md` |
| 编辑单个标题、文本块、图片或局部元素 | 优先块级替换/插入，不改页序 | `lark_slides_replace_slide`、`lark-slides-replace-slide.md` |
| 读取或分析已有 PPT | 解析 slides/wiki token，用 shortcut 回读全文 XML 或读取单页 XML，保存 `xml_presentation_id`、`slide_id`、`revision_id` | `lark_slides_xml_get`、`lark_invoke(tool_name="lark_slides_xml_presentation_slide_get")`、`lark-slides-xml-presentations-get.md` |
| 查看或回滚历史版本 | 先用 `lark_slides_history_list` 找 `history_version_id`，再 `lark_slides_history_revert`，必要时 `lark_slides_history_revert_status` 轮询 | `lark_slides_history_list`、`lark-slides-history.md` |
| 获取幻灯片页面截图 | 用 `slide_id` 或页号指定页面，一次不超过 10 页 | `lark_slides_screenshot`、`lark-slides-screenshot.md` |
| 上传或使用图片 | 先上传为 `file_token`，禁止直接写 http(s) 外链 | `lark_slides_media_upload`、`lark-slides-media-upload.md`，或 `lark_slides_create` 的 `@./path` 占位符 |
| 绘制图表 | 原生图表（柱状、条形、折线、面积、饼（环）、雷达、组合图）用 `<chart>`，其他（漏斗图、金字塔图、象限图、矩阵图等）用 `<shape>` + `<line>` 模拟 | `xml-schema-quick-ref.md`、`slides_chart_demo.xml` |
| 绘制表格 | 优先用 `rect` 和 `text` 模拟，其他用 `<table>` | `xml-schema-quick-ref.md` |
| 使用图标 | 禁止盲猜 iconType，必须先检索 IconPark，再写 `<icon iconType="...">`，图标必须填充颜色并和背景有足够对比，禁止使用 emoji 图标 | `lark_exec_script(script="lark-slides/scripts/iconpark_tool.py", args=["search", ...])`、`lark_get_skill(domain="slides", section="iconpark")` |
| 创建失败、空白页、3350001、布局异常 | 先回读状态，再按排障清单修复，不假设原操作原子成功 | `troubleshooting.md`、`validation-checklist.md` |

**CRITICAL — 查看或回滚历史版本前，MUST 先调用 `lark_get_skill(domain="slides", section="history")`。回滚接口只接受 `history_version_id`，不要把 `revision_id` 直接传给 `lark_slides_history_revert`。**

**CRITICAL — 生成任何 XML 之前，MUST 先调用 `lark_get_skill(domain="slides", section="xml-schema-quick-ref")` 获取 XML 协议规则，禁止凭记忆猜测 XML 结构。**

**CRITICAL — 新建演示文稿或大幅改写页面时，MUST 先生成 `.lark-slides/plan/<deck-or-task-id>/slide_plan.json`，再生成 XML。先创建对应目录，规划层规则和中间产物生命周期见 `lark_get_skill(domain="slides", section="planning-layer")`。仅替换一个标题、插入一个块等小型已有页编辑可豁免。**

**CRITICAL — 新建演示文稿或大幅改写页面时，生成 XML 前 MUST 调用 `lark_get_skill(domain="slides", section="visual-planning")`，确保 `layout_type`、`visual_focus`、`text_density` 实际改变页面几何、主视觉和文本量。**

**CRITICAL — 新建演示文稿或大幅改写页面时，规划 `asset_need` MUST 遵循 `lark_get_skill(domain="slides", section="asset-planning")`：只做元数据规划，必须有 `fallback_if_missing`，不得要求真实搜索、下载或上传素材。**

**CRITICAL — 将完整 `<slide>` XML 提交给 `lark_slides_create` 的 `slides` 参数、`lark_invoke(tool_name="lark_slides_xml_presentation_slide_create")` 或 `lark_slides_replace_pages` 之前，MUST 先运行 `lark_exec_script(script="lark-slides/scripts/xml_text_overlap_lint.py", args=["--input", "-"], stdin="<待提交 XML>")`；`summary.error_count` 必须为 0 才能调用接口。**

**CRITICAL — 创建或大幅改写后，MUST 按 `lark_get_skill(domain="slides", section="validation-checklist")` 做显式验证：回读全文 XML、核对页数和关键元素、检查空白/破损页、明显溢出、布局风险；XML 语法和文本重叠静态检查优先使用 `lark_exec_script(script="lark-slides/scripts/xml_text_overlap_lint.py", args=["--input", "-"], stdin="<待提交 XML>")`。**

**CRITICAL — 创建前自检或失败排障时，MUST 按 `lark_get_skill(domain="slides", section="troubleshooting")` 检查 XML 转义、结构、图片 token、3350001 和布局风险。**

**编辑已有幻灯片页面**：单个标题、文本块、图片或局部元素优先用 `lark_slides_replace_slide`（块级替换/插入，不动页序）；已有 Slides 的多页大改优先用 `lark_slides_replace_pages` 在原 presentation 内批量重建页面，避免 `lark_slides_create` 生成新链接。选择 action 和完整读-改-写流程见 `lark_get_skill(domain="slides", section="edit-workflows")`。

**用户要求使用模板**：按 `lark_get_skill(domain="slides", section="pptx-template-workflows")` 处理。

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
- 从模板创建或编辑已有本地 PPTX：`lark_get_skill(domain="slides", section="pptx-template-workflows")`
- 阅读：`lark_get_skill(domain="slides", section="xml-presentations-get")`
- 编辑：`lark_get_skill(domain="slides", section="edit-workflows")`、`lark_get_skill(domain="slides", section="replace-slide")`、`lark_get_skill(domain="slides", section="replace-pages")`
- 历史版本：`lark_get_skill(domain="slides", section="history")`
- 截图：`lark_get_skill(domain="slides", section="screenshot")`
- 图片：`lark_get_skill(domain="slides", section="media-upload")`
- 图表：`slides_chart_demo.xml`
- 图标：`lark_get_skill(domain="slides", section="iconpark")`、`lark_exec_script(script="lark-slides/scripts/iconpark_tool.py", ...)`
- 排障：`lark_get_skill(domain="slides", section="troubleshooting")`
- 完整协议：`slides_xml_schema_definition.xml`

## Workflow

> **这是演示文稿，不是文档。** 每页 slide 是独立的视觉画面，信息密度要适当，排版要留白。

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
| `lark_slides_create`（`lark_get_skill(domain="slides", section="create")`） | 创建 PPT（可选 `slides` 一步添加页面，支持 `<img src="@./local.png">` 占位符自动上传） |
| `lark_slides_xml_get`（`lark_get_skill(domain="slides", section="xml-presentations-get")`） | 读取全文 XML 并保存到本地文件，避免终端输出被截断 |
| `lark_slides_media_upload`（`lark_get_skill(domain="slides", section="media-upload")`） | 上传本地图片到指定演示文稿，返回 `file_token`（用作 `<img src="...">`），最大 20 MB |
| `lark_slides_replace_slide`（`lark_get_skill(domain="slides", section="replace-slide")`） | 对已有幻灯片页面进行块级替换/插入（`block_replace` / `block_insert`），自动注入 id 和 `<content/>`，不改变页序 |
| `lark_slides_replace_pages`（`lark_get_skill(domain="slides", section="replace-pages")`） | 在原演示文稿内批量重建多个页面：先创建新页到旧页前，再删除旧页；适合已有 Slides 的多页大改，不新建链接 |

```
lark_discover(query="slides.xml_presentation.slide.get")   # 调用 API 前必须先查看参数结构
lark_invoke(tool_name="lark_slides_xml_presentation_slide_get", args={params: {"xml_presentation_id": "...", "slide_id": "..."}})
```

没有 Shortcut 覆盖时使用原生 API。高频资源：`lark_slides_xml_get` 读取全文；`xml_presentation.slide.create/delete/get/replace` 管理单页。使用原生 API 时，必须先运行 `lark_discover` 查看参数结构，不要猜字段。

## 核心规则

1. **先规划再写 XML**：新建演示文稿或大幅改写页面时，必须先写入 `.lark-slides/plan/<deck-or-task-id>/slide_plan.json`；模板、风格和大纲只能作为规划输入，不能绕过规划层
2. **创建流程**：简单短 XML 可用 `lark_slides_create(title="...", slides='[...]')` 一步创建；复杂内容默认先创建空白 PPT，再逐页添加
3. **`<slide>` 直接子元素只有 `<style>`、`<data>`、`<note>`**：文本和图形必须放在 `<data>` 内
4. **文本通过 `<content>` 表达**：必须用 `<content><p>...</p></content>`，不能把文字直接写在 shape 内
5. **保存关键 ID**：后续操作需要 `xml_presentation_id`、`slide_id`、`revision_id`
6. **删除谨慎**：删除操作不可逆，且至少保留一页幻灯片
7. **编辑已有页面优先原链接更新**：修改单个 shape/img 用 `lark_slides_replace_slide`（`block_replace` / `block_insert`），不要整页重建；已有 Slides 的多页整页重建用 `lark_slides_replace_pages`，不要用 `lark_slides_create` 新建整份 PPT；只有没有 shortcut 覆盖的特殊单页整页操作才手动 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_create")` + `lark_invoke(tool_name="lark_slides_xml_presentation_slide_delete")`
8. **`<img src>` 只能用上传到飞书 drive 的 `file_token`，禁止使用 http(s) 外链 URL**

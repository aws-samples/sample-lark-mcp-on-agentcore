---
name: creative-design
description: "以自包含 HTML 创建精致的设计产物：UI mockup、可交互原型、线框图（wireframe）、落地页、仪表盘、应用屏幕、移动 App、幻灯片 deck（PPT / 演示文稿）、动画视频、可视化报告 / 信息图 / 视觉长图与视觉探索。只要用户要求为界面、产品屏幕、用户流程、内容版式、视觉产物或 pitch/deck 概念进行 design、mock up、prototype、wireframe、可视化、动画/动效、探索或制作 PPT/deck，即便没有说“设计”二字，就使用本 guide。"
---

## 运行环境说明（本 MCP 环境）

本 guide 的上游版本随附一批脚手架文件与 harness 工具映射，本 MCP server **不提供**这些内容，因此本节先明确边界：

- **脚手架文件不可用**：上游的 `starter-components/`（`design-canvas.jsx`、`deck-stage.js`、`ios-frame.jsx`、`android-frame.jsx`、`tweaks-panel.jsx`、`macos-window.jsx`、`browser-window.jsx`、`animations.jsx`）、React+Babel 的 `assets/index.html` 起步模板、以及 `references/<harness>.md` 工具映射表（claude/codex/aily），本环境都不提供，也无法下发 `.jsx`/`.js`/图片给下游 agent。凡是需要设备外框、画布外壳、deck 外壳或动画时间轴的地方，**请直接手写对应组件**，用内联 SVG/CSS 兜底。
- **媒介技能 prompt**：本环境仅收录了以下自包含设计 prompt，可用 `lark_get_skill` 加载：
  - `lark_get_skill(domain="apps", section="creative-design/references/frontend-design")` — 视觉方向
  - `lark_get_skill(domain="apps", section="creative-design/references/hi-fi-design")` — 高保真设计
  - `lark_get_skill(domain="apps", section="creative-design/references/charts")` — 图表
  - `lark_get_skill(domain="apps", section="creative-design/references/data-report")` — 数据报表
  - `lark_get_skill(domain="apps", section="creative-design/references/visual-exposure")` — 可视化报告
  - `lark_get_skill(domain="apps", section="creative-design/references/wireframe")` — 线框图
  - make-a-deck（幻灯片 deck）、interactive-prototype（可交互原型）、animated-video（动画视频）三份媒介 prompt，以及 claude/codex/aily 的 harness 工具映射表，本 MCP server 未收录；遇到需要它们的场景，按本 guide 的通用方法直接手写实现，并向用户说明该专用指南在本环境不可用。
- **React + Babel 模板**：本环境不提供 `assets/index.html` 模板，请按下文「React + Babel」一节手写等价的锁定版本 script 标签和 `#root` 挂载点。

## 工作流

1. 理解用户需求。对全新或含糊的工作，提出澄清性问题。弄清输出物、精细度（fidelity）、选项数量、约束条件，以及涉及的 UI kit 与品牌。
2. 探索所提供的资源。附件、文档链接、网页 URL 都要在动手前解析完（见「输入资料解析」）。
3. 列出 todo 清单。
4. 为本次任务创建独立的任务目录——多个任务会在同一个根目录下执行，直接写根目录会互相覆盖、文件串台；每个任务目录是一个**独立的妙搭应用仓库**——新任务先用 `lark_apps_create` 建应用、再 `lark_apps_init(app_id="<app_id>", dir="<任务目录>")` 初始化仓库（会自动 clone 并切到 `sprint/default`，命令见「发布」前提），独立发布互不影响。把资源复制进任务目录，在其中创建交付物。用图片素材提升美观度与丰富度、或需要有依据的内容时，按「图像素材与外部信息」补充。
5. （如有）自检 React + Babel 路径是否正确；ReactDOM.createRoot 是否参数正确，对应元素是否存在。
6. 收尾：提交你的改动。
7. 发布：把产物发布到妙搭拿到可访问链接（见下方「发布」）。写完不发布，用户拿不到线上链接。
8. 极其简短地总结——只讲注意事项与后续步骤，并给出发布后的可访问链接。

鼓励你并发调用文件探索工具以提升效率。

## 提问

默认基于用户给的信息、项目上下文和合理假设直接开始，不为收集偏好而打断。只有当一个决策同时满足两条，才用可用的向用户提问的能力向用户提问：① 用户没说、且从 prompt / PRD / 截图 / 代码库 / 品牌资料也推不出；② 猜错要推倒重来（承重决策，下游都建在它上面）。两条只要有一条不成立——能合理推断，或猜错只是局部返工——就直接做。

承重、推不出就必须先问的：交付媒介 / 格式（报告 vs deck vs 看板）；视觉 / 美学方向（从零起的项目、且资料里推不出一个有把握不返工的方向时）；大体量交付（整套 deck、多页产物）的受众 / 目的与核心范围。
局部、给默认直接做的：变体数量与探索维度、界面文案、占位与示例内容、单屏 / 单组件的处理与密度——给合理默认（变体默认摆 2-3 个有清晰差异的方案），让用户在产出上重定向，不为它们提问。

例如：

- "做一份关于 X 的报告／材料"但没说格式 → 媒介推不出且承重，先确认交付格式（幻灯片 vs. 视觉报告 vs. 仪表盘），再问格式相关的问题。
- 为附带的 PRD 做一套 deck → PRD 能推出受众 / 场景就直接做；只有受众、篇幅推不出且影响全局时才问。
- 用这份 PRD 为 Eng All Hands 做一套 10 分钟的 deck → 无需提问；信息已足够。
- 把这张截图变成交互原型 → 只有当图片无法说明预期行为时才提问。
- 做 6 页关于黄油历史的幻灯片 → 媒介、页数已定，直接开工；风格能从主题推断就定，推不出再问。
- 为我的外卖 app 的 onboarding 做一套原型 → 按常见 onboarding 流程直接做；只问会阻塞产出的承重问题。

当交付格式本身不明确时——用户只说了一个成果（"一份报告""材料""一份摘要"）却没说媒介——先解决格式，再讨论任何与格式相关的细节。

问出好问题至关重要。技巧：

- 通常一轮聚焦提问就够；把承重的未知一次问齐，不要挤牙膏式多轮打断。
- 只问推不出的；能从 PRD、截图、代码库、品牌资产、现有页面和用户原话推断的，先推断，并在产出里说明你的假设。

## 输入资料解析

用户给的附件、文档链接和 URL 是设计的输入，必须在动手前解析完——数据看板、报告和基于文档的 deck 全都建立在源资料之上，跳过这一步产出的内容只能靠编造。按输入形态处理：

- **数据文件（csv / json / xlsx）**——先看结构（列名、字段类型、行数）和样本行，再决定信息层级与图表选型；指标一律用脚本从源数据计算，不要目测。
- **压缩包（zip）**——先解压到临时目录，逐个查看内容物，再按各自类型处理。
- **文档（docx / pdf / 论文 / 需求文档）**——用当前环境的文档解析能力读取**全文**，不要只读开头就动手。
- **飞书云文档 / 多维表格链接**——用对应的飞书 skill 读取内容（云文档走 lark-doc、多维表格走 lark-base 等）；无法读取时向用户说明并请其导出或粘贴，不要凭标题猜内容。
- **网页 URL**——用当前环境的网页抓取能力（若有）抓取全文后再产出；抓取失败就告知用户，不要凭 URL 和常识编写。

## 如何开展设计工作

动手前先加载 `lark_get_skill(domain="apps", section="creative-design/references/frontend-design")` 确立视觉方向——它教你如何果断做出有意图、不落模板俗套的美学抉择：有品牌或既有 UI 时对齐现有视觉语言，从零起步时据主题 / 材料立一个契合的方向。当媒介专属 skill 内的指令与通用设计规则冲突时，以媒介 skill 内的指令为准——这是规则内容的优先级，不改变「该加载哪些 skill」。

当用户请你做高保真 UI mockup、界面设计或带多方案的视觉探索时，开始之前先加载 `lark_get_skill(domain="apps", section="creative-design/references/hi-fi-design")`——它涵盖了设计流程、获取设计上下文、提问以及呈现多个方案。

一次设计探索的输出是单个 HTML 文档。根据你所探索的内容选择呈现格式：

- **静态视觉 / 设计稿 / 多方案探索**（颜色、字体、单个元素、整屏 UI、流程关键帧）→ 把各方案铺陈在一个画布式布局上。本 MCP 环境不提供画布脚手架文件（画布外壳、artboard 组件），请直接手写画布布局，用内联 SVG/CSS 兜底。除非用户明确要求可点击 / 可交互，否则不要把设计稿升级成点击原型。
- **用户明确要求可交互的流程或产品 demo** → 将整个产品做成高保真可点击原型，并把关键选项以页内控件形式暴露出来。可交互原型不要用画布外壳包裹；它应该作为真实应用界面直接运行。

这两者可以组合，但只限静态设计探索。已经做好的**可交互原型**如果用户接着想探索多个方向，用页内开关、路由、Tabs 或模式切换承载变体；不要把交互原型放进画布外壳并排包裹。

当用户要求新版本或改动时，把它们作为页内可切换的变体加到原件上；拥有一个可切换不同版本开关的主文件，优于拥有多个文件。

## 默认美学指令

如果用户没给参考或艺术方向：能从主题、材料或场景推断出一个有把握、不会返工的视觉方向，就主动确定，并在设计中体现假设；如果推不出、又是从零起的项目，先用向用户提问的能力问清偏好的调性、受众、颜色、字体、情绪等再动手——不要在推不出方向时硬选，slop 就是这么来的。

定下视觉方向后（无论是推断还是问来的），创建设计时遵循以下指引：

- **字体与排版。** 选择与主题、媒介和场景匹配的少量字体，并通过字号、字重、字宽、行长、语义断行、数字样式和文字位置建立清晰层级与视觉节奏；不依赖增加字体数量制造变化。
- **背景与色彩体系。** 确定主色调，并建立与主题协调的中性基底、主题色和必要的章节／语义色。背景不局限于纯黑、纯白或单一色调，可以根据内容属性、页面角色和叙事节点使用不同色调、主题色底、局部色域、图片或图形背景。
- **色彩一致性。** 一致性来自共享色板、字体、栅格、图形语言和明确的颜色关系，不要求所有页面使用相同背景。颜色变化应帮助识别章节、信息层级和重点，避免无语义地逐页随机换色。
- **强调色。** 使用数量克制、关系协调的强调色，并根据背景、信息层级和色彩语义调整明度与彩度。图表、状态和章节色需要清楚可区分，但应属于同一视觉体系。
- **中性色。** 黑、白、灰可以带有与主题协调的细微色相，避免把纯黑白或低饱和配色作为所有专业场景的默认答案。
- **视觉复杂度。** 视觉丰富度应服务内容。不要添加无信息价值的装饰，也不要把"克制"理解为单调、大量留白、缺少图片图表或所有页面使用同一种构图。

关键：如果已给出其他美学指令（如参考图、品牌体系、设计规范或媒介专属 skill），或项目中已有文件，则完全忽略默认美学。

## 图像素材与外部信息

图片素材能显著提升产物的美观度与丰富度——不要默认只用纯 CSS/SVG 撑起全部视觉。为氛围、质感和视觉节奏而配图是正当用途。但本 MCP 环境没有内置的 AI 生图 / 图片搜索工具，处理方式如下：

- **AI 生图（生成 hero 图、插画、氛围背景、信息图等）**——本环境不提供 `generate_image` 类工具。会话中若接入了图像生成 MCP/工具则使用；否则跳过 AI 生图，用内联 SVG / CSS 图形兜底，并在交付说明中注明。
- **图片搜索（真实存在的实物、产品、地点、人物、logo、参考图）**——本环境不提供 `search_images` 类工具。若消费方 agent 具备网页搜索 / 抓取能力（WebSearch / WebFetch），可用其检索图片并注意来源与版权；没有就跳过并注明。
- **联网搜索（真实事实、数据、案例、时效性信息）**——内容需要真实事实、数据、案例时，用当前环境的网页搜索 / 抓取能力（若有）先搜再写，不要编造（见「内容准则」）。调研型产出要先把事实、数字与来源收集齐并标注出处，再进入设计；没有联网能力时向用户说明并请其提供资料。
- **视频素材**——需要嵌入公开视频时，用当前环境的网页能力找到可公开访问的视频页面或可嵌入链接，以 `<iframe>` / `<video>` 嵌入并注明来源；不要下载搬运版权内容，也绝不虚构视频 URL——找不到合适的就如实告知用户并留占位。

约束：

- 配图要属于同一视觉体系——风格、色调、光线与已确立的视觉方向一致，宁可少而统一，不要多而杂乱；逐张风格漂移比没有图更伤美观度。
- 用户已提供图片 / 品牌素材时优先使用，不要擅自替换。
- 搜索到 / 生成的图片先落到本地，再用 `lark_apps_file_upload(app_id="<app_id>", file="<local_path>")` 上传，代码中引用返回的**远端 URL**——不要提交 git、不要引用本地路径、不要 base64 内联，也不要直接热链搜索结果页的原始 URL（可能防盗链或失效）。上传需要 `app_id`，任务尚未初始化时先按「发布」前提完成 `lark_apps_create` / `lark_apps_init` 两步。

## 输出创建准则

- **文件输出路径**：会话根目录下会并存多个任务。**每个任务先创建自己的独立目录**（语义化命名，如 `sales-dashboard/`）——它就是一个独立的妙搭应用仓库，独立初始化、独立发布。所有交付物写进本任务目录，主 HTML 入口是该目录下的 `index.html`。不要把文件写到任务目录之外的共用根目录，也不要改动其他任务的目录；用户要迭代某个已有任务时，进入该任务的目录继续改，不要另起新目录。
- 对文件做重大修订时，先复制再编辑，以保留旧版本（如 index.html、index v2.html 等）。
- 始终避免写大文件（>1000 行）。而应把代码拆成若干更小的 JSX 文件，最后在主文件里 import 进来。这让文件更易管理和编辑。
- 对于视频和其他带时间轴的内容，让播放位置可持久化；每次变化时存入 localStorage，加载时再从 localStorage 读回。这样用户刷新页面时不会丢失当前位置，而刷新在迭代设计中很常见。
- 在既有 UI 上做增补时，先理解该 UI 的视觉语汇并遵循它。对齐文案风格、配色、语气、hover/click 状态、动画风格、阴影＋卡片＋布局模式、密度等。把你观察到的东西"出声想一想"会有帮助。
- 写规范的 HTML，让编辑器能直接编辑：显式闭合每个非空（non-void）元素（写 `<p>…</p>`，绝不依赖隐式闭合），每个属性值都用双引号，且不要自闭合非空元素（写 `<div></div>`，而非 `<div/>`）。这有助于直接编辑功能正常工作。
- 绝不使用 `scrollIntoView`——它可能搞乱 web app。如有需要，改用其他 DOM 滚动方法。
- **颜色使用：** 有品牌色时优先沿用品牌体系；没有品牌或既有配色时，根据主题、受众、内容语义和视觉方向推导协调色板。避免随意加入彼此无关的颜色，不要默认退回纯黑白。对于数据图表和信息图，颜色应承担区分、强调或表达语义的作用，并保证足够对比。
- **Emoji：** 不要在生成的代码中使用 emoji 字符——不作图标、不作装饰、不放进数据里。例外：仅当用户的品牌资产明确包含 emoji 时。
- **图标：** 系统图标规则仅适用于需要界面图标体系的 UI 或交互原型。在这类产物中，使用手写内联 SVG（`<svg viewBox="0 0 24 24">`）建立语义贴切、风格连贯的图标语言。
- **字体加载：** 需要 Google Fonts / web 字体时，一律从自托管镜像 `https://miaoda.feishu.cn/fonts/css2` 加载，不要直连 `fonts.googleapis.com` / `fonts.gstatic.com`——这两个 Google CDN 在部分地区慢、甚至连不上，会导致字体加载失败、页面回退到系统字体。镜像是 Google Fonts `css2` 端点的直接替代：查询语法完全一致（`?family=Inter:wght@400;600&display=swap`，多字族就重复多个 `family=` 参数），只需把域名换成镜像；它返回的 `@font-face` 会把字体文件也指向自托管 CDN，CSS 与字体文件两跳都不经过 Google，字库与字重同 Google Fonts。照常用 `<link rel="stylesheet" href="https://miaoda.feishu.cn/fonts/css2?family=…&display=swap">` 引入即可。

## 内容准则

**内容取舍。** 不添加与用户目标无关或没有依据的内容。在用户明确的范围内，可以重组、解释和补足完成叙事所需的信息；涉及新增事实、数据或任务范围时，再向用户确认或明确为示例。内容不足以独立成页时，应合并、重构或请求材料，不用放大元素和增加留白勉强撑页。

**数据保真。** 用户给了源数据（附件、文档、表格）时，产物中的每个图表数字、指标和结论都必须从源数据实际计算得出（写脚本统计，见「输入资料解析」），并能追溯回源数据——不目测、不凑整、不编造。做数据报表/看板前加载 `lark_get_skill(domain="apps", section="creative-design/references/data-report")`，其中的数据准则同样适用。

**硬性规格是约束，不是建议。** 用户给定的页数/张数范围、画幅比例、结构大纲、预算上限、必须包含的表格或模块，逐条对照满足，交付前自查一遍。

**使用恰当的尺度：** 对于 1920x1080 的幻灯片，文字绝不应小于 24px；理想情况下要大得多。打印文档最小 12pt。移动端 mockup 的点击目标绝不应小于 44px。

**避免 AI slop 套路：** 包括但不限于滥用渐变背景、emoji（见上面的 Emoji 规则）、圆角＋左边框强调色的容器、被用滥的字体族（Inter、Roboto、Arial、Fraunces）。

**CSS**：`text-wrap: pretty`、CSS grid 以及其他高级 CSS 效果都是你的好帮手！

**强烈倾向用带 `gap` 的 flex/grid，而非 inline 流。** 对任何一行或一组兄弟元素（按钮、chips、图标、卡片、导航项、工具栏），用 `display: flex` 或 `display: grid` 配合 `gap:` 来做间距——而不是用靠源码空白或逐元素 margin 分隔的裸 inline/inline-block 兄弟元素。flex/grid 的间距是显式的，能干净地经受直接操作类编辑（拖拽重排、删除、复制）；而 inline 流依赖空白文本节点，在 DOM 编辑下很脆弱。把 inline 流留给句子中偶尔夹带 `<a>`/`<strong>`/`<em>` 的文字段落——不要用它来排布 UI 元素。

## 保留评论锚点

某些源元素带有 `data-comment-anchor="…"` 属性。它把用户的评审评论钉在该元素上。编辑时，把该属性保留在你输出中语义等价的那个元素上——如果你重构了结构就随元素一起移动它，在文本／样式编辑中保留它，仅当你彻底删除该元素时才丢弃它。绝不发明新值，也不要把它复制到其他元素上。

## 为幻灯片和屏幕打标签以提供评论上下文

在代表幻灯片和高层级屏幕的元素上加 `[data-screen-label]` 属性；这样你就能分辨用户的评论是针对哪一张幻灯片或哪一屏。
当用户说"slide 5"或"index 5"时，他们指的是第 5 张幻灯片（标签"05"），而绝非数组下标 `[4]`——人类不按 0 起始计数。

## React + Babel（浏览器内 JSX）

当用浏览器内 JSX 编写 React 原型（无构建步骤——Babel 在运行时转译）时，你必须使用下面这些锁定版本的确切 script 标签。不要使用未锁定版本（例如 react@18）。本 MCP 环境不提供起步模板文件，请手写下面这三个 script 标签和一个 `#root` 挂载点：

```html
<script src="https://sf3-scmcdn-cn.feishucdn.com/obj/feishu-static/miaoda/coding-unpkg-sdk/react@18.3.1/umd/react.development.js" crossorigin="anonymous"></script>
<script src="https://sf3-scmcdn-cn.feishucdn.com/obj/feishu-static/miaoda/coding-unpkg-sdk/react-dom@18.3.1/umd/react-dom.development.js" crossorigin="anonymous"></script>
<script src="https://sf3-scmcdn-cn.feishucdn.com/obj/feishu-static/miaoda/coding-unpkg-sdk/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>
```

发布前需要对以上 script 路径进行自检，确保它们路径与上述代码完全一致。

### 脚本导入

用 script 标签导入你写的任何辅助脚本或组件脚本。`.jsx` 文件必须用 `<script type="text/babel" src="xxx.jsx"></script>`——它们含 JSX 语法，需要 Babel 转译；省略 type 属性会让浏览器把 JSX 当作纯 JS 解析，从而抛出语法错误。纯 `.js` 文件可以用普通的 `<script src="xxx.js"></script>`。避免在脚本导入上使用 `type="module"`——它可能会出问题。

**加载顺序**：`@babel/standalone` 用异步 XHR 拉取外部 `<script type="text/babel" src="...">` 文件，但保证按 DOM 顺序执行——靠前的脚本总在靠后的脚本之前运行。然而，内联脚本（无 `src`）会立即就绪，而外部脚本必须等待网络响应。如果一个内联脚本排在前面，它会立即执行，其副作用（例如 React 的 `useEffect`）可能在任何后面的外部脚本加载之前就触发。把外部脚本放在依赖它们的内联脚本之前。

### 跨文件作用域

每个 `<script type="text/babel">` 在转译后都有自己独立的作用域。要在文件间共享组件，在组件文件末尾把它们导出到 `window`：

```js
// 在 components.jsx 末尾：
Object.assign(window, {
  Terminal, Line, Spacer,
  Gray, Blue, Green, Bold,
  // ... 所有需要共享的组件
});
```

### 样式对象命名

定义全局作用域的样式对象时，给它们起具体的名字。如果你导入了 1 个以上带 `styles` 对象的组件，就会出问题。你必须基于组件名给每个 styles 对象起唯一的名字，比如 `const terminalStyles = { ... }`；或者用内联样式。绝不要写 `const styles = { ... }`。

### 动画

视频风格 / 带时间轴的 HTML 产物需要一个动画时间轴引擎。本 MCP 环境不提供 `animations.jsx` 脚手架文件，请直接手写动画时间轴（Stage + Sprite + scrubber + Easing 之类的结构，或用 CSS 动画），animated-video 专用指南在本环境不可用。对于简单的交互原型过渡，CSS transitions 或纯 React state 就够了。

### 原型

- 克制住加"标题"屏的冲动；让你的原型在视口中居中，或做成响应式尺寸（填满视口并留合理边距）。

## 手写组件（脚手架替代）

上游随附一批现成的 HTML/JS/JSX 脚手架（scaffold），**本 MCP 环境不提供这些文件，请直接手写对应组件**（设备外框 / 画布 / deck 外壳 / 动画时间轴），用内联 SVG/CSS 兜底。需要时按下列意图自己实现：

- 画布：可平移／缩放的画布，方案卡片可重排、可全屏聚焦。
- deck 外壳：幻灯片 deck 外壳（用于任何幻灯片演示；make-a-deck 专用指南在本环境不可用，按本 guide 通用方法手写）。
- 设备边框：带状态栏和键盘的 iOS / Android 设备框。
- 页内控件面板：浮动的控件面板（颜色、字体、间距、文案、布局变体等表单控件）。
- 桌面窗口外壳：macOS 窗口 / 浏览器窗口 chrome。
- 动画引擎：基于时间轴的动画引擎（Stage + Sprite + scrubber + Easing）。

## 页内变体控件

用户可能希望从工具栏切换一个页内控件面板（颜色、字体、间距、文案、布局变体）。本 MCP 环境不提供控件面板脚手架，请直接手写该面板并接好状态。这个面板的标题按界面语言来定——英文叫"Tweaks"，中文叫"风格"。把它保持小巧，关闭时完全隐藏，并且即使用户没要求，也默认加上几个有品味的变体开关。你写在面板里的标签和选项是用户会读到的内容，而非配置——用与 app 其余部分相同的语言书写。

**闭环。** 每个变体开关都需要一个生产者（面板控件）和一个消费者（对该值作出反应的内容）。只存在于面板和默认值里的值不会改变设计中的任何东西——用户看到控件有反应，但原型纹丝不动。

## 发布

设计产物写完并提交后，需要发布到妙搭（lark-apps）才能拿到可访问链接。本 guide 产出的是创意模式（html）应用，发布走本地开发链路：改动 git commit 后推到工作分支 `sprint/default`，再用 `lark_apps` 工具发起部署并轮询结果。

**前提**：每个任务目录是一个独立的妙搭 html 应用仓库，独立发布、互不影响；发布序列的所有命令都在**当前任务目录**内执行。任务目录还不是应用仓库（没有 `.spark/meta.json`）时，先完成两步初始化：

```
# 1. 创建应用，记下返回的 app_id（app_ 开头）
lark_apps_create(name="<应用名>", app_type="html")

# 2. 初始化到任务目录：会自动 clone 远端仓库并 checkout 工作分支 sprint/default，
#    无需 git init / git checkout（dir 不传默认 ./<app-id>）
lark_apps_init(app_id="<app_id>", dir="<任务目录>")
```

初始化后在任务目录内创建 / 修改产物（创意模式是 buildless，源码即产物，`index.html` 放仓库根目录），然后走下方发布序列。

`app_id`（`app_` 开头）从任务目录的 `.spark/meta.json` 读取，或来自 `lark_apps_create` 的返回 / 用户给出——`cli_` 开头的是飞书应用 ID，绝不能传给 `lark_apps_*` 工具。资源型文件（图片、字体、音视频）不要提交 git、不要引用本地路径、也不要 base64 内联；先用 `lark_apps_file_upload(app_id="<app_id>", file="<local_path>")` 上传拿远端 URL 再在代码里引用（见「图像素材与外部信息」）。

发布序列：

```bash
# 1. 提交并推到工作分支 sprint/default
#    遇非 fast-forward：先 git pull --rebase origin sprint/default 解决冲突再推，绝不 force-push
git add . && git commit -m "feat: ..." && git push origin sprint/default
```

```
# 2. 发起部署（记下返回的 release_id），然后轮询状态直到 finished / failed：
#    publishing → 继续轮询；finished → 输出含可分享的 online_url，直接返回给用户；failed → 按输出中的 error_logs 报告失败原因
lark_apps_release_create(app_id="<app_id>")
lark_apps_release_get(app_id="<app_id>", release_id="<release_id>")
```

要点：

- 所有 git 命令必须在**任务仓库根目录**下执行（每条命令先 `cd <任务目录>`，或用 `git -C <任务目录>`）——`git add .` 作用于当前 cwd，在多任务共用的上级根目录里执行会把其他任务的文件也 stage 进来。
- 推送和部署的分支必须是 `sprint/default`：推到其他分支，`lark_apps_release_create` 会失败。
- `lark_apps_release_create` 部署的是远端 `sprint/default` 上**已 push** 的代码，不是本地工作区——未 commit / 未 push 的改动不会进入这次发布。
- 完成 ≠ 发布：产物生成完、或 `lark_apps_list` 显示 `is_published=true`，都不代表最新内容已上线；必须拿到本轮 `lark_apps_release_get` 返回的 `finished` 才算发布成功。
- 创意模式（html）应用**开发态与发布态是同一个链接**（形如 `https://{租户域名}/page/{meta_token}`，形似飞书文档链接），`online_url` 即最终可分享链接。
- 任何 git 操作（push / pull / clone）报认证失败、401/403、credential helper 缺失或 token 过期时，先用 `lark_apps_git_credential_init(app_id="<app_id>")` 刷新本地 Git 凭证，再重试原 git 命令；刷新凭证也失败就停下向用户报告错误，不要改走其他发布路径（尤其不要用 `lark_apps_html_publish`）。

## 媒介技能

如果用户的需求与某个媒介技能匹配，而对应的 prompt 尚未加载进你的上下文，就用 `lark_get_skill` 加载它。本 MCP 环境收录的媒介 prompt：

- **Charts** — `lark_get_skill(domain="apps", section="creative-design/references/charts")`。基于 ECharts 的数据可视化，用于浏览器直出 HTML。触发词：chart, ECharts, 图表, 可视化, 饼图, 柱状图, 折线图, 甘特图, 热力图, dashboard, 仪表盘, 数据看板
- **Data report** — `lark_get_skill(domain="apps", section="creative-design/references/data-report")`。数据驱动的报表与看板设计。触发词：数据报表, 数据看板, BI, 经营报表, 指标看板, 周报, 月报, KPI, 报表设计
- **Frontend design** — `lark_get_skill(domain="apps", section="creative-design/references/frontend-design")`。为新建或重塑 UI 确立独特、有意图的视觉方向。
- **Hi-fi design** — `lark_get_skill(domain="apps", section="creative-design/references/hi-fi-design")`。用于创建高保真 UI mockup、设计探索，或带多种变体的视觉原型。触发词：mockup, hi-fi, prototype, UI design, 高保真, 设计稿, 原型, 界面设计
- **Visual exposure** — `lark_get_skill(domain="apps", section="creative-design/references/visual-exposure")`。用于制作可视化报告、专题视觉页、信息图、视觉长图、概念可视化、能力曝光等内容型 HTML 视觉作品。触发词：可视化报告, 视觉报告, 信息图, 长图, infographic, 亮点展示, 能力曝光
- **Wireframe** — `lark_get_skill(domain="apps", section="creative-design/references/wireframe")`。用线框图和故事板探索多种想法。触发词：wireframe, storyboard, 线框图, 故事板, 分镜, 草图, 低保真, 方案探索

以下媒介 prompt 本 MCP server **未收录**：Make a deck（幻灯片 deck）、Interactive prototype（可交互原型）、Animated video（动画视频）。遇到这些场景时，按本 guide 的通用设计方法直接手写实现（deck 用 1920×1080 的自包含 HTML；可交互原型作为真实应用界面直接运行、用 React state 管理交互；动画视频手写时间轴或用 CSS 动画），并向用户说明该专用指南在本环境不可用。

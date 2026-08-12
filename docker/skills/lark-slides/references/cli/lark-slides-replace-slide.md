# slides +replace-slide（块级替换 / 插入）

对指定 slide 做块级替换或插入。编辑已有 PPT 的主路径——`slide_id` 不变、页序不动、只影响被指定的块。

> **编写 `parts` 时只使用标准 action 和字段**：`block_replace` 使用 `block_id` + `replacement`，`block_insert` 使用 `insertion`（可选 `insert_before_block_id`）。不要根据其他 API 或自然语言猜 action、字段名；具体结构以本文表格为准。

相比直接调原生 `xml_presentation.slide.replace`，这个工具的额外价值：

1. `presentation` 接受 `xml_presentation_id` / `/slides/` URL / `/wiki/` URL（wiki 自动解析）；
2. `block_replace` 的 `replacement` 根元素 `id="<block_id>"` 自动注入；
3. `<shape>` 元素缺少 `<content/>` 子元素时自动注入；
4. 3350001 错误时提供上下文感知的 hint。

## 用法

```
# block_insert：在页末追加一个新元素
lark_slides_replace_slide(presentation="slidesXXX", slide_id="pfG", parts='[{"action":"block_insert","insertion":"<shape type=\"rect\" topLeftX=\"500\" topLeftY=\"100\" width=\"200\" height=\"100\"/>"}]')

# block_replace：已知某块 id，整块替换
lark_slides_replace_slide(presentation="slidesXXX", slide_id="pfG", parts='[{"action":"block_replace","block_id":"bUn","replacement":"<shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新标题</p></content></shape>"}]')

# wiki URL 直接传
lark_slides_replace_slide(presentation="https://xxx.feishu.cn/wiki/wikcnXXXXXX", slide_id="pfG", parts='[{"action":"block_insert","insertion":"<shape type=\"rect\" width=\"100\" height=\"100\"/>"}]')
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `presentation` | 是 | `xml_presentation_id`、`/slides/<token>` URL，或 `/wiki/<token>` URL |
| `slide_id` | 是 | 页面 ID（`lark_invoke(tool_name="lark_slides_xml_presentation_slide_get")` / `lark_slides_xml_get` 都能拿到） |
| `parts` | 是 | JSON 数组（`[{...}, ...]`），单次最多 200 条。支持 `@<file>` 和 `-`（stdin）读取 |
| `revision_id` | 否 | 基础版本号；默认 `-1` 表示基于最新版执行 |
| `tid` | 否 | 并发事务 ID；单次单人调用留空 |

## parts 元素结构

### action = `block_replace`

| 字段 | 必填 | 说明 |
|------|------|------|
| `action` | 是 | `"block_replace"` |
| `block_id` | 是 | 目标块的 3 位 short element ID（从 `slide.get` 返回 XML 里读） |
| `replacement` | 是 | 新 XML 片段；**根元素 `id` 会自动注入为 `block_id`** |

### action = `block_insert`

| 字段 | 必填 | 说明 |
|------|------|------|
| `action` | 是 | `"block_insert"` |
| `insertion` | 是 | 要插入的 XML 片段 |
| `insert_before_block_id` | 否 | 插到这个块之前；省略则追加到页末 |

### 错误字段名（直接被拒）

编写 part 时只使用上表中的标准字段。返回 unknown field 时会点名写错的字段，并按情况给出下一步：能对上正确字段时直接建议它（`did you mean "replacement"?`），字段属于另一个 action 时说明归属（`it belongs to block_insert`），都对不上时列出该 action 的合法字段集。无论哪种，**要改的是字段名，不是字段值**。

```jsonc
// ❌ 全部被拒
[{"action":"block_replace","block_id":"bUn","xml":"<shape.../>"}]           // unknown field "xml"; did you mean "replacement"?
[{"action":"block_replace","block_id":"bUn","data":"<shape.../>"}]          // data 不是标准字段
[{"action":"block_replace","block_id":"bUn","insertion":"<shape/>"}]        // insertion 属于 block_insert
[{"action":"block_replace","block_id":"bUn","replacement":{"type":"..."}}]  // replacement 必须是字符串，报 .replacement must be a string

// ✅ 正确
[{"action":"block_replace","block_id":"bUn","replacement":"<shape type=\"text\"><content><p>新内容</p></content></shape>"}]
[{"action":"block_insert","insertion":"<shape type=\"rect\" width=\"100\" height=\"100\"/>"}]
```

## 返回值

```json
{
  "xml_presentation_id": "slidesXXX",
  "slide_id": "pfG",
  "parts_count": 1,
  "revision_id": 102
}
```

整批作为原子事务：任一 part 失败则整批不生效。

## 常见错误

| 现象 | 原因 | 对策 |
|------|------|------|
| 3350001 + hint "block_id not found" | `parts[i].block_id` 在当前页不存在 | 重新 `slide.get` 拿最新 XML |
| 3350002 not found | `revision_id` 传了不存在的版本号 | 用 `-1` 或有效值 |
| `parts invalid JSON` | JSON 本身不完整，或引号 / 转义被破坏 | 确认 `parts` 是一个完整合法的 JSON 数组字符串，内层 XML 的引号只转义一层 |
| `parts[i] action "page_replace" / "slide_replace" means whole-page replacement` | 把整页更新意图传给了块级工具 | 改用 `lark_slides_update_slide` 整页原地写回 |
| `parts[i] unknown field "xml"; did you mean "replacement"?` | XML 塞进了未支持的字段名（如 `xml` / `new_xml` / `data`） | 使用标准字段：`block_replace` 用 `replacement`，`block_insert` 用 `insertion` |
| `parts[i] unknown field "insertion"; it belongs to block_insert` | 字段和 `action` 不配对 | 按 action 取字段：`block_replace` = `block_id` + `replacement`；`block_insert` = `insertion` (+ `insert_before_block_id`) |
| `parts[i] (block_replace) requires non-empty block_id` / `replacement` | 字段名对，但值缺失或是空串 | 按 parts 元素结构补齐值 |
| `parts contains N items, exceeds maximum of 200` | 一次提交 parts 太多 | 拆多次调用 |
| `<img>` 不显示 / 显示破图 | `src` 写了外链 URL | 换成通过 `lark_slides_media_upload` 拿到的 `file_token` |

## 参考

- `lark_get_skill(domain="slides", section="cli/lark-slides-xml-presentation-slide-get")` — 读原页拿 `block_id`
- `lark_get_skill(domain="slides", section="cli/lark-slides-media-upload")` — 上传图片拿 `file_token`
- `lark_get_skill(domain="slides", section="workflow/slides-editing")` — 读-改-写闭环

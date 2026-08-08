# slides +replace-slide（块级替换 / 插入）

对指定 slide 做块级替换或插入。编辑已有 PPT 的主路径——`slide_id` 不变、页序不动、只影响被指定的块。

> **`parts` 字段名是硬约束**：装 XML 片段的字段，`block_replace` 只认 `replacement`，`block_insert` 只认 `insertion`（都是字符串）。`content` / `xml` / `new_xml` / `block_xml` / `block` / `element` / `data` 这些写法，以及任何其他字段名，**一律被直接拒绝**——常见的错法会直接告诉你该用哪个字段（`unknown field "content"; did you mean "replacement"?`），其余只列出该 action 的合法字段集。`<content>` 是 `<shape>` 的**子元素**，不是 part 的字段名——这是最常见的搞混点。

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

part 里出现上表以外的字段一律报错，不会被静默忽略。报错总会点名写错的那个字段，并按情况给出下一步：能对上正确字段时直接建议它（`did you mean "replacement"?`），字段属于另一个 action 时说明归属（`it belongs to block_insert`），都对不上时列出该 action 的合法字段集。无论哪种，**要改的是字段名，不是字段值**。

```jsonc
// ❌ 全部被拒
[{"action":"block_replace","block_id":"bUn","content":"<p>...</p>"}]        // unknown field "content"; did you mean "replacement"?
[{"action":"block_replace","block_id":"bUn","xml":"<shape.../>"}]           // 同上（new_xml / block_xml / element / data 一样）
[{"action":"block_replace","block_id":"bUn","block":{"content":"..."}}]     // 不能把内容嵌一层 block
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
| `parts[i] unknown field "content"; did you mean "replacement"?` | XML 塞进了不存在的字段名（`content` / `xml` / `block` / `data` 等） | 只改字段名：`block_replace` 用 `replacement`，`block_insert` 用 `insertion`；报错自带一行正确写法的 hint |
| `parts[i] unknown field "insertion"; it belongs to block_insert` | 字段和 `action` 不配对 | 按 action 取字段：`block_replace` = `block_id` + `replacement`；`block_insert` = `insertion` (+ `insert_before_block_id`) |
| `parts[i] (block_replace) requires non-empty block_id` / `replacement` | 字段名对，但值缺失或是空串 | 按 parts 元素结构补齐值 |
| `parts contains N items, exceeds maximum of 200` | 一次提交 parts 太多 | 拆多次调用 |
| `<img>` 不显示 / 显示破图 | `src` 写了外链 URL | 换成通过 `lark_slides_media_upload` 拿到的 `file_token` |

## 参考

- `lark_get_skill(domain="slides", section="xml-presentation-slide-get")` — 读原页拿 `block_id`
- `lark_get_skill(domain="slides", section="media-upload")` — 上传图片拿 `file_token`
- `lark_get_skill(domain="slides", section="edit-workflows")` — 读-改-写闭环

# 编辑已有 PPT：读-改-写闭环

局部编辑走 **shortcut `lark_slides_replace_slide`**（块级替换 / 插入），配合 `lark_invoke(tool_name="lark_slides_xml_presentation_slide_get", ...)` 读原页拿 `block_id`。已有 Slides 的多页整页重建走 **`lark_slides_replace_pages`**，保持原 presentation 链接不变。

> 生成 XML 前**必读** `lark_get_skill(domain="slides", section="xml-schema-quick-ref")`。

## 决策树：block_replace vs block_insert

| 需求 | 推荐 action | 理由 |
|------|------------|------|
| 已知某块的 `block_id`，要换这块内容（改标题、换图、挪坐标） | `block_replace` | 精准替换，原子性好；`replacement` 根 `id` 自动注入为 `block_id` |
| 只加 1~N 个元素、不动现有布局 | `block_insert` | 新增不覆盖，可选 `insert_before_block_id` 指定位置 |
| 一次动多个元素（如：换标题 + 加图） | 单次 `parts` 里拼多条 | 整批作为原子事务，任一失败整批不生效；`block_replace` 和 `block_insert` 可混用 |
| 多页版式重建、整页坐标重排 | `lark_slides_replace_pages` | 原 presentation 内批量 create-before/delete-old，不生成新 Slides 链接 |

> **没有字段级 patch**：即便只想改一个 `shape` 的 `topLeftX`，也得把整个块的新 XML 写出来用 `block_replace`。这不是"微调"，是块级重写。

## 最小读-改-写闭环

```
PID = "xml_presentation_id_here"
SID = "slide_id_here"

# 1. 读原页，从 XML 里挑出要改的块的 3 位 short id（如 bUn / bab）
lark_invoke(tool_name="lark_slides_xml_presentation_slide_get", args={params: {"xml_presentation_id": PID, "slide_id": SID}})

# 2. 用 +replace-slide 直接改那个块（不需要搬原 XML）
lark_slides_replace_slide(presentation=PID, slide_id=SID, parts='[{"action":"block_replace","block_id":"bUn","replacement":"<shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新标题</p></content></shape>"}]')
```

`slide_id` / 页序不会变。`block_replace` 的 `replacement` 根元素 `id` 会自动注入为 `block_id`。

## `revision_id` 参数

`revision_id` 默认 `-1`，表示基于当前最新版执行。传具体版本号时，服务端以该版本为 base 应用变更。

注意：传不存在的版本号（超过当前 revision）会返回 3350002 not found；不确定时用 `-1` 即可。

## 两种 action 详解

### block_replace — 整块替换

适合"已知块 ID，要换这块整体内容"的场景。`replacement` 根元素的 `id="<block_id>"` 自动注入。

```
lark_slides_replace_slide(presentation=PID, slide_id=SID, parts='[{"action":"block_replace","block_id":"bab","replacement":"<shape type=\"text\" topLeftX=\"80\" topLeftY=\"80\" width=\"800\" height=\"120\"><content textType=\"title\"><p>新标题</p></content></shape>"}]')
```

### block_insert — 整块插入

适合"只想加一个元素，不动现有元素"的场景（典型：给已有页加图）。

```
# 先上传图片拿 file_token
lark_slides_media_upload(file="./pic.png", presentation=PID)

# 再 block_insert
lark_slides_replace_slide(presentation=PID, slide_id=SID, parts='[{"action":"block_insert","insertion":"<img src=\"<file_token>\" topLeftX=\"500\" topLeftY=\"100\" width=\"200\" height=\"150\"/>"}]')
```

> **`<img>` 必须用 `file_token`**，不能用外链 URL——先用 `lark_slides_media_upload` 拿 token。

### 批量 parts

一次 `parts` 最多 200 条，按数组顺序串行执行。`block_replace` 和 `block_insert` 可以在同一批次混用。

整批作为原子事务：任一条失败整批不生效。

## 错误排查

| 现象 | 原因 | 对策 |
|------|------|------|
| 3350001，hint 含 "block_id not found" | `parts[i].block_id` 在当前页不存在 | 重新 `slide.get` 拿最新 XML |
| 3350002 not found | `revision_id` 传了不存在的版本号 | 用 `-1` 或实际存在的 `revision_id` |
| `<img>` 不显示 / 显示破图 | `src` 写了外链 URL | 换成通过 `lark_slides_media_upload` 拿到的 `file_token` |

## 相关文档

- `lark_get_skill(domain="slides", section="replace-slide")` — +replace-slide 参数详情
- `lark_get_skill(domain="slides", section="replace-pages")` — 多页整页重建 shortcut
- `lark_get_skill(domain="slides", section="xml-presentation-slide-get")` — slide.get 参考
- `lark_get_skill(domain="slides", section="media-upload")` — 上传图片拿 file_token
- `lark_get_skill(domain="slides", section="xml-schema-quick-ref")` — XML 元素和属性速查

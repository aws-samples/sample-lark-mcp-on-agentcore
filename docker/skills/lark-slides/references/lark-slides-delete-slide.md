# slides +delete-slide（按 slide_id 删除单页）

从演示文稿删除**一页**，按 `slide_id` 指定。只改一页里的局部内容用 `lark_slides_replace_slide`（`lark_get_skill(domain="slides", section="replace-slide")`），不要删了重建。

`presentation` 接受 token / `/slides/` URL / `/wiki/` URL，ID 是普通参数而不是 `params` JSON 串。

> `slide_id` 只接受单个 ID —— 不支持逗号分隔的列表（`lark_slides_screenshot` 的 `slide_id` 支持，这个不支持），也不支持按页号删。

## 用法

```
# 直接传 xml_presentation_id
lark_slides_delete_slide(presentation="<PID>", slide_id="<SID>")

# slides URL / wiki URL 都可以（wiki 会自动解析并校验 obj_type=slides）
lark_slides_delete_slide(presentation="https://xxx.feishu.cn/wiki/wikcnXXXXXX", slide_id="<SID>")
```

## 参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `presentation` | 是 | `xml_presentation_id`、`/slides/` URL 或 `/wiki/` URL |
| `slide_id` | 是 | 要删除的页面 ID |
| `revision_id` | 否 | 演示文稿版本号，默认 `-1`（最新）；传具体版本号做乐观锁 |

## 成功输出

```json
{
  "xml_presentation_id": "slides_example_presentation_id",
  "slide_id": "slide_example_id",
  "deleted": true,
  "revision_id": 43
}
```

## 怎么拿 `slide_id`

`slide_id` 是服务端短 ID，**不能从 XML 里推导**。两个来源：

1. `lark_slides_create` / `lark_slides_add_slide` 的返回值里存下来；
2. 事后回读：`lark_slides_xml_get(presentation="<PID>", output=".lark-slides/plan/<deck>/readback.xml")`。

删错页的代价高于多跑一次回读 —— 不确定就先回读 + `lark_slides_screenshot` 看一眼再删。

## 删错了怎么办

删除在原地不可撤销，但可以走历史版本回滚：`lark_slides_history_list` 找 `history_version_id` → `lark_slides_history_revert`（只接受 `history_version_id`，不能传 `revision_id`）→ `lark_slides_history_revert_status` 轮询。用法见 `lark_get_skill(domain="slides", section="history")`。

## 常见错误

| 现象 | 原因 | 解决 |
|------|------|------|
| `--slide-id cannot be empty` | 传了空串或纯空格 | 检查 `slide_id` 有没有取到值 |
| 3350001 `invalid param` | `slide_id` 写错或该页已被删 | 用 `lark_slides_xml_get` 回读确认 `slide_id` 还在 |
| 403 / 权限不足 | 当前身份对这份 PPT 没有编辑权限 | 检查是否拥有 `slides:presentation:update` 或 `slides:presentation:write_only` scope；wiki 链接另需 `wiki:node:read` |

## 相关命令

- `lark_get_skill(domain="slides", section="add-slide")` — 追加/插入单页
- `lark_get_skill(domain="slides", section="history")` — 历史版本回滚（误删恢复）
- `lark_slides_xml_get`（`lark_get_skill(domain="slides", section="xml-presentations-get")`） — 回读全文 XML 确认 `slide_id`

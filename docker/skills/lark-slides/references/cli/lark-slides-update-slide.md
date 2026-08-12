# slides +update-slide（整页更新已有页面）

把一整页 XML 交给某个已有页面，页面变成 `content` 描述的样子。`slide_id` 和页序都不变。

## 命令

```
# 标准用法：整页 XML 作为字符串传入
lark_slides_update_slide(presentation="https://xxx.larkoffice.com/slides/SCtZ...ynae", slide_id="piy", content="<slide id=\"piy\">…</slide>")

# wiki 链接直接传（自动解析并校验 obj_type=slides）
lark_slides_update_slide(presentation="https://xxx.larkoffice.com/wiki/wikcn...", slide_id="piy", content="<slide id=\"piy\">…</slide>")
```

## 参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `presentation` | 是 | `xml_presentation_id`、`/slides/` URL 或 `/wiki/` URL |
| `slide_id` | 是 | 要整页替换的页面 `slide_id` |
| `content` | 是 | 这一页的完整目标 XML，单一 `<slide>` 根 |
| `revision_id` | 否 | 默认 `-1`（最新）。它只选择服务端执行所基于的快照，不是"页面有新编辑就拒绝"的乐观锁；传旧版本号会以旧快照重建页面并丢弃其后的编辑 |
| `tid` | 否 | 调用方提供的任务/事务标识，原样透传；用于关联同一编辑任务或重试，不等同于版本前置条件，不能单独保证并发冲突时拒绝写入。一般留空 |

如果要求"从读取之后页面一旦变化就不再写入"，不能只传 `revision_id` 或 `tid`。写入前必须再次用 `lark_slides_xml_get` 回读最新版，比较读取期间是否发生变化；有变化时先基于最新版重新合并本次修改，再执行整页写回。本工具不提供严格的 compare-and-swap 保证。

## 语义：`content` 就是这一页的最终状态

**没写进 `content` 的东西会从页面上消失。** 这不是补丁，是整页覆盖。

| 你在 `content` 里怎么写 | 页面上的结果 |
|---|---|
| 元素带原来的 `id` | 按新 XML 更新这个元素 |
| 元素不带 `id` | 作为新元素插入到它所在的位置 |
| 原来有、`content` 里没有的元素 | **删除** |
| `<style>` 改了 | 背景等页面样式跟着改 |
| 没写 `<note>` | 讲者备注被清空 |

一次调用就能同时做完改样式、插入、删除、换备注、换背景——这是 `lark_slides_replace_slide` 逐元素 part 做不到的（它没法寻址背景，也没有 move 操作）。

## 标准读-改-写流程

```
# 1. 读回当前页（拿到带 id 的完整 XML）
lark_slides_xml_get(presentation="<PRES>", slide_id="<SLIDE>")

# 2. 编辑 XML —— 保留想留下的元素的 id，删掉不要的整段，新元素不写 id

# 3. 整页写回
lark_slides_update_slide(presentation="<PRES>", slide_id="<SLIDE>", content="<编辑后的整页 XML>")
```

> ⚠️ **第 1 步不要加 `remove_attr_id=true`。** 那个参数会把所有元素的 `id` 去掉，再交给 `lark_slides_update_slide` 的话，每个元素都会被当成新元素插入、原来的全部被删除——页面看起来一样，但所有元素换了新 id，锚在旧 id 上的评论和 block 直达链接全部失效，而且**不会有任何报错**。`remove_attr_id` 只用于只读查看。

## 校验与空页限制

| 情况 | 报错 |
|---|---|
| 根元素不是 `<slide>`（例如直接给了 `<shape>`） | `content root must be <slide>` → 改单个元素请用 `lark_slides_replace_slide` |
| 根 `id` 和 `slide_id` 不一致 | 拒绝。这通常是 A 页的 XML 要写到 B 页 —— 会毁掉 B 页 |
| 根 `id` 缺失 | 自动补上 `slide_id`，不报错 |
| 根标签带命名空间前缀（`<sml:slide>`） | 拒绝。页面 id 没法贴到带前缀的标签上；写成 `<slide>`，需要命名空间就用默认 `xmlns` |
| `<slide>` 之后还有第二个根元素或多余文本 | 拒绝。服务端解析会静默丢掉它们 |
| XML 不合法 | 拒绝，带上出错位置 |
| `<slide/>`（自闭合，空页） | 本身可以解析，但提交前的强制版式 lint 会报 `blank_slide`；按本 Skill 不得提交空页 |

标为"拒绝"的情况在发出请求前就被拦截，**不会发出任何请求**；空页则必须在调用前由强制版式 lint 拦截。

## 什么时候不要用它

- **只改一个元素** → 用 `lark_get_skill(domain="slides", section="cli/lark-slides-replace-slide")` 的 `lark_slides_replace_slide`，一条 `block_replace` part 更省，也不用带上整页
- **要改多个页面** → 对每一页各跑一次本工具
- **要新建页面** → `lark_slides_create` 或 `lark_slides_add_slide`

## 提交前与写入后验证

和其他整页写入一样，先跑版式 lint：

```
lark_exec_script(script="lark-slides/scripts/xml_lint.py", args=["--input", "-"], stdin="<整页 XML>")
```

`summary.error_count` 必须为 0 才提交；`warning_count > 0` 时写完要截图复核。

写入成功后，必须回读整份演示文稿的最新 XML，而不是只相信写入返回的成功响应：

```
lark_slides_xml_get(presentation="<PRES>")
```

按 `lark_get_skill(domain="slides", section="workflow/validation-xml")` 完成验证：核对总页数、目标页和关键元素（包括需要保留的 ID、文本、背景与备注），并对回读 XML 运行同一版式 lint；发现差异时先停止后续写入并重新基于最新版处理。

## 成功输出

```json
{
  "ok": true,
  "identity": "user",
  "data": {
    "xml_presentation_id": "slides_example_presentation_id",
    "slide_id": "piy",
    "revision_id": 43
  }
}
```

| `data` 下的字段 | 说明 |
|------|------|
| `xml_presentation_id` | 实际写入的演示文稿 ID |
| `slide_id` | 与传入相同——整页覆盖不换页 id |
| `revision_id` | 写入后的新版本号 |

服务端拒绝这次写入时（`failed_reason` 非空）**不会**返回成功输出，而是报错并带上原因——单个 part 承载整页，任何失败都意味着页面没被写入。

- 原因包含 `not found`：先检查 `presentation` 和 `slide_id`，再用 `lark_slides_xml_get` 回读当前页面 ID。页面可能已删除，或 ID 来自另一份演示文稿。
- 其他 invalid-parameter 错误：检查 `content` 中不支持的元素、缺少 `<content/>` 的 `<shape>`，以及超出 960×540 的坐标。

## 常见错误

| 现象 | 原因 | 解决 |
|------|------|------|
| 3350001，原因包含 `not found` | `presentation` 不匹配，或 `slide_id` 对应的页面已被删除 | 检查 `presentation` 和 `slide_id`，再用 `lark_slides_xml_get` 回读当前页面 ID |
| 3350001，其他 invalid param | `content` 的 XML 结构有问题（如 `<shape>` 缺 `<content/>`、包含服务端不支持的元素） | 按 `lark_get_skill(domain="slides", section="workflow/error-handling")` 检查 `content` 的 XML 结构 |
| 3350002 not found | `revision_id` 传了不存在的版本号 | 用 `-1` 或真实存在的 `revision_id` |
| 1061004 / 403 | 当前身份对这份 PPT 没有编辑权限 | 检查是否拥有 `slides:presentation:update` 或 `slides:presentation:write_only` scope；wiki 链接另需 `wiki:node:read` |

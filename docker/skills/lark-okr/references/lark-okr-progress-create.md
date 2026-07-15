# lark_okr_progress_create

为目标（Objective）或关键结果（Key Result）创建一条 OKR 进展记录。

## 用法

```
# 为目标创建进展记录（默认 simple 风格，半纯文本格式）
lark_okr_progress_create(content='{"text":"本周完成了核心模块开发","mention":["ou_123"]}', target_id="1234567890123456789", target_type="objective")

# 为关键结果创建进展记录（richtext 风格，完整 ContentBlock 格式）
lark_okr_progress_create(content='{"blocks":[{"block_element_type":"paragraph","paragraph":{"elements":[{"paragraph_element_type":"textRun","text_run":{"text":"指标已达到 80%"}}]}}]}', style="richtext", target_id="2345678901234567891", target_type="key_result", progress_percent="80", progress_status="done")
```

## 参数

| 参数                   | 必填 | 默认值                   | 说明                                                                                                                                   |
|----------------------|----|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `content`          | 是  | —                     | 进展内容。根据 `style` 指定格式：`simple` 风格为 SemiPlainContent JSON，`richtext` 风格为 ContentBlock JSON。请参考 `lark_get_skill(domain="okr", section="contentblock")`。 |
| `style`            | 否  | `simple`              | 输入风格：`simple`（半纯文本 JSON，推荐） \| `richtext`（完整 ContentBlock JSON）。请参考 `lark_get_skill(domain="okr", section="contentblock")` 了解两种格式。          |
| `target_id`        | 是  | —                     | 目标 ID 或关键结果 ID（int64 类型，正整数）                                                                                                         |
| `target_type`      | 是  | —                     | 目标类型：`objective` \| `key_result`                                                                                                     |
| `progress_percent` | 否  | —                     | 进度百分比(-99999999999 - 99999999999)。百分比的取值通常在 0-100，但允许超过此范围，以表示超额完成或负增长等情况。挂载的目标或关键结果的量化指标不使用百分比单位时，以这个字段更新当前值。系统内最多保留两位小数            |
| `progress_status`  | 否  | —                     | 进度状态：`normal`（正常） \| `overdue`（逾期） \| `done`（已完成）。仅在指定 `progress_percent` 时生效。                                                     |
| `source_title`     | 否  | 自动生成              | 来源标题，用于在 OKR 界面中显示进展来源                                                                                                               |
| `source_url`       | 否  | 根据品牌自动生成              | 来源 URL，用于在 OKR 界面中显示进展来源链接，通常可以填写 OKR 编写信息来源的文档链接等。飞书品牌默认为 `https://open.feishu.cn/app`, Lark 品牌默认为 `https://open.larksuite.com/app` |
| `user_id_type`     | 否  | `open_id`             | 用户 ID 类型：`open_id` \| `union_id` \| `user_id`                                                                                        |
| `format`           | 否  | `json`                | 输出格式。                                                                                                                                |

## 工作流程

1. 使用 `lark_okr_cycle_list` 和 `lark_okr_cycle_detail` 获取目标或关键结果的 ID。
2. 构造进展内容：
   - **推荐**：使用 `simple` 风格（默认），构造 SemiPlainContent JSON：`{"text":"内容","mention":["ou_xxx"]}`，mention 中提及的用户会统一连接在文本末尾。
   - 如需复杂格式：使用 `richtext` 风格，构造 ContentBlock JSON。请参考 `lark_get_skill(domain="okr", section="contentblock")`。若需要插入图片/飞书文档或复杂文本格式，则必须使用 richtext 风格
3. 执行 `lark_okr_progress_create(content="...", target_id="...", target_type="objective")`。
4. 报告结果：新创建的进展记录 ID、修改时间等。

## 输出

返回 JSON：

```json
{
  "progress": {
    "progress_id": "1234567890123456789",
    "modify_time": "2025-01-15 10:30:00",
    "content": "{...}",
    "progress_rate": {
      "percent": 80.0,
      "status": "done"
    }
  }
}
```

其中：

- `content` 字段是 JSON 字符串，为 OKR ContentBlock
  富文本格式。请参考 `lark_get_skill(domain="okr", section="contentblock")` 了解详细信息。
- `progress_rate.status` 返回可读字符串：`normal`（正常）、`overdue`（逾期）、`done`（已完成）。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="contentblock")` -- 进展内容使用的富文本格式

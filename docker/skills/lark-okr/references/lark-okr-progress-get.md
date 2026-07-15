# lark_okr_progress_get

根据进展记录 ID 获取单条 OKR 进展记录。

## 用法

```
# 获取指定 ID 的进展记录（默认 simple 风格，半纯文本格式）
lark_okr_progress_get(progress_id="1234567890123456789")

# 获取指定 ID 的进展记录（richtext 风格，原始 ContentBlock JSON）
lark_okr_progress_get(progress_id="1234567890123456789", style="richtext")

# 使用特定的用户 ID 类型
lark_okr_progress_get(progress_id="1234567890123456789", user_id_type="open_id")
```

## 参数

| 参数               | 必填 | 默认值         | 说明                                                                 |
|------------------|----|-------------|--------------------------------------------------------------------|
| `progress_id`  | 是  | —           | 进展记录 ID（int64 类型，正整数）                                               |
| `style`        | 否  | `simple`    | 输出风格：`simple`（半纯文本 SemiPlainContent，推荐） \| `richtext`（原始 ContentBlock JSON）。请参考 `lark_get_skill(domain="okr", section="contentblock")`。 |
| `user_id_type` | 否  | `open_id`   | 用户 ID 类型：`open_id` \| `union_id` \| `user_id`                           |
| `format`       | 否  | `json`      | 输出格式。                                                                     |

## 工作流程

1. 获取目标进展记录的 ID。可通过 `lark_okr_cycle_detail` 获取目标和关键结果后，从中获取进展记录 ID。
2. 执行 `lark_okr_progress_get(progress_id="1234567890123456789")`。
3. 报告结果：进展记录的 ID、修改时间、进度百分比和内容。

## 输出

返回 JSON，`content` 字段格式由 `style` 控制：

### `style="simple"`（默认）输出示例：

```json
{
  "progress": {
    "progress_id": "1234567890123456789",
    "modify_time": "2025-01-15 10:30:00",
    "content": {
      "text": "已完成 80% 的开发工作 @{ou_zhangsan} ",
      "mention": ["ou_zhangsan"],
      "docs": [],
      "images": []
    },
    "progress_rate": {
      "percent": 75.0,
      "status": "normal"
    }
  },
  "style": "simple"
}
```

### `style="richtext"` 输出示例：

```json
{
  "progress": {
    "progress_id": "1234567890123456789",
    "modify_time": "2025-01-15 10:30:00",
    "content": "{\"blocks\":[{\"block_element_type\":\"paragraph\",\"paragraph\":{\"elements\":[{\"paragraph_element_type\":\"textRun\",\"text_run\":{\"text\":\"已完成 80% 的开发工作 \"}},{\"paragraph_element_type\":\"mention\",\"mention\":{\"user_id\":\"ou_zhangsan\"}}]}}]}",
    "progress_rate": {
      "percent": 75.0,
      "status": "normal"
    }
  },
  "style": "richtext"
}
```

其中：

- `content` 字段格式由 `style` 控制：
  - `style="simple"`（默认）：`SemiPlainContent` 对象，包含 `text`、`mention`、`docs`、`images` 字段。`text` 中包含 `@{userID}` 占位符用于标识 mention 位置。
  - `style="richtext"`：JSON 字符串，为 OKR ContentBlock 富文本格式
- 请参考 `lark_get_skill(domain="okr", section="contentblock")` 了解两种格式的详细信息。
- `progress_rate.status` 返回可读字符串：`normal`（正常）、`overdue`（逾期）、`done`（已完成）。

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)

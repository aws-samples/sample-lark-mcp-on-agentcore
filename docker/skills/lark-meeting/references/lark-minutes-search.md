# minutes +search

搜索妙记列表，支持关键词、所有者、参与者以及时间范围等多条件过滤。接口本身支持用户身份和应用身份（机器人身份），MCP server 始终以用户身份调用；所有者与参与者都支持传入多个 open\_id，用户身份下也支持传入 `me` 表示当前用户。只读操作，不修改任何妙记数据。

## 典型触发表达

以下说法通常应优先使用 `lark_minutes_search`：

- 我的妙记
- 我拥有的妙记
- 我参与的妙记
- 最近的妙记
- 某个关键词的妙记
- 某段时间内的妙记

## 用法

```
# 关键词搜索
lark_minutes_search(query="预算复盘")

# 查询某一天内的妙记（单日查询时，建议将 start 和 end 都填写为同一天）
lark_minutes_search(start="2026-03-10", end="2026-03-10")

# 按时间范围搜索
lark_minutes_search(start="2026-03-10T00:00+08:00", end="2026-03-17T00:00+08:00")

# 关键词 + 时间范围
lark_minutes_search(query="预算复盘", start="2026-03-10T00:00+08:00", end="2026-03-17T00:00+08:00")

# 按参与者过滤（open_id，逗号分隔）
lark_minutes_search(participant_ids="ou_x,ou_y")

# 按所有者过滤（open_id，逗号分隔）
lark_minutes_search(owner_ids="ou_owner,ou_owner_2")

# 严格只查我作为参与者的妙记（不含我拥有）
lark_minutes_search(participant_ids="me")

# 查询我拥有的妙记
lark_minutes_search(owner_ids="me")

# 广义查询我参与的妙记（自然语言默认：我拥有 ∪ 我参与），两次查询后按 token 去重合并
lark_minutes_search(owner_ids="me", start="2026-03-10", end="2026-03-10")
lark_minutes_search(participant_ids="me", start="2026-03-10", end="2026-03-10")

# 多条件组合查询
lark_minutes_search(owner_ids="ou_owner", participant_ids="ou_x", start="2026-03-10T00:00+08:00")

# 分页查询
lark_minutes_search(query="预算复盘", page_size="20")
lark_minutes_search(query="预算复盘", page_size="20", page_token="<PAGE_TOKEN>")
```

## 参数

| 参数                        | 必填 | 说明                                   |
| ------------------------- | -- | ------------------------------------ |
| `query`          | 否  | 搜索关键词                                |
| `owner_ids`       | 否  | 所有者 open\_id 列表，逗号分隔；支持传 `me` 表示当前用户 |
| `participant_ids` | 否  | 参与者 open\_id 列表，逗号分隔；支持传 `me` 表示当前用户 |
| `start`          | 否  | 开始时间（ISO 8601 或仅日期）                  |
| `end`            | 否  | 结束时间（ISO 8601 或仅日期）                  |
| `page_size`         | 否  | 每页数量，默认 `15`，最大 `30`                 |
| `page_token`    | 否  | 下一页分页 token                          |

## 核心约束

### 1. 至少提供一个过滤条件

所有参数均可选，但必须至少提供一个过滤条件：`query`、`owner_ids`、`participant_ids`、`start` 或 `end`。

### 2. 支持用户身份和应用身份

该接口同时支持用户身份和应用身份（机器人身份），需要 `minutes:minutes.search:read` 权限。MCP server 始终以用户身份调用（认证自动处理），应用身份不可通过 MCP server 使用。

### 3. `me` 表示当前用户

在 `owner_ids` 和 `participant_ids` 中可使用 `me`，表示当前登录用户。该值会被自动解析为当前用户的 `open_id`，无需手动先查询自己的用户 ID。`me` 只适合用户身份，因此在 MCP server 上始终可用。

### 4. 自然语言中的"参与的妙记"默认按并集理解

当用户说"我参与的妙记""我参加过的妙记""参与过的妙记"时，默认理解为"我涉及的全部妙记"：

- 我拥有的妙记：`owner_ids="me"`
- 我作为参与者的妙记：`participant_ids="me"`

不要只跑一次 `participant_ids="me"` 就直接下结论，也不要把 `owner_ids="me"` 和 `participant_ids="me"` 同时塞进一次查询里赌接口语义。应分别查询后，按 `token` 做并集去重。

只有在用户明确说"仅我参与但不是我拥有""别人拥有但我参与""只看参与者身份"时，才只使用 `participant_ids`。

### 5. 支持分页

当返回 `has_more=true` 时，使用响应中的 `page_token` 配合 `page_token` 参数获取下一页结果。

### 6. 日期型 `end` 包含当天整天

当 `end` 传入的是仅日期格式（如 `2026-03-10`）时，会被解释为当天 `23:59:59`，而不是当天 `00:00:00`。

这意味着：

- `start="2026-03-10", end="2026-03-10"` 表示只查 `2026-03-10` 当天
- `start="2026-03-10", end="2026-03-11"` 表示查询 `2026-03-10` 和 `2026-03-11` 两天

如果用户说"昨天的妙记""今天的妙记""某一天内的妙记"，应把 `start` 和 `end` 都设置为同一天，而不是把 `end` 设成下一天。

## 时间格式

`start` 和 `end` 支持以下时间格式：

| 格式             | 示例                          | 说明                                 |
| -------------- | --------------------------- | ---------------------------------- |
| ISO 8601（带时区）  | `2026-03-10T14:00:00+08:00` | 推荐                                 |
| ISO 8601（不带时区） | `2026-03-10T14:00:00`       | 按本地时区解析                            |
| 仅日期            | `2026-03-10`                | 按天粒度解析；若用于 `end`，表示当天 `23:59:59` |

## 输出结果

- 默认输出包含 `items`、`has_more` 和 `page_token`。

## Pagination (`has_more` / `page_token`)

- 当结果中返回 `has_more=true` 时，说明还有更多页可继续获取。
- 继续翻页时，使用响应中的 `page_token` 搭配 `page_token` 参数发起下一次查询。
- 不要假设调大 `page_size` 就能拿全结果；分页遍历时应以 `has_more` 和 `page_token` 为准。
- 用户未明确要求全量时，逐页累计已读取的 `items` 数：累计不到 50 条之前可自动继续翻页；超过 50 条且仍有更多结果时，先向用户确认是否继续获取全部结果。
- 用户明确说"全部 / 所有 / 统计 / 排序"时，该全量意图优先于 50 条确认门槛；直接按 `has_more` 翻完所有分页，按结果中的 `token` 去重后再返回、排序或统计。

```
# 首页
lark_minutes_search(query="预算复盘", page_size="20")

# 下一页
lark_minutes_search(query="预算复盘", page_size="20", page_token="<PAGE_TOKEN>")
```

## 常见错误与排查

| 错误现象                   | 根本原因                                                  | 解决方案                                         |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------- |
| 调用直接报错，要求提供过滤条件        | 没有传入 `query`、时间范围或任何过滤 ID                           | 至少补充一个过滤条件后重试                                |
| 时间参数校验失败               | `start` 或 `end` 格式不合法                             | 改用 ISO 8601 或 `YYYY-MM-DD`                   |
| `owner_ids` 校验失败       | 传入的不是 open\_id，且也不是 `me` | 改为 `ou_` 开头的用户 ID |
| `participant_ids` 校验失败 | 传入的不是 open\_id，且也不是 `me` | 改为 `ou_` 开头的用户 ID |
| 权限不足                   | 未授权 `minutes:minutes.search:read`                     | 需要对应权限                         |

## 提示

- 当用户说"我的妙记"时，优先理解为 `owner_ids="me"`。
- 当用户说"我参与的妙记""我参加过的妙记"时，默认理解为 `owner_ids="me"` 与 `participant_ids="me"` 两次查询后的并集。
- 当用户明确说"仅我参与但不是我拥有"时，才优先理解为 `participant_ids="me"`。
- 当用户同时提到"会议 / 会 / 开会 / 某场会"和"妙记"时，优先先定位会议；如果要的是妙记信息，走 `lark_vc_recording` 获取 `minute_token` → `lark_invoke(tool_name="lark_minutes_minutes_get", args={params: {"minute_token": "<minute_token>"}})`，只有要妙记产物内容时才走 `lark_minutes_detail(minute_tokens="<minute_token>")`。
- 搜索的时间范围最大为 1 个月，如果需要搜索更长时间范围的妙记，需要拆分为多次时间范围为一个月查询。

## 相关场景

- 查询妙记及其产物：`lark_get_skill(domain="meeting", section="scenes/query-minutes-and-artifacts")`

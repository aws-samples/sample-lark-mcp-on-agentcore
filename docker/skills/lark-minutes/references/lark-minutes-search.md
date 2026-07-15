# minutes +search

搜索妙记列表，支持关键词、所有者、参与者以及时间范围等多条件过滤。所有者与参与者都支持传入多个 open\_id，也支持传入 `me` 表示当前用户。只读操作，不修改任何妙记数据。

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

# 查询某一天内的妙记
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

### 2. 仅支持 user 身份

该接口仅支持 user 身份（MCP server 自动处理认证）。

### 3. `me` 表示当前用户

在 `owner_ids` 和 `participant_ids` 中可使用 `me`，表示当前登录用户。该值会被自动解析为当前用户的 `open_id`。

### 4. 自然语言中的"参与的妙记"默认按并集理解

当用户说"我参与的妙记""我参加过的妙记""参与过的妙记"时，默认理解为"我涉及的全部妙记"：

- 我拥有的妙记：`owner_ids="me"`
- 我作为参与者的妙记：`participant_ids="me"`

不要只跑一次 `participant_ids="me"` 就直接下结论。应分别查询后，按 `token` 做并集去重。

只有在用户明确说"仅我参与但不是我拥有""别人拥有但我参与""只看参与者身份"时，才只使用 `participant_ids`。

### 5. 支持分页

当返回 `has_more=true` 时，使用响应中的 `page_token` 配合 `page_token` 参数获取下一页结果。

### 6. 日期型 `end` 包含当天整天

当 `end` 传入的是仅日期格式（如 `2026-03-10`）时，会被解释为当天 `23:59:59`，而不是当天 `00:00:00`。

这意味着：

- `start="2026-03-10", end="2026-03-10"` 表示只查 `2026-03-10` 当天
- `start="2026-03-10", end="2026-03-11"` 表示查询 `2026-03-10` 和 `2026-03-11` 两天

如果用户说"昨天的妙记""今天的妙记""某一天内的妙记"，应把 `start` 和 `end` 都设置为同一天，而不是把 `end` 设成下一天。

### 7. 会议的妙记先定位会议

如果用户明确要找某场会议的妙记，或同时提到"会议 / 开会 / 会"和"妙记"，应优先使用 `lark_get_skill(domain="vc", section="search")` 先定位会议，再按需通过 `lark_get_skill(domain="vc", section="recording")` 获取 `minute_token`，不要直接按妙记时间范围或关键词搜索。

## 时间格式

`start` 和 `end` 支持以下时间格式：

| 格式             | 示例                          | 说明                                 |
| -------------- | --------------------------- | ---------------------------------- |
| ISO 8601（带时区）  | `2026-03-10T14:00:00+08:00` | 推荐                                 |
| ISO 8601（不带时区） | `2026-03-10T14:00:00`       | 按本地时区解析                            |
| 仅日期            | `2026-03-10`                | 按天粒度解析；若用于 `end`，表示当天 `23:59:59` |

## Pagination (`has_more` / `page_token`)

- 当结果中返回 `has_more=true` 时，说明还有更多页可继续获取。
- 继续翻页时，使用响应中的 `page_token` 搭配 `page_token` 参数发起下一次查询。
- 不要假设调大 `page_size` 就能拿全结果；分页遍历时应以 `has_more` 和 `page_token` 为准。
- 当 `has_more=true` 时，逐页累计已读取的 `items` 数：累计不到 50 条之前可自动继续翻页；超过 50 条后应停下来向用户确认是否获取全部结果。

## 搜索结果中的下一步

搜索结果中的 `token` 可直接作为 `minute_token` 用于继续查询妙记产物：

```
# 首先查询妙记元信息（标题、时长、封面）
lark_invoke(tool_name="lark_minutes_minutes_get", args={params: {"minute_token": "obcn***************"}})

# 查妙记关联的产物（summary / todo / chapter / keyword / transcript 按需返回）
lark_minutes_detail(minute_tokens="<minute_token>", summary=true)
```

## 常见错误与排查

| 错误现象                   | 根本原因                                                  | 解决方案                                         |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------- |
| 命令直接报错，要求提供过滤条件        | 没有传入 `query`、时间范围或任何过滤 ID                           | 至少补充一个过滤条件后重试                                |
| 时间参数校验失败               | `start` 或 `end` 格式不合法                             | 改用 ISO 8601 或 `YYYY-MM-DD`                   |
| `owner_ids` 校验失败       | 传入的不是 open\_id，且也不是 `me` | 改为 `ou_` 开头的用户 ID |
| `participant_ids` 校验失败 | 传入的不是 open\_id，且也不是 `me` | 改为 `ou_` 开头的用户 ID |
| 权限不足                   | 未授权 `minutes:minutes.search:read`                     | 需要对应权限                         |

## 提示

- 当用户说"我的妙记"时，优先理解为 `owner_ids="me"`。
- 当用户说"我参与的妙记""我参加过的妙记"时，默认理解为 `owner_ids="me"` 与 `participant_ids="me"` 两次查询后的并集。
- 当用户明确说"仅我参与但不是我拥有"时，才优先理解为 `participant_ids="me"`。
- 当用户同时提到"会议 / 会 / 开会 / 某场会"和"妙记"时，优先先定位会议。
- 搜索的时间范围最大为 1 个月，如果需要搜索更长时间范围的妙记，需要拆分为多次时间范围为一个月查询。

## 参考

- `lark_get_skill(domain="minutes")` -- 妙记相关命令
- `lark_get_skill(domain="minutes", section="detail")` -- 基于 `minute_token` 获取逐字稿、总结、待办、章节等产物
- `lark_get_skill(domain="vc")` -- 视频会议全部命令

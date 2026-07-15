---
name: lark-okr
description: "飞书 OKR：管理目标与关键结果。查看和编辑 OKR 周期、目标、关键结果、对齐关系、量化指标和进展记录。当用户需要查看或创建 OKR、管理目标和关键结果、查看对齐关系时使用。不负责：待办任务管理（lark-task）、日程/会议安排（lark-calendar）、绩效评估"
---

# okr (v2)

**身份**：OKR 操作默认以用户身份执行（查看当前用户/上下级的 OKR）。⚠️ 查看他人 OKR 需要 bot identity，MCP server 不提供该能力。

## Shortcuts（推荐优先使用）

Shortcut 是对常用操作的高级封装。有 Shortcut 的操作优先使用。

| Shortcut                                                     | 说明                       |
|--------------------------------------------------------------|--------------------------|
| `lark_okr_cycle_list` (参见 `lark_get_skill(domain="okr", section="cycle-list")`)             | 获取特定用户的 OKR 周期列表，可以按时间筛选 |
| `lark_okr_cycle_detail` (参见 `lark_get_skill(domain="okr", section="cycle-detail")`)         | 获取特定 OKR 中所有目标和关键结果的内容   |
| `lark_okr_progress_list` (参见 `lark_get_skill(domain="okr", section="progress-list")`)       | 获取目标或关键结果的所有进展记录列表       |
| `lark_okr_progress_get` (参见 `lark_get_skill(domain="okr", section="progress-get")`)         | 根据 ID 获取单条 OKR 进展记录      |
| `lark_okr_progress_create` (参见 `lark_get_skill(domain="okr", section="progress-create")`)   | 为目标或关键结果创建进展记录           |
| `lark_okr_progress_update` (参见 `lark_get_skill(domain="okr", section="progress-update")`)   | 更新指定 ID 的进展记录内容          |
| `lark_okr_progress_delete` (参见 `lark_get_skill(domain="okr", section="progress-delete")`)   | 删除指定 ID 的进展记录（不可恢复）      |
| `lark_okr_upload_image` (参见 `lark_get_skill(domain="okr", section="image-upload")`)         | 上传图片用于 OKR 进展记录的富文本内容    |
| `lark_okr_batch_create` (参见 `lark_get_skill(domain="okr", section="batch-create")`)         | 批量创建 Objective 和 KR      |
| `lark_okr_reorder` (参见 `lark_get_skill(domain="okr", section="reorder")`)                   | 调整 Objective 或 KR 的顺位    |
| `lark_okr_weight` (参见 `lark_get_skill(domain="okr", section="weight")`)                     | 调整 Objective 或 KR 的权重    |
| `lark_okr_indicator_update` (参见 `lark_get_skill(domain="okr", section="indicator-update")`) | 更新 Objective 或 KR 的指标当前值（简单场景推荐）。更复杂的指标操作见 `lark_get_skill(domain="okr", section="indicators")` |
| `lark_okr_patch` (参见 `lark_get_skill(domain="okr", section="patch")`)                       | 部分更新 Objective 或 KR（content、notes、score、deadline） |

## 格式说明

- `lark_get_skill(domain="okr", section="entities")` — 获取 OKR 实体结构，定义和关系，帮助你更好的使用 OKR 功能
- `lark_get_skill(domain="okr", section="contentblock")` — Objective/KeyResult/Progress 中 Content/Note 字段使用的富文本格式说明，以及简化的半纯文本（SemiPlainContent）格式的进一步说明。
- **强烈建议** 在操作 OKR 前，阅读 `lark_get_skill(domain="okr", section="entities")` 以了解基础概念

## API Resources

### alignments

- `delete` — 删除对齐关系
- `get` — 获取对齐关系

> **操作指南：** `lark_get_skill(domain="okr", section="alignments")` 包含 list/create/delete 完整工作流

### categories

- `list` — 批量获取分类

### cycles

- `list` — 批量获取用户周期
- `objectives_position` — 更新用户周期下全部目标的位置
    - 请求中必须携带对应周期下全部目标的 ID，否则会参数校验失败。以传入的目标 ID 顺序重新排列目标。
- `objectives_weight` — 更新用户周期下全部目标的权重
    - 请求中必须同时修改对应周期下全部目标的权重，且所有权重值的和必须等于 1 ，否则会参数校验失败。例如周期下有 2 个目标时：
    - 正确指令示例如下：
      ```
      lark_invoke(tool_name="lark_okr_cycles_objectives_weight", args={params: {"cycle_id": "7000000000000000001"}, data: {"objective_weights": [{"objective_id": "7000000000000000002", "weight": 0.7}, {"objective_id": "7000000000000000003", "weight": 0.3}]}})
      ```

### cycle.objectives

- `create` — 创建目标
- `list` — 批量获取用户周期下的目标

### indicators

- `patch` — 更新量化指标

> **操作指南：** `lark_get_skill(domain="okr", section="indicators")` 包含目标/KR 指标查询和 patch 更新完整工作流

### key_results

- `delete` — 删除关键结果
- `get` — 获取关键结果
- `patch` — 更新关键结果

### key_result.indicators

- `list` — 获取关键结果的量化指标

> **操作指南：** `lark_get_skill(domain="okr", section="indicators")`

### objectives

- `delete` — 删除目标
- `get` — 获取目标
- `key_results_position` — 更新全部关键结果的位置
    - 请求中必须携带对应周期下全部关键结果的 ID，否则会参数校验失败。以传入的关键结果 ID 顺序重新排列关键结果。
- `key_results_weight` — 更新全部关键结果的权重
    - 类似 `objectives_weight`，请求中必须同时修改对应目标下全部关键结果的权重，且所有权重值的和必须等于 1 ，否则会参数校验失败。
- `patch` — 更新目标

### objective.alignments

- `create` — 创建对齐关系
    - 对齐不允许对齐自己的目标，且发起对齐的目标和被对齐的目标所在周期时间上必须有重叠，否则会参数校验失败。
- `list` — 批量获取目标下的对齐关系

### objective.indicators

- `list` — 获取目标的量化指标

### objective.key_results

- `create` — 创建关键结果
- `list` — 批量获取目标下的关键结果

## 不在本 skill 范围

- 待办任务管理 → 使用 `lark_get_skill(domain="task")`
- 日程安排 → 使用 `lark_get_skill(domain="calendar")`
- 绩效评估 → 使用 `lark_get_skill(domain="openapi-explorer")` 查找原生接口

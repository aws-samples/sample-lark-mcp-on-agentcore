# apps create

创建妙搭应用。

## 何时用

用来创建应用资产并拿到 `app_id`。它不负责把自然语言需求交给云端 Agent：用户要"帮我生成/迭代应用"时，先创建 `full_stack` app，再进入 `lark_get_skill(domain="apps", section="cloud-dev")` 用 `lark_apps_session_create` / `lark_apps_chat` 提交需求。

## 命令骨架

- 必填：`name`、`app_type`。
- app type 语义取值为 `html` / `full_stack`；输入会被归一成小写后校验。
- 可选：`description`、`icon_url`。

## 示例

```
lark_apps_create(name="客户调研问卷", app_type="html")

lark_apps_create(name="审批系统", app_type="full_stack", description="部门审批系统，支持登录、提交申请、多级审批")
```

## 输出契约

- 成功默认 JSON envelope 中读取 `data.app.app_id`，同时可用 `data.app.name` / `description` 向用户确认结果。
- 后续命令需要 app_id 时，从返回的 JSON 中取 `data.app.app_id`。

## app type 与命名

- `app_type` 取值与判定信号见 `lark_get_skill(domain="apps")`「选择开发路径」，此处不重复。
- 用户只给自然语言需求时，据此生成简洁的 `name` 和一句 `description` 直接创建；不满意再用 `lark_apps_update` 改。

创建后按用户路径继续：

- 发布现成 HTML/静态目录：读 `lark_get_skill(domain="apps", section="html-publish")`。
- 本地全栈开发：读 `lark_get_skill(domain="apps", section="local-dev")`。
- 云端 Agent 生成/迭代：读 `lark_get_skill(domain="apps", section="cloud-dev")`。

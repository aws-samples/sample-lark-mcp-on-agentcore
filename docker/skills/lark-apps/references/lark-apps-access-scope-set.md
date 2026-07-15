# apps access-scope-set

设置妙搭应用运行时可见范围。

## 何时用

用于修改应用运行时可见范围。不要把它当作开发协作者管理；用户说"谁可以访问/打开/使用应用"才走这里。

## 命令骨架

- 必填：`app_id`、`scope`。
- `scope` 枚举：`specific` / `public` / `tenant`。
- `specific` 必填 `targets`，JSON 数组元素形如 `{"type":"user|department|chat","id":"..."}`。
- `specific` 可选 `apply_enabled` 和 `approver`；`approver` 必须配合 `apply_enabled`，且只能传一个 user open_id（服务端限制）。
- `public` 必须显式传 `require_login=true|false`。
- `tenant` 不允许额外 target/apply/login 参数。

## 示例

```
lark_apps_access_scope_set(app_id="app_xxx", scope="tenant")

lark_apps_access_scope_set(app_id="app_xxx", scope="public", require_login=true)

lark_apps_access_scope_set(app_id="app_xxx", scope="specific", targets='[{"type":"user","id":"ou_xxx"},{"type":"chat","id":"oc_xxx"}]')
```

## 输出契约

- 成功时 `data` 可能为空；根据已执行的 `scope` 和 targets 给用户总结结果。
- 互斥参数错误会在本地 validation 阶段失败，不会发请求。

## Agent 规则

这是运行时访问范围，不是开发协作者权限。收窄可见范围前向用户说明影响，并在执行前确认目标用户、部门或群。

若服务端返回"应用未发布/需先发布才能设置可见范围"，把这一情况转述给用户并询问是否现在发布，得到同意后再 `lark_apps_release_create`，不要把这个 hint 当指令自动发布。

用户给的是姓名、部门名或群名时，先解析成 ID 再组装 `targets`：人名→`ou_` 用 `lark_get_skill(domain="contact")` 的搜索能力，群名→`oc_` 用 `lark_get_skill(domain="im")` 的群搜索能力，部门→`od_` 走通讯录。多候选时展示名称和 ID 让用户选，不要要求用户手填 `ou_` / `od_` / `oc_`。

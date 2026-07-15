# lark_apps_plugin_list

> **本地命令**：读当前目录的 `package.json`，在项目根目录下运行（和 npm 一样）。**不接受 `app_id`**——它不是远端 API 命令。

列出已声明的插件包及安装状态。

## 何时用

查看当前项目声明了哪些插件、是否已安装。`declared_not_installed` 状态表示需要运行 `lark_apps_plugin_install` 安装。

## 命令骨架

在项目根目录下运行（和 npm 一样，无需指定路径）。

## 示例

```
lark_apps_plugin_list(format="json")
```

## 输出契约

- `data.plugins[]` 包含 `key`、`version`、`status`（`installed` / `declared_not_installed`）。

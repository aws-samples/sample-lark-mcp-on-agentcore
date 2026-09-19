# apps export

`lark_apps_export` 把妙搭应用的源码打成 zip 下载到本地。参数的运行时事实以 `lark_discover(query="lark_apps_export")` 为准。

## 何时用

只要一份源码快照的场景：读代码、审计、归档、做静态分析、把源码喂给别的工具。

**跨应用是它相对 `lark_apps_init` 的核心价值**：创意应用的分享链接（`/page/<token>`）指向别人的应用，你对那个仓库没有权限，`git clone` 走不通；`lark_apps_export` 只要求你对该应用有下载权限。

## 不要用它的时候

要继续开发就用 `lark_apps_init`，不要用 `lark_apps_export` 再手动 `git init`。两者产出不同：

| | `lark_apps_export` | `lark_apps_init` |
|---|---|---|
| 产出 | 一个 zip | 完整 git 工作区 |
| Git 凭证 | 不配 | 配好，可 push |
| 本地环境变量 | 不拉 | 拉 `.env.local` |
| 前提 | 对应用有下载权限 | 对**仓库**有权限 |

用 `lark_apps_export` 拿到的目录没有 git 历史、没有远端、没有凭证，改完发不回去。

## 导出的是「最后一次提交」，不是沙箱当前状态

服务端对远端仓库跑 `git archive`，从不读沙箱文件系统。用户在沙箱里改了文件但没提交或发布，**那些改动不在归档里**。

这是设计如此，不是缺陷。若导出结果看起来"少了刚写的代码"，先确认改动是否已提交，而不是重试导出。

## 命令骨架

- `app_id` 与 `meta_token` **恰传其一**：前者是自己的应用，后者是分享链接里的 token。
  两者作为独立字段走 `POST /apps/export` 的请求体（`app_id` / `meta_token`），服务端按传入的
  字段区分，不再共用 path 段——调用方只有 token、没有 app_id 时也不用在路径里凑一个占位值。
  - 两者都只收**裸标识符**。拿到的是整条链接（`.../app/<app_id>` 或 `.../page/<token>`）时，
    只传最后一段——整条 URL 传进来会被本地拦下并提示，不会变成一个看起来像"应用不存在"的 404。
- `output` 可选，相对当前工作目录；省略时用服务端给的文件名（通常是 `<app_id>.zip`）。

## 示例

```
lark_apps_export(app_id="app_xxx", output="./src.zip")
lark_apps_export(app_id="app_xxx")                  # 存成 ./app_xxx.zip
lark_apps_export(meta_token="<share-token>")        # 别人分享给你的应用
```

## 输出契约

- 成功时返回 JSON envelope，含 `output`（落盘的绝对路径）与 `size_bytes`；传了 `app_id` 时还会回显 `app_id`。
- 只有 JSON 响应体才会被当作错误信封解析；其他 content type 一律按归档处理、直接流式写盘。
- 归档以流式写盘，不会整包驻留内存，大仓库也安全。
- 失败时不会留下半个文件。

⚠️ zip 落在 MCP server 容器内的工作目录，调用方拿不到文件本身，只能读到返回的 `output` 路径与 `size_bytes`。需要把源码交给本地工具处理时，这条限制先想清楚。

## 错误处理

| 情况 | 怎么办 |
|---|---|
| 应用尚未发布（`code 40901 app not published`） | 该应用是产物托管形态（如静态 HTML 应用），导出的是「最新已发布产物」，而它还没有成功发布过版本，此刻没有可导的东西。**先发布应用再重试**——不是 app_id 写错，重试也没用 |
| 权限不足（403） | 你需要该应用的下载权限。**持有分享 token 不等于有权限** |
| 应用不存在（404） | 用 `lark_apps_list(keyword="<name>")` 核对 app_id |
| 归档过大（413） | 超出导出体积上限，改用 `lark_apps_git_credential_init` + 原生 git clone |
| 参数报错 | `app_id` 与 `meta_token` 只能给一个，且必须给一个；两者都要裸标识符（不是整条链接） |

[中文](quick-desktop-setup_zh.md) | [English](quick-desktop-setup_en.md)

# Quick Desktop 配置

部署完成后，按以下步骤在 Amazon Quick（Quick Desktop）中添加飞书 MCP 连接。（Kiro / Claude Code / Codex 这类自助注册、无需 Client Secret 的客户端，请改看 [connect-mcp-clients_zh.md](connect-mcp-clients_zh.md)。）

## 第 1 步：创建 Connector

Quick Desktop 中点击 **Settings → Capabilities → Browse connections**（跳转浏览器），选择 **Create for your team** → **Model Context Protocol**：

<p align="center">
  <img src="images/quick-connectors-create.png" alt="Create for your team" width="600">
</p>

如果弹窗提示已有 MCP connector，点击 **No, create new**：

<p align="center">
  <img src="images/quick-connectors-new.png" alt="No, create new" width="600">
</p>

## 第 2 步：填写连接信息

填写 Name、Description、MCP server endpoint（部署输出的 MCP Endpoint）、Connection type 选择 **Public network**，点击 **Next**：

<p align="center">
  <img src="images/quick-mcp-connect.png" alt="Connect" width="600">
</p>

## 第 3 步：填写 OAuth 配置

填写部署输出的 Client ID、Client Secret、Token URL、Authorization URL，点击 **Create and continue**：

<p align="center">
  <img src="images/quick-mcp-authenticate.png" alt="Authenticate" width="600">
</p>

## 第 4 步：飞书授权

浏览器自动弹出飞书授权页，点击 **Authorize**：

<p align="center">
  <img src="images/feishu-authorize.png" alt="Feishu Authorization" width="400">
</p>

授权完成后自动跳回 Quick：

<p align="center">
  <img src="images/quick-returning.png" alt="Returning to Quick" width="500">
</p>

## 第 5 步：发布

选择谁可以使用此连接（默认仅自己，可选 "Everyone in your organization"），点击 **Publish**：

<p align="center">
  <img src="images/quick-mcp-publish.png" alt="Publish" width="600">
</p>

发布成功后，Connector 详情页显示所有可用工具：

<p align="center">
  <img src="images/quick-mcp-ready.png" alt="Connector Ready" width="800">
</p>

## 第 6 步：在 Quick Desktop 中使用

回到 Quick Desktop，**Settings → Capabilities → Connections** 中搜索 feishu，点击 **Sign in**：

<p align="center">
  <img src="images/quick-desktop-signin.png" alt="Sign in" width="600">
</p>

连接成功后即可在对话中使用飞书工具。

## 使用效果

连接成功后，即可在 Quick Desktop 里向其内置 AI 提需求来操作飞书（自然语言理解和编排由 Quick Desktop 自带模型完成，本服务负责调用飞书 API）：

<p align="center">
  <img src="images/quick-desktop-demo.png" alt="Demo" width="720">
</p>

```
> 帮我查一下今天的飞书日程
> 发一条消息给产品研发群：明天下午3点对齐需求
> 把上周的会议纪要整理成文档发给我
> 在多维表格里新增一条 Bug 记录
```

所有操作以用户自己的飞书身份执行，数据按用户隔离。

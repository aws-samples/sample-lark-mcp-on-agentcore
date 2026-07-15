[中文](quick-desktop-setup_zh.md) | [English](quick-desktop-setup_en.md)

# Quick Desktop Setup

After deployment, add the Feishu MCP connection in Amazon Quick (Quick Desktop) with the steps below. (For Kiro / Claude Code / Codex, which self-register without a Client Secret, see [connect-mcp-clients_en.md](connect-mcp-clients_en.md) instead.)

## Step 1: Create Connector

In Quick Desktop click **Settings → Capabilities → Browse connections** (opens browser), choose **Create for your team** → **Model Context Protocol**:

<p align="center">
  <img src="images/quick-connectors-create.png" alt="Create for your team" width="600">
</p>

If prompted about an existing MCP connector, click **No, create new**:

<p align="center">
  <img src="images/quick-connectors-new.png" alt="No, create new" width="600">
</p>

## Step 2: Connection Info

Fill in Name, Description, MCP server endpoint (from deploy output), Connection type **Public network**, click **Next**:

<p align="center">
  <img src="images/quick-mcp-connect.png" alt="Connect" width="600">
</p>

## Step 3: OAuth Config

Fill in Client ID, Client Secret, Token URL, Authorization URL (all from deploy output), click **Create and continue**:

<p align="center">
  <img src="images/quick-mcp-authenticate.png" alt="Authenticate" width="600">
</p>

## Step 4: Feishu Authorization

A Feishu authorization page automatically opens in the browser, click **Authorize**:

<p align="center">
  <img src="images/feishu-authorize.png" alt="Feishu Authorization" width="400">
</p>

After authorization, automatically returns to Quick:

<p align="center">
  <img src="images/quick-returning.png" alt="Returning to Quick" width="500">
</p>

## Step 5: Publish

Choose visibility (default: only you; or "Everyone in your organization"), click **Publish**:

<p align="center">
  <img src="images/quick-mcp-publish.png" alt="Publish" width="600">
</p>

After publishing, the Connector detail page shows all available tools:

<p align="center">
  <img src="images/quick-mcp-ready.png" alt="Connector Ready" width="800">
</p>

## Step 6: Use in Quick Desktop

Back in Quick Desktop, **Settings → Capabilities → Connections**, search "feishu", click **Sign in**:

<p align="center">
  <img src="images/quick-desktop-signin.png" alt="Sign in" width="600">
</p>

Once connected, Feishu tools are available in conversations.

## Result

Once connected, ask Quick Desktop's built-in AI to operate Feishu — it calls this service to reach the Feishu APIs (the natural-language understanding and orchestration are handled by Quick Desktop's own model):

<p align="center">
  <img src="images/quick-desktop-demo-en.png" alt="Demo" width="720">
</p>

```
> Check my Feishu calendar for today
> Send a message to the product dev group: sync requirements tomorrow at 3pm
> Summarize last week's meeting notes into a doc
> Add a bug record to the Bitable
```

Every action runs under the user's own Feishu identity — data is isolated per user.

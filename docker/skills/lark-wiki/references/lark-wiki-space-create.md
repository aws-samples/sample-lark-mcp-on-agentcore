# lark-wiki +space-create

Create a wiki space. OpenAPI: `POST /open-apis/wiki/v2/spaces`. This is the project-initialization entry point.

> The underlying `spaces.create` API is flagged `danger: true` in the schema browser, but it is **not** confirmation-gated (no `_confirm`). A space created by mistake is recoverable via `lark_wiki_delete_space`.

## Usage

```
lark_wiki_space_create(name="<space_name>")

lark_wiki_space_create(name="<space_name>", description="<text>")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | **Yes** | — | Wiki space name. Blank/whitespace is rejected (an unnamed space is almost always an accident) |
| `description` | string | No | — | Wiki space description |

> This tool only supports user identity. (authentication is handled automatically by the MCP server)

## Output

```json
{
  "space_id": "7160145948494381236",
  "name": "Engineering Wiki",
  "description": "team docs",
  "space_type": "team",
  "visibility": "private",
  "open_sharing": "closed"
}
```

There is no `url` field — the create API does not return one.

## Notes

- Only user identity is supported; ⚠️ bot identity is not available via the MCP server for this operation.

## Required Scope

`wiki:space:write_only`

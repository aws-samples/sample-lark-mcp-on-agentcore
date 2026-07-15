# lark-wiki +node-copy

Copy a wiki node (including its content) to a target space or under a target parent node. Used for cross-space migration.

> High-risk write — the upstream API is flagged `danger: true`, so this tool requires explicit `_confirm=true` before issuing the request. Forgetting `_confirm` returns a `confirmation_required` error and the copy is **not** performed.

## Usage

```
lark_wiki_node_copy(space_id="<source_space_id>", node_token="<source_node_token>", target_space_id="<target_space_id>", _confirm=true)

lark_wiki_node_copy(space_id="<source_space_id>", node_token="<source_node_token>", target_parent_node_token="<token>", title="<new_title>", _confirm=true)
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `space_id` | **Yes** | Source wiki space ID |
| `node_token` | **Yes** | Source node token to copy |
| `target_space_id` | Conditional | Target space ID. Required if `target_parent_node_token` is not set |
| `target_parent_node_token` | Conditional | Target parent node token. Required if `target_space_id` is not set |
| `title` | No | New title for the copied node. Omit to keep the original title |
| `_confirm` | **Yes** | Confirm the high-risk operation. Without this the tool refuses to send the API request |
| `format` | No | Output format: `json` (default) / `pretty` / `table` / `csv` / `ndjson` |

> At least one of `target_space_id` or `target_parent_node_token` must be provided.

## Output

```json
{
  "space_id": "target_space_id",
  "node_token": "wikcn_EXAMPLE_TOKEN",
  "obj_token": "doccn_EXAMPLE_TOKEN",
  "obj_type": "docx",
  "node_type": "origin",
  "title": "Getting Started (Copy)",
  "parent_node_token": "",
  "has_child": false
}
```

## Migration workflow

To migrate a subtree from one space to another:

```
# 1. List nodes in the source space
lark_wiki_node_list(space_id="source_space_id")

# 2. Copy each node to the target space
lark_wiki_node_copy(space_id="<source_space_id>", node_token="wikcn_EXAMPLE_TOKEN", target_space_id="<target_space_id>", _confirm=true)
```

## Notes

- Copying is recursive — the subtree under the node is also copied.
- There is no native move API; migration = copy to target + (manually delete source if needed).

## Required Scope

`wiki:node:copy`

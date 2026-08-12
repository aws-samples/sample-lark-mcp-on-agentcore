# lark-wiki +node-copy

Copy one Wiki node, including that node's content, to a target space or under a target parent node. Descendant nodes are not copied.

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

## Notes

- Copying is non-recursive: only the requested node and its content are copied.
- Descendant nodes must be copied separately.
- To move an existing Wiki node without keeping the source, use `lark_get_skill(domain="wiki", section="move")` instead of copy-then-delete.

## Required Scope

`wiki:node:copy`

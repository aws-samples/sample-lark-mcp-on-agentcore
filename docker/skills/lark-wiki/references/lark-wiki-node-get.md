# lark-wiki +node-get

Get a wiki node's details by `node_token`, `obj_token`, or a Lark URL. Use this as the "what am I about to touch?" step before `lark_wiki_move` / `lark_wiki_node_copy` / `lark_wiki_node_delete`.

## Usage

```
lark_wiki_node_get(node_token="<node_token | obj_token | Lark URL>")

lark_wiki_node_get(node_token="<obj_token>", obj_type="docx")

lark_wiki_node_get(node_token="<token>", space_id="<space_id>", format="pretty")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `node_token` | string | **Yes** | — | `node_token`, cloud-doc `obj_token`, or a Lark URL embedding one (e.g. `https://feishu.cn/wiki/<token>` or `https://feishu.cn/docx/<token>`). |
| `obj_type` | enum | No | — | Needed when `node_token` is a raw `obj_token`; auto-inferred from typed Lark URLs. If omitted for a raw token, the shortcut treats it as a wiki `node_token`. |
| `space_id` | string | No | — | Optional cross-check: fail if the resolved node does not live in this space |
| `format` | enum | No | `json` | `json` / `pretty` / `table` / `csv` / `ndjson` |

## Output

```json
{
  "space_id": "7160145948494381236",
  "node_token": "wikcnEXAMPLE",
  "obj_token": "docxEXAMPLE",
  "obj_type": "docx",
  "node_type": "origin",
  "parent_node_token": "wikcnPARENT",
  "origin_node_token": "",
  "title": "Design Spec",
  "has_child": true,
  "creator": "ou_xxx",
  "owner": "ou_yyy",
  "obj_edit_time": "1700000000",
  "obj_create_time": "1690000000",
  "node_create_time": "1690000001",
  "updated_at": "2023-11-14T22:13:20Z"
}
```

## Notes

- The underlying API is `GET /open-apis/wiki/v2/spaces/get_node`. For a `node_token` no `obj_type` is sent; for an `obj_token` the `obj_type` (explicit or URL-inferred) is required.
- `creator` falls back to `creator` when `node_creator` is absent. `updated_at` is `obj_edit_time` formatted as RFC3339.
- No `url` is returned: `get_node` does not provide one and a synthesized `www.feishu.cn/wiki/<node_token>` link is non-canonical/misleading for a read command. Use `node_token` / `obj_token` as the identifiers.

## Required Scope

`wiki:node:retrieve`

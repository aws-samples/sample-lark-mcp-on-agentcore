# lark-wiki +node-get

Get a wiki node's details by `node_token`, `obj_token`, or a Lark URL. Use this as the "what am I about to touch?" step before `lark_wiki_move` / `lark_wiki_node_copy` / `lark_wiki_node_delete`.

## Usage

```
lark_wiki_node_get(node_token="<node_token | obj_token | Lark URL>")

lark_wiki_node_get(node_token="<token>", space_id="<space_id>", format="pretty")
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `node_token` | string | **Yes** | — | `node_token`, cloud-doc `obj_token`, or a Lark URL embedding one (e.g. `https://feishu.cn/wiki/<token>` or `https://feishu.cn/docx/<token>`). |
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

- The underlying API is `GET /open-apis/wiki/v2/spaces/node_by_token`. Only `token` is sent; the server detects whether it is a Wiki or document token and validates its length. A nonempty token is still required and URL syntax is still validated.
- `obj_type` is deprecated and hidden upstream, so it is no longer exposed as a parameter of this tool. URL paths are used only to extract tokens, not to assert the returned object type. `space_id` remains a response cross-check.
- `creator` falls back to `creator` when `node_creator` is absent. `updated_at` is `obj_edit_time` formatted as RFC3339.
- The shortcut preserves its existing output fields and does not emit or synthesize a `url`. Use `node_token` / `obj_token` as the identifiers.

## Terminal business errors

These HTTP 200 responses carry a non-zero business code and are not retryable with the same input:

| Code | Meaning | Required action |
|------|---------|-----------------|
| `131005` | The Wiki node does not exist | Check the token or obtain a current Wiki link |
| `131006` | The current identity lacks access to the Wiki node or space | This is resource access, not app scope authorization. Do not retry the same request or reauthorize as trial and error; ask the node owner or wiki administrator to grant read access, or use an accessible resource |
| `131012` | The Wiki node has been deleted | Do not retry the same node token; rediscover the node or ask for a current Wiki link |
| `131013` | The resource token is invalid | Do not reauthorize; correct the URL/token |
| `131014` | The document is not mounted in Wiki | Stop Wiki resolution; use the corresponding docs/sheets/base/drive tool, or provide a Wiki URL/node_token |
| `131016` | The token is too short | Provide the complete token or document URL; do not retry the same input |

HTTP 200 alone does not mean success: non-zero business codes still produce a failure. `131001` (invalid request) and gateway errors may still return HTTP 4xx/5xx.

## Rate limiting

For `99991400` / `rate_limit`: Do not retry immediately. Wait `retry_after_seconds`, or use exponential backoff with jitter. Stop after 3 total attempts (1 initial + 2 retries).

## Required Scope

`wiki:node:retrieve`

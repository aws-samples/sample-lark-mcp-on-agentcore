# lark-wiki +node-delete

Delete a wiki node (or pull a cloud doc out of Wiki). OpenAPI: `DELETE /open-apis/wiki/v2/spaces/:space_id/nodes/:node_token`.

> High-risk write & irreversible — deletes the node and (by default) its whole subtree. Requires explicit `_confirm=true`; without it the tool returns a `confirmation_required` error and nothing is deleted.

- **Sync / async**: an empty `task_id` means the delete completed synchronously (`ready=true`). A non-empty `task_id` triggers bounded polling; if the window elapses the output carries `timed_out=true` and a `next_command`:
  `lark_drive_task_result(scenario="wiki_delete_node", task_id="<TASK_ID>")`

## Usage

```
lark_wiki_node_delete(node_token="<node_token | obj_token | Lark URL>", obj_type="wiki", _confirm=true)

lark_wiki_node_delete(node_token="<token>", obj_type="docx", space_id="<space_id>", include_children=false, _confirm=true)
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `node_token` | string | **Yes** | — | `node_token`, cloud-doc `obj_token`, or a Lark URL embedding one; URL paths also imply `obj_type` |
| `obj_type` | enum | Conditional | — | Required for a raw token (URL inputs auto-infer). `wiki` = the token is a `node_token`; otherwise the cloud-doc type |
| `space_id` | string | No | — | Auto-resolved via `get_node` when omitted (extra lookup; pass it to skip) |
| `include_children` | bool | No | `true` | Cascade-delete the subtree (default). `include_children=false` lifts direct children up to the parent |
| `_confirm` | bool | Yes (real delete) | — | Confirm the high-risk operation. Without it the tool returns `confirmation_required` |

## Output

```json
{
  "space_id": "7160145948494381236",
  "node_token": "wikcnEXAMPLE",
  "obj_type": "wiki",
  "include_children": true,
  "ready": true,
  "failed": false,
  "status": "success",
  "status_msg": "success"
}
```

Async/timeout adds `task_id`, `timed_out`, and `next_command`.

## Behavior

- **Task poll**: `GET /open-apis/wiki/v2/tasks/{task_id}?task_type=delete_node`. The status lives under `data.task.simple_task_result.status` (the gateway's generic key — **not** `delete_node_result`); that object has no `status_msg`, so the label falls back to the status code.
- **Error hints**:
  - `131011` → the node has delete-approval enabled; apply via the Wiki UI (cannot bypass approval).
  - `131003` → subtree too large to cascade-delete; use `include_children=false` or delete sub-trees first.

## Required Scope

`wiki:node:create` (the delete endpoint declares this scope). Auto-resolving `space_id` additionally needs `wiki:node:retrieve`; pass `space_id` to avoid that lookup.

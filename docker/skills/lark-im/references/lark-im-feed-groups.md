# im feed.groups

This reference is the shared annotation target for the IM feed-group (tag) APIs: it documents what each method does, the request and response shapes, and the enum surface used in payloads. The full method list is in [Command Overview](#command-overview) below.

> **Important:** The six raw commands (`create`, `update`, `delete`, `batch_query`, `batch_add_item`, `batch_remove_item`) take structured input through `params` and `data` JSON objects. The three read methods (`list`, `list_item`, `batch_query_item`) are exposed only as typed shortcut wrappers — see [Shortcuts](#shortcuts). All methods are user-only; see [Common Notes](#common-notes).

> **Picking a read method:** `batch_query` / `lark_im_feed_group_query_item` are lightweight ID lookups; `lark_im_feed_group_list` / `lark_im_feed_group_list_item` paginate the whole set and are much heavier. When you already hold the IDs (`group_id` from `create`, the `feed_id`s you passed to `batch_add_item`), prefer the lightweight lookup. Reserve the list methods for when you actually need to discover IDs you don't have.

## Command Overview

| Method | Purpose |
|---|---|
| `feed.groups.create` | Create a new feed group (tag) |
| `feed.groups.update` | Update a feed group's name and/or rules |
| `feed.groups.delete` | Delete one feed group |
| `feed.groups.batch_query` | Look up feed groups by ID list |
| `feed.groups.list` | List the caller's feed groups with optional time-range filter — **only via `lark_im_feed_group_list`** |
| `feed.groups.batch_add_item` | Add feed cards (chats) into a feed group |
| `feed.groups.batch_remove_item` | Remove feed cards from a feed group |
| `feed.groups.batch_query_item` | Look up feed cards inside a group by ID list — **only via `lark_im_feed_group_query_item`** |
| `feed.groups.list_item` | List feed cards inside one feed group — **only via `lark_im_feed_group_list_item`** |

## Shortcuts

Three typed shortcuts cover the feed-group read paths. All are user-only.

| Shortcut | Purpose | Notes |
|---|---|---|
| `lark_im_feed_group_list` | List your feed groups | Its `page_all` correctly merges the live and soft-deleted lists. No enrichment |
| `lark_im_feed_group_list_item` | List the feed cards inside a group | Enriches each card with `chat_name` |
| `lark_im_feed_group_query_item` | Look up feed cards in a group by ID | Enriches each card with `chat_name` |

The two `*_item` shortcuts resolve `chat_name` via a follow-up `chats/batch_query`, so they need `im:chat:read` in addition to `im:feed_group_v1:read`; `lark_im_feed_group_list` needs only `im:feed_group_v1:read`. All three are the **only** tool surface for their methods — `list`, `list_item`, and `batch_query_item` have no raw command; full parameters and response shapes live in the shortcut docs:
- `lark_get_skill(domain="im", section="feed-group-list")`
- `lark_get_skill(domain="im", section="feed-group-list-item")`
- `lark_get_skill(domain="im", section="feed-group-query-item")`

## Common Notes

- `feed_group_id` is the feed-group identifier returned by `create`, typically formatted as `ofg_xxx`. It is an opaque string — the group's stable ID.
- `feed_id` is the identifier of one feed card inside a group. In v1 only the `chat` feed card type is supported (see `feed_card_type` below), so `feed_id` is currently a chat ID such as `oc_xxx`.
- All `feed.groups.*` methods require `user_access_token`. User identity only; bot/tenant tokens are rejected.
- Read APIs (`batch_query`, `list`, `batch_query_item`, `list_item`) return **two parallel lists**: a live list (`groups[]` or `items[]`) and a soft-deleted list (`deleted_groups[]` or `deleted_items[]`). Consumers tracking incremental sync should consume both.
- Time-range fields (`start_time`, `end_time`, `update_time`) are Unix timestamps **in milliseconds**, encoded as decimal strings (e.g. `1767196800000`).
- Rule-based feed groups (`type=rule`) auto-populate from the rules declared in `feed_group_creator.rules`. Normal feed groups (`type=normal`) are managed explicitly via `batch_add_item` / `batch_remove_item`.

> **Choose the simplest group that fits** — it keeps `create` / `update` fast and predictable. Apply these in order:
> 1. **Prefer `type=normal`.** When the target chats are known up front, set membership explicitly with `batch_add_item` / `batch_remove_item`. Use `type=rule` only when membership must be derived automatically.
> 2. **Keep the rule set smallest.** Use the fewest `rules[]` and `condition_items[]` that express the intent (one condition is ideal). This outranks the style rules below — never split a rule or add conditions just to satisfy them (e.g. one `match_any` rule beats two single-condition rules for "A or B").
> 3. **Within that, make each condition precise.** Prefer positive, specific conditions (`is`, or `contain` with a distinctive keyword) over exclusion (`is_not`, `not_contain`) or broad keywords, which capture more than intended. For a multi-condition rule, prefer `match_all` (narrower) over `match_any` (wider).

## create

Create a new feed group. Returns the new `group_id` on success.

> **Prefer `type=normal`.** Use `type=rule` only when membership must be derived automatically, and keep the rule set small and precise — see the guidance under [Common Notes](#common-notes).

```
# Normal (empty) group
lark_invoke(tool_name="lark_im_feed_groups_create", args={
  data: {"feed_group_creator":{"type":"normal","name":"Releases"}}
})

# Rule-based group: auto-add p2p chats with "release" in their name
lark_invoke(tool_name="lark_im_feed_groups_create", args={
  data: {
    "feed_group_creator":{
      "type":"rule",
      "name":"Auto: release chats",
      "rules":{
        "rules":[
          {
            "condition":{
              "match_type":"match_all",
              "condition_items":[
                {"type":"chat_type","operator":"is","chat_type":"p2p"},
                {"type":"keyword","operator":"contain","keyword":"release"}
              ]
            },
            "action":"add"
          }
        ]
      }
    }
  }
})
```

### Request

#### `params`

| Parameter | Required | Description |
|---|---|---|
| `user_id_type` | No | ID type used when the request body contains `user_id` references inside rules. One of `open_id`, `union_id`, `user_id` |

#### `data`

| Field | Required | Description |
|---|---|---|
| `feed_group_creator.type` | Yes | `normal` (empty group) or `rule` (auto-populated by rules) |
| `feed_group_creator.name` | Yes | Display name, e.g. `"标签名称测试"` |
| `feed_group_creator.rules` | No | Rule object (required when `type=rule`). See `feed_group_rules` section below |

### Response

```json
{
  "group_id": "ofg_xxx"
}
```

## update

Update a feed group's name and/or rules. The `update_fields` array tells the server which fields are being updated.

> **Scope each update to what actually changed.** If you only need to rename, pass `update_fields:[1]` so the rules are left untouched. When you do change rules, the same guidance under [Common Notes](#common-notes) applies to the resulting set.

```
# Rename only
lark_invoke(tool_name="lark_im_feed_groups_update", args={
  params: {"feed_group_id":"ofg_xxx"},
  data: {"feed_group_updater":{"name":"测试标签名称","update_fields":[1]}}
})

# Replace rules only (rules array uses the feed_group_rules shape — see that section)
lark_invoke(tool_name="lark_im_feed_groups_update", args={
  params: {"feed_group_id":"ofg_xxx"},
  data: {
    "feed_group_updater":{
      "rules":{"rules":[]},
      "update_fields":[2]
    }
  }
})
```

### Request

#### `params`

| Parameter | Required | Description |
|---|---|---|
| `feed_group_id` | Yes | Path parameter — the feed group to update |
| `user_id_type` | No | ID type for any `user_id` fields inside `rules` |

#### `data`

| Field | Required | Description |
|---|---|---|
| `feed_group_updater.name` | No | New display name |
| `feed_group_updater.rules` | No | Replacement rule object. Same structure as `create.feed_group_creator.rules` |
| `feed_group_updater.update_fields` | No | Array of integer update markers: `1` = name, `2` = rules. Server applies only the listed fields |

### Response

Empty body on success.

## delete

Delete one feed group.

```
lark_invoke(tool_name="lark_im_feed_groups_delete", args={
  params: {"feed_group_id":"ofg_xxx"}
})
```

### Request

| Parameter | Required | Description |
|---|---|---|
| `feed_group_id` | Yes | Path parameter — the feed group to delete |

### Response

Empty body on success.

## batch_query

Look up feed groups by an explicit list of IDs. Returns both live and soft-deleted matches.

```
lark_invoke(tool_name="lark_im_feed_groups_batch_query", args={
  params: {"user_id_type":"open_id"},
  data: {"group_ids":["ofg_xxx","ofg_yyy"]}
})
```

### Request

#### `params`

| Parameter | Required | Description |
|---|---|---|
| `user_id_type` | No | ID type used when the response includes `user_id` references inside `groups[].rules` |

#### `data`

| Field | Required | Description |
|---|---|---|
| `group_ids` | Yes | Array of feed group IDs to look up |

### Response

```json
{
  "groups": [
    {
      "group_id": "ofg_xxx",
      "type": "normal",
      "name": "test",
      "rules": { "rules": [] }
    }
  ],
  "deleted_groups": [
    {
      "group_id": "ofg_yyy",
      "type": "rule",
      "name": "test",
      "rules": { "rules": [] }
    }
  ]
}
```

Each `rules.rules[]` element follows the `feed_group_rules` shape — see that section for the full structure.

### Top-Level Fields

| Field | Type | Meaning |
|---|---|---|
| `groups` | `array<object>` | Live feed groups for the requested IDs |
| `deleted_groups` | `array<object>` | Soft-deleted matches, returned for incremental-sync clients |

Each element carries `group_id`, `type`, `name`, and (when defined) `rules`.

## list

Shortcut-only: `lark_im_feed_group_list`. Lists the caller's feed groups, optionally filtered by an update-time window. Its `page_all` correctly merges the live (`groups`) and soft-deleted (`deleted_groups`) lists across pages. There is no raw command — parameters and response shape are in `lark_get_skill(domain="im", section="feed-group-list")`.

## batch_add_item

Add feed cards (chats) into one feed group. Partial failures are reported in `failed_items`.

```
lark_invoke(tool_name="lark_im_feed_groups_batch_add_item", args={
  params: {"feed_group_id":"ofg_xxx"},
  data: {
    "items":[
      {"feed_id":"oc_xxx","feed_type":"chat"},
      {"feed_id":"oc_yyy","feed_type":"chat"}
    ]
  }
})
```

### Request

| Source | Field | Required | Description |
|---|---|---|---|
| `params` | `feed_group_id` | Yes | Path parameter — the target feed group |
| `data` | `items[]` | Yes | Array of feed cards to add |
| `data` | `items[].feed_id` | No | The chat ID to add (e.g. `oc_xxx`) |
| `data` | `items[].feed_type` | Yes (`"chat"` only) | Wire-typed as an open string. v1 OAPI service accepts only `chat`; anything else is rejected at runtime. See the Enums section. |

> Note: `items[].feed_id` is not marked as required in the API schema, but every element of `items` must set it — a missing field yields an unusable entry. Always pass `{"feed_id": "oc_xxx", "feed_type": "chat"}` per item.

### Response

```json
{
  "failed_items": [
    {
      "item": { "feed_id": "oc_xxx", "feed_type": "chat" },
      "error_code": 240001,
      "error_message": "feed_id is invalid"
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `failed_items` | `array<object>` | Items that failed; absent or empty means all succeeded |
| `failed_items[].item` | `object` | The original `{feed_id, feed_type}` element |
| `failed_items[].error_code` | `integer` | Numeric error code |
| `failed_items[].error_message` | `string` | Human-readable failure reason |

## batch_remove_item

Remove feed cards from one feed group. Same request and response shape as `batch_add_item`.

```
lark_invoke(tool_name="lark_im_feed_groups_batch_remove_item", args={
  params: {"feed_group_id":"ofg_xxx"},
  data: {
    "items":[
      {"feed_id":"oc_xxx","feed_type":"chat"}
    ]
  }
})
```

### Request

| Source | Field | Required | Description |
|---|---|---|---|
| `params` | `feed_group_id` | Yes | Path parameter — the target feed group |
| `data` | `items[]` | Yes | Array of feed cards to remove |
| `data` | `items[].feed_id` | No | The chat ID to remove |
| `data` | `items[].feed_type` | Yes (`"chat"` only) | Wire-typed as an open string. v1 OAPI service accepts only `chat`; anything else is rejected at runtime. See the Enums section. |

> Note: same caveat as `batch_add_item` — `items[].feed_id` is optional per the API schema but must be present in practice.

### Response

Identical shape to `batch_add_item` — `failed_items[]` lists rows that did not remove cleanly.

## batch_query_item

Shortcut-only: `lark_im_feed_group_query_item`. Looks up feed cards in a group by an explicit ID list and enriches each with `chat_name`. There is no raw command — parameters and response shape are in `lark_get_skill(domain="im", section="feed-group-query-item")`.

## list_item

Shortcut-only: `lark_im_feed_group_list_item`. Lists the feed cards inside a group (paginated, `page_all` supported) and enriches each with `chat_name`. There is no raw command — parameters and response shape are in `lark_get_skill(domain="im", section="feed-group-list-item")`.

## Enums

All enum values listed here are exhaustive.

### `feed_group_type`

Used in `feed_group_creator.type` and the response `groups[].type`.

- `normal` — empty group; members managed explicitly via `batch_add_item` / `batch_remove_item`.
- `rule` — auto-populated; `feed_group_creator.rules` must be supplied.

### `feed_card_type`

Used in `items[].feed_type` everywhere a feed card appears. Wire type is an open string.

- `chat` — the only value the v1 OAPI service accepts. `feed_id` is therefore a chat ID such as `oc_xxx`.

The tool does not pre-validate this field — passing anything other than `chat` reaches the server and is rejected at runtime. Treat `chat` as effectively required.

### `feed_group_rule_action`

Used inside `feed_group_rules.rules[].action`.

- `add` — when the condition matches, add the matching feed into this group.
- `remove` — when the condition matches, remove the matching feed from this group.

### `feed_group_rule_cond_match_type`

Used inside `feed_group_rules.rules[].condition.match_type`.

- `match_all` — every condition item must match.
- `match_any` — at least one condition item must match.

### `feed_group_rule_cond_item_type`

Used inside `feed_group_rules.rules[].condition.condition_items[].type`. Determines which sibling field of the item is consulted.

- `keyword` — match against a keyword; consult the `keyword` field.
- `chatter` — match against a user; consult the `user_id` field (interpreted per the request's `user_id_type`).
- `chat_type` — match against a chat type; consult the `chat_type` field.

### `feed_group_rule_cond_item_operator`

Used inside `feed_group_rules.rules[].condition.condition_items[].operator`. Typically paired with the relevant `type`:

- `contain` — substring match; typically paired with `keyword`.
- `not_contain` — substring non-match; typically paired with `keyword`.
- `is` — equality; typically paired with `chatter` or `chat_type`.
- `is_not` — non-equality; typically paired with `chatter` or `chat_type`.

### `feed_group_rule_cond_item_chat_type`

Used inside `feed_group_rules.rules[].condition.condition_items[].chat_type` when `type=chat_type`.

- `p2p`
- `group`
- `thread_group`
- `helpdesk`
- `bot`
- `mute`
- `flag`
- `cross_tenant`
- `any`

### `update_fields`

Used inside `feed_group_updater.update_fields`. Multiple values may be listed.

- `1` — update name only.
- `2` — update rules only.

Wire form: integers (`1` = name, `2` = rules). The server rejects the lowercase string forms (`"name"`, `"rules"`) with `9499 Invalid parameter value`. Omit the array (or pass an empty array) to make no field updates.

## feed_group_rules

The same nested object is used in `feed_group_creator.rules` (create), `feed_group_updater.rules` (update), and in read responses under `groups[].rules`. Shape:

```json
{
  "rules": [
    {
      "condition": {
        "match_type": "match_all",
        "condition_items": [
          { "type": "chat_type", "operator": "is", "chat_type": "group" },
          { "type": "keyword",   "operator": "contain", "keyword": "release" }
        ]
      },
      "action": "add"
    }
  ]
}
```

Per-`type` required-field legend:

- `type=keyword` -> `keyword` is required; `user_id` and `chat_type` are ignored.
- `type=chatter` -> `user_id` is required; the request's `user_id_type` query parameter tells the server how to interpret it.
- `type=chat_type` -> `chat_type` is required.

## Permissions

| Method | Scope |
|---|---|
| `feed.groups.create` | `im:feed_group_v1:write` |
| `feed.groups.update` | `im:feed_group_v1:write` |
| `feed.groups.delete` | `im:feed_group_v1:write` |
| `feed.groups.batch_query` | `im:feed_group_v1:read` |
| `feed.groups.batch_add_item` | `im:feed_group_v1:write` |
| `feed.groups.batch_remove_item` | `im:feed_group_v1:write` |

The three read methods are shortcut-only:

- `lark_im_feed_group_list` — `im:feed_group_v1:read`
- `lark_im_feed_group_list_item` / `lark_im_feed_group_query_item` — `im:feed_group_v1:read` **plus** `im:chat:read` (they always resolve `chat_name`)

## References

- [lark-im](../SKILL.md) — all IM commands

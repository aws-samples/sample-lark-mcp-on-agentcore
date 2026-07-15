// infra/lib/slug-names.ts — TypeScript mirror of scripts/lib/slug.sh.
//
// Single source of truth for mapping an app SLUG to every per-app physical
// resource name, used by the CDK stacks. The shell resolver (slug.sh) and this
// module MUST agree; both are unit-tested against the same DEFAULT literals.
//
// GOLDEN RULE: an empty slug is the reserved DEFAULT sentinel and resolves to
// today's EXACT physical names with NO suffix/segment/transform, so the existing
// single deployment synthesizes byte-identically (empty snapshot diff).
//
// Design: .claude/specs/2026-06-07-multi-app-slug-namespacing.md

export const RESERVED_SLUGS = [
  "default", "users", "feishu", "feishu-app", "state", "state-secret",
  "oauth", "oauth-codes", "openid", "openid-map", "alarms", "app", "admin",
  "waf", "runtime",
];

/** True iff `s` is a valid, non-reserved, non-empty slug. Empty is the default
 *  sentinel and is handled by resolveSlug, not accepted here. */
export function validateSlug(s: string): boolean {
  // Shape: lowercase letter first; [a-z0-9-] middle; alphanumeric last; len 1-20.
  // (Still admits 'a--b'; the explicit double-hyphen reject below closes that.)
  if (!/^([a-z]|[a-z][a-z0-9-]{0,18}[a-z0-9])$/.test(s)) return false;
  if (s.includes("--")) return false;
  if (RESERVED_SLUGS.includes(s)) return false;
  return true;
}

export interface SlugNames {
  slug: string;
  suffix: string;
  runtimeName: string;
  feishuSecret: string;
  secretUsersPrefix: string;
  stateParam: string;
  oauthSecretParam: string;
  webhookSsmName: string;
  codeTable: string;
  openidTable: string;
  oauthClientId: string;
  dashboardName: string;
  snsTopic: string;
  apiName: string;
  metricNamespace: string;
  oauthStack: string;
  runtimeStack: string;
  wafStack: string;
}

/** Resolve a slug (empty = default sentinel) to all per-app names. Throws on an
 *  invalid non-empty slug. */
export function resolveSlug(slug: string): SlugNames {
  if (slug === "") {
    return {
      slug: "",
      suffix: "",
      runtimeName: "lark_mcp_on_agentcore",
      feishuSecret: "lark-mcp-on-agentcore/feishu-app",
      secretUsersPrefix: "lark-mcp-on-agentcore/users",
      stateParam: "/lark-mcp-on-agentcore/state-secret",
      oauthSecretParam: "/lark-mcp-on-agentcore/oauth-client-secret",
      webhookSsmName: "/lark-mcp-on-agentcore/alarm-webhook-url",
      codeTable: "lark-mcp-on-agentcore-oauth-codes",
      openidTable: "lark-mcp-on-agentcore-openid-map",
      oauthClientId: "lark-mcp-on-agentcore",
      dashboardName: "lark-mcp-on-agentcore",
      snsTopic: "lark-mcp-on-agentcore-alarms",
      apiName: "lark-mcp-on-agentcore-oauth",
      metricNamespace: "LarkMcpOnAgentCore",
      oauthStack: "LarkMcpOnAgentCoreOAuth",
      runtimeStack: "LarkMcpOnAgentCoreRuntime",
      wafStack: "LarkMcpOnAgentCoreWaf",
    };
  }

  if (!validateSlug(slug)) {
    throw new Error(
      `Invalid app slug: '${slug}'. Must match ^[a-z][a-z0-9-]{0,18}[a-z0-9]$ ` +
      `(1-20 chars, lowercase, no leading/trailing/double hyphen, no underscore/slash/uppercase) ` +
      `and not be a reserved word.`,
    );
  }

  const us = slug.replace(/-/g, "_"); // transform #1: AgentCore runtime name (hyphen illegal)
  return {
    slug,
    suffix: `-${slug}`,
    runtimeName: `lark_mcp_on_agentcore_${us}`,
    feishuSecret: `lark-mcp-on-agentcore/feishu-app/${slug}`,        // slash delimiter (Fix #1)
    secretUsersPrefix: `lark-mcp-on-agentcore/users/${slug}`,        // path segment (Fix #3)
    stateParam: `/lark-mcp-on-agentcore/${slug}/state-secret`,       // path segment (Fix #2)
    oauthSecretParam: `/lark-mcp-on-agentcore/${slug}/oauth-client-secret`,
    webhookSsmName: `/lark-mcp-on-agentcore/${slug}/alarm-webhook-url`,
    codeTable: `lark-mcp-on-agentcore-oauth-codes-${slug}`,
    openidTable: `lark-mcp-on-agentcore-openid-map-${slug}`,
    oauthClientId: `lark-mcp-on-agentcore-${slug}`,
    dashboardName: `lark-mcp-on-agentcore-${slug}`,
    snsTopic: `lark-mcp-on-agentcore-alarms-${slug}`,
    apiName: `lark-mcp-on-agentcore-oauth-${slug}`,
    metricNamespace: `LarkMcpOnAgentCore/${slug}`,
    oauthStack: `LarkMcpOnAgentCoreOAuth-${slug}`,                   // transform #2: stack suffix
    runtimeStack: `LarkMcpOnAgentCoreRuntime-${slug}`,
    wafStack: "LarkMcpOnAgentCoreWaf",                              // SHARED, never suffixed
  };
}

/** Read the slug from CDK context (`-c slug=...`) or APP_SLUG env; default empty.
 *  IMPORTANT: a context `slug` key that is PRESENT (even empty string, as
 *  `deploy.sh` passes for the default app via `-c slug=`) is authoritative and
 *  must NOT fall through to the ambient APP_SLUG env var — otherwise a default
 *  deploy run in a shell that has `APP_SLUG=team-a` exported would synthesize the
 *  slugged stack ids while `deploy.sh` selects the bare ones (stack-not-found /
 *  wrong-app). The env var is only a fallback when the key is entirely absent
 *  (e.g. a bare `cdk synth`). */
export function slugFromContext(app: { node: { tryGetContext(k: string): unknown } }): string {
  const ctx = app.node.tryGetContext("slug");
  if (typeof ctx === "string") return ctx;        // key present (incl. "") wins
  return process.env.APP_SLUG || "";              // key absent → env fallback
}

import { describe, it, expect, afterEach } from "vitest";
import { resolveSlug, validateSlug, RESERVED_SLUGS, slugFromContext } from "../lib/slug-names";

// TS mirror of scripts/lib/slug.sh — must stay byte-identical for the DEFAULT
// (empty) sentinel so the existing single deployment is undisturbed.
describe("resolveSlug — default sentinel (empty) == today's byte-identical names", () => {
  const n = resolveSlug("");
  it("slug + suffix empty", () => {
    expect(n.slug).toBe("");
    expect(n.suffix).toBe("");
  });
  it("runtime name", () => expect(n.runtimeName).toBe("lark_mcp_on_agentcore"));
  it("feishu secret", () => expect(n.feishuSecret).toBe("lark-mcp-on-agentcore/feishu-app"));
  it("users prefix", () => expect(n.secretUsersPrefix).toBe("lark-mcp-on-agentcore/users"));
  it("state param", () => expect(n.stateParam).toBe("/lark-mcp-on-agentcore/state-secret"));
  it("oauth-client-secret param", () => expect(n.oauthSecretParam).toBe("/lark-mcp-on-agentcore/oauth-client-secret"));
  it("webhook ssm", () => expect(n.webhookSsmName).toBe("/lark-mcp-on-agentcore/alarm-webhook-url"));
  it("code table", () => expect(n.codeTable).toBe("lark-mcp-on-agentcore-oauth-codes"));
  it("openid table", () => expect(n.openidTable).toBe("lark-mcp-on-agentcore-openid-map"));
  it("oauth client id", () => expect(n.oauthClientId).toBe("lark-mcp-on-agentcore"));
  it("dashboard", () => expect(n.dashboardName).toBe("lark-mcp-on-agentcore"));
  it("sns topic", () => expect(n.snsTopic).toBe("lark-mcp-on-agentcore-alarms"));
  it("api name", () => expect(n.apiName).toBe("lark-mcp-on-agentcore-oauth"));
  it("metric namespace", () => expect(n.metricNamespace).toBe("LarkMcpOnAgentCore"));
  it("stacks", () => {
    expect(n.oauthStack).toBe("LarkMcpOnAgentCoreOAuth");
    expect(n.runtimeStack).toBe("LarkMcpOnAgentCoreRuntime");
    expect(n.wafStack).toBe("LarkMcpOnAgentCoreWaf");
  });
});

describe("resolveSlug — slugged names (team-a)", () => {
  const n = resolveSlug("team-a");
  it("slug + suffix", () => { expect(n.slug).toBe("team-a"); expect(n.suffix).toBe("-team-a"); });
  it("runtime name underscores hyphens (injective)", () => expect(n.runtimeName).toBe("lark_mcp_on_agentcore_team_a"));
  it("feishu secret uses SLASH delimiter (Fix #1)", () => expect(n.feishuSecret).toBe("lark-mcp-on-agentcore/feishu-app/team-a"));
  it("users prefix is path segment (Fix #3)", () => expect(n.secretUsersPrefix).toBe("lark-mcp-on-agentcore/users/team-a"));
  it("state param is path segment (Fix #2)", () => expect(n.stateParam).toBe("/lark-mcp-on-agentcore/team-a/state-secret"));
  it("oauth-client-secret param", () => expect(n.oauthSecretParam).toBe("/lark-mcp-on-agentcore/team-a/oauth-client-secret"));
  it("webhook ssm", () => expect(n.webhookSsmName).toBe("/lark-mcp-on-agentcore/team-a/alarm-webhook-url"));
  it("code + openid tables", () => {
    expect(n.codeTable).toBe("lark-mcp-on-agentcore-oauth-codes-team-a");
    expect(n.openidTable).toBe("lark-mcp-on-agentcore-openid-map-team-a");
  });
  it("oauth client id / dashboard / sns / api", () => {
    expect(n.oauthClientId).toBe("lark-mcp-on-agentcore-team-a");
    expect(n.dashboardName).toBe("lark-mcp-on-agentcore-team-a");
    expect(n.snsTopic).toBe("lark-mcp-on-agentcore-alarms-team-a");
    expect(n.apiName).toBe("lark-mcp-on-agentcore-oauth-team-a");
  });
  it("metric namespace is per-slug (slash)", () => expect(n.metricNamespace).toBe("LarkMcpOnAgentCore/team-a"));
  it("OAuth+Runtime stacks suffixed; WAF stays SHARED", () => {
    expect(n.oauthStack).toBe("LarkMcpOnAgentCoreOAuth-team-a");
    expect(n.runtimeStack).toBe("LarkMcpOnAgentCoreRuntime-team-a");
    expect(n.wafStack).toBe("LarkMcpOnAgentCoreWaf");
  });
});

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    for (const s of ["a", "a1", "team-a", "hr-prod", "abcdefghij0123456789"]) {
      expect(validateSlug(s), s).toBe(true);
    }
  });
  it("rejects invalid slugs", () => {
    for (const s of ["Team", "team_a", "team/a", "-team", "team-", "team--a", "a---b", "1team", "abcdefghij0123456789x", "team.a", "team a", ""]) {
      expect(validateSlug(s), s).toBe(false);
    }
  });
  it("rejects reserved words", () => {
    for (const s of RESERVED_SLUGS) expect(validateSlug(s), s).toBe(false);
  });
  it("resolveSlug throws on an invalid non-empty slug", () => {
    expect(() => resolveSlug("Bad_Slug")).toThrow();
    expect(() => resolveSlug("default")).toThrow();
  });
});

describe("slugFromContext — present-but-empty context wins over ambient APP_SLUG", () => {
  const ctx = (slug: unknown) => ({ node: { tryGetContext: (k: string) => (k === "slug" ? slug : undefined) } });
  const origEnv = process.env.APP_SLUG;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.APP_SLUG; else process.env.APP_SLUG = origEnv;
  });

  it("a present empty-string context slug (deploy.sh default `-c slug=`) yields '' even if APP_SLUG is set", () => {
    // Regression guard: a default deploy run in a shell with APP_SLUG=team-a
    // exported must NOT synthesize the slugged stack ids.
    process.env.APP_SLUG = "team-a";
    expect(slugFromContext(ctx(""))).toBe("");
  });

  it("a present non-empty context slug wins over APP_SLUG", () => {
    process.env.APP_SLUG = "team-b";
    expect(slugFromContext(ctx("team-a"))).toBe("team-a");
  });

  it("falls back to APP_SLUG only when the context key is entirely absent", () => {
    process.env.APP_SLUG = "team-a";
    expect(slugFromContext(ctx(undefined))).toBe("team-a");
  });

  it("defaults to empty when neither context nor env is set", () => {
    delete process.env.APP_SLUG;
    expect(slugFromContext(ctx(undefined))).toBe("");
  });
});

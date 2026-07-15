import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OAuthStack } from "../lib/oauth-stack";

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

function synth(): Template {
  const app = new cdk.App();
  const stack = new OAuthStack(app, "HardenStack", {
    env: TEST_ENV,
    runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test",
  });
  return Template.fromStack(stack);
}

describe("hardening: API Gateway stage throttling", () => {
  const template = synth();

  it("the prod stage sets a request rate + burst limit (defense even if WAF is skipped)", () => {
    template.hasResourceProperties("AWS::ApiGateway::Stage", {
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          ThrottlingRateLimit: Match.anyValue(),
          ThrottlingBurstLimit: Match.anyValue(),
          HttpMethod: "*",
          ResourcePath: "/*",
        }),
      ]),
    });
  });
});

describe("hardening: public Lambdas have a reserved concurrency cap", () => {
  const template = synth();

  it("middleware Lambda caps ReservedConcurrentExecutions (DoS / cost blast radius)", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "HardenStack-middleware",
      ReservedConcurrentExecutions: Match.anyValue(),
    });
  });

  it("oauth Lambda caps ReservedConcurrentExecutions", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "HardenStack-oauth",
      ReservedConcurrentExecutions: Match.anyValue(),
    });
  });
});

describe("hardening: log retention defaults to finite (not INFINITE)", () => {
  it("LogGroups get a bounded retention even when LOG_RETENTION_DAYS is unset", () => {
    const template = synth();
    // Every Lambda log group must carry a RetentionInDays (no unbounded growth).
    const groups = template.findResources("AWS::Logs::LogGroup");
    const vals = Object.values(groups).map((g: any) => g.Properties?.RetentionInDays);
    expect(vals.length).toBeGreaterThan(0);
    expect(vals.every((v) => typeof v === "number" && v > 0)).toBe(true);
  });
});

describe("hardening: OAuth Lambda write grant is scoped to users/*, not the whole project prefix", () => {
  const template = synth();

  it("does NOT grant PutSecretValue/CreateSecret on the broad lark-mcp-on-agentcore/* prefix", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    const json = JSON.stringify(policies);
    // The broad write grant (which also covers the feishu-app master secret) must be gone.
    const broadWrite = Object.values(policies).some((p: any) =>
      (p.Properties?.PolicyDocument?.Statement ?? []).some((s: any) => {
        const actions = ([] as string[]).concat(s.Action ?? []);
        const writes = actions.includes("secretsmanager:PutSecretValue") || actions.includes("secretsmanager:CreateSecret");
        const res = JSON.stringify(s.Resource ?? "");
        // broad = ends at project root "/*" rather than "/users/*"
        return writes && res.includes("lark-mcp-on-agentcore/*") && !res.includes("users/*");
      })
    );
    expect(broadWrite, "OAuth write grant still uses the broad project prefix").toBe(false);
    // And the narrowed users/* write grant must be present.
    expect(json).toContain("users/*");
    // DeleteSecret must be granted (for revoked-user cleanup) and scoped to users/*
    expect(json).toContain("secretsmanager:DeleteSecret");
    // RestoreSecret must be granted (re-auth within the 7-day recovery window)
    expect(json).toContain("secretsmanager:RestoreSecret");
  });
});

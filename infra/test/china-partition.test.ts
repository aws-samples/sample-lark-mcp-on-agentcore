import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { OAuthStack } from "../lib/oauth-stack";
import { RuntimeStack } from "../lib/runtime-stack";

// AWS China (aws-cn) partition support: ARNs must be arn:aws-cn:..., endpoint
// DNS suffix amazonaws.com.cn, and CloudFront is skipped (CloudFront in the
// China regions no longer accepts new customers and is being retired).
const CN_ENV = { account: "123456789012", region: "cn-northwest-1" };

function cnTemplates() {
  const app = new cdk.App();
  const oauth = new OAuthStack(app, "OAuthCn", {
    env: CN_ENV,
    runtimeArn: "arn:aws-cn:bedrock-agentcore:cn-northwest-1:123456789012:runtime/test",
  });
  const runtime = new RuntimeStack(app, "RuntimeCn", { env: CN_ENV });
  return { oauth: Template.fromStack(oauth), runtime: Template.fromStack(runtime) };
}

describe("aws-cn partition synth (cn-northwest-1)", () => {
  const { oauth, runtime } = cnTemplates();
  const oauthJson = JSON.stringify(oauth.toJSON());
  const runtimeJson = JSON.stringify(runtime.toJSON());

  it("emits no aws-partition ARNs", () => {
    expect(oauthJson).not.toMatch(/"arn:aws:/);
    expect(runtimeJson).not.toMatch(/"arn:aws:/);
    expect(oauthJson).toContain("arn:aws-cn:secretsmanager:cn-northwest-1:");
    expect(oauthJson).toContain("arn:aws-cn:bedrock-agentcore:cn-northwest-1:");
    expect(runtimeJson).toContain("arn:aws-cn:secretsmanager:cn-northwest-1:");
  });

  it("injects URL_SUFFIX=amazonaws.com.cn into the middleware", () => {
    oauth.hasResourceProperties("AWS::Lambda::Function", {
      Environment: { Variables: { DEPLOY_REGION: "cn-northwest-1", URL_SUFFIX: "amazonaws.com.cn" } },
    });
  });

  it("skips CloudFront and exposes the API Gateway URL", () => {
    oauth.resourceCountIs("AWS::CloudFront::Distribution", 0);
    expect(oauthJson).toContain(".execute-api.cn-northwest-1.amazonaws.com.cn/");
  });

  it("runtime role trusts bedrock-agentcore.amazonaws.com (same principal in aws-cn)", () => {
    runtime.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "bedrock-agentcore.amazonaws.com" } }],
      },
    });
  });
});

describe("aws partition unchanged", () => {
  it("still creates CloudFront and aws ARNs in us-west-2", () => {
    const app = new cdk.App();
    const oauth = new OAuthStack(app, "OAuthUs", { env: { account: "123456789012", region: "us-west-2" }, runtimeArn: "" });
    const t = Template.fromStack(oauth);
    t.resourceCountIs("AWS::CloudFront::Distribution", 1);
    expect(JSON.stringify(t.toJSON())).not.toContain("aws-cn");
  });
});

describe("AgentCore Runtime is a CloudFormation resource (cn-northwest-1)", () => {
  const app = new cdk.App();
  const stack = new RuntimeStack(app, "RuntimeCnCfn", {
    env: CN_ENV,
    appId: "cli_test",
    authorizeBase: "https://abc.execute-api.cn-northwest-1.amazonaws.com.cn",
    idleTimeoutSeconds: 900,
  });
  const t = Template.fromStack(stack);

  it("creates exactly one Runtime with the expected config", () => {
    t.resourceCountIs("AWS::BedrockAgentCore::Runtime", 1);
    t.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
      AgentRuntimeName: "lark_mcp_on_agentcore",
      ProtocolConfiguration: "MCP",
      NetworkConfiguration: { NetworkMode: "PUBLIC" },
      LifecycleConfiguration: { IdleRuntimeSessionTimeout: 900 },
      RequestHeaderConfiguration: {
        RequestHeaderAllowlist: ["X-User-Access-Token", "X-Runtime-User-Id", "X-Incr-Auth-Token"],
      },
      EnvironmentVariables: {
        APP_ID: "cli_test",
        AWS_REGION: "cn-northwest-1",
        AUTHORIZE_BASE: "https://abc.execute-api.cn-northwest-1.amazonaws.com.cn",
        LARKSUITE_CLI_BRAND: "feishu",
      },
    });
  });

  it("declares no custom endpoint (traffic uses the service-managed DEFAULT endpoint)", () => {
    // A CfnRuntimeEndpoint races the runtime version reaching READY and fails
    // with 409 on a fresh deploy, so none is declared.
    t.resourceCountIs("AWS::BedrockAgentCore::RuntimeEndpoint", 0);
  });

  it("OAuth dashboard name carries the region (dashboards are account-global)", () => {
    const app2 = new cdk.App();
    const oauth = new OAuthStack(app2, "OAuthCnDash", {
      env: CN_ENV,
      runtimeArn: "arn:aws-cn:bedrock-agentcore:cn-northwest-1:123456789012:runtime/test",
    });
    Template.fromStack(oauth).hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardName: "lark-mcp-on-agentcore-cn-northwest-1",
    });
  });

  it("exports RuntimeArn for deploy.sh", () => {
    t.hasOutput("RuntimeArn", { Value: { "Fn::GetAtt": ["AgentRuntime", "AgentRuntimeArn"] } });
  });
});

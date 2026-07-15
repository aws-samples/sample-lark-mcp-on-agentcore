import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { OAuthStack } from "../lib/oauth-stack";
import { WafStack } from "../lib/waf-stack";
import { RuntimeStack } from "../lib/runtime-stack";

/**
 * CDK Snapshot Tests
 *
 * These tests synthesize each stack and compare the resulting CloudFormation
 * template against a stored snapshot. They catch unintended IAM policy changes,
 * resource additions/removals, or environment variable drift.
 *
 * To update snapshots after intentional changes:
 *   npx vitest run test/snapshot.test.ts --update
 */

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

// Docker asset hashes vary across machines (different OS, Docker version, etc).
// Normalize them before snapshot comparison to avoid CI/local divergence.
function normalizeTemplate(tpl: Record<string, any>): Record<string, any> {
  const json = JSON.stringify(tpl);
  const normalized = json.replace(/cdk-hnb659fds-container-assets-[^:]+:[a-f0-9]{64}/g, 'cdk-hnb659fds-container-assets-ACCOUNT-REGION:ASSET_HASH');
  return JSON.parse(normalized);
}

describe("CDK Snapshot Tests", () => {
  it("OAuthStack matches snapshot", () => {
    const app = new cdk.App();
    const stack = new OAuthStack(app, "TestOAuthStack", {
      env: TEST_ENV,
      runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test-runtime",
      customDomain: "mcp.example.com",
      webAclArn: "arn:aws:wafv2:us-east-1:123456789012:global/webacl/test-acl/abc123",
    });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });

  it("WafStack matches snapshot", () => {
    const app = new cdk.App();
    const stack = new WafStack(app, "TestWafStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });

  it("RuntimeStack matches snapshot", () => {
    const app = new cdk.App();
    const stack = new RuntimeStack(app, "TestRuntimeStack", {
      env: TEST_ENV,
    });

    const template = Template.fromStack(stack);
    expect(normalizeTemplate(template.toJSON())).toMatchSnapshot();
  });
});

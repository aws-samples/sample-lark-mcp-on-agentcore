import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OAuthStack } from "../lib/oauth-stack";

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

function oauthTemplate(slug: string): Template {
  const app = new cdk.App();
  const stack = new OAuthStack(app, slug ? `OAuth-${slug}` : "OAuth", {
    env: TEST_ENV,
    slug,
    runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test",
  });
  return Template.fromStack(stack);
}

describe("OAuthStack — customer-managed KMS key for user token secrets", () => {
  const t = oauthTemplate("");

  it("creates a CMK with rotation enabled and RETAIN (so secrets stay decryptable)", () => {
    t.hasResourceProperties("AWS::KMS::Key", { EnableKeyRotation: true });
    t.hasResource("AWS::KMS::Key", { DeletionPolicy: "Retain" });
  });

  it("each app (stack) owns exactly ONE CMK — per-slug isolation", () => {
    // Per-slug CMK: one OAuthStack = one app = one key. A slugged stack must also
    // produce its own single key, never share the default's.
    expect(Object.keys(t.findResources("AWS::KMS::Key")).length).toBe(1);
    expect(Object.keys(oauthTemplate("team-a").findResources("AWS::KMS::Key")).length).toBe(1);
  });

  it("oauthFn role gets Encrypt + Decrypt + GenerateDataKey + DescribeKey (needs to create/swap keys)", () => {
    // kms:Encrypt is load-bearing: without it UpdateSecret SILENTLY skips re-encryption.
    const policies = JSON.stringify(Object.values(t.findResources("AWS::IAM::Policy")));
    for (const action of ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]) {
      expect(policies, `oauthFn must be granted ${action}`).toContain(action);
    }
  });

  it("oauthFn gets the new SM actions UpdateSecret + DescribeSecret (for the key swap)", () => {
    const policies = JSON.stringify(Object.values(t.findResources("AWS::IAM::Policy")));
    expect(policies).toContain("secretsmanager:UpdateSecret");
    expect(policies).toContain("secretsmanager:DescribeSecret");
  });

  it("the CMK ARN is threaded to the OAuth Lambda via USER_SECRET_KMS_KEY_ARN", () => {
    // The migration loop reads this env var; without it the swap is a silent no-op.
    t.hasResourceProperties("AWS::Lambda::Function", {
      Environment: { Variables: Match.objectLike({ USER_SECRET_KMS_KEY_ARN: Match.anyValue() }) },
    });
  });

  it("exposes the CMK ARN as a CfnOutput so deploy.sh can re-thread it on every deploy", () => {
    // deploy.sh REPLACES the whole Lambda env, so it must read this output and
    // re-add USER_SECRET_KMS_KEY_ARN, else the next deploy wipes it.
    const outputs = t.findOutputs("*");
    expect(Object.keys(outputs)).toContain("UserSecretKmsKeyArn");
  });

  it("default app's nested-secret Deny still fences UpdateSecret/DescribeSecret (Deny on users/*/*)", () => {
    // The Deny is `secretsmanager:*` so the newly-added actions are auto-covered;
    // assert it survives so a slugged app's tokens can't be described/re-keyed by default.
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Action: "secretsmanager:*",
            Resource: Match.stringLikeRegexp("secret:lark-mcp-on-agentcore/users/\\*/\\*$"),
          }),
        ]),
      },
    });
  });
});

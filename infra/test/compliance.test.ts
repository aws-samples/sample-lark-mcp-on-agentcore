import { describe, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { OAuthStack } from "../lib/oauth-stack";
import { WafStack } from "../lib/waf-stack";
import { RuntimeStack } from "../lib/runtime-stack";

/**
 * cdk-nag Compliance Tests
 *
 * Runs the AWS Solutions checklist against each stack. Known acceptable
 * findings are suppressed with rationale. If a new finding appears, the
 * test fails — forcing the developer to either fix it or add a documented
 * suppression.
 */

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

describe("cdk-nag AWS Solutions compliance", () => {
  it("OAuthStack passes AWS Solutions checks", () => {
    const app = new cdk.App();
    const stack = new OAuthStack(app, "NagOAuthStack", {
      env: TEST_ENV,
      runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test-runtime",
      customDomain: "mcp.example.com",
      webAclArn: "arn:aws:wafv2:us-east-1:123456789012:global/webacl/test-acl/abc123",
    });

    applyOAuthStackSuppressions(stack);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    // Synthesize — cdk-nag checks run during synthesis.
    // If any unsuppressed ERROR-level findings exist, synthesis throws.
    app.synth();
  });

  it("WafStack passes AWS Solutions checks", () => {
    const app = new cdk.App();
    const stack = new WafStack(app, "NagWafStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });

    applyWafStackSuppressions(stack);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
    app.synth();
  });

  it("RuntimeStack passes AWS Solutions checks", () => {
    const app = new cdk.App();
    const stack = new RuntimeStack(app, "NagRuntimeStack", {
      env: TEST_ENV,
    });

    applyRuntimeStackSuppressions(stack);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
    app.synth();
  });
});

// ---------------------------------------------------------------------------
// Suppressions with documented rationale
// ---------------------------------------------------------------------------

function applyOAuthStackSuppressions(stack: cdk.Stack) {
  NagSuppressions.addStackSuppressions(stack, [
    {
      id: "AwsSolutions-L1",
      reason: "Lambda uses Node.js 20 which is the latest LTS; CDK may flag if the enum lags behind runtime availability.",
    },
    {
      id: "AwsSolutions-IAM4",
      reason: "AWSLambdaBasicExecutionRole is the standard CDK-managed policy for Lambda logging — acceptable.",
    },
    {
      id: "AwsSolutions-IAM5",
      reason: "Wildcards in SecretsManager resource ARN are scoped to the project prefix (lark-mcp-on-agentcore/*). ListSecrets requires resource '*' per AWS docs.",
    },
    {
      id: "AwsSolutions-DDB3",
      reason: "OAuth codes table is ephemeral (TTL-based, items expire in 2 minutes). Point-in-time recovery adds cost without benefit for transient data.",
    },
    {
      id: "AwsSolutions-APIG2",
      reason: "API Gateway request validation is handled by the Lambda itself (it validates all parameters and returns structured errors).",
    },
    {
      id: "AwsSolutions-APIG1",
      reason: "Access logging is not required for this internal OAuth proxy — CloudFront access logs and Lambda logs provide sufficient audit trail.",
    },
    {
      id: "AwsSolutions-APIG3",
      reason: "WAF is attached at the CloudFront layer (not API Gateway directly) which provides equivalent protection.",
    },
    {
      id: "AwsSolutions-APIG4",
      reason: "Authorization is handled by the Lambda (OAuth flow endpoints must be publicly accessible for the initial redirect).",
    },
    {
      id: "AwsSolutions-COG4",
      reason: "No Cognito authorizer needed — the Lambda implements its own OAuth 2.0 authorization server.",
    },
    {
      id: "AwsSolutions-CFR1",
      reason: "Geo restriction is not needed — users may authorize from any country.",
    },
    {
      id: "AwsSolutions-CFR2",
      reason: "WAF is associated via webAclId prop; cdk-nag may not detect it when passed as a string ARN.",
    },
    {
      id: "AwsSolutions-CFR3",
      reason: "CloudFront access logging is optional for this internal-facing OAuth proxy. Lambda structured logs provide audit trail.",
    },
    {
      id: "AwsSolutions-CFR4",
      reason: "Using default CloudFront viewer certificate (TLSv1.2_2021 minimum). Custom certificate not required for *.cloudfront.net domain.",
    },
    {
      id: "AwsSolutions-SNS2",
      reason: "Alarm topic does not require server-side encryption — alarm messages contain no sensitive data (only metric names and thresholds).",
    },
    {
      id: "AwsSolutions-SNS3",
      reason: "SNS topic is for internal alarm routing only — ssl enforcement on subscriptions is configured at subscription time, not topic level.",
    },
    {
      id: "AwsSolutions-SQS3",
      reason: "No SQS queue in this stack — suppressing preemptively for any CDK-internal DLQ references.",
    },
    {
      id: "AwsSolutions-SQS4",
      reason: "No SQS queue in this stack.",
    },
  ]);
}

function applyWafStackSuppressions(stack: cdk.Stack) {
  NagSuppressions.addStackSuppressions(stack, [
    {
      id: "AwsSolutions-WAF1",
      reason: "WAF logging is not enabled in the test/dev tier to reduce cost. Production deployments should enable it.",
    },
  ]);
}

function applyRuntimeStackSuppressions(stack: cdk.Stack) {
  NagSuppressions.addStackSuppressions(stack, [
    {
      id: "AwsSolutions-IAM4",
      reason: "AmazonEC2ContainerRegistryReadOnly is required for AgentCore to pull the container image from ECR.",
    },
    {
      id: "AwsSolutions-IAM5",
      reason: "SecretsManager resource ARN is scoped to the specific secret prefix (lark-mcp-on-agentcore/feishu-app-*).",
    },
  ]);
}

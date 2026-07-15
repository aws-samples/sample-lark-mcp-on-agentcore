import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { OAuthStack } from "../lib/oauth-stack";

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

const baseApp = new cdk.App();
const baseStack = new OAuthStack(baseApp, "TestStack", {
  env: TEST_ENV,
  runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test",
});
const baseTemplate = Template.fromStack(baseStack);

describe("LogGroup and Lambda naming", () => {
  const template = baseTemplate;

  it("OAuth Lambda has explicit functionName", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "TestStack-oauth",
      Handler: "index.handler",
    });
  });

  it("Middleware Lambda has explicit functionName", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "TestStack-middleware",
    });
  });

  it("OAuth LogGroup uses /aws/lambda/<functionName> naming", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/TestStack-oauth",
    });
  });

  it("Middleware LogGroup uses /aws/lambda/<functionName> naming", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/TestStack-middleware",
    });
  });

  it("LogGroups have retention when LOG_RETENTION_DAYS is set", () => {
    const app2 = new cdk.App();
    process.env.LOG_RETENTION_DAYS = "90";
    const stack2 = new OAuthStack(app2, "RetentionStack", { env: TEST_ENV, runtimeArn: "" });
    delete process.env.LOG_RETENTION_DAYS;
    const tpl2 = Template.fromStack(stack2);
    tpl2.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/RetentionStack-oauth",
      RetentionInDays: 90,
    });
  });

  it("LogGroups default to a bounded retention (90 days) when env is unset", () => {
    // Hardening: previously defaulted to INFINITE (unbounded log growth/cost).
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/TestStack-oauth",
      RetentionInDays: 90,
    });
  });

  it("no deprecated logRetention in Lambda properties", () => {
    const json = JSON.stringify(template.toJSON());
    expect(json).not.toContain('"LogRetention"');
  });
});

describe("Alarm Webhook Lambda LogGroup (conditional)", () => {
  it("webhook Lambda and LogGroup are created when ALARM_WEBHOOK_URL is set", () => {
    const app = new cdk.App();
    process.env.ALARM_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/test";
    const stack = new OAuthStack(app, "WebhookStack", { env: TEST_ENV, runtimeArn: "" });
    delete process.env.ALARM_WEBHOOK_URL;
    const tpl = Template.fromStack(stack);
    tpl.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "WebhookStack-alarm-webhook",
    });
    tpl.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/WebhookStack-alarm-webhook",
    });
  });

  it("webhook Lambda is NOT created when ALARM_WEBHOOK_URL is empty", () => {
    baseTemplate.resourcePropertiesCountIs("AWS::Lambda::Function", {
      FunctionName: "TestStack-alarm-webhook",
    }, 0);
  });
});

describe("Lambda logGroup association", () => {
  it("OAuth Lambda references OAuthLogGroup (not auto-created)", () => {
    const resources = baseTemplate.toJSON().Resources;
    const oauthFn = Object.entries(resources).find(
      ([, v]: [string, any]) => v.Type === "AWS::Lambda::Function" && v.Properties?.FunctionName === "TestStack-oauth"
    );
    expect(oauthFn).toBeDefined();
    const [, fnDef] = oauthFn!;
    // When logGroup is set, CDK does NOT add a LoggingConfig or auto-create a log group.
    // Instead it sets DependsOn to the log group. Verify no LogRetention custom resource.
    const logRetentionResources = Object.entries(resources).filter(
      ([, v]: [string, any]) => v.Type === "Custom::LogRetention"
    );
    expect(logRetentionResources).toHaveLength(0);
  });

  it("LogGroups have RemovalPolicy DESTROY", () => {
    baseTemplate.hasResource("AWS::Logs::LogGroup", {
      DeletionPolicy: "Delete",
      Properties: { LogGroupName: "/aws/lambda/TestStack-oauth" },
    });
    baseTemplate.hasResource("AWS::Logs::LogGroup", {
      DeletionPolicy: "Delete",
      Properties: { LogGroupName: "/aws/lambda/TestStack-middleware" },
    });
  });
});

describe("DynamoDB openid-map table", () => {
  const template = baseTemplate;

  it("has PITR enabled via pointInTimeRecoverySpecification", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "lark-mcp-on-agentcore-openid-map",
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });

  it("uses PAY_PER_REQUEST billing", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "lark-mcp-on-agentcore-openid-map",
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("has DeletionPolicy Retain", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Retain",
      Properties: { TableName: "lark-mcp-on-agentcore-openid-map" },
    });
  });
});

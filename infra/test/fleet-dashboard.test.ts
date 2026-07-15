import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { FleetDashboardStack } from "../lib/fleet-dashboard";

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

function synth(): Template {
  const app = new cdk.App();
  const stack = new FleetDashboardStack(app, "Fleet", { env: TEST_ENV });
  return Template.fromStack(stack);
}

describe("FleetDashboardStack — read-only cross-app roll-up", () => {
  const t = synth();
  const dashboards = t.findResources("AWS::CloudWatch::Dashboard");
  const body = JSON.stringify(Object.values(dashboards));

  it("creates exactly one dashboard named ...-fleet", () => {
    t.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    t.hasResourceProperties("AWS::CloudWatch::Dashboard", { DashboardName: "lark-mcp-on-agentcore-fleet" });
  });

  it("owns NO alarms and NO SNS topic (read-only, decoupled lifecycle)", () => {
    t.resourceCountIs("AWS::CloudWatch::Alarm", 0);
    t.resourceCountIs("AWS::SNS::Topic", 0);
  });

  it("uses UNQUOTED SEARCH tokens for custom metrics (spec major fix)", () => {
    // The custom-metric SEARCH must be the unquoted ` LarkMcpOnAgentCore ` token,
    // NOT the double-quoted exact form which would drop every slugged namespace.
    expect(body).toContain("SEARCH(' LarkMcpOnAgentCore MetricName=");
    // Guard against regressing to the broken double-quoted-namespace form
    // (i.e. a quote IMMEDIATELY before LarkMcpOnAgentCore inside the SEARCH term).
    expect(body).not.toMatch(/SEARCH\(' *\\+"LarkMcpOnAgentCore/);
    // And NOT the invalid schema-namespace glob.
    expect(body).not.toContain("{LarkMcpOnAgentCore/*}");
  });

  it("uses the AWS/Lambda + AWS/ApiGateway composite-token forms for vended metrics", () => {
    expect(body).toContain("{AWS/Lambda,FunctionName} LarkMcpOnAgentCore");
    expect(body).toContain("{AWS/ApiGateway,ApiName} lark-mcp-on-agentcore-oauth");
  });
});

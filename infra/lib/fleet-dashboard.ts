// infra/lib/fleet-dashboard.ts — a read-only cross-app roll-up dashboard.
//
// The hybrid observability model (spec 3) is: per-app SPLIT dashboards/alarms
// (built into OAuthStack, slug-suffixed) PLUS this single read-only roll-up that
// auto-discovers every app via CloudWatch SEARCH() expressions. It OWNS NOTHING
// (no alarms, no SNS topic) — deleting it can never affect alerting — so its
// lifecycle is fully decoupled from the per-app stacks.
//
// SEARCH syntax (verified, spec 3 major fix): expressions are UNQUOTED partial
// token matches. `LarkMcpOnAgentCore` is a consecutive substring of every per-app
// metric namespace (`LarkMcpOnAgentCore/<slug>`) and of the Lambda FunctionNames
// (`<slug>-LarkMcpOnAgentCoreOAuth-oauth`), so an unquoted token spans default +
// all slugs. Double-quoting would force an EXACT match and drop every slugged
// app — do NOT quote.

import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";

export type FleetDashboardProps = cdk.StackProps;

export class FleetDashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: FleetDashboardProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("project", "lark-mcp-on-agentcore");

    const search = (expr: string, label: string) =>
      new cloudwatch.MathExpression({ expression: expr, label, usingMetrics: {} });

    const dashboard = new cloudwatch.Dashboard(this, "FleetDashboard", {
      dashboardName: "lark-mcp-on-agentcore-fleet",
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: "## Fleet — all Lark MCP apps (auto-discovered via SEARCH)",
        width: 24,
        height: 1,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "MCP requests (all apps)",
        width: 12,
        // UNQUOTED token — spans the bare default namespace AND every LarkMcpOnAgentCore/<slug>.
        left: [search("SEARCH(' LarkMcpOnAgentCore MetricName=\"McpRequestOk\" ', 'Sum', 300)", "McpRequestOk")],
      }),
      new cloudwatch.GraphWidget({
        title: "Feishu not-authorized (all apps)",
        width: 12,
        left: [search("SEARCH(' LarkMcpOnAgentCore MetricName=\"FeishuNotAuthorized\" ', 'Sum', 300)", "FeishuNotAuthorized")],
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Lambda errors (all apps)",
        width: 12,
        left: [search("SEARCH(' {AWS/Lambda,FunctionName} LarkMcpOnAgentCore MetricName=\"Errors\" ', 'Sum', 300)", "Errors")],
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway 5XX (all apps)",
        width: 12,
        left: [search("SEARCH(' {AWS/ApiGateway,ApiName} lark-mcp-on-agentcore-oauth MetricName=\"5XXError\" ', 'Sum', 300)", "5XXError")],
      }),
    );

    new cdk.CfnOutput(this, "FleetDashboardUrl", {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=lark-mcp-on-agentcore-fleet`,
    });
  }
}

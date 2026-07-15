import * as cdk from "aws-cdk-lib";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

/**
 * CloudFront-scope WAF must be deployed to us-east-1.
 * Provides rate limiting on /authorize to deter brute-force OAuth flows.
 */
export class WafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("project", "lark-mcp-on-agentcore");

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: "lark-mcp-on-agentcore-waf",
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "lark-mcp-on-agentcore-waf",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "rate-limit-authorize",
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 100,
              aggregateKeyType: "IP",
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: "/authorize",
                  fieldToMatch: { uriPath: {} },
                  textTransformations: [{ priority: 0, type: "NONE" }],
                  positionalConstraint: "CONTAINS",
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "rate-limit-authorize",
            sampledRequestsEnabled: true,
          },
        },
        {
          // Generic per-IP rate limit on the whole site (defense against bot crawls).
          name: "rate-limit-global",
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "rate-limit-global",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, "WebAclArn", { value: webAcl.attrArn });
  }
}

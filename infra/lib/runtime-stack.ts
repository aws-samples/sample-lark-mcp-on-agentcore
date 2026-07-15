import * as cdk from "aws-cdk-lib";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";
import { resolveSlug } from "./slug-names";

export interface RuntimeStackProps extends cdk.StackProps {
  /** Per-app slug; empty = default sentinel (byte-identical names). */
  slug?: string;
}

export class RuntimeStack extends cdk.Stack {
  public readonly runtimeRole: iam.Role;
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("project", "lark-mcp-on-agentcore");

    // Docker image (auto build + push)
    const image = new ecr_assets.DockerImageAsset(this, "LarkMcpImage", {
      directory: path.join(__dirname, "../../docker"),
      platform: ecr_assets.Platform.LINUX_ARM64,
    });
    this.imageUri = image.imageUri;

    // IAM role for AgentCore Runtime
    this.runtimeRole = new iam.Role(this, "RuntimeRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
    });
    this.runtimeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly")
    );
    // Container fetches APP_SECRET from Secrets Manager at startup.
    // Killer Fix #1: scope the grant to THIS app's secret only. The default app
    // keeps `feishu-app-*`; a slugged app uses the slash-delimited
    // `feishu-app/<slug>-*`, which the default's `feishu-app-*` cannot match
    // (the char after `feishu-app` is `/`, not `-`), so no cross-app read.
    const names = resolveSlug(props.slug ?? "");
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:${names.feishuSecret}-*`],
    }));

    // Outputs consumed by deploy.sh to wire AgentCore Runtime + Lambda env.
    new cdk.CfnOutput(this, "ImageUri", { value: image.imageUri });
    new cdk.CfnOutput(this, "RuntimeRoleArn", { value: this.runtimeRole.roleArn });
  }
}

import * as cdk from "aws-cdk-lib";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import { Construct } from "constructs";
import * as path from "path";
import { partitionOf } from "./partition";
import { resolveSlug } from "./slug-names";

export interface RuntimeStackProps extends cdk.StackProps {
  /** Per-app slug; empty = default sentinel (byte-identical names). */
  slug?: string;
  /** Feishu/Lark App ID injected into the container (APP_ID). */
  appId?: string;
  /** Public OAuth base URL (AUTHORIZE_BASE). Passed as a plain string, not a
   *  cross-stack reference, so an OAuth endpoint change never gets blocked by
   *  an in-use CloudFormation export. deploy.sh reads it from the OAuth stack. */
  authorizeBase?: string;
  /** AgentCore idle session timeout in seconds (default 600). */
  idleTimeoutSeconds?: number;
  /** lark-cli brand: "feishu" (default) or "lark". */
  larkBrand?: string;
}


export class RuntimeStack extends cdk.Stack {
  public readonly runtimeRole: iam.Role;
  public readonly imageUri: string;
  public readonly runtimeArn: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("project", "lark-mcp-on-agentcore");
    // aws / aws-cn — keeps hard-coded ARNs valid in the China partition.
    const partition = partitionOf(this);

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
      resources: [`arn:${partition}:secretsmanager:${this.region}:${this.account}:secret:${names.feishuSecret}-*`],
    }));

    // AgentCore Runtime (managed by CloudFormation; previously created/updated by
    // deploy.sh via boto3). A new image URI or config change produces a new
    // runtime version. Traffic goes to the service-managed DEFAULT endpoint,
    // which always tracks the latest version — the middleware invokes the
    // runtime ARN without a qualifier. No custom endpoint is declared: a
    // CfnRuntimeEndpoint can start creating before the runtime version is READY
    // and fail with 409 "Agent version 1 must be in READY status".
    const runtime = new agentcore.CfnRuntime(this, "AgentRuntime", {
      agentRuntimeName: names.runtimeName,
      description: "Lark MCP Server (lark-cli)",
      roleArn: this.runtimeRole.roleArn,
      agentRuntimeArtifact: { containerConfiguration: { containerUri: image.imageUri } },
      networkConfiguration: { networkMode: "PUBLIC" },
      protocolConfiguration: "MCP",
      lifecycleConfiguration: { idleRuntimeSessionTimeout: props.idleTimeoutSeconds ?? 600 },
      requestHeaderConfiguration: {
        requestHeaderAllowlist: ["X-User-Access-Token", "X-Runtime-User-Id", "X-Incr-Auth-Token"],
      },
      environmentVariables: {
        APP_ID: props.appId ?? "",
        APP_SECRET_ID: names.feishuSecret,
        AWS_REGION: this.region,
        LARKSUITE_CLI_BRAND: props.larkBrand === "lark" ? "lark" : "feishu",
        AUTHORIZE_BASE: props.authorizeBase ?? "",
      },
      tags: { project: "lark-mcp-on-agentcore", app: names.slug || "default" },
    });
    // The role's inline policy (ECR pull + secret read) must exist before the
    // service validates the runtime, or creation fails on image pull.
    runtime.node.addDependency(this.runtimeRole);

    this.runtimeArn = runtime.attrAgentRuntimeArn;

    // Outputs consumed by deploy.sh to wire the middleware Lambda env.
    new cdk.CfnOutput(this, "ImageUri", { value: image.imageUri });
    new cdk.CfnOutput(this, "RuntimeRoleArn", { value: this.runtimeRole.roleArn });
    new cdk.CfnOutput(this, "RuntimeArn", { value: runtime.attrAgentRuntimeArn });
    new cdk.CfnOutput(this, "RuntimeId", { value: runtime.attrAgentRuntimeId });
    new cdk.CfnOutput(this, "RuntimeVersion", { value: runtime.attrAgentRuntimeVersion });
  }
}

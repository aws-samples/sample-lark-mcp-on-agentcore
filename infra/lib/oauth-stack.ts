import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import * as path from "path";
import * as fs from "fs";
import { resolveSlug } from "./slug-names";

export interface OAuthStackProps extends cdk.StackProps {
  /** Per-app slug; empty = default sentinel (byte-identical names). */
  slug?: string;
  runtimeArn?: string;
  customDomain?: string;
  webAclArn?: string;
  domainVerification?: string;
}

const LOG_RETENTION_MAP: Record<string, logs.RetentionDays> = {
  "30": logs.RetentionDays.ONE_MONTH,
  "90": logs.RetentionDays.THREE_MONTHS,
  "180": logs.RetentionDays.SIX_MONTHS,
  "365": logs.RetentionDays.ONE_YEAR,
};

// Default to a bounded retention so logs don't accumulate (and bill) forever
// when LOG_RETENTION_DAYS is unset. Operators can raise it via the env var.
const DEFAULT_LOG_RETENTION = logs.RetentionDays.THREE_MONTHS;

function createLogGroup(scope: Construct, id: string, fnName: string, retention?: logs.RetentionDays): logs.LogGroup {
  return new logs.LogGroup(scope, id, {
    logGroupName: `/aws/lambda/${fnName}`,
    retention: retention ?? DEFAULT_LOG_RETENTION,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
}

export class OAuthStack extends cdk.Stack {
  public readonly oauthEndpoint: string;
  public readonly secretPrefix: string;
  private readonly appSecretId: string;

  constructor(scope: Construct, id: string, props: OAuthStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("project", "lark-mcp-on-agentcore");

    const logRetentionEnv = process.env.LOG_RETENTION_DAYS ?? "";
    const logRetention = LOG_RETENTION_MAP[logRetentionEnv];

    const i18nPath = path.join(__dirname, "../../config/i18n.json");
    let i18n: Record<string, Record<string, Record<string, string>>>;
    try {
      i18n = JSON.parse(fs.readFileSync(i18nPath, "utf8"));
    } catch (e: any) {
      throw new Error(`Failed to load config/i18n.json: ${e.message}`, { cause: e });
    }
    const lang = process.env.LARK_LANG || "zh";
    const dt = i18n.dashboard[lang] || i18n.dashboard.en;
    const anRaw = i18n.alarmNames?.[lang] || i18n.alarmNames?.en || {};

    const thresholdsPath = path.join(__dirname, "../../config/alarm-thresholds.json");
    const localOverridesPath = path.join(__dirname, "../../.local/alarm-thresholds.json");
    interface AlarmThreshold { threshold: number; period: number; evaluationPeriods: number }
    let thresholds: Record<string, AlarmThreshold>;
    try {
      thresholds = JSON.parse(fs.readFileSync(thresholdsPath, "utf8"));
    } catch (e: any) {
      throw new Error(`Failed to load config/alarm-thresholds.json: ${e.message}`, { cause: e });
    }
    if (fs.existsSync(localOverridesPath)) {
      const overrides: Record<string, number> = JSON.parse(fs.readFileSync(localOverridesPath, "utf8"));
      for (const [key, val] of Object.entries(overrides)) {
        if (thresholds[key]) thresholds[key].threshold = val;
      }
    }
    const th = (key: string) => thresholds[key] || { threshold: 5, period: 300, evaluationPeriods: 2 };

    // Per-app names. Empty slug = default sentinel = today's byte-identical
    // literals, so the default deployment synthesizes unchanged.
    const names = resolveSlug(props.slug ?? "");

    this.secretPrefix = names.secretUsersPrefix;
    this.appSecretId = names.feishuSecret;
    const stateSecretParam = names.stateParam;
    const metricNs = names.metricNamespace;

    // Cross-app IAM isolation for the DEFAULT app's user-secret grant.
    // The grant resource is `secret:${secretPrefix}/*`; for the default app that
    // is `users/*`, and IAM `*` matches `/`, so it would also cover every slugged
    // app's nested `users/<slug>/<openid>`. The runtime [^/]+ screen only limits
    // enumeration, not the IAM privilege. Add an explicit Deny on the 2+-segment
    // shape so the default role can touch only single-segment `users/<openid>`.
    // Slugged apps need no Deny: their `users/<slug>/*` already cannot reach a
    // sibling or the default. Empty slug = default = the only over-broad case.
    const denyNestedUserSecrets = (fn: lambda.Function) => {
      if (names.slug !== "") return; // slugged apps are already fenced
      fn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ["secretsmanager:*"],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:${this.secretPrefix}/*/*`],
      }));
    };

    // Slug-suffix every alarm name so per-app alarms don't collide on the
    // account-unique name. Default slug = empty suffix = byte-identical names.
    // Applied once here so both the Alarm `alarmName` and the dashboard's
    // fromAlarmArn reconstructions (which read the same `an.*`) stay in sync.
    const an: Record<string, string> = {};
    for (const [k, v] of Object.entries(anRaw)) {
      an[k] = names.suffix ? `${v} (${names.slug})` : v;
    }

    // Import the secret by name — deploy.sh creates/updates it outside CDK
    // so that `cdk deploy` never overwrites the real credentials with placeholders.
    const appSecret = secretsmanager.Secret.fromSecretNameV2(
      this, "FeishuAppSecret", this.appSecretId
    );

    const oauthClientId = names.oauthClientId;

    // Customer-managed KMS key (CMK) encrypting every user token secret. One key
    // per app (this stack) = per-slug isolation: a sibling app's Lambda role is
    // never on this key policy, so it cannot decrypt this app's tokens.
    // RETAIN so the key (and thus the ability to decrypt existing secrets) survives
    // a stack teardown; rotation on to satisfy cdk-nag KMSBackingKeyRotationEnabled.
    // The default key policy keeps account-root admin (the documented §1 threat
    // boundary): this CMK defends against least-privilege GetSecretValue readers,
    // NOT against IAM/KMS administrators.
    const userSecretKey = new kms.Key(this, "UserSecretKey", {
      description: `lark-mcp-on-agentcore user token secret encryption (${names.slug || "default"})`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const oauthFnName = `${this.stackName}-oauth`;
    const oauthLogGroup = createLogGroup(this, "OAuthLogGroup", oauthFnName, logRetention);
    const oauthFn = new nodejs.NodejsFunction(this, "OAuthFunction", {
      functionName: oauthFnName,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../lambda/token-refresh-shim/index.ts"),
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../package-lock.json"),
      handler: "handler",
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      // Cap concurrency so a traffic spike (or a WAF bypass) can't scale this
      // function to the whole account quota and starve other Lambdas / run up
      // cost. Override via OAUTH_RESERVED_CONCURRENCY.
      reservedConcurrentExecutions: parseInt(process.env.OAUTH_RESERVED_CONCURRENCY || "20", 10),
      logGroup: oauthLogGroup,
      environment: {
        CALLBACK_URL: "SET_AFTER_DEPLOY",
        SECRET_PREFIX: this.secretPrefix,
        APP_SECRET_ID: this.appSecretId,
        STATE_SECRET_PARAM: stateSecretParam,
        OAUTH_CLIENT_ID: oauthClientId,
        OAUTH_CLIENT_SECRET: "SET_AFTER_DEPLOY",
        ALLOWED_DOMAINS: props.customDomain || "",
        DOMAIN_VERIFICATION: props.domainVerification || "",
        // CreateSecret stamps this on new user secrets; the refresh loop migrates
        // existing ones onto it. deploy.sh re-threads it on every deploy (it
        // replaces the whole env), reading the UserSecretKmsKeyArn output below.
        USER_SECRET_KMS_KEY_ARN: userSecretKey.keyArn,
      },
      // @aws-sdk/lib-dynamodb is not in the Node.js 20 runtime; bundle it.
      bundling: { externalModules: ["@aws-sdk/client-*"], minify: true, target: "node20" },
    });

    appSecret.grantRead(oauthFn);
    oauthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${stateSecretParam}`],
    }));
    // Per-user token secrets only. Scoped to .../users/* — NOT the whole project
    // prefix — so a compromised OAuth Lambda cannot overwrite the feishu-app
    // master credential (read of which is granted separately via grantRead above).
    oauthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:CreateSecret",
        // Cleanup of revoked users (Feishu code 20016) during the refresh cycle.
        "secretsmanager:DeleteSecret",
        // Restore a secret in its 7-day recovery window when the user re-authorizes
        // before scheduled deletion completes (storeToken's pending-deletion path).
        "secretsmanager:RestoreSecret",
        // Required when CreateSecret is called with embedded Tags. Without this,
        // strict orgs with explicit Deny on TagResource block first-time
        // authorization for new users.
        "secretsmanager:TagResource",
        // CMK migration: read a secret's current KmsKeyId and swap it in-place.
        // Missing either ⇒ the first refresh cycle AccessDenies and no secret migrates.
        "secretsmanager:DescribeSecret",
        "secretsmanager:UpdateSecret",
      ],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:${this.secretPrefix}/*`],
    }));
    denyNestedUserSecrets(oauthFn);
    // oauthFn creates/updates secrets on the CMK, so it needs Encrypt as well as
    // Decrypt/GenerateDataKey. kms:Encrypt is load-bearing for the migration:
    // without it UpdateSecret SILENTLY skips re-encryption (AWS documented), so the
    // key swap would no-op with no error. DescribeKey lets SM resolve the key.
    userSecretKey.grant(oauthFn, "kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey");
    // ListSecrets is an account-level action and does not honor resource-scoping
    oauthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:ListSecrets"],
      resources: ["*"],
    }));

    // OAuth authorization codes
    const codeTable = new dynamodb.Table(this, "OAuthCodes", {
      tableName: names.codeTable,
      partitionKey: { name: "code", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    codeTable.grantReadWriteData(oauthFn);
    oauthFn.addEnvironment("CODE_TABLE", codeTable.tableName);

    // OpenID → stable userId mapping (migrated from Secrets Manager to DDB for cost)
    const openidTable = new dynamodb.Table(this, "OpenIdMap", {
      tableName: names.openidTable,
      partitionKey: { name: "openId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    openidTable.grantReadWriteData(oauthFn);
    oauthFn.addEnvironment("OPENID_TABLE", openidTable.tableName);

    // Middleware Lambda (MCP proxy: token verify → SM → AgentCore)
    const middlewareFnName = `${this.stackName}-middleware`;
    const middlewareLogGroup = createLogGroup(this, "MiddlewareLogGroup", middlewareFnName, logRetention);
    const middlewareFn = new nodejs.NodejsFunction(this, "MiddlewareFunction", {
      functionName: middlewareFnName,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../lambda/mcp-middleware/index.ts"),
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../package-lock.json"),
      handler: "handler",
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      // Hot path — cap concurrency to bound the DoS/cost blast radius (sized to
      // the AgentCore Runtime's capacity). Override via MIDDLEWARE_RESERVED_CONCURRENCY.
      reservedConcurrentExecutions: parseInt(process.env.MIDDLEWARE_RESERVED_CONCURRENCY || "50", 10),
      logGroup: middlewareLogGroup,
      environment: {
        RUNTIME_ARN: props.runtimeArn || "",
        SECRET_PREFIX: this.secretPrefix,
        STATE_SECRET_PARAM: stateSecretParam,
        AUTHORIZE_BASE: "SET_AFTER_DEPLOY",
        DEPLOY_REGION: this.region,
      },
      bundling: { externalModules: ["@aws-sdk/*"], minify: true, target: "node20" },
    });
    middlewareFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:${this.secretPrefix}/*`],
    }));
    denyNestedUserSecrets(middlewareFn);
    // MCP HOT PATH: middlewareFn GetSecretValue-reads the user token on every
    // request. Once secrets move to the CMK it MUST be able to Decrypt, or every
    // tool call KMS-AccessDenies and the data plane goes fully down. Read-only —
    // no Encrypt (it never writes). No env var needed (decrypt resolves the key
    // from the secret automatically).
    userSecretKey.grant(middlewareFn, "kms:Decrypt", "kms:DescribeKey");
    middlewareFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${stateSecretParam}`],
    }));
    middlewareFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock-agentcore:InvokeAgentRuntime"],
      resources: [`arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*`],
    }));

    // Single API Gateway: all routes (OAuth + MCP). Stage-level throttling is a
    // region-independent request-rate cap that applies even when the optional
    // CloudFront WAF is skipped (SKIP_WAF) or bypassed by hitting execute-api
    // directly — without it the OAuth/MCP endpoints would have no rate control.
    const api = new apigateway.RestApi(this, "OAuthApi", {
      restApiName: names.apiName,
      deployOptions: {
        throttlingRateLimit: parseInt(process.env.APIGW_RATE_LIMIT || "50", 10),
        throttlingBurstLimit: parseInt(process.env.APIGW_BURST_LIMIT || "100", 10),
      },
    });
    const oauthIntegration = new apigateway.LambdaIntegration(oauthFn);
    const mcpIntegration = new apigateway.LambdaIntegration(middlewareFn);

    api.root.addResource("authorize").addMethod("GET", oauthIntegration);
    api.root.addResource("callback").addMethod("GET", oauthIntegration);
    api.root.addResource("token").addMethod("POST", oauthIntegration);
    api.root.addResource("register").addMethod("POST", oauthIntegration); // RFC 7591 DCR
    const wellKnown = api.root.addResource(".well-known");
    wellKnown.addResource("oauth-authorization-server").addMethod("GET", oauthIntegration);
    wellKnown.addResource("oauth-protected-resource").addMethod("GET", oauthIntegration); // RFC 9728 PRM
    // AWS Security Agent domain-ownership verification (HTTP route method).
    // Inert unless DOMAIN_VERIFICATION is set on the OAuth Lambda (deploy.sh).
    wellKnown
      .addResource("aws")
      .addResource("securityagent-domain-verification.json")
      .addMethod("GET", oauthIntegration);

    // /register is unauthenticated — throttle tighter than the global stage limit.
    const registerRate = parseInt(process.env.REGISTER_RATE_LIMIT || "5", 10);
    const registerBurst = parseInt(process.env.REGISTER_BURST_LIMIT || "10", 10);
    (api.deploymentStage.node.defaultChild as apigateway.CfnStage).addPropertyOverride("MethodSettings", [
      { HttpMethod: "*", ResourcePath: "/*", ThrottlingRateLimit: parseInt(process.env.APIGW_RATE_LIMIT || "50", 10), ThrottlingBurstLimit: parseInt(process.env.APIGW_BURST_LIMIT || "100", 10) },
      { HttpMethod: "POST", ResourcePath: "/register", ThrottlingRateLimit: registerRate, ThrottlingBurstLimit: registerBurst },
    ]);

    const mcpResource = api.root.addResource("mcp");
    mcpResource.addMethod("POST", mcpIntegration);
    mcpResource.addMethod("GET", mcpIntegration);
    mcpResource.addMethod("DELETE", mcpIntegration);

    // CloudFront (single domain for OAuth + MCP)
    const distribution = new cloudfront.Distribution(this, "OAuthCF", {
      defaultBehavior: {
        origin: new origins.RestApiOrigin(api),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      webAclId: props.webAclArn,
    });

    this.oauthEndpoint = `https://${distribution.distributionDomainName}`;

    // CALLBACK_URL is set post-deploy by deploy.sh (avoids circular dependency with CloudFront)

    new events.Rule(this, "TokenRefreshRule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      targets: [new targets.LambdaFunction(oauthFn)],
    });

    // SNS topic + CloudWatch alarms.
    // Subscribe an email/Slack/Lark webhook after deploy:
    //   aws sns subscribe --topic-arn <AlarmTopicArn> --protocol email --notification-endpoint you@example.com
    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: names.snsTopic,
      displayName: "Lark MCP on AgentCore alarms",
    });
    const alarmAction = new cwActions.SnsAction(alarmTopic);

    // Token loss — most severe: refresh_token consumed but new tokens not stored.
    const tokenLossFilter = new logs.MetricFilter(this, "TokenLossFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "store_token_lost"),
      metricName: "TokenLost",
      metricNamespace: metricNs,
    });
    new cloudwatch.Alarm(this, "TokenLossAlarm", {
      alarmName: an.token_lost,
      metric: tokenLossFilter.metric({ statistic: "Sum", period: cdk.Duration.seconds(th("token_lost").period) }),
      threshold: th("token_lost").threshold,
      evaluationPeriods: th("token_lost").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // Per-cycle refresh failure count. Matches the structured log emitted
    // at the end of each EventBridge cron invocation in token-refresh-shim.
    const refreshFailedFilter = new logs.MetricFilter(this, "RefreshFailedFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.all(
        logs.FilterPattern.stringValue("$.event", "=", "refresh_cycle"),
        logs.FilterPattern.exists("$.failed"),
      ),
      metricName: "RefreshFailed",
      metricNamespace: metricNs,
      metricValue: "$.failed",
    });
    new cloudwatch.Alarm(this, "RefreshFailedAlarm", {
      alarmName: an.refresh_failed,
      metric: refreshFailedFilter.metric({ statistic: "Sum", period: cdk.Duration.seconds(th("refresh_failed").period) }),
      threshold: th("refresh_failed").threshold,
      evaluationPeriods: th("refresh_failed").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // CMK migration stragglers — user secrets still NOT on the per-app CMK after a
    // refresh cycle. Converges to 0 once every secret is migrated; staying > 0 is
    // the canary for a silent missing-kms:Encrypt (UpdateSecret returns OK but never
    // re-encrypts) or a stuck/misconfigured key. Long period + several eval periods
    // so the normal post-deploy convergence window (a few 30-min cycles) doesn't page.
    const cmkStragglersFilter = new logs.MetricFilter(this, "CmkStragglersFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.all(
        logs.FilterPattern.stringValue("$.event", "=", "refresh_cycle"),
        logs.FilterPattern.exists("$.stragglers"),
      ),
      metricName: "CmkStragglers",
      metricNamespace: metricNs,
      metricValue: "$.stragglers",
    });
    new cloudwatch.Alarm(this, "CmkStragglersAlarm", {
      alarmName: an.cmk_stragglers,
      metric: cmkStragglersFilter.metric({ statistic: "Maximum", period: cdk.Duration.seconds(th("cmk_stragglers").period) }),
      threshold: th("cmk_stragglers").threshold,
      evaluationPeriods: th("cmk_stragglers").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // Lambda errors (any uncaught throw / runtime error).
    new cloudwatch.Alarm(this, "OAuthErrorAlarm", {
      alarmName: an.oauth_errors,
      metric: oauthFn.metricErrors({ period: cdk.Duration.seconds(th("oauth_errors").period) }),
      threshold: th("oauth_errors").threshold,
      evaluationPeriods: th("oauth_errors").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);
    new cloudwatch.Alarm(this, "MiddlewareErrorAlarm", {
      alarmName: an.middleware_errors,
      metric: middlewareFn.metricErrors({ period: cdk.Duration.seconds(th("middleware_errors").period) }),
      threshold: th("middleware_errors").threshold,
      evaluationPeriods: th("middleware_errors").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // MCP latency P95 alarm — user experience degradation
    new cloudwatch.Alarm(this, "McpLatencyAlarm", {
      alarmName: an.mcp_latency,
      metric: new cloudwatch.Metric({
        namespace: metricNs, metricName: "McpLatencyMs",
        statistic: "p95", period: cdk.Duration.seconds(th("mcp_latency").period),
      }),
      threshold: th("mcp_latency").threshold,
      evaluationPeriods: th("mcp_latency").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // Feishu not-authorized spike — possible mass token revocation
    new cloudwatch.Alarm(this, "FeishuNotAuthAlarm", {
      alarmName: an.feishu_not_auth,
      metric: new cloudwatch.Metric({
        namespace: metricNs, metricName: "FeishuNotAuthorized",
        statistic: "Sum", period: cdk.Duration.seconds(th("feishu_not_auth").period),
      }),
      threshold: th("feishu_not_auth").threshold,
      evaluationPeriods: th("feishu_not_auth").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // Lambda concurrent executions — concurrency_pct.threshold is percentage of account quota
    const concurrencyQuota = parseInt(process.env.LAMBDA_CONCURRENCY_QUOTA || "1000", 10);
    new cloudwatch.Alarm(this, "MiddlewareConcurrencyAlarm", {
      alarmName: an.concurrency_pct,
      metric: middlewareFn.metric("ConcurrentExecutions", { statistic: "Maximum", period: cdk.Duration.seconds(th("concurrency_pct").period) }),
      threshold: Math.floor(concurrencyQuota * th("concurrency_pct").threshold / 100),
      evaluationPeriods: th("concurrency_pct").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // Lambda throttles — capacity issue
    new cloudwatch.Alarm(this, "ThrottleAlarm", {
      alarmName: an.throttles,
      metric: middlewareFn.metricThrottles({ period: cdk.Duration.seconds(th("throttles").period) }),
      threshold: th("throttles").threshold,
      evaluationPeriods: th("throttles").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // API Gateway 5xx (server-side errors at the gateway level)
    new cloudwatch.Alarm(this, "ApiGateway5xxAlarm", {
      alarmName: an.apigw_5xx,
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway", metricName: "5XXError",
        dimensionsMap: { ApiName: names.apiName },
        statistic: "Sum", period: cdk.Duration.seconds(th("apigw_5xx").period),
      }),
      threshold: th("apigw_5xx").threshold,
      evaluationPeriods: th("apigw_5xx").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // --- Observability: daily operation metrics ---

    // AgentCore upstream 5xx
    const agentCore5xxFilter = new logs.MetricFilter(this, "AgentCore5xxFilter", {
      logGroup: middlewareFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "agentcore_5xx"),
      metricName: "AgentCore5xx",
      metricNamespace: metricNs,
    });
    new cloudwatch.Alarm(this, "AgentCore5xxAlarm", {
      alarmName: an.upstream_5xx,
      metric: agentCore5xxFilter.metric({ statistic: "Sum", period: cdk.Duration.seconds(th("upstream_5xx").period) }),
      threshold: th("upstream_5xx").threshold,
      evaluationPeriods: th("upstream_5xx").evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // Feishu API slow calls (>3s)
    new logs.MetricFilter(this, "FeishuSlowFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "feishu_slow"),
      metricName: "FeishuSlow",
      metricNamespace: metricNs,
    });

    // AgentCore slow calls (>5s)
    new logs.MetricFilter(this, "AgentCoreSlowFilter", {
      logGroup: middlewareFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "agentcore_slow"),
      metricName: "AgentCoreSlow",
      metricNamespace: metricNs,
    });

    // MCP proxy request success (for traffic volume + latency dashboarding)
    new logs.MetricFilter(this, "McpRequestOkFilter", {
      logGroup: middlewareFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "mcp_request_ok"),
      metricName: "McpRequestOk",
      metricNamespace: metricNs,
    });

    // MCP proxy latency (extract durationMs from successful requests)
    new logs.MetricFilter(this, "McpLatencyFilter", {
      logGroup: middlewareFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "mcp_request_ok"),
      metricName: "McpLatencyMs",
      metricNamespace: metricNs,
      metricValue: "$.durationMs",
    });

    // Auth failure count (token_verify_failed + auth_missing_or_invalid)
    new logs.MetricFilter(this, "AuthFailFilter", {
      logGroup: middlewareFn.logGroup,
      filterPattern: logs.FilterPattern.anyTerm("token_verify_failed", "auth_missing_or_invalid"),
      metricName: "AuthFail",
      metricNamespace: metricNs,
    });

    // OAuth authorize started (funnel top)
    new logs.MetricFilter(this, "OAuthStartFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "oauth_authorize_start"),
      metricName: "OAuthAuthorizeStart",
      metricNamespace: metricNs,
    });

    // OAuth callback success (funnel bottom)
    new logs.MetricFilter(this, "OAuthCallbackOkFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "oauth_callback_success"),
      metricName: "OAuthCallbackSuccess",
      metricNamespace: metricNs,
    });

    // New user authorized
    new logs.MetricFilter(this, "NewUserFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "new_user_authorized"),
      metricName: "NewUserAuthorized",
      metricNamespace: metricNs,
    });

    // Active users (from refresh cycle)
    new logs.MetricFilter(this, "ActiveUsersFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "refresh_cycle"),
      metricName: "ActiveUsers",
      metricNamespace: metricNs,
      metricValue: "$.total",
    });

    // Feishu token not authorized (user needs re-auth or first-time auth)
    new logs.MetricFilter(this, "FeishuNotAuthorizedFilter", {
      logGroup: middlewareFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "feishu_not_authorized"),
      metricName: "FeishuNotAuthorized",
      metricNamespace: metricNs,
    });

    // Feishu API slow call latency (extract durationMs for percentile tracking)
    new logs.MetricFilter(this, "FeishuSlowLatencyFilter", {
      logGroup: oauthFn.logGroup,
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "feishu_slow"),
      metricName: "FeishuSlowLatencyMs",
      metricNamespace: metricNs,
      metricValue: "$.durationMs",
    });

    // Feishu webhook relay: SNS → Lambda (format to card) → Feishu bot webhook
    const alarmWebhook = process.env.ALARM_WEBHOOK_URL || "";
    if (alarmWebhook) {
      const webhookFnName = `${this.stackName}-alarm-webhook`;
      const webhookLogGroup = createLogGroup(this, "WebhookLogGroup", webhookFnName, logRetention);
      const webhookFn = new nodejs.NodejsFunction(this, "AlarmWebhookFunction", {
        functionName: webhookFnName,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../../lambda/alarm-webhook/index.ts"),
        projectRoot: path.join(__dirname, "../.."),
        depsLockFilePath: path.join(__dirname, "../package-lock.json"),
        handler: "handler",
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        logGroup: webhookLogGroup,
        environment: {
          FEISHU_WEBHOOK_URL: alarmWebhook,
          FEISHU_WEBHOOK_SECRET: process.env.ALARM_WEBHOOK_SECRET || "",
          FEISHU_WEBHOOK_KEYWORD: process.env.ALARM_WEBHOOK_KEYWORD || "",
          DEPLOY_LANG: lang,
          // App display name shown on the alert card so a shared channel can tell
          // apps apart. Default app has no slug -> empty (card omits the suffix).
          APP_ALIAS: process.env.APP_ALIAS || names.slug,
        },
        bundling: { externalModules: [], minify: true, target: "node20" },
      });
      alarmTopic.addSubscription(new snsSubscriptions.LambdaSubscription(webhookFn));
      new cdk.CfnOutput(this, "AlarmWebhookFunctionName", { value: webhookFn.functionName });
    }

    // --- CloudWatch Dashboard ---
    const ns = metricNs;
    const m = (metricName: string, opts: Partial<cloudwatch.MetricProps> = {}) =>
      new cloudwatch.Metric({ namespace: ns, metricName, statistic: "Sum", period: cdk.Duration.minutes(5), label: opts.label || `${metricName}${opts.statistic && opts.statistic !== "Sum" ? ` (${opts.statistic})` : ""}`, ...opts });
    const dashboard = new cloudwatch.Dashboard(this, "ObservabilityDashboard", {
      dashboardName: names.dashboardName,
    });

    // Section: Alarm Overview (top of dashboard for at-a-glance status)
    dashboard.addWidgets(new cloudwatch.TextWidget({ markdown: `## ${dt.alarms}`, width: 24, height: 1 }));
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: dt.alarms,
        alarms: [
          cloudwatch.Alarm.fromAlarmArn(this, "RefTokenLost", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.token_lost}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefRefreshFailed", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.refresh_failed}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefUpstream5xx", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.upstream_5xx}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefLatency", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.mcp_latency}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefNotAuth", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.feishu_not_auth}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefConcurrency", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.concurrency_pct}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefThrottle", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.throttles}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefApiGw5xx", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.apigw_5xx}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefOAuthErr", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.oauth_errors}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefMwErr", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.middleware_errors}`),
          cloudwatch.Alarm.fromAlarmArn(this, "RefCmkStragglers", `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${an.cmk_stragglers}`),
        ],
        width: 24,
      }),
    );

    // Section: MCP Traffic
    dashboard.addWidgets(new cloudwatch.TextWidget({ markdown: `## ${dt.requests}`, width: 24, height: 1 }));
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: dt.requests,
        left: [m("McpRequestOk")],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.latency,
        left: [
          m("McpLatencyMs", { statistic: "Average" }),
          m("McpLatencyMs", { statistic: "p95" }),
          m("McpLatencyMs", { statistic: "p99" }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.errors,
        left: [m("AgentCore5xx"), m("AgentCoreSlow"), m("FeishuSlow")],
        width: 8,
      }),
    );

    // Section: Lambda
    dashboard.addWidgets(new cloudwatch.TextWidget({ markdown: `## ${dt.lambda_invocations}`, width: 24, height: 1 }));
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: dt.lambda_invocations,
        left: [
          oauthFn.metricInvocations({ label: "OAuth", period: cdk.Duration.minutes(5) }),
          middlewareFn.metricInvocations({ label: "Middleware", period: cdk.Duration.minutes(5) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.lambda_duration,
        left: [
          oauthFn.metricDuration({ label: "OAuth (avg)", statistic: "Average", period: cdk.Duration.minutes(5) }),
          oauthFn.metricDuration({ label: "OAuth (p95)", statistic: "p95", period: cdk.Duration.minutes(5) }),
          middlewareFn.metricDuration({ label: "Middleware (avg)", statistic: "Average", period: cdk.Duration.minutes(5) }),
          middlewareFn.metricDuration({ label: "Middleware (p95)", statistic: "p95", period: cdk.Duration.minutes(5) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.lambda_errors,
        left: [
          oauthFn.metricErrors({ label: "OAuth Errors", period: cdk.Duration.minutes(5) }),
          middlewareFn.metricErrors({ label: "Middleware Errors", period: cdk.Duration.minutes(5) }),
        ],
        right: [
          oauthFn.metricThrottles({ label: "OAuth Throttles", period: cdk.Duration.minutes(5) }),
          middlewareFn.metricThrottles({ label: "Middleware Throttles", period: cdk.Duration.minutes(5) }),
        ],
        rightYAxis: { label: dt.lambda_throttles },
        width: 8,
      }),
    );

    // Section: OAuth & Token
    dashboard.addWidgets(new cloudwatch.TextWidget({ markdown: `## ${dt.funnel}`, width: 24, height: 1 }));
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: dt.funnel,
        left: [
          m("OAuthAuthorizeStart", { period: cdk.Duration.hours(1) }),
          m("OAuthCallbackSuccess", { period: cdk.Duration.hours(1) }),
          m("NewUserAuthorized", { period: cdk.Duration.hours(1) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.refresh,
        left: [
          m("RefreshFailed", { period: cdk.Duration.hours(1) }),
          m("TokenLost", { period: cdk.Duration.hours(1) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.users,
        left: [m("ActiveUsers", { statistic: "Maximum", period: cdk.Duration.hours(1) })],
        right: [m("AuthFail")],
        width: 8,
      }),
    );

    // Section: Infrastructure
    dashboard.addWidgets(new cloudwatch.TextWidget({ markdown: `## ${dt.api_4xx_5xx}`, width: 24, height: 1 }));
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: dt.api_4xx_5xx,
        left: [
          new cloudwatch.Metric({ namespace: "AWS/ApiGateway", metricName: "4XXError", dimensionsMap: { ApiName: names.apiName }, statistic: "Sum", period: cdk.Duration.minutes(5), label: "4xx" }),
          new cloudwatch.Metric({ namespace: "AWS/ApiGateway", metricName: "5XXError", dimensionsMap: { ApiName: names.apiName }, statistic: "Sum", period: cdk.Duration.minutes(5), label: "5xx" }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.lambda_concurrent,
        left: [
          oauthFn.metric("ConcurrentExecutions", { label: "OAuth", statistic: "Maximum", period: cdk.Duration.minutes(5) }),
          middlewareFn.metric("ConcurrentExecutions", { label: "Middleware", statistic: "Maximum", period: cdk.Duration.minutes(5) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: dt.not_authorized,
        left: [m("FeishuNotAuthorized")],
        right: [m("FeishuSlowLatencyMs", { statistic: "Average" }), m("FeishuSlowLatencyMs", { statistic: "p95" })],
        rightYAxis: { label: dt.feishu_latency },
        width: 8,
      }),
    );


    const dashboardUrl = `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards/dashboard/lark-mcp-on-agentcore`;
    new cdk.CfnOutput(this, "DashboardUrl", { value: dashboardUrl, description: "CloudWatch observability dashboard" });
    new cdk.CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
    new cdk.CfnOutput(this, "OAuthFunctionName", { value: oauthFn.functionName });
    new cdk.CfnOutput(this, "UserSecretKmsKeyArn", {
      value: userSecretKey.keyArn,
      description: "CMK encrypting user token secrets; deploy.sh re-threads it into the OAuth Lambda env",
    });
    new cdk.CfnOutput(this, "MiddlewareFunctionName", { value: middlewareFn.functionName });
    new cdk.CfnOutput(this, "OAuthEndpoint", { value: this.oauthEndpoint });
    new cdk.CfnOutput(this, "McpEndpoint", {
      value: `${this.oauthEndpoint}/mcp`,
      description: "MCP Streamable HTTP endpoint (same domain as OAuth)",
    });
    new cdk.CfnOutput(this, "OAuthClientId", {
      value: oauthClientId,
      description: "OAuth Client ID for Quick Desktop connector",
    });
    new cdk.CfnOutput(this, "FeishuRedirectUrl", {
      value: `${this.oauthEndpoint}/callback`,
      description: "Add this to Feishu app redirect URLs",
    });
  }
}

#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { OAuthStack } from "../lib/oauth-stack";
import { RuntimeStack } from "../lib/runtime-stack";
import { WafStack } from "../lib/waf-stack";
import { resolveSlug, slugFromContext } from "../lib/slug-names";
import { FleetDashboardStack } from "../lib/fleet-dashboard";

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? "us-west-2";
const env = { account, region };

// Per-app slug from `-c slug=<slug>` (or APP_SLUG). Empty = default sentinel,
// which yields today's byte-identical stack IDs and resource names.
const slug = slugFromContext(app);
const names = resolveSlug(slug);

const runtimeArn = app.node.tryGetContext("runtimeArn") || process.env.RUNTIME_ARN || "";
const customDomain = process.env.CUSTOM_DOMAIN || "";
const domainVerification = process.env.DOMAIN_VERIFICATION || "";

// CloudFront-scope WAF must live in us-east-1 regardless of deploy region.
// Set SKIP_WAF=1 to omit the WAF stack (e.g., for region-locked tenants).
// The WAF is SHARED across all apps and is NOT slug-suffixed; deploy.sh deploys
// it only on first creation and excludes it from the per-slug deploy set.
const skipWaf = process.env.SKIP_WAF === "1";
const waf = skipWaf ? undefined : new WafStack(app, names.wafStack, {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
});

const oauth = new OAuthStack(app, names.oauthStack, {
  env,
  slug,
  runtimeArn,
  customDomain,
  domainVerification,
  webAclArn: waf?.webAclArn,
  crossRegionReferences: !skipWaf,
});
if (waf) oauth.addDependency(waf);

const runtime = new RuntimeStack(app, names.runtimeStack, { env, slug });
runtime.addDependency(oauth);

// Optional read-only cross-app roll-up dashboard (hybrid observability). Opt-in
// via DEPLOY_ROLLUP=1 so it never affects the default per-app synth/snapshot.
// It owns nothing (no alarms/SNS); its lifecycle is decoupled from the apps.
if (process.env.DEPLOY_ROLLUP === "1") {
  new FleetDashboardStack(app, "LarkMcpOnAgentCoreFleet", { env });
}

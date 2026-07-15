import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { OAuthStack } from "../lib/oauth-stack";

const TEST_ENV = { account: "123456789012", region: "us-west-2" };

function synth(): Template {
  const app = new cdk.App();
  const stack = new OAuthStack(app, "AlarmNameStack", {
    env: TEST_ENV,
    runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test",
  });
  return Template.fromStack(stack);
}

// Regression guard for the an.concurrency vs concurrency_pct bug: oauth-stack.ts
// referenced an i18n key (`an.concurrency`) that does not exist in
// config/i18n.json (only `concurrency_pct`), so the alarm shipped with an
// undefined AlarmName and the dashboard built `arn:...:alarm:undefined`. A
// missing/undefined i18n key would re-introduce the same silent breakage.
describe("alarm names: every CloudWatch alarm has a defined, non-empty AlarmName", () => {
  const template = synth();

  it("no alarm has an undefined or empty AlarmName", () => {
    const alarms = template.findResources("AWS::CloudWatch::Alarm");
    const ids = Object.keys(alarms);
    // The stack defines 11 named alarms (10 + the CMK-stragglers canary); if this
    // count drifts, update intentionally.
    expect(ids.length).toBe(11);
    for (const id of ids) {
      const name = alarms[id].Properties?.AlarmName;
      expect(name, `alarm ${id} is missing AlarmName`).toBeTruthy();
      expect(typeof name, `alarm ${id} AlarmName must be a string`).toBe("string");
      expect(name, `alarm ${id} AlarmName must not be the string 'undefined'`).not.toBe("undefined");
    }
  });

  it("the middleware concurrency alarm uses the concurrency_pct i18n name (not the undefined an.concurrency)", () => {
    // Default lang is zh; alarmNames.zh.concurrency_pct = 'Lambda 并发过高 (%)'.
    const alarms = template.findResources("AWS::CloudWatch::Alarm");
    const names = Object.values(alarms).map((a) => a.Properties?.AlarmName);
    expect(names).toContain("Lambda 并发过高 (%)");
    expect(names).not.toContain("undefined");
  });

  it("the dashboard AlarmStatusWidget references no arn:...:alarm:undefined", () => {
    const dashboards = template.findResources("AWS::CloudWatch::Dashboard");
    const bodies = JSON.stringify(Object.values(dashboards));
    expect(bodies).not.toContain("alarm:undefined");
  });
});

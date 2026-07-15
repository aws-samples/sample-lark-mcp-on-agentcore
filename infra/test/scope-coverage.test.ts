import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");

const tier1: string[] = JSON.parse(
  readFileSync(resolve(ROOT, "docker/tier1.json"), "utf-8"),
);

const shortcutScopes: {
  _meta: { lark_cli_version: string };
  shortcuts: { service: string; command: string; scopes: string[] }[];
} = JSON.parse(
  readFileSync(resolve(ROOT, "docker/shortcut-scopes.json"), "utf-8"),
);

const oauthScopes: string[] = JSON.parse(
  readFileSync(resolve(ROOT, "config/oauth-scopes.json"), "utf-8"),
);

const rawApiScopes: {
  _meta: { lark_cli_version: string };
  rawApis: { service: string; resource: string; method: string; scopes: string[] }[];
} = JSON.parse(
  readFileSync(resolve(ROOT, "docker/rawapi-scopes.json"), "utf-8"),
);

const allowlistSrc = readFileSync(
  resolve(ROOT, "lambda/token-refresh-shim/scope-allowlist.ts"),
  "utf-8",
);

function toolNameFromShortcut(service: string, command: string): string {
  return `lark_${service}_${command.replace(/^\+/, "").replace(/-/g, "_")}`;
}

describe("scope coverage", () => {
  it("all tier1 tool scopes are included in default oauth-scopes.json", () => {
    const defaultSet = new Set(oauthScopes);
    const missing: { tool: string; scope: string }[] = [];

    for (const shortcut of shortcutScopes.shortcuts) {
      const toolName = toolNameFromShortcut(shortcut.service, shortcut.command);
      if (!tier1.includes(toolName)) continue;

      for (const scope of shortcut.scopes) {
        if (!defaultSet.has(scope)) {
          missing.push({ tool: toolName, scope });
        }
      }
    }

    if (missing.length > 0) {
      const report = missing
        .map((m) => `  ${m.tool} requires "${m.scope}"`)
        .join("\n");
      expect.fail(
        `${missing.length} scope(s) needed by tier1 tools missing from config/oauth-scopes.json:\n${report}`,
      );
    }
  });

  it("every tier1 tool has a shortcut-scopes entry", () => {
    const knownTools = new Set(
      shortcutScopes.shortcuts.map((s) =>
        toolNameFromShortcut(s.service, s.command),
      ),
    );
    const unmapped = tier1.filter((t) => !knownTools.has(t));
    expect(unmapped, "tier1 tools without shortcut-scopes entry").toEqual([]);
  });

  it("shortcut-scopes.json covers all lark-cli runtime shortcuts (extraction completeness)", () => {
    try {
      execSync("lark-cli --version", { encoding: "utf-8", timeout: 5_000 });
    } catch {
      return; // lark-cli not installed (CI) — skip
    }
    const run = (...args: string[]) =>
      execSync(args.join(" "), { encoding: "utf-8", timeout: 30_000 });

    const skipServices = new Set([
      "api", "auth", "config", "doctor", "help", "profile",
      "schema", "update", "event", "skill",
    ]);

    const helpText = run("lark-cli", "--help");
    const services: string[] = [];
    let inCommands = false;
    for (const line of helpText.split("\n")) {
      if (line.includes("Available Commands")) { inCommands = true; continue; }
      if (inCommands && line.trim() === "") break;
      if (!inCommands) continue;
      const m = line.match(/^\s{2,4}(\w+)\s/);
      if (m && !skipServices.has(m[1])) services.push(m[1]);
    }

    const runtimeTools = new Set<string>();
    for (const svc of [...new Set(services)]) {
      const svcHelp = run("lark-cli", svc, "--help");
      for (const line of svcHelp.split("\n")) {
        const m = line.match(/^\s{2,4}(\+\S+)\s/);
        if (m) runtimeTools.add(`${svc}:${m[1]}`);
      }
    }

    const extractedKeys = new Set(
      shortcutScopes.shortcuts.map((s) => `${s.service}:${s.command}`),
    );

    const missing = [...runtimeTools].filter((t) => !extractedKeys.has(t)).sort();
    if (missing.length > 0) {
      expect.fail(
        `${missing.length} runtime shortcut(s) missing from docker/shortcut-scopes.json (re-run scripts/extract-shortcut-scopes.py):\n` +
          missing.map((t) => `  ${t}`).join("\n"),
      );
    }
  });

  it("scope-allowlist.ts is the union of shortcut + rawapi + oauth scopes (re-run scripts/build-scope-allowlist.sh)", () => {
    const expected = new Set<string>();
    for (const s of shortcutScopes.shortcuts) for (const sc of s.scopes || []) expected.add(sc);
    for (const e of rawApiScopes.rawApis) for (const sc of e.scopes || []) expected.add(sc);
    for (const sc of oauthScopes) expected.add(sc);

    // Parse the actual scopes from the generated allowlist source.
    const actual = new Set(
      [...allowlistSrc.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]),
    );

    const missingFromAllowlist = [...expected].filter((s) => !actual.has(s)).sort();
    const extraInAllowlist = [...actual].filter((s) => !expected.has(s)).sort();
    if (missingFromAllowlist.length || extraInAllowlist.length) {
      expect.fail(
        "scope-allowlist.ts is out of sync with its sources " +
          "(run scripts/build-scope-allowlist.sh).\n" +
          (missingFromAllowlist.length ? `Missing: ${missingFromAllowlist.join(", ")}\n` : "") +
          (extraInAllowlist.length ? `Extra: ${extraInAllowlist.join(", ")}` : ""),
      );
    }
  });

  it("no bot-only scopes in rawapi-scopes.json (user-only project)", () => {
    const botScopes: string[] = [];
    for (const e of rawApiScopes.rawApis) {
      for (const sc of e.scopes || []) {
        if (/:send_as_bot$/.test(sc)) botScopes.push(`${e.service}.${e.resource}.${e.method}: ${sc}`);
      }
    }
    expect(
      botScopes,
      "bot-only scopes must be filtered by scripts/extract-rawapi-scopes.sh",
    ).toEqual([]);
  });
});

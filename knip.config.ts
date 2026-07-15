import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "lambda/mcp-middleware/index.ts",
    "lambda/token-refresh-shim/index.ts",
    "docker/server.js",
    "docker/generate-tools.js",
    "infra/bin/app.ts",
  ],
  project: ["lambda/**/*.ts", "docker/*.js", "infra/**/*.ts"],
  ignore: [
    "**/__tests__/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "infra/test/**",
  ],
  ignoreDependencies: [
    // Stryker plugins are loaded dynamically by the runner
    "@stryker-mutator/typescript-checker",
    "@stryker-mutator/vitest-runner",
    // fast-check is used in test files which are excluded from entry analysis
    "fast-check",
  ],
};

export default config;

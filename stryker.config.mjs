/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: [
    'lambda/token-refresh-shim/index.ts',
    'lambda/mcp-middleware/index.ts',
    '!lambda/**/__tests__/**',
  ],
  testRunner: 'vitest',
  checkers: [],
  reporters: ['clear-text', 'html'],
  htmlReporter: { fileName: 'coverage/mutation/index.html' },
  timeoutMS: 60000,
  concurrency: 4,
  vitest: {
    configFile: 'vitest.config.ts',
  },
};

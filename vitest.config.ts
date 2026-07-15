import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lambda/**/__tests__/**/*.test.ts', 'docker/__tests__/**/*.test.js', 'infra/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['lambda/**/*.ts'],
      exclude: ['lambda/**/__tests__/**', 'lambda/**/*.test.ts'],
    },
  },
});

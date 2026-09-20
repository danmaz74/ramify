import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Every owner keeps its tests in its own `src/tests/`, so the runner selects
 * that area throughout the tree. Tests run under Node; browser components are
 * checked as static markup rather than in a DOM environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@features': fileURLToPath(new URL('./subs/workspace/subs', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/src/tests/**/*.test.ts?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.reference-work/**'],
  },
});

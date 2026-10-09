import { defineConfig } from 'vitest/config';

// Deliberately outside normal/audit discovery: opt-in scale/exhaustive probes.
export default defineConfig({
  test: {
    name: 'stress', environment: 'node',
    include: ['src/tests/**/*.stress.ts', 'subs/**/src/**/*.stress.ts'],
    exclude: ['subs/web/**', 'subs/harness/fixtures/**', '**/src/tmp/**'],
    setupFiles: ['src/tests/vitest-test-lock.ts', 'src/tests/vitest-process-guard.ts'],
  },
});

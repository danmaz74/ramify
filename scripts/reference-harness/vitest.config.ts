import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The reference harness runs under its own Vitest configuration.
 *
 * Toolkit tests collect legacy and nested owner source. Harness tests read
 * repository files and keep this independent configuration. Run it explicitly:
 *
 *     npm run reference:cases
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['scripts/reference-harness/**/*.test.ts'],
  },
});

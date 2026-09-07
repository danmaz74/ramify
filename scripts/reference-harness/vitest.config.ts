import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The reference harness runs under its own Vitest configuration.
 *
 * The toolkit's `vitest.config.ts` collects `src/**\/*.test.ts` only, and it
 * stays that way: harness tests read the repository's own files and are not
 * toolkit unit tests. Run this suite explicitly:
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

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The modularity probe's adapter tests run under their own configuration,
 * outside toolkit test discovery. Run them explicitly:
 *
 *     npx vitest run -c scripts/probes/modularity/vitest.config.ts
 */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['scripts/probes/modularity/**/*.test.ts'],
  },
});

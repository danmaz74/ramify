import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * ramify-agent runs its own test toolchain. This config keeps vitest, started
 * from `ramify-agent/`, from picking up the toolkit's configuration while the agent
 * still lives inside the ramify.ts repository. Node owners' tests run in
 * Node; the web module's tests run in jsdom. The projects under
 * subs/harness/fixtures/ are test data, never test source. The web project
 * deduplicates
 * React and inlines `ramify.ts` and `@xyflow/react`, so the packaged canvas
 * resolves the web module's React rather than the linked checkout's copy.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['src/tests/vitest-test-lock.ts'],
          include: ['src/tests/**/*.test.ts', 'subs/**/src/**/*.test.ts'],
          exclude: ['subs/web/**', 'subs/harness/fixtures/**', '**/src/tmp/**'],
        },
      },
      {
        plugins: [react()],
        resolve: { dedupe: ['react', 'react-dom'] },
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['src/tests/vitest-test-lock.ts'],
          include: ['subs/web/src/**/*.test.{ts,tsx}'],
          exclude: ['subs/harness/fixtures/**', '**/src/tmp/**'],
          // React Flow's store imports React too: zustand is inlined with it,
          // and the CommonJS selector shim zustand imports is prebundled, since
          // an inlined CommonJS file would still require the checkout's React.
          server: { deps: { inline: ['ramify.ts', '@xyflow/react', 'zustand'] } },
          deps: { optimizer: { client: { enabled: true, include: ['use-sync-external-store/shim/with-selector.js'] } } },
        },
      },
    ],
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * ramify-agent runs its own test toolchain. This config keeps vitest, started
 * from `ramify-agent/`, from picking up the toolkit's configuration while the agent
 * still lives inside the ramify.ts repository. Node owners' tests run in
 * Node; the web module's tests run in jsdom. The fixture project under
 * fixtures/ is test data, never a test source.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/tests/**/*.test.ts', 'subs/**/src/**/*.test.ts'],
          exclude: ['subs/web/**'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['subs/web/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});

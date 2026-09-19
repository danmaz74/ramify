import { defineConfig } from 'vitest/config';

/**
 * ramify-agent runs its own test toolchain. This config keeps vitest, started
 * from `ramify-agent/`, from picking up the toolkit's configuration while the agent
 * still lives inside the ramify.ts repository.
 */
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts', 'subs/**/src/**/*.test.ts'],
  },
});

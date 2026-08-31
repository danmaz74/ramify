import { defineConfig } from 'vitest/config';

/**
 * ramify.ts runs its own test toolchain. This config exists so that vitest,
 * started from `ramify/`, never picks up the host repository's configuration
 * (setup files, aliases, projects) while ramify still lives inside it.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});

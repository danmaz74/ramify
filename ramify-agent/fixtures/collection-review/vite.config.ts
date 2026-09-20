import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The browser application is the workspace module's own source, so Vite's root
 * is that owner's `src/`. Its build output and the one configured alias are
 * resolved from the package root, which is the application root module.
 */
export default defineConfig({
  root: 'subs/workspace/src',
  plugins: [react()],
  resolve: {
    alias: {
      '@features': fileURLToPath(new URL('./subs/workspace/subs', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/trpc': {
        target: 'http://localhost:8787',
      },
    },
  },
});

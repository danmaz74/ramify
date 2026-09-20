import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Builds the web client into the package's dist/web, where the root's
 * `serve` entry hands it to the harness. `npm run dev:web` serves it with
 * the protocol proxied to a harness on port 4180.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:4180' },
  },
});

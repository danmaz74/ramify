import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'subs/explorer'),
  build: {
    outDir: resolve(import.meta.dirname, 'dist/explorer'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'subs/explorer/index.html') },
  },
});

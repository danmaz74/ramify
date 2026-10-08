import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { createVitest } from 'vitest/node';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

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
const nodeDiscovery = {
  environment: 'node' as const,
  include: ['src/tests/**/*.test.ts', 'subs/**/src/**/*.test.ts'],
  exclude: ['subs/web/**', 'subs/harness/fixtures/**', '**/src/tmp/**'],
};
const webDiscovery = {
  environment: 'jsdom' as const,
  include: ['subs/web/src/**/*.test.{ts,tsx}'],
  exclude: ['subs/harness/fixtures/**', '**/src/tmp/**'],
};
export default defineConfig(async () => {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(root, 'src/tests/test-boundaries.json'), 'utf8'));
  if (manifest.schema !== 'ramify-agent.test-boundaries/1' || !Array.isArray(manifest.boundaries)) throw new Error('Invalid test boundary registry schema');
  const paths: string[] = [];
  for (const entry of manifest.boundaries) {
    if (typeof entry.file !== 'string' || /[\\*?{}[\]]/.test(entry.file) || entry.file !== relative(root, resolve(root, entry.file)).split('\\').join('/') ||
        !entry.boundary?.trim() || !entry.whyFakeCannotProve?.trim() || !Array.isArray(entry.owningCases) || !entry.owningCases.length || entry.owningCases.some((value: unknown) => typeof value !== 'string' || !value.trim())) throw new Error('Invalid exact test boundary registration');
    if (paths.includes(entry.file)) throw new Error(`Duplicate test boundary registration: ${entry.file}`);
    const absolute = resolve(root, entry.file);
    if (!statSync(absolute).isFile() || realpathSync(absolute) !== absolute) throw new Error(`Missing or non-regular test boundary: ${entry.file}`);
    paths.push(entry.file);
  }
  // Ask the installed runner for its authoritative original discovery. This does
  // not collect/execute tests and does not launch a worker or a test subprocess.
  const discovery = await createVitest('test', { config: false, watch: false }, { root, test: { projects: [
    { test: { ...nodeDiscovery, name: 'inventory-node' } },
    { test: { ...webDiscovery, name: 'inventory-web' } },
  ] } });
  try {
    const discovered = new Map((await discovery.globTestSpecifications()).map(spec => [relative(root, spec.moduleId).split('\\').join('/'), spec.project.name]));
    for (const path of paths) if (discovered.get(path) !== 'inventory-node') throw new Error(`Test boundary is outside configured Node discovery: ${path}`);
  } finally { await discovery.close(); }
  return {
    test: {
      projects: [
        { test: { name: 'boundaries', environment: 'node', setupFiles: ['src/tests/vitest-test-lock.ts', 'src/tests/vitest-boundary-processes.ts'], include: paths, exclude: ['subs/harness/fixtures/**', '**/src/tmp/**'] } },
        {
          test: {
            name: 'node',
            ...nodeDiscovery,
            setupFiles: ['src/tests/vitest-test-lock.ts', 'src/tests/vitest-process-guard.ts'],
            exclude: [...nodeDiscovery.exclude, ...paths],
          },
        },
        {
          plugins: [react()],
          resolve: { dedupe: ['react', 'react-dom'] },
          test: {
            name: 'web',
            ...webDiscovery,
            setupFiles: ['src/tests/vitest-test-lock.ts', 'src/tests/vitest-process-guard.ts'],
            // React Flow's store imports React too: zustand is inlined with it,
            // and the CommonJS selector shim zustand imports is prebundled, since
            // an inlined CommonJS file would still require the checkout's React.
            server: { deps: { inline: ['ramify.ts', '@xyflow/react', 'zustand'] } },
            deps: { optimizer: { client: { enabled: true, include: ['use-sync-external-store/shim/with-selector.js'] } } },
          },
        },
      ],
    },
  };
});

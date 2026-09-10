import assert from 'node:assert/strict';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// These files exist only as supplied bytes. No fixture directory is written.
const root = resolve(packageRoot, 'scripts/probes/fixtures/virtual-config');
const files = {
  [resolve(root, 'base.json')]: '{"compilerOptions":{"strict":true,"moduleResolution":"bundler","module":"ESNext","types":[]}}',
  [resolve(root, 'tsconfig.json')]: '{"extends":"./base.json","include":["src"],"exclude":["src/omitted.ts"]}',
  [resolve(root, 'src/selected.ts')]: 'export const selected = 1;',
  [resolve(root, 'src/omitted.ts')]: 'export const omitted = 2;',
};
const virtual = createVirtualFileSystem(files);
const readPaths: string[] = [];
const api = new API({
  cwd: root,
  fs: {
    fileExists: path => virtual.fileExists!(path) ?? false,
    directoryExists: path => virtual.directoryExists!(path) ?? false,
    getAccessibleEntries: path => virtual.getAccessibleEntries!(path) ?? { files: [], directories: [] },
    readFile: path => {
      readPaths.push(relative(root, path));
      // Returning null is essential: undefined permits a live-disk fallback.
      return virtual.readFile!(path) ?? null;
    },
    realpath: path => path,
  },
});

try {
  const parsed = api.parseConfigFile(resolve(root, 'tsconfig.json'));
  assert.deepEqual(parsed.fileNames.map(path => relative(root, path)), ['src/selected.ts']);
  assert.equal(parsed.options.strict, true);
  assert.ok(readPaths.includes('tsconfig.json'));
  assert.ok(readPaths.includes('base.json'));
  assert.equal(readPaths.some(path => path.endsWith('.ts')), false);
  console.log(JSON.stringify({
    probe: 'config-input-view',
    api: 'API.parseConfigFile',
    openedProjectOrSnapshot: false,
    selectedFiles: parsed.fileNames.map(path => relative(root, path)),
    inheritedStrictOption: parsed.options.strict,
    capturedConfigurationReads: [...new Set(readPaths)].sort(),
    configurationFilesWritten: false,
    liveFilesystemFallback: false,
  }, null, 2));
} finally {
  api.close();
}

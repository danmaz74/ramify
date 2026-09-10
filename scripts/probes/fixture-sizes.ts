import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hundredOwnerFiles } from './fixtures/hundred-owners.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(packageRoot, 'examples/collection-review');
const excluded = new Set(['node_modules', 'dist', '.reference-work', '.git']);

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  });
}

function summarize(files: ReadonlyMap<string, string>) {
  const paths = [...files.keys()].sort();
  const group = (predicate: (path: string) => boolean) => {
    const chosen = paths.filter(predicate);
    return {
      files: chosen.length,
      bytes: chosen.reduce((sum, path) => sum + Buffer.byteLength(files.get(path)!), 0),
    };
  };
  const isSource = (path: string) => path.startsWith('src/') || path.includes('/src/');
  // This digest identifies the sorted path/content map, including boundaries.
  const identity = createHash('sha256').update(JSON.stringify(paths.map(path => [path, files.get(path)]))).digest('hex');
  return {
    contentMapSha256: identity,
    all: group(() => true),
    descriptions: group(path => path === 'module.ramify' || path.endsWith('/module.ramify')),
    readmes: group(path => path === 'README.md' || path.endsWith('/README.md')),
    source: group(isSource),
    typescript: group(path => isSource(path) && /\.(?:ts|tsx|mts|cts)$/.test(path)),
    css: group(path => isSource(path) && path.endsWith('.css')),
    nestedTests: group(path => path.includes('src/tests/')),
    configurations: group(path => !isSource(path) && !path.endsWith('module.ramify') && !path.endsWith('README.md')),
    largestFileBytes: Math.max(...paths.map(path => Buffer.byteLength(files.get(path)!))),
  };
}

const referencePaths = filesUnder(root);
const ownerDirectories = referencePaths.filter(path => path.endsWith('/module.ramify')).map(dirname);
assert.equal(ownerDirectories.length, 15);
const configurations = ['tsconfig.json', 'package.json', 'vite.config.ts', 'vitest.config.ts'];
const measuredPaths = new Set(configurations.map(path => resolve(root, path)));
for (const owner of ownerDirectories) {
  measuredPaths.add(resolve(owner, 'module.ramify'));
  measuredPaths.add(resolve(owner, 'README.md'));
  for (const file of filesUnder(resolve(owner, 'src'))) measuredPaths.add(file);
}
const reference = new Map([...measuredPaths].map(path => [relative(root, path), readFileSync(path, 'utf8')]));
const synthetic = hundredOwnerFiles();
const syntheticSummary = summarize(synthetic);
assert.equal(syntheticSummary.descriptions.files, 100);
assert.equal(syntheticSummary.source.files, 1200);
assert.equal(syntheticSummary.nestedTests.files, 100);
console.log(JSON.stringify({
  probe: 'fixture-sizes',
  nodeVersion: process.version,
  unit: 'bytes of UTF-8 file contents',
  identityEncoding: 'sha256(JSON.stringify(sorted [root-relative path, UTF-8 contents] pairs))',
  excluded: [...excluded].sort(),
  reference: { root: relative(packageRoot, root), configurationFiles: configurations, ...summarize(reference) },
  hundredOwners: {
    generator: 'scripts/probes/fixtures/hundred-owners.ts',
    owners: 100,
    separatelyTestingOwners: 9,
    sourceFilesInSeparatelyTestingOwners: 108,
    ordinaryTypeScriptFiles: 1000,
    nestedTestFiles: 100,
    sourceFilesExcludedFromProduction: 199,
    ...syntheticSummary,
  },
  semanticCheckingExecuted: false,
}, null, 2));

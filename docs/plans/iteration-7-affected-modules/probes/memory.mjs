import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
assert.equal(typeof global.gc, 'function', 'Run with --expose-gc');

// Inputs stand for already-retained Plan 5 facts. Their strings and arrays are
// alive before measuring; only newly allocated indexes count as added memory.
function fixture(modules, filesPerModule, providersPerFile, distinctProviders) {
  const ids = Array.from({ length: modules }, (_, n) => `project/module-${n}`);
  const files = [];
  for (let m = 0; m < modules; m++) for (let f = 0; f < filesPerModule; f++) {
    const providers = [];
    for (let d = 0; d < providersPerFile; d++) {
      const offset = (f * providersPerFile + d) % distinctProviders + 1;
      providers.push(ids[(m + offset) % modules]);
    }
    files.push({ file: `subs/module-${m}/src/file-${f}.ts`, consumer: ids[m], providers });
  }
  return { modules, files };
}

function build(input, withContributions) {
  const reverse = new Map();
  const byFile = withContributions ? new Map() : null;
  for (const fact of input.files) {
    const providers = [...new Set(fact.providers.filter(id => id !== fact.consumer))];
    if (!providers.length) continue;
    if (byFile) byFile.set(fact.file, { consumer: fact.consumer, providers });
    for (const provider of providers) {
      let consumers = reverse.get(provider);
      if (!consumers) reverse.set(provider, consumers = new Map());
      consumers.set(fact.consumer, (consumers.get(fact.consumer) ?? 0) + 1);
    }
  }
  return { reverse, byFile };
}

function gc() { global.gc(); global.gc(); global.gc(); }
function median(values) { return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]; }
function measure(input, full, copies) {
  // Warm the same code before measuring retained allocation.
  for (let n = 0; n < 5; n++) globalThis.__affectedIndexes = [build(input, full)];
  globalThis.__affectedIndexes = undefined;
  gc();
  const bytes = [], buildMs = [];
  for (let n = 0; n < 5; n++) {
    gc();
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    globalThis.__affectedIndexes = Array.from({ length: copies }, () => build(input, full));
    buildMs.push((performance.now() - started) / copies);
    gc();
    bytes.push((process.memoryUsage().heapUsed - before) / copies);
    assert.equal(globalThis.__affectedIndexes.length, copies);
    globalThis.__affectedIndexes = undefined;
  }
  gc();
  return { medianBytes: Math.round(median(bytes)), samplesBytes: bytes.map(Math.round), medianBuildMs: +median(buildMs).toFixed(3), copies };
}

const workloads = process.argv[4] === '--only-extracted' ? [] : [
  ['sparse-100', fixture(100, 5, 4, 10)],
  ['sparse-1000', fixture(1000, 5, 4, 10)],
  ['dense-1000', fixture(1000, 20, 10, 100)],
];
if (process.argv[2]) {
  const extracted = JSON.parse(await readFile(process.argv[2], 'utf8'));
  workloads.unshift(...extracted.map(x => [x.name, x]));
}
const results = [];
for (const [name, input] of workloads) {
  const stats = (() => {
    const index = build(input, true);
    return { modules: input.modules, contributingFiles: index.byFile.size,
      edges: [...index.reverse.values()].reduce((n, map) => n + map.size, 0),
      fileContributions: [...index.byFile.values()].reduce((n, x) => n + x.providers.length, 0) };
  })();
  const copies = Math.max(4, Math.min(64, Math.floor(500000 / Math.max(1, stats.edges + stats.fileContributions))));
  const reverseOnly = measure(input, false, copies);
  const maintainedIndex = measure(input, true, copies);
  results.push({ name, ...stats, reverseOnly, maintainedIndex });
  process.stderr.write(`${name}: ${stats.edges} edges, full index ${(maintainedIndex.medianBytes / 1024 ** 2).toFixed(3)} MiB\n`);
}
const output = { kind: 'isolated-prototype-heap-measurement', node: process.version,
  platform: process.platform, architecture: process.arch,
  method: 'GC-settled heap delta; five samples; multiple retained copies; input facts and their existing strings excluded; Map adjacency with per-edge counts and per-file provider arrays; not process RSS or integrated Plan 5 measurement', results };
const json = JSON.stringify(output, null, 2) + '\n';
if (process.argv[3]) await writeFile(process.argv[3], json);
process.stdout.write(json);

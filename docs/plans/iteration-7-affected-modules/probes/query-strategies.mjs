import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
assert.equal(typeof global.gc, 'function', 'Run with --expose-gc');

function fixture(modules, filesPerModule, providersPerFile, distinctProviders) {
  const moduleIds = Array.from({ length: modules }, (_, n) => `project/module-${n}`);
  const accesses = [], ownerEntries = [];
  const origin = (id, file) => ({ file, area: { owner: id } });
  for (let m = 0; m < modules; m++) for (let f = 0; f < filesPerModule; f++) {
    const file = `subs/module-${m}/src/file-${f}.ts`;
    ownerEntries.push([file, moduleIds[m]]);
    // Retain same-owner occurrences too: on-demand must scan past these.
    accesses.push({ importer: origin(moduleIds[m], file),
      target: { kind: 'application', origin: origin(moduleIds[m], file) }, selections: [] });
    for (let d = 0; d < providersPerFile; d++) {
      const offset = (f * providersPerFile + d) % distinctProviders + 1;
      const provider = moduleIds[(m + offset) % modules];
      accesses.push({ importer: origin(moduleIds[m], file),
        target: { kind: 'application', origin: origin(provider, `src/api-${provider}.ts`) },
        selections: [{ original: { owner: provider }, forwarding: [] },
          { original: { owner: provider }, forwarding: [] }] });
    }
  }
  return { moduleIds, ownerEntries, accesses, descriptions: [] };
}

function build(input) {
  const reverse = new Map();
  const add = (consumer, provider) => {
    if (provider === undefined || consumer === provider) return;
    let consumers = reverse.get(provider);
    if (!consumers) reverse.set(provider, consumers = new Set());
    consumers.add(consumer);
  };
  for (const access of input.accesses) {
    const consumer = access.importer.area.owner;
    if (access.target.kind === 'application') add(consumer, access.target.origin.area.owner);
    for (const selection of access.selections) {
      if (selection.original) add(consumer, selection.original.owner);
      for (const origin of selection.forwarding) add(consumer, origin.area.owner);
    }
  }
  for (const description of input.descriptions) {
    const consumer = input.ownerMap.get(description.file);
    if (consumer !== undefined) for (const shim of description.shims) add(consumer, input.ownerMap.get(shim));
  }
  return reverse;
}
function traverse(reverse, seed) {
  const seen = new Set([seed]), queue = [seed];
  for (let i = 0; i < queue.length; i++) for (const consumer of reverse.get(queue[i]) ?? []) {
    if (!seen.has(consumer)) { seen.add(consumer); queue.push(consumer); }
  }
  seen.delete(seed);
  return [...seen].sort(); // fixture IDs are ASCII: byte and string order agree
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50Ms: +sorted[Math.floor(sorted.length * 0.5)].toFixed(4),
    p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(4),
    maxMs: +sorted.at(-1).toFixed(4) };
}
function memory(input) {
  const copies = input.accesses.length > 100000 ? 8 : 32, samples = [];
  for (let i = 0; i < 5; i++) {
    global.gc(); global.gc();
    const before = process.memoryUsage().heapUsed;
    globalThis.__queryMaps = Array.from({ length: copies }, () => build(input));
    global.gc(); global.gc();
    samples.push((process.memoryUsage().heapUsed - before) / copies);
    globalThis.__queryMaps = undefined;
  }
  global.gc();
  return { liveMapMedianBytes: Math.round([...samples].sort((a,b) => a-b)[2]), samplesBytes: samples.map(Math.round) };
}

const inputs = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : [];
inputs.push(...[
  ['sparse-100', fixture(100, 5, 4, 10)],
  ['sparse-1000', fixture(1000, 5, 4, 10)],
  ['dense-1000', fixture(1000, 20, 10, 100)],
].map(([name, input]) => ({ name, ...input })));
const results = [];
for (const input of inputs) {
  input.ownerMap = new Map(input.ownerEntries); // Plan 5 already retains ownership
  const reverse = build(input);
  let seed = input.moduleIds[0], expected = [];
  // Choose the largest reachable set among module seeds, outside measurement.
  // Synthetic ring graphs reach all nodes; small real projects are exhausted.
  for (const id of input.name.startsWith('sparse') || input.name.startsWith('dense') ? [seed] : input.moduleIds) {
    const found = traverse(reverse, id);
    if (found.length >= expected.length) { seed = id; expected = found; }
  }
  for (let i = 0; i < 20; i++) { traverse(reverse, seed); traverse(build(input), seed); }
  global.gc();
  const eager = [], onDemand = [];
  for (let i = 0; i < 200; i++) {
    // Alternate order to avoid always placing one method after allocation work.
    for (const kind of i % 2 ? ['eager', 'onDemand'] : ['onDemand', 'eager']) {
      const start = performance.now();
      const answer = traverse(kind === 'eager' ? reverse : build(input), seed);
      (kind === 'eager' ? eager : onDemand).push(performance.now() - start);
      assert.deepEqual(answer, expected);
    }
  }
  results.push({ name: input.name, modules: input.moduleIds.length,
    accesses: input.accesses.length, moduleEdges: [...reverse.values()].reduce((n,s) => n+s.size,0),
    seed, affected: expected.length, retainedTraversal: stats(eager),
    buildAndTraverse: stats(onDemand), temporaryMap: memory(input) });
  process.stderr.write(`${input.name}: eager ${stats(eager).p50Ms} ms, on-demand ${stats(onDemand).p50Ms} ms\n`);
}
const output = { kind: 'query-strategy-prototype', node: process.version, platform: process.platform,
  architecture: process.arch, warmups: 20, samples: 200,
  method: 'Source-shaped retained accesses and description shim lists; in-memory scan, Map/Set construction and traversal. No source parse, report projection or compiler call. Scope/error handling, actual worker/IPC, queueing, synchronization, peak allocation and incremental maintenance are not measured.', results };
const json = JSON.stringify(output, null, 2) + '\n';
if (process.argv[3]) await writeFile(process.argv[3], json);
process.stdout.write(json);

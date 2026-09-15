import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const toolkit=process.argv[2], destination=process.argv[3];
if (!toolkit || !destination) throw new Error('Usage: query-inputs.mts <toolkit-checkout> <output-json>');
const { runBatch } = await import(pathToFileURL(resolve(toolkit, 'src/batch.ts')).href);
const inputs = [];
for (const [name, root] of [['reference', resolve(toolkit, 'examples/collection-review')], ['toolkit', resolve(toolkit)]] as const) {
  const run = await runBatch({ cwd: root, root, capabilities: ['static-access', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] });
  assert.equal(run.status, 'reported');
  if (run.status !== 'reported') throw new Error('Missing report');
  assert.equal(run.report.outcome.execution, 'completed');
  const snapshot = run.report.snapshot!;
  assert.ok(snapshot.catalog);
  // Keep the dependency-bearing parts of every access, including same-owner
  // and external occurrences; do not start from a precomputed module map.
  inputs.push({ name, inputId: run.report.inputId,
    moduleIds: snapshot.inventory.modules.map(m => m.id),
    ownerEntries: snapshot.inventory.files.map(f => [f.path, f.owner]),
    accesses: snapshot.accesses.map(a => ({ importer: a.importer, target: a.target,
      selections: a.selections.map(s => ({ original: s.original, forwarding: s.forwarding })) })),
    descriptions: snapshot.catalog.files.map(f => ({ file: f.file, shims: f.descriptionFiles })) });
  process.stderr.write(`${name}: ${snapshot.accesses.length} retained-shaped access records\n`);
}
await writeFile(destination, JSON.stringify(inputs) + '\n');

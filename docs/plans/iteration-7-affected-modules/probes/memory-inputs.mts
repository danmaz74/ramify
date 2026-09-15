import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const toolkit = process.argv[2], destination = process.argv[3];
if (!toolkit || !destination) throw new Error('Usage: memory-inputs.mts <toolkit-checkout> <output-json>');
const { runBatch } = await import(pathToFileURL(resolve(toolkit, 'src/batch.ts')).href);
const results = [];
for (const [name, root] of [['reference', resolve(toolkit, 'examples/collection-review')], ['toolkit', resolve(toolkit)]] as const) {
  const result = await runBatch({ cwd: root, root, capabilities: ['static-access', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] });
  assert.equal(result.status, 'reported');
  if (result.status !== 'reported') throw new Error('Missing result');
  assert.equal(result.report.outcome.execution, 'completed');
  const snapshot = result.report.snapshot!;
  assert.ok(snapshot?.catalog);
  const owner = new Map(snapshot.inventory.files.map(f => [f.path, f.owner]));
  const originals = new Map(snapshot.catalog.originals.map(o => [JSON.stringify(o.id), o.origin.area.owner]));
  const grouped = new Map<string, { file: string; consumer: string; providers: Set<string> }>();
  const add = (file: string, consumer: string, provider: string | undefined) => {
    if (!provider || consumer === provider) return;
    let item = grouped.get(file);
    if (!item) grouped.set(file, item = { file, consumer, providers: new Set() });
    item.providers.add(provider);
  };
  for (const access of snapshot.accesses) {
    const file = access.importer.file, consumer = access.importer.area.owner;
    if (access.target.kind === 'application') add(file, consumer, access.target.origin.area.owner);
    for (const selection of access.selections) {
      if (selection.original) add(file, consumer, originals.get(JSON.stringify(selection.original)));
      for (const origin of selection.forwarding) add(file, consumer, origin.area.owner);
    }
  }
  for (const file of snapshot.catalog.files) {
    const consumer = owner.get(file.file);
    if (consumer) for (const declaration of file.descriptionFiles) add(file.file, consumer, owner.get(declaration));
  }
  results.push({ name, modules: snapshot.inventory.modules.length, inputId: result.report.inputId,
    files: [...grouped.values()].map(x => ({ ...x, providers: [...x.providers] })) });
  process.stderr.write(`${name}: ${snapshot.inventory.modules.length} modules, ${grouped.size} contributing files\n`);
}
await writeFile(destination, JSON.stringify(results, null, 2) + '\n');

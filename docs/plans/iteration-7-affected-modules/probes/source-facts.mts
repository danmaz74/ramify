import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const toolkit = process.argv[2];
if (!toolkit) throw new Error('Pass the Plan 5 toolkit checkout as the first argument');
const { runBatch } = await import(pathToFileURL(resolve(toolkit, 'src/batch.ts')).href);

const root = await mkdtemp(join(tmpdir(), 'ramify-affected-data-'));
const files: Record<string, string> = {
  'module.ramify': 'ramify 1\nmodule probe\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  'src/root.ts': 'export const root = 1;',
  'subs/a/src/a.ts': "import { value } from '../../b/src/b.js'; export const result = value;",
  'subs/b/src/b.ts': "export { value } from '../../c/src/c.js';",
  'subs/c/src/c.ts': 'export const value = 1; export interface Shape { value: number }',
  'subs/c/src/init.ts': 'globalThis.console.log(1);',
  'subs/types/src/types.ts': "import type { Shape } from '../../c/src/c.js'; export type Result = Shape;",
  'subs/side/src/side.ts': "import '../../c/src/init.js'; export const side = 1;",
  'subs/tested/src/tested.ts': 'export const tested = 1;',
  'subs/tested/src/tests/test.ts': "import { value } from '../../../c/src/c.js'; void value;",
  'subs/integration/src/test.ts': "import { result } from '../../a/src/a.js'; void result;",
  'subs/unrelated/src/u.ts': 'export const unrelated = 1;',
};
for (const name of ['a', 'b', 'c', 'types', 'side', 'tested', 'integration', 'unrelated']) {
  files[`subs/${name}/module.ramify`] = `ramify 1\nmodule ${name}${name === 'integration' ? ' tagged [testing]' : ''}\n`;
}
const capabilities = ['static-access', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;
async function analyze() {
  const run = await runBatch({ cwd: root, root, capabilities });
  assert.equal(run.status, 'reported');
  if (run.status !== 'reported' || !run.report.snapshot) throw new Error('Missing report');
  assert.equal(run.report.outcome.execution, 'completed');
  const report = run.report;
  const snapshot = report.snapshot!;
  const originals = new Map(snapshot.catalog!.originals.map(o => [JSON.stringify(o.id), o.origin.area.owner]));
  const edges = new Set<string>();
  for (const access of snapshot.accesses) {
    const importer = access.importer.area.owner;
    const targets = new Set<string>();
    if (access.target.kind === 'application') targets.add(access.target.origin.area.owner);
    for (const selected of access.selections) {
      if (selected.original) { const owner = originals.get(JSON.stringify(selected.original)); if (owner) targets.add(owner); }
      for (const origin of selected.forwarding) targets.add(origin.area.owner);
    }
    for (const target of targets) if (target !== importer) edges.add(`${importer}->${target}`);
  }
  return { report, snapshot, edges: [...edges].sort() };
}
try {
  for (const [path, text] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); }
  const before = await analyze();
  const expected = ['a->b', 'a->c', 'b->c', 'integration->a', 'side->c', 'tested->c', 'types->c'].map(e => e.split('->').map(x => `probe/${x}`).join('->')).sort();
  assert.deepEqual(before.edges, expected);
  assert.equal(before.report.outcome.coverage, 'complete');
  assert.ok(before.report.summary.denied > 0);
  const side = before.snapshot.accesses.find(a => a.form === 'side-effect-import')!;
  assert.equal(side.selections.length, 0);
  assert.equal(side.target.kind, 'application');
  await writeFile(join(root, 'subs/c/src/c.ts'), 'export const value = 2; export interface Shape { value: number }');
  const after = await analyze();
  assert.deepEqual(after.edges, before.edges);
  await writeFile(join(root, 'subs/unrelated/src/u.ts'), 'declare const path: string; void import(path); export const unrelated = 1;');
  const limited = await analyze();
  assert.equal(limited.report.outcome.coverage, 'partial');
  assert.ok(limited.report.coverage.some(note => note.code === 'nonliteral-target'));
  process.stdout.write(JSON.stringify({ status: 'passed', method: 'real batch source extraction from Plan 5 iteration 2 code; no retained-session claim', modules: before.snapshot.inventory.modules.length, edges: before.edges, symbolFreeTargetRetained: true, bothTestFormsRetained: true, deniedDependenciesRetained: true, valueOnlyEditKeepsEdges: true, nonliteralTargetIsPartial: true }, null, 2) + '\n');
} finally { await rm(root, { recursive: true, force: true }); }

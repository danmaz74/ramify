import { createHook } from 'node:async_hooks';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeIncrement, resolveProject } from '../../subs/analysis/src/index.js';
import type { IncrementRun, RetainedAnalysis, AnalysisReport } from '../../subs/analysis/src/index.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { createEditFixture, consumerProbe, providerApi } from './fixtures/plan2/project.js';
import { prepareReferenceEdits, referenceEditFixture, cssShim } from './fixtures/plan2/reference.js';
import { applyTextMutation, createLaterFile, residentTextMutations as edits } from './resident-mutations.js';
import { assertReferenceEditReport } from './resident-expectations.js';
import { sessionInputs, sessionReport, inspectPlainReport } from './session-expectations.js';
import { assertEquivalentReports } from './equivalence-comparison.js';
import { analysisEvidence, recordObservation } from './observations.js';
import type { InstanceHandler, ProjectContext, Assertions } from './runner.js';

type Reported = Extract<IncrementRun, { status: 'reported' }>;
async function increment(root: string, previous: RetainedAnalysis | null, changes: readonly string[] | null): Promise<Reported & { helpers: number }> {
  let helpers = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') helpers++; } });
  hook.enable();
  let run: IncrementRun;
  try { run = await analyzeIncrement({ inputs: sessionInputs(root), previous,
    changes: changes?.map(path => ({ path, kind: 'unknown' })) ?? null }); }
  finally { hook.disable(); }
  if (run.status !== 'reported') throw new Error('Increment unexpectedly cancelled');
  recordObservation('increment', { report: analysisEvidence(run.report), retained: run.retained && {
    inputId: run.retained.inputId, bytes: run.retained.bytes, stages: run.retained.stages }, reused: run.reused, changed: run.changed, helpers });
  return { ...run, helpers };
}
function completed(run: Reported, a: Assertions, prefix = ''): void {
  a.equal(`${prefix}completed engine`, run.report.outcome.execution, 'completed');
  a.ok(`${prefix}sealed retained input`, run.retained?.inputId.startsWith('input/1:'));
  a.ok(`${prefix}all stages completed`, run.report.stages.every(stage => stage.status === 'completed'));
}
async function equal(root: string, run: Reported, a: Assertions, prefix = ''): Promise<void> {
  assertEquivalentReports(await sessionReport(root), run.report);
  a.ok(`${prefix}whole report equals fresh batch except runId`, true);
}
const baselines = new Map<string, Reported>();
const handlers = new Map<string, InstanceHandler>();
const sourceEdit = { path: 'src/assembly.ts', before: "export type AppRouter = AssembledSystem['router'];",
  after: "export type AppRouter = AssembledSystem['router'];\nexport const residentSequenceValue = 1;" };
const configurationEdit = { path: 'tsconfig.json', before: '"target": "ES2022"', after: '"target": "ES2021"' };
function add(name: string, selection: 'R' | 'F', mutate: (root: string) => Promise<unknown>,
  check: (context: ProjectContext, baseline: Reported, run: Reported & { helpers: number }) => Promise<void> | void,
  options: { changes?: readonly string[] | null; absent?: boolean; dependency?: boolean } = {}): void {
  handlers.set(`I2-10:${name}`, { kind: 'project', fixture: selection === 'R' ? referenceEditFixture : {
    kind: 'create', create: options.absent ? root => createEditFixture(root, 'missing-file-appears') : createProjectFixture },
    prepare: selection === 'R' ? ({ root }) => prepareReferenceEdits(root, options.dependency) : undefined,
    baseline: async ({ root, assertions }) => {
      const run = await increment(root, null, null); completed(run, assertions, 'baseline ');
      assertions.equal('baseline has no denied imports', run.report.summary.denied, 0); baselines.set(root, run);
    },
    mutate: ({ root }) => mutate(root).then(() => undefined),
    run: async context => {
      const baseline = baselines.get(context.root)!; baselines.delete(context.root);
      const run = await increment(context.root, baseline.retained, options.changes === undefined ? [] : options.changes);
      completed(run, context.assertions); await equal(context.root, run, context.assertions); await check(context, baseline, run);
    },
  });
}
const reused = (run: Reported) => [...run.reused].sort();
const unchanged = async () => {};
add('null-changes-no-reuse', 'F', unchanged, ({ assertions: a }, _before, run) => {
  a.equal('only file parsing and metadata reused', reused(run), ['metadata', 'parse']); a.ok('finite helpers recomputed unknown inputs', run.helpers > 0);
}, { changes: null });
add('metadata-only-reuse', 'R', root => applyTextMutation(root, edits['readme-edit']), ({ assertions: a }, before, run) => {
  a.equal('every other stage reused', reused(run), ['access', 'catalog', 'configuration', 'decide', 'link', 'parse']);
  a.equal('no helper spawned', run.helpers, 0); assertReferenceEditReport('readme-edit', before.report, run.report, a);
}, { changes: [edits['readme-edit'].path] });
add('exposure-only-reuse', 'R', root => applyTextMutation(root, edits['remove-hop']), ({ assertions: a }, before, run) => {
  a.equal('source and configuration reused', reused(run), ['access', 'catalog', 'configuration', 'metadata']);
  a.equal('no source helper spawned', run.helpers, 0); assertReferenceEditReport('remove-hop', before.report, run.report, a);
}, { changes: [edits['remove-hop'].path] });
add('header-tag-rerun', 'R', root => applyTextMutation(root, edits['tag-change']), ({ assertions: a }, before, run) => {
  a.equal('compiler stages rerun with retained configuration', run.reused.filter(stage => ['configuration', 'catalog', 'access', 'link', 'decide'].includes(stage)), ['configuration']);
  a.ok('source helper ran', run.helpers > 0); assertReferenceEditReport('tag-change', before.report, run.report, a);
});
add('source-rerun', 'R', root => applyTextMutation(root, sourceEdit), ({ assertions: a }, _before, run) => {
  a.equal('configuration and text metadata survive a source edit', reused(run), ['configuration', 'metadata', 'parse']);
  a.ok('changed source original recorded', run.report.snapshot!.catalog!.originals.some(o => o.id.binding === 'residentSequenceValue'));
});
add('configuration-rerun', 'F', root => applyTextMutation(root, configurationEdit), ({ assertions: a }, _before, run) => {
  a.equal('only parse and metadata survive configuration edit', reused(run), ['metadata', 'parse']); a.ok('configuration edit captured', run.changed?.includes('tsconfig.json'));
});
add('absent-appears-rerun', 'F', createLaterFile, ({ assertions: a }, before, run) => {
  a.ok('prior captured absence retained', before.retained!.inputs.some(i => i.role === 'absent' && i.path.endsWith('/later.ts')));
  a.ok('catalog reran', !run.reused.includes('catalog')); a.equal('resolved target removes coverage', run.report.coverage, []);
  a.ok('new file captured', run.changed?.some(path => path.endsWith('/later.ts')));
}, { absent: true, changes: ['subs/consumer/src/later.ts'] });
add('dependency-rerun', 'R', root => applyTextMutation(root, edits['shim-change']), ({ assertions: a }, before, run) => {
  a.ok('dependency had been captured', before.retained!.inputs.some(i => i.path === cssShim));
  a.ok('catalog and access reran despite empty hint', !run.reused.includes('catalog') && !run.reused.includes('access'));
  a.ok('actual dependency difference discovered', run.changed?.includes(cssShim));
  a.ok('changed shim causes independently expected missing default', run.report.diagnostics.some(d => d.code === 'missing-export'));
}, { dependency: true, changes: [] });
add('products-plain', 'R', unchanged, ({ assertions: a }, _before, run) => {
  const inspection = inspectPlainReport(run.retained); a.ok('retained object graph is plain and frozen', inspection.objects > 0);
  a.equal('self-accounted UTF-8 serialized length', run.retained!.bytes, Buffer.byteLength(JSON.stringify(run.retained)));
  a.equal('JSON round trip preserves all products', JSON.parse(JSON.stringify(run.retained)), run.retained);
});

for (const variant of ['given', 'found', 'no-configuration'] as const) {
  handlers.set(`I2-10:resolve-${variant}`, { kind: 'project', workRoot: join(tmpdir(), 'ramify-resolve-cases'), fixture: { kind: 'create', create: createProjectFixture },
    baseline: async ({ root, assertions: a }) => { const report = await sessionReport(root); a.equal('baseline selected all owners', report.summary.owners, 3); },
    mutate: variant === 'no-configuration' ? ({ root }) => rm(join(root, 'tsconfig.json')) : unchanged,
    run: async ({ root, assertions: a }) => {
      const request = sessionInputs(root).project;
      const result = await resolveProject(variant === 'found' ? { ...request, root: undefined, cwd: join(root, 'subs/consumer/src') } : request);
      if (variant === 'no-configuration') {
        a.equal('missing configuration is unavailable', result.status, 'unavailable');
        if (result.status !== 'resolved') a.equal('precise unavailable classification', result.issues.map(i => i.code), ['configuration-not-found']);
      } else {
        a.ok('resolution succeeded', result.status === 'resolved');
        if (result.status === 'resolved') {
          a.equal('canonical root and configuration', [result.root, result.configuration], [await realpath(root), await realpath(join(root, 'tsconfig.json'))]);
          a.equal('selection recorded', result.selection, variant);
          a.equal('acquisition selects the same root', (await sessionReport(root)).scope!.root, result.root);
        }
      }
    } });
}
handlers.set('I2-10:resolve-outside', { kind: 'memory', run: async ({ assertions: a }) => {
  const root = await mkdtemp(join(tmpdir(), 'ramify-resolve-outside-'));
  try {
    await mkdir(join(root, 'nested')); await createProjectFixture(join(root, 'nested'));
    const result = await resolveProject({ cwd: root, scope: 'whole-project', configuration: 'discover' });
    a.equal('does not search child directories', result.status, 'unavailable');
    if (result.status !== 'resolved') a.equal('missing root stays unavailable', result.issues.map(i => i.code), ['root-not-found']);
  } finally { await rm(root, { recursive: true, force: true }); }
} });

for (const variant of ['identical-inputs-equal', 'reuse-equal', 'independent-negatives']) {
  handlers.set(`I2-11:${variant}`, { kind: 'project', fixture: referenceEditFixture,
    prepare: ({ root }) => prepareReferenceEdits(root),
    baseline: async ({ root, assertions: a }) => {
      const initial = await increment(root, null, null); completed(initial, a, 'baseline ');
      a.equal('reference baseline clean', [initial.report.summary.denied, initial.report.coverage], [0, []]); baselines.set(root, initial);
    }, mutate: unchanged,
    run: async ({ root, assertions: a }) => {
      const baseline = baselines.get(root)!; baselines.delete(root);
      let previous = baseline;
      const steps = ['remove-hop', 'restore-hop', 'wildcard-add', 'readme-edit', 'source-edit', 'revert'];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i], prefix = `step ${i + 1} ${step}: `;
        const paths = step === 'remove-hop' ? await applyTextMutation(root, edits['remove-hop'])
          : step === 'restore-hop' ? await applyTextMutation(root, edits['remove-hop'], true)
          : step === 'wildcard-add' ? await applyTextMutation(root, edits['wildcard-add'])
          : step === 'readme-edit' ? await applyTextMutation(root, edits['readme-edit'])
          : step === 'source-edit' ? await applyTextMutation(root, sourceEdit)
          : [...await applyTextMutation(root, sourceEdit, true), ...await applyTextMutation(root, edits['readme-edit'], true), ...await applyTextMutation(root, edits['wildcard-add'], true)];
        const run = await increment(root, variant === 'identical-inputs-equal' ? null : previous.retained, paths);
        completed(run, a, prefix); await equal(root, run, a, prefix);
        a.equal(`${prefix}independent expected denials`, run.report.snapshot!.results.flatMap(r => r.decisions).filter(d => d.status === 'denied')
          .map(d => [d.question.importer.file, d.original?.id.binding, d.reason]), i === 0 ? [['src/assembly.ts', 'createCatalogRouter', 'not-visible']] : []);
        if (i === 2) {
          assertReferenceEditReport('wildcard-add', baseline.report, run.report, a);
        }
        if (i === 3) {
          a.equal(`${prefix}README does not change permissions`, run.report.snapshot!.results, previous.report.snapshot!.results);
          a.equal(`${prefix}README does not change expanded contracts`, run.report.snapshot!.linked, previous.report.snapshot!.linked);
          a.ok(`${prefix}purpose updated`, run.report.snapshot!.inventory.modules.some(m => m.purpose.state === 'present' && m.purpose.paragraph.includes('for the current project')));
        }
        if (i === 4) a.ok(`${prefix}source original added`, run.report.snapshot!.catalog!.originals.some(o => o.id.binding === 'residentSequenceValue'));
        if (i === 5) a.equal(`${prefix}revert restores original permissions`, run.report.snapshot!.results, baseline.report.snapshot!.results);
        if (variant !== 'identical-inputs-equal' && i > 0) a.ok(`${prefix}unchanged products reused`, run.reused.length > 0);
        previous = run;
      }
    } });
}
for (const variant of ['commonjs-module-target-limit', 'declare-global-note'] as const) {
  handlers.set(`I2-11:${variant}`, { kind: 'project', fixture: { kind: 'create', create: createProjectFixture },
    baseline: async ({ root, assertions: a }) => { const run = await increment(root, null, null); completed(run, a, 'baseline '); a.equal('baseline has no notes', run.report.coverage, []); },
    mutate: async ({ root }) => {
      if (variant === 'commonjs-module-target-limit') {
        await put(root, 'subs/provider/src/api.ts', 'export const api = 1;\n');
        await put(root, consumerProbe, "declare function require(path: string): unknown; const api = require('../../provider/src/api.js'); void api;\n");
      } else await writeFile(join(root, providerApi), await readFile(join(root, providerApi), 'utf8') + '\ndeclare global { interface Window { ramify: number } }\n');
    },
    run: async ({ root, assertions: a }) => {
      const run = await increment(root, null, null); completed(run, a); await equal(root, run, a);
      const code = variant === 'declare-global-note' ? 'shared-global' : 'unsupported-commonjs';
      a.equal('inherited coverage outcome is preserved', run.report.coverage.map(n => n.code),
        variant === 'declare-global-note' ? [code] : [code, 'unresolved-target']);
      a.ok('coverage locates the source construct', run.report.coverage.every(n => n.location.line > 0 && n.location.column > 0));
      a.equal('ordinary exports remain usable and no testing-origin denial invented', run.report.diagnostics, []);
      if (variant === 'declare-global-note') a.ok('named export still checked', run.report.summary.allowed > 0);
    } });
}
export const incrementHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

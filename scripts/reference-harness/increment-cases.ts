import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProject } from '../../subs/analysis/src/index.js';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { createSessionDriver } from '../../src/resident-assembly.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { consumerProbe, isSignatureNote, providerApi, providerValueNote, signatureNoteKey } from './fixtures/plan2/project.js';
import { prepareReferenceEdits, referenceEditFixture } from './fixtures/plan2/reference.js';
import { applyTextMutation, residentTextMutations as edits } from './resident-mutations.js';
import { assertReferenceEditReport } from './resident-expectations.js';
import { sessionInputs, sessionReport } from './session-expectations.js';
import { assertEquivalentReports } from './equivalence-comparison.js';
import { analysisEvidence, recordObservation } from './observations.js';
import type { InstanceHandler, Assertions } from './runner.js';

type Reported = { readonly report: AnalysisReport };
async function retainedReport(root: string): Promise<Reported> {
  const driver = createSessionDriver(), inputs = sessionInputs(root);
  try {
    const opened = await driver.open(inputs.project, { registry: 'default', capabilities: inputs.capabilities });
    if (opened.status !== 'opened') throw new Error(`Session driver did not open: ${opened.status}`);
    const report = await opened.session.report(undefined, opened.revision.sequence);
    if (!report) throw new Error('Session revision report unavailable');
    recordObservation('retained-session-equivalence', { report: analysisEvidence(report), checked: opened.revision.checked });
    return { report };
  } finally { await driver.dispose(); }
}
function completed(run: Reported, a: Assertions, prefix = ''): void {
  a.equal(`${prefix}completed engine`, run.report.outcome.execution, 'completed');
  a.ok(`${prefix}sealed input`, run.report.inputId?.startsWith('input/1:'));
  a.ok(`${prefix}all stages completed`, run.report.stages.every(stage => stage.status === 'completed'));
}
async function equal(root: string, run: Reported, a: Assertions, prefix = ''): Promise<void> {
  assertEquivalentReports(await sessionReport(root), run.report);
  a.ok(`${prefix}whole report equals fresh batch except runId`, true);
}
const baselines = new Map<string, Reported>();
const handlers = new Map<string, InstanceHandler>();
const unchanged = async () => {};
const sourceEdit = { path: 'src/assembly.ts', before: "export type AppRouter = ReturnType<typeof assembleRouter>;",
  after: "export type AppRouter = ReturnType<typeof assembleRouter>;\nexport const residentSequenceValue = 1;" };

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

for (const variant of ['identical-inputs-equal', 'independent-negatives']) {
  handlers.set(`I2-11:${variant}`, { kind: 'project', fixture: referenceEditFixture,
    prepare: ({ root }) => prepareReferenceEdits(root),
    baseline: async ({ root, assertions: a }) => {
      const initial = await retainedReport(root); completed(initial, a, 'baseline ');
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
        const run = await retainedReport(root);
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
        previous = run;
      }
    } });
}
for (const variant of ['commonjs-module-target-limit', 'declare-global-note'] as const) {
  handlers.set(`I2-11:${variant}`, { kind: 'project', fixture: { kind: 'create', create: createProjectFixture },
    baseline: async ({ root, assertions: a }) => { const run = await retainedReport(root); completed(run, a, 'baseline '); a.equal('baseline has only the recipe\'s value signature note', run.report.coverage.map(signatureNoteKey), [providerValueNote]); },
    mutate: async ({ root }) => {
      if (variant === 'commonjs-module-target-limit') {
        await put(root, 'subs/provider/src/api.ts', 'export const api = 1;\n');
        await put(root, consumerProbe, "declare function require(path: string): unknown; const api = require('../../provider/src/api.js'); void api;\n");
      } else await writeFile(join(root, providerApi), await readFile(join(root, providerApi), 'utf8') + '\ndeclare global { interface Window { ramify: number } }\n');
    },
    run: async ({ root, assertions: a }) => {
      const run = await retainedReport(root); completed(run, a); await equal(root, run, a);
      const code = variant === 'declare-global-note' ? 'shared-global' : 'unsupported-commonjs';
      // Coverage is in located order: the consumer probe sorts before the
      // provider API, and the appended `declare global` follows line 1's `value`.
      a.equal('inherited coverage outcome is preserved beside the recipe\'s value note', run.report.coverage.map(n => n.code),
        variant === 'declare-global-note' ? ['signature-inferred', code] : [code, 'unresolved-target', 'signature-inferred']);
      a.equal('the recipe\'s value signature note is unchanged', run.report.coverage.filter(isSignatureNote).map(signatureNoteKey), [providerValueNote]);
      a.ok('coverage locates the source construct', run.report.coverage.every(n => n.location.line > 0 && n.location.column > 0));
      a.equal('ordinary exports remain usable and no testing-origin denial invented', run.report.diagnostics, []);
      if (variant === 'declare-global-note') a.ok('named export still checked', run.report.summary.allowed > 0);
    } });
}
export const incrementHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

import { lstat, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { createEditFixture } from './fixtures/plan2/project.js';
import { coreDirectory, prepareReferenceEdits, referenceEditFixture, vocabulary } from './fixtures/plan2/reference.js';
import type { ProjectFixture } from './mutation.js';
import { applyTextMutation, moveHistoryToTesting, residentTextMutations as edits } from './resident-mutations.js';
import type { TextMutation } from './resident-mutations.js';
import { assertReferenceEditReport } from './resident-expectations.js';
import { assertEquivalentReports } from './equivalence-comparison.js';
import { Assertions } from './runner.js';

type Edit = { readonly kind: 'text'; readonly mutation: TextMutation; readonly reverse?: boolean }
  | { readonly kind: 'reference-move' | 'synthetic-move'; readonly reverse?: boolean };
export interface SequenceStep {
  readonly name: string;
  /** Stable statement or source anchor description; exact bytes live in edits. */
  readonly anchor: string;
  readonly edits: readonly Edit[];
  /** Independent captured-input oracle when edits also change directory membership. */
  readonly expectedChangedPaths?: readonly string[];
  readonly expected: 'baseline' | 'router' | 'wildcard' | 'readme' | 'tags' | 'readme-restored-tags'
    | 'source' | 'configuration' | 'coverage' | 'coverage-wildcard' | 'router-coverage'
    | 'testing' | 'merge' | 's100-exposure' | 's100-readme' | 's100-source' | 's100-testing' | 's100-restored';
}
export interface EditSequence {
  readonly fixture: 'R' | 'S100' | 'F';
  readonly steps: readonly SequenceStep[];
}
const text = (mutation: TextMutation, reverse = false): Edit => ({ kind: 'text', mutation, reverse });
const source: TextMutation = { path: 'src/assembly.ts', before: 'export type AppRouter = AssembledSystem[\'router\'];',
  after: 'export type AppRouter = AssembledSystem[\'router\'];\nexport const residentSequenceValue = 1;' };
const configuration: TextMutation = { path: 'tsconfig.json', before: '"target": "ES2022"', after: '"target": "ES2021"' };
const macro: TextMutation = { path: 'src/assembly.ts', before: 'export type AppRouter = AssembledSystem[\'router\'];',
  after: 'export type AppRouter = AssembledSystem[\'router\'];\nvoid import.meta.glob(\'./*.ts\');' };
const s100Exposure: TextMutation = { path: 'subs/m001/module.ramify',
  before: 'expose-src value from "interfaces/api.ts" to parent\n', after: '// sequence: exposure removed\n' };
const s100Readme: TextMutation = { path: 'subs/m001/README.md',
  before: 'Supplies deterministic workload bytes for the hundred-owner batch measurement.',
  after: 'Supplies the current hundred-owner sequence workload.' };
const s100Source: TextMutation = { path: 'subs/m001/src/interfaces/api.ts', before: 'export const value = 1;', after: 'export const value = 2;' };
const s100Caller = 'subs/m002/src/impl1.ts';
const s100Import = "import { run0 } from './impl0.js'; void run0;\n";

export const equivalenceSequences = {
  'reference-sequence': { fixture: 'R', steps: [
    { name: 'remove-hop', anchor: 'W2: createCatalogRouter', edits: [text(edits['remove-hop'])], expected: 'router' },
    { name: 'restore-hop', anchor: 'W2 without createCatalogRouter', edits: [text(edits['remove-hop'], true)], expected: 'baseline' },
    { name: 'wildcard-add', anchor: 'C1/W1: ObservationCallback declaration', edits: [text(edits['wildcard-add'])], expected: 'wildcard' },
    { name: 'wildcard-remove', anchor: 'C1/W1: added ResidentVocabulary declaration', edits: [text(edits['wildcard-add'], true)], expected: 'baseline' },
    { name: 'readme-edit', anchor: 'workspace purpose paragraph', edits: [text(edits['readme-edit'])], expected: 'readme' },
    { name: 'header-tag-add', anchor: 'core module header', edits: [text(edits['tag-change'])], expected: 'tags' },
    { name: 'header-tag-revert', anchor: 'core module header tagged ui', edits: [text(edits['tag-change'], true)], expected: 'readme-restored-tags' },
    { name: 'source-edit', anchor: 'root AppRouter declaration', edits: [text(source)], expected: 'source' },
    { name: 'configuration-edit', anchor: 'ES2022 compiler target', edits: [text(configuration)], expected: 'configuration' },
    { name: 'configuration-revert', anchor: 'ES2021 compiler target', edits: [text(configuration, true)], expected: 'source' },
  ] },
  'hundred-owner-sequence': { fixture: 'S100', steps: [
    { name: 'exposure-removal', anchor: 'm001 value exposure', edits: [text(s100Exposure)], expected: 's100-exposure' },
    { name: 'readme-edit', anchor: 'm001 purpose paragraph', edits: [text(s100Readme)], expected: 's100-readme' },
    { name: 'source-edit', anchor: 'm001 value initializer', edits: [text(s100Source)], expected: 's100-source' },
    { name: 'testing-area-move', anchor: 'm002 run0 and its two importers', edits: [{ kind: 'synthetic-move' }], expected: 's100-testing' },
    { name: 'revert', anchor: 'reverse all four guarded S100 edits', edits: [{ kind: 'synthetic-move', reverse: true },
      text(s100Source, true), text(s100Readme, true), text(s100Exposure, true)], expected: 's100-restored' },
  ] },
  'contracts-and-coverage-equal': { fixture: 'R', steps: [
    { name: 'macro-import', anchor: 'root AppRouter declaration', edits: [text(macro)], expected: 'coverage' },
    { name: 'wildcard-growth', anchor: 'C1/W1: ObservationCallback declaration', edits: [text(edits['wildcard-add'])], expected: 'coverage-wildcard' },
  ] },
  removals: { fixture: 'R', steps: [
    { name: 'introduce-denial-and-note', anchor: 'W2 and root AppRouter declaration', edits: [text(edits['remove-hop']), text(macro)], expected: 'router-coverage' },
    { name: 'remove-denial', anchor: 'W2 without createCatalogRouter', edits: [text(edits['remove-hop'], true)], expected: 'coverage' },
    { name: 'remove-note', anchor: 'root macro import', edits: [text(macro, true)], expected: 'baseline' },
  ] },
  'remove-hop-live': { fixture: 'R', steps: [
    { name: 'remove-hop', anchor: 'W2: createCatalogRouter', edits: [text(edits['remove-hop'])], expected: 'router' },
  ] },
  'restore-hop-live': { fixture: 'R', steps: [
    { name: 'remove-hop', anchor: 'W2: createCatalogRouter', edits: [text(edits['remove-hop'])], expected: 'router' },
    { name: 'restore-hop', anchor: 'W2 without createCatalogRouter', edits: [text(edits['remove-hop'], true)], expected: 'baseline' },
  ] },
  'wildcard-growth-live': { fixture: 'R', steps: [
    { name: 'wildcard-growth', anchor: 'C1/W1: ObservationCallback declaration', edits: [text(edits['wildcard-add'])], expected: 'wildcard' },
  ] },
  'merge-live': { fixture: 'F', steps: [
    { name: 'merge', anchor: 'provider Type interface', edits: [text(edits['type-to-runtime-merge'])], expected: 'merge' },
  ] },
  'testing-move-live': { fixture: 'R', steps: [
    { name: 'testing-move', anchor: 'history helper and its two importers', edits: [{ kind: 'reference-move' }], expected: 'testing',
      expectedChangedPaths: [`${coreDirectory}/src`, `${coreDirectory}/src/catalog.ts`, `${coreDirectory}/src/history.ts`,
        `${coreDirectory}/src/tests`, `${coreDirectory}/src/tests/catalog.test.ts`, `${coreDirectory}/src/tests/history.ts`] },
  ] },
} as const satisfies Readonly<Record<string, EditSequence>>;
export type SequenceName = keyof typeof equivalenceSequences;

export function sequenceFixture(fixture: EditSequence['fixture']): ProjectFixture {
  if (fixture === 'R') return referenceEditFixture;
  if (fixture === 'F') return { kind: 'create', create: root => createEditFixture(root, 'type-to-runtime-merge') };
  return { kind: 'create', create: async root => {
    // runIsolatedProject supplies an empty directory. Remove only that empty
    // directory so the shared materializer retains its no-overwrite contract.
    const { rmdir } = await import('node:fs/promises');
    await rmdir(root);
    await materializeSynthetic(root, 'S100');
  } };
}

export async function prepareSequence(root: string, fixture: EditSequence['fixture']): Promise<void> {
  if (fixture === 'R') return prepareReferenceEdits(root);
  if (fixture !== 'S100') return;
  // S100's frozen workload has no cross-owner consumers. Explicit setup adds
  // positive witnesses before the baseline, without changing its generator.
  await applyTextMutation(root, { path: s100Exposure.path, before: 'module "m001" tagged []\n',
    after: 'module "m001" tagged []\n' + s100Exposure.before });
  await applyTextMutation(root, { path: 'src/impl0.ts', before: "import { value, type Input } from './interfaces/api.js';",
    after: "import { value as supplied } from '../subs/m001/src/interfaces/api.js'; void supplied;\nimport { value, type Input } from './interfaces/api.js';" });
  await applyTextMutation(root, { path: s100Caller, before: "import { value, type Input } from './interfaces/api.js';",
    after: s100Import + "import { value, type Input } from './interfaces/api.js';" });
}

async function moveSyntheticHelper(root: string, reverse = false): Promise<readonly string[]> {
  const original = 'subs/m002/src/impl0.ts', moved = 'subs/m002/src/tests/moved.ts';
  const from = reverse ? moved : original, to = reverse ? original : moved;
  const changes: TextMutation[] = [
    { path: from, before: "from './interfaces/api.js'", after: "from '../interfaces/api.js'" },
    { path: s100Caller, before: s100Import, after: "import { run0 } from './tests/moved.js'; void run0;\n" },
    { path: 'subs/m002/src/tests/impl.test.ts', before: "from '../impl0.js'", after: "from './moved.js'" },
  ];
  const texts = await Promise.all(changes.map(async edit => {
    const content = await readFile(join(root, edit.path), 'utf8');
    const anchor = reverse ? edit.after : edit.before;
    if (content.split(anchor).length !== 2) throw new Error(`Expected exactly one mutation anchor in ${edit.path}`);
    return content.replace(anchor, () => reverse ? edit.before : edit.after);
  }));
  try { await lstat(join(root, to)); throw new Error(`Expected absent mutation destination: ${to}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await writeFile(join(root, to), texts[0], { flag: 'wx' });
  for (let i = 1; i < changes.length; i++) await writeFile(join(root, changes[i].path), texts[i]);
  await unlink(join(root, from));
  return [original, moved, ...changes.slice(1).map(edit => edit.path)].sort();
}

export async function applySequenceStep(root: string, step: SequenceStep): Promise<readonly string[]> {
  const paths: string[] = [];
  for (const edit of step.edits) paths.push(...await (edit.kind === 'text'
    ? applyTextMutation(root, edit.mutation, edit.reverse)
    : edit.kind === 'reference-move' ? moveHistoryToTesting(root, edit.reverse) : moveSyntheticHelper(root, edit.reverse)));
  return [...new Set(paths)].sort();
}

const decisions = (report: AnalysisReport) => report.snapshot!.results.flatMap(result => result.decisions);
const denied = (report: AnalysisReport) => decisions(report).filter(d => d.status === 'denied')
  .map(d => [d.question.importer.file, d.original?.id.binding, d.reason]);
const routerDenial = ['src/assembly.ts', 'createCatalogRouter', 'not-visible'];

/** Independent semantic oracle, also usable to qualify materialized batch inputs.
 * Batch qualification alone earns no process equivalence or live-watch credit. */
export function assertSequenceReport(fixture: EditSequence['fixture'], step: SequenceStep | null,
  baseline: AnalysisReport, report: AnalysisReport, a: Assertions): void {
  const expected = step?.expected ?? 'baseline';
  a.equal('completed execution', report.outcome.execution, 'completed');
  a.equal('independent owner count', report.summary.owners, fixture === 'R' ? 15 : fixture === 'S100' ? 100 : 3);
  a.ok('nonempty permission results', report.snapshot && decisions(report).length > 0);
  if (expected === 's100-restored') {
    // A source move and its reversal change the captured directory stat
    // identity. This oracle checks restored semantics; the mode comparison
    // still compares every member, including inputId and captured inputs.
    a.equal('restored S100 diagnostics and coverage', [report.diagnostics, report.coverage], [[], []]);
    a.equal('restored S100 independent summary', report.summary, baseline.summary);
    a.equal('restored S100 permissions', report.snapshot!.results, baseline.snapshot!.results);
    a.equal('restored S100 expanded contracts', report.snapshot!.linked, baseline.snapshot!.linked);
    return;
  }
  if (expected === 'baseline') {
    a.equal('baseline is clean', [report.diagnostics, report.coverage, report.summary.denied], [[], [], 0]);
    if (fixture === 'F') a.equal('unmarked Type starts type-only', decisions(report).map(d =>
      [d.question.selection?.request, d.status]), [['type-only', 'allowed']]);
    assertEquivalentReports(baseline, report);
    a.ok('exact baseline restored except runId', true);
    return;
  }
  a.ok('changed captured inputs', report.inputId !== baseline.inputId);
  if (expected === 'merge') {
    a.equal('unmarked Type becomes an allowed value check', decisions(report).map(d =>
      [d.question.selection?.request, d.status, d.original?.id.binding]), [['value', 'allowed', 'Type']]);
  }
  if (expected === 'tags') {
    assertReferenceEditReport('tag-change', baseline, report, a);
    return;
  }
  if (['readme', 'readme-restored-tags'].includes(expected)) assertReferenceEditReport('readme-edit', baseline, report, a);
  const hasCoverage = ['coverage', 'coverage-wildcard', 'router-coverage'].includes(expected);
  a.equal('independent coverage locations', report.coverage.map(c => [c.code, c.location.file]),
    hasCoverage ? [['unsupported-loader', 'src/assembly.ts']] : []);
  if (hasCoverage) a.ok('macro coverage is located', report.coverage[0].location.line > 0 && report.coverage[0].location.column > 0);
  if (expected === 'wildcard' || expected === 'coverage-wildcard') {
    // Reuse the independently enumerated C1/W1 memberships even in the macro
    // sequence, whose unrelated extra access prevents whole-report equality.
    assertReferenceEditReport('wildcard-add', baseline, report, a);
  }
  const s100 = expected.startsWith('s100-');
  const expectedDenials = s100 ? [['src/impl0.ts', 'value', 'not-visible'],
    ...(expected === 's100-testing' ? [[s100Caller, 'run0', 'testing-origin']] : [])]
    : expected === 'router' || expected === 'router-coverage' ? [routerDenial]
      : expected === 'testing' ? [[`${coreDirectory}/src/catalog.ts`, 'resolvePredecessors', 'testing-origin']] : [];
  a.equal('exact independently expected denials', denied(report), expectedDenials);
  a.equal('diagnostics accompany only expected denials', report.diagnostics.length, expectedDenials.length);
  a.equal('check and coverage outcomes', [report.outcome.check, report.outcome.coverage],
    [expectedDenials.length ? 'failed' : 'passed', hasCoverage ? 'partial' : 'complete']);
  if (['source', 'configuration'].includes(expected)) {
    a.ok('new source original is present', report.snapshot!.catalog!.originals.some(o => o.id.binding === 'residentSequenceValue'));
    a.equal('source/config edit preserves existing permissions', report.snapshot!.results, baseline.snapshot!.results);
  }
  if (s100 && expected !== 's100-exposure') {
    const purpose = report.snapshot!.inventory.modules.find(m => m.id === 'bench/m001')!.purpose;
    a.ok('S100 purpose changes independently', purpose.state === 'present' && purpose.paragraph === s100Readme.after);
  }
}

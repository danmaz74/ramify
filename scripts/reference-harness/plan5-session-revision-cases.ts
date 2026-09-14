import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeProject } from '../../subs/analysis/src/analyze-project.js';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { RetainedSession, SessionRevision } from '../../subs/analysis/src/interfaces/session.js';
import { firstDifference } from './equivalence-comparison.js';
import { coreDirectory, referenceRoot, vocabulary, workspaceDescription } from './fixtures/plan2/reference.js';
import { replaceExactlyOnce } from './mutation.js';
import type { IsolatedProject } from './mutation.js';
import { recordObservation } from './observations.js';
import { compilerPid, disposeInspectedSession, openInspectedSession } from './plan5-session-inspection.js';
import type { SessionInspection } from './plan5-session-inspection.js';
import { applyTextMutation, residentTextMutations } from './resident-mutations.js';
import { sessionInputs } from './session-expectations.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const coreCatalog = `${coreDirectory}/src/catalog.ts`;
const reviewsRouter = 'subs/workspace/subs/reviews/src/router.ts';
const validationSource = 'subs/workspace/subs/reviews/subs/validation/src/validate.ts';
const workspaceReadme = 'subs/workspace/README.md';
const extraFile = 'subs/workspace/subs/catalog/src/extra.ts';
const zodDeclaration = 'node_modules/zod/index.d.cts';
const extraSource = "import { recordIdSchema } from '../../contracts/src/interfaces/vocabulary.js';\nexport const extra = recordIdSchema;\n";
const deniedImport = "import type { InspectionPort } from '../../core/src/interfaces/port.js';\n";
const purpose = 'Workspace composes the browser shell and exposes the shared contracts to its descendants.';
const sessionLimits = { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 };
const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const comparable = (report: AnalysisReport): unknown => ({ ...report, runId: 'compared' });

interface Context {
  readonly root: string; readonly assertions: Assertions; readonly session: RetainedSession; readonly inspection: SessionInspection;
}
interface Step {
  readonly revision: SessionRevision; readonly report: AnalysisReport; readonly decided: readonly string[];
}

async function batch(root: string): Promise<AnalysisReport> {
  const result = await analyzeProject(sessionInputs(root));
  if (result.status !== 'reported') throw new Error('The independent batch analysis was cancelled');
  return result.report;
}

/** Read the current projection before the audit can repair a defect. */
async function equalState(context: Context, name: string): Promise<AnalysisReport> {
  const { session, root, assertions } = context;
  const report = await session.report();
  if (!report) throw new Error(`${name}: no current report`);
  const audit = await session.verify();
  assertions.equal(`${name}: the session audit is equal`, audit.status, 'equal');
  assertions.equal(`${name}: the audit preserves the sequence`, session.current?.sequence, audit.status === 'equal' ? audit.sequence : null);
  assertions.equal(`${name}: every report field equals batch except runId`, firstDifference(comparable(await batch(root)), comparable(report)), null);
  return report;
}

async function step(context: Context, name: string, edit: () => Promise<readonly string[]>): Promise<Step> {
  const before = context.session.current!.sequence;
  const decisions = await context.inspection.decisions();
  const paths = await edit();
  const result = await context.session.update(paths.map(path => ({ path, kind: 'changed' as const })));
  if (result.status !== 'revised') throw new Error(`${name}: expected revised, got ${JSON.stringify(result).slice(0, 3000)}`);
  context.assertions.equal(`${name}: exactly one new revision is published`, [result.identical, result.revision.sequence], [false, before + 1]);
  const decided = Object.entries(await context.inspection.decisions())
    .filter(([id, value]) => decisions[id] !== value).map(([id]) => id).sort(order);
  const report = await equalState(context, name);
  recordObservation('plan5-session-revision', { step: name, sequence: result.revision.sequence,
    inputId: result.revision.inputId, checked: result.revision.checked, timings: result.revision.timings, audit: 'equal' });
  return { revision: result.revision, report, decided };
}

async function withSession(context: ProjectContext, run: (context: Context, cold: SessionRevision, baseline: AnalysisReport) => Promise<void>): Promise<void> {
  const opened = await openInspectedSession({ ...sessionInputs(context.root), session: sessionLimits });
  const current = { ...context, session: opened.session, inspection: opened.inspection };
  try {
    const baseline = await equalState(current, 'cold');
    context.assertions.equal('the reference baseline is completed without findings', [baseline.outcome.execution, baseline.summary.errors], ['completed', 0]);
    context.assertions.ok('the cold session owns a live compiler', compilerPid(opened.session) !== null);
    await run(current, opened.revision, baseline);
  } finally { await disposeInspectedSession(opened.session, opened.inspection, context.assertions); }
}

async function replace(root: string, path: string, before: string, after: string): Promise<readonly string[]> {
  await replaceExactlyOnce(join(root, path), before, after);
  return [path];
}
async function editReadme(root: string): Promise<readonly string[]> {
  const before = (await readFile(join(root, workspaceReadme), 'utf8')).split(/\r?\n\r?\n/)[1];
  if (!before?.startsWith('Workspace is the browser shell.')) throw new Error('Reference README paragraph changed');
  return replace(root, workspaceReadme, before, purpose);
}
async function createExtra(root: string, denied = false): Promise<readonly string[]> {
  await writeFile(join(root, extraFile), extraSource + (denied
    ? "import type { InspectionPort } from '../../reviews/subs/core/src/interfaces/port.js';\n" : ''), { flag: 'wx' });
  return [extraFile];
}
async function deleteExtra(root: string): Promise<readonly string[]> { await rm(join(root, extraFile)); return [extraFile]; }
function owned(report: AnalysisReport): string[] { return report.snapshot!.inventory.files.map(file => file.path).sort(order); }

function assertBroad(context: Context, name: string, value: Step): void {
  context.assertions.equal(`${name}: every owned file and access is checked on the broad path`,
    value.revision.checked, { path: 'broad', files: owned(value.report), accesses: value.report.summary.accesses, modelRebuilt: true });
}
function assertNoFinding(context: Context, name: string, value: Step): void {
  context.assertions.equal(`${name}: no project finding`, [value.revision.outcome.execution, value.revision.summary.errors], ['completed', 0]);
}
function assertDescription(context: Context, name: string, before: AnalysisReport, value: Step): void {
  const { assertions } = context;
  const workspace = before.snapshot!.inventory.modules.find(module => module.directory === 'subs/workspace')!.id;
  const inSubtree = (owner: string): boolean => owner === workspace || owner.startsWith(`${workspace}/`);
  const expected = before.snapshot!.accesses.filter(access => inSubtree(access.importer.area.owner)
    || access.selections.some(selection => selection.original && inSubtree(selection.original.owner))).map(access => access.id).sort(order);
  assertions.ok(`${name}: the fixture has accesses outside the changed subtree`, expected.length < before.summary.accesses);
  assertions.equal(`${name}: exactly the accesses whose importer or selected original owner is in the subtree are decided`, value.decided, expected);
  assertions.equal(`${name}: the description path relinks without re-extraction`, value.revision.checked,
    { path: 'description', files: [], accesses: expected.length, modelRebuilt: true });
  assertions.equal(`${name}: compiler, description and access extraction timings are zero`,
    [value.revision.timings.compiler, value.revision.timings.descriptions, value.revision.timings.accesses], [0, 0, 0]);
}
function assertHopDenied(context: Context, name: string, value: Step): void {
  context.assertions.equal(`${name}: W2 removal denies only the root createCatalogRouter import`,
    value.revision.delta.added.map(item => [item.code, item.location?.file, item.original?.binding]),
    [['not-visible', 'src/assembly.ts', 'createCatalogRouter']]);
  context.assertions.equal(`${name}: the project has that one denial`, value.revision.summary.errors, 1);
}
function assertMetadata(context: Context, name: string, value: Step): void {
  context.assertions.equal(`${name}: the checked set contains no file or access`, value.revision.checked,
    { path: 'metadata', files: [], accesses: 0, modelRebuilt: false });
  context.assertions.equal(`${name}: compiler, description, extraction, link and decision work is zero`,
    [value.revision.timings.compiler, value.revision.timings.descriptions, value.revision.timings.accesses, value.revision.timings.link, value.revision.timings.decide], [0, 0, 0, 0, 0]);
  context.assertions.equal(`${name}: the report carries the new purpose paragraph`,
    value.report.snapshot!.inventory.modules.find(module => module.directory === 'subs/workspace')!.purpose,
    { state: 'present', readme: workspaceReadme, paragraph: purpose });
  assertNoFinding(context, name, value);
}
function assertCreated(context: Context, name: string, value: Step): void {
  // The structural edits plan narrowed a created owned file to the membership path.
  context.assertions.equal(`${name}: a created file takes the membership path`, value.revision.checked.path, 'membership');
  context.assertions.ok(`${name}: the membership checked set names the new file and not every owned file`,
    value.revision.checked.files.includes(extraFile) && value.revision.checked.files.length < owned(value.report).length
    && value.revision.checked.accesses < value.report.summary.accesses);
  context.assertions.ok(`${name}: the catalog contains the new file`, value.report.snapshot!.catalog!.files.some(file => file.file === extraFile));
  context.assertions.equal(`${name}: its vocabulary import is interpreted and decided`,
    value.report.snapshot!.accesses.filter(access => access.importer.file === extraFile).map(access =>
      [access.selections[0]?.exportedName, value.report.snapshot!.results.find(result => result.accessId === access.id)?.decisions[0]?.status]),
    [['recordIdSchema', 'allowed']]);
  assertNoFinding(context, name, value);
}
function assertDeleted(context: Context, name: string, value: Step, path: 'broad' | 'membership' = 'broad'): void {
  if (path === 'broad') assertBroad(context, name, value);
  // The structural edits plan narrowed deleting an unreferenced owned file to the membership path.
  else context.assertions.equal(`${name}: deleting the unreferenced file takes the membership path and checks no other file`,
    value.revision.checked, { path: 'membership', files: [], accesses: 0, modelRebuilt: value.revision.checked.modelRebuilt });
  context.assertions.equal(`${name}: the deleted file is absent from inventory, catalog, accesses and coverage`,
    [owned(value.report).includes(extraFile), value.report.snapshot!.catalog!.files.some(file => file.file === extraFile),
      value.report.snapshot!.accesses.some(access => access.importer.file === extraFile), value.report.coverage.some(note => note.location.file === extraFile)],
    [false, false, false, false]);
  assertNoFinding(context, name, value);
}

const reference = {
  kind: 'project' as const, fixture: { kind: 'copy' as const, sourceRoot: referenceRoot },
  prepare: async ({ root }: IsolatedProject) => { await symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')); },
  baseline: async ({ root, assertions }: ProjectContext) => {
    assertions.equal('W2 has its reviewed exposure statement',
      (await readFile(join(root, workspaceDescription), 'utf8')).split(residentTextMutations['remove-hop'].before).length, 2);
  },
  mutate: async () => {},
};
const handlers = new Map<string, InstanceHandler>();
const add = (id: string, run: (context: Context, cold: SessionRevision, baseline: AnalysisReport) => Promise<void>): void => {
  handlers.set(`I5-07:${id}`, { ...reference, run: (context: ProjectContext) => withSession(context, run) });
};

add('description-relink-subtree', async (context, _cold, baseline) => {
  const value = await step(context, 'remove-hop', () => applyTextMutation(context.root, residentTextMutations['remove-hop']));
  assertDescription(context, 'remove-hop', baseline, value);
  assertHopDenied(context, 'remove-hop', value);
});
add('description-revert', async (context, _cold, baseline) => {
  const denied = await step(context, 'remove-hop', () => applyTextMutation(context.root, residentTextMutations['remove-hop']));
  assertDescription(context, 'remove-hop', baseline, denied);
  assertHopDenied(context, 'remove-hop', denied);
  const restored = await step(context, 'restore-hop', () => applyTextMutation(context.root, residentTextMutations['remove-hop'], true));
  assertDescription(context, 'restore-hop', denied.report, restored);
  context.assertions.equal('restore-hop removes exactly the W2 denial', restored.revision.delta.removed, denied.revision.delta.added.map(item => item.id));
  assertNoFinding(context, 'restore-hop', restored);
});
add('readme-metadata-only', async context => assertMetadata(context, 'README edit', await step(context, 'README edit', () => editReadme(context.root))));
add('created-importing-file', async context => assertCreated(context, 'file created', await step(context, 'file created', () => createExtra(context.root))));
add('deleted-file', async context => {
  const created = await step(context, 'file with denial created', () => createExtra(context.root, true));
  assertBroad(context, 'file with denial created', created);
  context.assertions.equal('the file carries exactly one independent denial before deletion',
    created.revision.delta.added.map(item => [item.code, item.location?.file, item.original?.binding]), [['not-visible', extraFile, 'InspectionPort']]);
  const deleted = await step(context, 'file deleted', () => deleteExtra(context.root));
  assertDeleted(context, 'file deleted', deleted);
  context.assertions.equal('deletion removes exactly the finding the file carried', deleted.revision.delta.removed, created.revision.delta.added.map(item => item.id));
});
add('configuration-broad', async context => {
  const pid = compilerPid(context.session);
  const value = await step(context, 'configuration edit', () => replace(context.root, 'tsconfig.json',
    '"@features/*": ["./subs/workspace/subs/*"]', '"@features/*": ["./subs/workspace/subs/*"],\n      "@session/*": ["./subs/workspace/subs/*"]'));
  assertBroad(context, 'configuration edit', value);
  assertNoFinding(context, 'configuration edit', value);
  context.assertions.equal('configuration invalidation retains the same warm compiler process', compilerPid(context.session), pid);
  context.assertions.equal('the revision inputId equals the batch projection identity', value.revision.inputId, value.report.inputId);
});

handlers.set('I5-07:dependency-broad', {
  ...reference,
  prepare: async ({ root }: IsolatedProject) => {
    const source = join(referenceRoot, 'node_modules'), target = join(root, 'node_modules');
    await mkdir(target);
    for (const entry of await readdir(source)) {
      if (entry === 'zod') await cp(join(source, entry), join(target, entry), { recursive: true, dereference: true });
      else await symlink(join(source, entry), join(target, entry));
    }
  },
  run: (context: ProjectContext) => withSession(context, async (current, cold) => {
    const original = await readFile(join(current.root, zodDeclaration), 'utf8');
    const edited = `${original}\nexport declare const ramifySessionDependencyWitness: number;\n`;
    current.assertions.equal('the declaration mutation owns its bytes', await realpath(join(current.root, zodDeclaration)), join(await realpath(current.root), zodDeclaration));
    current.assertions.equal('the cold session observed the zod declaration', cold.inputs.find(input => input.path === zodDeclaration)?.sha256, digest(original));
    const value = await step(current, 'dependency edit', async () => { await writeFile(join(current.root, zodDeclaration), edited); return [zodDeclaration]; });
    assertBroad(current, 'dependency edit', value);
    current.assertions.equal('the changed declaration has its new observed dependency identity',
      value.revision.inputs.filter(input => input.path === zodDeclaration), [{ path: zodDeclaration, role: 'dependency', sha256: digest(edited), bytes: Buffer.byteLength(edited) }]);
    current.assertions.ok('the changed set includes the declaration', value.revision.changed.includes(zodDeclaration));
    current.assertions.equal('the shared reference dependency bytes were not modified', await readFile(join(referenceRoot, zodDeclaration), 'utf8'), original);
    assertNoFinding(current, 'dependency edit', value);
  }),
});

const invalid = { path: workspaceDescription, before: residentTextMutations['remove-hop'].before,
  after: residentTextMutations['remove-hop'].before.replace(' from catalog', '') };
async function invalidate(context: Context, cold: SessionRevision, baseline: AnalysisReport): Promise<Step> {
  const value = await step(context, 'invalid W2', () => applyTextMutation(context.root, invalid));
  context.assertions.equal('the invalid description is published as current', [value.revision.outcome.execution, context.session.current?.sequence], ['invalid', cold.sequence + 1]);
  context.assertions.ok('the current diagnostic is the W2 parse failure', value.revision.diagnostics.some(item => item.category === 'description' && item.location?.file === workspaceDescription));
  context.assertions.equal('the invalid current projection does not serve stale accesses or decisions',
    [value.report.snapshot?.accesses ?? [], value.report.snapshot?.results ?? []], [[], []]);
  context.assertions.equal('the invalid revision observes the changed description identity',
    value.revision.inputs.find(input => input.path === workspaceDescription)?.sha256, digest(await readFile(join(context.root, workspaceDescription), 'utf8')));
  context.assertions.ok('invalid-current identity differs from the valid revision', value.revision.inputId !== cold.inputId);
  const history = await context.session.report(undefined, cold.sequence);
  context.assertions.equal('the last valid revision remains available unchanged by sequence', history && firstDifference(comparable(baseline), comparable(history)), null);
  return value;
}
add('invalid-description-current', async (context, cold, baseline) => { await invalidate(context, cold, baseline); });
add('invalid-recovery', async (context, cold, baseline) => {
  const invalidRevision = await invalidate(context, cold, baseline);
  const recovered = await step(context, 'valid W2 restored', () => applyTextMutation(context.root, invalid, true));
  assertNoFinding(context, 'valid W2 restored', recovered);
  context.assertions.equal('recovery adds no finding and removes every invalid diagnostic',
    [recovered.revision.delta.added, [...recovered.revision.delta.removed].sort(order)], [[], invalidRevision.revision.diagnostics.map(item => item.id).sort(order)]);
  context.assertions.equal('the recovered projection equals the baseline including inputId', firstDifference(comparable(baseline), comparable(recovered.report)), null);
});

add('audit-equal-sequence', async (context, cold, baseline) => {
  const { root, assertions } = context;
  const values: Step[] = [];
  values.push(await step(context, '1 body edit', () => replace(root, coreCatalog, '  const chain = selectRevisions(record.revisions, scope);',
    '  void 0;\n  const chain = selectRevisions(record.revisions, scope);')));
  assertions.equal('1 body edit checks one file and no accesses', values[0].revision.checked,
    { path: 'unchanged-surface', files: [coreCatalog], accesses: 0, modelRebuilt: false });
  assertNoFinding(context, '1 body edit', values[0]);
  values.push(await step(context, '2 declaration move', () => replace(root, coreCatalog, 'export function inspect(', '/**\n * The declaration moved.\n */\nexport function inspect(')));
  assertions.equal('2 declaration move stays on the unchanged-surface path', values[1].revision.checked,
    { path: 'unchanged-surface', files: [coreCatalog], accesses: 0, modelRebuilt: false });
  const declarations = (report: AnalysisReport): unknown => report.snapshot!.results.map(result => result.decisions.map(decision => decision.original?.declarations));
  assertions.ok('2 declaration move refreshes evidence in decisions', JSON.stringify(declarations(values[0].report)) !== JSON.stringify(declarations(values[1].report)));
  assertNoFinding(context, '2 declaration move', values[1]);
  values.push(await step(context, '3 import added', () => replace(root, reviewsRouter,
    "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\n",
    "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\nimport type { RevisionScope } from '../../contracts/src/interfaces/vocabulary.js';\n")));
  assertions.equal('3 import added decides just the new access', values[2].revision.checked,
    { path: 'source', files: [reviewsRouter], accesses: 1, modelRebuilt: false });
  assertNoFinding(context, '3 import added', values[2]);
  const exportAnchor = 'export type RevisionScope = z.infer<typeof revisionScopeSchema>;\n';
  const exportAdded = `${exportAnchor}export const sequenceProbeSchema = z.string();\n`;
  values.push(await step(context, '4 export added', () => replace(root, vocabulary, exportAnchor, exportAdded)));
  assertions.equal('4 the new vocabulary original exists', values[3].report.snapshot!.catalog!.originals.filter(original => original.id.binding === 'sequenceProbeSchema').length, 1);
  assertions.equal('4 a source revision rebuilds the model', [values[3].revision.checked.path, values[3].revision.checked.modelRebuilt], ['source', true]);
  assertNoFinding(context, '4 export added', values[3]);
  values.push(await step(context, '5 export removed', () => replace(root, vocabulary, exportAdded, exportAnchor)));
  assertions.equal('5 the added original leaves the catalog', values[4].report.snapshot!.catalog!.originals.filter(original => original.id.binding === 'sequenceProbeSchema'), []);
  assertNoFinding(context, '5 export removed', values[4]);
  values.push(await step(context, '6 denied import added', () => replace(root, validationSource, 'import type {\n  Finding,', `${deniedImport}import type {\n  Finding,`)));
  assertions.equal('6 the only added finding denies InspectionPort at validation',
    values[5].revision.delta.added.map(item => [item.code, item.location?.file, item.original?.binding]), [['not-visible', validationSource, 'InspectionPort']]);
  values.push(await step(context, '7 denied import removed', () => replace(root, validationSource, deniedImport, '')));
  assertions.equal('7 the exact denied import finding disappears', values[6].revision.delta.removed, values[5].revision.delta.added.map(item => item.id));
  assertNoFinding(context, '7 denied import removed', values[6]);
  values.push(await step(context, '8 remove-hop', () => applyTextMutation(root, residentTextMutations['remove-hop'])));
  assertDescription(context, '8 remove-hop', values[6].report, values[7]);
  assertHopDenied(context, '8 remove-hop', values[7]);
  values.push(await step(context, '9 restore-hop', () => applyTextMutation(root, residentTextMutations['remove-hop'], true)));
  assertDescription(context, '9 restore-hop', values[7].report, values[8]);
  assertions.equal('9 the exact W2 finding disappears', values[8].revision.delta.removed, values[7].revision.delta.added.map(item => item.id));
  assertNoFinding(context, '9 restore-hop', values[8]);
  values.push(await step(context, '10 README edit', () => editReadme(root)));
  assertMetadata(context, '10 README edit', values[9]);
  values.push(await step(context, '11 file created', () => createExtra(root)));
  assertCreated(context, '11 file created', values[10]);
  values.push(await step(context, '12 file deleted', () => deleteExtra(root)));
  assertDeleted(context, '12 file deleted', values[11], 'membership');
  assertions.equal('all twelve edits publish exactly one revision each', values.map(value => value.revision.sequence), Array.from({ length: 12 }, (_, index) => cold.sequence + index + 1));
  assertions.equal('the final findings equal the baseline findings', values[11].revision.diagnostics, baseline.diagnostics);
  recordObservation('plan5-twelve-step-sequence', { steps: values.map((value, index) => ({ step: index + 1, sequence: value.revision.sequence,
    checked: value.revision.checked, errors: value.revision.summary.errors, audit: 'equal', batch: 'equal' })) });
});

add('audit-detects-drift', async (context, cold, baseline) => {
  const { path, frozen } = await context.inspection.corruptAccess();
  context.assertions.ok('the retained access fact is frozen before corruption', frozen);
  const audited = await context.session.verify();
  context.assertions.equal('the audit detects retained fact drift', audited.status, 'mismatch');
  if (audited.status !== 'mismatch') throw new Error('The injected drift was not detected');
  context.assertions.equal('the differing field identifies exactly the corrupted access facts', audited.fields, [`files[${path}].accesses`]);
  context.assertions.equal('verify publishes one repaired revision and identifies its prior sequence',
    [audited.sequence, audited.revision.sequence, context.session.current?.sequence], [cold.sequence, cold.sequence + 1, cold.sequence + 1]);
  context.assertions.equal('the audit publication has no disk change or fabricated finding',
    [audited.revision.changed, audited.revision.delta.added, audited.revision.delta.removed], [[], [], []]);
  const repaired = await equalState(context, 'after audit repair');
  context.assertions.equal('the repaired report equals the uncorrupted baseline', firstDifference(comparable(baseline), comparable(repaired)), null);
  recordObservation('plan5-audit-repair', { cause: 'verify', priorSequence: audited.sequence, sequence: audited.revision.sequence, fields: audited.fields });
});

export const plan5SessionRevisionHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

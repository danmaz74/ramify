import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeProject } from '../../subs/analysis/src/analyze-project.js';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.js';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { RetainedSession, SessionInputs, SessionRevision } from '../../subs/analysis/src/interfaces/session.js';
import { originalKey } from '../../subs/analysis/subs/model/src/index.js';
import { firstDifference } from './equivalence-comparison.js';
import { createProjectFixture, projectFixtureFiles } from './fixtures/plan1/project.js';
import { providerApi, consumerProbe } from './fixtures/plan2/project.js';
import { coreDirectory, referenceRoot, vocabulary } from './fixtures/plan2/reference.js';
import type { IsolatedProject } from './mutation.js';
import { recordObservation } from './observations.js';
import { sessionInputs } from './session-expectations.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const coreCatalog = `${coreDirectory}/src/catalog.ts`;
const reviewsRouter = 'subs/workspace/subs/reviews/src/router.ts';
const validationSource = 'subs/workspace/subs/reviews/subs/validation/src/validate.ts';
const sessionLimits = { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 };
const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

function inputs(root: string): SessionInputs {
  return { ...sessionInputs(root), session: sessionLimits };
}

/** A fresh batch analysis over the disk as it is now: the independent oracle. */
async function batch(root: string): Promise<AnalysisReport> {
  const run = await analyzeProject(sessionInputs(root));
  if (run.status !== 'reported') throw new Error('Batch analysis was cancelled');
  return run.report;
}

interface Opened { readonly session: RetainedSession; readonly revision: SessionRevision }
async function open(root: string): Promise<Opened> {
  const opened = await openRetainedSession(inputs(root));
  if (opened.status !== 'opened') throw new Error(`The session did not open: ${JSON.stringify(opened)}`);
  return opened;
}

/** Replace one anchor that occurs exactly once; the edited path is returned. */
async function replace(root: string, path: string, before: string, after: string): Promise<string> {
  const text = await readFile(join(root, path), 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Expected exactly one anchor in ${path}: ${before}`);
  await writeFile(join(root, path), text.replace(before, () => after));
  return path;
}

/**
 * One step of a session sequence: apply the edit, update the session, run its
 * own audit and compare its report projection with a batch analysis of the
 * same disk state. Every step asserts equality; the caller asserts the step's
 * independent expectation on the returned revision.
 */
async function step(assertions: Assertions, session: RetainedSession, root: string, name: string,
  edit: () => Promise<readonly string[]>): Promise<{ revision: SessionRevision; report: AnalysisReport; batch: AnalysisReport }> {
  const paths = await edit();
  const update = await session.update(paths.map(path => ({ path, kind: 'changed' as const })));
  if (update.status !== 'revised') throw new Error(`${name}: the update was not revised: ${JSON.stringify(update).slice(0, 2000)}`);
  assertions.equal(`${name}: the update published a new revision`, update.identical, false);
  const audit = await session.verify();
  assertions.equal(`${name}: the session's own audit reports equal`, audit.status, 'equal');
  const report = await session.report();
  if (!report) throw new Error(`${name}: no report for the current revision`);
  const expected = await batch(root);
  assertions.equal(`${name}: the projection equals a batch analysis of the same state`,
    firstDifference({ ...expected, runId: 'compared' }, { ...report, runId: 'compared' }), null);
  return { revision: update.revision, report, batch: expected };
}

/** Files whose accesses read the named file's description: target or forwarding hop. */
function importersOf(report: AnalysisReport, target: string): string[] {
  const files = new Set<string>();
  for (const access of report.snapshot?.accesses ?? []) {
    const hops = [...(access.target.kind === 'application' ? [access.target.origin.file] : []),
      ...access.selections.flatMap(selection => selection.forwarding.map(origin => origin.file))];
    if (hops.includes(target)) files.add(access.importer.file);
  }
  return [...files].sort(order);
}
function importingAccesses(report: AnalysisReport, target: string): number {
  return (report.snapshot?.accesses ?? []).filter(access => access.target.kind === 'application' && access.target.origin.file === target).length;
}
function ownAccesses(report: AnalysisReport, file: string): number {
  return (report.snapshot?.accesses ?? []).filter(access => access.importer.file === file).length;
}
function wildcardPairs(report: AnalysisReport, provider: string): number {
  if (report.snapshot?.linked?.status !== 'valid') return -1;
  return report.snapshot.linked.selections.filter(selection => selection.selector === 'wildcard' && selection.provider.endsWith(provider))
    .reduce((count, selection) => count + selection.pairs.length, 0);
}

const referenceHandler = {
  kind: 'project' as const,
  fixture: { kind: 'copy' as const, sourceRoot: referenceRoot },
  prepare: async ({ root }: IsolatedProject) => { await symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')); },
  baseline: async ({ root, assertions }: ProjectContext) => {
    const text = await readFile(join(root, coreCatalog), 'utf8');
    assertions.ok('the reference declares inspect in the core catalog', text.includes('export function inspect('));
  },
  mutate: async () => {},
};

const handlers = new Map<string, InstanceHandler>();

handlers.set('I5-06:unchanged-surface-no-propagation', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session, revision: cold } = await open(root);
    try {
      assertions.equal('the cold revision is sequence 1 on the cold path', [cold.sequence, cold.checked.path], [1, 'cold']);
      const { revision } = await step(assertions, session, root, 'body edit', async () =>
        [await replace(root, coreCatalog, '  const chain = selectRevisions(record.revisions, scope);', '  void 0;\n  const chain = selectRevisions(record.revisions, scope);')]);
      assertions.equal('the revision takes the unchanged-surface path', revision.checked.path, 'unchanged-surface');
      assertions.equal('the checked set is the edited file alone', revision.checked.files, [coreCatalog]);
      assertions.equal('zero accesses are decided and the model is not rebuilt', [revision.checked.accesses, revision.checked.modelRebuilt], [0, false]);
      assertions.equal('the changed inputs name the edited file', revision.changed, [coreCatalog]);
      assertions.equal('no finding is added or removed', [revision.delta.added, revision.delta.removed], [[], []]);
      recordObservation('plan5-unchanged-surface', { timings: revision.timings });
    } finally { await session.dispose(); }
  },
});

handlers.set('I5-06:position-only-refresh', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session } = await open(root);
    try {
      const denied = await step(assertions, session, root, 'denied import of inspect', async () =>
        [await replace(root, validationSource, "} from '../../../../contracts/src/interfaces/vocabulary.js';\n",
          "} from '../../../../contracts/src/interfaces/vocabulary.js';\nimport { inspect } from '../../../../catalog/subs/core/src/catalog.js';\nvoid inspect;\n")]);
      const finding = denied.revision.delta.added;
      assertions.equal('the setup step adds one finding that cites the inspect original', [finding.length, finding[0]?.original?.binding], [1, 'inspect']);
      const { revision, report, batch: expected } = await step(assertions, session, root, 'comment block above inspect', async () =>
        [await replace(root, coreCatalog, 'export function inspect(', '/**\n * Moved.\n * Every declaration below this block moves.\n */\nexport function inspect(')]);
      assertions.equal('the revision takes the unchanged-surface path', revision.checked.path, 'unchanged-surface');
      assertions.equal('the checked set is the edited file with zero accesses decided', [revision.checked.files, revision.checked.accesses], [[coreCatalog], 0]);
      assertions.equal('positionOnly names the moved finding and nothing is added or removed',
        [revision.delta.positionOnly.length, revision.delta.added, revision.delta.removed], [1, [], []]);
      assertions.ok('the moved finding has a new identity that cites the moved original',
        revision.delta.positionOnly[0] !== finding[0]!.id && revision.diagnostics.some(item => item.id === revision.delta.positionOnly[0] && item.original?.binding === 'inspect'));
      const declarations = (item: AnalysisReport): unknown => item.snapshot?.results.map(result => result.decisions.map(decision => decision.original?.declarations));
      assertions.equal('every decision cites the declarations a fresh batch analysis cites', declarations(report), declarations(expected));
      assertions.ok('the inspect declarations moved', JSON.stringify(denied.report.snapshot?.catalog?.originals.find(original => original.id.binding === 'inspect')?.declarations)
        !== JSON.stringify(report.snapshot?.catalog?.originals.find(original => original.id.binding === 'inspect')?.declarations));
    } finally { await session.dispose(); }
  },
});

handlers.set('I5-06:import-added-self-only', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session, revision: cold } = await open(root);
    try {
      const { revision } = await step(assertions, session, root, 'RevisionScope import', async () =>
        [await replace(root, reviewsRouter, "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\n",
          "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\nimport type { RevisionScope } from '../../contracts/src/interfaces/vocabulary.js';\n")]);
      assertions.equal('the revision takes the source path', revision.checked.path, 'source');
      assertions.equal('only the edited file is re-interpreted', revision.checked.files, [reviewsRouter]);
      assertions.equal('exactly the new access is decided and the model is not rebuilt', [revision.checked.accesses, revision.checked.modelRebuilt], [1, false]);
      assertions.equal('the new access is allowed with no finding added', [revision.delta.added, revision.summary.errors, revision.summary.accesses - cold.summary.accesses], [[], 0, 1]);
      assertions.equal('one more allowed decision than the cold revision', revision.summary.allowed - cold.summary.allowed, 1);
    } finally { await session.dispose(); }
  },
});

async function exportAdded(root: string, assertions: Assertions, name: string, declaration: string): Promise<{ cold: SessionRevision; revision: SessionRevision; before: AnalysisReport; after: AnalysisReport }> {
  const { session, revision: cold } = await open(root);
  try {
    const before = await batch(root);
    const { revision, report } = await step(assertions, session, root, 'export added', async () =>
      [await replace(root, vocabulary, 'export type RevisionScope = z.infer<typeof revisionScopeSchema>;\n',
        `export type RevisionScope = z.infer<typeof revisionScopeSchema>;\n${declaration}\n`)]);
    const importers = importersOf(before, vocabulary);
    assertions.ok(`${name}: the vocabulary file has importers`, importers.length > 0);
    assertions.equal(`${name}: the checked set is the vocabulary file and its importing files only`, revision.checked.files, [...new Set([vocabulary, ...importers])].sort(order));
    assertions.equal(`${name}: the revision takes the source path`, revision.checked.path, 'source');
    assertions.equal(`${name}: no finding appears`, [revision.delta.added, revision.summary.errors], [[], 0]);
    return { cold, revision, before, after: report };
  } finally { await session.dispose(); }
}

handlers.set('I5-06:export-added-importers', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { revision, before, after } = await exportAdded(root, assertions, 'export-added', 'export const sessionProbeSchema = z.string();');
    assertions.equal('the catalog gains exactly one original', after.summary.originals - before.summary.originals, 1);
    assertions.ok('the new original is the added schema', after.snapshot?.catalog?.originals.some(original => original.id.binding === 'sessionProbeSchema' && original.id.file.endsWith('vocabulary.ts')));
    assertions.equal('the C1 wildcard expansion grows by one', wildcardPairs(after, 'vocabulary.ts') - wildcardPairs(before, 'vocabulary.ts'), 1);
    assertions.equal('the model is rebuilt for the new original', revision.checked.modelRebuilt, true);
  },
});

handlers.set('I5-06:wide-fanin-bounded', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { revision, before } = await exportAdded(root, assertions, 'wide-fanin', 'export const fanInProbeSchema = z.number();');
    const importers = new Set(importersOf(before, vocabulary));
    const importing = importingAccesses(before, vocabulary);
    assertions.equal('the vocabulary file is reached by the reviewed number of importing accesses', importing, 56);
    assertions.equal('no file that imports none of its exports is re-interpreted', revision.checked.files.filter(file => file !== vocabulary && !importers.has(file)), []);
    assertions.ok('the accesses decided are at most the importing accesses plus the file\'s own',
      revision.checked.accesses <= importing + ownAccesses(before, vocabulary));
    recordObservation('plan5-wide-fanin', { importers: importers.size, importingAccesses: importing, checked: revision.checked });
  },
});

handlers.set('I5-06:export-removed-missing', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session } = await open(root);
    try {
      const before = await batch(root);
      const { revision } = await step(assertions, session, root, 'export removed', async () =>
        [await replace(root, vocabulary, 'export const revisionScopeSchema: z.ZodDiscriminatedUnion<', 'const revisionScopeSchema: z.ZodDiscriminatedUnion<')]);
      const importingFiles = (before.snapshot?.accesses ?? []).filter(access => access.selections.some(selection => selection.exportedName === 'revisionScopeSchema'))
        .map(access => access.importer.file).sort(order);
      assertions.equal('three files import the removed name', importingFiles, ['subs/workspace/subs/catalog/src/mcp.ts', 'subs/workspace/subs/reviews/src/mcp.ts', reviewsRouter]);
      assertions.equal('every importing access reports missing-export at its own import statement and nothing else appears',
        revision.delta.added.map(item => [item.code, item.location?.file]).sort(), importingFiles.map(file => ['missing-export', file]).sort());
      assertions.equal('the project has exactly those findings', [revision.summary.errors, revision.delta.removed], [importingFiles.length, []]);
      assertions.equal('the checked set is the vocabulary file and its importers only', revision.checked.files, [...new Set([vocabulary, ...importersOf(before, vocabulary)])].sort(order));
    } finally { await session.dispose(); }
  },
});

const violationImport = "import type { InspectionPort } from '../../core/src/interfaces/port.js';\n";
handlers.set('I5-06:violation-appears', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session } = await open(root);
    try {
      const { revision } = await step(assertions, session, root, 'InspectionPort import', async () =>
        [await replace(root, validationSource, 'import type {\n  Finding,', `${violationImport}import type {\n  Finding,`)]);
      assertions.equal('exactly one finding is added and none removed', [revision.delta.added.length, revision.delta.removed], [1, []]);
      assertions.equal('the finding is not-visible at the import in the validation source',
        [revision.delta.added[0]?.code, revision.delta.added[0]?.location?.file, revision.delta.added[0]?.original?.binding], ['not-visible', validationSource, 'InspectionPort']);
      assertions.equal('the checked set is the edited file alone', [revision.checked.files, revision.checked.path], [[validationSource], 'source']);
    } finally { await session.dispose(); }
  },
});

handlers.set('I5-06:violation-removed', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session } = await open(root);
    try {
      const appeared = await step(assertions, session, root, 'InspectionPort import', async () =>
        [await replace(root, validationSource, 'import type {\n  Finding,', `${violationImport}import type {\n  Finding,`)]);
      const added = appeared.revision.delta.added[0]!;
      const { revision } = await step(assertions, session, root, 'InspectionPort import removed', async () =>
        [await replace(root, validationSource, violationImport, '')]);
      assertions.equal('delta.removed names exactly the finding that appeared', revision.delta.removed, [added.id]);
      assertions.equal('nothing is added and the finding count returns to zero', [revision.delta.added, revision.summary.errors, revision.outcome.check], [[], 0, 'passed']);
    } finally { await session.dispose(); }
  },
});

handlers.set('I5-06:type-to-runtime-merge', {
  kind: 'project',
  fixture: { kind: 'create', create: root => createProjectFixture(root) },
  baseline: async ({ root, assertions }: ProjectContext) => {
    assertions.equal('the F recipe declares Type as an interface', (await readFile(join(root, providerApi), 'utf8')).includes('export interface Type { readonly value: number }'), true);
  },
  mutate: async () => {},
  run: async ({ root, assertions }: ProjectContext) => {
    const { session } = await open(root);
    try {
      const before = await batch(root);
      const typeBefore = before.snapshot?.catalog?.originals.find(original => original.id.binding === 'Type');
      assertions.equal('Type is a type-only original before the edit', [typeBefore?.hasValue, typeBefore?.hasType], [false, true]);
      const { revision, report } = await step(assertions, session, root, 'class merge and unmarked import', async () => [
        await replace(root, providerApi, 'export interface Type { readonly value: number }', 'export class Type { readonly value = 1 }'),
        await replace(root, consumerProbe, projectFixtureFiles[consumerProbe]!, "import { Type } from '../../provider/src/interfaces/api.js';\nexport type Observed = Type;\n"),
      ]);
      const typeAfter = report.snapshot?.catalog?.originals.find(original => original.id.binding === 'Type');
      assertions.equal('the original gains a value while keeping its type', [typeAfter?.hasValue, typeAfter?.hasType], [true, true]);
      const selection = report.snapshot?.accesses.find(access => access.importer.file === consumerProbe)?.selections[0];
      assertions.equal('the unmarked import is interpreted as a resolved value selection', [selection?.exportedName, selection?.request, selection?.status], ['Type', 'value', 'resolved']);
      assertions.equal('the revision takes the source path with both files checked', [revision.checked.path, revision.checked.files], ['source', [consumerProbe, providerApi]]);
      assertions.equal('no finding appears', revision.summary.errors, 0);
    } finally { await session.dispose(); }
  },
});

handlers.set('I5-06:alias-identity', {
  ...referenceHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const { session } = await open(root);
    try {
      const before = await batch(root);
      const previous = before.snapshot?.catalog?.originals.find(original => original.id.binding === 'inspect' && original.id.file.endsWith('catalog.ts'));
      assertions.ok('the core catalog defines inspect before the rename', previous?.id.owner.endsWith('workspace/catalog/core'));
      const { revision, report } = await step(assertions, session, root, 'rename behind a forwarding alias', async () => {
        await replace(root, coreCatalog, 'export function inspect(', 'function inspectRecordImpl(');
        await writeFile(join(root, coreCatalog), `${await readFile(join(root, coreCatalog), 'utf8')}\nexport { inspectRecordImpl as inspect };\n`);
        return [coreCatalog];
      });
      const originals = report.snapshot?.catalog?.originals ?? [];
      const renamed = originals.find(original => original.id.binding === 'inspectRecordImpl');
      assertions.equal('the renamed defining binding has the new identity and preserves its owner',
        [renamed?.id.owner, renamed?.id.file, originals.some(original => original.id.binding === 'inspect' && original.id.file === previous?.id.file)],
        [previous?.id.owner, previous?.id.file, false]);
      const key = originalKey(renamed!.id);
      const aliased = report.snapshot?.linked?.status === 'valid'
        ? report.snapshot.linked.selections.filter(selection => selection.pairs.some(pair => pair.name === 'inspectRecord')).flatMap(selection => selection.pairs.filter(pair => pair.name === 'inspectRecord'))
        : [];
      assertions.equal('every forwarding alias including inspectRecord selects the new original', [aliased.length > 0, aliased.every(pair => originalKey(pair.original) === key)], [true, true]);
      const rootAccess = report.snapshot?.accesses.find(access => access.importer.file === 'src/assembly.ts' && access.selections.some(selection => selection.exportedName === 'inspect'));
      assertions.equal('the root import of inspect resolves to the renamed original through the alias',
        rootAccess?.selections.find(selection => selection.exportedName === 'inspect')?.original ? originalKey(rootAccess.selections.find(selection => selection.exportedName === 'inspect')!.original!) : null, key);
      assertions.equal('no finding appears', [revision.summary.errors, revision.delta.added], [0, []]);
    } finally { await session.dispose(); }
  },
});

export const plan5SessionHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

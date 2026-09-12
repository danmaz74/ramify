import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import { sequenceFixture } from './equivalence-sequences.js';
import { coreDirectory, prepareReferenceEdits, vocabulary, workspaceDescription } from './fixtures/plan2/reference.js';
import type { ProjectFixture } from './mutation.js';
import { applyTextMutation, residentTextMutations } from './resident-mutations.js';
import type { TextMutation } from './resident-mutations.js';
import type { Assertions } from './runner.js';

export type LiveFixture = 'R' | 'S100';
export interface LiveStep {
  readonly name: string;
  readonly paths: readonly string[];
  apply(root: string): Promise<void>;
}

export const liveSequencePaths = {
  coreCatalog: `${coreDirectory}/src/catalog.ts`,
  catalogRouter: 'subs/workspace/subs/catalog/src/router.ts',
  reviewsRouter: 'subs/workspace/subs/reviews/src/router.ts',
  validationSource: 'subs/workspace/subs/reviews/subs/validation/src/validate.ts',
  inspectionPort: 'subs/workspace/subs/reviews/subs/core/src/interfaces/port.ts',
  workspaceReadme: 'subs/workspace/README.md',
  extraFile: 'subs/workspace/subs/catalog/src/extra.ts',
  vocabulary,
  workspaceDescription,
} as const;
const paths = liveSequencePaths;
const purpose = 'Workspace composes the browser shell and exposes the shared contracts to its descendants.';
const movedComment = '/**\n * The declaration moved.\n */\n';
const deniedImport = "import type { InspectionPort } from '../../core/src/interfaces/port.js';\n";
const extraSource = "import { recordIdSchema } from '../../contracts/src/interfaces/vocabulary.js';\nexport const extra = recordIdSchema;\n";

/** The frozen generator has a flat tree. Before the live baseline only, move
 * seven complete generated owners into the reference positions and add seven
 * small source witnesses and the exposures they require. All original source
 * bytes remain, all other generated owners stay untouched, and there are still
 * 100 owners. This overlay is part of the fixture identity, not a generator
 * change or the byte-identical frozen measurement workload. */
export const liveSyntheticOverlay = [
  { from: 'subs/m001', to: 'subs/workspace', name: 'workspace' },
  { from: 'subs/m002', to: 'subs/workspace/subs/catalog', name: 'catalog' },
  { from: 'subs/m003', to: coreDirectory, name: 'core' },
  { from: 'subs/m004', to: 'subs/workspace/subs/contracts', name: 'contracts' },
  { from: 'subs/m005', to: 'subs/workspace/subs/reviews', name: 'reviews' },
  { from: 'subs/m006', to: 'subs/workspace/subs/reviews/subs/validation', name: 'validation' },
  { from: 'subs/m007', to: 'subs/workspace/subs/reviews/subs/core', name: 'core' },
] as const;

export function liveSequenceFixture(fixture: LiveFixture): ProjectFixture { return sequenceFixture(fixture); }

const syntheticSources: Readonly<Record<string, string>> = {
  [paths.coreCatalog]: 'export function inspect(value: number): number {\n  const selected = value;\n  return selected;\n}\n',
  [paths.catalogRouter]: "import { inspect } from '../subs/core/src/catalog.js';\nexport function createCatalogRouter(value: number): number { return inspect(value); }\n",
  [paths.vocabulary]: 'export interface RevisionScope { readonly revision: number }\nexport const recordIdSchema = { kind: \'record-id\' as const };\n',
  [paths.reviewsRouter]: "import type { InspectionPort } from '../subs/core/src/interfaces/port.js';\nexport function createReviewsRouter(port: InspectionPort): InspectionPort { return port; }\n",
  [paths.validationSource]: "import type { RevisionScope } from '../../../../contracts/src/interfaces/vocabulary.js';\nexport function validateRevisionChain(scope: RevisionScope): number { return scope.revision; }\n",
  [paths.inspectionPort]: 'export interface InspectionPort { readonly inspect: (value: number) => number }\n',
  'src/assembly.ts': "import { createCatalogRouter } from '../subs/workspace/subs/catalog/src/router.js';\nvoid createCatalogRouter;\n",
};
const syntheticExposures: Readonly<Record<string, string>> = {
  'subs/workspace': 'expose-sub * from contracts to descendants\nexpose-sub createCatalogRouter from catalog to parent\n',
  'subs/workspace/subs/catalog': 'expose-src createCatalogRouter from "router.ts" to parent\n',
  [coreDirectory]: 'expose-src inspect from "catalog.ts" to parent\n',
  'subs/workspace/subs/contracts': 'expose-src * from "interfaces/vocabulary.ts" to parent\n',
  'subs/workspace/subs/reviews/subs/core': 'expose-src InspectionPort from "interfaces/port.ts" to parent, descendants\n',
};

async function requireAbsent(path: string): Promise<void> {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`Expected absent live fixture path: ${path}`);
}

export async function prepareLiveSequence(root: string, fixture: LiveFixture): Promise<void> {
  if (fixture === 'R') return prepareReferenceEdits(root);
  // Check the complete relocation input before moving any directory.
  for (const entry of liveSyntheticOverlay) {
    const originalName = entry.from.slice('subs/'.length);
    const actual = await readFile(join(root, entry.from, 'module.ramify'), 'utf8');
    if (actual !== `ramify 1\nmodule "${originalName}" tagged []\n`) throw new Error(`S100 owner header drifted: ${entry.from}`);
    await requireAbsent(join(root, entry.to));
  }
  for (const entry of liveSyntheticOverlay) {
    await mkdir(dirname(join(root, entry.to)), { recursive: true });
    await rename(join(root, entry.from), join(root, entry.to));
    await applyTextMutation(root, { path: `${entry.to}/module.ramify`,
      before: `module "${entry.from.slice('subs/'.length)}" tagged []\n`,
      after: `module ${entry.name}\n${syntheticExposures[entry.to] ?? ''}` });
  }
  for (const [path, source] of Object.entries(syntheticSources)) await writeFile(join(root, path), source, { flag: 'wx' });
}

function textStep(name: string, mutation: TextMutation, reverse = false): LiveStep {
  return { name, paths: [mutation.path], apply: async root => { await applyTextMutation(root, mutation, reverse); } };
}

export function liveSteps(fixture: LiveFixture): readonly LiveStep[] {
  const reference = fixture === 'R';
  const body = reference ? '  const chain = selectRevisions(record.revisions, scope);' : '  const selected = value;';
  const importAnchor = reference ? "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\n"
    : "import type { InspectionPort } from '../subs/core/src/interfaces/port.js';\n";
  const exportAnchor = reference ? 'export type RevisionScope = z.infer<typeof revisionScopeSchema>;\n'
    : 'export interface RevisionScope { readonly revision: number }\n';
  const exported = { path: vocabulary, before: exportAnchor,
    after: exportAnchor + (reference ? 'export const sequenceProbeSchema = z.string();\n' : 'export const sequenceProbeSchema = { kind: \'sequence-probe\' as const };\n') };
  const validationAnchor = reference ? 'import type {\n  Finding,'
    : "import type { RevisionScope } from '../../../../contracts/src/interfaces/vocabulary.js';";
  const hop = reference ? residentTextMutations['remove-hop'] : { path: workspaceDescription,
    before: 'expose-sub createCatalogRouter from catalog to parent', after: '// live sequence: catalog parent exposure removed' };
  return [
    textStep('body-edit', { path: paths.coreCatalog, before: body, after: `  void 0;\n${body}` }),
    textStep('declaration-move', { path: paths.coreCatalog, before: 'export function inspect(', after: `${movedComment}export function inspect(` }),
    textStep('import-added', { path: paths.reviewsRouter, before: importAnchor,
      after: `${importAnchor}import type { RevisionScope } from '../../contracts/src/interfaces/vocabulary.js';\n` }),
    textStep('export-added', exported),
    textStep('export-removed', exported, true),
    textStep('denied-import-added', { path: paths.validationSource, before: validationAnchor, after: deniedImport + validationAnchor }),
    textStep('denied-import-removed', { path: paths.validationSource, before: deniedImport, after: '' }),
    textStep('remove-hop', hop),
    textStep('restore-hop', hop, true),
    { name: 'readme-edit', paths: [paths.workspaceReadme], apply: async root => {
      const before = (await readFile(join(root, paths.workspaceReadme), 'utf8')).split(/\r?\n\r?\n/)[1];
      if (!before || (reference ? !before.startsWith('Workspace is the browser shell.')
        : before !== 'Supplies deterministic workload bytes for the hundred-owner batch measurement.\n')) throw new Error('Live README paragraph anchor drifted');
      await applyTextMutation(root, { path: paths.workspaceReadme, before, after: purpose });
    } },
    { name: 'file-created', paths: [paths.extraFile], apply: async root => { await writeFile(join(root, paths.extraFile), extraSource, { flag: 'wx' }); } },
    { name: 'file-deleted', paths: [paths.extraFile], apply: async root => {
      if (await readFile(join(root, paths.extraFile), 'utf8') !== extraSource) throw new Error('The live created-file deletion anchor drifted');
      await unlink(join(root, paths.extraFile));
    } },
  ];
}

const decisions = (report: AnalysisReport) => report.snapshot!.results.flatMap(result => result.decisions);
const originals = (report: AnalysisReport, binding: string, file?: string) => report.snapshot!.catalog!.originals
  .filter(original => original.id.binding === binding && (!file || original.origin.file === file));

/** Authored semantic expectations; equality with a second engine is checked by
 * the live process harness separately. Step zero qualifies the positive controls.
 * Each assertion is named by fixture and step so one handler can retain all of it. */
export function assertLiveStep(fixture: LiveFixture, stepIndex: number, previous: AnalysisReport, report: AnalysisReport, a: Assertions): void {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 12) throw new Error(`Invalid live step: ${stepIndex}`);
  const name = `${fixture} step ${stepIndex}`;
  const expected = stepIndex === 6 ? [['not-visible', paths.validationSource, 'InspectionPort']]
    : stepIndex === 8 ? [['not-visible', 'src/assembly.ts', 'createCatalogRouter']] : [];
  a.equal(`${name}: completed execution and complete coverage`, report.outcome,
    { execution: 'completed', check: expected.length ? 'failed' : 'passed', coverage: 'complete' });
  a.equal(`${name}: independent owner count`, report.summary.owners, fixture === 'R' ? 15 : 100);
  a.ok(`${name}: real permission results exist`, report.snapshot?.results.length && report.summary.allowed > 0);
  a.equal(`${name}: exact independently expected findings`, report.diagnostics.map(item => [item.code, item.location?.file, item.original?.binding]), expected);
  a.equal(`${name}: exact independently expected denied decisions`, decisions(report).filter(item => item.status === 'denied')
    .map(item => [item.reason, item.question.importer.file, item.original?.id.binding]), expected);
  a.equal(`${name}: summary counts the expected denials`, [report.summary.errors, report.summary.denied], [expected.length, expected.length]);
  const selected = (value: AnalysisReport, file: string, binding: string) => decisions(value)
    .filter(item => item.question.importer.file === file && item.original?.id.binding === binding);
  if (stepIndex === 0) {
    a.equal(`${name}: root router positive control`, selected(report, 'src/assembly.ts', 'createCatalogRouter').map(item => item.status), ['allowed']);
    a.equal(`${name}: validation does not already import the private port`, selected(report, paths.validationSource, 'InspectionPort'), []);
    a.ok(`${name}: the moved inspection declaration has consumers`, decisions(report).some(item => item.original?.origin.file === paths.coreCatalog && item.original.id.binding === 'inspect'));
    a.equal(`${name}: sequence file starts absent`, report.snapshot!.inventory.files.some(file => file.path === paths.extraFile), false);
    if (fixture === 'S100') a.equal(`${name}: seven generated owners occupy the reference tree positions`,
      liveSyntheticOverlay.map(entry => report.snapshot!.inventory.modules.find(module => module.directory === entry.to)?.name), liveSyntheticOverlay.map(entry => entry.name));
  }
  if (stepIndex === 1) a.equal(`${name}: body edit preserves original and access counts`,
    [report.summary.originals, report.summary.accesses], [previous.summary.originals, previous.summary.accesses]);
  if (stepIndex === 2) {
    const before = originals(previous, 'inspect', paths.coreCatalog), after = originals(report, 'inspect', paths.coreCatalog);
    a.equal(`${name}: one inspection original before and after movement`, [before.length, after.length], [1, 1]);
    a.equal(`${name}: moved declaration locations advance by the inserted comment`, after[0].declarations,
      before[0].declarations.map(location => ({ ...location, start: location.start + movedComment.length,
        end: location.end + movedComment.length, line: location.line + 3 })));
    const affected = decisions(report).filter(item => item.original?.origin.file === paths.coreCatalog && item.original.id.binding === 'inspect');
    a.ok(`${name}: moved original has decision evidence to refresh`, affected.length > 0);
    a.ok(`${name}: every selected inspection declaration carries the moved positions`, affected.every(item => JSON.stringify(item.original!.declarations) === JSON.stringify(after[0].declarations)));
  }
  if (stepIndex === 3) {
    a.equal(`${name}: the added type import was absent`, selected(previous, paths.reviewsRouter, 'RevisionScope'), []);
    a.equal(`${name}: the new vocabulary import is allowed`, selected(report, paths.reviewsRouter, 'RevisionScope').map(item => [item.question.selection?.request, item.status]), [['type-only', 'allowed']]);
    a.equal(`${name}: exactly one access was added`, report.summary.accesses, previous.summary.accesses + 1);
  }
  if (stepIndex === 4 || stepIndex === 5) {
    a.equal(`${name}: sequence export enters or leaves the catalog`, originals(report, 'sequenceProbeSchema', vocabulary).length, stepIndex === 4 ? 1 : 0);
    a.equal(`${name}: original count changes by exactly one`, report.summary.originals, previous.summary.originals + (stepIndex === 4 ? 1 : -1));
    a.equal(`${name}: wildcard exposure includes exactly the current sequence export`, report.snapshot!.model!.exposures
      .some(exposure => exposure.effective && exposure.original.file === 'interfaces/vocabulary.ts' && exposure.original.binding === 'sequenceProbeSchema'), stepIndex === 4);
  }
  if (stepIndex === 7 || stepIndex === 9) {
    a.equal(`${name}: preceding revision had exactly the expected removable finding`, previous.diagnostics.map(item => [item.code, item.location?.file, item.original?.binding]),
      stepIndex === 7 ? [['not-visible', paths.validationSource, 'InspectionPort']] : [['not-visible', 'src/assembly.ts', 'createCatalogRouter']]);
    if (stepIndex === 7) a.equal(`${name}: removed private-port access is absent`, selected(report, paths.validationSource, 'InspectionPort'), []);
    else a.equal(`${name}: restored parent exposure permits the root router`, selected(report, 'src/assembly.ts', 'createCatalogRouter').map(item => item.status), ['allowed']);
  }
  if (stepIndex === 10) {
    a.equal(`${name}: current purpose uses the edited paragraph`, report.snapshot!.inventory.modules.find(module => module.directory === 'subs/workspace')!.purpose,
      { state: 'present', readme: paths.workspaceReadme, paragraph: purpose });
    a.equal(`${name}: metadata edit preserves source facts and permissions`,
      [report.snapshot!.catalog, report.snapshot!.accesses, report.snapshot!.results], [previous.snapshot!.catalog, previous.snapshot!.accesses, previous.snapshot!.results]);
  }
  if (stepIndex === 11) {
    a.equal(`${name}: created source has one allowed vocabulary import`, report.snapshot!.accesses.filter(access => access.importer.file === paths.extraFile)
      .flatMap(access => report.snapshot!.results.find(result => result.accessId === access.id)!.decisions.map(item => [item.original?.id.binding, item.status])), [['recordIdSchema', 'allowed']]);
    a.equal(`${name}: created file and original enter the inventory`, [report.summary.sourceFiles, originals(report, 'extra', paths.extraFile).length], [previous.summary.sourceFiles + 1, 1]);
    a.ok(`${name}: created source appears in the catalog`, report.snapshot!.catalog!.files.some(file => file.file === paths.extraFile));
  }
  if (stepIndex === 12) {
    a.equal(`${name}: deleted file leaves inventory, catalog, originals, accesses and coverage`,
      [report.snapshot!.inventory.files.some(file => file.path === paths.extraFile), report.snapshot!.catalog!.files.some(file => file.file === paths.extraFile),
        report.snapshot!.catalog!.originals.some(original => original.origin.file === paths.extraFile), report.snapshot!.accesses.some(access => access.importer.file === paths.extraFile),
        report.coverage.some(note => note.location.file === paths.extraFile)], [false, false, false, false, false]);
    a.equal(`${name}: deletion removes its one source and import`, [report.summary.sourceFiles, report.summary.accesses], [previous.summary.sourceFiles - 1, previous.summary.accesses - 1]);
  }
}

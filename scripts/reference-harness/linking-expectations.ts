import { originalKey } from '../../subs/analysis/subs/model/src/index.js';
import type { OriginalId } from '../../subs/analysis/subs/model/src/index.js';
import { validateProject } from '../../subs/analysis/src/validation-entry.js';
import type { ValidationRun } from '../../subs/analysis/src/validation-entry.js';
import { validationInputs } from '../validation-inputs.js';
import type { Assertions } from './runner.js';
import { recordObservation } from './observations.js';

export type ValidProject = Extract<ValidationRun, { status: 'valid' }>;
// Defined by the root in scripts/validation-inputs.ts, which validate-final-contracts.ts
// imports instead of this tree.
export { validationInputs };
export async function validated(root: string, assertions: Assertions): Promise<ValidProject> {
  const result = await validateProject(validationInputs(root));
  recordObservation('validation', result.status === 'valid'
    ? { status: result.status, scope: result.input.inventory.scope, warnings: result.input.inventory.warnings,
      diagnostics: [], coverage: result.catalog.coverage, statements: result.linked.selections.length }
    : result);
  assertions.equal(`project valid${'diagnostics' in result ? ': ' + JSON.stringify(result.diagnostics) : ''}`, result.status, 'valid');
  if (result.status !== 'valid') throw new Error(JSON.stringify(result));
  assertions.ok('input sealed and identified', result.input.inputId.startsWith('input/1:'));
  return result;
}
export const vocabulary = ['recordIdSchema', 'RecordId', 'revisionSchema', 'Revision', 'revisionChainSchema',
  'RevisionChain', 'revisionScopeSchema', 'RevisionScope', 'findingSchema', 'Finding', 'inspectionReportSchema',
  'InspectionReport', 'reviewStatusSchema', 'ReviewStatus', 'observationSchema', 'Observation', 'ObservationCallback'];
export const ownerId = (owner: string): string => owner ? `collection-review/${owner}` : 'collection-review';
export const sourcePath = (owner: string, file: string): string => (owner ? owner.split('/').map(part => `subs/${part}/`).join('') : '') + `src/${file}`;
const code = (owner: string, file: string, binding: string): OriginalId => ({ kind: 'code', owner: ownerId(owner), file, binding });
type Binding = readonly [name: string, id: OriginalId, tags: readonly string[]];
const bindings = (owner: string, file: string, names: readonly string[], tags: readonly string[] = []): Binding[] =>
  names.map(name => [name, code(owner, file, name), [...tags].sort()]);
const vocab = bindings('workspace/contracts', 'interfaces/vocabulary.ts', vocabulary, ['browser']);
const rootTypes = bindings('', 'interfaces/protocol.ts', ['InvocationContext', 'ProtocolFacilities', 'McpToolContribution', 'ToolInvocation',
  'ToolInputSchema', 'ToolResult'], ['dispatch']);
const setup = bindings('', 'tests/setup.ts', ['createTestSystem', 'TestSystem', 'McpSession'], ['testing', 'dispatch']);
const catalog = 'workspace/catalog';
const core = `${catalog}/core`;
const reviews = 'workspace/reviews';
const runtime = `${reviews}/core`;
const k1 = bindings(core, 'catalog.ts', ['getRecord', 'inspect', 'CatalogSummary']);
const fixture = bindings(core, 'tests/fixture.ts', ['makeCatalogFixture', 'CatalogFixtureRecord'], ['testing']);
const router = bindings(catalog, 'router.ts', ['createCatalogRouter', 'CatalogProcedures'], ['dispatch']);
const tools = bindings(catalog, 'mcp.ts', ['createCatalogTools'], ['dispatch']);
const inspect: Binding[] = [['inspectRecord', code(core, 'catalog.ts', 'inspect'), []]];
const card = bindings(`${catalog}/ui`, 'catalog-card.tsx', ['CatalogCard', 'CatalogCardProps'], ['ui', 'browser']);
const validation = bindings(`${reviews}/validation`, 'validate.ts', ['validateRevisionChain']);
const task = bindings(`${runtime}/tasks`, 'inspection-task.ts', ['runInspectionTask', 'InspectionTaskInput', 'InspectionTaskResult']);
const summary = bindings(`${runtime}/tasks`, 'result.ts', ['summarizeTaskResult', 'TaskSummary']);
const port = bindings(runtime, 'interfaces/port.ts', ['InspectionPort']);
const reviewRouter = bindings(reviews, 'router.ts', ['createReviewsRouter', 'ReviewsProcedures'], ['dispatch']);
const reviewTools = bindings(reviews, 'mcp.ts', ['createReviewsTools'], ['dispatch']);
const panel = bindings(`${reviews}/ui`, 'review-panel.tsx', ['ReviewPanel', 'ReviewPanelProps'], ['ui', 'dispatch', 'browser']);
const badge = bindings('workspace/shared-ui', 'status-badge.tsx', ['StatusBadge', 'StatusBadgeProps'], ['ui', 'browser']);

// All 34 statements, independently transcribed from the reviewed contract map.
// Statement indexes are their actual authored order; expectations are never read
// from descriptions or calculated with the permission model under test.
export const referenceContracts: readonly (readonly [id: string, owner: string, index: number, provider: string,
  form: 'expose-src' | 'expose-test' | 'expose-sub', selector: 'named' | 'wildcard', destinations: readonly ('parent' | 'descendants')[], pairs: readonly Binding[]])[] = [
  ['C1', 'workspace/contracts', 0, 'interfaces/vocabulary.ts', 'expose-src', 'wildcard', ['parent'], vocab],
  ['W1', 'workspace', 0, 'contracts', 'expose-sub', 'wildcard', ['parent', 'descendants'], vocab],
  ['R1', '', 0, 'interfaces/protocol.ts', 'expose-src', 'named', ['descendants'], rootTypes],
  ['R2', '', 1, 'setup.ts', 'expose-test', 'named', ['descendants'], setup],
  ['R3', '', 2, 'interfaces/protocol.ts', 'expose-src', 'named', ['descendants'], [...bindings('', 'assembly.ts', ['AppRouter', 'assembleRouter'], ['dispatch']),
    ...bindings('', 'interfaces/protocol.ts', ['ProtocolRouter'], ['dispatch'])]],
  ['R4', '', 3, 'workspace', 'expose-sub', 'named', ['descendants'], [...bindings(catalog, 'router.ts', ['CatalogProcedures'], ['dispatch']),
    ...bindings(reviews, 'router.ts', ['ReviewsProcedures'], ['dispatch']), ...bindings('workspace/contracts', 'interfaces/vocabulary.ts', ['RecordId',
      'recordIdSchema', 'revisionScopeSchema', 'ReviewStatus', 'reviewStatusSchema', 'Finding', 'findingSchema', 'Observation',
      'observationSchema'], ['browser'])]],
  ['K1', core, 0, 'catalog.ts', 'expose-src', 'named', ['parent'], k1],
  ['K2', core, 1, 'fixture.ts', 'expose-test', 'named', ['parent'], fixture],
  ['A1', catalog, 0, 'router.ts', 'expose-src', 'named', ['parent'], router],
  ['A2', catalog, 1, 'mcp.ts', 'expose-src', 'named', ['parent'], tools],
  ['A3', catalog, 2, 'core', 'expose-sub', 'named', ['parent'], inspect],
  ['A4', catalog, 3, 'core', 'expose-sub', 'named', ['parent'], fixture],
  ['A5', catalog, 4, 'core', 'expose-sub', 'named', ['parent', 'descendants'], bindings(core, 'catalog.ts', ['CatalogSummary'])],
  ['A6', catalog, 5, 'ui', 'expose-sub', 'named', ['parent'], card],
  ['KU1', `${catalog}/ui`, 0, 'catalog-card.tsx', 'expose-src', 'named', ['parent'], card],
  ['VL1', `${reviews}/validation`, 0, 'validate.ts', 'expose-src', 'named', ['parent'], validation],
  ['TK1', `${runtime}/tasks`, 0, 'inspection-task.ts', 'expose-src', 'named', ['parent'], task],
  ['TK2', `${runtime}/tasks`, 1, 'result.ts', 'expose-src', 'named', ['parent'], summary],
  ['CT1', `${runtime}/controller`, 0, 'controller.ts', 'expose-src', 'named', ['parent'], bindings(`${runtime}/controller`, 'controller.ts', ['tick'])],
  ['RC1', runtime, 0, 'interfaces/port.ts', 'expose-src', 'named', ['parent', 'descendants'], port],
  ['RC2', runtime, 1, 'runtime.ts', 'expose-src', 'named', ['parent'], bindings(runtime, 'runtime.ts', ['createReviewRuntime', 'ReviewRuntime', 'ReviewOutcome'])],
  ['RC3', runtime, 2, 'tasks', 'expose-sub', 'named', ['descendants'], [...task, ...summary]],
  ['RV1', reviews, 0, 'router.ts', 'expose-src', 'named', ['parent'], reviewRouter],
  ['RV2', reviews, 1, 'mcp.ts', 'expose-src', 'named', ['parent'], reviewTools],
  ['RV3', reviews, 2, 'core', 'expose-sub', 'named', ['parent'], port],
  ['RV4', reviews, 3, 'validation', 'expose-sub', 'named', ['descendants'], validation],
  ['RV5', reviews, 4, 'ui', 'expose-sub', 'named', ['parent'], panel],
  ['RU1', `${reviews}/ui`, 0, 'review-panel.tsx', 'expose-src', 'named', ['parent'], panel],
  ['PU1', `${reviews}/ui/pure-ui`, 0, 'review-result.tsx', 'expose-src', 'named', ['parent'], bindings(`${reviews}/ui/pure-ui`, 'review-result.tsx', ['ReviewResult', 'ReviewResultProps'], ['ui', 'browser'])],
  ['SU1', 'workspace/shared-ui', 0, 'status-badge.tsx', 'expose-src', 'named', ['parent'], badge],
  ['W2', 'workspace', 1, 'catalog', 'expose-sub', 'named', ['parent'], [...router, ...tools, ...inspect]],
  ['W3', 'workspace', 3, 'catalog', 'expose-sub', 'named', ['descendants'], fixture],
  ['W4', 'workspace', 2, 'reviews', 'expose-sub', 'named', ['parent'], [...reviewRouter, ...reviewTools, ...port]],
  ['W5', 'workspace', 4, 'shared-ui', 'expose-sub', 'wildcard', ['descendants'], badge],
];
export function assertReference(result: { input: Pick<ValidProject['input'], 'inventory'>;
  catalog: ValidProject['catalog']; linked: ValidProject['linked'] }, assertions: Assertions, permutation?: string): void {
  assertions.equal('fifteen reference owners', result.input.inventory.modules.length, 15);
  // Project-boundary iteration 8C: 59 src/ files plus the root's two configuration files, now auxiliary source.
  assertions.equal('all reference source files catalogued', result.catalog.files.length, 61);
  assertions.equal('all 34 reference statements expanded', result.linked.selections.length, 34);
  for (const [id, owner, index, provider, form, selector, destinations, pairs] of referenceContracts) {
    const module = ownerId(owner);
    const selections = result.linked.selections.filter(selection => selection.module === module);
    const actualIndex = permutation === 'reversed' ? selections.length - index - 1
      : permutation === 'rotated' ? (index + selections.length - 1) % selections.length : index;
    const selection = selections[actualIndex]!;
    assertions.equal(`${id}: source and destinations`, [selection.form, selection.selector, selection.provider, [...selection.destinations].sort()],
      [form, selector, form === 'expose-sub' ? `${module}/${provider}` : sourcePath(owner, (form === 'expose-test' ? 'tests/' : '') + provider), [...destinations].sort()]);
    assertions.equal(`${id}: exact name original tags and effectiveness`, selection.pairs.map(pair => [pair.name, pair.original,
      result.linked.modelInput.originals.find(original => originalKey(original.id) === originalKey(pair.original))!.tags, pair.effective]),
    [...pairs].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([name, original, tags]) => [name, original, tags, true]));
    assertions.ok(`${id}: located declaration`, selection.statement.file.endsWith('module.ramify') && selection.statement.line > 2 && selection.statement.column === 1);
  }
  for (const name of ['createFacilities', 'loadReview', 'assembleSystem', 'resolvePredecessors', 'collectObservations', 'formatFinding']) {
    const original = result.linked.modelInput.originals.find(original => original.id.binding === name)!;
    assertions.ok(`${name}: private original retained`, original);
    assertions.ok(`${name}: no accidental exposure`, !result.linked.modelInput.exposures.some(exposure => originalKey(exposure.original) === originalKey(original.id)));
  }
}

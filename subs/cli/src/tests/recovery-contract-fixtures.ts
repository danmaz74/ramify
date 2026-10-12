import type { AnalysisDiagnostic, AnalysisReport, StageExecution } from '../../../analysis/src/interfaces/analysis.js';
import type { PathOwnership, ProjectOwnership, ProjectWarning } from '../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextId, GenerationId, RevisionId } from '../../../daemon/src/context-types.js';
import type { CheckDocument, OwnershipDocument } from '../index.js';

/** Iteration 1 examples, replaced by production contract imports when delivered. */
export interface ProposedRecoveryEvidence {
  readonly schemaVersion: 'ramify.recovery/1';
  readonly lastCompleted: { readonly context: ContextId; readonly generation: GenerationId;
    readonly revision: RevisionId; readonly inputId: string } | null;
  readonly changes: { readonly paths: readonly string[]; readonly coverage: 'observed' | 'unavailable'; readonly reason: string | null };
}
export type FrozenCheckDocument = Omit<CheckDocument, 'schemaVersion' | 'recovery' | 'stages'> & { readonly schemaVersion: 'ramify.check/3' };
export type ProposedCheckDocument = CheckDocument;
export interface ProposedCliFailureDocument {
  readonly schemaVersion: 'ramify.cli/2'; readonly status: 'unavailable'; readonly exitCode: 1 | 2;
  readonly diagnostics: readonly (AnalysisDiagnostic | { readonly category: 'invocation' | 'execution'; readonly code: string; readonly message: string })[];
  readonly stages?: readonly StageExecution[]; readonly recovery?: ProposedRecoveryEvidence;
}

export const locatedDiagnostics: readonly AnalysisDiagnostic[] = ['first', 'second'].map((name, index) => ({
  id: `producer:missing-${name}`, category: 'missing-export', code: 'missing-export', message: `Export ${name} is absent`,
  location: { file: 'subs/provider/module.ramify', start: 40 + index * 7, end: 45 + index * 7, line: 3, column: 12 + index * 7 },
  related: [{ file: 'subs/provider/src/api.ts', start: index, end: index + 1, line: 1, column: index + 1 }],
  importer: null, original: null, accessId: null,
}));
export const producedStages: readonly StageExecution[] = [
  { stage: 'acquisition', status: 'completed', blockedBy: [], diagnosticIds: [] },
  { stage: 'link', status: 'invalid', blockedBy: [], diagnosticIds: locatedDiagnostics.map(item => item.id) },
];
export const ownershipTable: ProjectOwnership = {
  modules: [{ id: 'recovery', parent: null, directory: '.' },
    { id: 'recovery/consumer', parent: 'recovery', directory: 'subs/consumer' },
    { id: 'recovery/provider', parent: 'recovery', directory: 'subs/provider' }],
  exclusions: [{ kind: 'output', directory: 'dist', owner: null }, { kind: 'scratch', directory: 'src/tmp', owner: 'recovery' },
    { kind: 'scratch', directory: 'subs/consumer/src/tmp', owner: 'recovery/consumer' },
    { kind: 'scratch', directory: 'subs/provider/src/tmp', owner: 'recovery/provider' }],
};
export const answeredOwnership: Extract<OwnershipDocument, { readonly status: 'answered' }> = {
  schemaVersion: 'ramify.ownership/1', ramifyVersion: '0.4.3', status: 'answered', exitCode: 0,
  root: '/project', inputId: `input/1:${'a'.repeat(64)}`, scope: { configuration: '/project/tsconfig.json', ownership: ownershipTable },
  paths: [{ path: 'subs/provider/src/api.ts', ownership: { status: 'owned', module: 'recovery/provider', directory: 'subs/provider', exclusion: null } },
    { path: '../elsewhere', ownership: { status: 'outside-project', module: null } },
    { path: 'dist/result.js', ownership: { status: 'excluded', module: null, exclusion: ownershipTable.exclusions[0]! } }], warnings: [],
};
export const ownershipFailures: readonly OwnershipDocument[] = [
  { schemaVersion: 'ramify.ownership/1', ramifyVersion: '0.4.3', status: 'invalid', exitCode: 1, root: '/project',
    diagnostics: [{ ...locatedDiagnostics[0]!, id: 'producer:invalid-description', category: 'description', code: 'invalid-description',
      message: 'Malformed description', related: [] }],
    stages: [{ stage: 'acquisition', status: 'invalid', blockedBy: [], diagnosticIds: ['producer:invalid-description'] }] },
  { schemaVersion: 'ramify.ownership/1', ramifyVersion: '0.4.3', status: 'incomplete', exitCode: 2, root: '/project', diagnostics: [] },
  { schemaVersion: 'ramify.ownership/1', ramifyVersion: '0.4.3', status: 'unavailable', exitCode: 2, root: null, diagnostics: [] },
];
export const noBaseline: ProposedRecoveryEvidence = { schemaVersion: 'ramify.recovery/1', lastCompleted: null,
  changes: { paths: [], coverage: 'unavailable', reason: 'no-completed-baseline' } };
export const overflow: ProposedRecoveryEvidence = { schemaVersion: 'ramify.recovery/1', lastCompleted: {
  context: `ctx/1:${'b'.repeat(64)}`, generation: 'gen/1:11111111-1111-4111-8111-111111111111',
  revision: 'rev/1:11111111-1111-4111-8111-111111111111:1', inputId: `input/1:${'c'.repeat(64)}` },
  changes: { paths: ['src/other.ts', 'subs/provider/src/api.ts'], coverage: 'observed', reason: 'watcher-loss; path-overflow' } };
export const invocationFailure: ProposedCliFailureDocument = { schemaVersion: 'ramify.cli/2', status: 'unavailable', exitCode: 2,
  diagnostics: [{ category: 'invocation', code: 'invalid-invocation', message: 'Path "src/../api.ts" has an interior ".." segment' }] };
export const contextualFailure: ProposedCliFailureDocument = { schemaVersion: 'ramify.cli/2', status: 'unavailable', exitCode: 2,
  diagnostics: [{ category: 'execution', code: 'analysis-failed', message: 'Compiler stopped' }, ...locatedDiagnostics],
  stages: producedStages, recovery: overflow };

/** Each rejected example has one independently named violation for later decoder tests. */
export const rejectedOwnershipExamples = [
  { variant: 'answered-wrong-exit', value: { ...answeredOwnership, exitCode: 1 } },
  { variant: 'invalid-wrong-exit', value: { ...ownershipFailures[0], exitCode: 2 } },
  { variant: 'incomplete-wrong-exit', value: { ...ownershipFailures[1], exitCode: 1 } },
  { variant: 'unavailable-wrong-exit', value: { ...ownershipFailures[2], exitCode: 0 } },
  { variant: 'failure-plus-scope', value: { ...ownershipFailures[0], scope: answeredOwnership.scope } },
  { variant: 'failure-plus-inputId', value: { ...ownershipFailures[0], inputId: answeredOwnership.inputId } },
  { variant: 'failure-plus-paths', value: { ...ownershipFailures[0], paths: answeredOwnership.paths } },
  { variant: 'ownership-plus-recovery', value: { ...answeredOwnership, recovery: noBaseline } },
  { variant: 'failure-plus-recovery', value: { ...ownershipFailures[0], recovery: noBaseline } },
  { variant: 'ownership-plus-selection', value: { ...answeredOwnership, selection: 'given' } },
] as const;

// Negative compiler witnesses for status/exit coupling and forbidden members.
// @ts-expect-error Invalid ownership cannot exit 0.
const wrongExit: OwnershipDocument = { ...ownershipFailures[0], status: 'invalid', exitCode: 0 };
// @ts-expect-error Ownership never has recovery.
const wrongRecovery: OwnershipDocument = { ...answeredOwnership, recovery: noBaseline };
void wrongExit; void wrongRecovery;

/** Compiler-only strict member witnesses; never called or exported at runtime. */
function negativeMembers(report: AnalysisReport, check: FrozenCheckDocument): void {
  // @ts-expect-error Analysis/3 has no recovery field.
  const analysisRecovery: AnalysisReport = { ...report, recovery: noBaseline };
  // @ts-expect-error Frozen Check/3 has no recovery field.
  const oldCheckRecovery: FrozenCheckDocument = { ...check, recovery: noBaseline };
  // @ts-expect-error Frozen Check/3 has no additional stages field.
  const oldCheckStages: FrozenCheckDocument = { ...check, stages: producedStages };
  // @ts-expect-error Acquisition failures certify no scope.
  const failedScope: OwnershipDocument = { schemaVersion: 'ramify.ownership/1', ramifyVersion: '0.4.3', status: 'invalid', exitCode: 1, root: null, diagnostics: [], scope: answeredOwnership.scope };
  void analysisRecovery; void oldCheckRecovery; void oldCheckStages; void failedScope;
}
void negativeMembers;

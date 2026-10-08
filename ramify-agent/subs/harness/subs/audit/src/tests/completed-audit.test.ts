import { describe, expect, it } from 'vitest';

import type { AuditResult } from 'ramify-audit';

import {
  configuredProjectResult, configuredResultRefusal, nestedInvocationRefusal, sameAuditPolicy, type CommittedAuditConfiguration,
} from '../check-execution.js';

/*
 * A gate asks the committed audit about the commit it made and accepts the
 * provider's answer when it applies: a fresh record of that commit, or the
 * provider's reuse of applicable evidence of an earlier commit whose later
 * changes were all ignored. A result of another definition, project, check
 * universe or commit, a partial answer to a full request, or a selected
 * check without its record is refused and never becomes the gate's verdict.
 */

type Completed = Extract<AuditResult, { status: 'completed' }>;

const made = 'a'.repeat(40);
const earlier = 'b'.repeat(40);

const configuration: CommittedAuditConfiguration = {
  sourceCommit: earlier, path: 'ramify-audit.json', blob: 'c'.repeat(40), projectRoot: '.',
  checks: [{ id: 'tests' }, { id: 'scenarios' }], ignorePaths: ['docs/**'], undetectedConfigFilesForcingFullAudit: [],
  workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: true, packageDirectories: [''], setupCommands: [] },
};

interface Shape {
  readonly sourceCommit?: string;
  readonly reused?: Completed['reused'];
  readonly schema?: number;
  readonly producer?: string;
  readonly projectRoot?: string;
  readonly blob?: string;
  readonly universe?: readonly string[];
  readonly executedMode?: 'full' | 'ramify-partial';
  readonly selected?: readonly string[];
  readonly omitted?: readonly string[];
  readonly records?: readonly string[];
}

function completed(shape: Shape = {}): Completed {
  const selected = shape.selected ?? ['tests', 'scenarios'];
  const omitted = shape.omitted ?? [];
  const partial = shape.executedMode === 'ramify-partial';
  return {
    status: 'completed',
    requestId: 'run:ga-0001',
    runId: 'provider-run',
    summary: {
      evidenceSchemaVersion: shape.schema ?? 4,
      producer: { name: shape.producer ?? 'ramify-audit', version: '0.7.2' },
      sourceCommit: shape.sourceCommit ?? made,
      overall: 'pass',
      mode: { requestedMode: partial ? 'ramify-partial' : 'full', resolution: 'defaulted', executedMode: shape.executedMode ?? 'full' },
      coverage: {
        projectRoot: shape.projectRoot ?? '.',
        claim: { configuration: { path: 'ramify-audit.json', blob: shape.blob ?? configuration.blob } },
        universe: { checkIds: [...(shape.universe ?? ['tests', 'scenarios'])] },
        selection: { kind: partial ? 'scoped' : 'full', selectedCheckIds: [...selected], omittedCheckIds: [...omitted] },
      },
      checks: Object.fromEntries((shape.records ?? selected).map(id => [id, { status: 'pass' }])),
    } as unknown as Completed['summary'],
    refs: { reportCommit: 'd'.repeat(40), runRef: 'refs/audited/runs/r', treeRef: 'refs/audited/trees/t' },
    retrievalCommands: [],
    composition: { verdict: 'pass', scoped: partial, chainDepth: partial ? 1 : 0, reportCommit: 'd'.repeat(40) },
    ...(shape.reused === undefined ? {} : { reused: shape.reused }),
  } as Completed;
}

const refusal = (result: Completed, mode: 'project-default' | 'full' = 'project-default') => configuredResultRefusal(result, configuration, mode, made);

describe('a completed audit as a gate\'s answer', () => {
  it('accepts a fresh record of the requested commit', () => {
    expect(refusal(completed())).toBeNull();
    expect(refusal(completed(), 'full')).toBeNull();
  });

  it('accepts the provider\'s reuse of applicable evidence of an earlier commit, with both source identities and no new receipt', () => {
    const reused = completed({ sourceCommit: earlier, records: ['tests', 'scenarios'],
      reused: { sourceCommit: made, auditedCommit: earlier, ignoredChangedPaths: ['docs/guide.md'], requestedMode: 'full', resolution: 'defaulted' } });
    expect(refusal(reused)).toBeNull();
    expect(refusal(reused, 'full')).toBeNull();
  });

  it('refuses reuse that does not answer the requested commit or misnames its audited commit', () => {
    expect(refusal(completed({ sourceCommit: earlier,
      reused: { sourceCommit: 'e'.repeat(40), auditedCommit: earlier, ignoredChangedPaths: [], requestedMode: 'full', resolution: 'defaulted' } })))
      .toBe(`the result does not answer source ${made}`);
    expect(refusal(completed({ sourceCommit: made,
      reused: { sourceCommit: made, auditedCommit: earlier, ignoredChangedPaths: [], requestedMode: 'full', resolution: 'defaulted' } })))
      .toBe(`the result does not answer source ${made}`);
  });

  it('refuses a fresh record of another commit', () => {
    expect(refusal(completed({ sourceCommit: earlier }))).toBe(`the result does not answer source ${made}`);
  });

  it('refuses old-schema or foreign evidence, so it never stands as a passing answer or baseline', () => {
    expect(refusal(completed({ schema: 3 }))).toBe('the result is not schema-4 ramify-audit evidence');
    expect(refusal(completed({ producer: 'other-auditor' }))).toBe('the result is not schema-4 ramify-audit evidence');
  });

  it('refuses evidence of another project, definition or check universe', () => {
    expect(refusal(completed({ projectRoot: 'nested' }))).toBe('the result audited project nested, not .');
    expect(refusal(completed({ blob: 'f'.repeat(40) }))).toContain('was not produced under the captured definition ramify-audit.json');
    expect(refusal(completed({ universe: ['tests'], selected: ['tests'] }))).toBe('the result ran another check universe');
  });

  it('refuses a partial chain as the answer to a full request, and accepts it for the project default', () => {
    const partial = completed({ executedMode: 'ramify-partial', selected: ['tests'], omitted: ['scenarios'] });
    expect(refusal(partial)).toBeNull();
    expect(refusal(partial, 'full')).toBe('a full request was answered by evidence that is not an executed full audit');
  });

  it('requires a record only for each check the provider selected, so no required check passes through an absent result', () => {
    // A zero-selection link omits every narrowed check and records none of them.
    expect(refusal(completed({ executedMode: 'ramify-partial', selected: [], omitted: ['tests', 'scenarios'], records: [] }))).toBeNull();
    expect(refusal(completed({ executedMode: 'ramify-partial', selected: ['scenarios'], omitted: ['tests'], records: [] })))
      .toBe('the result has no record of selected check scenarios');
    expect(refusal(completed({ selected: ['tests'], omitted: [] }))).toBe('the result\'s selection does not account for every configured check');
  });
});

/*
 * A nested request is answered by the invocation: every project's own
 * record, the discovery outcome and the invocation verdict. A result
 * without them, or with a nested project's record that does not answer the
 * request, is refused rather than read as the root's pass (PB3-E08).
 */
describe('a nested invocation as a gate\'s answer', () => {
  type Outcome = NonNullable<AuditResult['projects']>[number];
  const project = (projectRoot: string, result: Completed, verdict: Outcome['verdict'] = 'pass'): Outcome =>
    ({ projectRoot, verdict, execution: 'ran', failures: verdict === 'fail' ? ['check failed'] : [], result });
  const nestedRecord = (shape: Shape = {}) => completed({ projectRoot: 'engine', ...shape });
  const invocation = (projects: readonly Outcome[], extra: Partial<AuditResult> = {}): AuditResult => ({
    ...completed(), projects: [...projects], discovery: { status: 'complete', skipped: [], unavailable: [] }, invocationVerdict: 'pass', ...extra,
  } as AuditResult);
  const accounted = (result: AuditResult, mode: 'project-default' | 'full' = 'full') =>
    nestedInvocationRefusal(result, (result.projects ?? []).map(outcome => configuredProjectResult(outcome, '.', mode, made)));

  it('accepts every project\'s executed full record with the root first', () => {
    expect(accounted(invocation([project('.', completed()), project('engine', nestedRecord())]))).toBeNull();
  });

  it('refuses a nested request answered without its projects, discovery or invocation verdict', () => {
    const message = 'a nested request was answered without its project results, discovery and invocation verdict';
    expect(accounted(completed())).toBe(message);
    const { discovery: _discovery, ...withoutDiscovery } = invocation([project('.', completed())]) as AuditResult & { discovery: unknown };
    expect(accounted(withoutDiscovery as AuditResult)).toBe(message);
    const { invocationVerdict: _verdict, ...withoutVerdict } = invocation([project('.', completed())]) as AuditResult & { invocationVerdict: unknown };
    expect(accounted(withoutVerdict as AuditResult)).toBe(message);
  });

  it('refuses an invocation that does not name the root first or names a project twice', () => {
    expect(accounted(invocation([project('engine', nestedRecord()), project('.', completed())])))
      .toBe('a nested request was answered without the root project . first');
    expect(accounted(invocation([project('.', completed()), project('engine', nestedRecord()), project('engine', nestedRecord())])))
      .toBe('a nested request was answered with a project twice');
  });

  it('refuses a nested project\'s partial pass as the answer to a full request', () => {
    const partial = nestedRecord({ executedMode: 'ramify-partial', selected: ['tests'], omitted: ['scenarios'] });
    expect(accounted(invocation([project('.', completed()), project('engine', partial)])))
      .toBe('nested project engine: a full request was answered by evidence that is not an executed full audit');
    expect(accounted(invocation([project('.', completed()), project('engine', partial)]), 'project-default')).toBeNull();
  });

  it('refuses a nested record of another project, commit or producer', () => {
    expect(accounted(invocation([project('.', completed()), project('engine', completed({ projectRoot: 'other' }))])))
      .toBe('nested project engine: the result audited project other, not engine');
    expect(accounted(invocation([project('.', completed()), project('engine', nestedRecord({ sourceCommit: earlier }))])))
      .toBe(`nested project engine: the result does not answer source ${made}`);
    expect(accounted(invocation([project('.', completed()), project('engine', nestedRecord({ schema: 3 }))])))
      .toBe('nested project engine: the result is not schema-4 ramify-audit evidence');
  });

  it('keeps a root pass beside a composed nested failure, so the invocation verdict, not the root\'s, decides', () => {
    const result = invocation([project('.', completed()), project('engine', nestedRecord(), 'fail')], { invocationVerdict: 'fail' });
    expect(accounted(result)).toBeNull();
    const projects = result.projects!.map(outcome => configuredProjectResult(outcome, '.', 'full', made));
    expect(projects.map(entry => [entry.projectRoot, entry.status, entry.verdict, entry.failures])).toEqual([
      ['.', 'completed', 'pass', []], ['engine', 'completed', 'fail', ['check failed']],
    ]);
    expect(projects[1]!.counts).toEqual({ checks: { total: 2, passed: 2, failed: 0, skipped: 0 }, tests: null, scenarios: null });
  });
});

describe('the captured audit policy', () => {
  it('is the same at a later commit when only the commit differs, whatever the key order', () => {
    const later = { ...configuration, sourceCommit: made };
    const reordered = Object.fromEntries(Object.entries(later).reverse()) as unknown as CommittedAuditConfiguration;
    expect(sameAuditPolicy(later, configuration)).toBe(true);
    expect(sameAuditPolicy(reordered, configuration)).toBe(true);
  });

  it('differs when the definition blob, ignore list, checks or preparation differs', () => {
    expect(sameAuditPolicy({ ...configuration, blob: 'f'.repeat(40) }, configuration)).toBe(false);
    expect(sameAuditPolicy({ ...configuration, ignorePaths: ['docs/**', 'notes/**'] }, configuration)).toBe(false);
    expect(sameAuditPolicy({ ...configuration, checks: [{ id: 'tests' }] }, configuration)).toBe(false);
    expect(sameAuditPolicy({ ...configuration, workspace: { ...configuration.workspace, packageDirectories: ['', 'tools'] } }, configuration)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { scenarioRecordSchema, scenarioSourceHash } from '../../subs/scenarios/src/records.js';
import { entryAssignmentsSchema, gateAttemptSchema, gateAuditOutcomeSchema } from '../run/records.js';
import { iterationAssignmentSchema, iterationResultSchema } from '../work/iterations.js';
import { executionCapabilityDetailSchema, executionNodeSchema, executionScenarioDetailSchema } from '../interfaces/protocol/execution-map.js';
import { executionCapabilityDetailOf, executionCoreOf, executionScenarioDetailOf } from '../projections/execution-map.js';
import { scenarioListOf } from '../projections/scenarios.js';
import { runView } from '../projections/inputs.js';
import { at, constructedRun, hash, item, registered, reviews, type Line } from './helpers/constructed.js';

const description = `The full capability description.\n${'Retain this sentence. '.repeat(300)}`;
const source = ['Scenario: A complete block', '  Given the state is recorded', '  When the work runs', '  Then the whole block remains available'];
const scenario = scenarioRecordSchema.parse({
  schema: 'ramify-agent.scenario/1', id: 'sc-001', kind: 'entry', entry: 'full-description', owner: reviews,
  origin: { kind: 'architect', refs: [{ anchor: 'Acceptance' }] }, partOf: null, subScenarios: [],
  name: 'A complete block', source, hash: scenarioSourceHash(source), file: 'subs/reviews/src/tests/features/full.feature',
});
const entries = entryAssignmentsSchema.parse({ schema: 'ramify-agent.entry-assignments/1', view: { status: 'placeholder' },
  entries: [{ capability: 'full-description', description, owner: reviews, requirementRefs: [], acceptanceRefs: [], citations: [] }],
});

function gate(id: string, status: 'passed' | 'failed', dryRun: boolean, checkpoint: 'iteration' | 'readiness' | 'final' = 'iteration', scenarioId = 'sc-001') {
  return gateAttemptSchema.parse({
    schema: 'ramify-agent.gate-attempt/3', id, checkpoint,
    subject: checkpoint === 'iteration' ? { workItem: 'wi-001', iteration: 'wi-001.i01' } : {},
    proposedBy: null, repairRound: 0, infrastructureAttempt: 0, head: 'before', commit: null,
    audited: checkpoint === 'readiness' ? null : 'audited-commit',
    evidence: checkpoint === 'readiness' ? null : { runRef: 'refs/audited/run', reportCommit: 'report', treeRef: 'refs/audited/tree' },
    guardedChanges: [], rules: [], commands: checkpoint === 'readiness' ? [] : [{
      kind: 'scenarios', command: { argv: ['cucumber'], cwd: '/project', env: [], envAdditions: {}, timeoutMs: 1000 },
      startedAt: '2026-09-24T00:00:00.000Z', elapsedMs: 1, exitCode: status === 'passed' ? 0 : 1,
      outcome: status, runnerError: null, output: { path: 'gate.log', bytes: 0, truncated: false, tail: '' },
      scenarios: { mode: 'full', selection: { kind: 'identity', scenarios: [scenarioId] }, dryRun, excluded: 0,
        setup: null, teardown: null, runs: [{ module: reviews, exit: status === 'passed' ? 0 : 1, profile: 'profile', messages: 'messages' }],
        scenarios: [{ id: scenarioId, run: reviews, status, file: scenario.file, line: 1, binding: [],
          ...(status === 'failed' ? { failure: { step: source[3], message: 'failed' } } : {}), undefined: [] }],
        untracked: { passed: 0, skipped: 0, failed: 0 }, failures: status === 'passed' ? [] : ['failed'] },
    }], verdict: status, cause: status === 'failed' ? 'in-scope' : null, next: status === 'failed' ? 'repair' : 'accept',
  });
}

function recordedRun(extra: Line[] = []) {
  return constructedRun([
    { type: 'analysis-accepted', data: {}, records: [
      { path: 'analysis/entries.json', body: entries },
      { path: at('registry', 'full-description'), body: registered('full-description') },
      { path: 'scenarios/sc-001.json', body: scenario },
      { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'full-description' }) },
    ] },
    { type: 'scenario-declared', data: { scenario: 'sc-001', by: 'inv-001', state: 'declared' } },
    { type: 'scenario-implemented', data: { scenario: 'sc-001', gate: 'ga-before' } },
    ...extra,
  ]);
}

function assignment(id: string, workItem: string, revision: number) {
  return iterationAssignmentSchema.parse({
    schema: 'ramify-agent.iteration-assignment/1', id, workItem,
    outline: { id: workItem, revision, hash }, stage: 0, kind: 'ordinary', goal: `Do ${id}`, approach: 'Implement it.',
    scope: { revision, base: { module: reviews, includedChildren: [] },
      extra: [{ path: `subs/reviews/src/${id}.ts`, purpose: 'contract' }], read: [], bootstrap: [], rationale: 'Recorded scope.',
      resolved: { roots: [], files: [], view: { status: 'placeholder' } } },
    requirementRefs: [], externalCapabilities: [], completionEvidence: 'Check it.', evidenceObligations: [],
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [], subtrees: [], extraSuites: [] } },
    guarded: [], authorizations: [],
  });
}

describe('execution core from committed run records', () => {
  it('targets ordered gate history for a scenario beyond the capped list', () => {
    const many = Array.from({ length: 501 }, (_, index) => {
      const id = `sc-${String(index + 1).padStart(3, '0')}`;
      return { path: `scenarios/${id}.json`, body: scenarioRecordSchema.parse({ ...scenario, id }) };
    });
    const run = constructedRun([
      { type: 'analysis-accepted', data: {}, records: many },
      { type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-last/attempt.json', body: gate('ga-last', 'failed', false, 'iteration', 'sc-501') }] },
      { type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-repaired/attempt.json', body: gate('ga-repaired', 'passed', false, 'iteration', 'sc-501') }] },
    ]);
    const view = runView(run);
    expect(scenarioListOf(view).scenarios).toHaveLength(500);
    expect(scenarioListOf(view).scenarios.some(row => row.id === 'sc-501')).toBe(false);
    const detail = executionScenarioDetailSchema.parse(executionScenarioDetailOf(view, 'sc-501')).detail;
    expect(detail.state).toBe('available');
    if (detail.state === 'available') expect(detail.gates.map(row => [row.gate, row.status])).toEqual([
      ['ga-last', 'failed'], ['ga-repaired', 'passed'],
    ]);
  });
  it('reads old gates without an audit fact and a failed published audit independently of verdict', () => {
    const old = gate('ga-old', 'failed', false);
    const failedAudit = gate('ga-audit-failed', 'failed', false);
    const run = recordedRun([
      { type: 'gate-attempted', data: { gate: 'ga-old', checkpoint: 'iteration', verdict: 'failed', next: 'repair' },
        records: [{ path: 'gates/ga-old/attempt.json', body: old }] },
      { type: 'gate-attempted', data: { gate: 'ga-audit-failed', checkpoint: 'iteration', verdict: 'failed', next: 'repair' },
        records: [
          { path: 'gates/ga-audit-failed/attempt.json', body: failedAudit },
          { path: 'gates/ga-audit-failed/audit-outcome.json', body: gateAuditOutcomeSchema.parse({
            schema: 'ramify-agent.gate-audit-outcome/1', gate: 'ga-audit-failed', overall: 'fail', audited: 'audited-commit',
          }) },
        ] },
    ]);
    const index = executionCoreOf(runView(run));
    expect(index.nodes.find(node => node.key === 'gate:ga-old')).toMatchObject({ verdict: 'failed', audit: 'unavailable' });
    expect(index.nodes.find(node => node.key === 'gate:ga-audit-failed')).toMatchObject({ verdict: 'failed', audit: 'failed', evidencePresent: true });
  });
  it('keeps full descriptions, latest real scenario status, every gate and every session', () => {
    const run = recordedRun([
      { type: 'session-opened', data: { session: 'ses-initial', role: 'initial-architect', work: {}, executor: 'scripted', model: null } },
      { type: 'session-finished', data: { session: 'ses-initial', reason: 'replaced' } },
      { type: 'session-opened', data: { session: 'ses-local', role: 'local-architect', work: { workItem: 'wi-001' }, executor: 'scripted', model: null,
        replaces: { session: 'ses-initial', reason: 'reconstructed' } } },
      { type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-dry/attempt.json', body: gate('ga-dry', 'passed', true) }] },
      { type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-real/attempt.json', body: gate('ga-real', 'passed', false) }] },
      { type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-later/attempt.json', body: gate('ga-later', 'failed', false) }] },
      { type: 'readiness-passed', data: {}, records: [{ path: 'gates/ga-ready/attempt.json', body: gate('ga-ready', 'passed', false, 'readiness') }] },
    ]);
    const view = runView(run);
    const index = executionCoreOf(view);
    index.nodes.forEach(node => expect(executionNodeSchema.safeParse(node).success).toBe(true));
    expect(index.runVersion).toBe(run.entries.length);
    expect(index.nodes.filter(node => node.kind === 'capability').map(node => node.key)).toEqual(['capability:full-description']);
    expect(index.nodes.filter(node => node.kind === 'session').map(node => [node.key, node.state])).toEqual([
      ['session:ses-initial', 'finished'], ['session:ses-local', 'live'],
    ]);
    expect(index.nodes.filter(node => node.kind === 'gate').map(node => node.key)).toEqual([
      'gate:ga-dry', 'gate:ga-real', 'gate:ga-later', 'gate:ga-ready',
    ]);
    expect(index.nodes.find(node => node.key === 'scenario:sc-001')).toMatchObject({ state: 'implemented', latestRealResult: 'failed' });
    expect(index.nodes.find(node => node.key === 'capability:full-description')).toMatchObject({ scenarios: { failed: 1, passed: 0 } });
    expect(index.nodes.find(node => node.key === 'gate:ga-later')).toMatchObject({ verdict: 'failed', audit: 'unavailable', evidencePresent: true,
      cause: 'in-scope', subject: { workItem: 'wi-001', iteration: 'wi-001.i01' } });
    expect(index.nodes.find(node => node.key === 'gate:ga-ready')).toMatchObject({ audit: 'not-applicable' });
    expect(index.gaps).toContain('Audit result for gate ga-later is unavailable: the gate retains publication refs but no overall outcome.');
    expect(index.links.some(link => link.kind === 'tracks-scenario' && link.to.key === 'scenario:sc-001')).toBe(true);
    expect(executionCapabilityDetailSchema.parse(executionCapabilityDetailOf(view, 'full-description')).detail).toMatchObject({
      state: 'available', description,
    });
    expect(executionScenarioDetailSchema.parse(executionScenarioDetailOf(view, 'sc-001')).detail).toMatchObject({
      state: 'available', source,
    });
    expect(executionCapabilityDetailOf(view, 'missing').detail.state).toBe('unavailable');
    expect(executionScenarioDetailOf(view, 'sc-999').detail.state).toBe('unavailable');
    expect(executionCoreOf(runView(run)).nodes).toEqual(index.nodes); // durable replay, no mutable cache
  });

  it('does not let a dry-run pass color a scenario green', () => {
    const view = runView(recordedRun([{ type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-dry/attempt.json', body: gate('ga-dry', 'passed', true) }] }]));
    expect(executionCoreOf(view).nodes.find(node => node.key === 'scenario:sc-001')).toMatchObject({ latestRealResult: 'no-real-run' });
  });

  it('enumerates beyond the existing bounded work-item list', () => {
    const workItems = Array.from({ length: 205 }, (_, index) => {
      const id = `wi-${String(index + 1).padStart(3, '0')}`;
      return { path: `work-items/${id}/item.json`, body: item(id, { entry: 'full-description' }) };
    });
    const view = runView(constructedRun([{ type: 'analysis-accepted', data: {}, records: [
      { path: 'analysis/entries.json', body: entries },
      { path: at('registry', 'full-description'), body: registered('full-description') }, ...workItems,
    ] }]));
    const index = executionCoreOf(view);
    expect(index.nodes.filter(node => node.kind === 'work-item')).toHaveLength(205);
    expect(index.nodes.filter(node => node.kind === 'work-item').at(-1)?.key).toBe('work-item:wi-205');
  });

  it('keeps two accepted roots, a lower provider, ordered assignments, final and active gates', () => {
    const secondEntries = entryAssignmentsSchema.parse({ ...entries, entries: [
      ...entries.entries,
      { capability: 'second-root', description: 'The second full description.', owner: reviews,
        requirementRefs: [], acceptanceRefs: [], citations: [] },
    ] });
    const first = assignment('wi-001.i01', 'wi-001', 1);
    const second = assignment('wi-001.i02', 'wi-001', 2);
    const result = iterationResultSchema.parse({ schema: 'ramify-agent.iteration-result/1', iteration: first.id,
      outcome: 'accepted', invocations: [], gate: 'ga-first', commit: 'accepted-commit', findings: [], changedAssumptions: [], artifacts: [] });
    const run = constructedRun([
      { type: 'analysis-accepted', data: {}, records: [
        { path: 'analysis/entries.json', body: secondEntries },
        { path: at('registry', 'full-description'), body: registered('full-description') },
        { path: at('registry', 'second-root'), body: registered('second-root') },
        { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'full-description' }) },
        { path: 'work-items/wi-002/item.json', body: item('wi-002', { entry: 'second-root' }) },
      ] },
      { type: 'contract-registered', data: {}, records: [{ path: at('registry', 'shared-provider'),
        body: registered('shared-provider', { origin: 'global-decision', behavior: 'Full provider behavior.',
          owner: `${reviews}/theme`, proposed: { parent: reviews, directory: 'subs/reviews/subs/theme', purpose: 'Own the shared theme.', tags: [] } }) }] },
      { type: 'iteration-assigned', data: {}, records: [{ path: 'work-items/wi-001/iterations/01/assignment.json', body: first }] },
      { type: 'iteration-closed', data: {}, records: [{ path: 'work-items/wi-001/iterations/01/result.json', body: result }] },
      { type: 'iteration-assigned', data: {}, records: [{ path: 'work-items/wi-001/iterations/02/assignment.json', body: second }] },
      { type: 'gate-attempted', data: {}, records: [{ path: 'gates/ga-final/attempt.json', body: gate('ga-final', 'passed', false, 'final') }] },
      { type: 'gate-committing', data: { gate: 'ga-running', checkpoint: 'iteration' } },
    ]);
    const view = runView(run);
    const index = executionCoreOf(view);
    expect(index.nodes.filter(node => node.kind === 'capability').map(node => [node.key, node.level])).toEqual([
      ['capability:full-description', 'entry'], ['capability:second-root', 'entry'], ['capability:shared-provider', 'lower'],
    ]);
    expect(index.nodes.find(node => node.key === 'capability:shared-provider')).toMatchObject({
      owner: `${reviews}/theme`, proposed: { parent: reviews, directory: 'subs/reviews/subs/theme' },
    });
    expect(index.nodes.filter(node => node.kind === 'iteration').map(node => [node.key, node.ordinal, node.outlineRevision, node.state, node.module])).toEqual([
      ['iteration:wi-001.i01', 1, 1, 'completed', reviews], ['iteration:wi-001.i02', 2, 2, 'assigned', reviews],
    ]);
    expect(index.nodes.find(node => node.key === 'iteration:wi-001.i02')).toMatchObject({ scopeExceptions: [{ path: 'subs/reviews/src/wi-001.i02.ts', purpose: 'contract' }] });
    expect(index.nodes.filter(node => node.kind === 'gate').map(node => [node.key, node.active, node.verdict])).toEqual([
      ['gate:ga-final', false, 'passed'], ['gate:ga-running', true, null],
    ]);
    expect(executionCapabilityDetailOf(view, 'shared-provider').detail).toMatchObject({ state: 'available', level: 'lower', description: 'Full provider behavior.' });
  });
});

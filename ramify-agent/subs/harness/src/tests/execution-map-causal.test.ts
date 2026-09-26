import { describe, expect, it } from 'vitest';
import { contractRecordSchema } from '../contracts/records.js';
import { executionCoreOf } from '../projections/execution-map.js';
import { runView } from '../projections/inputs.js';
import { entryAssignmentsSchema } from '../run/records.js';
import { gateAttemptSchema } from '../run/records.js';
import { at, constructedRun, hash, item, obligation, registered, requirement, reviews, type Line } from './helpers/constructed.js';

const provider = 'shared-provider';
const first = 'first-consumer';
const second = 'second-consumer';
const contractId = 'ct-shared';
const firstRequirement = 'rq-first';
const secondRequirement = 'rq-second';

function contract(revision: number, mode: 'fake-backed' | 'access-only' = 'fake-backed') {
  return contractRecordSchema.parse({
    schema: 'ramify-agent.contract/2', id: contractId, revision,
    capability: { id: provider, revision: 1, hash }, decision: null,
    authority: { kind: 'provider', owner: reviews, rationale: 'Provider owns the behavior.' },
    provider: reviews, behavior: 'Shared behavior.', mode,
    artifacts: { interface: [], conformance: [], fake: [], exposure: [] },
    establishedBy: { iteration: 'it-contract', gate: 'ga-contract' },
  });
}

const entries = entryAssignmentsSchema.parse({
  schema: 'ramify-agent.entry-assignments/1', view: { status: 'placeholder' },
  entries: [first, second].map(capability => ({
    capability, description: `The ${capability} entry.`, owner: reviews,
    requirementRefs: [], acceptanceRefs: [], contextRefs: [], citations: [],
  })),
});

function base(): Line[] {
  return [
    { type: 'analysis-accepted', data: {}, records: [
      { path: 'analysis/entries.json', body: entries },
      { path: at('registry', first), body: registered(first, { consumers: [{ capability: provider, workItem: 'wi-provider' }] }) },
      { path: at('registry', second), body: registered(second) },
      { path: at('registry', provider), body: registered(provider, {
        origin: 'global-decision', consumers: [{ capability: first, workItem: 'wi-first' }, { capability: second, workItem: 'wi-second' }],
      }) },
      { path: at('work', 'wi-first'), body: item('wi-first', { entry: first }) },
      { path: at('work', 'wi-second'), body: item('wi-second', { entry: second }) },
      { path: at('work', 'wi-provider'), body: item('wi-provider', { obligation: { id: `ob-${contractId}`, revision: 1, hash } }) },
    ] },
    { type: 'contract-registered', data: {
      contract: contractId, revision: 1, mode: 'fake-backed', iteration: 'it-contract',
      obligation: `ob-${contractId}`, requirements: [firstRequirement, secondRequirement], providerWorkItem: 'wi-provider',
    }, records: [
      { path: at('contracts', contractId), body: contract(1) },
      { path: at('obligations', `ob-${contractId}`), body: obligation(contractId, provider) },
      { path: at('requirements', firstRequirement), body: requirement(firstRequirement, 'wi-first', first, contractId) },
      { path: at('requirements', secondRequirement), body: requirement(secondRequirement, 'wi-second', second, contractId) },
    ] },
  ];
}

function projected(extra: Line[] = []) {
  return executionCoreOf(runView(constructedRun([...base(), ...extra])));
}

function node(index: ReturnType<typeof projected>, key: string) {
  return index.nodes.find(candidate => candidate.key === key);
}

describe('execution map causal projection', () => {
  it('closes an access-only agreement at registration without inventing provider work', () => {
    const run = constructedRun([
      { type: 'analysis-accepted', data: {}, records: [
        { path: 'analysis/entries.json', body: entries },
        { path: at('registry', provider), body: registered(provider) },
      ] },
      { type: 'contract-registered', data: { contract: contractId, revision: 1, mode: 'access-only',
        iteration: 'it-contract', obligation: null, requirements: [], providerWorkItem: null },
      records: [{ path: at('contracts', contractId), body: contract(1, 'access-only') }] },
    ]);
    const index = executionCoreOf(runView(run));
    expect(node(index, `contract:${contractId}`)).toMatchObject({ mode: 'access-only', state: 'conformed' });
    expect(index.nodes.some(candidate => candidate.kind === 'requirement' || candidate.kind === 'work-item')).toBe(false);
  });

  it('keeps one provider and separate current consumer verification stages, then reopens only current revisions', () => {
    const registered = projected();
    expect(registered.nodes.filter(candidate => candidate.key === `capability:${provider}`)).toHaveLength(1);
    expect(node(registered, `requirement:${firstRequirement}`)).toMatchObject({ state: 'working', providerStage: 'not-started', provider: `capability:${provider}` });
    expect(registered.links.filter(link => link.kind === 'provider-for' && link.from.key === `capability:${provider}`)).toHaveLength(2);
    const providerWorking = projected([{ type: 'work-item-started', data: { workItem: 'wi-provider', module: reviews, origin: 'obligation' } }]);
    expect(node(providerWorking, `requirement:${firstRequirement}`)).toMatchObject({ state: 'working', providerStage: 'working' });
    const conformed: Line = { type: 'provider-conformed', data: { obligation: `ob-${contractId}`, revision: 1,
      workItem: 'wi-provider', iteration: 'it-provider', gate: 'ga-provider' } };
    const verified: Line = { type: 'requirement-verified', data: { requirement: firstRequirement, revision: 1,
      workItem: 'wi-first', iteration: 'it-first', gate: 'ga-first' } };
    const beforeReopen = projected([conformed, verified]);
    expect(node(beforeReopen, `requirement:${firstRequirement}`)).toMatchObject({ state: 'verified', verifiedRevision: 1, providerStage: 'conformed' });
    expect(node(beforeReopen, `requirement:${secondRequirement}`)).toMatchObject({ state: 'provider-conformed', verifiedRevision: null, providerStage: 'conformed' });
    expect(beforeReopen.links.filter(link => link.kind === 'depends-on' &&
      link.from.key === `capability:${first}` && link.to.key === `capability:${provider}`)).toHaveLength(1);
    expect(beforeReopen.links.some(link => link.kind === 'depends-on' &&
      link.from.key === `capability:${provider}` && link.to.key === `capability:${first}`)).toBe(true);
    const reopened = projected([conformed, verified, { type: 'evidence-reopened', data: {
      cause: 'changed interface', contract: contractId, revision: 2, iteration: 'it-contract-2',
      obligation: `ob-${contractId}`, requirements: [firstRequirement, secondRequirement], bindings: [], followUps: [], superseded: [],
    }, records: [
      { path: at('contracts', contractId, 2), body: contract(2) },
      { path: at('obligations', `ob-${contractId}`, 2), body: obligation(contractId, provider, 2) },
      { path: at('requirements', firstRequirement, 2), body: requirement(firstRequirement, 'wi-first', first, contractId, 2) },
      { path: at('requirements', secondRequirement, 2), body: requirement(secondRequirement, 'wi-second', second, contractId, 2) },
    ] }]);
    expect(node(reopened, `requirement:${firstRequirement}`)).toMatchObject({ state: 'reopened', currentRevision: 2, verifiedRevision: 1, providerStage: 'not-started' });
    expect(node(reopened, `requirement:${secondRequirement}`)).toMatchObject({ state: 'working', currentRevision: 2, verifiedRevision: null, providerStage: 'not-started' });
    expect(node(reopened, `capability:${first}`)).toMatchObject({ directRequirements: { verified: 0 } });
  });

  it('shows a readiness gate only after a start event and clears Now on its recorded ending', () => {
    const old = projected();
    expect(old.current).toEqual({ awaitedSession: null, runningGate: null, source: null });
    const running = projected([{ type: 'gate-started', data: { gate: 'ga-readiness', checkpoint: 'readiness' } }]);
    expect(node(running, 'gate:ga-readiness')).toMatchObject({ active: true, verdict: null, audit: 'not-applicable' });
    expect(running.current.runningGate).toBe('gate:ga-readiness');
    const ended = projected([
      { type: 'gate-started', data: { gate: 'ga-readiness', checkpoint: 'readiness' } },
      { type: 'readiness-failed', data: { attempt: 1, gate: 'ga-readiness', step: 'baseline-tests', detail: 'failure', recovery: null, final: true } },
    ]);
    expect(ended.current.runningGate).toBeNull();
  });

  it('names the command a running gate started last, and nothing once the gate ended', () => {
    const started = { type: 'gate-started', data: { gate: 'ga-readiness', checkpoint: 'readiness' } } as const;
    const command = (position: number, kind: 'tests' | 'type-check') =>
      ({ type: 'gate-command-started', data: { gate: 'ga-readiness', checkpoint: 'readiness', kind, position, total: 4 } }) as const;
    const waiting = projected([started]);
    expect(waiting.current.gateCommand).toBeUndefined();
    const running = projected([started, command(1, 'tests'), command(2, 'type-check')]);
    expect(running.current.runningGate).toBe('gate:ga-readiness');
    expect(running.current.gateCommand).toMatchObject({ kind: 'type-check', position: 2, total: 4 });
    expect(running.current.gateCommand?.source.sequence).toBe(running.runVersion);
    const ended = projected([started, command(1, 'tests'),
      { type: 'readiness-failed', data: { attempt: 1, gate: 'ga-readiness', step: 'baseline-tests', detail: 'failure', recovery: null, final: true } }]);
    expect(ended.current).toEqual({ awaitedSession: null, runningGate: null, source: null });
  });

  it('keeps failed and repaired attempts as separate cards with a typed repair edge', () => {
    const gate = (id: string, repairRound: number, verdict: 'failed' | 'passed') => gateAttemptSchema.parse({
      schema: 'ramify-agent.gate-attempt/3', id, checkpoint: 'iteration',
      subject: { workItem: 'wi-first', iteration: `it-${repairRound}` }, proposedBy: null,
      repairRound, infrastructureAttempt: 0, head: 'head', commit: null, audited: null, evidence: null,
      guardedChanges: [], commands: [], verdict, cause: verdict === 'failed' ? 'in-scope' : null,
      next: verdict === 'failed' ? 'repair' : 'accept',
    });
    const index = projected([
      { type: 'gate-attempted', data: { gate: 'ga-failed', checkpoint: 'iteration', verdict: 'failed', next: 'repair' },
        records: [{ path: 'gates/ga-failed/attempt.json', body: gate('ga-failed', 0, 'failed') }] },
      { type: 'gate-attempted', data: { gate: 'ga-repaired', checkpoint: 'iteration', verdict: 'passed', next: 'accept' },
        records: [{ path: 'gates/ga-repaired/attempt.json', body: gate('ga-repaired', 1, 'passed') }] },
    ]);
    expect(index.nodes.filter(candidate => candidate.kind === 'gate')).toHaveLength(2);
    expect(index.links.find(link => link.kind === 'repair-of')).toMatchObject({
      from: { key: 'gate:ga-repaired' }, to: { key: 'gate:ga-failed' },
    });
  });
});

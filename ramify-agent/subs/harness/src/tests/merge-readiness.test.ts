import { describe, expect, it } from 'vitest';
import type { Assessment, Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { projectMergeReadiness, type MergeReadinessInput, type ReadinessDeviation } from '../run/merge-readiness.js';

const tree = 'a'.repeat(40);
const otherTree = 'b'.repeat(40);
const candidate: Candidate = { tree, head: null, preparedAt: '2026-09-25T00:00:00.000Z' };

function assessment(results: Assessment['results']): Assessment {
  return {
    schema: 'ramify-agent.nonfunctional-assessment/1', id: 'nfa-001', candidate,
    round: 1, phase: 'initial', coordinatorInvocation: 'coordinator-1', results,
  };
}

function assessed(nfr: string, result: 'satisfied' | 'not-satisfied' | 'undetermined'): Assessment['results'][number] {
  return { nfr, result, inspectedScope: ['src/'], evidence: [], uncertainty: '' };
}

function nfrDeviation(nfr = 'nfr-001', decision: ReadinessDeviation['decision'] = null): ReadinessDeviation {
  return {
    origin: { kind: 'nonfunctional-assessment', nfr, assessment: 'nfa-001', candidate, coordinatorInvocation: 'coordinator-1' },
    checkFinding: 'cf-0001', findingRevision: decision?.revision ?? 1, decision,
  };
}

function workItemDeviation(decision: ReadinessDeviation['decision'] = null): ReadinessDeviation {
  return {
    origin: { kind: 'work-item-conflict', request: 'request-1', workItem: 'item-1', architectInvocation: 'architect-1' },
    checkFinding: 'cf-0002', findingRevision: decision?.revision ?? 1, decision,
  };
}

function input(overrides: Partial<MergeReadinessInput> = {}): MergeReadinessInput {
  return {
    completed: true, candidate,
    finalGate: { id: 'gate-1', tree, assessment: 'nfa-001', passed: true },
    nfrIds: ['nfr-001'], assessment: assessment([assessed('nfr-001', 'satisfied')]), deviations: [],
    ...overrides,
  };
}

describe('projectMergeReadiness', () => {
  it('is ready for a passing gate and satisfied NFR without a finding', () => {
    expect(projectMergeReadiness(input())).toMatchObject({
      status: 'ready', candidate, finalGate: 'gate-1', checkFindings: [],
    });
  });

  it('treats an explicit empty catalog and empty complete assessment as ready', () => {
    expect(projectMergeReadiness(input({ nfrIds: [], assessment: assessment([]) })).status).toBe('ready');
    expect(projectMergeReadiness(input({ nfrIds: null, assessment: assessment([]) })).status).toBe('unavailable');
  });

  it('requires exactly one current finding for each unsatisfied or undetermined NFR', () => {
    for (const result of ['not-satisfied', 'undetermined'] as const) {
      const base = input({ assessment: assessment([assessed('nfr-001', result)]) });
      expect(projectMergeReadiness(base).status).toBe('unavailable');
      expect(projectMergeReadiness({ ...base, deviations: [nfrDeviation()] }).status).toBe('pending-review');
      expect(projectMergeReadiness({ ...base, deviations: [nfrDeviation(), { ...nfrDeviation(), checkFinding: 'cf-0003' }] }).status).toBe('unavailable');
    }
  });

  it('acceptance changes review standing at the exact finding revision, without changing the gate', () => {
    const base = input({ assessment: assessment([assessed('nfr-001', 'undetermined')]) });
    const accepted = nfrDeviation('nfr-001', { standing: 'accepted', revision: 2 });
    expect(projectMergeReadiness({ ...base, deviations: [accepted] })).toMatchObject({ status: 'ready', finalGate: 'gate-1' });
    expect(projectMergeReadiness({ ...base, deviations: [{ ...accepted, findingRevision: 3 }] }).status).toBe('unavailable');
    expect(projectMergeReadiness({ ...base, deviations: [nfrDeviation('nfr-001', { standing: 'rejected', revision: 2 })] }).status).toBe('rejected');
  });

  it('a failed required gate remains failed even after acceptance or absent assessment', () => {
    const base = input({
      assessment: assessment([assessed('nfr-001', 'not-satisfied')]),
      deviations: [nfrDeviation('nfr-001', { standing: 'accepted', revision: 2 })],
    });
    expect(projectMergeReadiness({ ...base, finalGate: { ...base.finalGate!, passed: false } }).status).toBe('gate-failed');
    expect(projectMergeReadiness({ ...base, finalGate: { ...base.finalGate!, passed: false }, assessment: null }).status).toBe('gate-failed');
    expect(projectMergeReadiness({ ...base, completed: false, finalGate: { ...base.finalGate!, passed: false } }).status).toBe('gate-failed');
  });

  it('requires a completed run and exact assessment and candidate bindings', () => {
    expect(projectMergeReadiness(input({ completed: false })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ finalGate: null })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ finalGate: { id: 'gate-1', tree, assessment: 'nfa-002', passed: true } })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ finalGate: { id: 'gate-1', tree: otherTree, assessment: 'nfa-001', passed: true } })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ candidate: { ...candidate, tree: otherTree } })).status).toBe('unavailable');
  });

  it('rejects incomplete, duplicate and unknown assessment coverage', () => {
    expect(projectMergeReadiness(input({ assessment: assessment([]) })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ assessment: assessment([assessed('nfr-001', 'satisfied'), assessed('nfr-001', 'satisfied')]) })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ assessment: assessment([assessed('nfr-002', 'satisfied')]) })).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ nfrIds: ['nfr-001', 'nfr-001'] })).status).toBe('unavailable');
  });

  it('legacy work-item deviations also block readiness until accepted, and rejection wins', () => {
    expect(projectMergeReadiness(input({ deviations: [workItemDeviation()] })).status).toBe('pending-review');
    expect(projectMergeReadiness(input({ deviations: [workItemDeviation({ standing: 'accepted', revision: 2 })] })).status).toBe('ready');
    const pending = nfrDeviation();
    const rejected = workItemDeviation({ standing: 'rejected', revision: 2 });
    expect(projectMergeReadiness(input({
      assessment: assessment([assessed('nfr-001', 'not-satisfied')]), deviations: [pending, rejected],
    })).status).toBe('rejected');
  });

  it('refuses deviation provenance from another candidate or assessment and conflicting satisfied findings', () => {
    const base = input({ assessment: assessment([assessed('nfr-001', 'undetermined')]) });
    const linked = nfrDeviation();
    if (linked.origin.kind !== 'nonfunctional-assessment') throw new Error('expected NFR origin');
    expect(projectMergeReadiness({ ...base, deviations: [{ ...linked, origin: { ...linked.origin, assessment: 'nfa-002' } }] }).status).toBe('unavailable');
    expect(projectMergeReadiness({ ...base, deviations: [{ ...linked, origin: { ...linked.origin, candidate: { ...candidate, tree: otherTree } } }] }).status).toBe('unavailable');
    expect(projectMergeReadiness(input({ deviations: [nfrDeviation('nfr-001', { standing: 'accepted', revision: 2 })] })).status).toBe('unavailable');
  });

  it('does not mutate the supplied assessment or deviation list', () => {
    const prepared = input({ assessment: assessment([assessed('nfr-001', 'undetermined')]), deviations: [nfrDeviation()] });
    Object.freeze(prepared.assessment!.results);
    Object.freeze(prepared.deviations);
    expect(projectMergeReadiness(prepared).status).toBe('pending-review');
  });
});

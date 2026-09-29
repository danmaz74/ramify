import { describe, expect, it } from 'vitest';
import { buildCapabilityPlanRevision, validateCapabilityAction, validateCapabilityPlanUpdate, type CapabilityActionBasis } from '../capability/submission.js';
import { fixturePlan } from './helpers/capability.js';

const basis: CapabilityActionBasis = {
  task: 'cap-001', planRevision: 2, coordinatorInvocation: 'inv-0003', state: 'coordinating',
  openAssignment: null, openChild: null,
};

describe('capability submission', () => {
  it('CA16 returns structural field errors and keeps preview pure', () => {
    const malformed = { task: 'cap-001', planRevision: 2, invocation: 'inv-0003', kind: 'assign',
      owner: 'bad module', purpose: '', approach: 'Implement', requirementRefs: [], intendedEvidence: [],
    };
    const before = structuredClone(basis);
    const result = validateCapabilityAction(malformed, basis);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.every(issue => issue.kind === 'structure')).toBe(true);
      expect(result.issues.map(issue => issue.path.join('.'))).toContain('owner');
      expect(result.issues.map(issue => issue.path.join('.'))).toContain('purpose');
    }
    expect(basis).toEqual(before);
  });

  it('CA16 final validation rejects a preview made before state and authority changed', () => {
    const action = { task: 'cap-001', planRevision: 2, invocation: 'inv-0003', kind: 'consult-consumer',
      question: 'What does the caller expect?', sections: ['useCases'], references: ['src/caller.ts'],
    };
    expect(validateCapabilityAction(action, basis).valid).toBe(true);
    const changed: CapabilityActionBasis = { ...basis, planRevision: 3, coordinatorInvocation: 'inv-0004' };
    const result = validateCapabilityAction(action, changed);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map(issue => issue.path)).toEqual([['planRevision'], ['invocation']]);
    expect(validateCapabilityAction(action, { ...basis, state: 'implementing', openAssignment: 'cap-001.i01' }).valid).toBe(false);
  });

  it('plan updates use the same basis check and do not judge semantic wording', () => {
    const update = { task: 'cap-001', basedOn: 2, invocation: 'inv-0003', reason: 'New evidence', changes: { proposedInterface: 'B exposes the field reader' } };
    expect(validateCapabilityPlanUpdate(update, basis).valid).toBe(true);
    expect(validateCapabilityPlanUpdate(update, { ...basis, planRevision: 3 }).valid).toBe(false);
    expect(validateCapabilityPlanUpdate({ ...update, reason: '' }, basis).valid).toBe(false);
  });

  it('CA11 builds a revision with stable case identity and refuses silent case deletion', () => {
    const previous = fixturePlan();
    const correction = { task: previous.task, basedOn: 1, invocation: 'inv-0002', reason: 'Independent test corrected the oracle',
      changes: { useCases: [{ ...previous.useCases[0]!, expectedBehavior: 'Corrected value', coverage: {
        state: 'corrected' as const, reason: 'Wrong unit', evidence: ['review-1'], decidedBy: 'inv-0002',
        tests: ['a-format'], candidate: 'tree-2', configuration: 'vitest-1',
      } }] },
    };
    const next = buildCapabilityPlanRevision(previous, correction);
    expect(next.originalExamples).toEqual(previous.originalExamples);
    expect(next.useCases[0]?.id).toBe(previous.useCases[0]?.id);
    expect(previous.useCases[0]?.coverage.state).toBe('unresolved');
    expect(() => buildCapabilityPlanRevision(previous, { ...correction, changes: { useCases: [] } })).toThrow();
  });
});

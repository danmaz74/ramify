import { defaultRunPolicy } from '../run/policy.js';
import { describe, expect, it } from 'vitest';
import { runEvent, type RunEventInput } from '../run/log.js';
import {
  canAssignCapabilityTask, canCreateCapabilityTask, capabilityHandbackReadiness, isCapabilityEvent, replayCapabilityState,
  transitionCapabilityState, type CapabilityEvent,
} from '../capability/state.js';
import { fixturePlan, fixtureRequest, fixtureTask } from './helpers/capability.js';
import { canStartInvocation, capabilityPolicyFrom, captureCapabilityLimits } from '../capability/policy.js';
import type { RunPolicy } from '../run/records.js';

const event = (sequence: number, input: RunEventInput): CapabilityEvent => {
  const built = runEvent('job-001', sequence, input, new Date('2026-09-28T00:00:00.000Z'));
  if (!isCapabilityEvent(built)) throw new Error('Expected capability event');
  return built;
};

const begin = (): CapabilityEvent[] => [
  event(1, { type: 'capability-requested', data: { request: 'need-001', parent: 'wi-001', assignment: 'wi-001.i01', invocation: 'inv-0001' } }),
  event(2, { type: 'capability-delegated', data: { task: 'cap-001', request: 'need-001', parent: 'wi-001', invocation: 'inv-0002', planRevision: 1 } }),
];

describe('capability state and authority', () => {
  it('CA29 numbers assignments across B, D and A without consuming entry numbering', () => {
    const events = begin();
    for (const [index, assignment] of ['cap-001.i01', 'cap-001.i02', 'cap-001.i03'].entries()) {
      events.push(event(events.length + 1, { type: 'capability-assigned', data: {
        task: 'cap-001', assignment, sequence: index + 1, invocation: 'inv-0002',
      } }));
      events.push(event(events.length + 1, { type: 'capability-assignment-settled', data: { task: 'cap-001', assignment, outcome: 'accepted' } }));
    }
    const state = replayCapabilityState(events);
    const task = state.tasks.get('cap-001')!;
    expect([...task.assignments.keys()]).toEqual(['cap-001.i01', 'cap-001.i02', 'cap-001.i03']);
    expect(task.nextAssignmentSequence).toBe(4);
    expect(canAssignCapabilityTask(task, 3)).toBe(false);
    expect(canCreateCapabilityTask(63, 0, 64)).toBe(true);
    expect(canCreateCapabilityTask(63, 1, 64)).toBe(false);
    expect(() => transitionCapabilityState(state, event(9, { type: 'capability-assigned', data: {
      task: 'cap-001', assignment: 'cap-001.i01', sequence: 1, invocation: 'inv-0002',
    } }))).toThrow('assignment sequence');
  });

  it('CA29 captures distinct task and global limits under the new policy version', () => {
    const previous = { version: 'run-policy/4', limits: {
      maxIterationsPerWorkItem: 12, maxWorkItems: 64, maxInvocationsPerRun: 400,
    } } as unknown as RunPolicy;
    expect(() => captureCapabilityLimits(previous)).toThrow('run-policy/7');
    expect(() => capabilityPolicyFrom(previous)).toThrow('fresh run');
    const policy = capabilityPolicyFrom(defaultRunPolicy({ projectRoot: '/fixture' }));
    const limits = captureCapabilityLimits(policy);
    expect(limits).toEqual({ maxAssignments: 12, maxWorkUnits: 64, maxInvocations: 400 });
    expect(canStartInvocation(399, limits)).toBe(true);
    expect(canStartInvocation(400, limits)).toBe(false);
  });

  it('holds the depth-first stack while a child answers a need from an unfinished parent assignment', () => {
    const events = begin();
    events.push(event(3, { type: 'capability-assigned', data: { task: 'cap-001', assignment: 'cap-001.i01', sequence: 1, invocation: 'inv-0002' } }));
    events.push(event(4, { type: 'capability-requested', data: { request: 'need-002', parent: 'cap-001', assignment: 'cap-001.i01', invocation: 'inv-0003' } }));
    events.push(event(5, { type: 'capability-delegated', data: { task: 'cap-002', request: 'need-002', parent: 'cap-001', invocation: 'inv-0004', planRevision: 1 } }));
    const nested = replayCapabilityState(events);
    expect(nested.stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
    expect(nested.tasks.get('cap-001')?.status).toBe('awaiting-dependency');
    expect(() => transitionCapabilityState(nested, event(6, { type: 'capability-verification-started', data: {
      task: 'cap-001', invocation: 'inv-0002',
    } }))).toThrow('not the active stack frame');
    events.push(event(6, { type: 'capability-verification-started', data: { task: 'cap-002', invocation: 'inv-0004' } }));
    events.push(event(7, { type: 'capability-handed-back', data: { task: 'cap-002', handback: 'cap-002', invocation: 'inv-0004' } }));
    const returned = replayCapabilityState(events);
    expect(returned.stack).toEqual(['wi-001', 'cap-001']);
    expect(returned.tasks.get('cap-001')?.status).toBe('implementing');
    expect(returned.tasks.get('cap-001')?.activeAssignment).toBe('cap-001.i01');
  });

  it('refuses an active assignment but preserves partial history for the verifier', () => {
    const assigned = [...begin(), event(3, { type: 'capability-assigned', data: {
      task: 'cap-001', assignment: 'cap-001.i01', sequence: 1, invocation: 'inv-0002',
    } })];
    const running = replayCapabilityState(assigned);
    expect(() => transitionCapabilityState(running, event(4, { type: 'capability-verification-started', data: {
      task: 'cap-001', invocation: 'inv-0002',
    } }))).toThrow('implementing');
    assigned.push(event(4, { type: 'capability-assignment-settled', data: {
      task: 'cap-001', assignment: 'cap-001.i01', outcome: 'partial',
    } }));
    const partial = replayCapabilityState(assigned);
    const verifying = transitionCapabilityState(partial, event(5, { type: 'capability-verification-started', data: {
      task: 'cap-001', invocation: 'inv-0002',
    } }));
    expect(verifying.tasks.get('cap-001')?.status).toBe('verifying');
  });

  it('rejects stale plan revisions and inactive coordinator invocations', () => {
    const state = replayCapabilityState(begin());
    expect(() => transitionCapabilityState(state, event(3, { type: 'capability-plan-revised', data: {
      task: 'cap-001', revision: 2, basedOn: 1, invocation: 'inv-0099',
    } }))).toThrow('no coordination authority');
    const revised = transitionCapabilityState(state, event(3, { type: 'capability-plan-revised', data: {
      task: 'cap-001', revision: 2, basedOn: 1, invocation: 'inv-0002',
    } }));
    expect(() => transitionCapabilityState(revised, event(4, { type: 'capability-plan-revised', data: {
      task: 'cap-001', revision: 2, basedOn: 1, invocation: 'inv-0002',
    } }))).toThrow('stale plan revision');
  });

  it('CA34 PB3-D08 handback readiness is structural: no per-example coverage, and no entry association inferred from a similar name', () => {
    const request = fixtureRequest();
    const task = fixtureTask(request);
    const plan = fixturePlan(request, task);
    const coordinating = replayCapabilityState(begin()).tasks.get(task.id)!;
    expect(capabilityHandbackReadiness(task, request, plan, coordinating)).toEqual(['Task is not verifying']);
    const state = replayCapabilityState([...begin(), event(3, { type: 'capability-verification-started', data: {
      task: task.id, invocation: 'inv-0002',
    } })]).tasks.get(task.id)!;
    // The original example's case carries no coverage state, and none is asked for.
    expect(capabilityHandbackReadiness(task, request, plan, state)).toEqual([]);
    expect(capabilityHandbackReadiness(task, request, { ...plan, revision: 2, basedOn: 1 }, state)).toEqual(['Plan revision is stale']);
    expect(task.relatedEntries).toEqual([]);
    expect({ ...task, relatedEntries: [{ entry: task.id, reason: 'Architect explicitly related an entry' }] }.relatedEntries).toHaveLength(1);
  });
});

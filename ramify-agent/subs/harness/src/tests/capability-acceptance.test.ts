import { expect, test } from 'vitest';
import type { GateAttempt, GateCommandRecord } from '../checks/records.js';
import { candidateAcceptanceFindings } from '../capability/acceptance.js';
import { capabilityCompletionBlockers, emptyCapabilityState, transitionCapabilityState } from '../capability/state.js';
import { fixturePlan, fixtureRequest, fixtureTask } from './helpers/capability.js';
import type { CapabilityAssignment } from '../capability/records.js';
import type { RunEvent } from '../run/log.js';

const request = fixtureRequest();
const task = fixtureTask(request);
const tree = 'b'.repeat(64);
const config = 'c'.repeat(64);
const aTest = 'subs/a/src/tests/caller.test.ts';
const bTest = 'subs/b/src/tests/fact.test.ts';
const command = (kind: 'tests' | 'type-check' | 'ramify-check', path?: string, outcome: 'passed' | 'failed' = 'passed'): GateCommandRecord => ({
  kind, outcome, ...(path === undefined ? {} : { selection: { resolved: [path] } }),
} as GateCommandRecord);
const gate = { id: 'gate-001', verdict: 'passed', audited: 'commit', evidence: {},
  commands: [command('tests', aTest), command('tests', bTest), command('type-check'), command('ramify-check')],
} as unknown as GateAttempt;
const assignment = { id: 'cap-001.i01', task: task.id, owner: 'capability-coordination/b',
  plan: { revision: 1 } } as CapabilityAssignment;
const plan = { ...fixturePlan(request, task), useCases: [{ ...fixturePlan(request, task).useCases[0]!,
  coverage: { state: 'exercised' as const, tests: [aTest], candidate: tree, configuration: config } }] };
const input = { task, request, plan, assignments: [assignment], ownerDirectories: new Map([['a', 'subs/a'], ['b', 'subs/b']]),
  outcomes: new Map([[assignment.id, 'partial' as const]]),
  gate, tree, configuration: config, review: { tree, planRevision: 1, outcome: 'passed' as const, findings: [] } };

test('CA11 CA12 CA15: current real provider and consumer evidence is required', () => {
  expect(candidateAcceptanceFindings(input)).toEqual([]);
  const fake = { ...gate, commands: [command('tests', 'subs/a/src/tests/fake.test.ts'), command('tests', bTest),
    command('type-check'), command('ramify-check')] };
  expect(candidateAcceptanceFindings({ ...input, gate: fake })).toContain(`Example ${request.original.examples[0]!.id} cites unexecuted test ${aTest}`);
  expect(candidateAcceptanceFindings({ ...input, gate: { ...gate, commands: gate.commands.map(command =>
    command.kind === 'tests' && command.selection?.resolved.includes(aTest) ? { ...command, outcome: 'failed' as const } : command) } }))
    .toContain(`Real consumer ${task.consumer} has no executed selected test`);
  expect(candidateAcceptanceFindings({ ...input, tree: 'd'.repeat(64) })).toContain(`Example ${request.original.examples[0]!.id} cites stale source or configuration`);
  expect(candidateAcceptanceFindings({ ...input, configuration: 'e'.repeat(64) })).toContain(`Example ${request.original.examples[0]!.id} cites stale source or configuration`);
  expect(candidateAcceptanceFindings({ ...input, plan: { ...plan, useCases: [{ ...plan.useCases[0]!, coverage: {
    ...plan.useCases[0]!.coverage, tests: [],
  } }] } })).toContain(`Example ${request.original.examples[0]!.id} has no executed test association`);
});

test('CA13 CA14: review concerns and unfinished owner results block acceptance', () => {
  expect(candidateAcceptanceFindings({ ...input, review: { ...input.review, outcome: 'failed', findings: ['Expected value copies implementation'] } })
    .some(finding => finding.includes('Expected value copies implementation'))).toBe(true);
  expect(candidateAcceptanceFindings({ ...input, outcomes: new Map([[assignment.id, 'failed' as const]]) }))
    .toContain(`Assignment ${assignment.id} lacks a submitted scoped result`);
  expect(candidateAcceptanceFindings({ ...input, gate: { ...gate, verdict: 'failed' as const,
    commands: [...gate.commands, command('type-check', undefined, 'failed')] } }).some(finding => finding.includes('did not pass'))).toBe(true);
});

test('nested and root owner test paths come from the architect index', () => {
  const nested = { ...input, task: { ...task, provider: 'capability-coordination/p/b', consumer: 'capability-coordination' },
    ownerDirectories: new Map([['capability-coordination/p/b', 'subs/p/subs/b'], ['capability-coordination', '']]),
    gate: { ...gate, commands: [command('tests', 'subs/p/subs/b/src/tests/fact.test.ts'),
      command('tests', 'src/tests/root.test.ts'), command('type-check'), command('ramify-check')] },
    plan: { ...plan, useCases: [{ ...plan.useCases[0]!, coverage: {
      state: 'exercised' as const, tests: ['src/tests/root.test.ts'], candidate: tree, configuration: config,
    } }] },
  };
  expect(candidateAcceptanceFindings(nested)).toEqual([]);
});

test('CA31: pending, stopped and delegated requests block ordinary completion until current handback', () => {
  const event = (type: RunEvent['type'], data: unknown) => ({ type, data }) as RunEvent;
  let state = transitionCapabilityState(emptyCapabilityState(), event('capability-requested',
    { request: 'need-001', parent: 'wi-001', assignment: 'wi-001.i01', invocation: 'inv-001' }) as never);
  expect(capabilityCompletionBlockers(state, 'wi-001', new Set())).toContain('need-001 has no accepted consumer verification');
  state = transitionCapabilityState(state, event('capability-delegated',
    { task: 'cap-001', request: 'need-001', parent: 'wi-001', invocation: 'inv-002', planRevision: 1 }) as never);
  expect(capabilityCompletionBlockers(state, 'wi-001', new Set())).toContain('cap-001 has no accepted current handback');
  state = transitionCapabilityState(state, event('capability-verification-started',
    { task: 'cap-001', invocation: 'inv-002' }) as never);
  state = transitionCapabilityState(state, event('capability-handed-back',
    { task: 'cap-001', handback: 'cap-001', invocation: 'inv-002' }) as never);
  expect(capabilityCompletionBlockers(state, 'wi-001', new Set())).toEqual([]);
  state = transitionCapabilityState(state, event('capability-requested',
    { request: 'need-002', parent: 'wi-001', assignment: 'wi-001.i01', invocation: 'inv-003' }) as never);
  expect(capabilityCompletionBlockers(state, 'wi-001', new Set())).toContain('need-002 has no accepted consumer verification');
  expect(state.tasks.get('cap-001')?.status).toBe('handed-back');
});

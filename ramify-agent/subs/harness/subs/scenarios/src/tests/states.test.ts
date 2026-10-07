import { describe, expect, test } from 'vitest';
import {
  applyScenarioEvent,
  boundState,
  carriesPendingTag,
  countScenarioStates,
  initialScenarioStates,
  reduceScenarioStates,
  scenarioEventTypes,
  scenarioStateSchema,
  type ScenarioEvent,
  type ScenarioState,
} from '../states.js';

const bound = (id: string): ScenarioEvent => ({ type: 'obligation-bound', data: { id } });
const reported = (id: string, judgment: 'done' | 'bound'): ScenarioEvent => ({ type: 'obligation-reported', data: { id, judgment } });

describe('PB3-D12: three states, each entered by one accepted submission', () => {
  test('the states are pending, bound and done, and the events are the binding and the report', () => {
    expect(scenarioStateSchema.options).toEqual(['pending', 'bound', 'done']);
    expect(scenarioEventTypes).toEqual(['obligation-bound', 'obligation-reported']);
  });

  const table: { event: ScenarioEvent; from: ScenarioState; to: ScenarioState }[] = [
    { event: bound('sc-001'), from: 'pending', to: 'bound' },
    { event: bound('sc-001'), from: 'bound', to: 'bound' },
    // A binding of a done scenario records its fakes and leaves it done.
    { event: bound('sc-001'), from: 'done', to: 'done' },
    { event: reported('sc-001', 'done'), from: 'pending', to: 'done' },
    { event: reported('sc-001', 'done'), from: 'bound', to: 'done' },
    { event: reported('sc-001', 'done'), from: 'done', to: 'done' },
    // Only the architect's revision moves a done one back.
    { event: reported('sc-001', 'bound'), from: 'done', to: 'bound' },
  ];
  for (const { event, from, to } of table) {
    test(`${event.type}${event.type === 'obligation-reported' ? ` ${event.data.judgment}` : ''} from ${from}: ${to}`, () => {
      const states = new Map<string, ScenarioState>([['sc-001', from], ['sc-002', 'pending']]);
      expect(applyScenarioEvent(states, event)).toEqual(new Map([['sc-001', to], ['sc-002', 'pending']]));
      expect(states.get('sc-001')).toBe(from);
    });
  }

  test('an event naming another kind of obligation leaves the scenario states as they are', () => {
    const states = initialScenarioStates(['sc-001']);
    expect(applyScenarioEvent(states, reported('cap-001', 'done'))).toBe(states);
    expect(applyScenarioEvent(states, bound('test-001'))).toBe(states);
  });

  test('boundState never undoes a done', () => {
    expect(scenarioStateSchema.options.map(boundState)).toEqual(['bound', 'bound', 'done']);
  });
});

describe('reducing a run\'s events', () => {
  test('a binding, a direct done report and a revision, counted by state', () => {
    const states = reduceScenarioStates(['sc-001', 'sc-002', 'sc-003', 'sc-004'], [
      bound('sc-001'),
      reported('sc-002', 'done'),
      reported('sc-003', 'done'),
      bound('sc-003'),
      reported('sc-003', 'bound'),
    ]);
    expect([...states.entries()]).toEqual([['sc-001', 'bound'], ['sc-002', 'done'], ['sc-003', 'bound'], ['sc-004', 'pending']]);
    expect(countScenarioStates(states)).toEqual({ pending: 1, bound: 2, done: 1 });
  });

  test('no events leave every scenario pending', () => {
    expect(countScenarioStates(reduceScenarioStates(['sc-001', 'sc-002'], []))).toEqual({ pending: 2, bound: 0, done: 0 });
  });
});

describe('PB3-D06: the pending tag', () => {
  test('is carried only while a scenario is pending; it comes off at bound and at a direct done', () => {
    expect(scenarioStateSchema.options.filter(carriesPendingTag)).toEqual(['pending']);
  });
});

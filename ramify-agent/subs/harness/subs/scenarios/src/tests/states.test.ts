import { describe, expect, test } from 'vitest';
import {
  applyScenarioEvent,
  carriesPendingTag,
  countScenarioStates,
  initialScenarioStates,
  reduceScenarioStates,
  scenarioStateSchema,
  type ScenarioEvent,
  type ScenarioState,
} from '../states.js';

const declared = (scenario: string, state: 'bound' | 'declared'): ScenarioEvent => ({ type: 'scenario-declared', data: { scenario, by: 'inv-7', state } });
const due = (scenario: string): ScenarioEvent => ({ type: 'scenario-due', data: { scenario, cause: 'requirements-verified' } });
const implemented = (scenario: string): ScenarioEvent => ({ type: 'scenario-implemented', data: { scenario, gate: 'gate-3' } });
const withdrawn = (scenario: string): ScenarioEvent => ({ type: 'scenario-withdrawn', data: { scenario, reason: 'repair-exhausted', commit: 'abc123' } });

/** Every event kind, with the transitions the events table lists. */
const events: { name: string; event: ScenarioEvent; allowed: Partial<Record<ScenarioState, ScenarioState>> }[] = [
  { name: 'scenario-declared as bound', event: declared('sc-001', 'bound'), allowed: { pending: 'bound' } },
  { name: 'scenario-declared as declared', event: declared('sc-001', 'declared'), allowed: { pending: 'declared' } },
  { name: 'scenario-due', event: due('sc-001'), allowed: { bound: 'declared' } },
  { name: 'scenario-implemented', event: implemented('sc-001'), allowed: { declared: 'implemented' } },
  { name: 'scenario-withdrawn', event: withdrawn('sc-001'), allowed: { bound: 'pending', declared: 'pending' } },
];

describe('every transition of the events table, and no other', () => {
  for (const { name, event, allowed } of events) {
    for (const from of scenarioStateSchema.options) {
      const to = allowed[from];
      test(`${name} from ${from}: ${to === undefined ? 'rejected' : to}`, () => {
        const states = new Map([['sc-001', from], ['sc-002', 'pending' as ScenarioState]]);
        const result = applyScenarioEvent(states, event);
        if (to === undefined) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.reason).toContain(`sc-001 is ${from}`);
        } else {
          expect(result).toEqual({ ok: true, states: new Map([['sc-001', to], ['sc-002', 'pending']]) });
        }
        expect(states.get('sc-001')).toBe(from);
      });
    }
  }

  test('an event for an untracked scenario is rejected', () => {
    const result = applyScenarioEvent(initialScenarioStates(['sc-001']), implemented('sc-009'));
    expect(result).toEqual({ ok: false, reason: 'scenario-implemented names sc-009, which is no tracked scenario' });
  });
});

describe('reducing a run\'s events', () => {
  test('the provider order of architecture §8: bound, due, implemented; and a withdrawal back to pending', () => {
    const reduced = reduceScenarioStates(['sc-001', 'sc-002', 'sc-003'], [
      declared('sc-001', 'bound'),
      declared('sc-002', 'declared'),
      due('sc-001'),
      implemented('sc-001'),
      withdrawn('sc-002'),
    ]);
    if (!reduced.ok) throw new Error(reduced.reason);
    expect([...reduced.states]).toEqual([['sc-001', 'implemented'], ['sc-002', 'pending'], ['sc-003', 'pending']]);
    expect(countScenarioStates(reduced.states)).toEqual({ pending: 2, bound: 0, declared: 0, implemented: 1 });
  });

  test('the first event the table does not allow ends the reduction with its position', () => {
    const reduced = reduceScenarioStates(['sc-001'], [declared('sc-001', 'declared'), implemented('sc-001'), withdrawn('sc-001')]);
    expect(reduced).toEqual({ ok: false, event: 2, reason: 'scenario-withdrawn moves a scenario from bound or declared, but sc-001 is implemented' });
  });

  test('the pending tag marks exactly pending and bound', () => {
    expect(scenarioStateSchema.options.filter(carriesPendingTag)).toEqual(['pending', 'bound']);
  });
});

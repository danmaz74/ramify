import { z } from 'zod';
import type { ScenarioId } from './records.js';

/*
 * The three states of a tracked scenario, which are its obligation status.
 * Every scenario starts `pending` when the analysis is accepted. An
 * engineer's accepted binding makes it `bound`; its responsible architect's
 * accepted report makes it `done`, directly from `pending` too, and only
 * that architect's explicit revision returns it to `bound`. A binding of a
 * `done` scenario records the new fakes list and leaves it `done`.
 *
 * Each state is entered by one accepted submission. No gate, audit, repair
 * exit or source change moves one: passing is the audit's evidence about a
 * candidate commit, shown beside the state, never a state.
 */

export const scenarioStateSchema = z.enum(['pending', 'bound', 'done']);
export type ScenarioState = z.infer<typeof scenarioStateSchema>;

/**
 * The two accepted-submission events that move a state, as the reducer
 * reads them: the run event's type and the part of its data the reducer
 * needs. Both events name obligations of every kind; an ID that is no
 * tracked scenario leaves the states as they are.
 */
export type ScenarioEvent =
  | { readonly type: 'obligation-bound'; readonly data: { readonly id: string } }
  | { readonly type: 'obligation-reported'; readonly data: { readonly id: string; readonly judgment: 'done' | 'bound' } };

export const scenarioEventTypes: readonly ScenarioEvent['type'][] = ['obligation-bound', 'obligation-reported'];

export type ScenarioStates = ReadonlyMap<ScenarioId, ScenarioState>;

/** Every tracked scenario `pending`, as `analysis-accepted` leaves them. */
export function initialScenarioStates(ids: readonly ScenarioId[]): ScenarioStates {
  return new Map(ids.map((id) => [id, 'pending' as const]));
}

/** The state an accepted engineer binding leaves: `bound`, except that a `done` one stays `done`. */
export function boundState(current: ScenarioState): ScenarioState {
  return current === 'done' ? 'done' : 'bound';
}

/** The state an accepted architect report leaves: its judgment. */
export function reportedState(judgment: 'done' | 'bound'): ScenarioState {
  return judgment;
}

/** Applies one event. The given states are never changed, and an ID that is no tracked scenario changes nothing. */
export function applyScenarioEvent(states: ScenarioStates, event: ScenarioEvent): ScenarioStates {
  const current = states.get(event.data.id);
  if (current === undefined) return states;
  const next = new Map(states);
  next.set(event.data.id, event.type === 'obligation-bound' ? boundState(current) : reportedState(event.data.judgment));
  return next;
}

/** The states after a sequence of events, from every scenario `pending`. */
export function reduceScenarioStates(ids: readonly ScenarioId[], events: readonly ScenarioEvent[]): ScenarioStates {
  let states = initialScenarioStates(ids);
  for (const event of events) states = applyScenarioEvent(states, event);
  return states;
}

/** How many scenarios are in each state. */
export function countScenarioStates(states: ScenarioStates): Record<ScenarioState, number> {
  const counts: Record<ScenarioState, number> = { pending: 0, bound: 0, done: 0 };
  for (const state of states.values()) counts[state] += 1;
  return counts;
}

/**
 * Whether a scenario in this state carries the pending tag: only while
 * nothing has bound it. It comes off at `bound`, fakes or not, and at a
 * direct `done`, so the configured checks exercise it from the next
 * candidate commit on.
 */
export function carriesPendingTag(state: ScenarioState): boolean {
  return state === 'pending';
}

import { z } from 'zod';
import { scenarioIdSchema, type ScenarioId } from './records.js';

/*
 * The four states of a tracked scenario and the pure reducer that derives
 * them from the run's scenario events. Every scenario starts `pending` when
 * the analysis is accepted. The reducer allows exactly the transitions of
 * the architecture's events table and rejects every other one with its
 * reason; which transition a gate or a declaration calls for is the
 * harness's to decide.
 */

export const scenarioStateSchema = z.enum(['pending', 'bound', 'declared', 'implemented']);
export type ScenarioState = z.infer<typeof scenarioStateSchema>;

const text = z.string().min(1);

/** The data of each scenario event, as the run log carries it under `data`. */
export const scenarioDeclaredDataSchema = z.object({
  scenario: scenarioIdSchema,
  /** The invocation whose submission declared it. */
  by: text,
  state: z.enum(['bound', 'declared']),
}).strict();
export const scenarioDueDataSchema = z.object({
  scenario: scenarioIdSchema,
  cause: z.literal('requirements-verified'),
}).strict();
export const scenarioImplementedDataSchema = z.object({
  scenario: scenarioIdSchema,
  /** The gate attempt that passed it. */
  gate: text,
}).strict();
export const scenarioWithdrawnDataSchema = z.object({
  scenario: scenarioIdSchema,
  reason: text,
  /** The commit that restored its pending tag. */
  commit: text,
}).strict();

/** A scenario event as the reducer reads it: the run event's type and data. */
export type ScenarioEvent =
  | { readonly type: 'scenario-declared'; readonly data: z.infer<typeof scenarioDeclaredDataSchema> }
  | { readonly type: 'scenario-due'; readonly data: z.infer<typeof scenarioDueDataSchema> }
  | { readonly type: 'scenario-implemented'; readonly data: z.infer<typeof scenarioImplementedDataSchema> }
  | { readonly type: 'scenario-withdrawn'; readonly data: z.infer<typeof scenarioWithdrawnDataSchema> };

export const scenarioEventTypes: readonly ScenarioEvent['type'][] = ['scenario-declared', 'scenario-due', 'scenario-implemented', 'scenario-withdrawn'];

export type ScenarioStates = ReadonlyMap<ScenarioId, ScenarioState>;

export type ScenarioTransition =
  | { readonly ok: true; readonly states: ScenarioStates }
  | { readonly ok: false; readonly reason: string };

/** Every tracked scenario `pending`, as `analysis-accepted` leaves them. */
export function initialScenarioStates(ids: readonly ScenarioId[]): ScenarioStates {
  return new Map(ids.map((id) => [id, 'pending' as const]));
}

/** The states each event may leave from, and the state it leaves in. */
function transitionOf(event: ScenarioEvent): { from: readonly ScenarioState[]; to: ScenarioState } {
  switch (event.type) {
    case 'scenario-declared': return { from: ['pending'], to: event.data.state };
    case 'scenario-due': return { from: ['bound'], to: 'declared' };
    case 'scenario-implemented': return { from: ['declared'], to: 'implemented' };
    case 'scenario-withdrawn': return { from: ['bound', 'declared'], to: 'pending' };
  }
}

/** Applies one event, or says why the events table does not allow it. The given states are never changed. */
export function applyScenarioEvent(states: ScenarioStates, event: ScenarioEvent): ScenarioTransition {
  const id = event.data.scenario;
  const current = states.get(id);
  if (current === undefined) return { ok: false, reason: `${event.type} names ${id}, which is no tracked scenario` };
  const { from, to } = transitionOf(event);
  if (!from.includes(current)) {
    return { ok: false, reason: `${event.type} moves a scenario from ${from.join(' or ')}, but ${id} is ${current}` };
  }
  const next = new Map(states);
  next.set(id, to);
  return { ok: true, states: next };
}

/**
 * The states after a sequence of events, from every scenario `pending`. The
 * first event the table does not allow ends the reduction with its reason
 * and position.
 */
export function reduceScenarioStates(
  ids: readonly ScenarioId[],
  events: readonly ScenarioEvent[],
): { readonly ok: true; readonly states: ScenarioStates } | { readonly ok: false; readonly reason: string; readonly event: number } {
  let states = initialScenarioStates(ids);
  for (const [index, event] of events.entries()) {
    const applied = applyScenarioEvent(states, event);
    if (!applied.ok) return { ok: false, reason: applied.reason, event: index };
    states = applied.states;
  }
  return { ok: true, states };
}

/** How many scenarios are in each state. */
export function countScenarioStates(states: ScenarioStates): Record<ScenarioState, number> {
  const counts: Record<ScenarioState, number> = { pending: 0, bound: 0, declared: 0, implemented: 0 };
  for (const state of states.values()) counts[state] += 1;
  return counts;
}

/** Whether a scenario in this state carries the pending tag. */
export function carriesPendingTag(state: ScenarioState): boolean {
  return state === 'pending' || state === 'bound';
}

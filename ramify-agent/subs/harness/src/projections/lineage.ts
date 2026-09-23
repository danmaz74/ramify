import type { LineageInputs, SegmentFacts, StartKind } from '../kpi/lineage.js';
import type { Observation } from '../run/observations.js';
import type { ForkRelation, ReplaceRelation } from '../run/records.js';
import type { RunView } from './inputs.js';

/*
 * The inputs of the lineage measurements, read from a run's records: the
 * lineage relations of its log, each invocation's usage, and the first
 * context observation of each segment. Nothing here reads an executor's
 * ref. A segment's start is the one requested unless its `invocation-ended`
 * records it degraded; a segment whose outcome records no start at all
 * never ran or was interrupted, and its start is unknown.
 */

/** Each invocation's observation log, or why it cannot be read. */
export type ObservationLogs = ReadonlyMap<string, readonly Observation[] | { readonly unavailable: string }>;

/** The tokens of a segment's first context observation, or why they are unknown. */
function startContextOf(log: readonly Observation[] | { readonly unavailable: string } | undefined): SegmentFacts['startContext'] {
  if (log === undefined) return { unavailable: 'its observation log was not read' };
  if (!Array.isArray(log)) return { unavailable: (log as { unavailable: string }).unavailable };
  const lines = log as readonly Observation[];
  const first = lines.find((line): line is Extract<Observation, { type: 'context' }> => line.type === 'context');
  if (first === undefined) {
    const gap = lines.find(line => line.type === 'coverage-gap' && line.data.kind === 'context-unavailable') as Extract<Observation, { type: 'coverage-gap' }> | undefined;
    return { unavailable: gap === undefined ? 'it recorded no context observation' : `it recorded no context observation: ${gap.data.detail}` };
  }
  if (first.data.tokens === null) return { unavailable: 'its first context observation has no size' };
  return first.data.tokens;
}

/** The lineage measurements' inputs of a run. */
export function lineageInputsOf(view: RunView, logs: ObservationLogs): LineageInputs {
  const opened = new Map<string, { readonly fork: ForkRelation | null; readonly replaces: ReplaceRelation | null }>();
  const ends = new Map<string, Extract<RunView['events'][number], { type: 'invocation-ended' }>['data']>();
  const last = new Map<string, string>();
  const generations = new Set<number>();
  for (const event of view.events) {
    if (event.type === 'invocation-ended') ends.set(event.data.invocation, event.data);
    if (event.type === 'global-context-rebuilt') generations.add(event.data.generation);
    if (event.type === 'session-opened') {
      opened.set(event.data.session, { fork: event.data.fork ?? null, replaces: event.data.replaces ?? null });
      if (event.data.fork !== undefined) generations.add(event.data.fork.generation);
      // The initial architect's context is generation 1, forked or not.
      if (event.data.role === 'initial-architect') generations.add(1);
    }
  }

  const segments: SegmentFacts[] = [];
  for (const event of view.events) {
    if (event.type !== 'invocation-started') continue;
    const { invocation, session, continues } = event.data;
    const relation = opened.get(session);
    const previous = last.get(session) ?? null;
    last.set(session, invocation);
    const requested: StartKind = event.data.start === 'continued' ? 'continue' : relation?.fork ? 'fork' : 'fresh';
    const end = ends.get(invocation);
    const outcome = view.records.outcomes.get(invocation);
    const degraded = end?.degraded ?? null;
    const known = end !== undefined && outcome?.session !== undefined;
    const unknown = end === undefined
      ? 'it is still running'
      : outcome === undefined
        ? 'no outcome was recorded'
        : outcome.session === undefined
          ? `its outcome records no start: ${outcome.error ?? 'its session never ran'}`
          : null;
    segments.push({
      invocation,
      session,
      role: view.records.invocations.get(invocation)?.role ?? (event.data.role as SegmentFacts['role']),
      ended: end !== undefined,
      requested,
      actual: known ? (degraded?.actual ?? requested) : null,
      unknown,
      degraded,
      continues: continues?.reason ?? null,
      generation: requested === 'fork' ? relation!.fork!.generation : null,
      previous,
      startContext: startContextOf(logs.get(invocation)),
      usage: outcome === undefined
        ? { unavailable: 'no outcome was recorded' }
        : 'unavailable' in outcome.usage
          ? { unavailable: outcome.usage.unavailable }
          : { input: outcome.usage.input, cacheRead: outcome.usage.cacheRead, cacheWrite: outcome.usage.cacheWrite, output: outcome.usage.output },
    });
  }

  return {
    segments,
    sessions: [...opened].map(([id, relation]) => ({ id, replaces: relation.replaces })),
    generations: [...generations].sort((a, b) => a - b),
  };
}

/**
 * The model context each invocation ran in, where it is not its session's
 * first: from a continued start the executor made fresh, the session's
 * later invocations run in the context that start began, named by it.
 */
export function modelHistories(inputs: LineageInputs): ReadonlyMap<string, string> {
  const current = new Map<string, string>();
  const histories = new Map<string, string>();
  for (const segment of inputs.segments) {
    if (segment.requested === 'continue' && segment.actual === 'fresh') current.set(segment.session, `${segment.session} from ${segment.invocation}`);
    const history = current.get(segment.session);
    if (history !== undefined) histories.set(segment.invocation, history);
  }
  return histories;
}

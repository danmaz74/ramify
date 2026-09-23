import type { Hypothesis, RegistryEntry } from '../analysis/records.js';
import type { RunEvent, RunEventOf } from '../run/log.js';
import type { SessionId, SessionPoint } from '../run/records.js';
import type { PlacementDecision } from './records.js';

/*
 * The long-lived architect context of a run, and what is appended to it.
 *
 * The initial analysis session becomes that context. It is never invoked for
 * a decision: each request forks its latest point, and the brief of an
 * accepted decision is appended to it without inference. Any reorientation
 * happens under the next fork, and is recorded against that fork.
 *
 * The context is a projection, never a record: its generation, its session,
 * what has been appended and what is still pending are read from the run
 * log and from the committed invocation outcomes, so a run that has just
 * been recovered and one that never crashed answer the same thing.
 */

export interface GlobalContext {
  /** Rises when the parent is rebuilt from records. */
  readonly generation: number;
  /** The session that holds the parent, or null while this generation has none. */
  readonly session: string | null;
  /** The executor's point the parent's history has reached, or null while the run has none. */
  readonly ref: string | null;
  /** The same point as the harness names it, which a fork records; null exactly when `ref` is. */
  readonly point: SessionPoint | null;
  /** The session that held the generation before a rebuild, which this generation's parent replaces; null in generation 1. */
  readonly previous: SessionId | null;
  /** The decisions whose briefs this generation holds. */
  readonly appended: readonly string[];
  /** Accepted decisions whose briefs are not appended yet. A rebuild clears them. */
  readonly pending: readonly string[];
}

export interface ContextSource {
  readonly events: readonly RunEvent[];
  /** The point one invocation's session reached, from its committed outcome. */
  readonly sessionRef: (invocation: string) => string | undefined;
}

/**
 * The run's architect context as the log holds it. The parent of generation
 * 1 is the initial analysis session; after a rebuild it is the first fork
 * that followed, which was started fresh and oriented from the records.
 */
export function globalContext(source: ContextSource): GlobalContext {
  const events = source.events;
  const of = <T extends RunEvent['type']>(type: T): Array<RunEventOf<T>> =>
    events.filter((event): event is RunEventOf<T> => event.type === type);

  const rebuilds = of('global-context-rebuilt');
  const generation = rebuilds.length + 1;
  const since = rebuilds.at(-1)?.sequence ?? 0;

  const started = of('invocation-started');
  // The parent of one generation: the initial architect, or the first fork
  // started within that generation.
  const parentOf = (of: number) => {
    const from = of === 1 ? 0 : rebuilds[of - 2]!.sequence;
    const to = rebuilds[of - 1]?.sequence ?? Number.POSITIVE_INFINITY;
    return started.find(event => event.sequence > from && event.sequence < to
      && event.data.role === (of === 1 ? 'initial-architect' : 'global-fork'));
  };
  const parent = parentOf(generation);
  const base = parent === undefined ? undefined : source.sessionRef(parent.data.invocation);

  const appends = of('brief-appended').filter(event => event.sequence > since);
  const latest = appends.at(-1);
  const accepted = of('decision-accepted').filter(event => event.sequence > since);
  const appended = appends.map(event => event.data.decision);

  return {
    generation,
    session: parent?.data.session ?? null,
    ref: latest?.data.ref ?? base ?? null,
    point: latest !== undefined
      ? { session: latest.data.session, append: latest.sequence }
      : parent !== undefined && base !== undefined ? { session: parent.data.session, invocation: parent.data.invocation } : null,
    previous: generation === 1 ? null : parentOf(generation - 1)?.data.session ?? null,
    appended,
    pending: accepted.map(event => event.data.decision).filter(decision => !appended.includes(decision)),
  };
}

/**
 * The text one accepted decision appends to the parent context. It names the
 * decision and carries the fork's own brief unchanged: the fork wrote what
 * matters later, and the harness adds only the references it assigned.
 */
export function briefText(decision: PlacementDecision): string {
  return [
    `## Decision ${decision.id}${decision.request === null ? '' : ` (request ${decision.request})`}`,
    '',
    `Capability \`${decision.capability}\`: ${decision.outcome}, owner ${decision.owner === null ? 'none — it is satisfied outside this project' : `\`${decision.owner}\``}${decision.proposed === undefined ? '' : `, to be created at \`${decision.proposed.directory}\``}.${decision.changesExistingSymbols ? ' Implementing it changes symbols that already have consumers.' : ''}`,
    ...(decision.revises === undefined ? [] : [`It replaces ${decision.revises.decision}.`]),
    '',
    decision.brief ?? decision.rationale,
  ].join('\n');
}

/**
 * How a parent rebuilt from records is oriented: the hypotheses, the
 * registry and the decisions, which is what the briefs of a lost generation
 * held. It is text for the fork that becomes the new parent, never a model
 * call of its own.
 */
export function orientation(records: {
  readonly hypotheses: readonly Hypothesis[];
  readonly registry: readonly RegistryEntry[];
  readonly decisions: readonly PlacementDecision[];
}): string {
  const lines: string[] = [
    '# The architect context, rebuilt from the run\'s records',
    '',
    'The earlier architect context of this run can no longer be read, so it is',
    'rebuilt here from what the run committed. These records are the authority;',
    'no earlier conversation is.',
    '',
    '## Hypotheses',
    '',
  ];
  if (records.hypotheses.length === 0) lines.push('The initial analysis forecast none.');
  else for (const hypothesis of records.hypotheses) {
    lines.push(`- \`${hypothesis.id}\` (revision ${hypothesis.revision}, ${hypothesis.standing}): capability \`${hypothesis.capability}\`, change \`${hypothesis.change}\`, suggested owner \`${hypothesis.suggestedOwner}\`.${hypothesis.changesExistingSymbols ? ' It is forecast to change symbols that already have consumers.' : ''} ${hypothesis.rationale}`);
  }
  lines.push('', '## The capability registry', '');
  if (records.registry.length === 0) lines.push('It is empty.');
  else for (const entry of records.registry) {
    lines.push(`- \`${entry.capability}\` → \`${entry.owner}\` (revision ${entry.revision}, ${entry.origin}${entry.proposed === undefined ? '' : ', proposed'}): ${entry.behavior}`);
  }
  lines.push('', '## Decisions already made', '');
  if (records.decisions.length === 0) lines.push('None.');
  else for (const decision of records.decisions) lines.push(briefText(decision), '');
  return lines.join('\n');
}

import type { LineageMetric, Role } from '../interfaces/protocol/runs.js';
import { replaceReasonSchema, type ContinueReason, type DegradeRelation, type ReplaceRelation } from '../run/records.js';

/*
 * The lineage measurements, `lineage/1`: what forks, continuations and
 * repairs cost, how often starts degrade and sessions are replaced, and how
 * many forks each context generation serves. The metrics glossary defines
 * each one and `docs/metrics/lineage.md` states its calculation.
 *
 * Every segment is classified by the start its executor made, not the one
 * the harness asked for: a fork or a continuation the executor made fresh
 * inherited nothing, so it is measured as a fresh start and counted among
 * the degraded starts. A segment whose start is unknown, because its session
 * never ran or its harness stopped, stays in the group of the start that
 * was asked for, and every measurement of that group counts it as not
 * covered.
 *
 * The rules of the KPIs hold here too: a missing input is `unavailable`,
 * never zero, with the known subtotal and coverage beside it; a group with
 * no segment is `not-applicable`; usage categories stay separate.
 */

export const lineagePolicyVersion = 'lineage/1' as const;

/** How a segment starts: fresh, continuing its session, or forked from another. */
export type StartKind = 'fresh' | 'continue' | 'fork';

/** Tokens by category, as an outcome records them, or why there are none. */
export type SegmentUsage =
  | { readonly input: number; readonly cacheRead: number; readonly cacheWrite: number; readonly output: number }
  | { readonly unavailable: string };

/** What the lineage measurements know of one segment: one invocation of a session. */
export interface SegmentFacts {
  readonly invocation: string;
  readonly session: string;
  readonly role: Role;
  /** Whether the invocation has ended. A running segment is in no group yet. */
  readonly ended: boolean;
  /** The start the harness asked for. */
  readonly requested: StartKind;
  /** The start the executor made; null where it is unknown, with `unknown` saying why. */
  readonly actual: StartKind | null;
  readonly unknown: string | null;
  /** The executor's answer where it could not make the requested start. */
  readonly degraded: DegradeRelation | null;
  /** Why a continued segment continues; null for a first segment. */
  readonly continues: ContinueReason | null;
  /** The context generation a forked session's first segment forked from; null otherwise. */
  readonly generation: number | null;
  /** The segment before it in its session; null for a first segment. */
  readonly previous: string | null;
  /** The tokens of its first context observation, or why that is unknown. */
  readonly startContext: number | { readonly unavailable: string };
  readonly usage: SegmentUsage;
}

export interface LineageInputs {
  /** Every segment of the run, in the order the invocations started. */
  readonly segments: readonly SegmentFacts[];
  /** Every session of the run, with the session each one replaces. */
  readonly sessions: ReadonlyArray<{ readonly id: string; readonly replaces: ReplaceRelation | null }>;
  /** The context generations the run had, in order. */
  readonly generations: readonly number[];
}

type Body = Omit<LineageMetric, 'policyVersion' | 'measurementPolicy'>;

function measurement(body: Partial<Body> & Pick<Body, 'id' | 'unit' | 'state'>): LineageMetric {
  return {
    policyVersion: lineagePolicyVersion,
    measurementPolicy: null,
    value: null,
    numerator: null,
    denominator: null,
    subtotal: null,
    coverage: null,
    evidence: [],
    note: null,
    ...body,
  };
}

/** The start a segment is grouped by: the one it made, or the one asked for where that is unknown. */
const startOf = (segment: SegmentFacts): StartKind => segment.actual ?? segment.requested;

/** One figure of a segment, or why it is unknown. */
type Figure = number | { readonly unavailable: string };

/** The measures of a segment's cost profile, each read from its first context observation or its usage. */
const measures: ReadonlyArray<readonly [string, (segment: SegmentFacts) => Figure]> = [
  ['start-context', segment => segment.startContext],
  ...([['input', 'input'], ['cache-read', 'cacheRead'], ['cache-write', 'cacheWrite'], ['output', 'output']] as const).map(([name, key]) => [
    name,
    (segment: SegmentFacts): Figure => ('unavailable' in segment.usage ? { unavailable: segment.usage.unavailable } : segment.usage[key]),
  ] as const),
];

/** A figure, or why it is missing: an unknown start makes every figure of the segment unknown. */
function figureOf(segment: SegmentFacts, read: (segment: SegmentFacts) => Figure): Figure {
  if (segment.actual === null) return { unavailable: `its start is unknown: ${segment.unknown ?? 'it was not recorded'}` };
  return read(segment);
}

/** The mean of one figure over a group of segments: unavailable as soon as one segment lacks it. */
function mean(id: string, unit: string, group: readonly SegmentFacts[], read: (segment: SegmentFacts) => Figure, empty: string): LineageMetric {
  if (group.length === 0) return measurement({ id, unit, state: 'not-applicable', coverage: { covered: 0, total: 0 }, note: empty });
  let sum = 0;
  const known: string[] = [];
  const missing: string[] = [];
  for (const segment of group) {
    const figure = figureOf(segment, read);
    if (typeof figure === 'number') {
      sum += figure;
      known.push(`${segment.invocation} (${segment.session}): ${figure}`);
    } else {
      missing.push(`${segment.invocation} (${segment.session}): ${figure.unavailable}`);
    }
  }
  const coverage = { covered: known.length, total: group.length };
  if (missing.length > 0) {
    return measurement({
      id, unit, state: 'unavailable', subtotal: known.length > 0 ? sum : null, coverage, evidence: [...missing, ...known],
      note: 'A segment lacks this input, so the mean is unknown; the known subtotal is shown',
    });
  }
  return measurement({ id, unit, state: 'measured', value: sum / group.length, numerator: sum, denominator: group.length, coverage, evidence: known });
}

/** The cost profile of a group: its start context and each usage category, per segment. */
function profile(prefix: string, group: readonly SegmentFacts[], empty: string): LineageMetric[] {
  return measures.map(([name, read]) => mean(`${prefix}.${name}`, 'tokens per segment', group, read, empty));
}

const ended = (inputs: LineageInputs) => inputs.segments.filter(segment => segment.ended);

/**
 * A fork's inherited context and cost by the generation it forked, beside
 * the global forks that started fresh: after a rebuild, or where the
 * executor could not fork.
 */
function forkCost(inputs: LineageInputs): LineageMetric[] {
  const segments = ended(inputs);
  const byGeneration = inputs.generations.flatMap(generation => profile(
    `fork.generation-${generation}`,
    segments.filter(segment => startOf(segment) === 'fork' && segment.generation === generation),
    `No fork of generation ${generation} ended`,
  ));
  const fresh = profile(
    'fresh-fork',
    segments.filter(segment => segment.role === 'global-fork' && startOf(segment) === 'fresh'),
    'No global fork started fresh',
  );
  return [...byGeneration, ...fresh];
}

/** Each continued segment's start context less its previous segment's, per continuation. */
function continuationGrowth(inputs: LineageInputs): LineageMetric {
  const id = 'continuation-growth';
  const unit = 'tokens per continuation';
  const byInvocation = new Map(inputs.segments.map(segment => [segment.invocation, segment]));
  const group = ended(inputs).filter(segment => startOf(segment) === 'continue');
  return mean(id, unit, group, segment => {
    const previous = segment.previous === null ? undefined : byInvocation.get(segment.previous);
    if (previous === undefined) return { unavailable: 'it has no previous segment' };
    if (typeof segment.startContext !== 'number') return segment.startContext;
    if (typeof previous.startContext !== 'number') return { unavailable: `its previous segment ${previous.invocation}: ${previous.startContext.unavailable}` };
    return segment.startContext - previous.startContext;
  }, 'No continued segment ended');
}

/** Repair segments' cost, beside engineer segments that started fresh. */
function repairCost(inputs: LineageInputs): LineageMetric[] {
  const segments = ended(inputs);
  return [
    ...profile('repair', segments.filter(segment => startOf(segment) === 'continue' && segment.continues === 'repair'), 'No segment continued for a repair ended'),
    ...profile('fresh-engineer', segments.filter(segment => segment.role === 'engineer' && startOf(segment) === 'fresh'), 'No engineer segment started fresh'),
  ];
}

/** Degraded starts per requested continuation or fork, with the executor's reasons as evidence. */
function degradedStarts(id: string, inputs: LineageInputs, kinds: readonly StartKind[]): LineageMetric {
  const unit = 'degraded starts per requested start';
  const requests = ended(inputs).filter(segment => kinds.includes(segment.requested));
  if (requests.length === 0) return measurement({ id, unit, state: 'not-applicable', coverage: { covered: 0, total: 0 }, note: `No ${kinds.join(' or ')} was requested` });
  const known = requests.filter(segment => segment.actual !== null);
  const degraded = known.filter(segment => segment.degraded !== null);
  const reasons = new Map<string, string[]>();
  for (const segment of degraded) {
    const relation = segment.degraded!;
    const key = `${relation.requested} made ${relation.actual}: ${relation.reason ?? 'the executor gave no reason'}`;
    reasons.set(key, [...(reasons.get(key) ?? []), segment.invocation]);
  }
  const evidence = [
    ...[...reasons].map(([reason, list]) => `${reason} (${list.join(', ')})`),
    ...requests.filter(segment => segment.actual === null).map(segment => `${segment.invocation}: its start is unknown: ${segment.unknown ?? 'it was not recorded'}`),
  ];
  const coverage = { covered: known.length, total: requests.length };
  if (known.length === 0) return measurement({ id, unit, state: 'unavailable', coverage, evidence, note: 'No requested start is known to have been made or degraded' });
  if (known.length < requests.length) {
    return measurement({
      id, unit, state: 'partial', numerator: degraded.length, denominator: known.length, coverage, evidence,
      note: `Counted over ${known.length} of ${requests.length} requested starts whose start is known`,
    });
  }
  return measurement({ id, unit, state: 'measured', value: degraded.length / known.length, numerator: degraded.length, denominator: known.length, coverage, evidence });
}

/** Sessions opened in place of another, by reason, per session of the run. */
function replacements(inputs: LineageInputs): LineageMetric[] {
  return replaceReasonSchema.options.map(reason => {
    const id = `replacements.${reason}`;
    const unit = 'replacements per session';
    const replacing = inputs.sessions.filter(session => session.replaces?.reason === reason);
    const evidence = replacing.map(session => `${session.id} in place of ${session.replaces!.session}`);
    const total = inputs.sessions.length;
    if (total === 0) return measurement({ id, unit, state: 'not-applicable', denominator: 0, note: 'No session was opened' });
    return measurement({ id, unit, state: 'measured', value: replacing.length / total, numerator: replacing.length, denominator: total, coverage: { covered: total, total }, evidence });
  });
}

/** The forks each context generation served: ended forks of it the executor made, a degraded one excluded. */
function forksServed(inputs: LineageInputs): LineageMetric[] {
  return inputs.generations.map(generation => {
    const id = `forks-served.generation-${generation}`;
    const unit = 'forks';
    const requested = ended(inputs).filter(segment => segment.requested === 'fork' && segment.generation === generation);
    const served = requested.filter(segment => segment.actual === 'fork');
    const unknown = requested.filter(segment => segment.actual === null);
    const evidence = [
      ...served.map(segment => `${segment.session} (${segment.invocation})`),
      ...requested.filter(segment => segment.actual !== null && segment.actual !== 'fork').map(segment => `${segment.session} (${segment.invocation}) asked for a fork and started ${segment.actual}`),
      ...unknown.map(segment => `${segment.session} (${segment.invocation}): its start is unknown: ${segment.unknown ?? 'it was not recorded'}`),
    ];
    const coverage = { covered: requested.length - unknown.length, total: requested.length };
    if (unknown.length > 0) {
      return measurement({ id, unit, state: 'partial', numerator: served.length, coverage, evidence, note: `Counted over ${coverage.covered} of ${coverage.total} forks of this generation whose start is known` });
    }
    return measurement({ id, unit, state: 'measured', value: served.length, numerator: served.length, coverage, evidence });
  });
}

/** Every lineage measurement of a run, in the order of the glossary. */
export function lineageMetrics(inputs: LineageInputs): LineageMetric[] {
  return [
    ...forkCost(inputs),
    continuationGrowth(inputs),
    ...repairCost(inputs),
    degradedStarts('degraded-starts', inputs, ['continue', 'fork']),
    degradedStarts('degraded-starts.continue', inputs, ['continue']),
    degradedStarts('degraded-starts.fork', inputs, ['fork']),
    ...replacements(inputs),
    ...forksServed(inputs),
  ];
}

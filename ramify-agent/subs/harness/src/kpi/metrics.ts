import type { Metric } from '../interfaces/protocol/runs.js';
import type { Role } from '../interfaces/protocol/runs.js';
import { rawOutputGapKinds, type Observation } from '../run/observations.js';
import type { InvocationOutcome, LineEventSummary, ScopeSize } from '../run/records.js';
import { roles } from '../run/records.js';
import { projectOnlySize, scopeSizePolicy } from './capture.js';
import type { DeliveredChange } from './delivered.js';

/*
 * The KPI projection, `kpi/1`. Every metric is computed here from what the
 * earlier iterations captured when it was observed; nothing is measured,
 * estimated or added here, and nothing is written.
 *
 * The rules every metric obeys:
 *
 *   - a missing observation is `unavailable`, never zero, with the known
 *     subtotal and the coverage beside it;
 *   - a zero denominator is `not-applicable`;
 *   - a whole-run ratio over partial coverage is `partial`: the covered
 *     numerator, denominator and change weight are shown, and no value is;
 *   - input, cache-read, cache-write and output tokens stay separate, and no
 *     usage is converted to a price.
 *
 * The measurement policy of the sizes, `scope-size/2`, is versioned apart
 * from this projection and travels with every metric that reads a size. A
 * size taken under another policy is refused, never mixed with it.
 */

export const kpiPolicyVersion = 'kpi/1' as const;
export const measurementPolicyVersion = scopeSizePolicy;

/** What the KPIs know of one invocation, read from its records and its observation log. */
export interface InvocationFacts {
  readonly id: string;
  readonly role: Role;
  readonly workItem: string | null;
  readonly iteration: string | null;
  readonly request: string | null;
  readonly writer: boolean;
  /** The harness session this invocation belongs to, which each invocation of a continued session shares. */
  readonly session: string;
  /**
   * The model context it ran in, where that is not its session's first:
   * a continued start the executor made fresh begins another within the
   * same session. Absent means the session's own.
   */
  readonly history?: string | undefined;
  /** Null while the invocation has not ended. */
  readonly outcome: Pick<InvocationOutcome, 'ended' | 'usage' | 'outsideScope'> | null;
  /** `S_s` as captured when the invocation started; null when none was taken. */
  readonly size: ScopeSize | null;
  /** A writer's line events, or why they cannot be read; null for an invocation that held no writer. */
  readonly lines: LineEventSummary | { readonly unavailable: string } | null;
  /** The observation log, or why it cannot be read. */
  readonly observations: readonly Observation[] | { readonly unavailable: string };
  /** The recorded adaptation that caused this invocation, or null. */
  readonly adaptation: string | null;
}

export interface MetricInputs {
  /** The frozen baseline `B`, or why the producer gave none. */
  readonly baseline: { readonly bytes: number; readonly snapshot: string } | { readonly unavailable: string };
  readonly invocations: readonly InvocationFacts[];
  /** The run's delivered change, which gives each writer its change weight `w_e`. */
  readonly delivered: DeliveredChange;
  /** Every committed gate attempt. */
  readonly gateAttempts: readonly string[];
  /** Every accepted iteration result. */
  readonly acceptedIterations: readonly string[];
}

type MetricBody = Omit<Metric, 'policyVersion'>;

function metric(body: Partial<MetricBody> & Pick<MetricBody, 'id' | 'unit' | 'state'>): Metric {
  return {
    policyVersion: kpiPolicyVersion,
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

/** A ratio whose inputs are all known: `not-applicable` for a zero denominator. */
function ratio(id: string, unit: string, numerator: number, denominator: number, extra: Partial<MetricBody> = {}): Metric {
  if (denominator === 0) return metric({ id, unit, state: 'not-applicable', numerator, denominator, note: 'The denominator is zero', ...extra });
  return metric({ id, unit, state: 'measured', value: numerator / denominator, numerator, denominator, ...extra });
}

/** A count over every invocation, which a missing observation log makes partial. */
function observedCount(id: string, unit: string, count: number, covered: number, total: number, extra: Partial<MetricBody> = {}): Metric {
  if (total === 0) return metric({ id, unit, state: 'not-applicable', coverage: { covered, total }, note: 'No invocation of this kind ran', ...extra });
  if (covered === 0) {
    return metric({ id, unit, state: 'unavailable', coverage: { covered, total }, note: 'No observation log of these invocations could be read', ...extra });
  }
  if (covered < total) {
    return metric({ id, unit, state: 'partial', numerator: count, coverage: { covered, total }, note: `Counted over ${covered} of ${total} invocations whose observation log could be read`, ...extra });
  }
  return metric({ id, unit, state: 'measured', value: count, numerator: count, coverage: { covered, total }, ...extra });
}

const readable = (facts: InvocationFacts): readonly Observation[] | null => (Array.isArray(facts.observations) ? facts.observations as readonly Observation[] : null);

/** Why a size cannot stand for `S_e`, or null where it can. */
function sizeGap(size: ScopeSize | null): string | null {
  if (size === null) return 'no scope size was captured';
  if (size.policy !== measurementPolicyVersion) return `its size was taken under ${size.policy}, which is not comparable with ${measurementPolicyVersion}`;
  if (size.bytes !== null) return null;
  return size.components.filter(component => component.state !== 'measured')
    .map(component => `${component.component} ${component.state}${component.reason === undefined ? '' : `: ${component.reason}`}`).join('; ');
}

const lines = (count: number): string => `${Number.isInteger(count) ? count : count.toFixed(2)} lines`;

/**
 * `sum(w_e * S_e) / sum(w_e)` over the writers: the change-weighted mean of
 * the declared scope bytes, in bytes. `w_e` is each writer's share of the
 * delivered change, the run base to its last accepted commit, so a line is
 * counted once in its delivered form (docs/measurements-and-kpis.md,
 * "Changed lines"). A writer that delivered lines and whose scope size is
 * unknown makes the metric unavailable; delivered lines no writer can be
 * named for make it partial. Either state shows the subtotal and the change
 * weight it covers, and no value.
 */
function bytesPerChangedLine(inputs: MetricInputs): Metric {
  const id = 'scope-bytes-per-changed-line';
  const unit = 'bytes (change-weighted mean)';
  const writers = inputs.invocations.filter(facts => facts.writer && facts.outcome !== null);
  const common = { measurementPolicy: measurementPolicyVersion };
  const delivered = inputs.delivered;
  if (delivered.state === 'not-applicable') {
    return metric({ id, unit, state: 'not-applicable', numerator: 0, denominator: 0, coverage: { covered: writers.length, total: writers.length }, note: `${delivered.reason}, so no line was delivered`, ...common });
  }
  if (delivered.state === 'unavailable') {
    return metric({ id, unit, state: 'unavailable', coverage: { covered: 0, total: writers.length }, evidence: [delivered.reason], note: 'The delivered change is unknown, so no writer has a change weight', ...common });
  }

  let numerator = 0;
  let partialSubtotal = 0;
  let hasPartialSubtotal = false;
  let known = 0;
  let total = 0;
  let covered = 0;
  const evidence: string[] = [`delivered change ${delivered.base.slice(0, 12)}..${delivered.final.slice(0, 12)}`];
  const unknownSize: string[] = [];
  const byId = new Map(inputs.invocations.map(facts => [facts.id, facts]));
  const weighted = new Set(delivered.weights.keys());
  for (const facts of writers) if (!weighted.has(facts.id)) { covered += 1; evidence.push(`${facts.id}: w_e = 0, it delivered no line`); }
  for (const [invocation, weight] of delivered.weights) {
    total += weight;
    const size = byId.get(invocation)?.size ?? null;
    const gap = sizeGap(size) ?? (!('unavailable' in inputs.baseline) && size!.snapshot !== inputs.baseline.snapshot ? 'scope snapshot differs from the frozen baseline snapshot' : null);
    if (gap !== null) {
      unknownSize.push(`${invocation}: w_e = ${lines(weight)}, S_e unknown: ${gap}`);
      if (size !== null && size.policy === measurementPolicyVersion && size.bytes === null && ('unavailable' in inputs.baseline || size.snapshot === inputs.baseline.snapshot)) {
        hasPartialSubtotal = true;
        partialSubtotal += weight * size.subtotal;
        evidence.push(`${invocation}: known scope subtotal ${size.subtotal} bytes contributes ${weight * size.subtotal} byte-lines; weight ${lines(weight)} has incomplete size`);
      }
      continue;
    }
    const bytes = byId.get(invocation)!.size!.bytes!;
    covered += 1;
    known += weight;
    numerator += weight * bytes;
    evidence.push(`${invocation}: w_e = ${lines(weight)}, S_e = ${bytes} bytes`);
  }
  const unattributed = [...delivered.unattributed].reduce((sum, [, count]) => sum + count, 0);
  for (const [reason, count] of delivered.unattributed) evidence.push(`unattributed: ${lines(count)}: ${reason}`);
  if (delivered.harness > 0) evidence.push(`harness: ${lines(delivered.harness)} the harness delivered, which no writer is weighted by`);
  if (delivered.binaryPaths.length > 0) evidence.push(`binary, without line weight: ${delivered.binaryPaths.join(', ')}`);
  const coverage = { covered, total: Math.max(writers.length, covered + unknownSize.length) };

  if (unknownSize.length > 0) {
    // Partial known byte-line contributions survive; the denominator is
    // complete-size weight only. No whole-run mean is reported.
    return metric({
      id, unit, state: 'unavailable', subtotal: known > 0 || hasPartialSubtotal ? numerator + partialSubtotal : null, denominator: known > 0 ? known : null, coverage,
      evidence: [...unknownSize, ...evidence],
      note: `A writer's scope size is unknown, so the total is unknown. The subtotal retains known byte-line contributions including partial sizes, and the denominator covers complete sizes only: their ${lines(known)} of the ${lines(total + unattributed)} delivered`,
      ...common,
    });
  }
  if (unattributed > 0) {
    return metric({
      id, unit, state: 'partial', numerator, denominator: known, coverage, evidence,
      note: `Refused as a whole-run ratio: ${lines(unattributed)} of the ${lines(total + unattributed)} delivered are attributed to no writer. The numerator and denominator are the attributed writers' alone`,
      ...common,
    });
  }
  if (total === 0) {
    return metric({ id, unit, state: 'not-applicable', numerator: 0, denominator: 0, coverage, evidence, note: 'sum(w_e) = 0: no writer delivered a text line', ...common });
  }
  return metric({ id, unit, state: 'measured', value: numerator / total, numerator, denominator: total, coverage, evidence, ...common });
}

/** A metric that divides another by `B`: it inherits every state but `measured`. */
function overBaseline(id: string, unit: string, source: Metric, inputs: MetricInputs, invert = false): Metric {
  const common = { measurementPolicy: measurementPolicyVersion, coverage: source.coverage };
  if ('unavailable' in inputs.baseline) {
    return metric({ id, unit, state: 'unavailable', subtotal: source.value ?? source.subtotal, evidence: [`baseline: ${inputs.baseline.unavailable}`, ...source.evidence], note: 'The frozen baseline B is unavailable', ...common });
  }
  if (source.state !== 'measured') {
    return metric({ id, unit, state: source.state, numerator: source.numerator, denominator: source.denominator, subtotal: source.subtotal, evidence: source.evidence, note: `As ${source.id}: ${source.note ?? source.state}`, ...common });
  }
  const B = inputs.baseline.bytes;
  if (B === 0) return metric({ id, unit, state: 'not-applicable', denominator: 0, note: 'The frozen baseline B is zero bytes', ...common });
  const value = source.value! / B;
  if (!invert) return metric({ id, unit, state: 'measured', value, numerator: source.value, denominator: B, evidence: [`baseline ${inputs.baseline.snapshot}`], ...common });
  if (value <= 0) return metric({ id, unit, state: 'not-applicable', note: 'The ratio is not positive, so it has no inverse', ...common });
  return metric({ id, unit, state: 'measured', value: 1 / value, numerator: 1, denominator: value, evidence: [`baseline ${inputs.baseline.snapshot}`], ...common });
}

/** The distinct sessions, each with the invocations that ran in it. */
function sessionsOf(inputs: MetricInputs): Map<string, InvocationFacts[]> {
  const sessions = new Map<string, InvocationFacts[]>();
  for (const facts of inputs.invocations) sessions.set(facts.session, [...(sessions.get(facts.session) ?? []), facts]);
  return sessions;
}

/**
 * The model contexts: each session's invocations, split where a continued
 * start the executor made fresh began another context.
 */
function historiesOf(inputs: MetricInputs): Map<string, InvocationFacts[]> {
  const histories = new Map<string, InvocationFacts[]>();
  for (const facts of inputs.invocations) {
    const key = facts.history ?? facts.session;
    histories.set(key, [...(histories.get(key) ?? []), facts]);
  }
  return histories;
}

/**
 * `sum(S_s / B)` over every session, a continued session counting each
 * component once at the largest value it was observed at. A continued
 * start the executor made fresh loaded its scope into a new context, so
 * from there on its session counts again as a term of its own.
 */
function sessionWeightedTotal(inputs: MetricInputs): Metric {
  const id = 'session-weighted-total';
  const unit = 'baselines';
  const common = { measurementPolicy: measurementPolicyVersion };
  const sessions = historiesOf(inputs);
  let total = 0;
  const missing: string[] = [];
  let covered = 0;
  let hasKnownSize = false;
  for (const [session, list] of sessions) {
    const largest = new Map<string, number>();
    const unavailable = new Set<string>();
    for (const facts of list) {
      if (facts.size === null || facts.size.policy !== measurementPolicyVersion || (!('unavailable' in inputs.baseline) && facts.size.snapshot !== inputs.baseline.snapshot)) {
        unavailable.add(facts.size === null ? 'scope' : facts.size.policy !== measurementPolicyVersion ? `${facts.size.policy} scope` : `incompatible snapshot ${facts.size.snapshot}`);
        continue;
      }
      hasKnownSize = true;
      for (const component of facts.size.components) {
        const known = largest.get(component.component);
        if (component.bytes === null || component.state !== 'measured') unavailable.add(component.component);
        const subtotal = component.bytes ?? Object.values(component.buckets ?? {}).reduce((sum, bytes) => sum + bytes, 0);
        largest.set(component.component, Math.max(known ?? 0, subtotal));
      }
    }
    const unknown = [...unavailable];
    total += [...largest.values()].reduce<number>((sum, bytes) => sum + bytes, 0);
    if (unknown.length > 0) {
      missing.push(`${session}: ${unknown.join(', ')} unavailable`);
      continue;
    }
    covered += 1;

  }
  const coverage = { covered, total: sessions.size };
  // The contexts a degraded continuation began, each a term beside its session's first.
  const restarted = [...sessions].filter(([key, list]) => key !== list[0]!.session).map(([key]) => `${key}: a continued start the executor made fresh counts as a term of its own`);
  if (sessions.size === 0) return metric({ id, unit, state: 'not-applicable', coverage, note: 'No session ran', ...common });
  if (missing.length > 0) {
    return metric({ id, unit, state: 'unavailable', subtotal: hasKnownSize ? total : null, coverage, evidence: [...missing, ...restarted], note: 'A session\'s scope size is missing a component, so the total is unknown; the known subtotal in bytes is shown', ...common });
  }
  if ('unavailable' in inputs.baseline) {
    return metric({ id, unit, state: 'unavailable', subtotal: total, coverage, evidence: [`baseline: ${inputs.baseline.unavailable}`, ...restarted], note: 'The frozen baseline B is unavailable; the sum of S_s in bytes is shown', ...common });
  }
  if (inputs.baseline.bytes === 0) return metric({ id, unit, state: 'not-applicable', numerator: total, denominator: 0, coverage, note: 'The frozen baseline B is zero bytes', ...common });
  return metric({ id, unit, state: 'measured', value: total / inputs.baseline.bytes, numerator: total, denominator: inputs.baseline.bytes, coverage, evidence: restarted, ...common });
}

const categories = [
  ['input', 'input'],
  ['cache-read', 'cacheRead'],
  ['cache-write', 'cacheWrite'],
  ['output', 'output'],
] as const;

/** Usage by category over a set of invocations: unavailable as soon as one did not report it. */
function usageTotals(list: readonly InvocationFacts[]) {
  const totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const unavailable: string[] = [];
  let covered = 0;
  for (const facts of list) {
    if (facts.outcome === null) continue;
    if ('unavailable' in facts.outcome.usage) {
      unavailable.push(`${facts.id}: ${facts.outcome.usage.unavailable}`);
      continue;
    }
    covered += 1;
    totals.input += facts.outcome.usage.input;
    totals.cacheRead += facts.outcome.usage.cacheRead;
    totals.cacheWrite += facts.outcome.usage.cacheWrite;
    totals.output += facts.outcome.usage.output;
  }
  return { totals, unavailable, covered, total: list.filter(facts => facts.outcome !== null).length };
}

function usageMetrics(inputs: MetricInputs): Metric[] {
  const all = usageTotals(inputs.invocations);
  return categories.map(([name, key]) => {
    const id = `usage-tokens.${name}`;
    const coverage = { covered: all.covered, total: all.total };
    if (all.unavailable.length > 0) {
      return metric({ id, unit: 'tokens', state: 'unavailable', subtotal: all.covered > 0 ? all.totals[key] : null, coverage, evidence: all.unavailable, note: 'A session did not report its usage; the known subtotal is shown' });
    }
    return metric({ id, unit: 'tokens', state: 'measured', value: all.totals[key], numerator: all.totals[key], coverage });
  });
}

function adaptationMetrics(inputs: MetricInputs): Metric[] {
  const sessions = sessionsOf(inputs);
  const adapted = [...sessions].filter(([, list]) => list.some(facts => facts.adaptation !== null));
  const evidence = adapted.map(([session, list]) => `${session}: ${list.filter(facts => facts.adaptation !== null).map(facts => `${facts.id} (${facts.adaptation})`).join(', ')}`);
  const share = ratio('adaptation-session-share', 'sessions per session', adapted.length, sessions.size, { evidence, coverage: { covered: sessions.size, total: sessions.size } });

  const adaptedInvocations = adapted.flatMap(([, list]) => list);
  const all = usageTotals(inputs.invocations);
  const part = usageTotals(adaptedInvocations);
  const usage = categories.map(([name, key]) => {
    const id = `adaptation-usage-share.${name}`;
    const coverage = { covered: all.covered, total: all.total };
    if (all.unavailable.length > 0) {
      return metric({ id, unit: `${name} tokens per ${name} token`, state: 'unavailable', subtotal: part.covered > 0 ? part.totals[key] : null, coverage, evidence: all.unavailable, note: 'A session did not report its usage, so the share is unknown' });
    }
    return ratio(id, `${name} tokens per ${name} token`, part.totals[key], all.totals[key], { coverage, evidence });
  });
  return [share, ...usage];
}

function byRole(inputs: MetricInputs): Metric[] {
  const metrics: Metric[] = [];
  for (const role of roles) {
    const list = inputs.invocations.filter(facts => facts.role === role);
    const logs = list.map(readable).filter((log): log is readonly Observation[] => log !== null);
    const compactions = logs.reduce((total, log) => total + log.filter(line => line.type === 'compaction').length, 0);
    metrics.push(observedCount(`compactions.${role}`, 'compactions', compactions, logs.length, list.length, {
      evidence: list.filter(facts => readable(facts) === null).map(facts => `${facts.id}: ${(facts.observations as { unavailable: string }).unavailable}`),
    }));
    const ended = list.filter(facts => facts.outcome !== null);
    const returned = ended.filter(facts => facts.outcome!.ended === 'context-budget-reached');
    metrics.push(ratio(`budget-return-rate.${role}`, 'returns per invocation', returned.length, ended.length, { evidence: returned.map(facts => facts.id), coverage: { covered: ended.length, total: list.length } }));
  }
  return metrics;
}

/** Budget returns beyond the first for one work item or one placement request. */
function repeatedBudgetReturns(inputs: MetricInputs): Metric {
  const byWork = new Map<string, string[]>();
  for (const facts of inputs.invocations) {
    if (facts.outcome?.ended !== 'context-budget-reached') continue;
    const work = facts.request ?? facts.workItem ?? facts.id;
    byWork.set(work, [...(byWork.get(work) ?? []), facts.id]);
  }
  const repeated = [...byWork].reduce((total, [, list]) => total + Math.max(0, list.length - 1), 0);
  return metric({
    id: 'repeated-budget-returns', unit: 'returns', state: 'measured', value: repeated, numerator: repeated,
    evidence: [...byWork].filter(([, list]) => list.length > 1).map(([work, list]) => `${work}: ${list.join(', ')}`),
  });
}

/**
 * Blocked `edit`/`write` calls beside the guarded calls they are counted
 * among, by role, tool and verdict. While an unguarded tool mutated, the
 * count is partial and the statement says why zero blocked calls prove
 * nothing about scope.
 */
function blockedWrites(inputs: MetricInputs, statement: string, complete: boolean): Metric[] {
  const writers = inputs.invocations.filter(facts => facts.writer);
  const logs = writers.map(readable).filter((log): log is readonly Observation[] => log !== null);
  const guards = logs.flatMap(log => log.filter((line): line is Extract<Observation, { type: 'guard' }> => line.type === 'guard'));
  const blocked = guards.filter(line => line.data.verdict !== 'allowed');
  const breakdown = new Map<string, number>();
  for (const facts of writers) {
    const log = readable(facts);
    if (log === null) continue;
    for (const line of log) {
      if (line.type !== 'guard' || line.data.verdict === 'allowed') continue;
      const key = `${facts.role} ${line.data.tool} ${line.data.verdict}`;
      breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
    }
  }
  const evidence = [...breakdown].map(([key, total]) => `${key}: ${total}`);
  const coverage = { covered: logs.length, total: writers.length };
  const id = 'blocked-write-attempts';
  const unit = 'blocked calls per guarded call';
  const overall = !complete
    ? metric({ id, unit, state: 'partial', numerator: blocked.length, denominator: guards.length, coverage, evidence, note: statement })
    : logs.length < writers.length
      ? metric({ id, unit, state: 'partial', numerator: blocked.length, denominator: guards.length, coverage, evidence, note: `${statement} Counted over ${logs.length} of ${writers.length} writer invocations whose observation log could be read.` })
      : guards.length === 0
        ? metric({ id, unit, state: 'not-applicable', numerator: 0, denominator: 0, coverage, note: `No guarded call was made. ${statement}` })
        : metric({ id, unit, state: 'measured', value: blocked.length / guards.length, numerator: blocked.length, denominator: guards.length, coverage, evidence, note: statement });
  return [overall];
}

/** A gap in an invocation's observations; a raw-output gap is not one. */
function isObservationGap(line: Observation): line is Extract<Observation, { type: 'coverage-gap' }> {
  return line.type === 'coverage-gap' && !rawOutputGapKinds.has(line.data.kind);
}

/**
 * `coverage-gap` observations by kind, beside the invocations they qualify.
 * A raw-output gap, such as a transcript entry that could not be written,
 * leaves the observations complete and is left out of both.
 */
function observationCoverage(inputs: MetricInputs): Metric[] {
  const logs = inputs.invocations.map(facts => ({ facts, log: readable(facts) }));
  const read = logs.filter(entry => entry.log !== null);
  const withGap = read.filter(entry => entry.log!.some(isObservationGap));
  const unreadable = logs.filter(entry => entry.log === null).map(entry => `${entry.facts.id}: ${(entry.facts.observations as { unavailable: string }).unavailable}`);
  const total = inputs.invocations.length;
  const covered = read.length - withGap.length;
  const overall = total === 0
    ? metric({ id: 'observation-coverage', unit: 'invocations without a gap per invocation', state: 'not-applicable', numerator: 0, denominator: 0, coverage: { covered: 0, total: 0 }, note: 'No invocation ran' })
    : metric({
        id: 'observation-coverage', unit: 'invocations without a gap per invocation', state: 'measured',
        value: covered / total, numerator: covered, denominator: total, coverage: { covered, total },
        evidence: [...withGap.map(entry => entry.facts.id), ...unreadable],
        note: unreadable.length === 0 ? null : 'An invocation whose observation log cannot be read counts as not covered',
      });
  const kinds = new Map<string, string[]>();
  for (const entry of read) {
    for (const line of entry.log!) {
      if (isObservationGap(line)) kinds.set(line.data.kind, [...(kinds.get(line.data.kind) ?? []), entry.facts.id]);
    }
  }
  return [
    overall,
    ...[...kinds].sort(([a], [b]) => (a < b ? -1 : 1)).map(([kind, list]) => metric({
      id: `observation-coverage.${kind}`, unit: 'gaps', state: 'measured', value: list.length, numerator: list.length,
      denominator: total, coverage: { covered: read.length, total }, evidence: [...new Set(list)],
    })),
  ];
}

/** Every KPI of the run, in the order of the plan's list. */
export function kpiMetrics(inputs: MetricInputs, guarding: { readonly statement: string; readonly complete: boolean }): Metric[] {
  const perLine = bytesPerChangedLine(inputs);
  const ratioMetric = overBaseline('scope-size-ratio', 'dimensionless (mean over B)', perLine, inputs);
  const sessions = sessionsOf(inputs);
  return [
    perLine,
    ratioMetric,
    overBaseline('reduction-factor', 'dimensionless (B over mean)', perLine, inputs, true),
    metric({
      id: 'session-count', unit: 'sessions', state: 'measured', value: sessions.size, numerator: sessions.size,
      coverage: { covered: inputs.invocations.length, total: inputs.invocations.length },
      evidence: [...sessions].map(([session, list]) => `${session}: ${list.map(facts => `${facts.id} ${facts.outcome?.ended ?? 'running'}`).join(', ')}`),
      note: 'Every session counts, whatever ended it: failed, stopped, repaired, context-limited and no-change sessions included',
    }),
    sessionWeightedTotal(inputs),
    ...adaptationMetrics(inputs),
    ...byRole(inputs),
    repeatedBudgetReturns(inputs),
    ratio('gate-attempts-per-accepted-iteration', 'gate attempts per accepted iteration', inputs.gateAttempts.length, inputs.acceptedIterations.length, {
      evidence: [...inputs.gateAttempts], coverage: { covered: inputs.acceptedIterations.length, total: inputs.acceptedIterations.length },
    }),
    ...blockedWrites(inputs, guarding.statement, guarding.complete),
    ...observationCoverage(inputs),
    ...usageMetrics(inputs),
  ];
}


/** Complete and partial weights are explicit beside the known byte-line subtotal. */
export interface ScopeComparison {
  readonly mean: Metric;
  readonly ratio: Metric;
  readonly attributedWeight: number;
  readonly completeSizeWeight: number;
  readonly unknownSizeWeight: number;
  readonly unattributedWeight: number;
}

/** Two corresponding baselines, never a project numerator divided by a total baseline. */
export function comparableScopeMetrics(input: {
  readonly baseline: ScopeSize | { readonly unavailable: string };
  readonly writers: ReadonlyMap<string, ScopeSize | null>;
  readonly delivered: DeliveredChange;
}): { readonly projectOnly: ScopeComparison; readonly total: ScopeComparison } {
  const calculate = (projectOnly: boolean): ScopeComparison => {
    const prefix = projectOnly ? 'project-only' : 'total';
    const common = { measurementPolicy: measurementPolicyVersion };
    const gaps: string[] = [];
    let attributedWeight = 0, completeSizeWeight = 0, unknownSizeWeight = 0, unattributedWeight = 0, subtotal = 0;
    let covered = 0;
    if (input.delivered.state !== 'measured') {
      const state = input.delivered.state;
      const note = input.delivered.reason;
      return { mean: metric({ id: `${prefix}.weighted-scope-bytes`, unit: 'bytes (change-weighted mean)', state, note, ...common }),
        ratio: metric({ id: `${prefix}.scope-ratio`, unit: 'dimensionless', state, note, ...common }),
        attributedWeight, completeSizeWeight, unknownSizeWeight, unattributedWeight };
    }
    for (const [id, weight] of input.delivered.weights) {
      attributedWeight += weight;
      const supplied = input.writers.get(id) ?? null;
      const size = supplied === null ? null : projectOnly ? projectOnlySize(supplied) : supplied;
      const mismatch = size !== null && !('unavailable' in input.baseline) && size.snapshot !== input.baseline.snapshot;
      const gap = sizeGap(size) ?? (mismatch ? 'different frozen snapshot' : null);
      if (gap !== null) {
        unknownSizeWeight += weight;
        gaps.push(`${id}: ${weight} delivered lines with unknown size: ${gap}`);
        if (size !== null && size.policy === measurementPolicyVersion && !mismatch) subtotal += weight * size.subtotal;
      } else {
        completeSizeWeight += weight;
        subtotal += weight * size!.bytes!;
        covered += 1;
      }
    }
    for (const [reason, weight] of input.delivered.unattributed) { unattributedWeight += weight; gaps.push(`${weight} unattributed lines: ${reason}`); }
    const coverage = { covered, total: input.delivered.weights.size };
    const state = unknownSizeWeight > 0 || unattributedWeight > 0 ? 'partial' : attributedWeight === 0 ? 'not-applicable' : 'measured';
    const mean = metric({ id: `${prefix}.weighted-scope-bytes`, unit: 'bytes (change-weighted mean)', state,
      value: state === 'measured' ? subtotal / attributedWeight : null, numerator: subtotal, subtotal,
      denominator: attributedWeight, coverage, evidence: gaps, note: state === 'partial' ? 'Known byte-line subtotal only; incomplete sizes or unattributed delivered lines prevent a whole-run mean' : null, ...common });
    let result: Metric;
    const baseline = 'unavailable' in input.baseline ? input.baseline : projectOnly ? projectOnlySize(input.baseline) : input.baseline;
    const baselineGap = 'unavailable' in baseline ? baseline.unavailable : sizeGap(baseline);
    if (baselineGap !== null) result = metric({ id: `${prefix}.scope-ratio`, unit: 'dimensionless', state: 'unavailable', subtotal,
      evidence: [...gaps, `baseline: ${baselineGap}`], coverage, ...common });
    else if (state !== 'measured') result = metric({ id: `${prefix}.scope-ratio`, unit: 'dimensionless', state, subtotal, denominator: (baseline as ScopeSize).bytes, coverage, evidence: gaps, note: 'Ratio unavailable; subtotal is known weighted byte-lines, not a normalized value', ...common });
    else result = ratio(`${prefix}.scope-ratio`, 'dimensionless', mean.value!, (baseline as ScopeSize).bytes!, { coverage, ...common });
    return { mean, ratio: result, attributedWeight, completeSizeWeight, unknownSizeWeight, unattributedWeight };
  };
  return { projectOnly: calculate(true), total: calculate(false) };
}

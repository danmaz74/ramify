import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { CandidateSource, ChangeHistory, LineCommit } from '../../subs/evidence/src/git.js';
import { metricSchema, type Metric } from '../interfaces/protocol/runs.js';
import type { DeliveredChange } from '../kpi/delivered.js';
import { comparableScopeMetrics, kpiMetrics, type InvocationFacts, type MetricInputs } from '../kpi/metrics.js';
import { runView } from '../projections/inputs.js';
import { metricsOf } from '../projections/metrics.js';
import type { Observation } from '../run/observations.js';
import {
  invocationOutcomeSchema, invocationSchema, runLayout, type ContinueRelation, type LineEventSummary, type ScopeSize,
} from '../run/records.js';
import { constructedRecord, constructedRun, hash, type Line } from './helpers/constructed.js';

/*
 * M4: KPI projections retain their numerators, denominators, revision and
 * coverage, and unavailable data is not reported as zero.
 *
 * The inputs are constructed invocations, each as the records and the
 * observation log would describe it. Every metric is validated against the
 * protocol's schema, which refuses a value on anything but `measured`.
 * The last test builds the inputs from a run's records through the
 * projection, so the grouping of invocations into sessions is exercised too.
 */

const guarded = { statement: 'Every observed mutation passed the guard (edit).', complete: true };

function size(bytes: number | null, missing?: string): ScopeSize {
  const components: ScopeSize['components'] = [
    { component: 'owned-source', detail: 'x', bytes: missing === 'owned-source' ? null : (bytes ?? 0), state: missing === 'owned-source' ? 'unknown' : 'measured', ...(missing === 'owned-source' ? { reason: 'a module that does not exist yet' } : {}) },
    { component: 'api-views', detail: 'x', bytes: 0, state: 'measured' },
    { component: 'architect-view', detail: 'x', bytes: missing === 'architect-view' ? null : 0, state: missing === 'architect-view' ? 'unavailable' : 'measured', ...(missing === 'architect-view' ? { reason: 'not published' } : {}) },
    { component: 'support-documents', detail: 'x', bytes: 0, state: 'measured' },
  ];
  const known = components.filter(component => component.state === 'measured').reduce((total, component) => total + (component.bytes ?? 0), 0);
  return { policy: 'scope-size/2', snapshot: 'ms-0001', components, bytes: missing === undefined ? known : null, subtotal: known, coverage: missing === undefined ? 'complete' : 'partial' };
}

function lines(invocation: string, added: number, deleted: number, coverage: 'complete' | 'partial' = 'complete'): LineEventSummary {
  return {
    schema: 'ramify-agent.line-events/1', invocation,
    paths: added + deleted === 0 ? [] : [{ path: 'subs/x/src/a.ts', owner: 'p/x', added, deleted, binary: false, bytes: null }],
    unmapped: { paths: 0, added: 0, deleted: 0 },
    coverage, gaps: coverage === 'partial' ? ['changed-paths-unknown: the snapshot after the session failed (git exited 128)'] : [],
  };
}

const usage = { input: 100, output: 10, cacheRead: 1000, cacheWrite: 50, total: 1160 };

function writer(id: string, extra: Partial<InvocationFacts> = {}): InvocationFacts {
  return {
    id, role: 'engineer', workItem: 'wi-001', iteration: 'wi-001.i01', request: null, writer: true, session: `session-${id}`,
    outcome: { ended: 'submitted', usage, outsideScope: [] },
    size: size(1000), lines: lines(id, 5, 5), observations: [], adaptation: null, ...extra,
  };
}

/** A delivered change in which each writer delivered what its line events say, and nothing else was delivered. */
function delivered(weights: ReadonlyArray<readonly [string, number]>, unattributed: ReadonlyArray<readonly [string, number]> = []): DeliveredChange {
  return { state: 'measured', base: 'a'.repeat(40), final: 'f'.repeat(40), weights: new Map(weights), unattributed: new Map(unattributed), harness: 0, binaryPaths: [] };
}

function inputs(invocations: InvocationFacts[], extra: Partial<MetricInputs> = {}): MetricInputs {
  const weights = invocations.flatMap(facts => {
    if (!facts.writer || facts.lines === null || 'unavailable' in facts.lines) return [];
    const weight = facts.lines.paths.reduce((total, path) => total + path.added + path.deleted, 0);
    return weight > 0 ? [[facts.id, weight] as const] : [];
  });
  return {
    baseline: { bytes: 10_000, snapshot: 'ms-0001' }, invocations, delivered: delivered(weights),
    gateAttempts: ['ga-0002', 'ga-0003'], acceptedIterations: ['wi-001.i01'], ...extra,
  };
}

function find(metrics: readonly Metric[], id: string): Metric {
  const metric = metrics.find(candidate => candidate.id === id);
  if (metric === undefined) throw new Error(`no metric ${id}`);
  return metric;
}

function computed(value: MetricInputs, guarding = guarded): Metric[] {
  const metrics = kpiMetrics(value, guarding);
  for (const metric of metrics) metricSchema.parse(metric);
  return metrics;
}

describe('M4: every metric keeps its numerator, denominator, version and coverage', () => {
  test('measured: sum(w_e * S_e) / sum(w_e), over B, and its inverse', () => {
    const metrics = computed(inputs([writer('inv-0002'), writer('inv-0003', { size: size(3000), lines: lines('inv-0003', 20, 10) })]));
    // (10 * 1000 + 30 * 3000) / 40 = 2500 bytes, the change-weighted mean.
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({
      state: 'measured', value: 2500, numerator: 100_000, denominator: 40, coverage: { covered: 2, total: 2 },
      policyVersion: 'kpi/1', measurementPolicy: 'scope-size/2',
    });
    expect(find(metrics, 'scope-bytes-per-changed-line').evidence).toEqual([
      `delivered change ${'a'.repeat(12)}..${'f'.repeat(12)}`, 'inv-0002: w_e = 10 lines, S_e = 1000 bytes', 'inv-0003: w_e = 30 lines, S_e = 3000 bytes',
    ]);
    expect(find(metrics, 'scope-size-ratio')).toMatchObject({ state: 'measured', value: 0.25, numerator: 2500, denominator: 10_000 });
    expect(find(metrics, 'reduction-factor')).toMatchObject({ state: 'measured', value: 4 });
    expect(find(metrics, 'gate-attempts-per-accepted-iteration')).toMatchObject({ state: 'measured', value: 2, numerator: 2, denominator: 1, measurementPolicy: null });
  });

  test('a missing size component reports unavailable with its known subtotal and coverage, never zero', () => {
    const metrics = computed(inputs([
      writer('inv-0002'),
      writer('inv-0003', { size: size(null, 'owned-source'), lines: lines('inv-0003', 3, 0) }),
    ]));
    const perLine = find(metrics, 'scope-bytes-per-changed-line');
    expect(perLine).toMatchObject({
      state: 'unavailable', value: null, numerator: null,
      // The known part, and the weight it covers: inv-0002's 10 lines at 1000 bytes.
      subtotal: 10_000, denominator: 10, coverage: { covered: 1, total: 2 },
      note: expect.stringContaining('10 lines of the 13 lines delivered'),
    });
    expect(perLine.evidence.join('\n')).toContain('inv-0003: w_e = 3 lines, S_e unknown: owned-source unknown');
    // What divides it by B inherits its state, with the same subtotal.
    expect(find(metrics, 'scope-size-ratio')).toMatchObject({ state: 'unavailable', value: null, subtotal: 10_000 });
    expect(find(metrics, 'session-weighted-total')).toMatchObject({ state: 'unavailable', value: null, coverage: { covered: 1, total: 2 } });
  });

  test('sum(w_e) = 0 reports not-applicable', () => {
    const metrics = computed(inputs([writer('inv-0002', { lines: lines('inv-0002', 0, 0) }), writer('inv-0003', { lines: lines('inv-0003', 0, 0), size: size(null, 'owned-source') })]));
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'not-applicable', value: null, numerator: 0, denominator: 0, note: expect.stringContaining('sum(w_e) = 0') });
    expect(find(metrics, 'scope-size-ratio')).toMatchObject({ state: 'not-applicable', value: null });
  });

  test('delivered lines no writer can be named for refuse a whole-run ratio; the attributed numerator and weight are shown', () => {
    const facts = [writer('inv-0002'), writer('inv-0003', { lines: lines('inv-0003', 50, 0, 'partial') })];
    const metrics = computed(inputs(facts, { delivered: delivered([['inv-0002', 10]], [['commit 0123456789ab holds no recorded writer\'s work', 50]]) }));
    const perLine = find(metrics, 'scope-bytes-per-changed-line');
    expect(perLine).toMatchObject({
      state: 'partial', value: null, numerator: 10_000, denominator: 10, coverage: { covered: 2, total: 2 },
      note: expect.stringContaining('50 lines of the 60 lines delivered are attributed to no writer'),
    });
    expect(perLine.evidence).toContain('inv-0003: w_e = 0, it delivered no line');
    expect(perLine.evidence).toContain('unattributed: 50 lines: commit 0123456789ab holds no recorded writer\'s work');
    expect(find(metrics, 'scope-size-ratio')).toMatchObject({ state: 'partial', value: null, numerator: 10_000, denominator: 10 });
  });

  test('w_e is the delivered share: a writer whose lines a later writer replaced is weighted by what survived, a shared commit by its split', () => {
    // inv-0002 recorded 10 lines but delivered 4; inv-0003 and inv-0004
    // shared one commit, split 4.5 and 1.5 by their recorded increases.
    const facts = [writer('inv-0002'), writer('inv-0003', { size: size(3000) }), writer('inv-0004', { size: size(5000) })];
    const metrics = computed(inputs(facts, { delivered: delivered([['inv-0002', 4], ['inv-0003', 4.5], ['inv-0004', 1.5]]) }));
    // (4 * 1000 + 4.5 * 3000 + 1.5 * 5000) / 10 = 2500.
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'measured', value: 2500, numerator: 25_000, denominator: 10 });
    expect(find(metrics, 'scope-bytes-per-changed-line').evidence).toContain('inv-0003: w_e = 4.50 lines, S_e = 3000 bytes');
  });

  test('no accepted commit is not-applicable, and a delivered change Git cannot answer is unavailable, never zero', () => {
    const none = computed(inputs([writer('inv-0002')], { delivered: { state: 'not-applicable', reason: 'No commit was accepted after the run base' } }));
    expect(find(none, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'not-applicable', value: null, numerator: 0, denominator: 0, note: expect.stringContaining('No commit was accepted') });
    expect(find(none, 'scope-size-ratio')).toMatchObject({ state: 'not-applicable', value: null });

    const unknown = computed(inputs([writer('inv-0002')], { delivered: { state: 'unavailable', reason: 'The delivered change could not be read from Git: git exited 128' } }));
    expect(find(unknown, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'unavailable', value: null, subtotal: null, denominator: null, evidence: [expect.stringContaining('git exited 128')] });
    expect(find(unknown, 'reduction-factor')).toMatchObject({ state: 'unavailable', value: null });
  });

  test('a size taken under another measurement policy is refused, never mixed with the current one', () => {
    const old = { ...size(1000), policy: 'scope-size/1' as const };
    const metrics = computed(inputs([writer('inv-0002'), writer('inv-0003', { size: old })]));
    const perLine = find(metrics, 'scope-bytes-per-changed-line');
    expect(perLine).toMatchObject({ state: 'unavailable', value: null, subtotal: 10_000, denominator: 10 });
    expect(perLine.evidence.join('\n')).toContain('inv-0003: w_e = 10 lines, S_e unknown: its size was taken under scope-size/1, which is not comparable with scope-size/2');
    expect(find(metrics, 'session-weighted-total')).toMatchObject({ state: 'unavailable', value: null, coverage: { covered: 1, total: 2 } });
  });

  test('an unavailable baseline makes every ratio over B unavailable, with the reason', () => {
    const metrics = computed(inputs([writer('inv-0002')], { baseline: { unavailable: 'ramify measure could not be run' } }));
    expect(find(metrics, 'scope-bytes-per-changed-line').state).toBe('measured');
    for (const id of ['scope-size-ratio', 'reduction-factor', 'session-weighted-total']) {
      const metric = find(metrics, id);
      expect([id, metric.state, metric.value]).toEqual([id, 'unavailable', null]);
      expect(metric.evidence.join(' ')).toContain('ramify measure could not be run');
    }
  });

  test('usage stays separate by category, and one unreported session makes it unavailable, not zero', () => {
    const reported = computed(inputs([writer('inv-0002'), writer('inv-0003')]));
    expect(['input', 'cache-read', 'cache-write', 'output'].map(name => find(reported, `usage-tokens.${name}`).value)).toEqual([200, 2000, 100, 20]);
    expect(reported.some(metric => /cost|price|invoice|usd/i.test(`${metric.id} ${metric.unit}`))).toBe(false);

    const missing = computed(inputs([writer('inv-0002'), writer('inv-0003', { outcome: { ended: 'failed', usage: { unavailable: 'the harness stopped' }, outsideScope: [] } })]));
    expect(find(missing, 'usage-tokens.input')).toMatchObject({ state: 'unavailable', value: null, subtotal: 100, coverage: { covered: 1, total: 2 } });
    expect(find(missing, 'adaptation-usage-share.output')).toMatchObject({ state: 'unavailable', value: null });
  });

  test('sessions count every session, and a continued session counts each component once at its largest', () => {
    const facts = [
      writer('inv-0002', { session: 'la-1', role: 'local-architect', writer: false, lines: null, size: size(1000) }),
      writer('inv-0003', { session: 'la-1', role: 'local-architect', writer: false, lines: null, size: size(4000) }),
      writer('inv-0004', { outcome: { ended: 'failed', usage, outsideScope: [] }, lines: lines('inv-0004', 0, 0) }),
      writer('inv-0005', { outcome: { ended: 'context-budget-reached', usage, outsideScope: [] }, adaptation: 'iteration wi-001.i01 was unsuitable' }),
    ];
    const metrics = computed(inputs(facts));
    expect(find(metrics, 'session-count')).toMatchObject({ state: 'measured', value: 3 });
    // la-1 at its largest (4000), then 1000 and 1000, over B = 10 000.
    expect(find(metrics, 'session-weighted-total')).toMatchObject({ state: 'measured', numerator: 6000, denominator: 10_000, value: 0.6 });
    expect(find(metrics, 'adaptation-session-share')).toMatchObject({ state: 'measured', numerator: 1, denominator: 3 });
    expect(find(metrics, 'budget-return-rate.engineer')).toMatchObject({ state: 'measured', numerator: 1, denominator: 2 });
    expect(find(metrics, 'budget-return-rate.global-fork')).toMatchObject({ state: 'not-applicable', value: null, denominator: 0 });
  });

  test('blocked writes are partial while an unguarded tool mutated, and say why', () => {
    const guard = (callId: string, verdict: 'allowed' | 'blocked-scope'): Observation => ({
      n: 1, at: '2026-09-21T08:00:00.000Z', type: 'guard',
      data: { callId, tool: 'write', requested: 'a', resolved: 'a', owner: null, scopeRevision: 1, verdict, reason: 'r' },
    });
    const facts = [writer('inv-0002', { observations: [guard('c1', 'allowed'), guard('c2', 'blocked-scope')] })];
    const complete = computed(inputs(facts));
    expect(find(complete, 'blocked-write-attempts')).toMatchObject({ state: 'measured', value: 0.5, numerator: 1, denominator: 2, evidence: ['engineer write blocked-scope: 1'] });

    const statement = 'Guarded: write. Not guarded: shell. A count of blocked calls is not evidence that every write respected its scope; what an unguarded tool wrote is seen only in the tree afterwards.';
    const partial = computed(inputs(facts), { statement, complete: false });
    expect(find(partial, 'blocked-write-attempts')).toMatchObject({ state: 'partial', value: null, numerator: 1, denominator: 2, note: statement });
  });

  test('an unreadable observation log makes its counts partial or unavailable, never zero', () => {
    const facts = [writer('inv-0002', { observations: { unavailable: 'observations.jsonl cannot be read' } })];
    const metrics = computed(inputs(facts));
    expect(find(metrics, 'compactions.engineer')).toMatchObject({ state: 'unavailable', value: null, coverage: { covered: 0, total: 1 } });
    expect(find(metrics, 'compactions.initial-architect')).toMatchObject({ state: 'not-applicable', value: null, coverage: { covered: 0, total: 0 } });
    expect(find(metrics, 'blocked-write-attempts')).toMatchObject({ state: 'partial', value: null });
  });

  test('a transcript entry that could not be written is raw output: it lowers no observation coverage', () => {
    const gap = (kind: 'transcript-incomplete' | 'usage-unavailable'): Observation => ({
      n: 1, at: '2026-09-23T08:00:00.000Z', type: 'coverage-gap', data: { kind, detail: 'why' },
    });
    const metrics = computed(inputs([
      writer('inv-0002', { observations: [gap('transcript-incomplete')] }),
      writer('inv-0003', { observations: [gap('usage-unavailable'), gap('transcript-incomplete')] }),
      writer('inv-0004'),
    ]));
    expect(find(metrics, 'observation-coverage')).toMatchObject({ state: 'measured', numerator: 2, denominator: 3, evidence: ['inv-0003'] });
    expect(find(metrics, 'observation-coverage.usage-unavailable')).toMatchObject({ value: 1, evidence: ['inv-0003'] });
    expect(metrics.some(metric => metric.id === 'observation-coverage.transcript-incomplete')).toBe(false);
  });

  test('no writer session: the change-weighted metrics are not-applicable, never zero', () => {
    const metrics = computed(inputs([], { gateAttempts: [], acceptedIterations: [] }));
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'not-applicable', value: null });
    expect(find(metrics, 'gate-attempts-per-accepted-iteration')).toMatchObject({ state: 'not-applicable', value: null, denominator: 0 });
    expect(find(metrics, 'session-count')).toMatchObject({ state: 'measured', value: 0 });
  });
});

describe('ST04: the projection groups invocations by the session they started in', () => {
  const work = { workItem: 'wi-001', iteration: 'wi-001.i01' };

  /** One invocation's three lines: its start with its record, and its end with its outcome, ending at an executor ref of its own. */
  function invocationLines(id: string, session: string, bytes: number, ref: string, continues?: ContinueRelation): Line[] {
    const invocation = invocationSchema.parse({
      schema: 'ramify-agent.invocation/1', id, role: 'engineer', work, attempt: 1,
      session: continues === undefined ? { requested: 'fresh', actual: 'fresh', ref: '' } : { requested: 'continued', actual: 'continued', ref: 'scripted-1@4#0', from: 'scripted-1@4#0' },
      prompt: { package: 'engineer', hash, inputsHash: hash },
      scope: { write: null, measurement: null, size: size(bytes) },
      writer: false, base: 'abc', startedAt: '2026-09-21T08:00:00.000Z',
    });
    const outcome = invocationOutcomeSchema.parse({
      schema: 'ramify-agent.invocation-outcome/1', invocation: id, ended: 'submitted', rejectedSubmissions: 0, disposition: 'applied',
      session: { ref, mode: continues === undefined ? 'fresh' : 'continued' }, submission: null,
      settled: { confirmed: true, at: '2026-09-21T08:00:00.000Z', groupsKilled: 0, lateWrites: [] },
      outsideScope: [], usage, elapsedMs: 1,
    });
    return [
      {
        type: 'invocation-started',
        data: { invocation: id, role: 'engineer', session, work, start: continues === undefined ? 'opened' : 'continued', ...(continues === undefined ? {} : { continues }) },
        records: [{ path: runLayout.invocation(id), body: invocation }],
      },
      { type: 'invocation-ended', data: { invocation: id, ended: 'submitted', submission: null, session, kept: true }, records: [{ path: runLayout.outcome(id), body: outcome }] },
    ];
  }

  const opened = (session: string): Line => ({ type: 'session-opened', data: { session, role: 'engineer', work, executor: 'scripted', model: null } });

  test('a continued session counts once in session-weighted-total, at its largest size, although each invocation ends at another ref', async () => {
    const run = constructedRun([
      { type: 'job-started', data: {} },
      opened('ses-0001'),
      ...invocationLines('inv-0001', 'ses-0001', 1000, 'scripted-1@4#0'),
      // The same session, continued for a repair, measured larger, and ending
      // at a ref of its own: a ref names a point, not a session.
      ...invocationLines('inv-0002', 'ses-0001', 3000, 'scripted-1@9#0', { from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'repair', briefs: [] }),
      opened('ses-0002'),
      ...invocationLines('inv-0003', 'ses-0002', 500, 'scripted-2@3#0'),
    ]);
    const response = await metricsOf(runView(run));
    for (const metric of response.metrics) metricSchema.parse(metric);

    expect(find(response.metrics, 'session-count')).toMatchObject({
      state: 'measured', value: 2,
      evidence: ['ses-0001: inv-0001 submitted, inv-0002 submitted', 'ses-0002: inv-0003 submitted'],
    });
    // The constructed run froze no baseline, so the total is unavailable and
    // the sum of S_s is its subtotal: ses-0001 at 3000, not 1000 + 3000,
    // and ses-0002 at 500.
    expect(find(response.metrics, 'session-weighted-total')).toMatchObject({
      state: 'unavailable', value: null, subtotal: 3500, coverage: { covered: 2, total: 2 },
    });
  });

  test('a continued start the executor made fresh stays in its session, and counts again in session-weighted-total', async () => {
    const [started, ended] = invocationLines('inv-0002', 'ses-0001', 3000, 'scripted-1@9#0', { from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'repair', briefs: [] });
    const run = constructedRun([
      { type: 'job-started', data: {} },
      opened('ses-0001'),
      ...invocationLines('inv-0001', 'ses-0001', 1000, 'scripted-1@4#0'),
      // The executor could not continue, so inv-0002 began a new context:
      // its scope was loaded again, and the session's later segments run in
      // that context.
      started!,
      { ...ended!, data: { ...(ended!.data as object), degraded: { requested: 'continue', actual: 'fresh', reason: 'the session file is gone' } } },
      ...invocationLines('inv-0003', 'ses-0001', 2000, 'scripted-1@12#0', { from: { session: 'ses-0001', invocation: 'inv-0002' }, reason: 'repair', briefs: [] }),
    ]);
    const response = await metricsOf(runView(run));

    expect(find(response.metrics, 'session-count')).toMatchObject({ state: 'measured', value: 1 });
    // ses-0001 at 1000 until the degraded start, then its new context at its
    // largest, 3000: 4000 rather than 3000.
    expect(find(response.metrics, 'session-weighted-total')).toMatchObject({
      state: 'unavailable', subtotal: 4000, coverage: { covered: 2, total: 2 },
      evidence: ['baseline: constructed', 'ses-0001 from inv-0002: a continued start the executor made fresh counts as a term of its own'],
    });
  });
});


describe('Plan23 F6 corresponding scope components and weighted partial evidence', () => {
  const splitSize = (source: number, api: number, architect: number, support: number): ScopeSize => ({
    policy: 'scope-size/2', snapshot: 'ms-0001', bytes: source + api + architect + support, subtotal: source + api + architect + support, coverage: 'complete',
    components: [{ component: 'owned-source', detail: 'source', bytes: source, state: 'measured' },
      { component: 'api-views', detail: 'api', bytes: api, state: 'measured' },
      { component: 'architect-view', detail: 'architect', bytes: architect, state: 'measured' },
      { component: 'support-documents', detail: 'support and brief', bytes: support, state: 'measured' }],
  });
  const baseline = splitSize(100, 20, 30, 50);
  const one = splitSize(40, 10, 15, 25);
  test('project50/120 and total90/200 use their corresponding baselines; weights3,1 at90,50 mean80bytes', () => {
    const ratios = comparableScopeMetrics({ baseline, writers: new Map([['one', one]]), delivered: delivered([['one', 1]]) });
    expect(ratios.projectOnly.ratio).toMatchObject({ unit: 'dimensionless', value: 50 / 120, numerator: 50, denominator: 120 });
    expect(ratios.total.ratio).toMatchObject({ value: 90 / 200, numerator: 90, denominator: 200 });
    const weighted = comparableScopeMetrics({ baseline, writers: new Map([['one', one], ['two', splitSize(30, 5, 5, 10)]]), delivered: delivered([['one', 3], ['two', 1]]) });
    expect(weighted.total.mean).toMatchObject({ state: 'measured', value: 80, numerator: 320, denominator: 4, unit: 'bytes (change-weighted mean)' });
  });

  test('partial writers retain known byte-line subtotal and weight, overlaps retain unrelated known contribution', () => {
    const partial: ScopeSize = { ...one, bytes: null, subtotal: 80, coverage: 'partial', components: one.components.map(component =>
      component.component === 'support-documents' ? { ...component, bytes: null, state: 'unavailable', buckets: { known: 15 }, reason: 'missing support' } : component) };
    const value = comparableScopeMetrics({ baseline, writers: new Map([['one', one], ['two', partial]]), delivered: delivered([['one', 3], ['two', 1]], [['unknown overlapping writer', 2]]) });
    expect(value.total).toMatchObject({ attributedWeight: 4, completeSizeWeight: 3, unknownSizeWeight: 1, unattributedWeight: 2,
      mean: { state: 'partial', value: null, subtotal: 350, denominator: 4 }, ratio: { state: 'partial', value: null } });
    expect(value.projectOnly.mean).toMatchObject({ state: 'partial', subtotal: 200 });
    // Existing KPI keeps complete-size weight separate, but preserves partial byte-line contributions too.
    const old = computed(inputs([writer('one', { size: one }), writer('two', { size: partial })], { delivered: delivered([['one', 3], ['two', 1]]) }));
    expect(find(old, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'unavailable', subtotal: 350, denominator: 3 });
  });

  test('missingB, zeroB, delivered-zero, incompatiblepolicy and frozen snapshot identities remain distinct', () => {
    const args = { writers: new Map([['one', one]]), delivered: delivered([['one', 1]]) };
    expect(comparableScopeMetrics({ ...args, baseline: { unavailable: 'missing baseline' } }).total.ratio).toMatchObject({ state: 'unavailable', value: null, subtotal: 90 });
    expect(comparableScopeMetrics({ ...args, baseline: splitSize(0, 0, 0, 0) }).total.ratio).toMatchObject({ state: 'not-applicable', value: null, denominator: 0 });
    expect(comparableScopeMetrics({ ...args, baseline, delivered: delivered([]) }).total.mean).toMatchObject({ state: 'not-applicable', numerator: 0, denominator: 0 });
    expect(comparableScopeMetrics({ ...args, baseline: { ...baseline, policy: 'scope-size/1' } }).total.ratio).toMatchObject({ state: 'unavailable' });
    const mismatch = comparableScopeMetrics({ ...args, baseline, writers: new Map([['one', { ...one, snapshot: 'ms-0002' }]]) });
    expect(mismatch.total).toMatchObject({ unknownSizeWeight: 1, mean: { state: 'partial', subtotal: 0 } });
    const zero = comparableScopeMetrics({ baseline, writers: new Map([['one', splitSize(0, 0, 0, 0)]]), delivered: delivered([['one', 1]]) });
    expect(zero.total.ratio).toMatchObject({ state: 'measured', value: 0 });
  });
});


test('Plan23 captured partial zero subtotal remains zero while absent scope remains unknown', () => {
  const captured = computed(inputs([writer('one', { size: size(null, 'owned-source') })], { delivered: delivered([['one', 1]]) }));
  // No writer has a complete size, so the denominator is unknown, not 0.
  expect(find(captured, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'unavailable', subtotal: 0, value: null, denominator: null });
  expect(find(captured, 'session-weighted-total')).toMatchObject({ state: 'unavailable', subtotal: 0, value: null });
  const missing = computed(inputs([writer('one', { size: null })], { delivered: delivered([['one', 1]]) }));
  expect(find(missing, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'unavailable', subtotal: null, value: null, denominator: null });
});

describe('the delivered change of a run view, read through a scripted history', () => {
  const B = 'b'.repeat(40), S = 'c'.repeat(40), M = 'd'.repeat(40), G1 = '1'.repeat(40), R = 'e'.repeat(40), G2 = '2'.repeat(40);
  const feature = 'features/a.feature';
  const sha1 = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  /** `.gitignore` at each revision the collector reads: the base, the scratch commit and the final commit. */
  const ignore: Record<string, string> = { [B]: 'dist/\n', [S]: 'dist/\n**/src/tmp/\n', [G2]: 'dist/\n**/src/tmp/\n' };
  const row = (line: number, commit: string, sourceLine = line, sourcePath = '.gitignore'): LineCommit => ({ line, commit, boundary: false, sourceLine, sourcePath, projectPrefix: '' });

  function history(): { history: { projectRoot: string; changes: ChangeHistory; candidates: CandidateSource }; calls: string[] } {
    const calls: string[] = [];
    const answer = <T>(name: string, value: T | undefined): Promise<T> => { calls.push(name); return value === undefined ? Promise.reject(new Error(`unscripted ${name}`)) : Promise.resolve(value); };
    const origins: Record<string, LineCommit[]> = {
      '.gitignore': [row(2, S)],
      // Four lines the materialization added, one of which the rewording rewrote.
      [feature]: [row(3, M, 3, feature), row(4, M, 4, feature), row(5, R, 5, feature), row(6, M, 6, feature)],
      'src/a.ts': [row(1, G1, 1, 'src/a.ts'), row(2, G1, 2, 'src/a.ts'), row(3, G1, 3, 'src/a.ts')],
      'src/b.ts': [row(1, G2, 1, 'src/b.ts'), row(2, G2, 2, 'src/b.ts')],
    };
    // The feature file's two base lines, its pending tags, were last held by the materialization; the first gate's commit dropped them.
    const seen: Record<string, LineCommit[]> = { [feature]: [row(1, M, 1, feature), row(2, M, 2, feature)] };
    const changes: ChangeHistory = {
      commitsBetween: (root, from, to) => answer(`commits ${from.slice(0, 1)}..${to.slice(0, 1)}`, root === '/project' && from === B && to === G2 ? [S, M, G1, R, G2] : undefined),
      changedFiles: (root, from, to) => answer('files', root === '/project' && from === B && to === G2 ? [
        { before: '.gitignore', after: '.gitignore', binary: false, added: [[2, 1]], deleted: [] },
        { before: feature, after: feature, binary: false, added: [[3, 4]], deleted: [[1, 2]] },
        { before: null, after: 'src/a.ts', binary: false, added: [[1, 3]], deleted: [] },
        { before: null, after: 'src/b.ts', binary: false, added: [[1, 2]], deleted: [] },
        { before: null, after: 'assets/logo.png', binary: true, added: [], deleted: [] },
      ] : undefined),
      lineOrigins: (_root, _from, _to, path) => answer(`origins ${path}`, origins[path]),
      lineLastSeen: (_root, _from, _to, path) => answer(`seen ${path}`, seen[path]),
    };
    const candidates: CandidateSource = {
      async treeEntries(_root, revision) { const text = ignore[revision]; if (text === undefined) throw new Error(`unscripted tree ${revision.slice(0, 1)}`); return [{ path: '.gitignore', kind: 'file', bytes: Buffer.byteLength(text), objectId: sha1(text) }]; },
      async readBlob(_root, revision, path) { if (path !== '.gitignore' || ignore[revision] === undefined) throw new Error(`unscripted blob ${revision.slice(0, 1)}:${path}`); return ignore[revision]!; },
      async commitTree() { throw new Error('unscripted commitTree'); }, async grepTree() { throw new Error('unscripted grepTree'); },
      async diffNameStatus() { throw new Error('unscripted diffNameStatus'); }, async diffPatch() { throw new Error('unscripted diffPatch'); },
    };
    return { history: { projectRoot: '/project', changes, candidates }, calls };
  }

  /** A writer's two lines, with its record and its outcome; a non-writer's the same with no size. */
  function invocation(id: string, role: 'engineer' | 'local-architect', bytes: number | null): Line[] {
    const work = role === 'engineer' ? { workItem: 'wi-001', iteration: 'wi-001.i01' } : {};
    const record = invocationSchema.parse({
      schema: 'ramify-agent.invocation/1', id, role, work, attempt: 1, session: { requested: 'fresh', actual: 'fresh', ref: '' },
      prompt: { package: role, hash, inputsHash: hash }, scope: { write: null, measurement: null, size: bytes === null ? null : size(bytes) },
      writer: role === 'engineer', base: B, startedAt: '2026-09-21T08:00:00.000Z',
    });
    const outcome = invocationOutcomeSchema.parse({
      schema: 'ramify-agent.invocation-outcome/1', invocation: id, ended: 'submitted', rejectedSubmissions: 0, disposition: 'applied',
      session: { ref: `scripted@${id}`, mode: 'fresh' }, submission: null, settled: { confirmed: true, at: '2026-09-21T08:00:00.000Z', groupsKilled: 0, lateWrites: [] },
      outsideScope: [], usage, elapsedMs: 1,
    });
    return [
      { type: 'invocation-started', data: { invocation: id, role, session: `ses-${id}`, work, start: 'opened' }, records: [{ path: runLayout.invocation(id), body: record }] },
      { type: 'invocation-ended', data: { invocation: id, ended: 'submitted', submission: null, session: `ses-${id}`, kept: false, finished: 'work-closed' }, records: [{ path: runLayout.outcome(id), body: outcome }] },
    ];
  }

  /** One gate attempt over wi-001.i01: its event and its record, with the commit it made. */
  function gate(id: string, verdict: 'passed' | 'failed', commit: string | null): Line {
    const body = {
      schema: 'ramify-agent.gate-attempt/3', id, checkpoint: 'iteration', subject: { workItem: 'wi-001', iteration: 'wi-001.i01' }, proposedBy: null,
      repairRound: 0, infrastructureAttempt: 0, head: B, commit, audited: commit, evidence: null, guardedChanges: [], commands: [],
      verdict, cause: verdict === 'passed' ? null : 'check-failed', next: verdict === 'passed' ? 'accept' : 'repair',
    };
    return { type: 'gate-attempted', data: { gate: id, checkpoint: 'iteration', verdict, next: body.next }, records: [{ path: runLayout.gate(id), body }] };
  }

  test('weights each writer by the lines its gate commit delivered; the harness commits and the feature files weigh no writer; a binary path has no lines', async () => {
    const record = constructedRecord();
    const run = constructedRun([
      { type: 'job-started', data: {} },
      { type: 'scratch-setting-up', data: { originalIgnoreBase64: Buffer.from(ignore[B]!).toString('base64') } },
      { type: 'scratch-setup-complete', data: { commit: S, appended: true } },
      { type: 'scenarios-materialized', data: { commit: M, files: [feature] } },
      ...invocation('inv-0001', 'engineer', 1000),
      // A failed attempt commits nothing, so the writer is still pending at the next gate.
      gate('ga-0001', 'failed', null),
      gate('ga-0002', 'passed', G1),
      { type: 'scenarios-rewording', data: { deviation: 'pd-001', rewording: 1, scenarios: ['sc-001'], files: [feature] } },
      { type: 'scenarios-reworded', data: { deviation: 'pd-001', commit: R } },
      ...invocation('inv-0003', 'local-architect', null),
      ...invocation('inv-0002', 'engineer', 3000),
      gate('ga-0003', 'passed', G2),
    ], { ...record, manifest: { ...record.manifest, source: { commit: B, dirty: false } } });
    const scripted = history();
    const response = await metricsOf(runView(run), scripted.history);
    for (const metric of response.metrics) metricSchema.parse(metric);

    // inv-0001's 3 lines of src/a.ts in ga-0002's commit at 1000 bytes, and
    // inv-0002's 2 lines of src/b.ts in ga-0003's at 3000: (3000 + 6000) / 5.
    const perLine = find(response.metrics, 'scope-bytes-per-changed-line');
    expect(perLine).toMatchObject({ state: 'measured', value: 1800, numerator: 9000, denominator: 5, coverage: { covered: 2, total: 2 } });
    expect(perLine.evidence).toEqual([
      `delivered change ${B.slice(0, 12)}..${G2.slice(0, 12)}`,
      'inv-0001: w_e = 3 lines, S_e = 1000 bytes',
      'inv-0002: w_e = 2 lines, S_e = 3000 bytes',
      // The scratch rule's 1 line by its verified identity, and the feature
      // file's 4 added and 2 deleted lines, the materialization's, the
      // rewording's and the first gate's dropped pending tags alike.
      'harness: 7 lines the harness delivered, which no writer is weighted by',
      'binary, without line weight: assets/logo.png',
    ]);
    expect(response.scopeComparisons?.total).toMatchObject({ attributedWeight: 5, completeSizeWeight: 5, unknownSizeWeight: 0, unattributedWeight: 0 });
    // The base is the manifest's source commit and the final the last passed
    // gate's audited commit, for the setup identities and the diff alike.
    const commits = scripted.calls.filter(call => call.startsWith('commits'));
    expect(commits.length).toBeGreaterThan(0);
    expect(new Set(commits)).toEqual(new Set([`commits ${B.slice(0, 1)}..${G2.slice(0, 1)}`]));
    // The feature file's lines were blamed once, for the setup identities, and
    // never for a weight: they are the harness's by path.
    expect(scripted.calls.filter(call => call === `origins ${feature}`)).toHaveLength(1);
  });
});

import { describe, expect, test } from 'vitest';
import { metricSchema, type Metric } from '../interfaces/protocol/runs.js';
import { kpiMetrics, type InvocationFacts, type MetricInputs } from '../kpi/metrics.js';
import { runView } from '../projections/inputs.js';
import { metricsOf } from '../projections/metrics.js';
import type { Observation } from '../run/observations.js';
import {
  invocationOutcomeSchema, invocationSchema, runLayout, type ContinueRelation, type LineEventSummary, type ScopeSize,
} from '../run/records.js';
import { constructedRun, hash, type Line } from './helpers/constructed.js';

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
  return { policy: 'scope-size/1', snapshot: 'ms-0001', components, bytes: missing === undefined ? known : null, subtotal: known, coverage: missing === undefined ? 'complete' : 'partial' };
}

function lines(invocation: string, added: number, deleted: number, coverage: 'complete' | 'partial' = 'complete'): LineEventSummary {
  return {
    schema: 'ramify-agent.line-events/1', invocation,
    paths: added + deleted === 0 ? [] : [{ path: 'subs/x/src/a.ts', owner: 'p/x', added, deleted, binary: false, bytes: null }],
    unmapped: { paths: 0, added: 0, deleted: 0 },
    coverage, gaps: coverage === 'partial' ? ['unguarded-shell: the shell ran'] : [],
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

function inputs(invocations: InvocationFacts[], extra: Partial<MetricInputs> = {}): MetricInputs {
  return { baseline: { bytes: 10_000, snapshot: 'ms-0001' }, invocations, gateAttempts: ['ga-0002', 'ga-0003'], acceptedIterations: ['wi-001.i01'], ...extra };
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
    // (10 * 1000 + 30 * 3000) / 40 = 2500 bytes per changed line.
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({
      state: 'measured', value: 2500, numerator: 100_000, denominator: 40, coverage: { covered: 2, total: 2 },
      policyVersion: 'kpi/1', measurementPolicy: 'scope-size/1',
    });
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
      // The known part: inv-0002's 10 lines at 1000 bytes.
      subtotal: 10_000, denominator: 13, coverage: { covered: 1, total: 2 },
    });
    expect(perLine.evidence.join('\n')).toContain('inv-0003: owned-source unknown');
    // What divides it by B inherits its state, with the same subtotal.
    expect(find(metrics, 'scope-size-ratio')).toMatchObject({ state: 'unavailable', value: null, subtotal: 10_000 });
    expect(find(metrics, 'session-weighted-total')).toMatchObject({ state: 'unavailable', value: null, coverage: { covered: 1, total: 2 } });
  });

  test('sum(w_e) = 0 reports not-applicable', () => {
    const metrics = computed(inputs([writer('inv-0002', { lines: lines('inv-0002', 0, 0) }), writer('inv-0003', { lines: lines('inv-0003', 0, 0), size: size(null, 'owned-source') })]));
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({ state: 'not-applicable', value: null, numerator: 0, denominator: 0, note: expect.stringContaining('sum(w_e) = 0') });
    expect(find(metrics, 'scope-size-ratio')).toMatchObject({ state: 'not-applicable', value: null });
  });

  test('a whole-run ratio over partial line counts is refused; the covered sessions and weight are shown', () => {
    const metrics = computed(inputs([writer('inv-0002'), writer('inv-0003', { lines: lines('inv-0003', 50, 0, 'partial') })]));
    expect(find(metrics, 'scope-bytes-per-changed-line')).toMatchObject({
      state: 'partial', value: null, numerator: 10_000, denominator: 10, coverage: { covered: 1, total: 2 },
    });
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

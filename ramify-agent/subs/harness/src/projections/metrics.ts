import { readJsonLines } from '../../subs/ledger/src/jsonl.js';
import type { InvocationEvaluation, MetricsResponse } from '../interfaces/protocol/runs.js';
import { baselineScope, rootModuleOfSnapshot, scopeSize } from '../kpi/capture.js';
import { guardingReport } from '../kpi/guarding.js';
import { kpiMetrics, kpiPolicyVersion, measurementPolicyVersion, type InvocationFacts } from '../kpi/metrics.js';
import { observationSchema, type Observation } from '../run/observations.js';
import {
  lineEventSummarySchema, measurementSnapshotSchema, runLayout,
  type Invocation, type LineEventSummary, type MeasurementSnapshot,
} from '../run/records.js';
import { readRunFile, unsupportedVersion, type RunView } from './inputs.js';

/*
 * The KPIs and the evaluation evidence beside them, read from the run's own
 * files: each invocation's observation log and line events, and the frozen
 * baseline's measurement snapshot. They are read, never written; a file
 * that cannot be read makes what depends on it unavailable with the reason,
 * and a file of a version this harness does not read says so. Nothing is
 * reported as zero because it is missing.
 */

/** The frozen baseline `B`, or why it is unavailable. */
async function baselineOf(view: RunView): Promise<MetricsResponse['baseline']> {
  const reference = view.record.baseline;
  if ('unavailable' in reference) return { state: 'unavailable', reason: reference.unavailable, subtotal: null };
  const path = runLayout.measurement(reference.measurement.id);
  const text = await readRunFile(view, path);
  if (text === null) return { state: 'unavailable', reason: `${path} is missing`, subtotal: null };
  let snapshot: MeasurementSnapshot;
  try {
    const document = JSON.parse(text) as { schema?: unknown };
    const expected = unsupportedVersion(document.schema);
    if (expected !== null) return { state: 'unavailable', reason: `${path} declares ${String(document.schema)}; this harness reads ${expected}`, subtotal: null };
    snapshot = measurementSnapshotSchema.parse(document);
  } catch (error) {
    return { state: 'unavailable', reason: `${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`, subtotal: null };
  }
  const root = rootModuleOfSnapshot(snapshot) ?? 'root';
  const size = scopeSize(snapshot, baselineScope(root, snapshot.supplementary.map(entry => entry.path)));
  if (size.bytes === null) {
    const missing = size.components.filter(component => component.state !== 'measured').map(component => `${component.component}: ${component.reason ?? component.state}`);
    return { state: 'unavailable', reason: missing.join('; ') || 'a component is unavailable', subtotal: size.subtotal };
  }
  return { state: 'measured', bytes: size.bytes, snapshot: snapshot.id };
}

async function observationsOf(view: RunView, id: string): Promise<readonly Observation[] | { unavailable: string }> {
  try {
    const loaded = await readJsonLines(`${view.directory}/${runLayout.observations(id)}`);
    const lines: Observation[] = [];
    let invalid = 0;
    for (const record of loaded.records) {
      const parsed = observationSchema.safeParse(record);
      if (parsed.success) lines.push(parsed.data);
      else invalid += 1;
    }
    if (invalid > 0) return { unavailable: `${runLayout.observations(id)} has ${invalid} line(s) this harness does not read` };
    return lines;
  } catch (error) {
    return { unavailable: `${runLayout.observations(id)} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function linesOf(view: RunView, invocation: Invocation): Promise<InvocationFacts['lines']> {
  if (!invocation.writer) return null;
  const path = runLayout.lineEvents(invocation.id);
  const text = await readRunFile(view, path);
  if (text === null) return { unavailable: `${path} was not captured` };
  try {
    const document = JSON.parse(text) as { schema?: unknown };
    const expected = unsupportedVersion(document.schema);
    if (expected !== null) return { unavailable: `${path} declares ${String(document.schema)}; this harness reads ${expected}` };
    return lineEventSummarySchema.parse(document);
  } catch (error) {
    return { unavailable: `${path} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * The recorded adaptation that caused each invocation: the local architect's
 * next turn after an `unsuitable` result, the session of a follow-up work
 * item after `evidence-reopened`, a contract revision's session, and the
 * fork whose decision revises another.
 */
function adaptationsOf(view: RunView): Map<string, string> {
  const causes = new Map<string, string>();
  const unsuitable = new Map<string, string>();
  const followUps = new Set(view.records.workItems.filter(item => item.follows !== undefined).map(item => item.id));
  const revising = new Set([...view.records.assignments.values()].filter(assignment => assignment.revisesContract !== undefined).map(assignment => assignment.id));
  for (const event of view.events) {
    if (event.type === 'contract-requested' && event.data.revises !== null) revising.add(event.data.iteration);
  }
  for (const decision of view.records.decisions.values()) {
    if (decision.revises !== undefined) causes.set(decision.invocation, `decision ${decision.id} revises ${decision.revises.decision}`);
  }
  for (const event of view.events) {
    if (event.type === 'iteration-closed' && event.data.outcome === 'unsuitable') {
      unsuitable.set(event.data.workItem, `iteration ${event.data.iteration} was unsuitable`);
      continue;
    }
    if (event.type !== 'invocation-started') continue;
    const invocation = view.records.invocations.get(event.data.invocation);
    if (invocation === undefined || causes.has(invocation.id)) continue;
    const { workItem, iteration } = invocation.work;
    if (workItem !== undefined && invocation.role === 'local-architect' && unsuitable.has(workItem)) {
      causes.set(invocation.id, unsuitable.get(workItem)!);
      unsuitable.delete(workItem);
    } else if (workItem !== undefined && followUps.has(workItem)) {
      causes.set(invocation.id, `follow-up ${workItem} after evidence was reopened`);
    } else if (iteration !== undefined && revising.has(iteration)) {
      causes.set(invocation.id, `contract revision in ${iteration}`);
    }
  }
  return causes;
}

/** Each observation with its call identifier made unique to its invocation, so that a merged report counts each call once. */
function scoped(invocation: string, observations: readonly Observation[]): Observation[] {
  return observations.map(line => {
    const data = line.data as { callId?: unknown };
    if (typeof data.callId === 'string') return { ...line, data: { ...line.data, callId: `${invocation}:${data.callId}` } } as Observation;
    if (line.type === 'activity' && 'callId' in line.data.activity) {
      return { ...line, data: { activity: { ...line.data.activity, callId: `${invocation}:${line.data.activity.callId}` } } } as Observation;
    }
    return line;
  });
}

/** The KPIs of a run with their policy versions and coverage, and its evaluation evidence. */
export async function metricsOf(view: RunView): Promise<MetricsResponse> {
  const baseline = await baselineOf(view);
  const adaptations = adaptationsOf(view);
  const facts: InvocationFacts[] = [];
  const evaluations: InvocationEvaluation[] = [];
  const merged: Observation[] = [];

  for (const invocation of view.records.invocations.values()) {
    const outcome = view.records.outcomes.get(invocation.id) ?? null;
    const observations = await observationsOf(view, invocation.id);
    const lines = await linesOf(view, invocation);
    facts.push({
      id: invocation.id,
      role: invocation.role,
      workItem: invocation.work.workItem ?? null,
      iteration: invocation.work.iteration ?? null,
      request: invocation.work.request ?? null,
      writer: invocation.writer,
      session: outcome?.session?.ref ?? invocation.session.ref,
      outcome,
      size: invocation.scope.size,
      lines,
      observations,
      adaptation: adaptations.get(invocation.id) ?? null,
    });

    const log = Array.isArray(observations) ? observations as readonly Observation[] : [];
    if (Array.isArray(observations)) merged.push(...scoped(invocation.id, log));
    const report = guardingReport(log);
    const hooks = log.filter((line): line is Extract<Observation, { type: 'hook-check' }> => line.type === 'hook-check');
    evaluations.push({
      invocation: invocation.id,
      role: invocation.role,
      workItem: invocation.work.workItem ?? null,
      iteration: invocation.work.iteration ?? null,
      request: invocation.work.request ?? null,
      ended: outcome?.ended ?? null,
      writer: invocation.writer,
      guarding: Array.isArray(observations)
        ? { guarded: [...report.guarded], unguarded: [...report.unguarded], verdicts: { ...report.verdicts }, complete: report.complete, statement: report.statement }
        : {
            guarded: [], unguarded: [], verdicts: { allowed: 0, 'blocked-scope': 0, 'blocked-unresolved': 0 }, complete: false,
            statement: `What this invocation did is not known: ${(observations as { unavailable: string }).unavailable}. No count of blocked calls is evidence about its writes.`,
          },
      outsideScope: [...(outcome?.outsideScope ?? [])],
      hookChecks: {
        passed: hooks.filter(line => line.data.outcome === 'passed').length,
        findings: hooks.filter(line => line.data.outcome === 'findings').length,
        notChecked: hooks.filter(line => line.data.outcome === 'not-checked').length,
        newFindings: hooks.reduce((total, line) => total + line.data.newFindings, 0),
      },
      excursions: [...report.excursions],
      gaps: report.gaps.map(gap => ({ kind: gap.kind, count: gap.count })),
      lines: lines === null
        ? null
        : 'unavailable' in lines
          ? { coverage: 'partial', paths: 0, added: 0, deleted: 0, gaps: [lines.unavailable] }
          : summaryOf(lines),
      usage: outcome === null
        ? { unavailable: 'the invocation has not ended' }
        : 'unavailable' in outcome.usage
          ? { unavailable: outcome.usage.unavailable }
          : { input: outcome.usage.input, cacheRead: outcome.usage.cacheRead, cacheWrite: outcome.usage.cacheWrite, output: outcome.usage.output },
    });
  }

  // One report over every invocation's observations: the tools guarded,
  // the tools that mutated without passing the guard, and the one sentence
  // that refuses to read a count of blocked calls as compliance.
  const run = guardingReport(merged);
  const unreadable = evaluations.filter(evaluation => evaluation.guarding.complete === false && evaluation.guarding.guarded.length === 0 && evaluation.guarding.statement.startsWith('What this invocation did is not known'));
  const complete = run.complete && unreadable.length === 0;
  const statement = complete
    ? run.statement
    : run.complete
      ? `${run.statement} The observation log of ${unreadable.map(evaluation => evaluation.invocation).join(', ')} cannot be read, so the guarded calls may not account for every mutation.`
      : run.statement;
  const guarding = { guarded: [...run.guarded], unguarded: [...run.unguarded], verdicts: { ...run.verdicts }, complete, statement };

  const acceptedIterations = [...view.records.results.values()].filter(result => result.outcome === 'accepted').map(result => result.iteration);
  const accepted = new Set(acceptedIterations);
  // The ratio is attempts over accepted iterations, not every readiness,
  // work-item and final gate that happened elsewhere in the run.
  const gateAttempts = [...view.gates.values()]
    .filter(gate => gate.body.subject.iteration !== undefined && accepted.has(gate.body.subject.iteration))
    .map(gate => gate.body.id);
  const metrics = kpiMetrics({
    baseline: baseline.state === 'measured' ? { bytes: baseline.bytes, snapshot: baseline.snapshot } : { unavailable: baseline.reason },
    invocations: facts,
    gateAttempts,
    acceptedIterations,
  }, guarding);

  return {
    policyVersion: kpiPolicyVersion,
    measurementPolicy: measurementPolicyVersion,
    baseline,
    metrics,
    evaluation: {
      guarding,
      outsideScope: evaluations.flatMap(evaluation => evaluation.outsideScope.map(path => ({
        invocation: evaluation.invocation, role: evaluation.role, workItem: evaluation.workItem, iteration: evaluation.iteration, path,
      }))),
      invocations: evaluations,
    },
  };
}

function summaryOf(lines: LineEventSummary): NonNullable<InvocationEvaluation['lines']> {
  return {
    coverage: lines.coverage,
    paths: lines.paths.length,
    added: lines.paths.reduce((total, path) => total + path.added, 0),
    deleted: lines.paths.reduce((total, path) => total + path.deleted, 0),
    gaps: [...lines.gaps],
  };
}

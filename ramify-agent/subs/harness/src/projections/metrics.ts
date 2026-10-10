import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifySetupLineIdentities, type RecordedSetupDelta, type SetupAddedLineFact, type SetupCandidatePartition, type SetupDeletedLineFact, type SetupLineMappingFacts } from '../kpi/setup-attribution.js';
import { scratchIgnoreRule } from '../work/scratch.js';
import type { CandidateSource, ChangeHistory, LineCommit } from '../../subs/evidence/src/git.js';
import { acceptedCommit } from '../checks/accepted.js';
import { deliveredManifestViewSchema, operationIdentitySchema, scopeSizeViewSchema, recordedChargeSchema, type InvocationEvaluation, type InvocationEfficiency, type MetricsResponse } from '../interfaces/protocol/runs.js';
import { baselineScope, rootModuleOfSnapshot, scopeSize } from '../kpi/capture.js';
import { deliveredChange, type DeliveredChange } from '../kpi/delivered.js';
import { guardingReport } from '../kpi/guarding.js';
import { lineageMetrics, lineagePolicyVersion } from '../kpi/lineage.js';
import { comparableScopeMetrics, kpiMetrics, kpiPolicyVersion, measurementPolicyVersion, type InvocationFacts } from '../kpi/metrics.js';
import { explorationDetails } from '../kpi/exploration.js';
import { invocationTiming } from '../kpi/efficiency.js';
import { observationSchema, type Observation } from '../run/observations.js';
import { invocationSessions } from '../run/sessions.js';
import {
  lineEventSummarySchema, measurementSnapshotSchema, runLayout,
  type Invocation, type InvocationOutcome, type LineEventSummary, type MeasurementSnapshot,
} from '../run/records.js';
import { readRunFile, unsupportedVersion, type RunView } from './inputs.js';
import { lineageInputsOf, modelHistories } from './lineage.js';

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

/**
 * An observation log, or why it cannot be read. `shown` names it in the
 * reason: the path relative to the run's or the standalone session's
 * directory.
 */
export async function readObservationLog(path: string, shown: string): Promise<readonly Observation[] | { unavailable: string }> {
  try {
    const bytes = await readFile(path);
    const lines: Observation[] = [];
    let invalid = 0;
    const completeBytes = bytes.lastIndexOf(10) + 1;
    const complete = completeBytes === bytes.length;
    let start = 0;
    for (let index = 0; index < completeBytes; index++) if (bytes[index] === 10) {
      try {
        const parsed = observationSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, index))));
        if (parsed.success) lines.push(parsed.data);
        else invalid += 1;
      } catch { invalid += 1; }
      start = index + 1;
    }
    if (invalid > 0 || (!complete && bytes.length > 0)) lines.push({ n: lines.reduce((maximum, row) => Math.max(maximum, row.n), 0) + 1,
      at: lines.at(-1)?.at ?? '1970-01-01T00:00:00.000Z', type: 'coverage-gap', data: { kind: 'observation-truncated',
        detail: `${shown}: ${invalid} unreadable rows; trailing partial=${!complete}; known observations retained` } });
    return lines;
  } catch (error) {
    return { unavailable: `${shown} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function observationsOf(view: RunView, id: string): Promise<readonly Observation[] | { unavailable: string }> {
  return readObservationLog(`${view.directory}/${runLayout.observations(id)}`, runLayout.observations(id));
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

/** The repository a run's history is read from. */
export interface RunHistory {
  readonly projectRoot: string;
  readonly changes: ChangeHistory;
  readonly candidates?: CandidateSource | undefined;
}

/** Exact byte proof against Git's independently recorded blob object identity. */
function authenticatedText(text: string, objectId: string | undefined): { hash: string; lines: string[] } | null {
  if (objectId === undefined || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(objectId)) return null;
  const bytes = Buffer.from(text, 'utf8');
  const actual = createHash(objectId.length === 40 ? 'sha1' : 'sha256').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if (actual !== objectId) return null; // Decoded replacement characters cannot impersonate invalid original UTF-8.
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  return { hash: createHash('sha256').update(bytes).digest('hex'), lines };
}
const exactLineHash = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
function projectPath(row: LineCommit): string | null {
  const prefix = row.projectPrefix;
  if (prefix === undefined || row.sourcePath === undefined || (prefix !== '' && (!prefix.endsWith('/') || prefix.startsWith('/')))) return null;
  if (!row.sourcePath.startsWith(prefix)) return null;
  const path = row.sourcePath.slice(prefix.length);
  return path !== '' && !/[\\\0]/.test(path) && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && path.split('/').every(part => part !== '' && part !== '.' && part !== '..') ? path : null;
}

/** Collects complete FINAL/BASE origin partitions before asking the shared pure verifier.
 * Old scripted Git rows, unavailable blob identities and unrecorded setup edits remain unknown.
 */
export async function setupLineIdentitiesOf(view: RunView, history: RunHistory, base: string, final: string): Promise<import('../kpi/delivered.js').HarnessLineIdentities> {
  const chain = [base, ...await history.changes.commitsBetween(history.projectRoot, base, final)];
  if (chain.at(-1) !== final || new Set(chain).size !== chain.length) throw new Error('Complete first-parent revision chain unavailable');
  const candidates: SetupCandidatePartition[] = [];
  const files = await history.changes.changedFiles(history.projectRoot, base, final);
  const partitions: { before: string | null; after: string | null; origins: LineCommit[]; seen: LineCommit[] }[] = [];
  const expand = (ranges: readonly (readonly [number, number])[]) => ranges.flatMap(([start, count]) => Array.from({ length: count }, (_, offset) => start + offset));
  const complete = (expected: readonly number[], rows: readonly LineCommit[]) => rows.length === expected.length && new Set(rows.map(row => row.line)).size === rows.length && rows.every(row => expected.includes(row.line) && chain.includes(row.commit));
  for (const file of files) {
    // A binary path carries no lines, so it has no partitions to verify; the
    // delivered change lists it without line weight.
    if (file.binary) continue;
    const origins = file.after === null || file.added.length === 0 ? [] : await history.changes.lineOrigins(history.projectRoot, base, final, file.after, file.added);
    const seen = file.before === null || file.deleted.length === 0 ? [] : await history.changes.lineLastSeen(history.projectRoot, base, final, file.before, file.deleted);
    if (!complete(expand(file.added), origins) || !complete(expand(file.deleted), seen)) throw new Error('Complete direct-diff line origin identity unavailable');
    for (const row of origins) candidates.push({ commit: row.commit, path: file.after!, kind: 'added' });
    for (const row of seen) {
      const removing = chain[chain.indexOf(row.commit) + 1];
      if (removing === undefined) throw new Error('Deleted BASE line removing commit unavailable');
      candidates.push({ commit: removing, path: file.before!, kind: 'deleted' });
    }
    partitions.push({ before: file.before, after: file.after, origins, seen });
  }
  const blob = async (revision: string, path: string, prefix: string | undefined) => {
    if (history.candidates === undefined || prefix === undefined || (prefix !== '' && (!prefix.endsWith('/') || prefix.startsWith('/') || prefix.split('/').slice(0, -1).some(part => part === '' || part === '.' || part === '..')))) return null;
    // The candidate source names the project's files as the project does.
    const entries = await history.candidates.treeEntries(history.projectRoot, revision);
    const entry = entries.find(value => value.path === path);
    if (entry === undefined) return { hash: null, lines: [] as string[], text: null };
    if (entry.kind !== 'file' || entry.objectId === undefined) return null;
    const text = await history.candidates.readBlob(history.projectRoot, revision, path);
    const authenticated = authenticatedText(text, entry.objectId);
    return authenticated === null ? null : { ...authenticated, text };
  };
  const records: RecordedSetupDelta[] = [];
  const facts: SetupLineMappingFacts[] = [];
  const setup: { id: string; commit: string; path: string; original?: string | null }[] = [];
  for (const event of view.events) {
    if (event.type === 'scratch-setup-complete' && event.data.commit !== null && event.data.appended) {
      const previousCompletion = view.events.filter(value => value.type === 'scratch-setup-complete' && value.sequence < event.sequence).at(-1)?.sequence ?? 0;
      const intents = view.events.filter(value => value.type === 'scratch-setting-up' && value.sequence > previousCompletion && value.sequence < event.sequence);
      const original = intents.length === 1 ? intents[0] : undefined;
      setup.push({ id: `scratch:${event.sequence}`, commit: event.data.commit, path: '.gitignore', ...(original?.type === 'scratch-setting-up' ? { original: original.data.originalIgnoreBase64 } : {}) });
    }
    // The feature-file commits are the harness's alone and are excluded by
    // their recorded commit ids and paths; they need no line identities.
  }
  for (const item of setup) {
    const beforeRevision = chain[chain.indexOf(item.commit) - 1] ?? '';
    const partition = partitions.find(value => value.before === item.path || value.after === item.path);
    const prefix = [...(partition?.origins ?? []), ...(partition?.seen ?? [])].find(row => projectPath(row) !== null)?.projectPrefix;
    const before = beforeRevision === '' ? null : await blob(beforeRevision, item.path, prefix);
    const after = await blob(item.commit, item.path, prefix);
    let sourceAdded: { line: number; hash: string }[] | null = null;
    let sourceDeleted: { line: number; hash: string }[] | null = null;
    if (item.original !== undefined && before !== null && after !== null) {
      const originalBytes = item.original === null ? Buffer.alloc(0) : Buffer.from(item.original, 'base64');
      const originalText = originalBytes.toString('utf8');
      const canonicalOriginal = item.original === null || originalBytes.toString('base64') === item.original;
      const suffix = originalBytes.length === 0 || originalBytes.at(-1) === 10 ? '' : '\n';
      const expected = Buffer.concat([originalBytes, Buffer.from(`${suffix}${scratchIgnoreRule}\n`)]);
      if (canonicalOriginal && Buffer.from(originalText, 'utf8').equals(originalBytes) && (before.text === null ? item.original === null : before.text === originalText) && after.text !== null && Buffer.from(after.text, 'utf8').equals(expected)) {
        // A missing EOF LF changes that exact old line as well as appending the rule.
        const alteredLast = suffix === '' ? 0 : 1;
        sourceDeleted = alteredLast === 0 ? [] : [{ line: before.lines.length, hash: exactLineHash(before.lines.at(-1)!) }];
        sourceAdded = after.lines.slice(before.lines.length - alteredLast).map((line, index) => ({ line: before.lines.length - alteredLast + index + 1, hash: exactLineHash(line) }));
      }
    }
    let finalAdded: SetupAddedLineFact[] | null = null;
    let baseDeleted: SetupDeletedLineFact[] | null = null;
    if (partition !== undefined) {
      const finalBlob = partition.after === null ? null : await blob(final, partition.after, prefix);
      const baseBlob = partition.before === null ? null : await blob(base, partition.before, prefix);
      if (partition.origins.length === 0) finalAdded = [];
      else if (finalBlob !== null) {
        const rows: SetupAddedLineFact[] = [];
        for (const row of partition.origins) {
          const originPath = projectPath(row); const line = finalBlob.lines[row.line - 1];
          if (line === undefined || (row.commit === item.commit && (originPath !== item.path || row.sourceLine === undefined || after === null || after.lines[row.sourceLine - 1] === undefined || exactLineHash(after.lines[row.sourceLine - 1]!) !== exactLineHash(line)))) { rows.length = 0; break; }
          rows.push({ line: row.line, hash: exactLineHash(line), originCommit: row.commit, originPath: originPath ?? '', originLine: row.sourceLine ?? 0, boundary: row.boundary });
        }
        if (rows.length === partition.origins.length) finalAdded = rows;
      }
      if (partition.seen.length === 0) baseDeleted = [];
      else if (baseBlob !== null) {
        const mapped = beforeRevision === base ? partition.seen.map(row => ({ ...row, commit: base, sourceLine: row.line, sourcePath: `${prefix}${partition.before}`, projectPrefix: prefix })) : await history.changes.lineLastSeen(history.projectRoot, base, beforeRevision, partition.before!, files.find(file => file.before === partition.before)!.deleted);
        const byLine = new Map(mapped.map(row => [row.line, row]));
        const rows: SetupDeletedLineFact[] = [];
        for (const row of partition.seen) {
          const removingCommit = chain[chain.indexOf(row.commit) + 1];
          const mappedRow = byLine.get(row.line); const line = baseBlob.lines[row.line - 1];
          if (line === undefined || removingCommit === undefined || (removingCommit === item.commit && (mappedRow?.commit !== beforeRevision || projectPath(mappedRow) === null || mappedRow.sourceLine === undefined || before === null || before.lines[mappedRow.sourceLine - 1] === undefined || exactLineHash(before.lines[mappedRow.sourceLine - 1]!) !== exactLineHash(line)))) { rows.length = 0; break; }
          rows.push({ line: row.line, hash: exactLineHash(line), lastSeenCommit: row.commit, removingCommit, sourceBeforePath: mappedRow === undefined ? '' : projectPath(mappedRow) ?? '', sourceBeforeLine: mappedRow?.commit === beforeRevision ? mappedRow.sourceLine ?? null : null });
        }
        if (rows.length === partition.seen.length) baseDeleted = rows;
      }
    } else { finalAdded = []; baseDeleted = []; }
    records.push({ ...item, runId: view.record.jobId, beforeRevision, beforeBlobHash: before?.hash ?? null, afterBlobHash: after?.hash ?? null, added: sourceAdded, deleted: sourceDeleted });
    facts.push({ recordId: item.id, base, final, beforeRevision, commit: item.commit, beforeBlobHash: before?.hash ?? null, afterBlobHash: after?.hash ?? null,
      sourceAdded, sourceDeleted, beforePath: partition?.before ?? null, afterPath: partition?.after ?? null, finalAdded, baseDeleted });
  }
  return verifySetupLineIdentities({ runId: view.record.jobId, base, final, firstParentCommits: chain, records, facts, candidates });
}

/**
 * The run's delivered change, read from Git through `history`: the run base
 * to its last accepted commit, each commit a gate made with the writer
 * invocations whose work it holds, and the commits and paths the harness
 * wrote itself. Without a history it is unavailable, never zero.
 */
async function deliveredOf(view: RunView, history: RunHistory | undefined, lines: ReadonlyMap<string, InvocationFacts['lines']>): Promise<DeliveredChange> {
  const invocations = [...view.records.invocations.values()];
  const base = view.record.manifest.source?.commit ?? invocations[0]?.base ?? null;
  if (base === null) return { state: 'not-applicable', reason: 'The run names no base commit and started no invocation' };
  let final: string;
  try {
    final = acceptedCommit(view.entries, base);
  } catch (error) {
    return { state: 'unavailable', reason: `The run's last accepted commit cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  const writers = new Map<string, string[]>();
  const harness = new Set<string>();
  const harnessPaths = new Set<string>();
  const seen = new Set<string>();
  let pending: string[] = [];
  for (const event of view.events) {
    if (event.type === 'invocation-started') {
      if (view.records.invocations.get(event.data.invocation)?.writer === true) pending.push(event.data.invocation);
    } else if (event.type === 'scratch-setup-complete') {
      // The scratch commit may hold other edits beside the appended rule;
      // only its verified line identities exclude the harness's delta.
    } else if (event.type === 'scenarios-materialized' || event.type === 'scenarios-reworded') {
      // The harness alone makes these commits, refusing unrelated changes,
      // and it records their exact ids.
      if (event.data.commit !== null) harness.add(event.data.commit);
      if (event.type === 'scenarios-materialized') for (const path of event.data.files) harnessPaths.add(path);
    } else if (event.type === 'scenarios-rewording') {
      // The feature files are the harness's own: a gate commit re-renders
      // them when a binding drops a pending tag, which is no writer's work.
      for (const path of event.data.files) harnessPaths.add(path);
    } else if (event.type === 'gate-attempted' && !seen.has(event.data.gate)) {
      seen.add(event.data.gate);
      // A gate commits what the writers since the previous commit left.
      const commit = view.gates.get(event.data.gate)?.body.commit ?? null;
      if (commit === null || pending.length === 0) continue;
      writers.set(commit, [...(writers.get(commit) ?? []), ...pending]);
      pending = [];
    }
  }
  if (history === undefined) return { state: 'unavailable', reason: 'No Git history is available to read the delivered change from' };
  const recorded = new Map([...lines].map(([id, summary]) => [id, summary === null || 'unavailable' in summary ? null : summary]));
  let harnessDeltas: import('../kpi/delivered.js').HarnessLineIdentities;
  try { harnessDeltas = await setupLineIdentitiesOf(view, history, base, final); }
  catch (error) { return { state: 'unavailable', reason: `Exact setup line attribution unavailable: ${error instanceof Error ? error.message : String(error)}` }; }
  return deliveredChange(history.changes, { projectRoot: history.projectRoot, base, final, writers, harness, harnessPaths, recorded, harnessDeltas });
}

/**
 * The KPIs and lineage measurements of a run with their policy versions and
 * coverage, and its evaluation evidence. `history` answers the delivered
 * change the change weights come from.
 */
export async function metricsOf(view: RunView, history?: RunHistory): Promise<MetricsResponse> {
  const baseline = await baselineOf(view);
  const adaptations = adaptationsOf(view);
  // Invocations are grouped into sessions by the harness session each one
  // started in, never by an executor's ref: a ref names a point in the
  // history, and each invocation of a continued session ends at another.
  const sessions = invocationSessions(view.events);
  const logs = new Map<string, readonly Observation[] | { unavailable: string }>();
  for (const invocation of view.records.invocations.values()) logs.set(invocation.id, await observationsOf(view, invocation.id));
  const lineage = lineageInputsOf(view, logs);
  const histories = modelHistories(lineage);
  const facts: InvocationFacts[] = [];
  const evaluations: InvocationEvaluation[] = [];
  const merged: Observation[] = [];
  const recorded = new Map<string, InvocationFacts['lines']>();
  for (const invocation of view.records.invocations.values()) recorded.set(invocation.id, await linesOf(view, invocation));

  for (const invocation of view.records.invocations.values()) {
    const outcome = view.records.outcomes.get(invocation.id) ?? null;
    const observations = logs.get(invocation.id)!;
    const lines = recorded.get(invocation.id) ?? null;
    facts.push({
      id: invocation.id,
      role: invocation.role,
      workItem: invocation.work.workItem ?? null,
      iteration: invocation.work.iteration ?? null,
      request: invocation.work.request ?? null,
      writer: invocation.writer,
      // Its `invocation-started` commits the invocation record, so every
      // record has a session; the fallback only keeps the type total.
      session: sessions.get(invocation.id) ?? invocation.id,
      history: histories.get(invocation.id),
      outcome,
      size: invocation.scope.size,
      lines,
      observations,
      adaptation: adaptations.get(invocation.id) ?? null,
    });

    if (Array.isArray(observations)) merged.push(...scoped(invocation.id, observations as readonly Observation[]));
    evaluations.push(evaluationOf({ invocation, outcome, observations, lines }));
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
  const delivered = await deliveredOf(view, history, recorded);
  const metrics = kpiMetrics({
    baseline: baseline.state === 'measured' ? { bytes: baseline.bytes, snapshot: baseline.snapshot } : { unavailable: baseline.reason },
    invocations: facts,
    delivered,
    gateAttempts,
    acceptedIterations,
  }, guarding);
  let baselineSize: ReturnType<typeof scopeSize> | { unavailable: string } = { unavailable: baseline.state === 'unavailable' ? baseline.reason : 'Frozen snapshot unavailable' };
  if (!('unavailable' in view.record.baseline)) {
    const text = await readRunFile(view, runLayout.measurement(view.record.baseline.measurement.id));
    let parsed: ReturnType<typeof measurementSnapshotSchema.safeParse> | null = null;
    try { parsed = text === null ? null : measurementSnapshotSchema.safeParse(JSON.parse(text)); } catch { /* baselineOf already reports the unreadable snapshot */ }
    if (parsed?.success) baselineSize = scopeSize(parsed.data, baselineScope(rootModuleOfSnapshot(parsed.data) ?? 'root', parsed.data.supplementary.map(entry => entry.path)));
  }
  const scopeComparisons = comparableScopeMetrics({ baseline: baselineSize, writers: new Map([...view.records.invocations.values()].filter(invocation => invocation.writer).map(invocation => [invocation.id, invocation.scope.size])), delivered });

  return {
    policyVersion: kpiPolicyVersion,
    measurementPolicy: measurementPolicyVersion,
    baseline,
    metrics,
    scopeComparisons: JSON.parse(JSON.stringify(scopeComparisons)) as MetricsResponse['scopeComparisons'],
    lineage: { policyVersion: lineagePolicyVersion, metrics: lineageMetrics(lineage) },
    evaluation: {
      guarding,
      outsideScope: evaluations.flatMap(evaluation => evaluation.outsideScope.map(path => ({
        invocation: evaluation.invocation, role: evaluation.role, workItem: evaluation.workItem, iteration: evaluation.iteration, path,
      }))),
      invocations: evaluations,
    },
  };
}

/** What one invocation's evaluation is computed from. */
export interface EvaluationInputs {
  readonly invocation: Pick<Invocation, 'id' | 'role' | 'work' | 'writer'> & Partial<Pick<Invocation, 'startedAt' | 'prompt' | 'scope' | 'sessionOperation'>>;
  readonly outcome: Pick<InvocationOutcome, 'ended' | 'outsideScope' | 'usage'> & Partial<Pick<InvocationOutcome, 'elapsedMs' | 'settled' | 'sessionOperation'>> | null;
  readonly observations: readonly Observation[] | { unavailable: string };
  /** Its line events; null for an invocation that held no writer. */
  readonly lines: InvocationFacts['lines'];
}

/** Immutable measurements use original invocation boundaries and recorded source facts only. */
function efficiencyOf({ invocation, outcome, observations }: EvaluationInputs): InvocationEfficiency {
  const log = Array.isArray(observations) ? observations as readonly Observation[] : [];
  const coverage = new Set<string>();
  if (!Array.isArray(observations)) coverage.add((observations as { unavailable: string }).unavailable);
  for (const row of log) if (row.type === 'coverage-gap') coverage.add(`${row.data.kind}: ${row.data.detail}`);
  const unique = new Map<string, Observation>();
  const conflicts = new Set<string>();
  for (const row of log) {
    const key = row.sourceId === undefined ? `row:${row.n}` : `${row.type}:${row.sourceId}`;
    if (conflicts.has(key)) continue;
    const prior = unique.get(key);
    if (prior === undefined) unique.set(key, row);
    else if (JSON.stringify(prior.data) !== JSON.stringify(row.data)) {
      coverage.add(`${key}: conflicting source observation; excluded`);
      unique.delete(key); conflicts.add(key);
    }
  }
  const rows = [...unique.values()];
  const exploration = explorationDetails(rows.filter(row => row.type === 'exploration').map(row => row.data), [...coverage]);
  const usage = rows.filter(row => row.type === 'usage');
  const modelDurations = rows.filter(row => row.type === 'model-duration');
  const modelValues = modelDurations.length > 0 ? modelDurations.map(row => row.data.elapsedMs) : usage.map(row => row.data.modelElapsedMs);
  const charges = usage.flatMap(row => row.data.charge === null ? [] : [row.data.charge]);
  if (usage.length === 0) coverage.add('Usage and recorded model rates unavailable');
  if (usage.some(row => row.data.charge === null)) coverage.add('Some usage has no recorded rates');
  const milestone = rows.find(row => row.type === 'milestone');
  const durations = rows.filter(row => row.type === 'tool-duration');
  const starts = rows.filter(row => row.type === 'tool-start');
  const collectionIncomplete = [...coverage].some(reason => /observation-truncated|conflicting/.test(reason));
  // Every started call has a known duration: a log of no calls is complete
  // at 0 ms, while an unreadable or torn log is not.
  const completeTools = Array.isArray(observations) && !collectionIncomplete && starts.every(start => durations.some(row => row.data.callId === start.data.callId && row.data.elapsedMs !== null));
  const toolSubtotalMs = durations.reduce((sum, row) => sum + (row.data.elapsedMs ?? 0), 0);
  const timed = invocationTiming({ startedAt: invocation.startedAt ?? '', endedAt: outcome?.settled?.at ?? null,
    milestone: milestone?.data.kind ?? null, milestoneAt: milestone?.data.at ?? null,
    modelElapsedMs: !collectionIncomplete && modelValues.length > 0 && modelValues.every(value => value !== null) ? modelValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    checkElapsedMs: null, exploration: exploration.observations, coverage: [...coverage, 'Check durations are not recorded'] });
  // One entry for the tool duration, over every tool call: the exploration
  // calls' own subtotal stays with the exploration metrics.
  const timing = { ...timed, coverage: [...timed.coverage.filter(reason => !reason.startsWith('tool duration: known subtotal')),
    ...(completeTools ? [] : [`tool duration: known subtotal ${toolSubtotalMs} ms over ${durations.filter(row => row.data.elapsedMs !== null).length} of ${starts.length} tool calls; total unavailable`])] };
  const manifest = deliveredManifestViewSchema.safeParse(invocation.prompt?.manifest);
  const declared = scopeSizeViewSchema.safeParse(invocation.scope?.size);
  const readScope = scopeSizeViewSchema.safeParse(invocation.scope?.readSize);
  const operation = operationIdentitySchema.safeParse({ ...invocation.sessionOperation, ...(outcome?.sessionOperation?.point === undefined ? {} : { point: outcome.sessionOperation.point }) });
  if (!manifest.success) coverage.add('Actual delivered input manifest unavailable');
  if (!declared.success) coverage.add('Declared scope size unavailable');
  if (!operation.success) coverage.add('Original operation identity unavailable');
  if (!readScope.success) coverage.add('Declared read scope byte size unavailable; returned output bytes are not scanned or source bytes');
  const chargeSubtotal = charges.reduce((sum, charge) => sum + [charge.newInput, charge.cachedInput, charge.cacheWrite, charge.output].reduce<number>((amount, value) => amount + (value ?? 0), 0), 0);
  const completeCharges = usage.length > 0 && charges.length === usage.length && charges.every(charge => charge.total !== null) && ![...coverage].some(reason => /usage|truncated|conflicting/i.test(reason));
  return { operation: operation.success ? operation.data : null, manifest: manifest.success ? manifest.data : null,
    declared: declared.success ? declared.data : null, readScope: readScope.success ? readScope.data : null,
    exploration: { metrics: { ...exploration.metrics, coverage: [...exploration.metrics.coverage] }, zeroMatchSearches: exploration.zeroMatchSearches,
      observations: exploration.observations.map(row => ({ ...row, requestedScope: [...row.requestedScope], resolvedScope: row.resolvedScope === null ? null : [...row.resolvedScope], files: row.files === null ? null : [...row.files], coverage: [...row.coverage] })) },
    timing: { ...timing, toolElapsedMs: completeTools ? toolSubtotalMs : null, toolSubtotalMs, modelSubtotalMs: modelValues.reduce<number>((sum, value) => sum + (value ?? 0), 0), checkSubtotalMs: 0, coverage: [...timing.coverage] }, charges: charges.map(charge => recordedChargeSchema.parse(charge)), chargeTotal: completeCharges ? chargeSubtotal : null, chargeSubtotal, coverage: [...coverage],
    units: { scope: 'bytes', returned: 'UTF-8 output bytes', duration: 'ms', charge: 'USD' } };
}

/**
 * One invocation's evaluation evidence: guarding, what changed outside its
 * scope, hook checks, reads outside it, lines and tokens. It is pure.
 */
export function evaluationOf({ invocation, outcome, observations, lines }: EvaluationInputs): InvocationEvaluation {
  const log = Array.isArray(observations) ? observations as readonly Observation[] : [];
  const report = guardingReport(log);
  const hooks = log.filter((line): line is Extract<Observation, { type: 'hook-check' }> => line.type === 'hook-check');
  return {
    invocation: invocation.id,
    role: invocation.role,
    workItem: invocation.work.workItem ?? null,
    iteration: invocation.work.iteration ?? null,
    request: invocation.work.request ?? null,
    ended: outcome?.ended ?? null,
    writer: invocation.writer,
    efficiency: efficiencyOf({ invocation, outcome, observations, lines }),
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
  };
}

/** One invocation's evaluation, read from its observation log, its line events and its outcome. */
export async function invocationEvaluation(view: RunView, invocation: Invocation): Promise<InvocationEvaluation> {
  return evaluationOf({
    invocation,
    outcome: view.records.outcomes.get(invocation.id) ?? null,
    observations: await observationsOf(view, invocation.id),
    lines: await linesOf(view, invocation),
  });
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

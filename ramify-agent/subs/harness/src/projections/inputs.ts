import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { hypothesisSchema, type Hypothesis } from '../analysis/records.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { jobSchemaVersion, jobsDirectory } from '../jobs/records.js';
import { runPolicyVersion } from '../run/policy.js';
import type { RunEvent } from '../run/log.js';
import {
  entryAssignmentsSchema, gateAttemptSchema, gateAuditOutcomeSchema, runLayout, runRecordSchema,
  type EntryAssignments, type RunRecord,
} from '../run/records.js';
import { committedRecords, CommittedRecordError, type CommittedRecords } from '../work/committed.js';
import { workItemOutlineSchema, type WorkItemOutline } from '../work/records.js';
import { contractRecordSchema, type ContractRecord } from '../contracts/records.js';
import { iterationAssignmentSchema, type IterationAssignment } from '../work/iterations.js';

/*
 * What every projection of a run is computed from: the run's `job.json`, the
 * complete lines of its log with the record bodies each one committed, and
 * the run's own files, read and never written.
 *
 * A projection is a pure function of these. It appends no event, writes no
 * file and infers no transition, so a client that reads a run while it runs,
 * one that reconnects afterwards and one that reads it after a restart of the
 * harness all read the same thing.
 *
 * A record is read as the log committed it and validated again. A record
 * whose schema version this harness does not read is a failure with
 * evidence, `unsupported-version`, and never an absent record.
 */

/** One complete line of the log, as the service replays it. */
export interface CommittedLine {
  readonly sequence: number;
  readonly at: string;
  readonly transaction: {
    readonly event: RunEvent;
    readonly records: ReadonlyArray<{ readonly path: string; readonly id: string; readonly revision: number; readonly body: unknown }>;
  };
}

/** One run as the service holds it: its record, its directory and its log. */
export interface CommittedRun {
  readonly record: RunRecord;
  readonly directory: string;
  readonly entries: readonly CommittedLine[];
}

/** A query the projection cannot answer, with the protocol's code and the evidence for it. */
export class ProjectionError extends Error {
  constructor(
    readonly code: 'not-found' | 'unreadable' | 'unsupported-version' | 'invalid-request' | 'stale-version',
    message: string,
    readonly evidence: readonly string[] = [],
    /** The run's version, on a `stale-version` refusal of a query that named another. */
    readonly currentVersion?: number,
  ) {
    super(message);
    this.name = 'ProjectionError';
  }
}

/** One committed body of one schema, with where and when the log committed it. */
export interface CommittedBody<T> {
  readonly body: T;
  readonly path: string;
  readonly sequence: number;
  readonly at: string;
}

/** Everything a projection reads of one run, derived once per query. */
export interface RunView {
  readonly record: RunRecord;
  readonly directory: string;
  readonly events: readonly RunEvent[];
  readonly entries: readonly CommittedLine[];
  /** Each record at its latest committed revision, as the harness itself reads them. */
  readonly records: CommittedRecords;
  readonly entryAssignments: EntryAssignments | null;
  /** Every hypothesis revision, oldest first: revision 1 is never rewritten. */
  readonly hypothesisRevisions: readonly CommittedBody<Hypothesis>[];
  readonly outlines: readonly CommittedBody<WorkItemOutline>[];
  readonly assignments: readonly CommittedBody<IterationAssignment>[];
  readonly contracts: readonly CommittedBody<ContractRecord>[];
  /** Each gate attempt at the last body the log committed for it, in the order of their first commit. */
  readonly gates: ReadonlyMap<string, CommittedBody<z.infer<typeof gateAttemptSchema>>>;
  readonly gateAuditOutcomes: ReadonlyMap<string, CommittedBody<z.infer<typeof gateAuditOutcomeSchema>>>;
}

/**
 * The record families a projection reads, each at the one version this
 * harness supports. A body that names one of these families at another
 * version is refused with evidence rather than skipped.
 */
const supported: Readonly<Record<string, string>> = Object.fromEntries([
  'ramify-agent.hypothesis/1', 'ramify-agent.capability/1', 'ramify-agent.work-item/1',
  'ramify-agent.work-item-outline/1', 'ramify-agent.iteration-assignment/1', 'ramify-agent.iteration-result/1',
  'ramify-agent.invocation/1', 'ramify-agent.invocation-outcome/1', 'ramify-agent.placement-request/1',
  'ramify-agent.placement-decision/1', 'ramify-agent.contract/2', 'ramify-agent.provider-obligation/1',
  'ramify-agent.consumer-requirement/1', 'ramify-agent.gate-attempt/3', 'ramify-agent.gate-audit-outcome/1', 'ramify-agent.entry-assignments/1',
  'ramify-agent.readiness-attempt/1', 'ramify-agent.infrastructure-recovery/1', 'ramify-agent.measurement-snapshot/1',
  'ramify-agent.line-events/1', 'ramify-agent.scenario/1', 'ramify-agent.unresolved-request/1', 'ramify-agent.plan-deviation/1',
  'ramify-agent.environment-problem/1', 'ramify-agent.prepared-candidate/1',
  'ramify-agent.nonfunctional-assessment/1', 'ramify-agent.nonfunctional-round/1',
  'ramify-agent.nonfunctional-deviation/1',
  'ramify-agent.capability-request/1', 'ramify-agent.capability-task/1', 'ramify-agent.capability-plan/1',
  'ramify-agent.capability-exchange/1', 'ramify-agent.capability-assignment/1',
  'ramify-agent.capability-handback/1', 'ramify-agent.capability-review/1',
].map(schema => [familyOf(schema), schema]));

function familyOf(schema: string): string {
  return schema.replace(/\/\d+$/, '');
}

/** Why a declared schema is refused, or null when this harness reads it or does not project that family. */
export function unsupportedVersion(declared: unknown): string | null {
  if (typeof declared !== 'string') return null;
  const expected = supported[familyOf(declared)];
  return expected === undefined || expected === declared ? null : expected;
}

/** The view every projection of one run is computed from. */
export function runView(run: CommittedRun): RunView {
  const gates = new Map<string, CommittedBody<z.infer<typeof gateAttemptSchema>>>();
  const gateAuditOutcomes = new Map<string, CommittedBody<z.infer<typeof gateAuditOutcomeSchema>>>();
  const hypothesisRevisions: CommittedBody<Hypothesis>[] = [];
  const outlines: CommittedBody<WorkItemOutline>[] = [];
  const assignments: CommittedBody<IterationAssignment>[] = [];
  const contracts: CommittedBody<ContractRecord>[] = [];
  let entryAssignments: EntryAssignments | null = null;

  for (const line of run.entries) {
    for (const record of line.transaction.records) {
      const declared = (record.body as { schema?: unknown } | null)?.schema;
      const expected = unsupportedVersion(declared);
      if (expected !== null) {
        throw new ProjectionError(
          'unsupported-version',
          `The record ${record.path} of run ${run.record.jobId} declares ${String(declared)}; this harness reads ${expected}`,
          [join(relativeRun(run), record.path), `declares ${String(declared)}`, `committed by event ${line.sequence} (${line.transaction.event.type})`],
        );
      }
      const at = { path: record.path, sequence: line.sequence, at: line.at };
      switch (declared) {
        case 'ramify-agent.gate-attempt/3': {
          const body = parse(gateAttemptSchema, record.body, run, record.path);
          gates.delete(body.id);
          gates.set(body.id, { body, ...at });
          break;
        }
        case 'ramify-agent.gate-audit-outcome/1': {
          const body = parse(gateAuditOutcomeSchema, record.body, run, record.path);
          gateAuditOutcomes.set(body.gate, { body, ...at });
          break;
        }
        case 'ramify-agent.hypothesis/1':
          hypothesisRevisions.push({ body: parse(hypothesisSchema, record.body, run, record.path), ...at });
          break;
        case 'ramify-agent.work-item-outline/1':
          outlines.push({ body: parse(workItemOutlineSchema, record.body, run, record.path), ...at });
          break;
        case 'ramify-agent.iteration-assignment/1':
          assignments.push({ body: parse(iterationAssignmentSchema, record.body, run, record.path), ...at });
          break;
        case 'ramify-agent.contract/2':
          contracts.push({ body: parse(contractRecordSchema, record.body, run, record.path), ...at });
          break;
        case 'ramify-agent.entry-assignments/1':
          entryAssignments = parse(entryAssignmentsSchema, record.body, run, record.path);
          break;
        default:
          break;
      }
    }
  }

  let records: CommittedRecords;
  try {
    records = committedRecords(run.entries);
  } catch (error) {
    if (error instanceof CommittedRecordError) {
      throw new ProjectionError('unreadable', `A record of run ${run.record.jobId} no longer satisfies its schema: ${error.message}`, [join(relativeRun(run), error.path), ...error.errors]);
    }
    throw error;
  }

  // A gate committed first as an intent and completed later keeps the place
  // of its first commit.
  const ordered = new Map([...gates.values()].sort((a, b) => firstSequence(run, a.body.id) - firstSequence(run, b.body.id)).map(gate => [gate.body.id, gate]));

  return {
    record: run.record,
    directory: run.directory,
    events: run.entries.map(line => line.transaction.event),
    entries: run.entries,
    records,
    entryAssignments,
    hypothesisRevisions,
    outlines,
    assignments,
    contracts,
    gates: ordered,
    gateAuditOutcomes,
  };
}

function firstSequence(run: CommittedRun, gate: string): number {
  for (const line of run.entries) {
    if (line.transaction.records.some(record => (record.body as { schema?: unknown; id?: unknown } | null)?.schema === 'ramify-agent.gate-attempt/3'
      && (record.body as { id?: unknown }).id === gate)) return line.sequence;
  }
  return Number.MAX_SAFE_INTEGER;
}

function parse<T>(schema: z.ZodType<T>, body: unknown, run: CommittedRun, path: string): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new ProjectionError(
    'unreadable',
    `The record ${path} of run ${run.record.jobId} no longer satisfies its schema`,
    [join(relativeRun(run), path), ...result.error.issues.map(issue => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)],
  );
}

/** The run's directory relative to the project, as evidence names it. */
function relativeRun(run: CommittedRun): string {
  return join('plans', run.record.planId, '.harness', 'jobs', run.record.jobId);
}

/**
 * Why a run the service does not serve exists anyway, or null when there is
 * no such run. A run directory whose `job.json` declares a version this
 * harness does not read is `unsupported-version` with the schema it
 * declares, never `not-found`. It reads and writes nothing else.
 */
export async function unservedRun(projectRoot: string, planId: string, runId: string): Promise<ProjectionError | null> {
  if (!planIdSchema.safeParse(planId).success || !jobIdSchema.safeParse(runId).success) return null;
  const path = join(jobsDirectory(projectRoot, planId), runId, runLayout.record);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
  const shown = relative(projectRoot, path);
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    return new ProjectionError('unreadable', `${shown} is not JSON`, [shown]);
  }
  const recordedPolicy = (document as { policy?: { version?: unknown } } | null)?.policy?.version;
  if (recordedPolicy !== runPolicyVersion) {
    return new ProjectionError('unsupported-version', `Run policy ${String(recordedPolicy ?? '(missing policy)')} is refused by ${runPolicyVersion}; a fresh run is required`, [shown]);
  }
  const declared = (document as { schema?: unknown } | null)?.schema;
  if (declared !== jobSchemaVersion) {
    return new ProjectionError(
      'unsupported-version',
      `Run ${runId} declares ${typeof declared === 'string' ? declared : 'no schema'} in ${shown}; this harness reads ${jobSchemaVersion}`,
      [shown, `declares ${typeof declared === 'string' ? declared : 'no schema'}`],
    );
  }
  const parsed = runRecordSchema.safeParse(document);
  // A valid record the service does not hold yet is a run being created.
  if (parsed.success) return null;
  return new ProjectionError(
    'unreadable',
    `${shown} declares ${jobSchemaVersion} and does not satisfy it`,
    [shown, ...parsed.error.issues.map(issue => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)],
  );
}

/** Every run directory of one plan that the service does not serve, with why. */
export async function unservedRuns(projectRoot: string, planId: string, served: ReadonlySet<string>): Promise<Array<{ jobId: string; path: string; error: ProjectionError }>> {
  let names: string[];
  try {
    names = (await readdir(jobsDirectory(projectRoot, planId), { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && jobIdSchema.safeParse(entry.name).success)
      .map(entry => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    throw error;
  }
  const found: Array<{ jobId: string; path: string; error: ProjectionError }> = [];
  for (const name of names) {
    if (served.has(name)) continue;
    const error = await unservedRun(projectRoot, planId, name);
    if (error !== null) found.push({ jobId: name, path: relative(projectRoot, join(jobsDirectory(projectRoot, planId), name, runLayout.record)), error });
  }
  return found;
}

/** A file of the run, relative to its directory, or null when it is not there. */
export async function readRunFile(view: RunView, path: string): Promise<string | null> {
  try {
    return await readFile(join(view.directory, path), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

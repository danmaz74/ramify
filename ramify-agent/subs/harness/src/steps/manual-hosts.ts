import { readFile } from 'node:fs/promises';
import type { ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import type { CandidateSource, GitService } from '../../subs/evidence/src/git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { RunFailureReason } from '../interfaces/protocol/runs.js';
import { canonicalJson } from '../jobs/commands.js';
import { commitRecord, type RecordRef as CommitRecord } from '../jobs/commit.js';
import { sha256 } from '../prompts/packages.js';
import { AfterHandling } from '../run/after-handling.js';
import { CommittingGates } from '../run/committing-gate.js';
import { trackedScenarios } from '../run/feature-files.js';
import type { RunEvent, RunEventInput, RunLog } from '../run/log.js';
import { runLayout } from '../run/records.js';
import type { ManualRun } from './manual.js';

/*
 * The committing gates and the after-handling an implementation run uses,
 * hosted by a manual run. A manual run writes through the same ledger
 * transactions; it has no driver to notify, no stop and no readers to wake,
 * and what only an implementation run can supply, such as a plan's
 * deviations or a correction's close, is an error with its reason rather
 * than a substitute.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A handling step a manual run cannot take, or a failure the run would end with: the command stops with its detail. */
export class HandlingStopped extends Error {
  constructor(readonly reason: RunFailureReason | 'not-run', detail: string, readonly records: readonly string[] = []) {
    super(detail);
    this.name = 'HandlingStopped';
  }
}

/** What a manual run's hosts are built from. */
export interface ManualHostContext {
  readonly projectRoot: string;
  readonly git: GitService;
  readonly candidates: CandidateSource;
  readonly ramify: RamifyCli;
  readonly configuredAudit: ConfiguredAuditPort;
  /** The architect view as the project stands now. */
  readonly refresh: (projectRoot: string) => Promise<ArchitectIndex | null>;
  readonly warn: (text: string) => void;
}

/** One write to the manual run's ledger, as the invocation runner commits it. */
export function manualWrite(run: ManualRun, input: RunEventInput, records: readonly CommitRecord[] = []): Promise<'committed' | 'already-committed' | 'ended'> {
  return run.mutex.run(async () => {
    if (run.log.terminal) return 'ended';
    if (records.length === 0) {
      await run.log.append(input);
      return 'committed';
    }
    return commitRecord(run.log.ledger, { event: run.log.next(input), records: [...records] });
  });
}

/** The committing gates over a manual run. */
export function manualGates(context: ManualHostContext): CommittingGates<ManualRun> {
  return new CommittingGates<ManualRun>({
    projectRoot: context.projectRoot,
    git: context.git,
    ramify: context.ramify,
    configuredAudit: context.configuredAudit,
    write: manualWrite,
    afterWrite: async () => undefined,
    warn: context.warn,
    // A manual run captures no plan documents: its tracked feature files are what only the harness writes.
    harnessFiles: async run => trackedScenarios(run.log.ledger.replay()).records.map(record => record.file),
    // A manual run captured no audit definition at its start; the candidate's committed one is read.
    auditDefinition: async (_run, sourceCommit) => context.configuredAudit.read(context.projectRoot, sourceCommit),
    previewCandidateTree: () => context.git.previewCandidateTree(context.projectRoot),
    candidates: context.candidates,
    refreshIndex: async run => {
      try {
        const index = await context.refresh(context.projectRoot);
        if (index !== null) run.index = index;
        return index;
      } catch (error) {
        context.warn(`Manual run ${run.jobId}: the architect view could not be refreshed: ${message(error)}`);
        return null;
      }
    },
    ignoring: () => false,
  });
}

/** The after-handling over a manual run, with its gates. */
export function manualHandling(context: ManualHostContext, gates: CommittingGates<ManualRun>): AfterHandling<ManualRun> {
  return new AfterHandling<ManualRun>({
    projectRoot: context.projectRoot,
    git: context.git,
    candidates: context.candidates,
    gates,
    write: manualWrite,
    afterWrite: async () => undefined,
    warn: context.warn,
    ignoring: () => false,
    fail: async (_run, reason, detail, records) => { throw new HandlingStopped(reason, detail, records); },
    closeCorrection: async (_run, workItem, closing) => {
      throw new HandlingStopped('not-run', `${closing.data.iteration} corrects reconciliation ${closing.corrects} of ${workItem}; closing a correction claims its CheckFindings' repair, which only an implementation run applies`);
    },
    citeCurrentDeviations: async () => {
      throw new Error('a manual run holds no element catalog, so no plan deviation is cited');
    },
    orientationIdentity: () => 'a manual run keys no design orientation; run the orientation as its own step, or the review starts fresh',
    wakeReviews: () => undefined,
  });
}

/** One invocation's accepted submission, read from its file and checked against the hash its end recorded. */
export async function acceptedSubmission(run: ManualRun, invocation: string): Promise<
  | { readonly ok: true; readonly role: string; readonly started: RunEvent & { type: 'invocation-started' }; readonly raw: Record<string, unknown>; readonly hash: string }
  | { readonly ok: false; readonly reason: string }
> {
  const started = run.log.all('invocation-started').find(event => event.data.invocation === invocation);
  if (started === undefined) return { ok: false, reason: `the manual run records no invocation ${invocation}` };
  const ended = run.log.all('invocation-ended').find(event => event.data.invocation === invocation);
  if (ended === undefined) return { ok: false, reason: `invocation ${invocation} has not ended` };
  if (ended.data.ended !== 'submitted' || ended.data.submission === null) {
    return { ok: false, reason: `invocation ${invocation} ended ${ended.data.ended} with no accepted submission` };
  }
  let bytes: Buffer;
  try { bytes = await readFile(run.path(runLayout.submission(invocation))); }
  catch (error) { return { ok: false, reason: `the accepted submission of ${invocation} cannot be read: ${message(error)}` }; }
  if (sha256(bytes) !== ended.data.submission) {
    return { ok: false, reason: `the submission file of ${invocation} changed after it was accepted: it no longer has the hash ${ended.data.submission} its end recorded` };
  }
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { return { ok: false, reason: `the accepted submission of ${invocation} is not JSON` }; }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: `the accepted submission of ${invocation} is not an object` };
  return { ok: true, role: started.data.role, started, raw: raw as Record<string, unknown>, hash: ended.data.submission };
}

/** The value of an accepted submission without the schema literal the harness stores beside it. */
export function submissionValue(raw: Record<string, unknown>): Record<string, unknown> {
  const { schema: _schema, ...value } = raw;
  return value;
}

/** The last transition the manual run's log holds, as a reader names it. */
export function lastTransition(log: RunLog): string {
  const last = log.events.at(-1);
  return last === undefined ? 'none: the log is empty' : `#${last.sequence} ${last.type}`;
}

/** Whether two bodies are the same record. */
export function sameBody(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

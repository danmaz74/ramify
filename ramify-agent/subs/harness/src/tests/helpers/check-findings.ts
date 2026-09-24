import { join } from 'node:path';
import type {
  CheckFindingAction, CheckFindingCommand, CheckFindingDecisionInput, CheckFindingId,
} from '../../../subs/check-findings/src/interfaces/check-findings.js';
import { nodeFileSystem, type LedgerFileSystem } from '../../../subs/ledger/src/fs.js';
import type { CheckFindingCause } from '../../check-findings/records.js';
import { reportCommand, type BoundReport } from '../../check-findings/report.js';
import type { CheckFindingBuild, CheckFindingTarget } from '../../check-findings/transition.js';
import { Mutex } from '../../jobs/mutex.js';
import { RunLog } from '../../run/log.js';

/*
 * CheckFinding reports and decisions as a trusted producer integration binds
 * them, for the harness's ledger tests, and a run log with its mutex on a
 * directory of its own. The content hash is always the harness's own.
 */

export const runId = '20260924T120000Z-cf0002';

/** A run log and mutex over `directory`, through the ledger's file system seam when one is given. */
export async function checkFindingTarget(directory: string, fs?: LedgerFileSystem): Promise<CheckFindingTarget & { readonly log: RunLog }> {
  return { mutex: new Mutex(), log: await RunLog.open(join(directory, 'events.jsonl'), runId, fs) };
}

/** A running run's first line, so a log is not empty. */
export async function started(log: RunLog): Promise<void> {
  await log.append({
    type: 'job-started',
    data: { command: { commandId: 'start', contentHash: 'h', receipt: { commandId: 'start', jobId: runId, sequence: 1, acceptedAt: '2026-09-24T12:00:00.000Z' } } },
  });
}

export interface ConcernOptions {
  readonly attempt?: string;
  readonly key?: string;
  readonly summary?: string;
  readonly workItem?: string;
  readonly tree?: string;
}

/** A reviewer's concern, bound as the review integration binds it (appendix §3.4). */
export function concern(options: ConcernOptions = {}): BoundReport {
  const attempt = options.attempt ?? 'rq-0001.a01';
  const summary = options.summary ?? 'The discount is applied twice when a coupon is present';
  return {
    producer: 'review:code',
    attempt,
    reportKey: options.key ?? 'concern-01',
    owner: { kind: 'work-item', workItem: options.workItem ?? 'wi-001' },
    source: { kind: 'tree', id: options.tree ?? 't-01' },
    issueKey: null,
    verification: { kind: 'assessment' },
    observation: {
      kind: 'review-concern',
      summary,
      evidence: [{ kind: 'review-submission', ref: `reviews/${attempt}/submission.json`, hash: null }],
      locations: [{ path: 'src/cart.ts', startLine: 10, endLine: 20 }],
    },
    judgment: {
      actor: { kind: 'agent', role: 'reviewer', invocation: 'inv-0010' },
      consequence: `${summary}: the behavior differs from the assignment`,
      rationale: 'read the frozen candidate diff',
      uncertainty: 'moderate',
      remedy: 'a bounded change in the named file',
    },
    suggests: null,
  };
}

/** A failed required scenario, bound with its stable issue key as the scenario adapter would. */
export function failure(options: { readonly attempt: string; readonly subject: string; readonly tree: string; readonly revision?: number }): BoundReport {
  return {
    producer: 'check:scenario',
    attempt: options.attempt,
    reportKey: options.subject,
    owner: { kind: 'work-item', workItem: 'wi-001' },
    source: { kind: 'tree', id: options.tree },
    issueKey: options.subject,
    verification: { kind: 'check', producer: 'check:scenario', obligation: { subject: options.subject, revision: options.revision ?? 1 }, selection: 'quick/identity', required: true },
    observation: { kind: 'check-failed', summary: `${options.subject} failed at its step 3`, evidence: [], locations: [] },
    judgment: null,
    suggests: null,
  };
}

export const report = (bound: BoundReport): CheckFindingCommand => reportCommand(bound);

export function decision(action: CheckFindingAction, overrides: Partial<CheckFindingDecisionInput> = {}): CheckFindingDecisionInput {
  return {
    actor: { kind: 'agent', role: 'local-architect', invocation: 'inv-0020' },
    source: { kind: 'tree', id: 't-01' },
    rationale: `the architect chose ${action.action}`,
    evidence: [],
    communication: { mode: 'quiet' },
    decision: action,
    ...overrides,
  };
}

export function dispose(checkFinding: CheckFindingId, expectedRevision: number, input: CheckFindingDecisionInput): CheckFindingCommand {
  return { type: 'dispose', checkFinding, expectedRevision, decision: input };
}

export const producerCause = (attempt = 'rq-0001.a01'): CheckFindingCause => ({ kind: 'producer', producer: 'review:code', attempt });

/** A build that records its commands on a `check-findings-recorded` line with this cause. */
export function recorded(commands: readonly CheckFindingCommand[], cause: CheckFindingCause = producerCause()): CheckFindingBuild {
  return () => ({
    commands,
    compose: decided => ({ event: { type: 'check-findings-recorded', data: { cause, checkFindings: [...decided.events] } } }),
  });
}

/** The name of one file system operation a crash can interrupt. */
export type FaultPoint = string;

/** A crash at one operation, distinguishable from a real failure. */
export class InjectedFault extends Error {
  constructor(readonly point: FaultPoint, readonly index: number) {
    super(`injected fault at operation ${index}: ${point}`);
    this.name = 'InjectedFault';
  }
}

/**
 * The ledger's file system with every write, flush, rename and directory
 * sync announced to `hook`, which throws to crash there. Reads pass through.
 */
export function faulting(hook: (point: FaultPoint, index: number) => void, base: LedgerFileSystem = nodeFileSystem): LedgerFileSystem {
  let index = 0;
  const gate = (point: FaultPoint): void => {
    index += 1;
    hook(point, index);
  };
  return {
    async open(path, flags) {
      const handle = await base.open(path, flags);
      return {
        async write(data) { gate(`write:${path}`); await handle.write(data); },
        async datasync() { gate(`flush:${path}`); await handle.datasync(); },
        async sync() { gate(`sync:${path}`); await handle.sync(); },
        close: () => handle.close(),
      };
    },
    readFile: path => base.readFile(path),
    size: path => base.size(path),
    async rename(from, to) { gate(`rename:${to}`); await base.rename(from, to); },
    remove: path => base.remove(path),
    mkdir: path => base.mkdir(path),
    truncate: (path, length) => base.truncate(path, length),
  };
}

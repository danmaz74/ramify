import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { RunControl, AnalysisReport } from '../../analysis/src/interfaces/analysis.js';
import type { CheckOutcome, ContextRevision, ContextToken, ExpectedContent, PathCheckDisposition } from '../../daemon/src/context-types.js';
import type { CheckDocument, CheckedPath, CliEnvironment, CliExitCode, NotCheckedReason } from './interfaces/cli.js';
import { capabilities } from './command-support.js';
import { formatChangedHuman } from './format.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

interface ChangedArguments {
  readonly root?: string;
  readonly changed: readonly string[];
  readonly since?: string;
  readonly deadlineMs?: number;
  readonly format: 'human' | 'json';
}

const missing = (error: unknown): boolean => error instanceof Error && 'code' in error
  && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/** Resolve existing ancestors as well, so deleted files under symlinks retain
 * the same canonical identity as their earlier observations. */
async function canonicalPath(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if (!missing(error)) throw error;
    const parent = dirname(path);
    return parent === path ? path : resolve(await canonicalPath(parent), relative(parent, path));
  }
}

const reasons: readonly NotCheckedReason[] = ['cold', 'deadline-exceeded', 'unobserved-input', 'superseded',
  'incomplete', 'unavailable', 'stopped', 'incompatible', 'evicted-revision', 'resource-unavailable', 'analysis-failed',
  'unknown-context', 'expired-generation', 'unsupported-setup', 'disposed'];

/**
 * Hashing belongs to this lightweight client, which cannot classify paths itself: the
 * daemon classifies the named paths by its revision's ownership table, and the client
 * hashes only the paths that classification analyzes. The first request carries no
 * classification; a `classification-changed` answer supplies one, and a request whose
 * classification went stale is retried once more. A reported result is accepted only
 * with a disposition for every named path.
 */
export async function changedCommand(args: ChangedArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  const started = performance.now();
  const deadline = args.deadlineMs ?? 2_000;
  let waitedMs = 0, root = resolve(environment.cwd, args.root ?? '.');
  /** The named spellings until the root is known, then the normalized paths, each once. */
  let paths: readonly string[] = [...new Set(args.changed)];
  let normalized = false;
  /** The daemon's latest classification by path; the sequence it was answered at. */
  let classified = new Map<string, PathCheckDisposition>();
  let classification: number | null = null;
  /** Identities hashed once each: recovery keeps the caller's original expectation. */
  const hashes = new Map<string, string | null>();
  let received: CheckDocument | undefined;
  /** Every path not checked for a reason of the whole request, except paths the daemon classified not analyzed. */
  function notChecked(reason: NotCheckedReason): CheckedPath[] {
    return paths.map(path => {
      const known = classified.get(path);
      return known?.disposition === 'not-analyzed' ? known
        : { path, disposition: 'not-checked', module: known?.module ?? null, exclusion: known?.exclusion ?? null, reason };
    });
  }
  function document(reason: NotCheckedReason, revision: ContextRevision | null = null,
    report: AnalysisReport | null = null): CheckDocument {
    return { schemaVersion: 'ramify.check/3', root,
      revision: revision ? { id: revision.revision, sequence: revision.sequence, path: revision.checked.path } : null,
      since: args.since ?? null, paths: notChecked(reason),
      outcome: 'not-checked', reason, execution: report?.outcome.execution ?? null,
      findings: report?.diagnostics.map(issue => ({ ...issue, new: false })) ?? [], removed: [],
      warnings: report?.warnings ?? [], coverage: report?.coverage ?? [], checked: null,
      timings: { daemon: null, waitedMs, totalMs: performance.now() - started }, exitCode: 2 };
  }
  function reported(value: Extract<CheckOutcome, { status: 'reported' }>): CheckDocument {
    const result = reportedDocument(value);
    return value.timings ? { ...result, timings: { ...result.timings, reply: value.timings } } : result;
  }
  /** The exit code and findings are the covering revision's, as the complete check would
   * report them; a not-analyzed path changes nothing, and any path not checked makes the
   * whole result not checked, exit 2, with the verified findings retained. */
  function reportedDocument(value: Extract<CheckOutcome, { status: 'reported' }>): CheckDocument {
    if (!value.published) return document(value.report.outcome.execution === 'incomplete' ? 'incomplete' : 'unavailable', null, value.report);
    const { revision, delta } = value;
    const answered = value.paths.length === paths.length && value.paths.every((item, index) => item.path === paths[index]);
    if (answered) classified = new Map(value.paths.map(item => [item.path, item]));
    const coherent = answered && value.freshness.mode === 'synchronized' && value.freshness.verified
      && (revision.outcome.execution === 'invalid' || revision.outcome.execution === 'completed'
        && revision.outcome.check !== 'not-run' && revision.summary.complete);
    if (!coherent) return { ...document('incomplete', revision), execution: revision.outcome.execution,
      findings: delta.findings, warnings: delta.warnings, coverage: delta.coverage };
    const failed = value.paths.find(item => item.disposition === 'not-checked');
    const verdict = revision.outcome.execution === 'invalid' || revision.outcome.check === 'failed'
      || delta.findings.length > 0 || revision.summary.errors > 0 || revision.summary.denied > 0 ? 1 : 0;
    return { ...document(failed?.reason ?? 'incomplete', revision), since: delta.since, paths: value.paths,
      outcome: failed ? 'not-checked' : 'checked', reason: failed?.reason ?? null, execution: revision.outcome.execution,
      findings: delta.findings, removed: delta.removed, warnings: delta.warnings, coverage: delta.coverage, checked: revision.checked,
      timings: { daemon: revision.timings, waitedMs, totalMs: performance.now() - started }, exitCode: failed ? 2 : verdict };
  }
  /** The expectations the current classification asks for: each analyzed path's content, hashed once. */
  async function expectations(): Promise<ExpectedContent[]> {
    const expected: ExpectedContent[] = [];
    if (classification === null) return expected;
    for (const path of paths) {
      if (classified.get(path)?.disposition === 'not-analyzed') continue;
      if (!hashes.has(path)) {
        control.signal?.throwIfAborted();
        let sha256: string | null;
        try { sha256 = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'); }
        catch (error) { if (!missing(error)) throw error; sha256 = null; }
        hashes.set(path, sha256);
      }
      expected.push({ path, sha256: hashes.get(path)! });
    }
    return expected;
  }
  async function run(): Promise<CheckDocument> {
    const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
    if (connected.status !== 'connected') {
      control.signal?.throwIfAborted();
      if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
      return document(connected.status === 'stopped' ? 'stopped' : 'unavailable');
    }
    const connection = connected.connection;
    let token: ContextToken | undefined, reopened = false, recovered = false, reclassified = false;
    try {
      control.signal?.throwIfAborted();
      while (true) {
        try {
          const opened = await connection.openContext({ project: { cwd: environment.cwd,
            ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
          setup: { registry: 'default', capabilities } }, control);
          control.signal?.throwIfAborted();
          if (!opened.ok) throw serviceFailure(opened.error);
          if (opened.value.status === 'unavailable') return document(opened.value.reason);
          if (opened.value.status === 'unresolved') return received = document('unavailable', null, opened.value.report);
          token = opened.value.token;
          const selected = opened.value.current.selection.root;
          // Recovery preserves the caller's original expectation; re-hashing
          // would silently accept an intervening writer's different content.
          if (normalized && root !== selected) return document('unobserved-input');
          root = selected;
          if (!normalized) {
            const unique = new Set<string>();
            for (const named of args.changed) {
              control.signal?.throwIfAborted();
              const absolute = await canonicalPath(resolve(root, named));
              unique.add(relative(root, absolute).split(sep).join('/'));
            }
            paths = [...unique]; normalized = true;
          }
          if (paths.some(path => !path || path === '..' || path.startsWith('../')
            || isAbsolute(path) || path.includes('\\') || path.includes('\0'))) return document('unobserved-input');
          // Classification answers are followed on the same context; reopening leaves this loop.
          while (true) {
            const expect = await expectations();
            const waiting = performance.now();
            let response;
            try {
              response = await connection.check({ token, requestId: randomUUID(),
                freshness: { mode: 'synchronized', expect }, scope: 'delta', paths, classification,
                ...(args.since === undefined ? {} : { since: args.since }), deadlineMs: Math.max(1, Math.ceil(deadline - waitedMs)) }, control);
            } finally { waitedMs += performance.now() - waiting; }
            control.signal?.throwIfAborted();
            if (!response.ok) throw serviceFailure(response.error);
            const value = response.value;
            if (value.status === 'reported') return received = reported(value);
            if (value.status === 'classification-changed') {
              // The first answer supplies the classification; a stale one is retried once.
              const stale = classification !== null;
              classified = new Map(value.paths.map(item => [item.path, item]));
              if (stale && reclassified) return document('classification-changed', value.revision);
              reclassified ||= stale; classification = value.revision.sequence;
              continue; // the same context answers the classified request
            }
            if (value.status === 'cancelled') throw new CliFailure('cancelled', 'Check was cancelled', value);
            if (value.status === 'unavailable' && ['expired-generation', 'unknown-context'].includes(value.reason) && !reopened) {
              reopened = true;
              await connection.closeContext({ token }); token = undefined;
              break; // open the context again
            }
            if (value.status === 'unavailable') return document(value.reason);
            if (value.status === 'cold') return document('cold');
            if (value.status === 'deadline-exceeded' || value.status === 'superseded') return document(value.status, value.revision);
            return document('unavailable');
          }
          continue;
        } catch (error) {
          control.signal?.throwIfAborted();
          if (error instanceof CliFailure && ['stopped', 'incompatible', 'resource-unavailable', 'invalid-request'].includes(error.code)) throw error;
          const reason = connection.reason;
          if (!recovered && reason && ['failure', 'slow-consumer'].includes(reason.kind)) {
            recovered = true;
            const outcome = await connection.recover('automatic');
            if (outcome.status === 'recovered') { token = undefined; continue; }
            if (outcome.status === 'stopped') return document('stopped');
            throw disconnectFailure(outcome.reason);
          }
          if (reason && reason.kind !== 'closed') throw disconnectFailure(reason);
          throw error;
        }
      }
    } finally {
      try { if (token && connection.state === 'connected') await connection.closeContext({ token }); }
      finally { await connection.close(); }
    }
  }
  let result: CheckDocument;
  try { result = await run(); }
  catch (error) {
    control.signal?.throwIfAborted();
    result = document(error instanceof CliFailure && reasons.includes(error.code as NotCheckedReason)
      ? error.code as NotCheckedReason : 'unavailable');
    // Cleanup can fail after delivery. Keep the received findings and coverage
    // evidence while reporting the command failure in the same document.
    if (received) result = { ...received, outcome: 'not-checked', reason: result.reason, exitCode: 2 };
  }
  // Keep output failures outside recovery: a failing sink must never cause a
  // second JSON document or turn a failed write into a successful check.
  control.signal?.throwIfAborted();
  result = { ...result, timings: { ...result.timings, totalMs: performance.now() - started } };
  environment.stdout(args.format === 'json' ? JSON.stringify(result) + '\n' : formatChangedHuman(result));
  return result.exitCode;
}

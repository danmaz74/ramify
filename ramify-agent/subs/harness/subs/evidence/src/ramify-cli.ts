import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AffectedDocument, CheckedPath, NotCheckedReason } from 'ramify.ts/cli';
import { childEnvironment, outputCapBytes } from './run-command.js';
import { decodeOwnershipAnswer } from './ownership.js';

/** The `ramify` executable this package depends on. */
export const ramifyExecutable = fileURLToPath(new URL('../../../../../node_modules/.bin/ramify', import.meta.url));

export interface RamifyRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * What a `ramify check` invocation answered. The exit code gives the project
 * verdict: 0 is checked with no findings, 1 is findings or an invalid
 * revision, and 2 is not checked with the CLI's reason. Exit 2 is never a
 * pass, and neither is any other code the contract does not define.
 *
 * The printed document is decoded strictly: the changed form reads
 * `ramify.check/3`, the complete form `ramify.analysis/3`. A document in any
 * other shape, or one that contradicts its exit code, is `unsupported` and
 * the result is not checked: an unsupported answer is never read as a pass.
 * An invocation failure (`ramify.cli/1`) or an unanswered call is not checked
 * with the CLI's reason.
 */
export interface RamifyCheckResult {
  readonly form: 'complete' | 'changed';
  readonly exitCode: number;
  /** The project verdict. A path's own analysis status is in `paths`. */
  readonly outcome: 'checked' | 'findings' | 'not-checked';
  /** For `not-checked`, the reason the CLI gave, such as `cold` or `configuration-changed`. */
  readonly reason: string | null;
  /** The document the CLI printed, or null when it printed no JSON. */
  readonly report: unknown;
  readonly stdout: string;
  readonly stderr: string;
  /** The decoded document's schema and revision, or null where no supported document was printed. */
  readonly provider: CheckProvider | null;
  /** The covering revision's execution, where the decoded document states one. */
  readonly execution: string | null;
  /**
   * For the changed form, one disposition per named path, exactly as the
   * provider stated it. A complete check states none: it covers every
   * analyzed path. Empty where no supported document was printed.
   */
  readonly paths: readonly CheckedPath[];
  /** Finding identities the covering revision of a changed check no longer reports. */
  readonly removed: readonly string[];
  /** Why the printed document is not one this adapter reads, or null where it is. */
  readonly unsupported: string | null;
}

/** The provider document a check result was decoded from. */
export interface CheckProvider {
  readonly schema: 'ramify.check/3' | 'ramify.analysis/3';
  /** The changed form's covering revision, or the complete form's input identity; null where it had none. */
  readonly revision: string | null;
}

/** How often a materialization is repeated before the harness reports it unavailable. */
export const materializeAttempts = 4;
/** How long to wait before each repeat. A request superseded by a newer revision needs the newer one to finish. */
const materializePausesMs = [300, 900, 2_000];

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}

export type MaterializeResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly message: string };

/**
 * The toolkit's command line, the only way the harness reaches Ramify.
 * Materialization runs through Ramify's resident daemon. With an endpoint
 * directory, the daemon is this harness's own: nothing else shares it, and
 * the harness may stop it.
 */
export class RamifyCli {
  constructor(readonly options: {
    readonly executable?: string | undefined;
    /** `RAMIFY_ENDPOINT_DIR` for every invocation; the daemon behind it belongs to this harness. */
    readonly endpointDirectory?: string | undefined;
    readonly timeoutMs?: number | undefined;
  } = {}) {}

  /** Whether the daemon is this harness's own, so that stopping it affects no one else. */
  get ownsDaemon(): boolean {
    return this.options.endpointDirectory !== undefined;
  }

  run(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<RamifyRun> {
    const env = childEnvironment(this.options.endpointDirectory ? { RAMIFY_ENDPOINT_DIR: this.options.endpointDirectory } : {});
    return new Promise(resolve => {
      execFile(this.options.executable ?? ramifyExecutable, [...args], {
        cwd, env, signal, timeout: this.options.timeoutMs ?? 600_000, maxBuffer: outputCapBytes,
      }, (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : -1;
        resolve({ code, stdout: String(stdout), stderr: error !== null && code === -1 ? `${String(stderr)}${error.message}` : String(stderr) });
      });
    });
  }

  /**
   * Materializes the project's architect view and, with `apiFrom`, the API
   * views of the module in that project-relative directory, from one
   * revision, as `ramify materialize --view architect [--view api --from <dir>]`.
   */
  async materialize(projectRoot: string, apiFrom?: string, signal?: AbortSignal): Promise<MaterializeResult> {
    const args = ['materialize', '--view', 'architect', ...(apiFrom === undefined ? [] : ['--view', 'api', '--from', apiFrom === '' ? '.' : apiFrom]), '--root', projectRoot];
    // Any failure is repeated a bounded number of times, waiting longer each
    // time, before the harness reports that the view could not be
    // materialized with the last failure's own output. A request against a
    // tree that has just changed can be superseded by a newer revision of the
    // daemon's own analysis, which settles within these pauses. A failure the
    // daemon repeats until its next file event (an analysis-failed answer
    // once did) outlasts them, so a caller that briefs several turns
    // materializes again for a later one rather than repeating this result.
    // Nothing of the output is read to decide a retry.
    let last = '';
    for (let attempt = 1; attempt <= materializeAttempts; attempt += 1) {
      const result = await this.run(args, projectRoot, signal);
      if (result.code === 0) return { ok: true, output: result.stdout };
      const detail = `${result.stderr}\n${result.stdout}`.trim();
      last = `\`ramify ${args.join(' ')}\` exited with ${result.code}${detail ? `: ${detail.slice(-2000)}` : ''}`;
      if (attempt < materializeAttempts) await pause(materializePausesMs[attempt - 1] ?? 2_000);
    }
    return { ok: false, message: `${last} (after ${materializeAttempts} attempts)` };
  }

  /**
   * The complete check, `ramify check --batch --format json --no-snapshot`:
   * an independent session that trusts no retained daemon state, with no
   * deadline. This is the form a gate runs, and the form that gives a
   * configuration edit its verdict. The harness reads the verdict and the
   * findings, never the snapshot of every evaluated import, so the report
   * leaves it out.
   */
  async checkComplete(projectRoot: string, signal?: AbortSignal): Promise<RamifyCheckResult> {
    const args = ['check', '--batch', '--root', projectRoot, '--format', 'json', '--no-snapshot'];
    return answer('complete', args, await this.run(args, projectRoot, signal), projectRoot, []);
  }

  /** The installed provider's current ownership topology, tied to one batch input identity. */
  async queryOwnership(projectRoot: string, paths: readonly string[] = ['.'], signal?: AbortSignal): Promise<AffectedDocument> {
    const args = ['affected', '--batch', '--root', projectRoot, '--format', 'json', ...paths.flatMap(path => ['--path', path])];
    const result = await this.run(args, projectRoot, signal);
    if (result.code !== 0) throw new Error(`ramify ownership query exited with ${result.code}: ${result.stderr || result.stdout}`);
    let value: unknown;
    try { value = JSON.parse(result.stdout); }
    catch { throw new Error('ramify ownership query did not return JSON'); }
    return decodeOwnershipAnswer(value, projectRoot);
  }

  /**
   * The bounded hook check, `ramify check --changed <path>... --format json
   * --deadline`, run from the project root the paths are relative to. It
   * never falls back to a complete check: a cold daemon, an expired deadline
   * or a configuration change the revision does not yet cover is answered as
   * `not-checked` with the CLI's reason, which permits continued editing and
   * is never a pass. Each named path keeps the provider's own disposition:
   * `checked` with its content or deletion identity, `not-analyzed` with its
   * owner and exclusion, or `not-checked` with its reason. A caller that
   * needs a verdict runs {@link checkComplete} instead of claiming hook
   * coverage.
   */
  async checkChanged(paths: readonly string[], cwd: string, deadlineMs: number, signal?: AbortSignal): Promise<RamifyCheckResult> {
    const args = ['check', '--changed', ...paths, '--format', 'json', '--deadline', String(deadlineMs)];
    return answer('changed', args, await this.run(args, cwd, signal), cwd, paths);
  }

  /** Stops this harness's own daemon; with a shared daemon, does nothing. */
  async stopDaemon(): Promise<void> {
    if (!this.ownsDaemon) return;
    await this.run(['daemon', 'stop'], tmpdir());
  }
}

function answer(form: 'complete' | 'changed', args: readonly string[], run: RamifyRun, root: string, named: readonly string[]): RamifyCheckResult {
  let report: unknown = null;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    report = null;
  }
  const base = { form, exitCode: run.code, report, stdout: run.stdout, stderr: run.stderr };
  const schema = typeof report === 'object' && report !== null && !Array.isArray(report) ? (report as { schemaVersion?: unknown }).schemaVersion : undefined;
  const expected = form === 'changed' ? 'ramify.check/3' : 'ramify.analysis/3';
  const unanswered = { provider: null, execution: null, paths: [], removed: [] } as const;
  if (schema === expected) {
    const decoded = form === 'changed'
      ? decodeChanged(report, run.code, rootsOf(root), named)
      : decodeComplete(report, run.code, rootsOf(root));
    if (typeof decoded === 'string') return unsupportedResult(base, `\`${expected}\` document: ${decoded}`);
    const outcome = run.code === 0 ? 'checked' : run.code === 1 ? 'findings' : 'not-checked';
    return { ...base, ...decoded, outcome, reason: outcome === 'not-checked' ? decoded.reason ?? notCheckedReason(args, run, report) : null, unsupported: null };
  }
  // An invocation failure or an unanswered call is not checked with its own
  // reason. Any other document, and a verdict without a document, is an
  // answer this adapter does not read, which is never a pass.
  if (run.code !== 0 && run.code !== 1 && (schema === undefined || schema === 'ramify.cli/1')) {
    return { ...base, ...unanswered, outcome: 'not-checked', reason: notCheckedReason(args, run, report), unsupported: null };
  }
  return unsupportedResult(base, schema === undefined
    ? `exit ${run.code} without a \`${expected}\` document`
    : `\`${String(schema)}\` where \`${expected}\` was expected`);
}

function unsupportedResult(base: Pick<RamifyCheckResult, 'form' | 'exitCode' | 'report' | 'stdout' | 'stderr'>, detail: string): RamifyCheckResult {
  return { ...base, provider: null, execution: null, paths: [], removed: [], outcome: 'not-checked', reason: `unsupported result: ${detail}`, unsupported: detail };
}

/** The root a document may name: the one the check ran in, as given or resolved. */
function rootsOf(root: string): ReadonlySet<string> {
  try {
    return new Set([root, realpathSync(root)]);
  } catch {
    return new Set([root]);
  }
}

/** Every reason a changed check gives for not checking, as the installed typings state them. */
const notCheckedReasons = [
  'cold', 'deadline-exceeded', 'unobserved-input', 'superseded', 'incomplete', 'unavailable', 'stopped', 'incompatible',
  'evicted-revision', 'resource-unavailable', 'analysis-failed', 'unknown-context', 'expired-generation',
  'unsupported-setup', 'disposed', 'configuration-changed', 'classification-changed',
] as const satisfies readonly NotCheckedReason[];
/** Fails to compile when the installed provider adds a reason this decoder does not know. */
const _everyReasonKnown: [Exclude<NotCheckedReason, typeof notCheckedReasons[number]>] extends [never] ? true : never = true;
void _everyReasonKnown;

const notAnalyzedReasons = new Set(['owned-unwired', 'owned-nested-project', 'external', 'scratch', 'reserved', 'owned-non-source']);
const exclusionKinds = new Set(['owned-unwired', 'owned-nested-project', 'external', 'scratch', 'repository', 'packages', 'output', 'generated']);
const warningCodes = new Set(['compiler-selected-owned-unwired', 'compiler-selected-owned-nested-project', 'compiler-selected-scratch', 'ignored-but-walked']);
const executions = new Set(['completed', 'invalid', 'incomplete', 'unavailable']);

type Decoded = Pick<RamifyCheckResult, 'provider' | 'execution' | 'paths' | 'removed'> & { readonly reason: string | null };

/** A field's value where it has the shape asked for; a thrown message names the field otherwise. */
class Shape {
  static object(value: unknown, field: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(field);
    return value as Record<string, unknown>;
  }
  static string(value: unknown, field: string): string {
    if (typeof value !== 'string' || value === '') throw new Error(field);
    return value;
  }
  static nullableString(value: unknown, field: string): string | null {
    return value === null ? null : Shape.string(value, field);
  }
  static list(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(field);
    return value;
  }
}

/** A finding, a warning and an analysis limit, each as much as the hook reads of it. */
function checkFinding(value: unknown, field: string, changed: boolean): void {
  const finding = Shape.object(value, field);
  for (const key of ['id', 'category', 'code', 'message']) Shape.string(finding[key], `${field}.${key}`);
  if (finding['location'] !== null) {
    const location = Shape.object(finding['location'], `${field}.location`);
    Shape.string(location['file'], `${field}.location.file`);
  }
  if (changed && typeof finding['new'] !== 'boolean') throw new Error(`${field}.new`);
}

function checkWarning(value: unknown, field: string): void {
  const warning = Shape.object(value, field);
  if (!warningCodes.has(String(warning['code']))) throw new Error(`${field}.code`);
  Shape.string(warning['path'], `${field}.path`);
  Shape.string(warning['message'], `${field}.message`);
  if (warning['files'] !== undefined && !Shape.list(warning['files'], `${field}.files`).every(file => typeof file === 'string')) throw new Error(`${field}.files`);
}

function checkLimit(value: unknown, field: string): void {
  const limit = Shape.object(value, field);
  Shape.string(limit['id'], `${field}.id`);
  Shape.string(limit['code'], `${field}.code`);
  Shape.string(limit['message'], `${field}.message`);
  Shape.string(Shape.object(limit['location'], `${field}.location`)['file'], `${field}.location.file`);
}

function checkExclusion(value: unknown, field: string): void {
  if (value === null) return;
  const exclusion = Shape.object(value, field);
  if (!exclusionKinds.has(String(exclusion['kind']))) throw new Error(`${field}.kind`);
  Shape.string(exclusion['directory'], `${field}.directory`);
  Shape.nullableString(exclusion['owner'], `${field}.owner`);
}

/** One named path's disposition, refused where its fields contradict its kind. */
function checkPath(value: unknown, field: string): CheckedPath {
  const path = Shape.object(value, field);
  Shape.string(path['path'], `${field}.path`);
  checkExclusion(path['exclusion'], `${field}.exclusion`);
  switch (path['disposition']) {
    case 'checked':
      Shape.string(path['module'], `${field}.module`);
      if (path['exclusion'] !== null) throw new Error(`${field}.exclusion`);
      if (path['reason'] === 'content' ? typeof path['sha256'] !== 'string' || !/^[0-9a-f]{64}$/u.test(path['sha256'])
        : path['reason'] !== 'deleted' || path['sha256'] !== null) throw new Error(`${field}.reason`);
      break;
    case 'not-analyzed':
      Shape.nullableString(path['module'], `${field}.module`);
      if (!notAnalyzedReasons.has(String(path['reason'])) || 'sha256' in path) throw new Error(`${field}.reason`);
      break;
    case 'not-checked':
      Shape.nullableString(path['module'], `${field}.module`);
      if (!(notCheckedReasons as readonly unknown[]).includes(path['reason']) || 'sha256' in path) throw new Error(`${field}.reason`);
      break;
    default:
      throw new Error(`${field}.disposition`);
  }
  return path as unknown as CheckedPath;
}

/**
 * A `ramify.check/3` document, refused where it is not one: its root is not
 * the project's, it does not name each requested path exactly once, or its
 * outcome contradicts the exit code it was printed with.
 */
function decodeChanged(report: unknown, exitCode: number, roots: ReadonlySet<string>, named: readonly string[]): Decoded | string {
  try {
    const document = Shape.object(report, 'document');
    if (!roots.has(Shape.string(document['root'], 'root'))) return `root ${String(document['root'])} is not the checked project`;
    const revision = document['revision'] === null ? null : Shape.string(Shape.object(document['revision'], 'revision')['id'], 'revision.id');
    Shape.nullableString(document['since'], 'since');
    const paths = Shape.list(document['paths'], 'paths').map((path, index) => checkPath(path, `paths[${index}]`));
    const stated = paths.map(path => path.path);
    if (new Set(stated).size !== stated.length || stated.length !== new Set(named).size || named.some(path => !stated.includes(path))) {
      return `its paths (${stated.join(', ')}) are not the named paths (${named.join(', ')})`;
    }
    if (document['outcome'] !== 'checked' && document['outcome'] !== 'not-checked') throw new Error('outcome');
    const reason = document['outcome'] === 'not-checked' ? Shape.string(document['reason'], 'reason') : document['reason'] === null ? null : (() => { throw new Error('reason'); })();
    if (reason !== null && !(notCheckedReasons as readonly string[]).includes(reason)) throw new Error('reason');
    const execution = Shape.nullableString(document['execution'], 'execution');
    if (execution !== null && !executions.has(execution)) throw new Error('execution');
    const findings = Shape.list(document['findings'], 'findings');
    findings.forEach((finding, index) => checkFinding(finding, `findings[${index}]`, true));
    const removed = Shape.list(document['removed'], 'removed').map((id, index) => Shape.string(id, `removed[${index}]`));
    Shape.list(document['warnings'], 'warnings').forEach((warning, index) => checkWarning(warning, `warnings[${index}]`));
    Shape.list(document['coverage'], 'coverage').forEach((limit, index) => checkLimit(limit, `coverage[${index}]`));
    if (document['exitCode'] !== exitCode) return `it states exit ${String(document['exitCode'])} but the CLI exited ${exitCode}`;
    const consistent = exitCode === 2
      ? document['outcome'] === 'not-checked'
      : document['outcome'] === 'checked' && paths.every(path => path.disposition !== 'not-checked') && (exitCode === 1 || findings.length === 0);
    if (!consistent || (exitCode !== 0 && exitCode !== 1 && exitCode !== 2)) return `outcome ${String(document['outcome'])} with ${findings.length} findings contradicts exit ${exitCode}`;
    return { provider: { schema: 'ramify.check/3', revision }, execution, paths, removed, reason };
  } catch (error) {
    return `invalid ${(error as Error).message}`;
  }
}

/** A `ramify.analysis/3` complete report, refused where it is not one or contradicts its exit code. */
function decodeComplete(report: unknown, exitCode: number, roots: ReadonlySet<string>): Decoded | string {
  try {
    const document = Shape.object(report, 'document');
    const project = Shape.object(Shape.object(document['request'], 'request')['project'], 'request.project');
    if (!roots.has(Shape.string(project['root'], 'request.project.root'))) return `root ${String(project['root'])} is not the checked project`;
    const inputId = Shape.nullableString(document['inputId'], 'inputId');
    const outcome = Shape.object(document['outcome'], 'outcome');
    const execution = Shape.string(outcome['execution'], 'outcome.execution');
    if (!executions.has(execution)) throw new Error('outcome.execution');
    if (!['passed', 'failed', 'not-run'].includes(String(outcome['check']))) throw new Error('outcome.check');
    if (!['complete', 'partial', 'not-run'].includes(String(outcome['coverage']))) throw new Error('outcome.coverage');
    Shape.list(document['diagnostics'], 'diagnostics').forEach((finding, index) => checkFinding(finding, `diagnostics[${index}]`, false));
    Shape.list(document['warnings'], 'warnings').forEach((warning, index) => checkWarning(warning, `warnings[${index}]`));
    Shape.list(document['coverage'], 'coverage').forEach((limit, index) => checkLimit(limit, `coverage[${index}]`));
    const consistent = exitCode === 0 ? outcome['check'] === 'passed' && execution === 'completed'
      : exitCode === 1 ? outcome['check'] === 'failed'
        : exitCode === 2;
    if (!consistent) return `outcome ${execution}/${String(outcome['check'])} contradicts exit ${exitCode}`;
    return { provider: { schema: 'ramify.analysis/3', revision: inputId }, execution, paths: [], removed: [], reason: exitCode === 2 ? execution : null };
  } catch (error) {
    return `invalid ${(error as Error).message}`;
  }
}

/** The CLI's own reason where it states one, and the invocation with its exit code where it does not. */
function notCheckedReason(args: readonly string[], run: RamifyRun, report: unknown): string {
  const document = report as { reason?: unknown; outcome?: { execution?: unknown } } | null;
  if (typeof document?.reason === 'string' && document.reason !== '') return document.reason;
  if (typeof document?.outcome?.execution === 'string' && document.outcome.execution !== '') return document.outcome.execution;
  const detail = `${run.stderr}\n${run.stdout}`.trim();
  return `\`ramify ${args.join(' ')}\` exited with ${run.code}${detail === '' ? '' : `: ${detail.slice(-2000)}`}`;
}

let versionOnce: Promise<string | null> | undefined;

/** The version the `ramify` CLI reports, or `null` when it cannot be run. */
export function ramifyVersion(): Promise<string | null> {
  versionOnce ??= new RamifyCli().run(['--version'], tmpdir()).then(({ code, stdout }) => (code === 0 && stdout.trim()) || null);
  return versionOnce;
}

/**
 * A `ramify` command line with a daemon of its own, in a new endpoint
 * directory. The daemon's socket path must stay under about 100 bytes, so the
 * directory is short. `dispose` stops the daemon and removes the directory.
 */
export async function privateRamify(options: { readonly timeoutMs?: number | undefined } = {}): Promise<{ readonly ramify: RamifyCli; dispose(): Promise<void> }> {
  const base = join(tmpdir(), 'ra-XXXXXX', 'daemon-0123456789abcdef.sock').length <= 100 ? tmpdir() : existsSync('/tmp') ? '/tmp' : tmpdir();
  const endpointDirectory = await mkdtemp(join(base, 'ra-'));
  const ramify = new RamifyCli({ endpointDirectory, timeoutMs: options.timeoutMs });
  return {
    ramify,
    dispose: async () => {
      await ramify.stopDaemon();
      await rm(endpointDirectory, { recursive: true, force: true });
    },
  };
}

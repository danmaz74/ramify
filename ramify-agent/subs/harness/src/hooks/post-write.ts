import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { RamifyCheckResult, RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { guardedConfigurationFiles } from '../work/scope.js';

/*
 * The post-write hook check.
 *
 * Every source-writing invocation runs Ramify's hook through the session's
 * tool lifecycle rather than through an instruction the agent must remember:
 * the adapter disables automatic extension discovery, so the harness
 * installs it itself and runs it after each settled mutation.
 *
 * Two rules decide the form. A changed check is the cheap one and covers
 * exactly the paths it is given; it is never a pass at exit 2, whose reason
 * permits continued editing and says why nothing was checked. Where the
 * changed set cannot be established, or where one of the changed paths is a
 * named configuration file that no changed check covers, the harness answers
 * that at once as not checked and runs a complete check instead of claiming
 * hook coverage. The gap is recorded either way.
 */

/** Which form of check ran. */
export type HookMode = 'changed' | 'complete';

/** One `hook-check` observation, as the proposal's observation log holds it. */
export interface HookCheck {
  readonly paths: readonly string[];
  readonly mode: HookMode;
  readonly outcome: 'passed' | 'findings' | 'not-checked';
  readonly reason: string | null;
  /** Findings this check reported that no earlier check of this invocation had. */
  readonly newFindings: number;
  /** The file holding what the check printed, or null where nothing was run. */
  readonly log: string | null;
}

/** A coverage gap the hook check itself observed. */
export interface HookGap {
  readonly kind: 'changed-paths-unknown';
  readonly detail: string;
}

/** What one settled mutation's hook check produced. */
export interface HookOutcome {
  /** One entry per check, in the order they ran. */
  readonly checks: readonly HookCheck[];
  readonly gaps: readonly HookGap[];
  /**
   * What reaches the engineer before its next step, or null when there is
   * nothing it must know: a check that passed with no new finding is not
   * news and is not repeated at it.
   */
  readonly text: string | null;
}

/**
 * The findings one invocation has already been told about. A finding
 * reported again by a later check of the same invocation is not newly
 * introduced, so the engineer is not told about it twice.
 */
export class FindingsSeen {
  private readonly seen = new Set<string>();

  /** How many of these findings are new, adding them all to what has been seen. */
  admit(identities: readonly string[]): number {
    let added = 0;
    for (const identity of identities) {
      if (this.seen.has(identity)) continue;
      this.seen.add(identity);
      added += 1;
    }
    return added;
  }

  get size(): number {
    return this.seen.size;
  }
}

export interface HookCheckOptions {
  readonly ramify: RamifyCli;
  readonly projectRoot: string;
  /**
   * The paths the mutation changed, or `null` when the changed set could not
   * be established — which is every call of the unguarded shell.
   */
  readonly paths: readonly string[] | null;
  readonly hookTimeoutMs: number;
  readonly seen: FindingsSeen;
  /** Where the nth check of this invocation writes what the CLI printed. */
  readonly logFile: (check: number) => string;
  /** The number of checks this invocation has already run. */
  readonly ran: number;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Runs the hook check for one settled mutation and answers what to record
 * and what the engineer must be told.
 */
export async function runHookCheck(options: HookCheckOptions): Promise<HookOutcome> {
  const checks: HookCheck[] = [];
  const gaps: HookGap[] = [];
  let ran = options.ran;

  const paths = options.paths === null ? null : relativePaths(options.projectRoot, options.paths);
  const configuration = paths === null ? [] : paths.filter(isGuardedConfiguration);

  let completeNeeded = false;
  if (paths === null || paths.length === 0) {
    completeNeeded = true;
    gaps.push({
      kind: 'changed-paths-unknown',
      detail: 'the mutation named no path the harness could establish, so a changed check covers nothing and a complete check was run',
    });
    checks.push({
      paths: [], mode: 'changed', outcome: 'not-checked',
      reason: 'the changed set could not be established', newFindings: 0, log: null,
    });
  } else if (configuration.length > 0) {
    completeNeeded = true;
    checks.push({
      paths,
      mode: 'changed',
      outcome: 'not-checked',
      reason: `a changed check covers no named configuration file (${configuration.join(', ')})`,
      newFindings: 0,
      log: null,
    });
  } else {
    ran += 1;
    const log = options.logFile(ran);
    const result = await options.ramify.checkChanged(paths, options.projectRoot, options.hookTimeoutMs, options.signal);
    await record(log, result);
    checks.push({
      paths,
      mode: 'changed',
      outcome: outcomeOf(result),
      reason: result.reason,
      newFindings: options.seen.admit(findingIdentities(result.report)),
      log,
    });
  }

  if (completeNeeded) {
    ran += 1;
    const log = options.logFile(ran);
    const result = await options.ramify.checkComplete(options.projectRoot, options.signal);
    await record(log, result);
    checks.push({
      paths: paths ?? [],
      mode: 'complete',
      outcome: outcomeOf(result),
      reason: result.reason,
      newFindings: options.seen.admit(findingIdentities(result.report)),
      log,
    });
  }

  return { checks, gaps, text: describe(checks) };
}

/** Exit 0 is checked with nothing to report, 1 is findings, and anything else is not checked. */
function outcomeOf(result: RamifyCheckResult): HookCheck['outcome'] {
  return result.outcome === 'checked' ? 'passed' : result.outcome === 'findings' ? 'findings' : 'not-checked';
}

/**
 * The identity of each finding the check reported. `ramify.check/1` calls
 * them `findings` and `ramify.analysis/1` calls them `diagnostics`; both are
 * read, and an entry whose shape this does not know is identified by itself
 * rather than dropped.
 */
export function findingIdentities(report: unknown): string[] {
  if (typeof report !== 'object' || report === null) return [];
  const document = report as Record<string, unknown>;
  const entries = [
    ...(Array.isArray(document['findings']) ? document['findings'] as unknown[] : []),
    ...(Array.isArray(document['diagnostics']) ? document['diagnostics'] as unknown[] : []),
  ];
  return entries.map(entry => {
    if (typeof entry !== 'object' || entry === null) return JSON.stringify(entry);
    const fields = entry as Record<string, unknown>;
    const named = ['code', 'rule', 'severity', 'file', 'path', 'line', 'message', 'detail']
      .filter(field => fields[field] !== undefined)
      .map(field => `${field}=${String(fields[field])}`);
    return named.length === 0 ? JSON.stringify(entry) : named.join('\u001f');
  });
}

/** What the engineer is told, or null when no check produced news. */
function describe(checks: readonly HookCheck[]): string | null {
  const news = checks.filter(check => check.outcome !== 'passed' || check.newFindings > 0);
  if (news.length === 0) return null;
  const lines = ['Ramify hook check:'];
  for (const check of news) {
    const where = check.paths.length === 0 ? 'the whole project' : check.paths.join(', ');
    const head = `- ${check.mode} check over ${where}: ${check.outcome}`;
    lines.push(check.reason === null ? head : `${head} (${check.reason})`);
    if (check.newFindings > 0) lines.push(`  ${check.newFindings} finding${check.newFindings === 1 ? '' : 's'} not reported before; the complete report is ${check.log ?? 'not kept'}.`);
    if (check.outcome === 'not-checked') lines.push('  Nothing was verified by this check. It is not a pass, and you may keep editing.');
  }
  return lines.join('\n');
}

async function record(path: string, result: RamifyCheckResult): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${result.stdout}${result.stderr === '' ? '' : `\n${result.stderr}`}`);
}

/** Project-relative, forward-slashed and deduplicated, as the CLI takes them. */
function relativePaths(projectRoot: string, paths: readonly string[]): string[] {
  const relatives = paths.map(path => {
    const inside = relative(projectRoot, isAbsolute(path) ? path : resolve(projectRoot, path));
    return inside.split(sep).join('/');
  });
  return [...new Set(relatives.filter(path => path !== '' && !path.startsWith('../')))].sort();
}

/** Whether this path is one of the configuration files a changed check does not cover. */
function isGuardedConfiguration(path: string): boolean {
  const name = path.split('/').at(-1) ?? path;
  return (guardedConfigurationFiles as readonly string[]).includes(name);
}

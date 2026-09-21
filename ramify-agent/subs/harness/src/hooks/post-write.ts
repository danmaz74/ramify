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

/** A check as the engineer is told about it: the record, with the findings themselves. */
interface ReportedCheck extends HookCheck {
  readonly added: readonly HookFinding[];
  readonly repeated: readonly HookFinding[];
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

/** One finding of a check, as much of it as the engineer is told. */
export interface HookFinding {
  readonly identity: string;
  readonly code: string;
  readonly message: string;
  /** The project-relative file the finding is located in, where it names one. */
  readonly file: string | null;
  readonly line: number | null;
  /** The module whose source imports, for an access finding. */
  readonly importer: string | null;
  /** What was imported, for an access finding. */
  readonly original: { readonly owner: string; readonly file: string; readonly binding: string } | null;
}

/**
 * The findings one invocation has been told about, and which of them still
 * stand. A finding reported again by a later check of the same invocation is
 * not newly introduced, so the engineer is not told about it twice. A
 * finding stands until a check that covered its file no longer reports it.
 */
export class FindingsSeen {
  private readonly seen = new Set<string>();
  private readonly standing = new Map<string, readonly HookFinding[]>();

  /** The findings not seen before, adding them all to what has been seen. */
  admit(findings: readonly HookFinding[]): HookFinding[] {
    const added: HookFinding[] = [];
    for (const finding of findings) {
      if (this.seen.has(finding.identity)) continue;
      this.seen.add(finding.identity);
      added.push(finding);
    }
    return added;
  }

  /**
   * Records what one check that ran found. A changed check answers for the
   * files it covered, so their standing findings are replaced; a complete
   * check answers for the whole project.
   */
  settle(covered: readonly string[] | 'all', findings: readonly HookFinding[]): void {
    if (covered === 'all') this.standing.clear();
    else for (const file of covered) this.standing.delete(file);
    const byFile = new Map<string, HookFinding[]>();
    for (const finding of findings) {
      const file = finding.file ?? '';
      byFile.set(file, [...(byFile.get(file) ?? []), finding]);
    }
    for (const [file, found] of byFile) this.standing.set(file, found);
  }

  /** Every finding no later check has cleared. */
  open(): HookFinding[] {
    return [...this.standing.values()].flat();
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
  const checks: ReportedCheck[] = [];
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
      reason: 'the changed set could not be established', newFindings: 0, log: null, added: [], repeated: [],
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
      added: [],
      repeated: [],
    });
  } else {
    ran += 1;
    const log = options.logFile(ran);
    const result = await options.ramify.checkChanged(paths, options.projectRoot, options.hookTimeoutMs, options.signal);
    await record(log, result);
    checks.push(reported({ paths, mode: 'changed', outcome: outcomeOf(result), reason: result.reason, log }, result, paths, options.seen));
  }

  if (completeNeeded) {
    ran += 1;
    const log = options.logFile(ran);
    const result = await options.ramify.checkComplete(options.projectRoot, options.signal);
    await record(log, result);
    checks.push(reported({ paths: paths ?? [], mode: 'complete', outcome: outcomeOf(result), reason: result.reason, log }, result, 'all', options.seen));
  }

  return {
    checks: checks.map(({ added: _added, repeated: _repeated, ...check }) => check),
    gaps,
    text: describe(checks),
  };
}

/** A check that ran: what it found, what was new, and what still stands. */
function reported(
  check: Omit<HookCheck, 'newFindings'>,
  result: RamifyCheckResult,
  covered: readonly string[] | 'all',
  seen: FindingsSeen,
): ReportedCheck {
  const found = findingsOf(result.report);
  // A check that did not check answers for nothing: what stood still stands.
  if (check.outcome !== 'not-checked') seen.settle(covered, found);
  const added = seen.admit(found);
  const repeated = found.filter(finding => !added.includes(finding));
  return { ...check, newFindings: added.length, added, repeated };
}

/** Exit 0 is checked with nothing to report, 1 is findings, and anything else is not checked. */
function outcomeOf(result: RamifyCheckResult): HookCheck['outcome'] {
  return result.outcome === 'checked' ? 'passed' : result.outcome === 'findings' ? 'findings' : 'not-checked';
}

/**
 * The findings a check reported, with what the engineer must be told of
 * each. `ramify.check/1` places a finding in `location`; an entry whose
 * shape this does not know keeps its own text rather than being dropped.
 */
export function findingsOf(report: unknown): HookFinding[] {
  const identities = findingIdentities(report);
  return entriesOf(report).map((entry, index) => {
    const fields = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {};
    const location = typeof fields['location'] === 'object' && fields['location'] !== null ? fields['location'] as Record<string, unknown> : {};
    const importer = typeof fields['importer'] === 'object' && fields['importer'] !== null ? fields['importer'] as Record<string, unknown> : {};
    const original = typeof fields['original'] === 'object' && fields['original'] !== null ? fields['original'] as Record<string, unknown> : null;
    const file = stringOf(location['file']) ?? stringOf(fields['file']) ?? stringOf(fields['path']);
    const line = numberOf(location['line']) ?? numberOf(fields['line']);
    return {
      identity: identities[index]!,
      code: stringOf(fields['code']) ?? 'finding',
      message: stringOf(fields['message']) ?? stringOf(fields['detail']) ?? (typeof entry === 'string' ? entry : JSON.stringify(entry)),
      file,
      line,
      importer: stringOf(importer['owner']),
      original: original !== null && stringOf(original['owner']) !== null && stringOf(original['binding']) !== null
        ? { owner: stringOf(original['owner'])!, file: stringOf(original['file']) ?? '', binding: stringOf(original['binding'])! }
        : null,
    };
  });
}

function entriesOf(report: unknown): unknown[] {
  if (typeof report !== 'object' || report === null) return [];
  const document = report as Record<string, unknown>;
  return [
    ...(Array.isArray(document['findings']) ? document['findings'] as unknown[] : []),
    ...(Array.isArray(document['diagnostics']) ? document['diagnostics'] as unknown[] : []),
  ];
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The identity of each finding the check reported. `ramify.check/1` calls
 * them `findings` and `ramify.analysis/1` calls them `diagnostics`; both are
 * read, and an entry whose shape this does not know is identified by itself
 * rather than dropped.
 */
export function findingIdentities(report: unknown): string[] {
  return entriesOf(report).map(entry => {
    if (typeof entry !== 'object' || entry === null) return JSON.stringify(entry);
    const fields = entry as Record<string, unknown>;
    const named = ['code', 'rule', 'severity', 'file', 'path', 'line', 'message', 'detail']
      .filter(field => fields[field] !== undefined)
      .map(field => `${field}=${String(fields[field])}`);
    return named.length === 0 ? JSON.stringify(entry) : named.join('\u001f');
  });
}

/**
 * What the engineer is told, or null when no check produced news. A finding
 * is spelled out in full every time it is reported, new or still standing,
 * because a model acts on what its tool result says and not on a file it
 * would have to open. A check that did not check says so, and is not a pass.
 */
function describe(checks: readonly ReportedCheck[]): string | null {
  const added = unique(checks.flatMap(check => check.added));
  const standing = unique(checks.flatMap(check => check.repeated)).filter(finding => !added.some(other => other.identity === finding.identity));
  const unchecked = checks.filter(check => check.outcome === 'not-checked');
  const lines: string[] = [];
  if (added.length > 0) {
    lines.push(`${label(added.length)}. The iteration gate fails while ${added.length === 1 ? 'it stands' : 'they stand'}.`);
    for (const finding of added) lines.push(`- ${sentenceOf(finding)}`);
    lines.push(remedyOf(added));
  }
  if (standing.length > 0) {
    lines.push(added.length > 0 ? `Also still standing (${standing.length}):` : `${label(standing.length)} still standing (${standing.length}):`);
    for (const finding of standing) lines.push(`- ${sentenceOf(finding)}`);
    if (added.length === 0) lines.push(`Fix ${standing.length === 1 ? 'it' : 'them'}, or submit \`contract-needed\` or \`unsuitable\`. \`completion-proposed\` is refused while ${standing.length === 1 ? 'it stands' : 'they stand'}.`);
  }
  if (unchecked.length > 0) {
    lines.push('Ramify hook check:');
    for (const check of unchecked) {
      const where = check.paths.length === 0 ? 'the whole project' : check.paths.join(', ');
      const head = `- ${check.mode} check over ${where}: ${check.outcome}`;
      lines.push(check.reason === null ? head : `${head} (${check.reason})`);
      lines.push('  Nothing was verified by this check. It is not a pass, and you may keep editing.');
    }
  }
  return lines.length === 0 ? null : lines.join('\n');
}

function unique(findings: readonly HookFinding[]): HookFinding[] {
  return [...new Map(findings.map(finding => [finding.identity, finding])).values()];
}

function label(count: number): string {
  return count === 1 ? 'RAMIFY MODULE VIOLATION' : 'RAMIFY MODULE VIOLATIONS';
}

function where(finding: HookFinding): string {
  if (finding.file === null) return 'the project';
  return finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
}

/**
 * The project-relative path of an original, from its owner and its file
 * within that owner's source. A module `root/a/b` lives in `subs/a/subs/b`,
 * and an original's file is named relative to the owner's `src/`.
 */
function projectPathOf(original: NonNullable<HookFinding['original']>): string {
  const children = original.owner.split('/').slice(1);
  return [...children.flatMap(child => ['subs', child]), 'src', original.file].join('/');
}

/** One finding as a sentence: where, what, and which rule, in words a model acts on. */
function sentenceOf(finding: HookFinding): string {
  const at = where(finding);
  const original = finding.original;
  if (original !== null && original.file !== '') {
    const from = `\`${original.binding}\` from ${projectPathOf(original)} (module \`${original.owner}\`)`;
    switch (finding.code) {
      case 'not-visible':
        return `${at} imports ${from}, which does not expose it to your module. \`import type\` counts too.`;
      case 'testing-origin':
        return `${at} imports ${from}, which is test code; non-test source may not import it.`;
      case 'required-importer-tag':
        return `${at} imports ${from}, which requires an importer tag your module does not carry: ${finding.message}`;
      case 'required-symbol-tag':
        return `${at} imports ${from}, which carries a tag your module does not accept: ${finding.message}`;
    }
  }
  if (finding.code === 'missing-export') return `${at} imports a name its target does not export: ${finding.message}`;
  return `${at}: ${finding.message} [${finding.code}]`;
}

/** What the engineer can do about them, in the terms of its own submission. */
function remedyOf(findings: readonly HookFinding[]): string {
  const imported = findings.flatMap(finding => finding.original === null ? [] : [finding.original]);
  const owners = [...new Set(imported.map(original => original.owner))];
  const symbols = [...new Set(imported.map(original => `\`${original.binding}\``))];
  const fix = imported.length > 0
    ? `Fix: drop the import and use what your module receives; its API view, named in your assignment, lists that. If the work truly needs ${symbols.length === 1 ? symbols[0] : 'one of them'}, drop the import anyway and submit \`unsuitable\` with reason \`scope\`, naming the symbol and its owner: the architect decides whether it is exposed. If a symbol you already receive mentions it in its signature, say so: that is an incomplete exposure. Do not copy or derive it. Editing ${owners.map(owner => `\`${owner}\``).join(' or ')}'s module.ramify is outside your write scope.`
    : 'Fix it inside your write scope, or submit `contract-needed`, or `unsuitable` with reason `scope`.';
  return `${fix} \`completion-proposed\` is refused while ${findings.length === 1 ? 'this stands' : 'these stand'}.`;
}

/**
 * Why a completion is refused while findings stand, for the submission's
 * validation error: the same sentences the edits carried.
 */
export function openFindingsMessage(findings: readonly HookFinding[]): string {
  const owners = [...new Set(findings.flatMap(finding => finding.original === null ? [] : [finding.original.owner]))];
  const outside = owners.length === 0 ? '' : ` Editing ${owners.map(owner => `\`${owner}\``).join(' or ')}'s module.ramify is outside your write scope.`;
  return `${label(findings.length)} still standing; the iteration gate fails on ${findings.length === 1 ? 'it' : 'them'}. ${findings.map(sentenceOf).join(' ')} Fix ${findings.length === 1 ? 'it' : 'them'} and submit again, or submit \`contract-needed\` or \`unsuitable\` (reason \`scope\`).${outside}`;
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

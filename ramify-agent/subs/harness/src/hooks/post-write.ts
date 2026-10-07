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
  /** Findings that stood before this check and that it no longer reports. */
  readonly cleared: readonly HookFinding[];
  /**
   * Where the check ran without evaluating imports: its execution, and the
   * findings that wait on an evaluation and stand although it did not report
   * them. Null where imports were evaluated or the check did not run.
   */
  readonly unevaluated: { readonly execution: string; readonly standing: readonly HookFinding[] } | null;
  /** The warnings and analysis limits on the written files that this invocation had not been told of. */
  readonly notices: readonly HookNotice[];
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
  /** Ramify's own `id` for the finding, or the entry itself where it carries none. */
  readonly identity: string;
  /** Ramify's category, such as `import` or `description`, where the entry states one. */
  readonly category: string | null;
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
 * A warning or an analysis limit Ramify reported on a written file. Neither
 * fails a check: a warning names source no module owns, and an analysis
 * limit names an import Ramify could not decide.
 */
export interface HookNotice {
  readonly identity: string;
  readonly kind: 'warning' | 'analysis-limit';
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly line: number | null;
}

/**
 * The categories of finding that only an evaluation of the imports reports:
 * a denied import, a missing export and an exposure without its companion.
 * A finding with no category is counted among them, so that a check that
 * evaluated nothing never clears it.
 */
const evaluatedCategories = new Set(['import', 'missing-export', 'exposure']);

function awaitsEvaluation(finding: HookFinding): boolean {
  return finding.category === null || evaluatedCategories.has(finding.category);
}

/**
 * The findings one invocation has been told about, and which of them still
 * stand. A finding reported again by a later check of the same invocation is
 * not newly introduced, so the engineer is not told about it twice. A
 * finding stands until a check that covered its file and evaluated imports
 * no longer reports it.
 */
export class FindingsSeen {
  private readonly seen = new Set<string>();
  private readonly standing = new Map<string, readonly HookFinding[]>();
  private readonly told = new Set<string>();

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
   * check answers for the whole project. A check that did not evaluate
   * imports answers for none of the findings only that evaluation reports:
   * they stand as they were.
   */
  settle(covered: readonly string[] | 'all', findings: readonly HookFinding[], importsEvaluated = true): void {
    const kept = importsEvaluated ? [] : this.open().filter(awaitsEvaluation);
    if (covered === 'all') this.standing.clear();
    else for (const file of covered) this.standing.delete(file);
    const byFile = new Map<string, HookFinding[]>();
    for (const finding of findings) {
      const file = finding.file ?? '';
      byFile.set(file, [...(byFile.get(file) ?? []), finding]);
    }
    for (const [file, found] of byFile) this.standing.set(file, found);
    for (const finding of kept) {
      const file = finding.file ?? '';
      const standing = this.standing.get(file) ?? [];
      if (!standing.some(other => other.identity === finding.identity)) this.standing.set(file, [...standing, finding]);
    }
  }

  /** The notices this invocation has not been told of, adding them to what it has. */
  tell(notices: readonly HookNotice[]): HookNotice[] {
    const untold: HookNotice[] = [];
    for (const notice of notices) {
      if (this.told.has(notice.identity)) continue;
      this.told.add(notice.identity);
      untold.push(notice);
    }
    return untold;
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
  /**
   * Whether the warnings and analysis limits on the written files are
   * relayed. A check whose text reaches no one, such as the one at
   * `completion-proposed`, passes false, so that they are not taken as told.
   */
  readonly relayNotices?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * The deadline the check at `completion-proposed` is given. It covers the
 * whole write scope rather than one file, so it is longer than a hook check
 * after a single edit, and it is still bounded: a check that does not answer
 * within it is not checked, the submission proceeds, and the gate's own
 * complete check answers.
 */
export const completionCheckDeadlineMs = 60_000;

/**
 * How many source files the check at `completion-proposed` passes to one
 * changed check. A write scope larger than this is not checked here; the
 * gate's complete check covers it.
 */
export const completionCheckFileLimit = 400;

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

  // What the mutation wrote, which the warnings and analysis limits relayed
  // must concern; where it is unknown, none is relayed.
  const written = { files: options.relayNotices === false ? [] : paths ?? [] };

  let completeNeeded = false;
  if (paths === null || paths.length === 0) {
    completeNeeded = true;
    gaps.push({
      kind: 'changed-paths-unknown',
      detail: 'the mutation named no path the harness could establish, so a changed check covers nothing and a complete check was run',
    });
    checks.push({
      paths: [], mode: 'changed', outcome: 'not-checked',
      reason: 'the changed set could not be established', newFindings: 0, log: null, ...nothingReported,
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
      ...nothingReported,
    });
  } else {
    ran += 1;
    const log = options.logFile(ran);
    const result = await options.ramify.checkChanged(paths, options.projectRoot, options.hookTimeoutMs, options.signal);
    await record(log, result);
    checks.push(reported({ paths, mode: 'changed', outcome: outcomeOf(result), reason: result.reason, log }, result, paths, options.seen, written));
  }

  if (completeNeeded) {
    ran += 1;
    const log = options.logFile(ran);
    const result = await options.ramify.checkComplete(options.projectRoot, options.signal);
    await record(log, result);
    checks.push(reported({ paths: paths ?? [], mode: 'complete', outcome: outcomeOf(result), reason: result.reason, log }, result, 'all', options.seen, written));
  }

  return {
    checks: checks.map(({ added: _added, repeated: _repeated, cleared: _cleared, unevaluated: _unevaluated, notices: _notices, ...check }) => check),
    gaps,
    text: describe(checks),
  };
}

/** What a check that was not run reported: nothing. */
const nothingReported = { added: [], repeated: [], cleared: [], unevaluated: null, notices: [] } as const;

/** A check that ran: what it found, what was new, and what still stands. */
function reported(
  check: Omit<HookCheck, 'newFindings'>,
  result: RamifyCheckResult,
  covered: readonly string[] | 'all',
  seen: FindingsSeen,
  written: { readonly files: readonly string[] },
): ReportedCheck {
  const found = findingsOf(result.report);
  const ran = check.outcome !== 'not-checked';
  const execution = ran ? executionOf(result.report) : null;
  const evaluated = execution === null || execution === 'completed';
  const before = seen.open();
  // A check that did not check answers for nothing: what stood still stands.
  if (ran) seen.settle(covered, found, evaluated);
  const standingNow = seen.open();
  const stands = new Set(standingNow.map(finding => finding.identity));
  const earlier = new Set(before.map(finding => finding.identity));
  // Ramify's id includes the finding's offsets, so an edit above a violation
  // gives the same violation a new id. A finding that went and one that came
  // with the same code, message, file and import are that one violation,
  // moved: it is neither cleared nor newly introduced.
  const gone = before.filter(finding => !stands.has(finding.identity));
  const moved: HookFinding[] = [];
  for (const finding of found) {
    if (earlier.has(finding.identity)) continue;
    const at = gone.findIndex(other => sameViolation(other, finding));
    if (at === -1) continue;
    gone.splice(at, 1);
    moved.push(finding);
  }
  seen.admit(moved);
  const added = seen.admit(found);
  const repeated = found.filter(finding => !added.includes(finding));
  // What this check cleared: a finding it covered and no longer reports. It
  // was reported to the engineer when it arose, so its going is news too.
  const cleared = gone;
  const reportedNow = new Set(found.map(finding => finding.identity));
  const unevaluated = evaluated ? null : {
    execution: execution!,
    standing: standingNow.filter(finding => awaitsEvaluation(finding) && !reportedNow.has(finding.identity)),
  };
  // A module whose description is invalid owns no source, so Ramify warns
  // that its files lie outside every module; that warning is the
  // description error's, which the engineer is told of as a finding.
  const notices = ran ? seen.tell(noticesOf(result.report, written.files, evaluated)) : [];
  return { ...check, newFindings: added.length, added, repeated, cleared, unevaluated, notices };
}

/** Whether two findings are one violation, wherever in its file it now lies. */
function sameViolation(a: HookFinding, b: HookFinding): boolean {
  return a.code === b.code && a.message === b.message && a.file === b.file && a.importer === b.importer
    && a.original?.owner === b.original?.owner && a.original?.file === b.original?.file && a.original?.binding === b.original?.binding;
}

/**
 * The execution a report states, or null where it states none. A
 * `ramify.check/1` document states it at `execution`, and a
 * `ramify.analysis/1` report at `outcome.execution`. Only `completed`
 * evaluated imports: an invalid module description, layout or tag registry
 * makes it `invalid`, and Ramify then decides no import.
 */
function executionOf(report: unknown): string | null {
  if (typeof report !== 'object' || report === null) return null;
  const document = report as Record<string, unknown>;
  const outcome = typeof document['outcome'] === 'object' && document['outcome'] !== null ? document['outcome'] as Record<string, unknown> : {};
  return stringOf(document['execution']) ?? stringOf(outcome['execution']);
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
      category: stringOf(fields['category']),
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
 * The identity of each finding the check reported: Ramify's own `id`, which
 * both `ramify.check/1` `findings` and `ramify.analysis/1` `diagnostics`
 * carry, and which differs for two files that import the same symbol. Both
 * shapes are read. An entry with no `id` is outside either contract; it is
 * identified by itself, without the changed check's `new` flag, rather than
 * dropped.
 */
export function findingIdentities(report: unknown): string[] {
  return entriesOf(report).map(entry => {
    if (typeof entry !== 'object' || entry === null) return JSON.stringify(entry);
    const { new: _new, ...fields } = entry as Record<string, unknown>;
    return stringOf(fields['id']) ?? JSON.stringify(fields);
  });
}

/**
 * The warnings and analysis limits a report states on the written files.
 * Ramify reports them apart from its findings, in `warnings` and
 * `coverage`, and fails no check on them. Evaluation availability controls
 * whether the hook can present source coverage notices.
 */
export function noticesOf(report: unknown, written: readonly string[], evaluated: boolean): HookNotice[] {
  if (typeof report !== 'object' || report === null || written.length === 0) return [];
  const document = report as Record<string, unknown>;
  const files = new Set(written);
  const notices: HookNotice[] = [];
  for (const entry of Array.isArray(document['warnings']) ? document['warnings'] as unknown[] : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const fields = entry as Record<string, unknown>;
    const code = stringOf(fields['code']) ?? 'warning';
    const named = Array.isArray(fields['files']) ? (fields['files'] as unknown[]).flatMap(file => stringOf(file) ?? []) : [];
    for (const file of named) {
      if (!files.has(file)) continue;
      if (code === 'outside-module-source') {
        if (!evaluated) continue;
        notices.push({
          identity: `warning:${code}:${file}`, kind: 'warning', code, file, line: null,
          message: 'the compiler selects this file, but it lies outside every module\'s source, so no module owns it and Ramify decides no import of it',
        });
      } else {
        notices.push({ identity: `warning:${code}:${file}`, kind: 'warning', code, file, line: null, message: stringOf(fields['message']) ?? code });
      }
    }
  }
  for (const entry of Array.isArray(document['coverage']) ? document['coverage'] as unknown[] : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const fields = entry as Record<string, unknown>;
    const location = typeof fields['location'] === 'object' && fields['location'] !== null ? fields['location'] as Record<string, unknown> : {};
    const file = stringOf(location['file']);
    if (file === null || !files.has(file)) continue;
    const code = stringOf(fields['code']) ?? 'analysis-limit';
    notices.push({
      identity: stringOf(fields['id']) ?? `limit:${code}:${file}:${String(location['start'])}`,
      kind: 'analysis-limit', code, file, line: numberOf(location['line']),
      message: stringOf(fields['message']) ?? code,
    });
  }
  return notices;
}

/** Whether a project-relative file is the path itself or lies beneath it. */


/**
 * What the engineer is told, or null when no check produced news. A finding
 * is spelled out in full every time it is reported, new or still standing,
 * because a model acts on what its tool result says and not on a file it
 * would have to open. A check that did not check says so, and is not a pass.
 *
 * A changed check the harness answered at once never ran, which is why it
 * runs a complete check instead. That complete check covers everything the
 * changed form would have, so it is the one that speaks: it found something,
 * or it found nothing, or it could not run and says so. Reporting the
 * changed form's own gap beside it would say nothing was verified when
 * something was, and would say it twice when nothing was.
 */
function describe(checks: readonly ReportedCheck[]): string | null {
  const added = unique(checks.flatMap(check => check.added));
  const standing = unique(checks.flatMap(check => check.repeated)).filter(finding => !added.some(other => other.identity === finding.identity));
  const cleared = unique(checks.flatMap(check => check.cleared))
    .filter(finding => ![...added, ...standing].some(other => other.identity === finding.identity));
  const superseded = checks.some(check => check.mode === 'complete');
  const unchecked = checks.filter(check => check.outcome === 'not-checked' && !(superseded && check.mode === 'changed'));
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
  if (cleared.length > 0) lines.push(clearedLine(cleared));
  const unevaluated = checks.flatMap(check => check.unevaluated === null ? [] : [check.unevaluated]);
  if (unevaluated.length > 0) lines.push(...unevaluatedLines(unevaluated));
  const notices = checks.flatMap(check => check.notices);
  if (notices.length > 0) lines.push(...noticeLines(notices));
  if (unchecked.length > 0) {
    lines.push('Ramify hook check:');
    for (const check of unchecked) {
      const where = check.mode === 'complete' || check.paths.length === 0 ? 'the whole project' : check.paths.join(', ');
      const head = `- ${check.mode} check over ${where}: ${check.outcome}`;
      lines.push(check.reason === null ? head : `${head} (${check.reason})`);
      lines.push('  Nothing was verified by this check. It is not a pass, and you may keep editing.');
    }
  }
  return lines.length === 0 ? null : lines.join('\n');
}

/**
 * The one line a cleared violation gets. An edit that removes a reported
 * violation would otherwise be answered with nothing at all, which reads
 * like a check that did not run.
 */
function clearedLine(cleared: readonly HookFinding[]): string {
  const at = cleared.map(where).join(', ');
  return cleared.length === 1
    ? `Cleared: the Ramify module violation reported earlier (${at}) no longer stands.`
    : `Cleared: the ${cleared.length} Ramify module violations reported earlier (${at}) no longer stand.`;
}

/**
 * What a check that did not evaluate imports tells: that it verified no
 * import, and that the findings only that evaluation reports stand until a
 * check that evaluates imports no longer reports them. Ramify lists them as
 * removed, which is not their being fixed.
 */
function unevaluatedLines(unevaluated: readonly NonNullable<ReportedCheck['unevaluated']>[]): string[] {
  const executions = [...new Set(unevaluated.map(check => check.execution))].map(execution => `\`${execution}\``).join(' or ');
  const why = unevaluated.some(check => check.execution === 'invalid')
    ? ' An invalid module description, layout or tag registry stops the analysis before any import is decided.'
    : '';
  const lines = [`Imports were not evaluated: the check's execution was ${executions}, so Ramify decided no import and this check is not a pass for any.${why}`];
  const standing = unique(unevaluated.at(-1)!.standing);
  if (standing.length > 0) {
    lines.push(standing.length === 1
      ? `The finding reported earlier (${where(standing[0]!)}) is not cleared: it stands until a check that evaluates imports no longer reports it.`
      : `The ${standing.length} findings reported earlier (${standing.map(where).join(', ')}) are not cleared: they stand until a check that evaluates imports no longer reports them.`);
  }
  return lines;
}

/** The warnings and analysis limits on the files just written, labelled as not blocking. */
function noticeLines(notices: readonly HookNotice[]): string[] {
  const files = new Set(notices.map(notice => notice.file)).size;
  const lines = [`Not blocking: Ramify reports ${notices.length === 1 ? 'this' : 'these'} for the ${files === 1 ? 'file' : 'files'} you just wrote, and fails no check on ${notices.length === 1 ? 'it' : 'them'}.`];
  for (const notice of notices) {
    const at = notice.line === null ? notice.file : `${notice.file}:${notice.line}`;
    lines.push(`- ${at}: ${notice.message} [${notice.kind === 'warning' ? 'warning' : 'analysis limit'} ${notice.code}]`);
  }
  if (notices.some(notice => notice.kind === 'analysis-limit')) {
    lines.push('An analysis limit is an import Ramify could not decide: it is neither allowed nor denied.');
  }
  return lines;
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

/**
 * One finding as a sentence: where, what, and which rule, in words a model
 * acts on. It is the one place that words a finding, for the hook's own
 * text, for the refusal of a completion and for the briefing a failing gate
 * carries; the per-code sentences go when Ramify's own messages are
 * self-sufficient, and then only this function changes.
 */
export function sentenceOf(finding: HookFinding): string {
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

/**
 * What the engineer can do about them, in the terms of its own submission:
 * one decision procedure, each fact said once. The engineer's own prompt
 * carries the same procedure at length; this is the reminder beside the
 * finding, not a second copy of it.
 */
function remedyOf(findings: readonly HookFinding[]): string {
  const imported = findings.flatMap(finding => finding.original === null ? [] : [finding.original]);
  const owners = [...new Set(imported.map(original => original.owner))];
  const symbols = [...new Set(imported.map(original => `\`${original.binding}\``))];
  const fix = imported.length > 0
    ? `Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit \`unsuitable\` with reason \`scope\`, naming ${symbols.length === 1 ? symbols[0] : 'the symbol'} and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and ${owners.map(owner => `\`${owner}\``).join(' or ')}'s module.ramify is outside your write scope.`
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

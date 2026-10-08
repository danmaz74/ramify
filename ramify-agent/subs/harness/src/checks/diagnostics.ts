import { readFile } from 'node:fs/promises';
import { findingsOf, sentenceOf, type HookFinding } from '../hooks/post-write.js';
import type { GateAttempt, GateCommandRecord } from './records.js';
import { scenarioResultsOf, untrackedScenarioCounts, type ScenarioResult } from './scenario-results.js';

/*
 * What a failing gate says to the agent that receives it.
 *
 * A verdict alone is not a diagnosis. The cause names where the failure lies
 * and nothing about what failed, so a briefing that carries only the cause
 * asks its reader to guess: an architect that read `outside-assignment` and
 * nothing else narrowed a file list and the same failure came back.
 *
 * So a briefing names what the gate's audit asked and answered, and each
 * configured check that did not pass with what the provider recorded of it:
 * its counts, its failed tests and scenarios, its runner error and the end of
 * its output, bounded. A scenario the audit ran is named by its identity tag,
 * from the raw runner output. A standalone diagnosis names each command;
 * a Ramify check's findings are worded by the one function that words a
 * finding anywhere, and any other command is quoted, never parsed.
 */

/** How many lines of one command's own output a briefing carries. */
export const briefedOutputLines = 40;

/** The bound on those lines together, in characters. */
export const briefedOutputCharacters = 4_000;

/** Who receives a briefing. Both audiences see the same check evidence. */
export type GateAudience = 'engineer' | 'local-architect';

/** A failing gate as a briefing carries it: its attempt, its cause and the lines to place. */
export interface GateDiagnostics {
  readonly id: string;
  readonly cause: string | null;
  /** Markdown lines, each ready to place in a briefing as it stands. */
  readonly summary: string[];
}

/**
 * The document one Ramify check printed. The output file holds the standard
 * output followed by the standard error, so where the whole of it is not
 * JSON the document is taken from its first brace to its last.
 */
export async function ramifyReportOf(command: GateCommandRecord): Promise<unknown> {
  const printed = await readFile(command.output.path, 'utf8').catch(() => command.output.tail);
  return parseReport(printed === '' ? command.output.tail : printed);
}

function parseReport(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

/** The findings one Ramify check reported, or none where it printed no report the harness reads. */
export async function ramifyFindingsOf(command: GateCommandRecord): Promise<HookFinding[]> {
  if (command.kind !== 'ramify-check') return [];
  return findingsOf(await ramifyReportOf(command));
}

/**
 * What a failing gate tells its reader: its audit request and answer, each
 * configured check that did not pass with the provider's record of it, each
 * tracked scenario that did not pass, each in-place command, failed rule and
 * unauthorized guarded change. The lines are placed as they are; nothing
 * that reads them prefixes them again. `names` gives each tracked
 * scenario's name.
 */
export async function gateDiagnostics(
  gate: GateAttempt,
  _audience: GateAudience,
  names: ReadonlyMap<string, string> = new Map(),
  /** The exact lock provider lines recorded before commands began, by one-based position. */
  waiting: ReadonlyMap<number, string> = new Map(),
): Promise<GateDiagnostics> {
  const summary: string[] = [];
  if (gate.audit !== undefined) summary.push(...auditLines(gate, names, waiting));
  // The commands a setup command that did not pass kept from running are
  // named once, after it: they report nothing about the source.
  const skipped = gate.commands.filter(command => command.notVerified === 'setup-failed');
  const blocking = gate.commands.find(command => command.kind === 'setup' && command.outcome !== 'passed');
  for (const [index, command] of gate.commands.entries()) {
    if (command.notVerified === 'setup-failed') continue;
    const line = waiting.get(index + 1);
    if (line !== undefined || command.lockWaitMs !== undefined) {
      const duration = command.lockWaitMs === undefined ? '' : ` for ${command.lockWaitMs} ms`;
      summary.push(`- \`${command.kind}\` waited${duration} for the machine test lock${line === undefined ? '' : `: ${line}`}`);
    }
    const outcome = command.outcome === 'not-verified'
      ? `not verified (${command.notVerified ?? 'unknown'})`
      : command.outcome;
    const exit = `${command.exitCode === null ? '' : `, exit ${command.exitCode}`}${stoppedNote(command)}`;
    if (command.kind === 'setup') {
      summary.push(...setupLines(command, outcome, exit));
      if (command === blocking && skipped.length > 0) {
        summary.push(`- not run, because ${setupTitle(command)} did not pass: ${skipped.map(entry => `\`${entry.kind}\``).join(', ')}`);
      }
      continue;
    }
    if (command.outcome === 'passed') {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}`);
      continue;
    }
    const provider = commandProviderLines(gate, index);
    if (provider.length > 0) {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}; complete provider diagnostics follow; full command output: \`${command.output.path}\`:`);
      summary.push(...provider.map(line => `  ${line}`));
      continue;
    }
    const reported = await ramifyFindingsOf(command);
    if (reported.length > 0) {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}, ${reported.length} finding${reported.length === 1 ? '' : 's'}; full output: \`${command.output.path}\`:`);
      for (const finding of reported) summary.push(`  - ${sentenceOf(finding)}`);
      continue;
    }
    const tail = outputTail(command);
    if (tail.length === 0) {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}; full output: \`${command.output.path}\`; ${command.output.bytes === 0 ? 'it printed nothing' : 'the output excerpt is unavailable'}`);
      continue;
    }
    summary.push(`- \`${command.kind}\`: ${outcome}${exit}; full output: \`${command.output.path}\`; the end of what it printed:`);
    for (const line of tail) summary.push(`      ${line}`);
  }
  if (blocking === undefined && skipped.length > 0) {
    summary.push(`- not run, because a setup command did not pass: ${skipped.map(entry => `\`${entry.kind}\``).join(', ')}`);
  }
  for (const rule of gate.rules ?? []) {
    if (rule.outcome !== 'failed') continue;
    summary.push(`- rule \`${rule.rule}\`: failed`);
    for (const violation of rule.violations) summary.push(`  - ${violation.path}: ${violation.detail}`);
  }
  for (const change of gate.guardedChanges) {
    if (change.authorizedBy !== null) continue;
    summary.push(`- no record authorizes the change to the guarded file \`${change.path}\`${change.after === null ? ', which was deleted' : ''}`);
  }
  return { id: gate.id, cause: gate.cause, summary };
}

/**
 * A committing gate's audit: what was requested and what answered it, then
 * each configured check of the returned record, the failures in full and the
 * passes in one line, the universe's checks the record did not select, and
 * every tracked scenario that did not pass.
 */
function auditLines(gate: GateAttempt, names: ReadonlyMap<string, string>, waiting: ReadonlyMap<number, string>): string[] {
  const audit = gate.audit!;
  const lines: string[] = [];
  const asked = `${audit.mode === 'full' ? 'a full audit' : 'the project\'s default audit'} of \`${audit.requestedSourceCommit}\` under \`${audit.definition.path}\``;
  if (audit.status !== 'completed') {
    lines.push(`- audit \`${audit.requestId}\`, ${asked}: ${audit.status === 'refused' ? 'refused' : audit.status}, ${audit.detail}`);
  } else {
    const executed = `requested ${audit.requestedMode ?? 'unknown'}, executed ${audit.executedMode ?? 'unknown'}${audit.fallbackReason === null ? '' : ` (${audit.fallbackReason})`}`;
    lines.push(`- audit \`${audit.requestId}\`, ${asked}: ${executed}; composed verdict \`${audit.verdict ?? 'none'}\`${audit.verdict === 'pass' ? '' : `, ${audit.detail}`}`);
  }
  if (audit.reuse !== null) {
    const ignored = audit.reuse.ignoredChangedPaths.length === 0 ? 'no changed path' : audit.reuse.ignoredChangedPaths.map(path => `\`${path}\``).join(', ');
    lines.push(`  - it reused the record of \`${audit.reuse.auditedCommit}\`, which applies to this commit: its policy ignores ${ignored}`);
  }
  lines.push(...nestedAuditLines(audit));
  for (const line of waiting.values()) lines.push(`- a configured check waited for the machine test lock: ${line}`);
  const checks = gate.provider?.checks;
  const published = isRecord(checks) ? checks : {};
  for (const [id, value] of Object.entries(published)) {
    if (!isRecord(value)) continue;
    const status = typeof value['status'] === 'string' ? value['status'] : value['passed'] === true ? 'passed' : 'failed';
    if (status === 'passed') {
      lines.push(`- \`${id}\`: passed${countsOf(value)}`);
      continue;
    }
    lines.push(`- \`${id}\`: ${status}; the provider's record of it follows:`);
    lines.push(...checkFailureLines(id, value).map(line => `  ${line}`));
    const tail = textTail(typeof value['output'] === 'string' ? value['output'] : '');
    if (tail.length > 0) {
      lines.push('  - the end of what it printed:');
      for (const line of tail) lines.push(`        ${line}`);
    }
  }
  const universe = universeOf(gate.provider?.result);
  const unselected = universe.filter(id => !(id in published));
  if (audit.status === 'completed' && unselected.length > 0) {
    lines.push(`- not run by this record, as the provider selected: ${unselected.map(id => `\`${id}\``).join(', ')}`);
  }
  lines.push(...scenarioLines(scenarioResultsOf(gate), names, untrackedScenarioCounts(gate)));
  return lines;
}

/**
 * A nested request's projects, each with the provider's verdict, whether this
 * request ran, reused or did not run it, its failures, counts, duration and
 * how to retrieve its record; then what discovery skipped and why. The root
 * line above carries the invocation's composed verdict.
 */
function nestedAuditLines(audit: NonNullable<GateAttempt['audit']>): string[] {
  if (!audit.nested) return [];
  const lines: string[] = [];
  if (audit.projects === null) {
    lines.push('- the nested request carries no project results');
  } else {
    lines.push(`- the nested request answered ${audit.projects.length} project${audit.projects.length === 1 ? '' : 's'}:`);
    for (const project of audit.projects) {
      const counts = project.counts === null ? '' : `; ${bucketText('checks', project.counts.checks)}${project.counts.tests === null ? '' : `, ${bucketText('tests', project.counts.tests)}`}${project.counts.scenarios === null ? '' : `, ${bucketText('scenarios', project.counts.scenarios)}`}`;
      const duration = project.durationSeconds === null ? '' : `; ${project.durationSeconds}s`;
      const executed = project.executedMode === null ? '' : `, executed ${project.executedMode}`;
      lines.push(`  - \`${project.projectRoot}\`: \`${project.verdict}\`, ${project.execution}${executed}${counts}${duration}${project.status === 'completed' ? '' : `; ${project.status}: ${project.detail}`}`);
      for (const failure of project.failures) lines.push(`    - ${failure}`);
      if (project.verdict !== 'pass') for (const command of project.retrievalCommands) lines.push(`    - retrieve: \`${command}\``);
    }
  }
  if (audit.discovery === null) {
    lines.push('- the nested request carries no discovery outcome');
  } else {
    if (audit.discovery.status !== 'complete') lines.push(`- nested discovery is ${audit.discovery.status}`);
    for (const skipped of audit.discovery.skipped) {
      lines.push(`- not audited: \`${skipped.projectRoot}\` inside \`${skipped.enclosingProject}\`, skipped as ${skipped.reason} (\`${skipped.directory}\`)`);
    }
    for (const unavailable of audit.discovery.unavailable) {
      lines.push(`- nested definitions of \`${unavailable.enclosingProject}\` could not be decided: ${unavailable.reason}${unavailable.definitions.length === 0 ? '' : ` (${unavailable.definitions.map(path => `\`${path}\``).join(', ')})`}`);
    }
  }
  return lines;
}

function bucketText(label: string, bucket: { readonly total: number; readonly passed: number; readonly failed: number; readonly skipped: number }): string {
  return `${label} ${bucket.passed}/${bucket.total} passed${bucket.failed === 0 ? '' : `, ${bucket.failed} failed`}${bucket.skipped === 0 ? '' : `, ${bucket.skipped} skipped`}`;
}

/**
 * Each tracked scenario of the audit's raw runner output: where any did not
 * pass, every result, so that an engineer sees which scenarios of a
 * composition still pass beside the one that fails; then the project's own
 * failures by count.
 */
function scenarioLines(results: readonly ScenarioResult[], names: ReadonlyMap<string, string>, untracked: { readonly failed: number }): string[] {
  const lines: string[] = [];
  const title = (id: string) => (names.has(id) ? `\`${id}\` "${names.get(id)}"` : `\`${id}\``);
  const anyFailed = results.some(result => result.status !== 'passed');
  for (const result of results) {
    if (result.status === 'passed') {
      if (anyFailed) lines.push(`- scenario ${title(result.id)} passed in \`${result.check}\`, at \`${result.file}:${result.line}\`.`);
      continue;
    }
    lines.push(`- scenario ${title(result.id)} ${result.status} in \`${result.check}\`, at \`${result.file}:${result.line}\`:`);
    if (result.failure !== null) {
      lines.push(`  - The failing step: \`${result.failure.step}\`.`);
      const message = boundedMessage(result.failure.message);
      if (message.length === 1) lines.push(`  - Its message: ${message[0]}`);
      else if (message.length > 1) {
        lines.push('  - Its message:');
        for (const line of message) lines.push(`        ${line}`);
      }
    }
    if (result.undefined.length > 0) lines.push(`  - No step definition matches ${result.undefined.map(text => `"${text}"`).join(', ')}.`);
  }
  if (untracked.failed > 0) lines.push(`- ${untracked.failed} of the project's own scenarios failed.`);
  return lines;
}

/**
 * The tracked scenarios a passed gate's audit ran, each with the step
 * definitions that bound it: what an engineer is told its binding achieved.
 */
export function passedScenarioLines(gate: Pick<GateAttempt, 'provider'>, names: ReadonlyMap<string, string> = new Map()): string[] {
  const title = (id: string) => (names.has(id) ? `\`${id}\` "${names.get(id)}"` : `\`${id}\``);
  return scenarioResultsOf(gate).filter(result => result.status === 'passed').flatMap(result => [
    `- ${title(result.id)} passed in \`${result.check}\`, at \`${result.file}:${result.line}\`${result.binding.length === 0 ? ', with no step bound.' : ', bound by:'}`,
    ...result.binding.map(binding => `  - \`${binding.step}\` → \`${binding.definition}\``),
  ]);
}

function countsOf(check: Record<string, unknown>): string {
  return check['counts'] === undefined ? '' : `; counts: ${JSON.stringify(check['counts'])}`;
}

/** The provider's failure facts of one check and each of its commands; successful output stays on demand. */
function checkFailureLines(id: string, check: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const render = (label: string, result: Record<string, unknown>): void => {
    lines.push(`- ${label || id} status: ${typeof result['status'] === 'string' ? result['status'] : 'unknown'}; counts: ${result['counts'] === undefined ? 'unknown' : JSON.stringify(result['counts'])}`);
    if (typeof result['summary'] === 'string' && result['summary'] !== '') lines.push(`- ${label}summary: ${result['summary']}`);
    for (const field of ['failedTests', 'failedScenarios', 'failedSuites', 'warnedSuites'] as const) {
      const entries = result[field];
      if (!Array.isArray(entries)) {
        if (entries !== undefined) lines.push(`- ${label}${field}: ${JSON.stringify(entries)}`);
        continue;
      }
      for (const entry of entries) lines.push(`- ${label}${field}: ${JSON.stringify(entry)}`);
    }
    for (const field of ['runnerError', 'outputRef'] as const) {
      const entry = result[field];
      if (entry !== undefined && entry !== null) lines.push(`- ${label}${field}: ${JSON.stringify(entry)}`);
    }
    const cucumber = result['cucumberMessages'];
    if (isRecord(cucumber)) {
      const { raw: _raw, run: _run, ...reference } = cucumber;
      lines.push(`- ${label}cucumberMessages: ${JSON.stringify(reference)}`);
    }
    const commands = result['commands'];
    if (isRecord(commands)) {
      for (const [name, entry] of Object.entries(commands)) {
        if (isRecord(entry)) render(`${label}${name}.`, entry);
      }
    }
  };
  render('', check);
  return lines;
}

/** An in-place command's provider diagnostic, read from the retained payload by its check ID. */
function commandProviderLines(gate: GateAttempt, index: number): string[] {
  const checks = gate.provider?.checks;
  const command = gate.commands[index];
  if (!isRecord(checks) || command?.providerCheckId === undefined) return [];
  const value = checks[command.providerCheckId];
  if (!isRecord(value)) return [];
  const lines = checkFailureLines(command.providerCheckId, value);
  if (lines.length === 0) lines.push(`- The provider supplied no structured failure details for ${command.providerCheckId}; inspect its exact check payload and full output.`);
  return lines;
}

/** The check universe the returned record declared. */
function universeOf(result: unknown): string[] {
  if (!isRecord(result) || !isRecord(result['summary']) || !isRecord(result['summary']['coverage'])) return [];
  const universe = result['summary']['coverage']['universe'];
  return isRecord(universe) && Array.isArray(universe['checkIds']) ? universe['checkIds'].filter((id): id is string => typeof id === 'string') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * How ramify-audit stopped a command's process tree and whether what it
 * printed may be incomplete, as a clause; empty for a command it did not
 * stop and whose output is complete.
 */
function stoppedNote(command: GateCommandRecord): string {
  const notes = [
    ...(command.stopped === undefined ? [] : [command.stopped]),
    ...(command.outputIncomplete === true ? ['its output may be incomplete'] : []),
  ];
  return notes.length === 0 ? '' : `; ${notes.join('; ')}`;
}

/** A setup command as a briefing names it: its declared name where it has one, and its argv. */
function setupTitle(command: GateCommandRecord): string {
  const argv = `\`${command.command.argv.join(' ')}\``;
  return command.name === undefined ? `the setup command ${argv}` : `the setup command "${command.name}" (${argv})`;
}

/**
 * One setup command's lines: passed in one line, and otherwise its exit code,
 * where its complete output is, and the bounded end of what it printed. A
 * build that exited non-zero failed on the source it was given, so what it
 * printed is the diagnosis.
 */
function setupLines(command: GateCommandRecord, outcome: string, exit: string): string[] {
  const title = `- \`setup\`, ${setupTitle(command)}`;
  if (command.outcome === 'passed') return [`${title}: ${outcome}${exit}`];
  const tail = outputTail(command);
  const where = `; its complete output is in \`${command.output.path}\``;
  if (tail.length === 0) return [`${title}: ${outcome}${exit}${where}; it printed nothing`];
  return [`${title}: ${outcome}${exit}${where}; the end of what it printed:`, ...tail.map(line => `      ${line}`)];
}

/** How many lines of one scenario's failure message a briefing carries. */
export const briefedMessageLines = 12;

/** The bound on those lines together, in characters. */
export const briefedMessageCharacters = 1_500;

/** The first lines of a failure message, bounded in lines and in characters. */
function boundedMessage(message: string): string[] {
  const lines = message.split('\n').map(line => line.trimEnd()).filter(line => line.trim() !== '');
  const kept: string[] = [];
  let characters = 0;
  for (const line of lines.slice(0, briefedMessageLines)) {
    if (characters + line.length > briefedMessageCharacters) break;
    characters += line.length;
    kept.push(line);
  }
  if (kept.length === 0 && lines.length > 0) kept.push(`${lines[0]!.slice(0, briefedMessageCharacters)}…`);
  else if (kept.length < lines.length) kept.push('…');
  return kept;
}

/** The last lines of what one command printed, bounded in lines and in characters. */
function outputTail(command: GateCommandRecord): string[] {
  return textTail(command.output.tail);
}

/** The last lines of a text, bounded in lines and in characters. */
function textTail(text: string): string[] {
  const lines = text.split('\n').map(line => line.trimEnd()).filter(line => line.trim() !== '');
  const last = lines.slice(-briefedOutputLines);
  const kept: string[] = [];
  let characters = 0;
  for (const line of last) {
    if (characters + line.length > briefedOutputCharacters) break;
    characters += line.length;
    kept.push(line);
  }
  return kept;
}

import { readFile } from 'node:fs/promises';
import { findingsOf, sentenceOf, type HookFinding } from '../hooks/post-write.js';
import type { GateAttempt, GateCommandRecord, ScenarioCheckSummary } from './records.js';

/*
 * What a failing gate says to the agent that receives it.
 *
 * A verdict alone is not a diagnosis. The cause names where the failure lies
 * and nothing about what failed, so a briefing that carries only the cause
 * asks its reader to guess: an architect that read `outside-assignment` and
 * nothing else narrowed a file list and the same failure came back.
 *
 * So a briefing names each command that did not pass and carries what it
 * reported. A Ramify check reports a structured document, each finding with
 * its own location, and those findings are worded by the one function that
 * words a finding anywhere. A command that reports no structure is quoted:
 * the end of its own output, bounded, never parsed.
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
 * What a failing gate tells its reader: one line per command, the findings
 * or the output of each one that did not pass, and, for the local
 * architect, what a module violation leaves it to decide. The lines are
 * placed as they are; nothing that reads them prefixes them again.
 *
 * A scenario check is read from its summary rather than quoted: each
 * scenario that did not pass with its file and line, its failing step, the
 * message and the steps no definition matched, and each one that passed
 * with its binding. `names` gives each tracked scenario's name.
 */
export async function gateDiagnostics(
  gate: GateAttempt,
  _audience: GateAudience,
  names: ReadonlyMap<string, string> = new Map(),
  /** The exact lock provider lines recorded before commands began, by one-based position. */
  waiting: ReadonlyMap<number, string> = new Map(),
): Promise<GateDiagnostics> {
  const summary: string[] = [];
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
    if (command.kind === 'scenarios' && command.scenarios !== undefined) {
      const passed = command.outcome === 'passed';
      const lines = scenarioCheckLines(command.scenarios, names, { indent: '  ', only: passed ? 'passed' : 'all' });
      if (lines.length > 0) {
        summary.push(passed
          ? `- \`${command.kind}\`: ${outcome}${exit}; each scenario it passed, and the step definitions that bound it:`
          : `- \`${command.kind}\`: ${outcome}${exit}; ${describeScenarioCheck(command.scenarios)}:`);
        summary.push(...lines);
        continue;
      }
    }
    if (command.outcome === 'passed') {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}`);
      continue;
    }
    const provider = providerFailureLines(gate, index);
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

/** Read only failure facts from the retained provider payload; successful output stays on demand. */
function providerFailureLines(gate: GateAttempt, index: number): string[] {
  const checks = gate.provider?.checks;
  if (checks === null || typeof checks !== 'object' || Array.isArray(checks)) return [];
  const command = gate.commands[index];
  if (command === undefined) return [];
  const id = command.providerCheckId;
  if (id === undefined) return [];
  const value = (checks as Record<string, unknown>)[id];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const check = value as Record<string, unknown>;
  const lines: string[] = [];
  const render = (label: string, result: Record<string, unknown>): void => {
    lines.push(`- ${label || id} status: ${typeof result['status'] === 'string' ? result['status'] : 'unknown'}; counts: ${result['counts'] === undefined ? 'unknown' : JSON.stringify(result['counts'])}`);
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
    if (cucumber !== null && typeof cucumber === 'object' && !Array.isArray(cucumber)) {
      const { raw: _raw, ...reference } = cucumber as Record<string, unknown>;
      lines.push(`- ${label}cucumberMessages: ${JSON.stringify(reference)}`);
    }
    const commands = result['commands'];
    if (commands !== null && typeof commands === 'object' && !Array.isArray(commands)) {
      for (const [name, entry] of Object.entries(commands)) {
        if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) render(`${label}${name}.`, entry as Record<string, unknown>);
      }
    }
  };
  render('', check);
  if (lines.length === 0) lines.push(`- The provider supplied no structured failure details for ${id}; inspect its exact check payload and full output.`);
  return lines;
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

/** A failure line of the check about one tracked scenario, which the lines per scenario say in full. */
const perScenarioFailure = /^sc-\d{3,} (?:passed|failed|undefined|pending|ambiguous|skipped):/;

/** The mode and the selection of one scenario check, in a phrase. */
export function describeScenarioCheck(summary: ScenarioCheckSummary): string {
  const selection = summary.selection.kind === 'identity'
    ? `selected by identity: ${summary.selection.scenarios.join(', ')}`
    : summary.selection.kind === 'all-untagged' ? 'every scenario without the pending tag' : 'every scenario';
  return `${summary.mode} mode${summary.dryRun ? ', a dry run' : ''}, ${selection}`;
}

/**
 * What one scenario check says, a line per point, each ready to place:
 * every tracked scenario that did not pass, with its name, its file and
 * line, the failing step, the message and each step no definition matched;
 * every one that passed, with the definition that bound each step as
 * `uri:line`; the project's own scenarios where any did not pass; and every
 * other reason the check failed. `only: 'passed'` keeps the passed ones.
 */
export function scenarioCheckLines(
  summary: ScenarioCheckSummary,
  names: ReadonlyMap<string, string> = new Map(),
  options: { readonly indent?: string; readonly only?: 'all' | 'passed' } = {},
): string[] {
  const indent = options.indent ?? '';
  const only = options.only ?? 'all';
  const passes = (status: string) => status === 'passed' || (summary.dryRun && status === 'skipped');
  const lines: string[] = [];
  const title = (id: string) => (names.has(id) ? `\`${id}\` "${names.get(id)}"` : `\`${id}\``);
  for (const result of summary.scenarios) {
    if (passes(result.status)) continue;
    if (only === 'passed') continue;
    lines.push(`- ${title(result.id)} ${result.status}, at \`${result.file}:${result.line}\`:`);
    if (result.failure !== undefined) {
      lines.push(`  - The failing step: \`${result.failure.step}\`.`);
      const message = boundedMessage(result.failure.message);
      if (message.length === 1) lines.push(`  - Its message: ${message[0]}`);
      else if (message.length > 1) {
        lines.push('  - Its message:');
        for (const line of message) lines.push(`        ${line}`);
      }
    }
    if (result.undefined.length > 0) {
      lines.push(`  - No step definition matches ${result.undefined.map(text => `"${text}"`).join(', ')}.`);
    }
  }
  for (const result of summary.scenarios) {
    if (!passes(result.status)) continue;
    if (result.binding.length === 0) {
      lines.push(`- ${title(result.id)} ${result.status}, at \`${result.file}:${result.line}\`, with no step bound.`);
      continue;
    }
    lines.push(`- ${title(result.id)} ${result.status}, at \`${result.file}:${result.line}\`, bound by:`);
    for (const binding of result.binding) lines.push(`  - \`${binding.step}\` → \`${binding.definition}\``);
  }
  if (only === 'all') {
    const { passed, skipped, failed } = summary.untracked;
    if (failed > 0 || (!summary.dryRun && skipped > 0)) {
      lines.push(`- The project's own scenarios: ${passed} passed, ${skipped} skipped, ${failed} failed.`);
    }
    for (const failure of summary.failures) {
      if (!perScenarioFailure.test(failure)) lines.push(`- ${failure}`);
    }
  }
  return lines.map(line => `${indent}${line}`);
}

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
  const lines = command.output.tail.split('\n').map(line => line.trimEnd()).filter(line => line.trim() !== '');
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

import { readFile } from 'node:fs/promises';
import { findingsOf, sentenceOf, type HookFinding } from '../hooks/post-write.js';
import type { GateAttempt, GateAttribution, GateCommandRecord } from './records.js';

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

/** Who a briefing is for, which decides the remedy it ends with. */
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
 */
export async function gateDiagnostics(gate: GateAttempt, audience: GateAudience): Promise<GateDiagnostics> {
  const summary: string[] = [];
  let findings: HookFinding[] = [];
  for (const command of gate.commands) {
    const outcome = command.outcome === 'not-verified'
      ? `not verified (${command.notVerified ?? 'unknown'})`
      : command.outcome;
    const exit = command.exitCode === null ? '' : `, exit ${command.exitCode}`;
    if (command.outcome === 'passed') {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}`);
      continue;
    }
    const reported = await ramifyFindingsOf(command);
    if (reported.length > 0) {
      findings = [...findings, ...reported];
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}, ${reported.length} finding${reported.length === 1 ? '' : 's'}:`);
      for (const finding of reported) summary.push(`  - ${sentenceOf(finding)}`);
      continue;
    }
    const tail = outputTail(command);
    if (tail.length === 0) {
      summary.push(`- \`${command.kind}\`: ${outcome}${exit}; it printed nothing`);
      continue;
    }
    summary.push(`- \`${command.kind}\`: ${outcome}${exit}; the end of what it printed:`);
    for (const line of tail) summary.push(`      ${line}`);
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
  if (findings.length > 0 && audience === 'local-architect') summary.push(architectRemedy(findings));
  return { id: gate.id, cause: gate.cause, summary };
}

/**
 * What a Ramify finding at a gate leaves the local architect to decide. An
 * engineer cannot widen its own module's access, and no repair round on the
 * same brief would: what the module receives is the architect's to arrange.
 */
function architectRemedy(findings: readonly HookFinding[]): string {
  const owners = [...new Set(findings.flatMap(finding => (finding.original === null ? [] : [finding.original.owner])))];
  const from = owners.length === 0 ? '' : ` The imports are owned by ${owners.map(owner => `\`${owner}\``).join(' and ')}.`;
  return 'A module violation is not a repair round: what your module receives is yours to arrange, not an engineer\'s.'
    + `${from} Re-brief the iteration naming what the module already receives and what to use instead, submit`
    + ' `request-placement` where another owner would have to expose a symbol, or re-plan the scope so the work sits'
    + ' with the owner that has what it needs.';
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

/**
 * Where a failed Ramify check's findings lie, against the write scope of the
 * assignment the attempt followed. Ramify names each finding's file, so this
 * is read from the report and never from what a test printed. Without a
 * write scope, or without a failed Ramify check, there is nothing to
 * attribute and the cause keeps its own rules.
 */
export async function ramifyAttribution(
  commands: readonly GateCommandRecord[],
  writeScope: readonly string[] | null,
): Promise<GateAttribution | null> {
  if (writeScope === null) return null;
  const failed = commands.find(command => command.kind === 'ramify-check' && command.outcome === 'failed');
  if (failed === undefined) return null;
  const findings = await ramifyFindingsOf(failed);
  if (findings.length === 0) return null;
  const inScope: string[] = [];
  const outside: string[] = [];
  for (const finding of findings) {
    const file = finding.file;
    if (file === null) outside.push('the project');
    else (inside(file, writeScope) ? inScope : outside).push(finding.line === null ? file : `${file}:${finding.line}`);
  }
  return { basis: 'ramify-findings', inScope, outside };
}

/** Whether one project-relative file lies inside the write scope's roots or is one of its files. */
function inside(file: string, writeScope: readonly string[]): boolean {
  return writeScope.some(path => file === path || path === '.' || file.startsWith(`${path}/`));
}

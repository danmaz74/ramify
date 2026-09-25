import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { GateAttribution, GateCommandRecord, TypeCheckOutput } from './records.js';
import type { PlannedCheck } from './verify.js';

/*
 * The type check's own error locations, where the project declares the
 * format its type checker prints. `tsc` names the file of every error, so a
 * failed type check is attributed as a failed Ramify check is: from where
 * its errors lie, against the write scope of the assignment the attempt
 * followed.
 *
 * Nothing is read from output whose format the project did not declare, and
 * nothing is guessed: a line this reader does not know, a truncated output
 * or a failure that printed no error leaves the attribution to which
 * commands failed, as before.
 */

/** One error `tsc` printed: its file and line as printed, or neither for an error of the configuration. */
export interface TscError {
  readonly file: string | null;
  readonly line: number | null;
  readonly code: string;
}

/** `path(line,col): error TSnnnn: message`, the form `--pretty false` prints. */
const plainError = /^(.+?)\((\d+),(\d+)\): error (TS\d+): /u;

/** `path:line:col - error TSnnnn: message`, the pretty form. */
const prettyError = /^(.+?):(\d+):(\d+) - error (TS\d+): /u;

/** `error TSnnnn: message`: an error of the configuration or the command line, with no file. */
const globalError = /^error (TS\d+): /u;

/** The escape sequences a pretty form colours its output with. */
const ansi = /\u001b\[[0-9;]*[A-Za-z]/gu;

/** What the reader passes over: npm's lifecycle banner and its own error and warning lines. */
const npmLine = /^(?:> |npm (?:error|ERR!|warn|WARN)(?: |$))/u;

/** The summary `tsc` ends with, and the header of its table of files. */
const summaryLine = /^(?:Found \d+ errors?\b|Errors\s+Files$)/u;

/** A line of the pretty form's code excerpt, which begins with the line number. */
const excerptLine = /^\d+(?:\s|$)/u;

/**
 * Every error one `tsc` output names, in order, or null where any line is
 * neither an error nor one this reader may pass over: a blank line, an
 * indented continuation, npm's banner and error lines, the summary, and,
 * after a pretty error, the lines of its code excerpt.
 */
export function readTscOutput(text: string): TscError[] | null {
  const errors: TscError[] = [];
  let pretty = false;
  for (const raw of text.replace(ansi, '').split('\n')) {
    const line = raw.replace(/\r$/u, '');
    if (line.trim() === '' || /^\s/u.test(line) || npmLine.test(line) || summaryLine.test(line)) continue;
    const plain = plainError.exec(line);
    const prettyMatch = plain === null ? prettyError.exec(line) : null;
    const located = plain ?? prettyMatch;
    if (located !== null) {
      if (prettyMatch !== null) pretty = true;
      errors.push({ file: located[1]!, line: Number(located[2]), code: located[4]! });
      continue;
    }
    const global = globalError.exec(line);
    if (global !== null) {
      errors.push({ file: null, line: null, code: global[1]! });
      continue;
    }
    if (pretty && excerptLine.test(line)) continue;
    return null;
  }
  return errors;
}

/**
 * Where a failed type check's errors lie, against the write scope of the
 * assignment the attempt followed, for a type check whose output format the
 * project declared. Each error's file is read relative to the command's
 * working directory and recorded relative to the project; an error with no
 * file lies outside every scope. Null, so that the cause keeps its own
 * rules, without a write scope, without a failed type check, where any
 * failed one has no declared format, printed more than its output kept or
 * a line this reader cannot read, or failed without naming an error.
 */
export async function typeCheckAttribution(
  commands: readonly GateCommandRecord[],
  checks: readonly PlannedCheck[],
  writeScope: readonly string[] | null,
  projectRoot: string,
): Promise<GateAttribution | null> {
  if (writeScope === null) return null;
  const failed = commands.flatMap((command, index) => (command.kind === 'type-check' && command.outcome === 'failed' ? [{ command, check: checks[index] }] : []));
  if (failed.length === 0) return null;
  const inScope: string[] = [];
  const outside: string[] = [];
  for (const { command, check } of failed) {
    const errors = await declaredErrors(command, check?.output);
    if (errors === null || errors.length === 0) return null;
    for (const error of errors) {
      if (error.file === null) {
        outside.push('the project');
        continue;
      }
      const file = projectRelative(projectRoot, command.command.cwd, error.file);
      (insideProject(file) && insideScope(file, writeScope) ? inScope : outside).push(`${file}:${error.line}`);
    }
  }
  return { basis: 'type-check-errors', inScope, outside };
}

/** The errors one failed type check printed in its declared format, or null where they cannot be read. */
async function declaredErrors(command: GateCommandRecord, output: TypeCheckOutput | undefined): Promise<TscError[] | null> {
  if (output !== 'tsc' || command.output.truncated) return null;
  let text: string;
  try {
    text = await readFile(command.output.path, 'utf8');
  } catch {
    return null;
  }
  return readTscOutput(text);
}

/** A printed path, relative to the command's working directory, as a path relative to the project root. */
function projectRelative(projectRoot: string, cwd: string, printed: string): string {
  return relative(projectRoot, resolve(cwd, printed)).split(sep).join('/');
}

/** Whether a path relative to the project root names a file beneath it. */
function insideProject(path: string): boolean {
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith('../');
}

/** Whether one project-relative file lies inside the write scope's roots or is one of its files. */
function insideScope(file: string, writeScope: readonly string[]): boolean {
  return writeScope.some(path => file === path || path === '.' || file.startsWith(`${path}/`));
}

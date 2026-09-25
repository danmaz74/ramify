import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { checkCommandEnvironment } from './records.js';
import type { CheckCommand, CheckCommandKind, NotVerified, TestSelection, TypeCheckOutput } from './records.js';
import type { ScenarioCheckPlan } from './scenario-check.js';

/*
 * Verification before execution. Every command and every selection of an
 * attempt is verified before the first command runs, so a checkpoint that
 * cannot run what it requires runs nothing at all and says why.
 */

/** One command a checkpoint intends to run, with the selection it was resolved from. */
export interface PlannedCheck {
  readonly kind: CheckCommandKind;
  /** A `setup` check's declared name, such as `build`. */
  readonly name?: string | undefined;
  readonly command: CheckCommand;
  /** Resolved anew from the current tree; recorded on the attempt, never on the assignment. */
  readonly selection?: TestSelection | undefined;
  /** Whether this checkpoint requires the selection to select something. */
  readonly requiresTests?: boolean | undefined;
  /**
   * A discovery over the current tree that failed, or a required suite that
   * rediscovery could not select. The caller establishes it; neither ever
   * falls back to a stale list.
   */
  readonly discovery?: { readonly failed: 'discovery-error' | 'required-suite-missing'; readonly detail: string } | undefined;
  /**
   * What a failure of this command is attributed to. `in-scope` is the
   * assignment's own selection; `project` is everything else the checkpoint
   * runs. A project command that fails while every in-scope command passed
   * is a failure outside the last assignment, which the attempt's cause
   * says. It is decided by which files ran, and not by what they printed,
   * except where a command's own report or declared `output` names where
   * each failure lies.
   */
  readonly attribution?: 'in-scope' | 'project' | undefined;
  /**
   * For a `type-check` check: the format of what it prints, as the project
   * declared it. Where it is declared, a failure is attributed from the
   * locations of its errors.
   */
  readonly output?: TypeCheckOutput | undefined;
  /**
   * For a `scenarios` check: its runs, setup and teardown. The command is
   * then the mode's configured command, which each run extends with its
   * profile, and its timeout the bound of the whole check.
   */
  readonly scenarios?: ScenarioCheckPlan | undefined;
}

/** Why one planned command cannot run. */
export interface VerificationFailure {
  readonly notVerified: NotVerified;
  readonly detail: string;
}

/** For each planned command, why it cannot run, or null when it can. */
export async function verifyChecks(checks: readonly PlannedCheck[]): Promise<Array<VerificationFailure | null>> {
  return Promise.all(checks.map(verifyCheck));
}

async function verifyCheck(check: PlannedCheck): Promise<VerificationFailure | null> {
  if (check.discovery !== undefined) {
    return { notVerified: check.discovery.failed, detail: check.discovery.detail };
  }

  const executable = check.command.argv[0];
  if (executable === undefined) {
    return { notVerified: 'command-missing', detail: 'The command names no executable' };
  }

  if (!(await isDirectory(check.command.cwd))) {
    return { notVerified: 'command-missing', detail: `The working directory ${check.command.cwd} does not exist` };
  }
  if (!(await isExecutable(executable, check.command))) {
    return { notVerified: 'command-missing', detail: `${executable} cannot be run from ${check.command.cwd}` };
  }
  for (const around of [check.scenarios?.setup, check.scenarios?.teardown]) {
    const aroundExecutable = around?.argv[0];
    if (around === null || around === undefined) continue;
    if (aroundExecutable === undefined || !(await isExecutable(aroundExecutable, around))) {
      return { notVerified: 'command-missing', detail: `${aroundExecutable ?? 'An empty setup or teardown'} cannot be run from ${around.cwd}` };
    }
  }

  const selection = check.selection;
  if (selection !== undefined) {
    if (check.requiresTests === true && selection.resolved.length === 0) {
      return { notVerified: 'empty-selection', detail: `The ${selection.policy} selection selected no test file` };
    }
    const selected = new Set(selection.resolved);
    const missing = selection.extraSuites.filter(suite => !selected.has(suite));
    if (missing.length > 0) {
      return { notVerified: 'required-suite-missing', detail: `Required suites not selected: ${missing.join(', ')}` };
    }
  }
  return null;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Whether the executable can be run: a path as given, a bare name on the command's own `PATH`. */
async function isExecutable(executable: string, command: CheckCommand): Promise<boolean> {
  const candidates = executable.includes('/')
    ? [isAbsolute(executable) ? executable : join(command.cwd, executable)]
    : (checkCommandEnvironment(command)['PATH'] ?? '').split(delimiter).filter(entry => entry !== '').map(entry => join(entry, executable));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

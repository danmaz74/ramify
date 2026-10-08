import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { checkCommandEnvironment } from './records.js';
import type { CheckCommand, CheckCommandKind, NotVerified, TypeCheckOutput } from './records.js';

/*
 * Verification before execution. Every command of an in-place diagnosis is
 * verified before the first command runs, so a checkpoint that cannot run
 * what it requires runs nothing at all and says why. A committing gate plans
 * no command: the project's committed audit definition names its checks.
 */

/** One command a standalone session's in-place diagnosis intends to run. */
export interface PlannedCheck {
  readonly kind: CheckCommandKind;
  /** A `setup` check's declared name, such as `build`. */
  readonly name?: string | undefined;
  readonly command: CheckCommand;
  /**
   * For a `type-check` check: the format of what it prints, as the project
   * declared it, retained with the command's diagnostic evidence.
   */
  readonly output?: TypeCheckOutput | undefined;
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

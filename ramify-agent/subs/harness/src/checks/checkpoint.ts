import { join } from 'node:path';
import { checkCommand } from './records.js';
import type { CheckCommand, Checkpoint, TypeCheckOutput } from './records.js';
import type { PlannedCheck } from './verify.js';
import type { ConfiguredAuditMode } from '../../subs/audit/src/check-execution.js';

/*
 * What each checkpoint requires. It is mechanical and hardcoded, as the
 * architecture requires: no submission carries it and no agent chooses it.
 *
 * A committing checkpoint asks the project's committed audit about its
 * commit: ordinary gates in the provider's default mode, which audits a
 * Ramify project `ramify-partial` from its baseline, and the final gate in
 * full. The audit definition names every check, its scenarios among them;
 * the harness adds none. A standalone session's in-place diagnosis runs the
 * project's setup, its type check and a complete Ramify check.
 */

/** What one checkpoint requires of its gate. */
export interface CheckpointPolicy {
  /** Whether a verified attempt is committed before its audit runs. */
  readonly committing: boolean;
  /** The mode a committing checkpoint requests of the committed audit. */
  readonly audit: ConfiguredAuditMode;
}

export const checkpointPolicies: Record<Checkpoint, CheckpointPolicy> = {
  readiness: { committing: false, audit: 'full' },
  iteration: { committing: true, audit: 'project-default' },
  contract: { committing: true, audit: 'project-default' },
  'breaking-iteration': { committing: true, audit: 'project-default' },
  'work-item': { committing: true, audit: 'project-default' },
  final: { committing: true, audit: 'full' },
};

/** The commands of the project an in-place diagnosis runs, through the policy the run captured. */
export interface ProjectCommands {
  readonly typeCheck: CheckCommand;
  readonly ramifyCheck: CheckCommand;
}

/**
 * A standalone session's in-place diagnosis: the project's setup commands,
 * its type check and a complete Ramify check. It runs no test file the
 * harness selected; the project's configured suite runs at a run's gates.
 */
export function diagnosisChecks(
  commands: ProjectCommands,
  setup: readonly SetupDeclaration[],
  projectRoot: string,
  output?: TypeCheckOutput | undefined,
): PlannedCheck[] {
  return [
    ...setupChecks(setup, projectRoot),
    { kind: 'type-check', command: commands.typeCheck, ...(output === undefined ? {} : { output }) },
    { kind: 'ramify-check', command: commands.ramifyCheck },
  ];
}

// The project's setup.

/** How long one setup command may run where it declares no bound: ten minutes, as ramify-audit's own default. */
export const defaultSetupTimeoutMs = 600_000;

/** One setup command the project declares in its captured `ramify-agent.json`. */
export interface SetupDeclaration {
  readonly name?: string | undefined;
  readonly command: readonly string[];
  /** Relative to the project root, which it defaults to. */
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  /** Added to the environment the harness builds for every command. */
  readonly env?: Readonly<Record<string, string>> | undefined;
}

/**
 * The project's setup commands as a gate's first checks, in the order the
 * project declares them. Every check after them needs what they prepare,
 * such as a build output the repository ignores, so an executor runs none
 * of the others once one of them has not passed. A setup command is a
 * command of the whole project.
 */
export function setupChecks(setup: readonly SetupDeclaration[], projectRoot: string): PlannedCheck[] {
  return setup.map(entry => ({
    kind: 'setup' as const,
    ...(entry.name === undefined ? {} : { name: entry.name }),
    command: checkCommand({
      argv: [...entry.command],
      cwd: entry.cwd === undefined || entry.cwd === '' || entry.cwd === '.' ? projectRoot : join(projectRoot, entry.cwd),
      timeoutMs: entry.timeoutMs ?? defaultSetupTimeoutMs,
      ...(entry.env === undefined ? {} : { envAdditions: { ...entry.env } }),
    }),
  }));
}

/**
 * The runner errors ramify-audit answers for a command it refuses to run
 * because it installs dependencies where `node_modules` is a link to the
 * project's own: a setup command's, and a check command's.
 */
export const linkedModulesRefusals: ReadonlySet<string> = new Set(['setup-command-unsafe-with-linked-modules', 'unsafe-with-linked-modules']);

const packageManagers = new Set(['npm', 'pnpm', 'yarn']);
const installSubcommands = new Set(['ci', 'install', 'i', 'add', 'prune', 'dedupe', 'update', 'uninstall', 'rm']);
/** Options whose value is a separate argument, so it is not taken for the subcommand. */
const valueOptions = new Set(['--prefix', '-C', '--dir', '--cwd', '--workspace', '--filter', '-F']);

/**
 * The package-manager operation a command performs where it installs or
 * removes dependencies (`npm ci`, `pnpm install`, a bare `yarn`), and null
 * for any other command. It is ramify-audit's rule for what it refuses to
 * run through a linked `node_modules`, read from the argv alone, never from
 * a script the command runs.
 */
export function installOperation(argv: readonly string[]): string | null {
  const [program, ...args] = argv;
  if (program === undefined) return null;
  const tool = (program.split(/[\\/]/u).at(-1) ?? program).replace(/\.(?:cmd|exe)$/iu, '');
  if (!packageManagers.has(tool)) return null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return installSubcommands.has(arg) ? `${tool} ${arg}` : null;
  }
  return tool === 'yarn' ? tool : null;
}

import { childEnvironment, environmentNames } from '../../subs/evidence/src/run-command.js';
import type { ScenarioMode, ScenarioSelection } from '../../subs/scenarios/src/profiles.js';
import type { ScenarioRunResult } from '../../subs/scenarios/src/messages.js';

/*
 * The gate's record and the shapes it is built from. Nothing here knows about
 * a run: a checkpoint names what must hold, a check command names what to run,
 * and a selection names which test files the checkpoint requires. The policy
 * that chooses them belongs to the iterations that assign work.
 *
 * A check command names its environment and never holds its values, which is
 * why the shapes are built here rather than written out by each caller:
 * `checkCommand` is the one constructor and `checkCommandEnvironment` the one
 * way to the environment a child receives.
 */

/** A gate attempt's identifier, `ga-0012`, counted over committed attempts. */
export type GateAttemptId = string;

/** A commit of the run branch. */
export type AcceptedCommit = string;

/**
 * A committed record at one revision, as the core records proposal's
 * `RecordRef`. The name differs here because `jobs/commit.ts` already uses
 * `RecordRef` for a record body on its way into the log; this is the identity
 * of one that is already there.
 */
export interface RecordReference {
  readonly id: string;
  readonly revision: number;
  /** The SHA-256 of the record file's bytes. */
  readonly hash: string;
}

/**
 * One external command, with the environment the harness built for it named
 * and not quoted.
 *
 * `env` is the sorted names of the variables the child receives, which is all
 * a record ever holds of an environment. `envAdditions` is the harness's own
 * settings for this command, values included: they are the harness's, built
 * from the project and never inherited, and a command whose settings were
 * dropped would run against the wrong daemon rather than fail. Everything
 * else of the environment comes from the allowlist at the moment the command
 * is spawned, so a captured command is still complete: a run resumed after a
 * crash builds the same environment again.
 */
export interface CheckCommand {
  readonly argv: string[];
  readonly cwd: string;
  readonly env: string[];
  readonly envAdditions: Record<string, string>;
  readonly timeoutMs: number;
}

/** One external command as it is asked for; its environment is built here. */
export interface CheckCommandRequest {
  readonly argv: string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  /** The harness's own settings for this command. Never a variable of this process. */
  readonly envAdditions?: Record<string, string> | undefined;
}

/** The one constructor of a check command: it names the environment the child will receive. */
export function checkCommand(request: CheckCommandRequest): CheckCommand {
  const envAdditions = request.envAdditions ?? {};
  return {
    argv: [...request.argv],
    cwd: request.cwd,
    env: environmentNames(childEnvironment(envAdditions)),
    envAdditions,
    timeoutMs: request.timeoutMs,
  };
}

/**
 * The complete environment a check command's child receives: the allowlist as
 * it stands now, plus the command's own settings. It is built at the moment
 * of the spawn and read from no record.
 */
export function checkCommandEnvironment(command: CheckCommand): Record<string, string> {
  return childEnvironment(command.envAdditions);
}

/** What a set of checks is being run for. */
export type Checkpoint = 'readiness' | 'iteration' | 'contract' | 'breaking-iteration' | 'work-item' | 'final';

/** Which tests a checkpoint requires, captured on an assignment as a policy, never as a file list. */
export interface TestSelectionPolicy {
  readonly policy: 'owned-by-scope' | 'all-project';
  readonly exactOwners: string[];
  readonly subtrees: string[];
  /** Suites a registered evidence obligation requires; each must be selected. */
  readonly extraSuites: string[];
}

/** A policy resolved against the current tree, recorded on the attempt that ran it. */
export interface TestSelection extends TestSelectionPolicy {
  readonly resolved: string[];
}

/** The kinds of command a gate runs. `scenarios` is one Cucumber run per module, with the mode's setup and teardown around them. */
export type CheckCommandKind = 'ramify-check' | 'type-check' | 'tests' | 'conformance' | 'scenarios';

/**
 * Why a command was not verified. Every one of them means the command did not
 * answer, so none of them is ever a pass.
 *
 * - `timeout`, `runner-error`, `interrupted`: the command did not complete.
 *   `interrupted` also covers a command of an attempt that never ran, because
 *   another command of the same attempt failed verification.
 * - `command-missing`: the executable or its working directory is not there.
 * - `empty-selection`: the checkpoint requires tests and the selection has none.
 * - `discovery-error`, `required-suite-missing`: discovery over the current
 *   tree failed, or a required suite is not in what it selected. Neither ever
 *   falls back to an earlier list. A failed discovery is infrastructure: the
 *   inventory the harness needs could not be refreshed, and no repair of the
 *   source would change that.
 */
export type NotVerified =
  | 'timeout' | 'runner-error' | 'command-missing' | 'empty-selection'
  | 'interrupted' | 'discovery-error' | 'required-suite-missing';

/**
 * What the cause was read from, beyond the runner error, the timeout and the
 * exit codes. A Ramify check prints a structured report that names each
 * finding's own file, so a failure of it is attributed to where the findings
 * lie: `inScope` and `outside` are those locations against the write scope of
 * the assignment the attempt followed. No test output is parsed for this, and
 * an attempt with no such report records no attribution.
 */
export interface GateAttribution {
  readonly basis: 'ramify-findings';
  readonly inScope: string[];
  readonly outside: string[];
}

/** What a verdict is attributed to. It derives from the runner error, the timeout, the exit codes and a Ramify report's own locations, never from output text. */
export type GateCause =
  | 'in-scope' | 'infrastructure' | 'timeout' | 'invalid-session'
  | 'outside-assignment' | 'guarded-change' | 'unknown';

/** What the harness does with the attempt. */
export type GateNext = 'accept' | 'repair' | 'retry-infrastructure' | 'return-to-local-architect' | 'exhausted';

/**
 * A rule the harness verifies itself, beside the commands it runs: it reads
 * the tree rather than spawning anything. A failed rule fails the attempt,
 * and what it found is the diagnostics the engineer repairs from.
 */
export interface GateRuleRecord {
  readonly rule: 'fake-naming';
  readonly outcome: 'passed' | 'failed';
  readonly violations: ReadonlyArray<{ readonly rule: string; readonly path: string; readonly detail: string }>;
}

/** One command of an attempt, as the attempt records it. */
export interface GateCommandRecord {
  readonly kind: CheckCommandKind;
  readonly command: CheckCommand;
  readonly selection?: TestSelection;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly exitCode: number | null;
  readonly outcome: 'passed' | 'failed' | 'not-verified';
  readonly notVerified?: NotVerified;
  /** Set only by the code that spawns the command. Never inferred from output. */
  readonly runnerError: { readonly kind: string; readonly message: string } | null;
  /** The complete output is a file beside the attempt; `tail` has a fixed bound. */
  readonly output: { readonly path: string; readonly bytes: number; readonly truncated: boolean; readonly tail: string };
  /** For a `scenarios` command: what its message streams said. Its outcome is read from this, not from the exit codes alone. */
  readonly scenarios?: ScenarioCheckSummary;
}

/** One Cucumber run of a scenario check: one module's step and feature files. */
export interface ScenarioCheckRun {
  /** The module's declared-name path. */
  readonly module: string;
  /** Null when the run did not complete, or was never started. */
  readonly exit: number | null;
  /** The profile it ran, relative to the attempt's directory. */
  readonly profile: string;
  /** Its message stream, relative to the attempt's directory. */
  readonly messages: string;
}

/** One tracked scenario's result, with the run that executed it. */
export interface ScenarioCheckResult extends ScenarioRunResult {
  /** The module whose run executed it. */
  readonly run: string;
}

/**
 * What a `scenarios` command established, read from the runs' message
 * streams. It passes only when every run exited zero, every selected tracked
 * scenario passed and every one of the project's own scenarios passed; a dry
 * run passes a scenario whose steps all have a definition.
 */
export interface ScenarioCheckSummary {
  readonly mode: ScenarioMode;
  readonly selection: ScenarioSelection;
  readonly dryRun: boolean;
  /** Tracked scenarios the runs' files held and the selection kept out. */
  readonly excluded: number;
  /** The mode's `setup` and `teardown`, where configured, by exit code. */
  readonly setup: { readonly exit: number | null } | null;
  readonly teardown: { readonly exit: number | null } | null;
  readonly runs: readonly ScenarioCheckRun[];
  readonly scenarios: readonly ScenarioCheckResult[];
  /** The project's own scenarios, by count, over every run. */
  readonly untracked: { readonly passed: number; readonly skipped: number; readonly failed: number };
  /** Why the check did not pass, one line each; empty when it passed. */
  readonly failures: readonly string[];
}

/** Published evidence that certifies the exact commit named by `audited`. */
export interface GateEvidence {
  readonly runRef: string;
  readonly reportCommit: string;
  readonly treeRef: string;
}

/** One run of a checkpoint's commands over the working directory. */
export interface GateAttempt {
  readonly schema: 'ramify-agent.gate-attempt/3';
  readonly id: GateAttemptId;
  readonly checkpoint: Checkpoint;
  /** Neither for readiness and final. */
  readonly subject: { readonly workItem?: string; readonly iteration?: string };
  readonly proposedBy: string | null;
  readonly repairRound: number;
  readonly infrastructureAttempt: number;
  /** The run branch's head observed before this attempt made any commit. */
  readonly head: AcceptedCommit;
  /** The commit this attempt made, whatever its verdict; null when the tree was unchanged. */
  readonly commit: AcceptedCommit | null;
  /** The commit the checks ran over; null when execution never began or ran in place. */
  readonly audited: AcceptedCommit | null;
  /** The audit publication bound to `audited`; null when no evidence was published. */
  readonly evidence: GateEvidence | null;
  /** Exact external report result. Kept on the in-memory attempt for atomic durable publication. */
  readonly auditOverall?: 'pass' | 'fail' | null;
  /** `after: null` is a deletion, which is a change like any other. */
  readonly guardedChanges: Array<{ readonly path: string; readonly before: string; readonly after: string | null; readonly authorizedBy: RecordReference | null }>;
  /** Rules the harness verified itself. A checkpoint with none records none. */
  readonly rules?: GateRuleRecord[];
  readonly commands: GateCommandRecord[];
  /**
   * `none-selected` when the checkpoint's scenario check had nothing to run:
   * no tracked scenario of the scope was past `pending`, or no module had
   * feature files. That is not a failure. Absent where a scenario check ran,
   * and for a gate without a project configuration.
   */
  readonly scenarios?: 'none-selected';
  readonly verdict: 'passed' | 'failed' | 'not-verified';
  readonly cause: GateCause | null;
  /** What the cause was read from, where a report of its own named the files. */
  readonly attribution?: GateAttribution;
  readonly next: GateNext;
}

/** The version this harness writes and reads. */
export const gateAttemptSchema = 'ramify-agent.gate-attempt/3';

/*
 * The gate's record and the shapes it is built from. Nothing here knows about
 * a run: a checkpoint names what must hold, a check command names what to run,
 * and a selection names which test files the checkpoint requires. The policy
 * that chooses them belongs to the iterations that assign work.
 */

/** A gate attempt's identifier, `ga-0012`, counted over committed attempts. */
export type GateAttemptId = string;

/** A commit of the run branch, made by the harness after a gate passed. */
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

/** One external command, with the complete environment the harness built for it. */
export interface CheckCommand {
  readonly argv: string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly timeoutMs: number;
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

/** The four kinds of command a gate runs. */
export type CheckCommandKind = 'ramify-check' | 'type-check' | 'tests' | 'conformance';

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

/** What a verdict is attributed to. It derives from the runner error, the timeout and the exit codes, never from output text. */
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
}

/** One run of a checkpoint's commands over the working directory. */
export interface GateAttempt {
  readonly schema: 'ramify-agent.gate-attempt/1';
  readonly id: GateAttemptId;
  readonly checkpoint: Checkpoint;
  /** Neither for readiness and final. */
  readonly subject: { readonly workItem?: string; readonly iteration?: string };
  readonly proposedBy: string | null;
  readonly repairRound: number;
  readonly infrastructureAttempt: number;
  /** The run branch's head when the commands ran, in the working directory. */
  readonly head: AcceptedCommit;
  /** The commit made after a pass; null for a failure, for no change, and until that effect completes. */
  readonly commit: AcceptedCommit | null;
  /** `after: null` is a deletion, which is a change like any other. */
  readonly guardedChanges: Array<{ readonly path: string; readonly before: string; readonly after: string | null; readonly authorizedBy: RecordReference | null }>;
  /** Rules the harness verified itself. A checkpoint with none records none. */
  readonly rules?: GateRuleRecord[];
  readonly commands: GateCommandRecord[];
  readonly verdict: 'passed' | 'failed' | 'not-verified';
  readonly cause: GateCause | null;
  readonly next: GateNext;
}

/** The version this harness writes and reads. */
export const gateAttemptSchema = 'ramify-agent.gate-attempt/1';

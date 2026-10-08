import { childEnvironment, environmentNames } from '../../subs/evidence/src/run-command.js';

/*
 * The gate's record and the shapes it is built from. Nothing here knows about
 * a run: a checkpoint names what must hold, and a committing gate's audit
 * record names what the project's committed audit answered for it. A check
 * command names what a standalone session's in-place diagnosis runs.
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

/**
 * The owners an assignment is judged on, captured as a policy and never as a
 * file list. It is briefing text only: the engineer is told the test areas
 * of these owners, and the gate's audit runs what the project configured.
 */
export interface TestSelectionPolicy {
  readonly policy: 'owned-by-scope' | 'all-project';
  readonly exactOwners: string[];
  readonly subtrees: string[];
  /** Suites a registered evidence obligation names, briefed beside the owners' test areas. */
  readonly extraSuites: string[];
}

/**
 * The kinds of command a gate announces. `setup`, `type-check` and
 * `ramify-check` are a standalone session's in-place diagnosis; `setup` is
 * one of the project's declared setup commands, which run in order before
 * every other command. `configured` is one check of the project's committed
 * audit definition, as the provider starts it.
 */
export type CheckCommandKind = 'setup' | 'ramify-check' | 'type-check' | 'configured';

/**
 * Why a command was not verified. Every one of them means the command did not
 * answer, so none of them is ever a pass.
 *
 * - `timeout`, `runner-error`, `interrupted`: the command did not complete.
 *   `interrupted` also covers a command of an attempt that never ran, because
 *   another command of the same attempt failed verification.
 * - `command-missing`: the executable or its working directory is not there.
 * - `setup-failed`: a setup command before it did not pass, so it never ran.
 *   It is not a cause of its own: the setup command's record is.
 * - `local-rule-failed`: a harness rule failed before the command could run.
 */
export type NotVerified =
  | 'timeout' | 'runner-error' | 'command-missing' | 'interrupted' | 'setup-failed' | 'local-rule-failed';

/**
 * A format of the type checker's output the project declares in
 * `ramify-agent.json`, which the gate may read error locations from. `tsc`
 * is the compiler's own, in either its plain or its pretty form.
 */
export type TypeCheckOutput = 'tsc';

/** What an attribution's locations were read from: a Ramify report, the type check's errors, or both. */
export type GateAttributionBasis = 'ramify-findings' | 'type-check-errors' | 'ramify-findings-and-type-check-errors';

/**
 * What the cause was read from, beyond the runner error, the timeout and the
 * exit codes. A Ramify check prints a structured report that names each
 * finding's own file, and a type check whose output format the project
 * declared names each error's file, so a failure of either is attributed to
 * where its findings or errors lie: `inScope` and `outside` are those
 * locations against the write scope of the assignment the attempt followed.
 * No test output is parsed for this, nor the output of a command whose
 * format the project did not declare, and an attempt with neither records
 * no attribution.
 */
export interface GateAttribution {
  readonly basis: GateAttributionBasis;
  readonly inScope: string[];
  readonly outside: string[];
}

/**
 * Why a gate did not pass. `check-failed` records a command or rule failure
 * without assigning its location or repair owner. The current scripted
 * lifecycle engine also retains its location-attribution vocabulary until
 * Plan21 iteration 9 replaces that execution seam.
 */
export type GateCause =
  | 'check-failed' | 'in-scope' | 'infrastructure' | 'timeout' | 'invalid-session'
  | 'outside-assignment' | 'guarded-change' | 'unknown';

/** What the harness does with the attempt. */
export type GateNext = 'accept' | 'repair' | 'retry-infrastructure' | 'return-to-local-architect' | 'exhausted';

/**
 * A rule the harness verifies itself, beside the commands it runs: it reads
 * the tree rather than spawning anything. A failed rule fails the attempt,
 * and what it found is the diagnostics the engineer repairs from.
 */
export interface GateRuleRecord {
  readonly rule: 'fake-naming' | 'fake-exposure-parity' | 'scratch-safety' | 'write-scope';
  readonly outcome: 'passed' | 'failed';
  readonly violations: ReadonlyArray<{ readonly rule: string; readonly path: string; readonly detail: string }>;
  /** What the rule could not establish, or found and did not attribute to this attempt; absent when nothing. */
  readonly limits?: readonly string[];
}

/** One command of an attempt, as the attempt records it. */
export interface GateCommandRecord {
  readonly kind: CheckCommandKind;
  /** The audit producer's exact definition ID; absent for in-place and preparation commands. */
  readonly providerCheckId?: string;
  /** A setup command's declared name, such as `build`; absent for every other kind and for an unnamed one. */
  readonly name?: string;
  readonly command: CheckCommand;
  readonly startedAt: string;
  readonly elapsedMs: number;
  /** Machine test lock wait before the process started, when one occurred. */
  readonly lockWaitMs?: number;
  readonly exitCode: number | null;
  readonly outcome: 'passed' | 'failed' | 'not-verified';
  readonly notVerified?: NotVerified;
  /** Set only by the code that spawns the command. Never inferred from output. */
  readonly runnerError: { readonly kind: string; readonly message: string } | null;
  /** The complete output is a file beside the attempt; `tail` has a fixed bound. */
  readonly output: { readonly path: string; readonly bytes: number; readonly truncated: boolean; readonly tail: string };
  /**
   * How ramify-audit stopped the command's process tree, in words, where it
   * stopped it: a setup command that timed out or was cancelled in an
   * audited worktree. Absent for every command it did not stop.
   */
  readonly stopped?: string;
  /** The command's output streams stayed open after it ended, so what it printed may be incomplete. */
  readonly outputIncomplete?: true;
}

/**
 * The published audit record that answers `audited`: the record the request
 * ran, or the applicable earlier record the provider reused, whose own
 * source commit the attempt's `audit.auditedSourceCommit` names.
 */
export interface GateEvidence {
  readonly runRef: string;
  readonly reportCommit: string;
  readonly treeRef: string;
}

/**
 * What a committing gate asked of the project's committed audit and what the
 * provider answered. The request is the committed definition at the
 * candidate commit; the harness names only the mode. `project-default` leaves
 * it to the provider, which audits a Ramify project `ramify-partial` from its
 * baseline; `full` asks for a full audit. A reused record keeps both source
 * identities: the requested commit and the commit it audited, with the
 * ignored changes between them that make it applicable. `refused` is a
 * completed answer that does not answer this request, which never passes.
 */
export interface GateAuditRecord {
  readonly requestId: string;
  readonly mode: 'project-default' | 'full';
  readonly status: 'completed' | 'failed' | 'cancelled' | 'refused';
  readonly definition: { readonly path: string; readonly blob: string };
  readonly requestedSourceCommit: string;
  readonly auditedSourceCommit: string | null;
  readonly requestedMode: 'full' | 'ramify-partial' | null;
  readonly executedMode: 'full' | 'ramify-partial' | null;
  readonly fallbackReason: string | null;
  readonly reuse: {
    readonly auditedCommit: string;
    readonly ignoredChangedPaths: readonly string[];
    readonly requestedMode: 'full' | 'ramify-partial';
    readonly resolution: 'requested' | 'defaulted';
  } | null;
  /**
   * The provider's composed verdict; null when the audit did not complete or
   * was refused. A nested request's is the invocation's verdict over every
   * project and its discovery, never the root's alone.
   */
  readonly verdict: 'pass' | 'fail' | 'indeterminate' | null;
  readonly detail: string;
  /** Whether the request audited the tracked nested definitions too. */
  readonly nested: boolean;
  /** Every project of a nested request, the root first; null for a request of the root alone. */
  readonly projects: readonly GateAuditProjectRecord[] | null;
  /** What nested discovery skipped, with reasons, and what it could not decide; null for a request of the root alone. */
  readonly discovery: {
    readonly status: 'complete' | 'indeterminate';
    readonly skipped: readonly {
      readonly projectRoot: string;
      readonly enclosingProject: string;
      readonly reason: 'external' | 'output' | 'repository' | 'packages' | 'generated';
      readonly directory: string;
    }[];
    readonly unavailable: readonly { readonly enclosingProject: string; readonly reason: string; readonly definitions: readonly string[] }[];
  } | null;
}

/** A count of one kind over a project record's checks. */
export interface GateAuditCountBucket {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * One project of a nested audit: the provider's verdict and failures for
 * it, whether this request ran it, reused an applicable earlier record or
 * did not run it, and the record that answers it with its counts and
 * duration. A project record's `refused` status is a completed record that
 * does not answer the request.
 */
export interface GateAuditProjectRecord {
  readonly projectRoot: string;
  readonly verdict: 'pass' | 'fail' | 'indeterminate';
  readonly execution: 'ran' | 'reused' | 'not-run';
  readonly status: 'completed' | 'failed' | 'cancelled' | 'refused';
  readonly failures: readonly string[];
  readonly requestId: string;
  readonly auditedSourceCommit: string | null;
  readonly requestedMode: 'full' | 'ramify-partial' | null;
  readonly executedMode: 'full' | 'ramify-partial' | null;
  readonly fallbackReason: string | null;
  readonly reuse: GateAuditRecord['reuse'];
  readonly evidence: GateEvidence | null;
  readonly retrievalCommands: readonly string[];
  readonly durationSeconds: number | null;
  readonly counts: {
    readonly checks: GateAuditCountBucket;
    readonly tests: GateAuditCountBucket | null;
    readonly scenarios: GateAuditCountBucket | null;
  } | null;
  readonly detail: string;
}

/** One checkpoint attempt: a committing gate's audit, or a standalone session's in-place diagnosis. */
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
  /**
   * The commit the audit's verdict answers: the requested candidate, whether
   * its record ran or an applicable one was reused. Null when no audit
   * completed for it, or the checks ran in place.
   */
  readonly audited: AcceptedCommit | null;
  /** The audit publication bound to `audited`; null when no evidence was published. */
  readonly evidence: GateEvidence | null;
  /** Exact external report result. Kept on the in-memory attempt for atomic durable publication. */
  readonly auditOverall?: 'pass' | 'fail' | 'indeterminate' | null;
  /** Exact versioned provider payload and published check results. */
  readonly provider?: { readonly result: unknown; readonly checks: unknown };
  /** A committing gate's configured audit request and answer; absent for an in-place diagnosis. */
  readonly audit?: GateAuditRecord;
  /** `after: null` is a deletion, which is a change like any other. */
  readonly guardedChanges: Array<{ readonly path: string; readonly before: string | null; readonly after: string | null; readonly authorizedBy: RecordReference | null }>;
  /** Rules the harness verified itself. A checkpoint with none records none. */
  readonly rules?: GateRuleRecord[];
  /** An in-place diagnosis's commands; a committing gate plans none, so its list is empty. */
  readonly commands: GateCommandRecord[];
  readonly verdict: 'passed' | 'failed' | 'not-verified';
  readonly cause: GateCause | null;
  /** What the cause was read from, where a report or declared output of its own named the files. */
  readonly attribution?: GateAttribution;
  readonly next: GateNext;
}

/** The version this harness writes and reads. */
export const gateAttemptSchema = 'ramify-agent.gate-attempt/3';

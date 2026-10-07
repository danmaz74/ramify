import { join } from 'node:path';
import { ramifyExecutable } from '../../subs/evidence/src/ramify-cli.js';
import { checkCommand, type CheckCommand } from '../checks/records.js';
import type { Role } from '../interfaces/protocol/runs.js';
import { reviewPolicyVersion, roles, runPolicySchema, type CapturedProjectConfig, type ReviewPolicy, type RunPolicy } from './records.js';

/*
 * The policy one run runs under. It is hardcoded, captured in `job.json`
 * before the first event, and not configurable while the run runs, so that
 * an exhaustion is reproducible from the record.
 *
 * Every command names the environment the harness built for it and holds no
 * value of it. `checkCommand` is the one constructor, and the environment its
 * child receives is the allowlist of `childEnvironment` plus the command's
 * own settings, built again at the moment of the spawn.
 */

/** New runs use capability coordination. Earlier policy versions remain readable. */
export const runPolicyVersion = 'run-policy/6';

/** The bounds of the main plan's policy table. */
export const defaultLimits: RunPolicy['limits'] = {
  repairRoundsPerIteration: 3,
  repairRoundsPerWorkItemGate: 3,
  infrastructureRetriesPerGate: 2,
  forkRetriesPerRequest: 2,
  // Retry 7 reached three coordinator context returns while semantic review
  // still had an actionable Model-owned repair. Keep a finite captured bound.
  budgetReturnsPerIteration: 6,
  sessionReconstructionsPerWork: 2,
  cycleReplansPerWorkItem: 1,
  rejectedSubmissionsPerTurn: 3,
  rejectedToolInputsPerTurn: 3,
  readinessRecoveries: 2,
  stopSettleMs: 30_000,
  writerSettleMs: 30_000,
  invocationIdleMs: 300_000,
  invocationAbsoluteMs: 3_600_000,
  maxIterationsPerWorkItem: 12,
  // A cross-owner capability may need provider, consumer, then root repair;
  // retry4 reached a valid root assignment at i13 before the old bound stopped it.
  maxIterationsPerCapabilityTask: 24,
  maxWorkItems: 64,
  maxPlacementRequests: 32,
  maxInvocationsPerRun: 400,
  runAbsoluteMs: 28_800_000,
  reconciliationRoundsPerWorkItem: 3,
  laterRoundMinimumRisk: 'medium',
  maxPlanDeviations: 5,
  commandTimeoutMs: 600_000,
  maxCommandTimeoutMs: 1_800_000,
  maxInvocationIdleMs: 1_800_000,
  maxInvocationAbsoluteMs: 10_800_000,
  nonfunctionalRoundsPerPlan: 3,
};

/**
 * An engineer's bounds as its iteration applies them: the longest one shell
 * command may run, the idle bound and the absolute bound of each of its
 * invocations.
 */
export interface EngineerBounds {
  readonly commandTimeoutMs: number;
  readonly idleMs: number;
  readonly absoluteMs: number;
}

/** The bounds an engineer runs under when its assignment raises none, and the ceilings an assignment may raise them to. */
export function engineerBoundsOf(limits: RunPolicy['limits']): { readonly defaults: EngineerBounds; readonly ceilings: EngineerBounds } {
  return {
    defaults: {
      commandTimeoutMs: limits.commandTimeoutMs ?? defaultLimits.commandTimeoutMs!,
      idleMs: limits.invocationIdleMs,
      absoluteMs: limits.invocationAbsoluteMs,
    },
    ceilings: {
      commandTimeoutMs: limits.maxCommandTimeoutMs ?? defaultLimits.maxCommandTimeoutMs!,
      idleMs: limits.maxInvocationIdleMs ?? defaultLimits.maxInvocationIdleMs!,
      absoluteMs: limits.maxInvocationAbsoluteMs ?? defaultLimits.maxInvocationAbsoluteMs!,
    },
  };
}

/**
 * The first trial's review policy (Plan 12): the code, scope and design
 * questions of every accepted engineer iteration, two readers beside the
 * writer, twelve waiting requests, one retry, ten minutes an attempt and
 * fifteen a work item's wait from its completion request. These are limits
 * to measure, not claims about throughput.
 */
export const defaultReviewPolicy: ReviewPolicy = {
  version: reviewPolicyVersion,
  kinds: ['code', 'scope', 'design'],
  concurrency: 2,
  queue: 12,
  retries: 1,
  attemptMs: 600_000,
  settleMs: 900_000,
  maxConcerns: 20,
};

/**
 * The context policy of each role. The threshold is the fraction of the
 * window the implementation reports; the absolute figure applies only when
 * no window is reported. Neither has a default: a role that forgot its
 * policy would otherwise be compacted silently.
 */
export const defaultContextPolicies: Record<Role, NonNullable<RunPolicy['context'][Role]>> = {
  'initial-architect': { compaction: 'allowed', budgetTokens: 150_000, budgetFraction: 0.75, reportReserveTokens: 16_000 },
  'local-architect': { compaction: 'allowed', budgetTokens: 150_000, budgetFraction: 0.75, reportReserveTokens: 16_000 },
  'global-fork': { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 16_000 },
  engineer: { compaction: 'forbidden', budgetTokens: 140_000, budgetFraction: 0.7, reportReserveTokens: 12_000 },
  'contract-engineer': { compaction: 'forbidden', budgetTokens: 140_000, budgetFraction: 0.7, reportReserveTokens: 12_000 },
  'capability-architect': { compaction: 'allowed', budgetTokens: 150_000, budgetFraction: 0.75, reportReserveTokens: 16_000 },
  // A reviewer reads a bounded diff and submits; running out of room is an
  // execution failure of its attempt, never a compacted half-review.
  reviewer: { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 8_000 },
  // A failure analyst reads one failed session's evidence and submits a
  // short account; it is never compacted either.
  'failure-analyst': { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 8_000 },
  'context-selector': { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 8_000 },
  // An extraction or check reads one bounded set of documents and submits.
  'catalog-extractor': { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 16_000 },
  'nonfunctional-coordinator': { compaction: 'allowed', budgetTokens: 150_000, budgetFraction: 0.75, reportReserveTokens: 16_000 },
  'nonfunctional-repair-engineer': { compaction: 'forbidden', budgetTokens: 140_000, budgetFraction: 0.7, reportReserveTokens: 12_000 },
};

/**
 * The context policy a run captured for one role. A run captured before the
 * role existed never invokes it, so a missing entry is a defect, not a
 * default to fall back to.
 */
export function contextPolicyOf(policy: RunPolicy, role: Role): NonNullable<RunPolicy['context'][Role]> {
  const context = policy.context[role];
  if (context === undefined) throw new Error(`The run's policy (${policy.version}) has no context policy for the ${role}`);
  return context;
}

/**
 * The transcript policy. A body larger than this is stored once in the
 * content store and named by its hash; a smaller one stays in its entry.
 */
export const defaultTranscriptPolicy: RunPolicy['transcript'] = { inlineBodyBytes: 8 * 1024 };

/** The timeouts of the main plan's command table. */
export const commandTimeouts = {
  typeCheck: 300_000,
  allTests: 900_000,
  scopedTests: 600_000,
  ramifyCheck: 600_000,
  hook: 5_000,
  nestedInstall: 900_000,
} as const;

/** One independent nested package of the target project. */
export interface NestedPackage {
  /** Project-relative, with forward slashes. */
  readonly directory: string;
  readonly manifest: string;
  readonly installed: boolean;
  readonly testScript: string | null;
}

/** The MVP's one test runner, reached through the project's own npm scripts. */
function npmCommand(cwd: string, args: readonly string[], timeoutMs: number): CheckCommand {
  return checkCommand({ argv: ['npm', ...args], cwd, timeoutMs });
}

export interface RunPolicyOptions {
  readonly projectRoot: string;
  /** Historical policy fixtures only. New runs derive preparation from committed audit configuration. */
  readonly nested?: readonly NestedPackage[];
  /** The `ramify` executable, for a test that supplies its own. */
  readonly ramify?: string | undefined;
  /** An endpoint directory for the harness's own Ramify daemon, where it has one. */
  readonly endpointDirectory?: string | undefined;
}

/**
 * The policy a run captures. The commands are the main plan's table, built
 * here and nowhere else, so that a captured `CheckCommand` is complete: it
 * names the variables its child received and carries the settings the harness
 * chose, and the values come from the allowlist when it runs.
 */
export function defaultRunPolicy(options: RunPolicyOptions): RunPolicy {
  const { projectRoot } = options;
  const ramify = options.ramify ?? ramifyExecutable;
  const ramifySettings: Record<string, string> = options.endpointDirectory === undefined ? {} : { RAMIFY_ENDPOINT_DIR: options.endpointDirectory };
  const context = Object.fromEntries(roles.filter(role => role !== 'contract-engineer')
    .map(role => [role, defaultContextPolicies[role]])) as RunPolicy['context'];
  return runPolicySchema.parse({
    version: runPolicyVersion,
    limits: defaultLimits,
    context,
    transcript: defaultTranscriptPolicy,
    reviews: defaultReviewPolicy,
    commands: {
      typeCheck: npmCommand(projectRoot, ['run', 'type-check'], commandTimeouts.typeCheck),
      allTests: npmCommand(projectRoot, ['test'], commandTimeouts.allTests),
      /**
       * The scoped test run's template. The resolved files follow its argv
       * and nothing else of it changes. It is the MVP's one runner, reached
       * as the project installed it, because a selection of files is not
       * something an npm script takes.
       */
      scopedTests: checkCommand({
        argv: [join(projectRoot, 'node_modules', '.bin', 'vitest'), 'run'],
        cwd: projectRoot,
        timeoutMs: commandTimeouts.scopedTests,
      }),
      /**
       * The complete check. The harness reads its verdict and findings, never
       * the snapshot of every evaluated import, so the report leaves it out.
       */
      ramifyCheck: checkCommand({
        argv: [ramify, 'check', '--batch', '--root', projectRoot, '--format', 'json', '--no-snapshot'],
        cwd: projectRoot,
        envAdditions: ramifySettings,
        timeoutMs: commandTimeouts.ramifyCheck,
      }),
      /**
       * The hook check's template. The changed paths follow `--changed` and
       * the working directory becomes the one they are relative to; nothing
       * else of it changes. An exit of 2 is not checked with the CLI's
       * reason, which is never a pass.
       */
      ramifyChanged: checkCommand({
        argv: [ramify, 'check', '--changed', '--format', 'json', '--deadline', String(commandTimeouts.hook)],
        cwd: projectRoot,
        envAdditions: ramifySettings,
        timeoutMs: commandTimeouts.hook,
      }),
      hookTimeoutMs: commandTimeouts.hook,
      nestedPackages: (options.nested ?? []).map(nested => ({
        directory: nested.directory,
        install: npmCommand(join(projectRoot, nested.directory), ['ci'], commandTimeouts.nestedInstall),
        tests: nested.testScript === null ? null : npmCommand(join(projectRoot, nested.directory), ['test'], commandTimeouts.allTests),
      })),
    },
  });
}

/**
 * The policy with the gate command timeouts a project's configuration
 * declares in place of the harness's own: `typeCheck`, `tests` (the
 * project's tests and each nested package's), `scopedTests` and
 * `ramifyCheck`. A missing or invalid configuration changes nothing; its
 * reason is readiness's to report.
 */
export function withProjectTimeouts(policy: RunPolicy, captured: CapturedProjectConfig): RunPolicy {
  const timeouts = 'config' in captured ? captured.config.timeouts : undefined;
  if (timeouts === undefined) return policy;
  const timed = <T extends { readonly timeoutMs: number }>(command: T, timeoutMs: number | undefined): T =>
    (timeoutMs === undefined ? command : { ...command, timeoutMs });
  const { commands } = policy;
  return runPolicySchema.parse({
    ...policy,
    commands: {
      ...commands,
      typeCheck: timed(commands.typeCheck, timeouts.typeCheck),
      allTests: timed(commands.allTests, timeouts.tests),
      scopedTests: timed(commands.scopedTests, timeouts.scopedTests),
      ramifyCheck: timed(commands.ramifyCheck, timeouts.ramifyCheck),
      nestedPackages: commands.nestedPackages.map(nested => ({
        ...nested,
        tests: nested.tests === null ? null : timed(nested.tests, timeouts.tests),
      })),
    },
  });
}

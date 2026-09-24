import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ramifyExecutable } from '../../subs/evidence/src/ramify-cli.js';
import { checkCommand, type CheckCommand } from '../checks/records.js';
import type { Role } from '../interfaces/protocol/runs.js';
import { reviewPolicyVersion, roles, runPolicySchema, type ReviewPolicy, type RunPolicy } from './records.js';

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

/** The version this policy is recorded under. `run-policy/2` runs, without reviews, stay readable. */
export const runPolicyVersion = 'run-policy/3';

/** The bounds of the main plan's policy table. */
export const defaultLimits: RunPolicy['limits'] = {
  repairRoundsPerIteration: 3,
  repairRoundsPerWorkItemGate: 3,
  infrastructureRetriesPerGate: 2,
  forkRetriesPerRequest: 2,
  budgetReturnsPerIteration: 3,
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
  maxWorkItems: 64,
  maxPlacementRequests: 32,
  maxInvocationsPerRun: 400,
  runAbsoluteMs: 28_800_000,
  reconciliationRoundsPerWorkItem: 3,
  laterRoundMinimumRisk: 'medium',
};

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
  // A reviewer reads a bounded diff and submits; running out of room is an
  // execution failure of its attempt, never a compacted half-review.
  reviewer: { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 8_000 },
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

/**
 * How deep the walk looks for an independent nested package. The main plan
 * asks for depth 4 and names `subs/workspace/subs/catalog/tools/` as the
 * readiness fixture, which is one directory deeper than that; the walk
 * reaches the fixture the plan names.
 */
export const nestedPackageDepth = 5;

/**
 * Every independent nested package of the project: a `package.json` beneath
 * the root, to {@link nestedPackageDepth}, skipping `node_modules`, any
 * directory carrying the harness's empty-selection `tsconfig.json` marker,
 * and the root manifest itself. For each it records whether `node_modules`
 * is there and what its `test` script is, or that it has none.
 */
export async function discoverNestedPackages(projectRoot: string): Promise<NestedPackage[]> {
  const found: NestedPackage[] = [];
  await walk(projectRoot, 0);
  found.sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0));
  return found;

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > nestedPackageDepth) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    if (depth > 0 && entries.some(entry => entry.isFile() && entry.name === 'package.json')) {
      if (!(await isStateDirectory(directory))) found.push(await describe(projectRoot, directory));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const child = join(directory, entry.name);
      if (await isStateDirectory(child)) continue;
      await walk(child, depth + 1);
    }
  }
}

async function describe(projectRoot: string, directory: string): Promise<NestedPackage> {
  const manifest = join(directory, 'package.json');
  let testScript: string | null = null;
  try {
    const parsed = JSON.parse(await readFile(manifest, 'utf8')) as { scripts?: Record<string, unknown> };
    const script = parsed.scripts?.['test'];
    testScript = typeof script === 'string' && script !== '' ? script : null;
  } catch {
    testScript = null;
  }
  return {
    directory: relative(projectRoot, directory).split('\\').join('/'),
    manifest: relative(projectRoot, manifest).split('\\').join('/'),
    installed: await isDirectory(join(directory, 'node_modules')),
    testScript,
  };
}

/** Whether this directory is one of the harness's own, which the walk never enters. */
async function isStateDirectory(directory: string): Promise<boolean> {
  try {
    const text = await readFile(join(directory, 'tsconfig.json'), 'utf8');
    return /"files"\s*:\s*\[\s*\]/.test(text);
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** The MVP's one test runner, reached through the project's own npm scripts. */
function npmCommand(cwd: string, args: readonly string[], timeoutMs: number): CheckCommand {
  return checkCommand({ argv: ['npm', ...args], cwd, timeoutMs });
}

export interface RunPolicyOptions {
  readonly projectRoot: string;
  /** The nested packages discovered at the start; readiness verifies them again. */
  readonly nested: readonly NestedPackage[];
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
  const context = Object.fromEntries(roles.map(role => [role, defaultContextPolicies[role]])) as RunPolicy['context'];
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
      ramifyCheck: checkCommand({
        argv: [ramify, 'check', '--batch', '--root', projectRoot, '--format', 'json'],
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
      nestedPackages: options.nested.map(nested => ({
        directory: nested.directory,
        install: npmCommand(join(projectRoot, nested.directory), ['ci'], commandTimeouts.nestedInstall),
        tests: nested.testScript === null ? null : npmCommand(join(projectRoot, nested.directory), ['test'], commandTimeouts.allTests),
      })),
    },
  });
}

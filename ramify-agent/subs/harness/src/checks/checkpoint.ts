import type { CheckCommand, Checkpoint, TestSelection, TestSelectionPolicy } from './records.js';
import type { SelectionFailure } from './selection.js';
import type { PlannedCheck } from './verify.js';

/*
 * What each checkpoint requires. The gate engine runs commands and answers a
 * verdict; which commands a checkpoint runs, and which tests it requires, is
 * this policy. It is mechanical and hardcoded, as the architecture requires:
 * no submission carries it and no agent chooses it.
 *
 * Every checkpoint also runs the configured type check and a complete Ramify
 * check. There is no separate acceptance check in the MVP.
 */

/** What one checkpoint requires beyond the type check and the complete Ramify check. */
export interface CheckpointPolicy {
  /** Which tests it requires. */
  readonly selection: TestSelectionPolicy['policy'];
  /** Whether each independent nested package's own tests run too. */
  readonly nestedTests: boolean;
  /** Whether a verified attempt is committed before its checks run. */
  readonly committing: boolean;
}

export const checkpointPolicies: Record<Checkpoint, CheckpointPolicy> = {
  readiness: { selection: 'all-project', nestedTests: true, committing: false },
  iteration: { selection: 'owned-by-scope', nestedTests: false, committing: true },
  contract: { selection: 'owned-by-scope', nestedTests: false, committing: true },
  'breaking-iteration': { selection: 'all-project', nestedTests: false, committing: true },
  'work-item': { selection: 'all-project', nestedTests: false, committing: true },
  final: { selection: 'all-project', nestedTests: false, committing: true },
};

/** The commands of the project a checkpoint reaches through the policy the run captured. */
export interface ProjectCommands {
  readonly typeCheck: CheckCommand;
  readonly allTests: CheckCommand;
  /** The scoped run's template; the resolved files follow its argv. */
  readonly scopedTests: CheckCommand;
  readonly ramifyCheck: CheckCommand;
  readonly nestedPackages: ReadonlyArray<{ readonly directory: string; readonly tests: CheckCommand | null }>;
}

/**
 * The checks of an `all-project` checkpoint, in the order readiness names its
 * steps: the project's tests, each nested package's tests, the type check and
 * the complete Ramify check.
 *
 * The project's own runner does the selecting, so those commands carry no
 * `TestSelection`. Where the caller supplies the last assignment's own
 * selection as well, it runs after them as the probe that tells a failure
 * inside that scope from one outside it.
 */
export function allProjectChecks(commands: ProjectCommands, policy: CheckpointPolicy, scopeProbe?: ResolvedTests | undefined): PlannedCheck[] {
  const checks: PlannedCheck[] = [{ kind: 'tests', command: commands.allTests, attribution: 'project' }];
  if (policy.nestedTests) {
    for (const nested of commands.nestedPackages) {
      if (nested.tests !== null) checks.push({ kind: 'tests', command: nested.tests, attribution: 'project' });
    }
  }
  checks.push({ kind: 'type-check', command: commands.typeCheck, attribution: 'project' });
  checks.push({ kind: 'ramify-check', command: commands.ramifyCheck, attribution: 'project' });
  if (scopeProbe !== undefined) checks.push(scopedTestCheck(commands, scopeProbe));
  return checks;
}

/** A selection resolved from the current tree, with the reason it cannot be relied on where there is one. */
export interface ResolvedTests {
  readonly selection: TestSelection;
  readonly failure: SelectionFailure | null;
}

/** The project's own runner over exactly the files the selection resolved to. */
export function scopedTestCheck(commands: ProjectCommands, tests: ResolvedTests): PlannedCheck {
  return {
    kind: 'tests',
    command: { ...commands.scopedTests, argv: [...commands.scopedTests.argv, ...tests.selection.resolved] },
    selection: tests.selection,
    requiresTests: true,
    attribution: 'in-scope',
    ...(tests.failure === null ? {} : { discovery: tests.failure }),
  };
}

/**
 * The checks of an `owned-by-scope` checkpoint: the resolved test files
 * through the project's own runner, the type check and the complete Ramify
 * check. The selection is recorded on the attempt, so a reader sees that an
 * included subtree really contributed tests and an empty list is visible.
 */
export function scopedChecks(commands: ProjectCommands, tests: ResolvedTests): PlannedCheck[] {
  return [
    scopedTestCheck(commands, tests),
    { kind: 'type-check', command: commands.typeCheck, attribution: 'project' },
    { kind: 'ramify-check', command: commands.ramifyCheck, attribution: 'project' },
  ];
}

import type { ScenarioMode, ScenarioSelection } from '../../subs/scenarios/src/profiles.js';
import type { ScenarioModule } from '../../subs/scenarios/src/records.js';
import type { ScenarioState } from '../../subs/scenarios/src/states.js';
import { checkCommand } from './records.js';
import type { CheckCommand, Checkpoint, TestSelection, TestSelectionPolicy } from './records.js';
import { scenarioCheckTimeoutMs, scenarioTimeouts, type ScenarioCheckModuleRun, type ScenarioCheckPlan } from './scenario-check.js';
import type { SelectionFailure } from './selection.js';
import type { PlannedCheck } from './verify.js';

/*
 * What each checkpoint requires. The gate engine runs commands and answers a
 * verdict; which commands a checkpoint runs, and which tests it requires, is
 * this policy. It is mechanical and hardcoded, as the architecture requires:
 * no submission carries it and no agent chooses it.
 *
 * Every checkpoint also runs the configured type check and a complete Ramify
 * check, and, where the project configures a scenario harness, the scenario
 * check of the architecture's table.
 */

/** What one checkpoint requires beyond the type check and the complete Ramify check. */
export interface CheckpointPolicy {
  /** Which tests it requires. */
  readonly selection: TestSelectionPolicy['policy'];
  /** Whether each independent nested package's own tests run too. */
  readonly nestedTests: boolean;
  /** Whether a verified attempt is committed before its checks run. */
  readonly committing: boolean;
  /** The scenario check: its mode, what each run selects, and that every run is strict. */
  readonly scenarios: ScenarioCheckPolicy;
}

/**
 * What a checkpoint's scenario check runs. `identity` runs the scope's
 * owners that hold a scenario past `pending`, selecting those scenarios by
 * identity tag; `all-untagged` and `all` run every module with feature
 * files, without the pending scenarios or with everything.
 */
export interface ScenarioCheckPolicy {
  readonly mode: ScenarioMode;
  readonly selection: ScenarioSelection['kind'];
  readonly strict: true;
}

export const checkpointPolicies: Record<Checkpoint, CheckpointPolicy> = {
  readiness: { selection: 'all-project', nestedTests: true, committing: false, scenarios: { mode: 'quick', selection: 'all-untagged', strict: true } },
  iteration: { selection: 'owned-by-scope', nestedTests: false, committing: true, scenarios: { mode: 'quick', selection: 'identity', strict: true } },
  contract: { selection: 'owned-by-scope', nestedTests: false, committing: true, scenarios: { mode: 'quick', selection: 'identity', strict: true } },
  'breaking-iteration': { selection: 'all-project', nestedTests: false, committing: true, scenarios: { mode: 'quick', selection: 'all-untagged', strict: true } },
  'work-item': { selection: 'all-project', nestedTests: false, committing: true, scenarios: { mode: 'quick', selection: 'all-untagged', strict: true } },
  final: { selection: 'all-project', nestedTests: false, committing: true, scenarios: { mode: 'full', selection: 'all', strict: true } },
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
 * `TestSelection`. A planned scenario check follows them. Where the caller
 * supplies the last assignment's own selection as well, it runs last, as the
 * probe that tells a failure inside that scope from one outside it.
 */
export function allProjectChecks(
  commands: ProjectCommands,
  policy: CheckpointPolicy,
  scopeProbe?: ResolvedTests | undefined,
  scenarios?: PlannedCheck | undefined,
): PlannedCheck[] {
  const checks: PlannedCheck[] = [{ kind: 'tests', command: commands.allTests, attribution: 'project' }];
  if (policy.nestedTests) {
    for (const nested of commands.nestedPackages) {
      if (nested.tests !== null) checks.push({ kind: 'tests', command: nested.tests, attribution: 'project' });
    }
  }
  checks.push({ kind: 'type-check', command: commands.typeCheck, attribution: 'project' });
  checks.push({ kind: 'ramify-check', command: commands.ramifyCheck, attribution: 'project' });
  if (scenarios !== undefined) checks.push(scenarios);
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
 * check, and the scenario check where one is planned. The selection is
 * recorded on the attempt, so a reader sees that an included subtree really
 * contributed tests and an empty list is visible.
 */
export function scopedChecks(commands: ProjectCommands, tests: ResolvedTests, scenarios?: PlannedCheck | undefined): PlannedCheck[] {
  return [
    scopedTestCheck(commands, tests),
    { kind: 'type-check', command: commands.typeCheck, attribution: 'project' },
    { kind: 'ramify-check', command: commands.ramifyCheck, attribution: 'project' },
    ...(scenarios === undefined ? [] : [scenarios]),
  ];
}

// The scenario check.

/** One execution mode of the project's scenario harness, as the captured configuration names it. */
export interface ScenarioModeConfig {
  readonly command: readonly string[];
  readonly setup?: readonly string[] | undefined;
  readonly teardown?: readonly string[] | undefined;
}

/** The project's scenario harness, from its captured `ramify-agent.json`. */
export interface ScenarioHarness {
  readonly support: readonly string[];
  readonly modes: Readonly<Record<ScenarioMode, ScenarioModeConfig>>;
}

/** One tracked scenario as planning reads it: its owner, its file and its state. */
export interface PlannedScenario {
  readonly id: string;
  /** The owner's declared-name path. */
  readonly owner: string;
  /** The project-relative feature file that carries it. */
  readonly file: string;
  readonly state: ScenarioState;
}

/** What a checkpoint's scenario check is planned from. */
export interface ScenarioCheckInputs {
  readonly harness: ScenarioHarness;
  /** Every module of the refreshed architect view that has feature files, in the order its runs go. */
  readonly modules: readonly ScenarioModule[];
  /** Every tracked scenario of the run. */
  readonly scenarios: readonly PlannedScenario[];
}

/** The owners an `identity` selection is drawn from: the scope's exact owners and every module of its subtrees. */
export interface ScenarioScope {
  readonly exactOwners: readonly string[];
  readonly subtrees: readonly string[];
}

/** What planning answers: the check to run, or that it had nothing to run. */
export type ScenarioCheckPlanning =
  | { readonly check: PlannedCheck }
  | { readonly none: 'none-selected' };

/** Options of one planning that the checkpoint's policy does not fix. */
export interface ScenarioPlanningOptions {
  readonly projectRoot: string;
  /** For an `identity` selection: the scope whose owners' scenarios run. */
  readonly scope?: ScenarioScope | undefined;
  /** Overrides the policy's mode and selection, as readiness's full-mode step does. */
  readonly mode?: ScenarioMode | undefined;
  readonly selection?: ScenarioSelection['kind'] | undefined;
  readonly dryRun?: boolean | undefined;
  /** How a failure of the check is attributed; the tests' own attribution at this checkpoint. */
  readonly attribution?: 'in-scope' | 'project' | undefined;
  /**
   * For an `identity` selection: scenarios of the scope selected whatever
   * their state, as `run_scope_tests` selects the work item's pending ones.
   * No gate passes it.
   */
  readonly include?: readonly string[] | undefined;
}

/** A state whose scenario an identity selection names: it was declared, so it runs although it may carry the pending tag. */
const selectedByIdentity: readonly ScenarioState[] = ['bound', 'declared', 'implemented'];

/**
 * The scenario check of one checkpoint, per the architecture's table. An
 * `identity` checkpoint selects the scope owners' scenarios that are past
 * `pending`; with none, it plans nothing and answers `none-selected`, which is
 * not a failure. The other selections run every module with feature files,
 * and answer `none-selected` only when no module has any.
 */
export function planScenarioCheck(checkpoint: Checkpoint, inputs: ScenarioCheckInputs, options: ScenarioPlanningOptions): ScenarioCheckPlanning {
  const policy = checkpointPolicies[checkpoint].scenarios;
  const mode = options.mode ?? policy.mode;
  const kind = options.selection ?? policy.selection;
  const modeConfig = inputs.harness.modes[mode];

  let selection: ScenarioSelection;
  let runs: ScenarioCheckModuleRun[];
  if (kind === 'identity') {
    const scope = options.scope ?? { exactOwners: [], subtrees: [] };
    const inScope = (owner: string): boolean =>
      scope.exactOwners.includes(owner) || scope.subtrees.some(subtree => owner === subtree || owner.startsWith(`${subtree}/`));
    const selected = inputs.scenarios
      .filter(scenario => (selectedByIdentity.includes(scenario.state) || (options.include ?? []).includes(scenario.id)) && inScope(scenario.owner))
      .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    if (selected.length === 0) return { none: 'none-selected' };
    const byOwner = new Map<string, PlannedScenario[]>();
    for (const scenario of selected) byOwner.set(scenario.owner, [...(byOwner.get(scenario.owner) ?? []), scenario]);
    const modules = new Map(inputs.modules.map(module => [module.module, module]));
    runs = [...byOwner.entries()].map(([owner, scenarios]) => ({
      module: modules.get(owner) ?? moduleOfFeatureFile(owner, scenarios[0]!.file),
      selection: { kind: 'identity', scenarios: scenarios.map(scenario => scenario.id) },
    }));
    selection = { kind: 'identity', scenarios: selected.map(scenario => scenario.id) };
  } else {
    if (inputs.modules.length === 0) return { none: 'none-selected' };
    selection = { kind };
    runs = inputs.modules.map(module => ({ module, selection }));
  }

  const around = (argv: readonly string[] | undefined, timeoutMs: number) =>
    argv === undefined ? null : checkCommand({ argv: [...argv], cwd: options.projectRoot, timeoutMs });
  // A dry run runs no hook, so it starts nothing a setup would serve.
  const dryRun = options.dryRun ?? false;
  const planBody = {
    mode,
    selection,
    strict: true as const,
    dryRun,
    support: [...inputs.harness.support],
    runs,
    setup: dryRun ? null : around(modeConfig.setup, scenarioTimeouts.setup),
    teardown: dryRun ? null : around(modeConfig.teardown, scenarioTimeouts.teardown),
    runTimeoutMs: scenarioTimeouts[mode],
    tracked: inputs.scenarios.map(scenario => ({ id: scenario.id, file: scenario.file })),
  } satisfies ScenarioCheckPlan;
  return {
    check: {
      kind: 'scenarios',
      command: checkCommand({ argv: [...modeConfig.command], cwd: options.projectRoot, timeoutMs: scenarioCheckTimeoutMs(planBody) }),
      scenarios: planBody,
      attribution: options.attribution ?? (kind === 'identity' ? 'in-scope' : 'project'),
    },
  };
}

/**
 * A module named by a tracked scenario's owner that the view does not list
 * with feature files: its directory is read from the scenario's file, which
 * lies beneath its `src/tests/features/`, or a testing module's `src/features/`.
 */
function moduleOfFeatureFile(owner: string, file: string): ScenarioModule {
  const tests = file.indexOf('src/tests/features/');
  if (tests >= 0) return { module: owner, dir: file.slice(0, tests).replace(/\/$/u, ''), testing: false };
  const testing = file.indexOf('src/features/');
  if (testing >= 0) return { module: owner, dir: file.slice(0, testing).replace(/\/$/u, ''), testing: true };
  throw new Error(`The feature file ${file} of ${owner} is not beneath a module's src/tests/features/ or src/features/`);
}

import { stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { coverageLimitsOf, findModule, readArchitectMeta, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { PackageCitation } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import type { CandidateSnapshot } from '../../subs/reviews/src/snapshot.js';
import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { TestSelectionPolicy } from '../checks/records.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import type { AssignmentBody } from '../work/assignment.js';
import type { committedRecords } from '../work/committed.js';
import { stepDirectoryOf, stepFilesIn } from '../work/integration.js';
import { iterationAssignmentSchema, type IterationAssignment, type WriteScope } from '../work/iterations.js';
import type { WorkItem } from '../work/records.js';
import {
  auditPreparationPaths, captureGuardedFiles, checkpointOf, defaultWriteScopeOf, scopeConfigurationPaths, testPolicyOf,
  type DefaultWriteScope, type GuardedScenarioFiles,
} from '../work/scope.js';
import type { StartingPointGroup } from '../work/starting-inputs.js';
import { engineerBoundsOf, type EngineerBounds } from './policy.js';
import { moduleTestAreas, type TestArea } from './project-config.js';
import type { RecordRef, RunPolicy, RunRecord } from './records.js';
import type { KnownProjectFacts } from './task-brief.js';

/*
 * What a role's inputs are computed from in the project, with the run's
 * records passed in rather than read from a run. The run computes them over
 * its records; inputs authored without a run compute them the same way over
 * empty records, so neither can drift from the other.
 */

/**
 * The identity of the view a decision is recorded against. The revision
 * and the input identity come from the view that was read; the coverage
 * limits come from its own metadata, and where those cannot be read the
 * limit says so rather than reporting none.
 */
export async function viewIdentityOf(projectRoot: string, index: ArchitectIndex | null): Promise<ViewIdentity> {
  if (index === null) return { status: 'placeholder' };
  const meta = await readArchitectMeta(projectRoot).catch(() => null);
  const limits = meta === null || meta.input !== index.input
    ? ['the view\'s own coverage limits could not be read, so absence in it is not proof of absence']
    : coverageLimitsOf(meta);
  return { status: 'materialized', revision: index.revision, input: index.input, coverageLimits: limits };
}

/** The configured checks and the configuration pointers that exist, in the tree or in the snapshot. */
export async function declaredCheckFacts(projectRoot: string, auditConfiguration: RunRecord['auditConfiguration'], projectConfigPath: string,
  snapshot?: CandidateSnapshot): Promise<KnownProjectFacts['declaredChecks']> {
  const checks = auditConfiguration && 'config' in auditConfiguration ? auditConfiguration.config.checks : [];
  const paths = new Set<string>(['ramify-audit.json', projectConfigPath]);
  for (const value of checks) {
    const check = value as { executor?: { kind: string; commands: readonly { cwd?: string; args?: readonly string[]; parser?: string }[] } };
    if (check.executor?.kind !== 'command') continue;
    for (const command of check.executor.commands) {
      const cwd = command.cwd ?? '.';
      paths.add(join(cwd, 'package.json'));
      for (let index = 0; index < (command.args ?? []).length; index++) {
        const arg = command.args![index];
        if (arg === '--config' || arg === '-c') {
          const value = command.args![index + 1];
          if (value) paths.add(join(cwd, value));
        }
      }
      if (command.parser === 'cucumber') for (const file of ['cucumber.js', 'cucumber.cjs', 'cucumber.mjs', 'cucumber.json', 'cucumber.yaml', 'cucumber.yml']) paths.add(join(cwd, file));
    }
  }
  const available: string[] = [];
  for (const path of paths) {
    if (snapshot ? snapshot.entries.get(path)?.kind === 'file' : (await stat(resolve(projectRoot, path)).catch(() => null))?.isFile()) available.push(path);
  }
  return { checks, paths: available };
}

/** The project facts a brief names for some modules: their directories and API views, test areas, scenarios and step files. */
export async function knownProjectFactsOf(projectRoot: string, index: ArchitectIndex | null, names: readonly string[],
  tracked: readonly ScenarioRecord[], declaredChecks: KnownProjectFacts['declaredChecks']): Promise<KnownProjectFacts> {
  const modules = names.flatMap(name => {
    const module = index === null ? undefined : findModule(index, name);
    return module === undefined ? [] : [{ module: module.module, directory: module.dir, apiPaths: [] as string[] }];
  });
  for (const module of modules) for (const area of ['src', 'src/tests']) {
    const path = join(module.directory, area, '.ramify');
    if ((await stat(join(projectRoot, path)).catch(() => null))?.isDirectory()) module.apiPaths.push(path);
  }
  const testAreas = index === null ? [] : (await moduleTestAreas(projectRoot, index)).filter(area => modules.some(module => module.module === area.module));
  const scenarios = tracked.filter(record => names.includes(record.owner));
  const directories = [...new Set(scenarios.map(record => stepDirectoryOf(record.file)))];
  const stepDirectories = scenarios.length === 0 ? [] : await Promise.all(directories.map(async directory => ({ directory, files: await stepFilesIn(projectRoot, directory) })));
  return { declaredChecks, modules, testAreas, scenarioFeatures: [...new Set(scenarios.map(record => record.file))], stepDirectories };
}

/**
 * What an assignment based on each owner gives its engineer, for an
 * architect's briefing, from the provider's topology. Where the provider
 * gives no answer the architect view names the owner and its children, and
 * the briefing says the nested-project roots are unavailable.
 */
export async function defaultWriteScopesOf(ramify: RamifyCli, projectRoot: string, index: ArchitectIndex | null,
  modules: readonly string[], guarded: readonly string[]): Promise<DefaultWriteScope[]> {
  const topology = await ramify.queryOwnership(projectRoot, ['.'])
    .then(answer => answer.selection.scope.ownership, () => null);
  return [...new Set(modules)].flatMap(module => defaultWriteScopeOf(index, module, topology, guarded) ?? []);
}

/** Committed audit preparation inputs, converted to paths in this project. */
export async function auditPreparationPathsOf(ramify: RamifyCli, projectRoot: string, audit: RunRecord['auditConfiguration']): Promise<string[]> {
  const answer = await ramify.queryOwnership(projectRoot, ['.']);
  const configuration = relative(projectRoot, resolve(projectRoot, answer.selection.scope.configuration)).split(sep).join('/');
  if (configuration === '' || configuration === '..' || configuration.startsWith('../')) throw new Error('Provider configuration is outside the captured project');
  return [...new Set([configuration, ...(audit === undefined || !('config' in audit) ? [] : await auditPreparationPaths(audit.config, projectRoot))])];
}

/**
 * One `IterationAssignment`. The architect supplied the goal, the approach
 * and the scope's base; the harness captures the real paths, the bootstrap
 * authority the registry gives, the gate, its test-selection policy and the
 * guarded hashes, and none of those is in any submission.
 */
export async function iterationAssignmentOf(projectRoot: string, input: {
  readonly id: string;
  readonly item: WorkItem;
  readonly basis: RecordRef;
  readonly coordination: NonNullable<IterationAssignment['coordination']>;
  readonly body: AssignmentBody;
  readonly scope: WriteScope;
  readonly source?: PackageCitation | undefined;
  readonly evidenceObligations: IterationAssignment['evidenceObligations'];
  readonly authorizations: IterationAssignment['authorizations'];
  readonly guardedPaths: readonly string[];
  readonly externalCapabilities?: IterationAssignment['externalCapabilities'] | undefined;
  readonly revisesContract?: RecordRef | undefined;
}, guarding: { readonly scenarioFiles: GuardedScenarioFiles; readonly preparationPaths: readonly string[] }): Promise<IterationAssignment> {
  const { id, item, basis, coordination, body, scope, source, evidenceObligations, authorizations,
    guardedPaths, externalCapabilities, revisesContract } = input;
  return iterationAssignmentSchema.parse({
    schema: 'ramify-agent.iteration-assignment/1', id, workItem: item.id, outline: basis, coordination,
    stage: body.stage, kind: body.kind, goal: body.goal, approach: body.approach, scope,
    ...(body.startingPoints === undefined ? {} : { startingPoints: body.startingPoints }),
    ...(source === undefined ? {} : { source }),
    externalCapabilities: externalCapabilities ?? body.externalCapabilities,
    completionEvidence: body.completionEvidence, evidenceObligations,
    gate: { checkpoint: checkpointOf(body.kind), tests: testPolicyOf(body.kind, scope.base, evidenceObligations, scope.extra, scope.resolved.included) },
    guarded: await captureGuardedFiles(projectRoot, guardedPaths, guarding.scenarioFiles, [...guarding.preparationPaths, ...scopeConfigurationPaths(scope)]),
    authorizations,
    ...(revisesContract === undefined ? {} : { revisesContract }),
    ...(body.obligations === undefined || body.obligations.length === 0 ? {} : { obligations: [...body.obligations] }),
    ...(body.bounds === undefined || Object.keys(body.bounds).length === 0 ? {} : { bounds: body.bounds }),
  });
}

/** An assignment's starting points, with the invocation that issued it and the boundary it was issued at, where those exist. */
export function assignmentStartingPointsOf(assignment: IterationAssignment, issued: { readonly invocation?: string | undefined; readonly boundary?: string | undefined }): StartingPointGroup {
  const { invocation, boundary } = issued;
  return { origin: { producer: 'architect assignment', workItem: assignment.workItem, iteration: assignment.id,
    ...(invocation === undefined ? {} : { invocation }), ...(boundary === undefined ? {} : { boundary }),
    ...(assignment.coordination?.kind === 'capability-task' ? { capabilityTask: assignment.coordination.id } : {}) }, points: assignment.startingPoints };
}

/**
 * The test areas of the modules whose tests an assignment owns, for its
 * briefing: each exact owner's, and every module's beneath a subtree. It
 * selects nothing for a gate, whose audit selects its own checks.
 */
export async function ownedTestAreasOf(projectRoot: string, index: ArchitectIndex | null, tests: TestSelectionPolicy): Promise<TestArea[]> {
  const areas = await moduleTestAreas(projectRoot, index);
  return areas.filter(area => tests.exactOwners.includes(area.module)
    || tests.subtrees.some(subtree => area.module === subtree || area.module.startsWith(`${subtree}/`)));
}

/** The bounds one iteration's engineers run under: the policy's, and what its assignment raised. */
export function engineerBoundsFor(limits: RunPolicy['limits'], assignment: IterationAssignment): EngineerBounds {
  const { defaults } = engineerBoundsOf(limits);
  return {
    commandTimeoutMs: assignment.bounds?.commandTimeoutMs?.ms ?? defaults.commandTimeoutMs,
    idleMs: assignment.bounds?.idleMs?.ms ?? defaults.idleMs,
    absoluteMs: assignment.bounds?.absoluteMs?.ms ?? defaults.absoluteMs,
  };
}

/** The guarded files of an assignment that no authorization opened. */
export function unauthorizedGuardedOf(assignment: IterationAssignment): string[] {
  return assignment.guarded.filter(file => !assignment.authorizations.some(entry => entry.path === file.path)).map(file => file.path);
}

/** The obligation a provider work item exists to satisfy, as its architect is told it. */
export function obligationBriefingOf(item: WorkItem, records: ReturnType<typeof committedRecords>) {
  if (!('obligation' in item.origin)) return undefined;
  const obligation = records.obligations.get(item.origin.obligation.id);
  if (obligation === undefined) return undefined;
  return {
    id: obligation.id,
    capability: obligation.capability,
    behavior: obligation.behavior,
    suite: obligation.evidence.conformance,
  };
}

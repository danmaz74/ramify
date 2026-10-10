import { readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { readCommittedAuditConfiguration, type ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import { gitService, type GitService } from '../../subs/evidence/src/git.js';
import { projectConfigurationFile } from '../../subs/evidence/src/project-configuration.js';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import { findModule, loadArchitectIndex, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { capabilityRunPolicyVersion } from '../capability/policy.js';
import { resolveRealTarget } from '../guard/resolve-contained-path.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { contextPolicyOf, defaultRunPolicy, engineerBoundsOf, withProjectTimeouts } from '../run/policy.js';
import { captureProjectConfig, moduleTestAreas } from '../run/project-config.js';
import {
  assignmentStartingPointsOf, auditPreparationPathsOf, declaredCheckFacts, defaultWriteScopesOf, engineerBoundsFor, iterationAssignmentOf,
  knownProjectFactsOf, obligationBriefingOf, ownedTestAreasOf, unauthorizedGuardedOf, viewIdentityOf,
} from '../run/project-facts.js';
import { committedAuditConfigurationSchema, type CommittedAuditConfigurationRecord } from '../run/records.js';
import { validateAgainst } from '../run/submissions.js';
import { committedRecords, refOf } from '../work/committed.js';
import { assignedSourceDirectory } from '../work/engineer-directory.js';
import { iterationApiViews, apiViewsOf, onboardingOf, prepareAssignedCucumber, type WorkItemBriefing } from '../work/session.js';
import { iterationId, type IterationAssignment } from '../work/iterations.js';
import { obligationBriefingLines, obligationsOf, obligationsOwnedBy } from '../work/obligations.js';
import { integrationScenarioOf, workItemOutlineSchema, workItemSchema, type WorkItem, type WorkItemOutline } from '../work/records.js';
import { entryScenariosOf } from '../work/scenario-briefing.js';
import { captureGuardedFiles, type GuardedScenarioFiles } from '../work/scope.js';
import { declaredCheckInputs } from '../work/starting-inputs.js';
import { localArchitectSubmissionSchema } from '../work/submission.js';
import { knownFactsInputs } from './constructed.js';
import { engineerStepInputsOf } from './engineer.js';
import { projectPath, stepInputsSchemaId, validateWorkTurnInputs, type EngineerStepInputs, type WorkTurnStepInputs } from './inputs.js';
import { constructWorkTurnStep, judgeWorkTurn, workBriefingInputs } from './local-architect.js';

/*
 * Engineer inputs authored without a run: the work item, its outline and
 * the assignment an author supplies, judged as the local architect's output
 * against the project as it stands. The context a run would read at its
 * start is read from the project instead: the materialized architect view,
 * the provider's answers through the Ramify port, the committed audit
 * configuration and the default run policy. Nothing is materialized and no
 * lock is taken. The work turn is built as a run builds the first turn of a
 * work item with no prior iteration, finding or selection, over records that
 * hold nothing yet; the assignment is accepted and the engineer inputs are
 * collected as the run does on acceptance. What a run would derive from its
 * own records is derived the same way from those empty records; what only a
 * run can supply is refused with the reason.
 */

/** The ports an authored assignment is judged through, the installed ones where absent. */
export interface AuthoringPorts {
  readonly ramify: RamifyCli;
  readonly git: Pick<GitService, 'currentHead'>;
  readonly configuredAudit: Pick<ConfiguredAuditPort, 'read'>;
  /** Reads the existing materialized architect view; never materializes it. */
  readonly index?: ((projectRoot: string) => Promise<ArchitectIndex>) | undefined;
  readonly commandExecution?: CommandRunner | undefined;
  readonly skillDirectory?: string | undefined;
}

/** The files an engineer's inputs are authored from. */
export interface AuthoredEngineerFiles {
  readonly workItem: string;
  readonly outline?: string | undefined;
  readonly assignment: string;
}

export type AuthoredEngineerResult =
  | { readonly status: 'refused'; readonly reason: string }
  | {
      readonly status: 'authored';
      readonly inputs: EngineerStepInputs;
      /** The work turn the assignment was judged as the output of. */
      readonly workTurn: WorkTurnStepInputs;
    };

/** The producing invocation an outline revision names when it was authored without a run. */
export const authoredOutlineInvocation = 'authored';

const refused = (reason: string): AuthoredEngineerResult => ({ status: 'refused', reason });
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const zodIssues = (list: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[]): string =>
  list.map(issue => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
const issues = (errors: readonly { readonly path: string; readonly message: string }[]): string =>
  errors.map(error => `${error.path || '(root)'}: ${error.message}`).join('; ');

/** A Ramify port that reads the existing materialized views wherever a run would materialize them. */
export function existingViews(ramify: RamifyCli): RamifyCli {
  const reader = Object.create(ramify) as RamifyCli;
  reader.materialize = async () => ({ ok: true, output: 'The existing materialized views are read; nothing is materialized without a run.' });
  return reader;
}

/** The project-relative form of a location beneath the project root. */
function projectRelative(projectRoot: string, absolute: string): string {
  const path = relative(projectRoot, absolute).split(sep).join('/');
  if (join(projectRoot, path) !== absolute) throw new Error(`${absolute} is not beneath the project root ${projectRoot}`);
  return path;
}

/** Engineer inputs from an authored work item, outline and assignment, with no run. Nothing is written. */
export async function authorEngineerInputs(options: {
  readonly projectRoot: string;
  readonly files: AuthoredEngineerFiles;
  /** The iteration the assignment opens; the work item's first when absent. A run counts its recorded assignments instead. */
  readonly iteration?: number | undefined;
  readonly ports: AuthoringPorts;
}): Promise<AuthoredEngineerResult> {
  const projectRoot = resolve(options.projectRoot);
  const { ports } = options;
  const read = async (option: string, path: string): Promise<unknown> => {
    try { return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown; }
    catch (error) { throw new Error(`${option} ${path} cannot be read as JSON: ${message(error)}`); }
  };
  let rawItem: unknown; let rawOutline: unknown; let rawAssignment: unknown;
  try {
    rawItem = await read('--work-item', options.files.workItem);
    rawOutline = options.files.outline === undefined ? undefined : await read('--outline', options.files.outline);
    rawAssignment = await read('--assignment', options.files.assignment);
  } catch (error) {
    return refused(message(error));
  }

  // The work item and its recorded outline, as the author states them.
  const parsedItem = workItemSchema.safeParse(rawItem);
  if (!parsedItem.success) return refused(`--work-item: not a work item: ${zodIssues(parsedItem.error.issues)}`);
  const item = parsedItem.data;
  const elements = [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs];
  if (elements.length > 0) {
    return refused(`--work-item: it cites the plan elements ${elements.join(', ')}; their catalog is a run's accepted analysis, and without a run there is none to cite them from`);
  }
  const outlines: WorkItemOutline[] = [];
  if (rawOutline !== undefined) {
    const parsed = workItemOutlineSchema.safeParse(rawOutline);
    if (!parsed.success) return refused(`--outline: not a work-item outline: ${zodIssues(parsed.error.issues)}`);
    if (parsed.data.workItem !== item.id) return refused(`--outline: the outline is of ${parsed.data.workItem}, not of ${item.id}`);
    if (parsed.data.revision !== 1) return refused(`--outline: outline revision ${parsed.data.revision} does not follow the last, 0; the first recorded revision is 1`);
    outlines.push(parsed.data);
  }
  const shape = validateAgainst(localArchitectSubmissionSchema, rawAssignment);
  if (!shape.ok) return refused(`--assignment: the local architect's submission schema refuses it: ${issues(shape.errors)}`);
  if (shape.value.kind !== 'assign') return refused(`--assignment: it is a ${shape.value.kind} submission, not an assign envelope`);
  if (shape.value.assignment.citedElements.length > 0) {
    return refused(`--assignment: it cites the elements ${shape.value.assignment.citedElements.join(', ')}; a work item's package is selected from a run's frozen catalog, and without a run there is none whose elements its engineer could be given`);
  }
  if (shape.value.localDecisions.length > 0) {
    return refused('--assignment: it carries local decisions, which a run commits as decision records before its assignment; without a run there is nothing to commit them to');
  }

  // What a run reads at its start, read from the project.
  let index: ArchitectIndex;
  try { index = await (ports.index ?? loadArchitectIndex)(projectRoot); }
  catch (error) {
    return refused(`the materialized architect view at ${join(projectRoot, '.ramify-architect')} cannot be read, and inputs authored without a run never materialize it: ${message(error)}`);
  }
  const head = await ports.git.currentHead(projectRoot).catch(() => '');
  if (head === '') return refused('no committed HEAD is available, so no committed audit configuration can be read');
  // Kept as the run record keeps it.
  let auditConfiguration: { readonly config: CommittedAuditConfigurationRecord };
  try { auditConfiguration = { config: committedAuditConfigurationSchema.parse(await ports.configuredAudit.read(projectRoot, head)) }; }
  catch (error) { return refused(`the committed audit configuration at ${head} cannot be read: ${message(error)}`); }
  const projectConfig = await captureProjectConfig(projectRoot);
  const policy = withProjectTimeouts(defaultRunPolicy({ projectRoot }), projectConfig);
  if (policy.version !== capabilityRunPolicyVersion) return refused(`the run policy ${policy.version} is not ${capabilityRunPolicyVersion}`);
  const { packages } = await loadPromptPackages({ capabilityWorkflow: true, ...(ports.skillDirectory === undefined ? {} : { skillDirectory: ports.skillDirectory }) });
  const views = existingViews(ports.ramify);
  // The records a run holds when a work item's first turn starts, before
  // anything of it is committed: the work item alone.
  const records = committedRecords([]);
  const projection = obligationsOf({ scenarios: [], workItems: [item], events: [] });
  const scenarioFiles: GuardedScenarioFiles = { expected: [] };

  let workTurn: WorkTurnStepInputs;
  let preparationPaths: string[];
  try {
    preparationPaths = await auditPreparationPathsOf(ports.ramify, projectRoot, auditConfiguration);
    workTurn = await firstWorkTurn({ projectRoot, item, outlines, index, ramify: ports.ramify, views, auditConfiguration,
      projectConfigPath: projectConfig.path, policy, records, projection, scenarioFiles, preparationPaths });
    constructWorkTurnStep(workTurn, { projectRoot, packages });
  } catch (error) {
    return refused(`the local architect's work turn cannot be built from the project: ${message(error)}`);
  }

  // The assignment is judged as that turn's submission, as the run judges it.
  const judged = await judgeWorkTurn({ inputs: workTurn }, rawAssignment, { index, ramify: ports.ramify, projectRoot });
  if (!judged.verdict.ok) return refused(`--assignment: the local architect's rules refuse it: ${issues(judged.verdict.errors)}`);
  if (judged.prepared === undefined) return refused('--assignment: it carries no assignment whose scope the provider can capture');
  const submission = judged.verdict.value;
  if (submission.kind !== 'assign') return refused('--assignment: it is not an assign envelope');
  const body = judged.prepared.body;
  if (body.revisesContract !== undefined) return refused(`--assignment: it revises "${body.revisesContract}", which no run has registered`);

  // Accepted as the run accepts it: the outline revision the envelope
  // carries, the authorized guarded paths, then the assignment record.
  const number = options.iteration ?? 1;
  if (number > policy.limits.maxIterationsPerWorkItem) return refused(`${item.id} has reached ${policy.limits.maxIterationsPerWorkItem} iterations, which the policy allows`);
  const scope = judged.prepared.scope;
  if (submission.outline !== undefined) {
    outlines.push(workItemOutlineSchema.parse({
      schema: 'ramify-agent.work-item-outline/1', workItem: item.id, revision: outlines.length + 1,
      invocation: authoredOutlineInvocation, ...submission.outline, hypothesesSeen: [],
    } satisfies WorkItemOutline));
  }
  const outline = outlines.at(-1);
  if (outline === undefined) return refused(`--assignment: the assignment of ${item.id} has no outline to work from; give one in the envelope or with --outline`);
  for (const authorization of body.authorizations ?? []) {
    const target = await resolveRealTarget(projectRoot, authorization.path);
    if (target.ok && !scope.resolved.files.includes(target.resolved)) scope.resolved.files.push(target.resolved);
  }
  const outlineRef = refOf(item.id, outline.revision, outline);
  let assignment: IterationAssignment;
  try {
    assignment = await iterationAssignmentOf(projectRoot, {
      id: iterationId(item.id, number), item, basis: outlineRef, coordination: { kind: 'work-item', id: item.id }, body, scope,
      evidenceObligations: [], guardedPaths: [],
      authorizations: (body.authorizations ?? []).map(entry => ({ path: entry.path, rationale: entry.rationale, by: outlineRef })),
    }, { scenarioFiles, preparationPaths });
  } catch (error) {
    return refused(`--assignment: the assignment record cannot be captured: ${message(error)}`);
  }

  // The engineer inputs, collected as the run collects them for the first
  // invocation of an accepted assignment.
  try {
    const source = await assignedSourceDirectory(projectRoot, assignment.scope, index);
    const integration = integrationScenarioOf(item);
    const scenarios = integration !== null ? undefined
      : entryScenariosOf([], new Map(), 'entry' in item.origin ? item.origin.entry : null);
    const focused = await prepareAssignedCucumber({ projectRoot, scratchDirectory: join(source.path, 'tmp', 'ramify-focused', assignment.id),
      featurePaths: [], checks: auditConfiguration.config.checks, runner: ports.commandExecution ?? runCommand });
    const modules = 'module' in assignment.scope.base ? [assignment.scope.base.module] : assignment.scope.base.modules;
    const inputs = engineerStepInputsOf({
      run: null, item, assignment, attempt: 1, base: head, beforeTree: undefined,
      capabilityWorkflow: true, capabilityPolicy: policy.version === capabilityRunPolicyVersion,
      workingDirectory: projectPath(projectRelative(projectRoot, source.path)),
      views: await iterationApiViews(views, projectRoot, index, assignment.scope.base),
      testAreas: await ownedTestAreasOf(projectRoot, index, assignment.gate.tests),
      scenarios: scenarios === undefined || scenarios.length === 0 ? undefined : { kind: 'entry', scenarios },
      obligations: (assignment.obligations ?? []).map(id => ({ id, text: null })),
      assignmentPackage: undefined, featurePaths: [], focused, failedGate: undefined, handoff: undefined, guidance: undefined,
      startingPoints: assignmentStartingPointsOf(assignment, { boundary: head }),
      known: await knownProjectFactsOf(projectRoot, index, modules, [],
        await declaredCheckFacts(projectRoot, auditConfiguration, projectConfig.path)),
      protectedFiles: { harness: [], unauthorized: unauthorizedGuardedOf(assignment) },
      bounds: engineerBoundsFor(policy.limits, assignment),
      limits: policy.limits,
      context: contextPolicyOf(policy, 'engineer'),
      start: { kind: 'fresh' },
      provenance: { origin: 'authored', authored: ['work-item', ...(options.files.outline === undefined ? [] : ['outline' as const]), 'assignment'], workItem: item, outlines },
    });
    return { status: 'authored', inputs, workTurn };
  } catch (error) {
    return refused(`the engineer inputs cannot be collected for ${assignment.id}: ${message(error)}`);
  }
}

/**
 * The local architect's first work turn of one work item, as a run builds it
 * with no prior iteration, finding or selection, over the given records.
 */
async function firstWorkTurn(facts: {
  readonly projectRoot: string;
  readonly item: WorkItem;
  readonly outlines: readonly WorkItemOutline[];
  readonly index: ArchitectIndex;
  readonly ramify: RamifyCli;
  readonly views: RamifyCli;
  readonly auditConfiguration: { readonly config: CommittedAuditConfigurationRecord };
  readonly projectConfigPath: string;
  readonly policy: ReturnType<typeof defaultRunPolicy>;
  readonly records: ReturnType<typeof committedRecords>;
  readonly projection: ReturnType<typeof obligationsOf>;
  readonly scenarioFiles: GuardedScenarioFiles;
  readonly preparationPaths: readonly string[];
}): Promise<WorkTurnStepInputs> {
  const { projectRoot, item, index, policy, records } = facts;
  const moduleEntry = findModule(index, item.module);
  const onboarding = moduleEntry !== undefined
    ? await onboardingOf(projectRoot, moduleEntry.dir)
    : { path: '(module directory unavailable)', purpose: null, missing: 'the assigned module is absent from the architect view and no proposal gives its directory' };
  const moduleSource = moduleEntry === undefined ? null : join(projectRoot, moduleEntry.dir, 'src');
  const workingDirectory = moduleSource !== null && (await stat(moduleSource).catch(() => null))?.isDirectory() ? moduleSource : projectRoot;
  const harnessOnly = new Set([projectConfigurationFile]);
  const guardedFiles = (await captureGuardedFiles(projectRoot, [], facts.scenarioFiles, facts.preparationPaths)).filter(file => !harnessOnly.has(file.path));
  const declaredChecks = await declaredCheckFacts(projectRoot, facts.auditConfiguration, facts.projectConfigPath);
  const briefing: WorkItemBriefing = {
    item,
    setup: declaredCheckInputs({ projectRoot, ...declaredChecks, snapshot: false }),
    testAreas: (await moduleTestAreas(projectRoot, index)).filter(area => area.module === item.module),
    onboarding,
    views: await apiViewsOf(facts.views, projectRoot, index, item.module),
    defaultWriteScope: await defaultWriteScopesOf(facts.ramify, projectRoot, index, [item.module], guardedFiles.filter(file => file.hash !== null).map(file => file.path)),
    hypotheses: [],
    registry: [],
    decisions: [],
    outlines: [...facts.outlines],
    delegation: { open: [], released: [], obligation: obligationBriefingOf(item, records) },
    bounds: engineerBoundsOf(policy.limits),
    projectRoot,
    workingDirectory,
    ...(moduleEntry === undefined ? {} : { moduleDirectory: moduleEntry.dir }),
  };
  return validateWorkTurnInputs({
    schema: stepInputsSchemaId, role: 'local-architect', phase: 'work-turn', run: null,
    work: { workItem: item.id }, attempt: 1, capabilityWorkflow: true, limits: policy.limits,
    context: contextPolicyOf(policy, 'local-architect'), workingDirectory: projectPath(projectRelative(projectRoot, workingDirectory)),
    briefing: workBriefingInputs(briefing),
    packageInPrompt: false,
    obligationLines: obligationBriefingLines(obligationsOwnedBy(facts.projection, { kind: 'work-item', id: item.id })),
    // A turn without a selected package is given the plan package of its
    // elements; a work item authored without a run cites none.
    requirements: [],
    known: knownFactsInputs(await knownProjectFactsOf(projectRoot, index, [item.module], [], declaredChecks)),
    startingPoints: [],
    validation: {
      hypotheses: [], decisions: [], workItems: [item.id], openRequirements: [], contracts: [],
      guardedPaths: guardedFiles.map(file => file.path), harnessOnly: [...harnessOnly],
      obligations: { entries: JSON.parse(JSON.stringify([...facts.projection.obligations.entries()])) as unknown, tests: facts.projection.tests },
      scope: { view: await viewIdentityOf(projectRoot, index), revision: 1 },
    },
    start: { kind: 'fresh' },
  });
}

/** The ports a command authors with: the installed provider, Git and audit configuration reader. */
export function installedAuthoringPorts(): AuthoringPorts {
  return { ramify: new RamifyCli(), git: gitService, configuredAudit: { read: readCommittedAuditConfiguration } };
}

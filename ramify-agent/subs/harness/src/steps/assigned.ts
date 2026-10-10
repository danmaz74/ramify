import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { loadArchitectIndex, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { runCommand } from '../../subs/evidence/src/run-command.js';
import { capabilityRunPolicyVersion } from '../capability/policy.js';
import { acceptedCommit } from '../checks/accepted.js';
import { obligationProjection } from '../run/after-handling.js';
import { trackedScenarios } from '../run/feature-files.js';
import { contextPolicyOf } from '../run/policy.js';
import {
  assignmentStartingPointsOf, declaredCheckFacts, engineerBoundsFor, knownProjectFactsOf, ownedTestAreasOf, unauthorizedGuardedOf,
} from '../run/project-facts.js';
import { captureProjectConfig } from '../run/project-config.js';
import { committedAuditConfigurationSchema, runLayout, type CommittedAuditConfigurationRecord } from '../run/records.js';
import { committedRecords } from '../work/committed.js';
import { assignedSourceDirectory } from '../work/engineer-directory.js';
import { integrationBriefing } from '../work/integration.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { integrationScenarioOf, type WorkItem } from '../work/records.js';
import { entryScenariosOf, type EngineerScenarios } from '../work/scenario-briefing.js';
import { iterationApiViews, prepareAssignedCucumber } from '../work/session.js';
import { localArchitectSubmissionSchema } from '../work/submission.js';
import { existingViews, type AuthoringPorts } from './authoring.js';
import { engineerStepInputsOf } from './engineer.js';
import { parseStepInputs, projectPath, validateWorkTurnInputs, type EngineerStepInputs, type WorkTurnStepInputs } from './inputs.js';
import { readManualRun, type ManualRun } from './manual.js';
import { acceptedSubmission, submissionValue } from './manual-hosts.js';

/*
 * Engineer inputs from an assignment a manual run recorded: the local
 * architect's accepted `assign` and the assignment record `step after`
 * committed for it, collected as the run collects them for the first
 * invocation of an accepted assignment. The facts a run reads from its own
 * records are read from the manual run's; the context it holds from its
 * start, the architect view and the committed audit configuration, is read
 * from the project as it stands. Nothing is written and no lock is taken.
 * Only a fresh first invocation is derived: an iteration whose engineer has
 * started already continues from that engineer's records instead.
 */

export type AssignedEngineerResult =
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'derived'; readonly inputs: EngineerStepInputs };

const refused = (reason: string): AssignedEngineerResult => ({ status: 'refused', reason });
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** The engineer inputs of the assignment one local architect invocation of a manual run made. Nothing is written. */
export async function engineerInputsFromAssignment(options: {
  readonly runDirectory: string;
  /** The local architect invocation whose accepted `assign` made the assignment. */
  readonly invocation: string;
  readonly ports: AuthoringPorts;
}): Promise<AssignedEngineerResult> {
  const { invocation, ports } = options;
  const opened = await readManualRun(options.runDirectory);
  if (opened.status === 'refused') return refused(opened.reason);
  const { run, projectRoot } = opened;

  // The accepted submission, checked against the hash its end recorded.
  const accepted = await acceptedSubmission(run, invocation);
  if (!accepted.ok) return refused(accepted.reason);
  if (accepted.role !== 'local-architect') return refused(`invocation ${invocation} is a ${accepted.role}'s, not a local architect's`);
  const parsed = localArchitectSubmissionSchema.safeParse(submissionValue(accepted.raw));
  if (!parsed.success) return refused(`the accepted submission of ${invocation} is not a local architect submission this harness reads`);
  const submission = parsed.data;
  if (submission.kind !== 'assign') return refused(`the accepted submission of ${invocation} is a ${submission.kind}, not an assign`);

  // The work turn it answered.
  let turn: WorkTurnStepInputs;
  try { turn = validateWorkTurnInputs(parseStepInputs(await readFile(run.path(runLayout.stepInputs(invocation)), 'utf8'))); }
  catch (error) { return refused(`the step inputs of ${invocation} are not a readable local architect work turn: ${message(error)}`); }

  // The assignment `step after` recorded for it, which must be this submission's.
  const assigned = run.log.all('iteration-assigned').find(event => event.data.invocation === invocation);
  if (assigned === undefined) {
    return refused(`the manual run records no assignment by ${invocation}; \`step after --invocation ${invocation}\` records it`);
  }
  const records = committedRecords(run.log.ledger.replay());
  const assignment = records.assignments.get(assigned.data.iteration);
  if (assignment === undefined) return refused(`the manual run records ${assigned.data.iteration} as assigned by ${invocation}, but holds no committed assignment record of it`);
  const item = records.workItems.find(entry => entry.id === assignment.workItem);
  if (item === undefined) return refused(`the manual run holds no work item ${assignment.workItem}, which ${assignment.id} is of`);
  const mismatch = [
    ...(assignment.workItem === turn.work.workItem ? [] : [`it is of ${assignment.workItem}, and the turn of ${turn.work.workItem}`]),
    ...(assignment.workItem === assigned.data.workItem ? [] : [`it is of ${assignment.workItem}, and its assignment event of ${assigned.data.workItem}`]),
    ...(assignment.kind === submission.assignment.kind ? [] : [`its kind is ${assignment.kind}, and the submission's ${submission.assignment.kind}`]),
    ...(assignment.goal === submission.assignment.goal ? [] : ['its goal is not the submission\'s']),
    ...(assignment.approach === submission.assignment.approach ? [] : ['its approach is not the submission\'s']),
  ];
  if (mismatch.length > 0) return refused(`the assignment record of ${assignment.id} does not match the accepted submission of ${invocation}: ${mismatch.join('; ')}`);
  if (assignment.source !== undefined) return refused(`${assignment.id} cites an assignment package, which a manual run holds no catalog to deliver`);

  // Only the first, fresh invocation of the iteration.
  const started = run.log.all('invocation-started').filter(event => event.data.role === 'engineer' && event.data.work.iteration === assignment.id);
  if (started.length > 0) {
    return refused(`the engineer of ${assignment.id} has started already (${started.map(event => event.data.invocation).join(', ')}); its next inputs continue from that engineer's records, which this form does not derive`);
  }
  if (run.log.all('iteration-closed').some(event => event.data.iteration === assignment.id)) return refused(`${assignment.id} is closed`);

  try {
    return { status: 'derived', inputs: await collect(run, projectRoot, { item, assignment, invocation, capabilityWorkflow: turn.capabilityWorkflow }, ports) };
  } catch (error) {
    return refused(`the engineer inputs cannot be collected for ${assignment.id}: ${message(error)}`);
  }
}

/** The engineer inputs, collected as the run collects them for the first invocation of an accepted assignment. */
async function collect(run: ManualRun, projectRoot: string, subject: {
  readonly item: WorkItem; readonly assignment: IterationAssignment; readonly invocation: string; readonly capabilityWorkflow: boolean;
}, ports: AuthoringPorts): Promise<EngineerStepInputs> {
  const { item, assignment, invocation } = subject;
  const policy = run.record.policy;
  const lines = run.log.ledger.replay();
  const records = committedRecords(lines);
  const tracked = trackedScenarios(lines);
  const base = acceptedCommit(lines, run.base);
  let index: ArchitectIndex;
  try { index = await (ports.index ?? loadArchitectIndex)(projectRoot); }
  catch (error) { throw new Error(`the materialized architect view at ${join(projectRoot, '.ramify-architect')} cannot be read, and these inputs never materialize it: ${message(error)}`); }
  const head = await ports.git.currentHead(projectRoot).catch(() => '');
  if (head === '') throw new Error('no committed HEAD is available, so no committed audit configuration can be read');
  const auditConfiguration: { readonly config: CommittedAuditConfigurationRecord } = {
    config: committedAuditConfigurationSchema.parse(await ports.configuredAudit.read(projectRoot, head)),
  };
  const projectConfig = await captureProjectConfig(projectRoot);

  // The work item's scenarios, as the run briefs a work item's iteration.
  let scenarios: EngineerScenarios | undefined;
  const integration = integrationScenarioOf(item);
  if (integration !== null) {
    const record = tracked.records.find(candidate => candidate.id === integration);
    scenarios = record === undefined ? undefined
      : { kind: 'integration', integration: await integrationBriefing(projectRoot, record, tracked.records), state: tracked.states.get(integration) ?? 'pending' };
  } else {
    const entry = entryScenariosOf(tracked.records, tracked.states, 'entry' in item.origin ? item.origin.entry : null);
    scenarios = entry.length === 0 ? undefined : { kind: 'entry', scenarios: entry };
  }
  const assignedIds = assignment.obligations ?? [];
  const { obligations } = obligationProjection(run.log);
  const names = new Map(tracked.records.map(record => [record.id, record.name]));
  const assignedObligations = assignedIds.map(id => {
    const obligation = obligations.get(id);
    if (obligation === undefined) return { id, text: null };
    if (obligation.kind === 'scenario') {
      const name = names.get(id);
      return { id, text: name === undefined ? 'scenario' : `scenario "${name}"` };
    }
    if (obligation.kind === 'outcome') return { id, text: obligation.case === null ? 'delegated outcome' : `registered case ${obligation.case}` };
    return { id, text: obligation.description === null ? 'registered test' : `registered test: ${obligation.description}` };
  });
  const featurePaths = scenarios?.kind === 'entry'
    ? scenarios.scenarios.filter(scenario => assignedIds.includes(scenario.id)).map(scenario => scenario.file)
    : scenarios?.kind === 'integration' && assignedIds.includes(scenarios.integration.scenario.id) ? [scenarios.integration.scenario.file] : [];

  const source = await assignedSourceDirectory(projectRoot, assignment.scope, index);
  const workingDirectory = relative(projectRoot, source.path).split(sep).join('/');
  if (join(projectRoot, workingDirectory) !== source.path) throw new Error(`${source.path} is not beneath the project root ${projectRoot}`);
  const focused = await prepareAssignedCucumber({ projectRoot, scratchDirectory: join(source.path, 'tmp', 'ramify-focused', assignment.id),
    featurePaths, checks: auditConfiguration.config.checks, runner: ports.commandExecution ?? runCommand });
  const modules = 'module' in assignment.scope.base ? [assignment.scope.base.module] : assignment.scope.base.modules;
  const turnRecord = records.invocations.get(invocation);
  return engineerStepInputsOf({
    run: { planId: run.planId, runId: run.jobId }, item, assignment, attempt: 1, base, beforeTree: undefined,
    capabilityWorkflow: subject.capabilityWorkflow, capabilityPolicy: policy.version === capabilityRunPolicyVersion,
    workingDirectory: projectPath(workingDirectory),
    views: await iterationApiViews(existingViews(ports.ramify), projectRoot, index, assignment.scope.base),
    testAreas: await ownedTestAreasOf(projectRoot, index, assignment.gate.tests),
    scenarios, obligations: assignedObligations,
    assignmentPackage: undefined, featurePaths, focused, failedGate: undefined, handoff: undefined, guidance: undefined,
    startingPoints: assignmentStartingPointsOf(assignment, { invocation, boundary: turnRecord?.candidateBefore ?? turnRecord?.base }),
    known: await knownProjectFactsOf(projectRoot, index, modules, tracked.records,
      await declaredCheckFacts(projectRoot, auditConfiguration, projectConfig.path)),
    // A manual run captures no plan documents; the harness writes only the tracked feature files.
    protectedFiles: { harness: tracked.records.map(record => record.file), unauthorized: unauthorizedGuardedOf(assignment) },
    bounds: engineerBoundsFor(policy.limits, assignment),
    limits: policy.limits,
    context: contextPolicyOf(policy, 'engineer'),
    start: { kind: 'fresh' },
    provenance: {
      origin: 'assignment', run: { planId: run.planId, runId: run.jobId }, invocation,
      assignment: { run: iterationLayout.assignment(item.id, Number(assignment.id.slice(assignment.id.lastIndexOf('.i') + 2))) },
    },
  });
}

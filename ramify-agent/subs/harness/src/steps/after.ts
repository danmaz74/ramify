import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createConfiguredAudit, type ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import { gitCandidateSource, gitService, type CandidateSource, type GitService } from '../../subs/evidence/src/git.js';
import type { ProvisionalSourceGit } from '../../subs/evidence/src/provisional-git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import { capabilityRunPolicyVersion } from '../capability/policy.js';
import { capabilityRequestId } from '../capability/records.js';
import { captureProvisionalSource } from '../capability/source.js';
import { acceptedCommit } from '../checks/accepted.js';
import type { GateAttempt } from '../checks/records.js';
import { placementPaths } from '../guard/write-guard.js';
import { canonicalJson } from '../jobs/commands.js';
import { assignedCount, authorizedScope, completionBlockers, evidenceFor, requiredArtifacts, type AfterHandling } from '../run/after-handling.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import type { CommittingGates } from '../run/committing-gate.js';
import { expectedFeatureHashes } from '../run/feature-files.js';
import { architectRunInputs } from '../run/inputs.js';
import { auditPreparationPathsOf, engineerBoundsFor, iterationAssignmentOf } from '../run/project-facts.js';
import { committedAuditConfigurationSchema, invocationOutcomeSchema, runLayout, type ArchitectRef, type RecordRef } from '../run/records.js';
import type { ProcessGroups } from '../run/writer.js';
import { committedRecords, refOf } from '../work/committed.js';
import { engineerSubmissionSchema, type EngineerSubmission } from '../work/engineer.js';
import { iterationId, iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { integrationScenarioOf, originKindOf, workLayout, type WorkItem } from '../work/records.js';
import { localArchitectSubmissionSchema, type LocalArchitectSubmission } from '../work/submission.js';
import { parseStepInputs, serializeStepInputs, validateWorkTurnInputs, type WorkTurnStepInputs } from './inputs.js';
import { judgeWorkTurn } from './local-architect.js';
import { openLockedManualRun, type ManualRun } from './manual.js';
import {
  acceptedSubmission, HandlingStopped, lastTransition, manualGates, manualHandling, manualWrite, sameBody, submissionValue,
  type ManualHostContext,
} from './manual-hosts.js';
import { committedBody } from './runner.js';
import { attemptOf } from './gate.js';

/*
 * `step after`: what the harness applies after one invocation's accepted
 * submission, as far as it is a function of records, over a manual run.
 * The handling is the run's own (the after-handling and the committing
 * gates it shares with an implementation run); what follows in a run as
 * another session, a gate or a workflow is reported as not run, with the
 * step that would run it.
 *
 * The submission is read from its file and must have the hash its end
 * recorded. Every write is one of the run's ledger transactions, so a
 * failure leaves the transitions committed before it, and a repeat of the
 * same invocation's handling commits nothing it already committed. An
 * iteration closes as accepted only on a passing committed gate of that
 * very proposal over the candidate as it stands.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What one `step after` is given. */
export interface StepAfterOptions {
  readonly run: string;
  readonly invocation: string;
  readonly ramify: RamifyCli;
  readonly git?: GitService | undefined;
  readonly candidates?: CandidateSource | undefined;
  readonly configuredAudit?: ConfiguredAuditPort | undefined;
  /** External index and blob reads of a provisional capture. */
  readonly provisionalSourceGit?: ProvisionalSourceGit | undefined;
  readonly refresh?: ((projectRoot: string) => Promise<ArchitectIndex | null>) | undefined;
  readonly groups?: ProcessGroups | undefined;
  readonly now?: (() => Date) | undefined;
  readonly onLine?: ((line: string) => void) | undefined;
}

/** How a `step after` ended: 0 handled, 1 an error after which the committed transitions stand, 2 refused before any effect. */
export interface StepAfterResult {
  readonly exitStatus: 0 | 1 | 2;
  /** What was applied, each as one line. */
  readonly applied: readonly string[];
  /** What a run does next that this command did not run, each with the reason. */
  readonly notRun: readonly string[];
  readonly lines: readonly string[];
}

/** A refusal before any effect. */
class Refused extends Error {}

interface Handling {
  readonly run: ManualRun;
  readonly context: ManualHostContext;
  readonly gates: CommittingGates<ManualRun>;
  readonly handling: AfterHandling<ManualRun>;
  readonly invocation: string;
  readonly applied: (text: string) => void;
  readonly notRun: (text: string) => void;
}

/** Runs one `step after`. */
export async function runStepAfter(options: StepAfterOptions): Promise<StepAfterResult> {
  const lines: string[] = [];
  const applied: string[] = [];
  const notRun: string[] = [];
  const line = (text: string) => {
    lines.push(text);
    try { options.onLine?.(text); } catch { /* A reader that fails does not end the command. */ }
  };
  const result = (exitStatus: 0 | 1 | 2): StepAfterResult => ({ exitStatus, applied, notRun, lines });
  const git = options.git ?? gitService;
  const opened = await openLockedManualRun({ directory: options.run, git, now: options.now, groups: options.groups });
  if (opened.status === 'refused') {
    line(`Refused: ${opened.reason}`);
    return result(2);
  }
  const { run, projectRoot } = opened.opened;
  try {
    const context: ManualHostContext = {
      projectRoot,
      git,
      candidates: options.candidates ?? gitCandidateSource,
      ramify: options.ramify,
      configuredAudit: options.configuredAudit ?? createConfiguredAudit({ workspaceOwnership: createAuditWorkspaceOwnership(projectRoot) }),
      refresh: options.refresh ?? architectRunInputs({ ramify: options.ramify }).refresh,
      warn: text => line(`Warning: ${text}`),
    };
    const gates = manualGates(context);
    const handling: Handling = {
      run, context, gates, handling: manualHandling(context, gates), invocation: options.invocation,
      applied: text => { applied.push(text); line(`Applied: ${text}`); },
      notRun: text => { notRun.push(text); line(`Not run: ${text}`); },
    };
    try {
      const accepted = await acceptedSubmission(run, options.invocation);
      if (!accepted.ok) throw new Refused(accepted.reason);
      const value = submissionValue(accepted.raw);
      line(`After ${options.invocation}: ${accepted.role}${typeof value.kind === 'string' ? ` ${value.kind}` : ''}, submission ${accepted.hash}.`);
      if (accepted.role === 'local-architect') {
        const parsed = localArchitectSubmissionSchema.safeParse(value);
        if (!parsed.success) throw new Refused(`the accepted submission of ${options.invocation} is not a local architect submission this harness reads`);
        await afterArchitect(handling, parsed.data);
      } else if (accepted.role === 'engineer') {
        const parsed = engineerSubmissionSchema.safeParse(value);
        if (!parsed.success) throw new Refused(`the accepted submission of ${options.invocation} is not an engineer submission this harness reads`);
        await afterEngineer(handling, parsed.data, options);
      } else {
        handling.notRun(`the handling after a ${accepted.role} invocation, which \`step after\` does not apply; nothing was recorded`);
      }
      return result(0);
    } catch (error) {
      if (error instanceof Refused) {
        line(`Refused: ${error.message}`);
        return result(2);
      }
      if (error instanceof HandlingStopped && error.reason === 'not-run') {
        handling.notRun(error.message);
        line(`Last completed transition: ${lastTransition(run.log)}`);
        return result(0);
      }
      // Every error is reported with its cause; what was committed before it stands.
      line(`Error: ${message(error)}`);
      if (error instanceof HandlingStopped && error.records.length > 0) line(`Records: ${error.records.join(', ')}`);
      line(`Last completed transition: ${lastTransition(run.log)}`);
      return result(1);
    }
  } finally {
    await opened.opened.release();
  }
}

// Local architect submissions.

async function afterArchitect(handling: Handling, submission: LocalArchitectSubmission): Promise<void> {
  const { run, invocation } = handling;
  if (submission.kind !== 'assign' && submission.kind !== 'request-completion') {
    handling.notRun(`the handling of a local architect's ${submission.kind}, which \`step after\` does not apply; nothing was recorded`);
    return;
  }
  const inputs = await workTurnInputs(run, invocation);
  // Everything a manual run cannot apply is refused before any effect.
  if (submission.kind === 'assign') {
    if (submission.localDecisions.length > 0) {
      throw new Refused('the assignment carries local decisions, which a run commits as decision records with their registry entries; a manual run does not apply them');
    }
    if (submission.assignment.citedElements.length > 0) {
      throw new Refused(`the assignment cites ${submission.assignment.citedElements.join(', ')}; a manual run holds no element catalog to cite its package from`);
    }
    if (submission.assignment.revisesContract !== undefined) throw new Refused('a contract revision is not applied by a manual run');
  }
  const item = await recordTurnRecords(handling, inputs);
  if (submission.kind === 'assign') await afterAssign(handling, item, inputs, submission);
  else await afterCompletionRequest(handling, item, submission);
}

/** The work turn inputs the invocation was built from, which its submission is judged against again. */
async function workTurnInputs(run: ManualRun, invocation: string): Promise<WorkTurnStepInputs> {
  let text: string;
  try { text = await readFile(run.path(runLayout.stepInputs(invocation)), 'utf8'); }
  catch (error) { throw new Refused(`the step inputs of ${invocation} cannot be read: ${message(error)}`); }
  try { return validateWorkTurnInputs(parseStepInputs(text)); }
  catch (error) { throw new Refused(`the step inputs of ${invocation} are not a local architect's work turn: ${message(error)}`); }
}

/**
 * The work item and the outline revisions the turn was given, as the run
 * records them when they are committed: a record the manual run holds
 * unchanged is not written again, and one that differs is refused.
 */
async function recordTurnRecords(handling: Handling, inputs: WorkTurnStepInputs): Promise<WorkItem> {
  const { run } = handling;
  const item = inputs.briefing.item;
  const writes = [
    {
      event: { type: 'work-item-started' as const, data: { workItem: item.id, module: item.module, origin: originKindOf(item),
        ...(integrationScenarioOf(item) === null ? {} : { scenario: integrationScenarioOf(item)! }) } },
      record: { path: workLayout.item(item.id), id: item.id, revision: 1, body: item },
    },
    ...inputs.briefing.outlines.map(outline => ({
      event: { type: 'outline-revised' as const, data: { workItem: item.id, revision: outline.revision, invocation: outline.invocation } },
      record: { path: workLayout.outline(item.id, outline.revision), id: item.id, revision: outline.revision, body: outline },
    })),
  ];
  const pending = [];
  for (const write of writes) {
    const held = committedBody(run, write.record.path);
    if (held === undefined) pending.push(write);
    else if (!sameBody(held, write.record.body)) throw new Refused(`the manual run already holds a different ${write.record.path} than the turn of ${handling.invocation} was given`);
  }
  for (const write of pending) {
    await manualWrite(run, write.event, [write.record]);
    handling.applied(`${write.event.type} ${write.record.path}, as the turn of ${handling.invocation} was given it`);
  }
  return item;
}

/** The obligation registrations and reports of the turn, each recorded once, as the run records them. */
async function recordReports(handling: Handling, item: WorkItem, submission: Extract<LocalArchitectSubmission, { kind: 'assign' | 'request-completion' }>): Promise<void> {
  const { run, invocation } = handling;
  const given = submission.registrations.length + submission.reports.length;
  if (given === 0) return;
  const before = run.log.events.length;
  if (!await handling.handling.recordObligations(run, { kind: 'work-item', id: item.id }, invocation, submission)) throw new Error('The reports could not be recorded');
  const written = run.log.events.length - before;
  handling.applied(written > 0
    ? `${written} obligation transition${written === 1 ? '' : 's'} from the ${given} registrations and reports of ${invocation}`
    : `nothing for the ${given} registrations and reports of ${invocation}: each is recorded already or names no obligation this manual run holds`);
}

/** The architect view as it stands now, or the run's last one when it cannot be refreshed. */
async function refreshedIndex(handling: Handling): Promise<ArchitectIndex | null> {
  try {
    const index = await handling.context.refresh(handling.context.projectRoot);
    if (index !== null) handling.run.index = index;
  } catch (error) {
    handling.context.warn(`the architect view could not be refreshed: ${message(error)}`);
  }
  return handling.run.index;
}

/** The architect's pinned point the invocation's end retained, or null. */
function architectRefOf(run: ManualRun, invocation: string): ArchitectRef | null {
  const ended = run.log.all('invocation-ended').find(event => event.data.invocation === invocation);
  if (ended === undefined || !ended.data.kept) return null;
  const outcome = invocationOutcomeSchema.safeParse(committedBody(run, runLayout.outcome(invocation)));
  const ref = outcome.success ? outcome.data.session?.ref : undefined;
  return ref === undefined || ref === '' ? null : { session: ended.data.session, ref };
}

/** The hypothesis revisions last delivered to the work item. */
function hypothesesSeen(run: ManualRun, workItem: string): readonly RecordRef[] {
  return run.log.all('hypotheses-delivered').filter(event => event.data.workItem === workItem).at(-1)?.data.refs ?? [];
}

async function afterAssign(handling: Handling, item: WorkItem, inputs: WorkTurnStepInputs,
  submission: Extract<LocalArchitectSubmission, { kind: 'assign' }>): Promise<void> {
  const { run, context, invocation } = handling;
  const { projectRoot } = context;
  const existing = run.log.all('iteration-assigned').find(event => event.data.invocation === invocation);

  // The obligations the architect reported are recorded first, as the run records them.
  await recordReports(handling, item, submission);

  if (existing !== undefined) {
    handling.applied(`nothing more: ${existing.data.iteration} was already assigned by ${invocation}`);
  } else {
    const number = assignedCount(run.log, item.id) + 1;
    if (number > run.record.policy.limits.maxIterationsPerWorkItem) {
      throw new Error(`${item.id} has reached ${run.record.policy.limits.maxIterationsPerWorkItem} iterations, which the policy allows`);
    }
    // The submission is judged again against the turn's inputs and the project as it stands, which captures its scope.
    const index = await refreshedIndex(handling);
    const judged = await judgeWorkTurn({ inputs }, submission, { index, ramify: context.ramify, projectRoot });
    if (!judged.verdict.ok) throw new Error(`The assignment no longer passes the local architect's rules: ${judged.verdict.errors.map(error => `${error.path}: ${error.message}`).join('; ')}`);
    if (judged.prepared === undefined) throw new Error('The assignment carries no scope the provider can capture');
    const { body } = judged.prepared;

    if (submission.outline !== undefined) {
      const revised = await handling.handling.reviseOutline(run, { item, invocation, outline: submission.outline, hypothesesSeen: hypothesesSeen(run, item.id) });
      if (revised?.written === true) handling.applied(`outline revision ${revised.outline.revision} of ${item.id}`);
    }
    const outlines = committedRecords(run.log.ledger.replay()).outlines.get(item.id) ?? [];
    const outline = outlines.at(-1);
    if (outline === undefined) throw new Error(`The assignment of ${item.id} has no outline to work from`);
    const scope = await authorizedScope(projectRoot, judged.prepared.scope, body.authorizations ?? []);
    const committed = committedRecords(run.log.ledger.replay());
    const artifacts = requiredArtifacts(committed);
    const outlineRef = refOf(item.id, outline.revision, outline);
    const head = await context.git.currentHead(projectRoot);
    const auditConfiguration = { config: committedAuditConfigurationSchema.parse(await context.configuredAudit.read(projectRoot, head)) };
    const id = iterationId(item.id, number);
    const assignment = await iterationAssignmentOf(projectRoot, {
      id, item, basis: outlineRef, coordination: { kind: 'work-item', id: item.id }, body, scope,
      evidenceObligations: evidenceFor(run.log, item, body.kind, committed),
      authorizations: (body.authorizations ?? []).map(entry => ({ path: entry.path, rationale: entry.rationale, by: outlineRef })),
      guardedPaths: artifacts.map(artifact => artifact.path),
    }, {
      scenarioFiles: { expected: run.log.find('scenarios-materialized') === undefined ? [] : expectedFeatureHashes(handling.gates.writtenFeatures(run)) },
      preparationPaths: await auditPreparationPathsOf(context.ramify, projectRoot, auditConfiguration),
    });
    await handling.handling.recordAssignment(run, { item, number, invocation, assignment, decisions: [], localRecords: [], architectRef: architectRefOf(run, invocation) });
    handling.applied(`assignment ${assignment.id}: ${run.path(iterationLayout.assignment(item.id, number))}`);
  }
  const assigned = run.log.all('iteration-assigned').find(event => event.data.invocation === invocation)!;
  handling.notRun(`scheduling the engineer of ${assigned.data.iteration}; a run starts it from the assignment record`);
}

async function afterCompletionRequest(handling: Handling, item: WorkItem,
  submission: Extract<LocalArchitectSubmission, { kind: 'request-completion' }>): Promise<void> {
  const { run, invocation } = handling;
  await recordReports(handling, item, submission);
  const blockers = completionBlockers(run.log, item, run.record.policy.version === capabilityRunPolicyVersion);
  if (blockers.blocked.length > 0) {
    handling.notRun(`${item.id}'s completion, which is refused while: ${blockers.blocked.join('; ')}; a run continues the architect's session with these blockers`);
    return;
  }
  const revised = await handling.handling.reviseOutline(run, {
    item, invocation, outline: submission.outline, hypothesesSeen: hypothesesSeen(run, item.id), architectRef: architectRefOf(run, invocation),
  });
  if (revised === null) throw new Error('The completion outline could not be recorded');
  handling.applied(revised.written
    ? `the completion outline, revision ${revised.outline.revision} of ${item.id}`
    : `nothing more: the completion outline revision ${revised.outline.revision} of ${item.id} was already recorded for ${invocation}`);
  handling.notRun(`settling ${item.id}'s reviews, reconciliation, its work-item gate and its completion; \`step gate --checkpoint work-item --invocation ${invocation}\` runs the gate once its reviews are settled`);
}

// Engineer submissions.

async function afterEngineer(handling: Handling, submission: EngineerSubmission, options: StepAfterOptions): Promise<void> {
  const { run, invocation } = handling;
  const started = run.log.all('invocation-started').find(event => event.data.invocation === invocation)!;
  const iteration = started.data.work.iteration;
  if (iteration === undefined) throw new Refused(`engineer ${invocation} names no iteration`);
  const records = committedRecords(run.log.ledger.replay());
  const assignment = records.assignments.get(iteration);
  if (assignment === undefined) throw new Refused(`the manual run holds no assignment record of ${iteration}, which ${invocation} worked on`);
  const item = records.workItems.find(entry => entry.id === assignment.workItem);
  if (item === undefined) throw new Refused(`the manual run holds no work item ${assignment.workItem}`);
  const number = Number(assignment.id.slice(assignment.id.lastIndexOf('.i') + 2));
  switch (submission.kind) {
    case 'completion-proposed': return afterProposal(handling, item, assignment, number, submission);
    case 'partial':
    case 'unsuitable': return afterReport(handling, item, assignment, number, submission);
    case 'capability-needed': return afterCapabilityNeed(handling, item, assignment, options);
    case 'contract-needed':
      handling.notRun('the contract iteration a contract-needed submission starts, and the close of its iteration, which `step after` does not apply; nothing was recorded');
      return;
  }
}

/** The engineer invocations of one iteration in the manual run, in order, through the given one. */
function iterationInvocations(run: ManualRun, iteration: string, through: string): string[] {
  const ids: string[] = [];
  for (const event of run.log.all('invocation-started')) {
    if (event.data.role !== 'engineer' || event.data.work.iteration !== iteration) continue;
    ids.push(event.data.invocation);
    if (event.data.invocation === through) break;
  }
  return ids;
}

async function afterProposal(handling: Handling, item: WorkItem, assignment: IterationAssignment, number: number,
  proposal: Extract<EngineerSubmission, { kind: 'completion-proposed' }>): Promise<void> {
  const { run, context, invocation } = handling;
  // The proposal's bindings apply at its acceptance, before any gate, and no gate outcome undoes them.
  if (!await handling.handling.recordBindings(run, invocation, proposal.bindings)) throw new Error('The bindings could not be recorded');
  if (proposal.bindings.length > 0) handling.applied(`the ${proposal.bindings.length} bindings of ${invocation}`);

  const closedEvent = run.log.all('iteration-closed').find(event => event.data.iteration === assignment.id);
  const gate = await qualifyingGate(handling, assignment, closedEvent === undefined ? undefined : closedEvent.data.gate);
  if (gate === null) return;

  if (closedEvent !== undefined) {
    handling.applied(`nothing more for the close: ${assignment.id} was already closed ${closedEvent.data.outcome} on gate ${closedEvent.data.gate ?? 'none'}`);
  } else {
    // The ownership of the audited candidate's changes, queried now; a query that fails is the error it is.
    const changes = await context.git.diffNameStatus(context.projectRoot, handling.gates.acceptedBefore(run, gate.id), gate.audited!);
    const paths = await placementPaths(context.projectRoot, changes.map(change => change.path));
    if (paths.length > 0) {
      try { await context.ramify.queryOwnership(context.projectRoot, paths); }
      catch (error) { throw new Error(`The ownership of ${gate.audited}'s changes cannot be queried: ${message(error)}`); }
      handling.applied(`the ownership of ${paths.length} changed path${paths.length === 1 ? '' : 's'} of ${gate.audited}, as the provider answers it now`);
    }
    const closed = await handling.handling.closeIteration(run, item, number, assignment, {
      outcome: 'accepted', invocations: iterationInvocations(run, assignment.id, invocation), findings: [...proposal.findings],
      gate: gate.id, commit: gate.audited,
      ...(proposal.recommendation === undefined ? {} : { recommendation: proposal.recommendation }),
    });
    handling.applied(`the close of ${assignment.id}: accepted on gate ${gate.id}, commit ${closed.commit}`);
  }
  const requested = await handling.handling.requestReviews(run, { workItem: item.id, iteration: assignment.id, gate: gate.id, commit: gate.audited! });
  const all = run.log.all('review-request-recorded').filter(event => event.data.iteration === assignment.id && event.data.candidate === gate.audited);
  if (requested.length > 0) handling.applied(`the review requests ${requested.join(', ')}`);
  else if (all.length > 0) handling.applied(`nothing more for the reviews: ${all.map(event => event.data.request).join(', ')} were already requested`);
  if (all.length > 0) {
    handling.notRun(`the review sessions of ${all.map(event => `${event.data.request} (${event.data.kind})`).join(', ')}; each runs as \`step inputs --role reviewer --from-run <run> --request <id>\`, then \`step run\``);
  }
  handling.notRun('the evidence the acceptance discharges (provider conformance and verified requirements), and the next work turn of the local architect');
}

/**
 * The passing committed iteration gate of this very proposal over the
 * candidate as it stands, or null with the next action reported: missing,
 * failed, stale and diagnosis-only evidence never closes an iteration.
 */
async function qualifyingGate(handling: Handling, assignment: IterationAssignment, closedOn: string | null | undefined): Promise<GateAttempt | null> {
  const { run, context, invocation } = handling;
  const attempts = run.log.all('gate-attempted')
    .map(event => attemptOf(run, event.data.gate))
    .filter((attempt): attempt is GateAttempt => attempt !== null && attempt.subject.iteration === assignment.id);
  const own = attempts.filter(attempt => attempt.proposedBy === invocation);
  const latest = own.at(-1);
  const next = `\`step gate --run ${run.directory} --checkpoint iteration --invocation ${invocation}\``;
  if (closedOn !== undefined) {
    const closing = attempts.find(attempt => attempt.id === closedOn);
    if (closing !== undefined && closing.proposedBy === invocation) return closing;
    handling.notRun(`the close of ${assignment.id} and its review requests: it was already closed${closing === undefined ? '' : ` on gate ${closing.id} of ${closing.proposedBy ?? 'no proposal'}`}, not on a gate of ${invocation}`);
    return null;
  }
  if (latest === undefined) {
    const diagnoses = await diagnosisCount(run, invocation);
    handling.notRun(`the close of ${assignment.id} and its review requests: no committed gate audited the proposal of ${invocation}${diagnoses > 0
      ? `; its ${diagnoses} in-place diagnosis${diagnoses === 1 ? ' is' : 'es are'} not audit evidence` : ''}. Next: ${next}`);
    return null;
  }
  if (latest.verdict !== 'passed' || latest.audited === null || latest.evidence === null) {
    handling.notRun(`the close of ${assignment.id} and its review requests: the latest gate ${latest.id} of this proposal ${latest.verdict === 'passed' ? 'published no audit evidence' : `did not pass (${latest.verdict}${latest.cause === null ? '' : `, ${latest.cause}`}; next: ${latest.next})`}. A run would repair it; a repair is an engineer step`);
    return null;
  }
  const later = attempts.filter(attempt => attempt.proposedBy !== invocation && attempts.indexOf(attempt) > attempts.indexOf(latest));
  if (later.length > 0) {
    handling.notRun(`the close of ${assignment.id}: gate ${latest.id} is stale, since ${later.map(attempt => attempt.id).join(', ')} gated ${assignment.id} afterwards`);
    return null;
  }
  // The candidate the gate audited must still be the one the tree holds.
  const audited = await context.candidates.commitTree(context.projectRoot, latest.audited);
  const current = (await context.git.previewCandidateTree(context.projectRoot)).tree;
  if (audited !== current) {
    handling.notRun(`the close of ${assignment.id}: gate ${latest.id} is stale, since the candidate changed after it audited tree ${audited} (now ${current}). Next: ${next}`);
    return null;
  }
  return latest;
}

/** How many in-place diagnoses name this invocation as their proposal. */
async function diagnosisCount(run: ManualRun, invocation: string): Promise<number> {
  const names = await readdir(run.path('diagnoses')).catch(() => [] as string[]);
  let count = 0;
  for (const name of names) {
    const body = await readFile(run.path(join('diagnoses', name, 'attempt.json')), 'utf8').then(text => JSON.parse(text) as { proposedBy?: unknown }, () => null);
    if (body?.proposedBy === invocation) count += 1;
  }
  return count;
}

async function afterReport(handling: Handling, item: WorkItem, assignment: IterationAssignment, number: number,
  report: Extract<EngineerSubmission, { kind: 'partial' | 'unsuitable' }>): Promise<void> {
  const { run, invocation } = handling;
  const closedEvent = run.log.all('iteration-closed').find(event => event.data.iteration === assignment.id);
  let result;
  if (closedEvent !== undefined) {
    const held = committedRecords(run.log.ledger.replay()).results.get(assignment.id);
    if (held === undefined || !held.invocations.includes(invocation)) {
      throw new Refused(`${assignment.id} was already closed ${closedEvent.data.outcome}, not by ${invocation}`);
    }
    result = held;
    handling.applied(`nothing more for the close: ${assignment.id} was already closed ${closedEvent.data.outcome}`);
  } else {
    const findings = report.kind === 'partial'
      ? [...report.findings, ...report.unfinished.map(entry => `unfinished: ${entry}`)]
      : [`unsuitable (${report.reason}): ${report.detail}`];
    result = await handling.handling.closeIteration(run, item, number, assignment, {
      outcome: report.kind, invocations: iterationInvocations(run, assignment.id, invocation), findings, gate: null, commit: null,
    });
    handling.applied(`the result of ${assignment.id}: ${result.outcome}, ${run.path(iterationLayout.result(item.id, number))}`);
  }
  if (report.kind === 'unsuitable' && report.reason === 'provider-cannot-conform') {
    handling.notRun('the revision report a provider that cannot conform sends to its consumer\'s architect');
  }
  await nextTurnInputs(handling, item, assignment, result);
  handling.notRun(`the local architect's next turn, which a run continues with ${assignment.id}'s result`);
}

/**
 * The local architect's next work turn, as the run continues the session
 * that assigned the iteration: its recorded inputs with the closed
 * iteration's result, the outlines as recorded now and the next attempt.
 * Written beside the engineer's records; nothing starts it.
 */
async function nextTurnInputs(handling: Handling, item: WorkItem, assignment: IterationAssignment,
  result: { readonly iteration: string; readonly outcome: string; readonly findings: readonly string[]; readonly commit: string | null; readonly recommendation?: string | undefined }): Promise<void> {
  const { run, invocation } = handling;
  const assigned = run.log.all('iteration-assigned').find(event => event.data.iteration === assignment.id);
  const architect = assigned?.data.invocation;
  const recorded = architect === undefined ? null : await readFile(run.path(runLayout.stepInputs(architect)), 'utf8').catch(() => null);
  if (architect === undefined || recorded === null) {
    handling.notRun(`the local architect's next-turn inputs: ${assignment.id} was assigned ${architect === undefined ? 'with no recorded invocation' : `by ${architect}`}, whose work turn inputs this manual run does not hold`);
    return;
  }
  const previous = validateWorkTurnInputs(parseStepInputs(recorded));
  const ref = architectRefOf(run, architect);
  const outlines = committedRecords(run.log.ledger.replay()).outlines.get(item.id) ?? [];
  const { start: _start, ...fields } = previous;
  const next = validateWorkTurnInputs({
    ...fields,
    run: { planId: run.planId, runId: run.jobId },
    attempt: previous.attempt + 1,
    briefing: {
      ...previous.briefing,
      outlines: [...outlines],
      lastIteration: {
        id: result.iteration, outcome: result.outcome, findings: [...result.findings], commit: result.commit,
        ...(result.recommendation === undefined ? {} : { recommendation: result.recommendation }),
        bounds: engineerBoundsFor(run.record.policy.limits, assignment),
      },
    },
    validation: { ...previous.validation, scope: { ...previous.validation.scope, revision: previous.validation.scope.revision + 1 } },
    start: ref === null
      ? { kind: 'fresh', continuing: 'iteration-closed', degraded: { requested: 'continued', reason: `the session of ${architect} was not kept with a point to continue` } }
      : { kind: 'continued', point: ref.ref, session: ref.session, continuing: 'iteration-closed' },
  });
  const path = run.path(join('invocations', invocation, 'next-turn-inputs.json'));
  const bytes = serializeStepInputs(next);
  const held = await readFile(path, 'utf8').catch(() => null);
  if (held !== null && canonicalJson(JSON.parse(held)) === canonicalJson(JSON.parse(bytes))) {
    handling.applied(`nothing more for the next turn: ${path} already holds these inputs`);
    return;
  }
  await writeFileAtomic(path, bytes);
  handling.applied(`the local architect's next-turn inputs: ${path}`);
}

async function afterCapabilityNeed(handling: Handling, item: WorkItem, assignment: IterationAssignment, options: StepAfterOptions): Promise<void> {
  const { run, context, invocation } = handling;
  const accepted = acceptedCommit(run.log.ledger.replay(), run.base);
  const request = capabilityRequestId(committedRecords(run.log.ledger.replay()).capabilityRequests.size + 1);
  const source = await captureProvisionalSource({
    git: context.git, sourceGit: options.provisionalSourceGit, projectRoot: context.projectRoot, runDirectory: run.directory, request,
    acceptedBase: accepted, writerSettledBy: invocation, changedPaths: await context.git.changedPaths(context.projectRoot, accepted),
  });
  handling.applied(`the provisional source of ${invocation} for request ${request}: ${source.delta.length} changed path${source.delta.length === 1 ? '' : 's'}, ${run.path(source.snapshot)}`);
  handling.notRun(`the capability workflow of ${item.id}'s need in ${assignment.id}: its request record, its architect and its return to the engineer`);
}


import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createConfiguredAudit, type ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import { gitCandidateSource, gitService, type CandidateSource, type GitService } from '../../subs/evidence/src/git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { capabilityRunPolicyVersion } from '../capability/policy.js';
import { checkFindingStateOf } from '../check-findings/state.js';
import { inPlaceCheckExecution, type CheckExecutionPort } from '../checks/execution.js';
import type { GateAttempt } from '../checks/records.js';
import { verificationKey } from '../contracts/schedule.js';
import { completionBlockers, verifiedRequirements } from '../run/after-handling.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { readinessAuditOutcome, writeScopePaths } from '../run/committing-gate.js';
import { incompleteScenarios, trackedScenarios } from '../run/feature-files.js';
import { runCheckpoint } from '../run/gates.js';
import { architectRunInputs } from '../run/inputs.js';
import { captureProjectConfig } from '../run/project-config.js';
import { runReadiness } from '../run/readiness.js';
import { committedAuditConfigurationSchema, gateAttemptId, gateAttemptSchema, runLayout } from '../run/records.js';
import type { ProcessGroups } from '../run/writer.js';
import { unsettledRequests } from '../reviews/state.js';
import { committedRecords } from '../work/committed.js';
import { engineerSubmissionSchema } from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';
import { localArchitectSubmissionSchema } from '../work/submission.js';
import type { WorkItem } from '../work/records.js';
import { scratchSafetyRule } from '../work/scratch.js';
import { declaredModuleDirectories } from '../run/project-config.js';
import { openLockedManualRun, type ManualRun } from './manual.js';
import { committedBody } from './runner.js';
import { acceptedSubmission, lastTransition, manualGates, manualHandling, manualWrite, submissionValue, type ManualHostContext } from './manual-hosts.js';

/*
 * `step gate`: one checkpoint over a manual run's candidate, with the
 * checkpoint policy a run applies and the same committing gate. Iteration
 * and work-item checkpoints commit the candidate on the run branch and ask
 * the project's committed audit in its default mode; the final checkpoint
 * commits and asks the full nested audit; readiness audits the baseline in
 * full nested mode without a commit. The attempt names its subject, the
 * invocation that proposed it and the commit it audited.
 *
 * The subject is never guessed: an ambiguous one is refused, and so is one
 * whose prerequisite records the manual run does not hold. A work-item or
 * final gate waives nothing a run requires before it. `--no-commit` runs the
 * in-place diagnosis `session --gate` runs, which is never audit evidence:
 * it is written beside the run's records, never into its log.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The checkpoints `step gate` runs. */
export const stepGateCheckpoints = ['iteration', 'work-item', 'readiness', 'final'] as const;
export type StepGateCheckpoint = typeof stepGateCheckpoints[number];

/** What one `step gate` is given. */
export interface StepGateOptions {
  /** The manual run directory, which `step run` created. */
  readonly run: string;
  readonly checkpoint: StepGateCheckpoint;
  /** The proposing invocation that selects the subject, where more than one could be meant. */
  readonly invocation?: string | undefined;
  /** Runs only the in-place diagnosis: setup, type check and Ramify check. */
  readonly noCommit?: boolean | undefined;
  readonly ramify: RamifyCli;
  /** Git observations, the run branch and the gate's commit. Tests inject scenario answers; production uses Git. */
  readonly git?: GitService | undefined;
  readonly candidates?: CandidateSource | undefined;
  /** The project's committed audit. Tests inject a scripted one; production runs the provider. */
  readonly configuredAudit?: ConfiguredAuditPort | undefined;
  /** The in-place diagnosis's command execution. */
  readonly checkExecution?: CheckExecutionPort | undefined;
  /** The architect view as the project stands now; by default the view, materialized. */
  readonly refresh?: ((projectRoot: string) => Promise<ArchitectIndex | null>) | undefined;
  readonly groups?: ProcessGroups | undefined;
  readonly now?: (() => Date) | undefined;
  readonly onLine?: ((line: string) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** How a `step gate` ended: 0 a passing attempt, 1 an attempt that did not pass or an error, 2 refused before any effect. */
export interface StepGateResult {
  readonly exitStatus: 0 | 1 | 2;
  /** The attempt, where one was made. */
  readonly attempt: GateAttempt | null;
  /** Where the attempt was written, absolute. */
  readonly record: string | null;
  /** Whether the attempt is the in-place diagnosis, which is never audit evidence. */
  readonly diagnosis: boolean;
  readonly lines: readonly string[];
}

/** The subject one gate is for, resolved from the manual run's records. */
interface Subject {
  readonly item?: WorkItem | undefined;
  readonly assignment?: IterationAssignment | undefined;
  /** The invocation that proposed it: an engineer's completion, a local architect's completion request, or none. */
  readonly invocation: string | null;
  readonly summary?: string | undefined;
  /** The engineer's proposal's bindings, applied before an iteration's audit. */
  readonly bindings?: readonly import('../work/obligations.js').ObligationBinding[] | undefined;
}

class Refused extends Error {}

/** Runs one `step gate`. */
export async function runStepGate(options: StepGateOptions): Promise<StepGateResult> {
  const lines: string[] = [];
  const line = (text: string) => {
    lines.push(text);
    try { options.onLine?.(text); } catch { /* A reader that fails does not end the gate. */ }
  };
  const refuse = (reason: string): StepGateResult => {
    line(`Refused: ${reason}`);
    return { exitStatus: 2, attempt: null, record: null, diagnosis: false, lines };
  };
  if (options.noCommit !== true && options.invocation !== undefined && (options.checkpoint === 'readiness' || options.checkpoint === 'final')) {
    return refuse(`a ${options.checkpoint} gate has no proposing invocation; --invocation selects an iteration or work-item proposal`);
  }
  const git = options.git ?? gitService;
  const opened = await openLockedManualRun({ directory: options.run, git, now: options.now, groups: options.groups });
  if (opened.status === 'refused') return refuse(opened.reason);
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
    let subject: Subject;
    try { subject = await subjectOf(run, options.checkpoint, options.invocation, options.noCommit === true); }
    catch (error) {
      if (error instanceof Refused) return refuse(error.message);
      throw error;
    }
    if (options.noCommit === true) return await diagnose(run, context, options, subject, line, lines);
    return await committing(run, context, options, subject, line, lines);
  } catch (error) {
    line(`Error: ${message(error)}`);
    line(`Last completed transition: ${lastTransition(run.log)}`);
    return { exitStatus: 1, attempt: null, record: null, diagnosis: false, lines };
  } finally {
    await opened.opened.release();
  }
}

/** The checkpoint as a run commits and audits it, with its attempt in the manual run's log. */
async function committing(run: ManualRun, context: ManualHostContext, options: StepGateOptions, subject: Subject,
  line: (text: string) => void, lines: readonly string[]): Promise<StepGateResult> {
  const gates = manualGates(context);
  const { projectRoot, git } = context;
  let attempt: GateAttempt | null;
  const priors = earlierAttempts(run, options.checkpoint, subject);
  switch (options.checkpoint) {
    case 'readiness': attempt = await readiness(run, context, gates.gateCount(run), options.signal, line); break;
    case 'iteration': {
      const { item, assignment, invocation } = subject;
      // The proposal's bindings apply before its audit, as the run applies them.
      const handling = manualHandling(context, gates);
      if (!await handling.recordBindings(run, invocation!, subject.bindings ?? [])) throw new Error('The bindings could not be recorded');
      if ((subject.bindings ?? []).length > 0) line(`Bindings: ${subject.bindings!.length} recorded before the audit, as the run records them.`);
      attempt = await gates.iterationGate(run, item!, assignment!, invocation!, priors.otherProposals, priors.sameProposal, subject.summary ?? '');
      break;
    }
    case 'work-item':
      attempt = await gates.workItemGate(run, subject.item!, subject.invocation!, priors.otherProposals + priors.sameProposal, subject.summary ?? '');
      break;
    case 'final': {
      const gateId = gateAttemptId(gates.gateCount(run) + 1);
      attempt = await gates.committingCheckpoint(run, {
        id: gateId, runId: run.jobId, checkpoint: 'final', projectRoot, directory: run.path(runLayout.gateOutput(gateId)),
        head: await git.currentHead(projectRoot), policy: run.policy, proposedBy: null,
      });
      line('Not run: the non-functional assessment and its candidate binding, which a run makes before its final gate.');
      break;
    }
  }
  if (attempt === null) throw new Error('The gate recorded no attempt');
  const record = run.path(runLayout.gate(attempt.id));
  const subjectText = Object.entries(attempt.subject).map(([key, value]) => `${key} ${value}`).join(', ') || 'none';
  line(`Gate ${attempt.id}: ${attempt.checkpoint}, ${attempt.verdict}${attempt.cause === null ? '' : ` (${attempt.cause})`}; next: ${attempt.next}.`);
  line(`Subject: ${subjectText}; proposed by: ${attempt.proposedBy ?? 'none'}.`);
  const uncommitted = attempt.verdict === 'passed' ? 'none (the tree was unchanged)' : 'none (a rule failed before the commit)';
  line(`Candidate: head ${attempt.head}, commit ${attempt.commit ?? uncommitted}, audited ${attempt.audited ?? 'none'}.`);
  line(`Record: ${record}`);
  return { exitStatus: attempt.verdict === 'passed' ? 0 : 1, attempt, record, diagnosis: false, lines };
}

/** Readiness over the baseline, as a run's readiness attempt records it, without a candidate commit or a recovery. */
async function readiness(run: ManualRun, context: ManualHostContext, gates: number, signal: AbortSignal | undefined,
  line: (text: string) => void): Promise<GateAttempt | null> {
  const { projectRoot, git } = context;
  const attemptNumber = run.log.count('readiness-passed') + run.log.count('readiness-failed') + 1;
  const gateId = gateAttemptId(gates + 1);
  const head = await git.currentHead(projectRoot);
  // A manual run captured no audit definition at its start; the committed one at the baseline is the one readiness compares.
  let auditConfiguration: { readonly config: import('../run/records.js').CommittedAuditConfigurationRecord } | { readonly invalid: string };
  try { auditConfiguration = { config: committedAuditConfigurationSchema.parse(await context.configuredAudit.read(projectRoot, head)) }; }
  catch (error) { auditConfiguration = { invalid: `The committed audit configuration at ${head} cannot be read: ${message(error)}` }; }
  const manualGates_ = manualGates(context);
  await manualWrite(run, { type: 'gate-started', data: { gate: gateId, checkpoint: 'readiness' } });
  const result = await runReadiness(context.configuredAudit, {
    runId: run.jobId, attempt: attemptNumber, projectRoot, gateDirectory: run.path(runLayout.gateOutput(gateId)), gateId,
    policy: run.record.policy, projectConfig: await captureProjectConfig(projectRoot), auditConfiguration,
    index: run.index, ramify: context.ramify, git, head, signal,
    started: manualGates_.commandStarted(run, gateId, 'readiness'), waiting: manualGates_.commandWaiting(run, gateId, 'readiness'),
  });
  const records = [
    ...(result.gate === null ? [] : [{ path: runLayout.gate(gateId), id: gateId, revision: 1, body: result.gate }, ...readinessAuditOutcome(result.gate)]),
    { path: runLayout.readiness(attemptNumber), id: String(attemptNumber), revision: 1, body: result.attempt },
  ];
  if (result.attempt.verdict === 'passed' && result.gate !== null) {
    await manualWrite(run, { type: 'readiness-passed', data: { attempt: attemptNumber, gate: gateId } }, records);
  } else {
    const failing = result.attempt.steps.find(step => step.outcome !== 'passed');
    // A manual run recovers nothing: the attempt is its own last.
    await manualWrite(run, { type: 'readiness-failed', data: { attempt: attemptNumber, gate: gateId, step: failing?.step ?? 'unknown', detail: failing?.detail ?? '', recovery: null, final: true } }, records);
    line(`Readiness failed at ${failing?.step ?? 'an unknown step'}: ${failing?.detail ?? ''}`);
    line('Not run: the bounded recovery a run attempts after a recoverable readiness failure.');
  }
  line(`Readiness attempt ${attemptNumber}: ${result.attempt.verdict}; ${run.path(runLayout.readiness(attemptNumber))}`);
  if (result.gate === null) return gateAttemptSchema.parse({
    schema: 'ramify-agent.gate-attempt/3', id: gateId, checkpoint: 'readiness', subject: {}, proposedBy: null, repairRound: 0, infrastructureAttempt: 0,
    head, commit: null, audited: null, evidence: null, guardedChanges: [], commands: [], verdict: 'not-verified', cause: null, next: 'exhausted',
  });
  return result.gate;
}

/** The in-place diagnosis over the tree as it stands: setup, type check and Ramify check. Never audit evidence. */
async function diagnose(run: ManualRun, context: ManualHostContext, options: StepGateOptions, subject: Subject,
  line: (text: string) => void, lines: readonly string[]): Promise<StepGateResult> {
  const { projectRoot, git } = context;
  const config = await captureProjectConfig(projectRoot);
  const setup = 'config' in config ? config.config.setup : undefined;
  const id = await nextDiagnosisId(run);
  const safety = await scratchSafetyRule(projectRoot, await declaredModuleDirectories(projectRoot), git);
  const assignment = subject.assignment;
  const attempt = await runCheckpoint(options.checkExecution ?? inPlaceCheckExecution, {
    id: gateAttemptId(1),
    checkpoint: options.checkpoint,
    projectRoot,
    directory: run.path(join('diagnoses', id)),
    head: await git.currentHead(projectRoot),
    policy: run.policy,
    proposedBy: subject.invocation,
    subject: { ...(subject.item === undefined ? {} : { workItem: subject.item.id }), ...(assignment === undefined ? {} : { iteration: assignment.id }) },
    ...(assignment === undefined ? {} : {
      guarded: assignment.guarded,
      writeScope: writeScopePaths(projectRoot, assignment),
      authorizations: assignment.authorizations.map(entry => ({ path: entry.path, by: entry.by })),
    }),
    rules: [safety],
    ...(setup === undefined ? {} : { setup }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const { auditOverall: _auditOverall, ...durable } = attempt;
  const record = run.path(join('diagnoses', id, 'attempt.json'));
  await mkdir(dirname(record), { recursive: true });
  await writeFile(record, `${JSON.stringify(gateAttemptSchema.parse(durable), null, 2)}\n`);
  line(`Diagnosis ${id}: ${attempt.verdict}${attempt.cause === null ? '' : ` (${attempt.cause})`}. It ran in place and committed nothing.`);
  for (const command of attempt.commands) {
    const last = command.output.tail.trim().split('\n').at(-1) ?? '';
    line(`  ${command.kind}${command.name === undefined ? '' : ` "${command.name}"`}: ${command.outcome === 'not-verified' ? `not verified (${command.notVerified ?? 'unknown'})` : command.outcome}${last === '' ? '' : ` — ${last}`}`);
  }
  line('This diagnosis is not audit evidence: it is not in the run\'s log, qualifies no candidate and cannot close an iteration.');
  line(`Record: ${record}`);
  return { exitStatus: attempt.verdict === 'passed' ? 0 : 1, attempt, record, diagnosis: true, lines };
}

/** The next diagnosis directory of the manual run, `d-0001` onwards. */
async function nextDiagnosisId(run: ManualRun): Promise<string> {
  const existing = await readdir(run.path('diagnoses')).catch(() => [] as string[]);
  return `d-${String(existing.filter(name => /^d-\d{4}$/u.test(name)).length + 1).padStart(4, '0')}`;
}

/** The earlier attempts at this subject: those of other proposals, which were repair rounds, and those of this one. */
function earlierAttempts(run: ManualRun, checkpoint: StepGateCheckpoint, subject: Subject): { readonly otherProposals: number; readonly sameProposal: number } {
  let otherProposals = 0;
  let sameProposal = 0;
  for (const event of run.log.all('gate-attempted')) {
    if (event.data.checkpoint !== (checkpoint === 'iteration' ? subject.assignment?.gate.checkpoint ?? 'iteration' : checkpoint)) continue;
    const attempt = attemptOf(run, event.data.gate);
    if (attempt === null) continue;
    if (subject.assignment !== undefined && attempt.subject.iteration !== subject.assignment.id) continue;
    if (subject.assignment === undefined && subject.item !== undefined && attempt.subject.workItem !== subject.item.id) continue;
    if (attempt.proposedBy === subject.invocation) sameProposal += 1;
    else otherProposals += 1;
  }
  return { otherProposals, sameProposal };
}

/**
 * The subject the checkpoint is for, from the manual run's records, or the
 * refusal: an ambiguous subject, an invocation that proposed none, and a
 * prerequisite record the run does not hold.
 */
async function subjectOf(run: ManualRun, checkpoint: StepGateCheckpoint, invocation: string | undefined, diagnosis: boolean): Promise<Subject> {
  const records = committedRecords(run.log.ledger.replay());
  switch (checkpoint) {
    case 'readiness': return { invocation: null };
    case 'iteration': {
      const closed = new Set(run.log.all('iteration-closed').map(event => event.data.iteration));
      const proposals: Array<{ invocation: string; iteration: string }> = [];
      for (const started of run.log.all('invocation-started')) {
        if (started.data.role !== 'engineer' || started.data.work.iteration === undefined) continue;
        if (invocation !== undefined && started.data.invocation !== invocation) continue;
        const ended = run.log.all('invocation-ended').find(event => event.data.invocation === started.data.invocation);
        if (ended?.data.ended !== 'submitted' || ended.data.submission === null) continue;
        const accepted = await acceptedSubmission(run, started.data.invocation);
        if (!accepted.ok) throw new Refused(accepted.reason);
        const parsed = engineerSubmissionSchema.safeParse(submissionValue(accepted.raw));
        if (parsed.success && parsed.data.kind === 'completion-proposed' && !closed.has(started.data.work.iteration)) {
          proposals.push({ invocation: started.data.invocation, iteration: started.data.work.iteration });
        }
      }
      if (invocation !== undefined && proposals.length === 0) {
        throw new Refused(`invocation ${invocation} is not an engineer's accepted completion proposal of an iteration that is still open in this manual run`);
      }
      if (proposals.length === 0) throw new Refused('the manual run holds no accepted completion proposal of an open iteration; an iteration gate audits a proposal');
      if (proposals.length > 1) {
        throw new Refused(`more than one completion proposal could be meant: ${proposals.map(proposal => `${proposal.invocation} (${proposal.iteration})`).join(', ')}; name one with --invocation`);
      }
      const chosen = proposals[0]!;
      const assignment = records.assignments.get(chosen.iteration);
      if (assignment === undefined) throw new Refused(`the manual run holds no assignment record of ${chosen.iteration}, which the proposal of ${chosen.invocation} is for`);
      const item = records.workItems.find(entry => entry.id === assignment.workItem);
      if (item === undefined) throw new Refused(`the manual run holds no work item ${assignment.workItem}, which ${chosen.iteration} belongs to`);
      const accepted = await acceptedSubmission(run, chosen.invocation);
      if (!accepted.ok) throw new Refused(accepted.reason);
      const proposal = engineerSubmissionSchema.parse(submissionValue(accepted.raw));
      if (proposal.kind !== 'completion-proposed') throw new Refused(`${chosen.invocation} proposed no completion`);
      return { item, assignment, invocation: chosen.invocation, summary: proposal.summary, bindings: proposal.bindings };
    }
    case 'work-item': {
      const requests = run.log.all('outline-revised').filter(event => event.data.architectRef !== undefined
        && (invocation === undefined || event.data.invocation === invocation));
      const passed = new Set(run.log.all('gate-attempted').filter(event => event.data.checkpoint === 'work-item' && event.data.verdict === 'passed')
        .map(event => attemptOf(run, event.data.gate)?.proposedBy));
      const pending = invocation === undefined ? requests.filter(event => !passed.has(event.data.invocation)) : requests;
      if (invocation !== undefined && pending.length === 0) {
        throw new Refused(`invocation ${invocation} recorded no completion request in this manual run; \`step after\` records a local architect's completion request`);
      }
      if (pending.length === 0) throw new Refused('the manual run holds no completion request awaiting its work-item gate; `step after` records one from a local architect\'s request-completion');
      if (pending.length > 1) {
        throw new Refused(`more than one completion request could be meant: ${pending.map(event => `${event.data.invocation} (${event.data.workItem})`).join(', ')}; name one with --invocation`);
      }
      const request = pending[0]!;
      const item = records.workItems.find(entry => entry.id === request.data.workItem);
      if (item === undefined) throw new Refused(`the manual run holds no work item ${request.data.workItem}`);
      if (!diagnosis) workItemPrerequisites(run, item);
      const accepted = await acceptedSubmission(run, request.data.invocation);
      const summary = accepted.ok ? localArchitectSubmissionSchema.safeParse(submissionValue(accepted.raw)) : undefined;
      return { item, invocation: request.data.invocation, summary: summary?.success && summary.data.kind === 'request-completion' ? summary.data.summary : '' };
    }
    case 'final': {
      if (!diagnosis) finalPrerequisites(run);
      return { invocation: null };
    }
  }
}

/** What a run requires before a work item's gate, none of it waived: closed iterations, settled reviews, no attention left and no blocker. */
function workItemPrerequisites(run: ManualRun, item: WorkItem): void {
  const closed = new Set(run.log.all('iteration-closed').map(event => event.data.iteration));
  const open = run.log.all('iteration-assigned').filter(event => event.data.workItem === item.id && !closed.has(event.data.iteration));
  if (open.length > 0) throw new Refused(`${open.map(event => event.data.iteration).join(', ')} of ${item.id} is still open; a work item's gate follows its closed iterations`);
  const unsettled = unsettledRequests(run.log.events).filter(request => request.workItem === item.id);
  if (unsettled.length > 0) {
    throw new Refused(`the review requests ${unsettled.map(request => `${request.id} (${request.kind})`).join(', ')} of ${item.id} are not settled; run their reviewer steps first`);
  }
  const attention = selectCheckFindings(checkFindingStateOf(run.log.ledger), { kind: 'list', owner: { kind: 'work-item', workItem: item.id }, select: 'attention', limit: 100 });
  const items = attention.ok && 'items' in attention.view ? attention.view.items : [];
  if (items.length > 0) {
    throw new Refused(`${items.length} CheckFinding${items.length === 1 ? '' : 's'} of ${item.id} need${items.length === 1 ? 's' : ''} attention (${items.map(entry => entry.id).join(', ')}), which a run reconciles before the work item's gate; a manual run does not run reconciliation`);
  }
  const blockers = completionBlockers(run.log, item, run.record.policy.version === capabilityRunPolicyVersion);
  if (blockers.blocked.length > 0) throw new Refused(`${item.id}'s completion is blocked: ${blockers.blocked.join('; ')}`);
}

/** What a run requires before its final gate, none of it waived. */
function finalPrerequisites(run: ManualRun): void {
  const records = committedRecords(run.log.ledger.replay());
  const verified = verifiedRequirements(run.log);
  const open = [...records.requirements.values()].filter(requirement => !verified.has(verificationKey(requirement.id, requirement.revision)));
  if (open.length > 0) throw new Refused(`${open.map(requirement => `${requirement.id} of ${requirement.consumer} is still held by its fake`).join('; ')}`);
  const incomplete = incompleteScenarios(trackedScenarios(run.log.ledger.replay()));
  if (incomplete.length > 0) throw new Refused(`the tracked scenarios ${incomplete.map(scenario => `${scenario.id} (${scenario.state})`).join(', ')} are not implemented`);
  const unsettled = unsettledRequests(run.log.events);
  if (unsettled.length > 0) throw new Refused(`the review requests ${unsettled.map(request => request.id).join(', ')} are not settled`);
  const closed = new Set(run.log.all('iteration-closed').map(event => event.data.iteration));
  const openIterations = run.log.all('iteration-assigned').filter(event => !closed.has(event.data.iteration));
  if (openIterations.length > 0) throw new Refused(`the iterations ${openIterations.map(event => event.data.iteration).join(', ')} are still open`);
  const passedItems = new Set(run.log.all('gate-attempted').filter(event => event.data.checkpoint === 'work-item' && event.data.verdict === 'passed')
    .map(event => attemptOf(run, event.data.gate)?.subject.workItem));
  const ungated = records.workItems.filter(item => !passedItems.has(item.id));
  if (ungated.length > 0) throw new Refused(`the work items ${ungated.map(item => item.id).join(', ')} have no passing work-item gate`);
}

/** One committed gate attempt of the manual run, or null where its record cannot be read. */
export function attemptOf(run: ManualRun, gate: string): GateAttempt | null {
  const parsed = gateAttemptSchema.safeParse(committedBody(run, runLayout.gate(gate)));
  return parsed.success ? parsed.data : null;
}

/** The checkpoint names `step gate` accepts, as its usage states them. */
export function isStepGateCheckpoint(value: string): value is StepGateCheckpoint {
  return (stepGateCheckpoints as readonly string[]).includes(value);
}

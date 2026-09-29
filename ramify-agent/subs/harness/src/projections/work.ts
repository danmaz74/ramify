import {
  runQueryLimits,
  type GateView, type WorkItemResponse, type WorkItemSummary,
} from '../interfaces/protocol/runs.js';
import { digestLines } from '../work/failure.js';
import { originKindOf, type WorkItem } from '../work/records.js';
import type { IterationAssignment } from '../work/iterations.js';
import { readAcceptedEvidence, type AcceptedEvidence } from '../analysis/evidence.js';
import { deliverPackage } from '../context-selection/delivery.js';
import { packageDeviation, planDeviationSchema } from '../deviations/records.js';
import type { PackageDeviation } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { ProjectionError, type RunView } from './inputs.js';
import { scenarioCheckViewOf } from './scenarios.js';

/*
 * Work items, their iterations and their gates, as a client reads them.
 *
 * A work item's state is read from the log: started, yielded and not yet
 * resumed, completed by a passing work-item gate. A gate attempt is shown
 * with every command it ran, with each output tail bounded at 8 KiB and the
 * environment the harness built for the command withheld: the complete
 * output stays a file of the run.
 */

/** The one capability a work item exists for, where its origin names one; an integration work item's names none. */
export function capabilityOfItem(view: RunView, item: WorkItem): string | null {
  if ('entry' in item.origin) return item.origin.entry;
  if ('obligation' in item.origin) return view.records.obligations.get(item.origin.obligation.id)?.capability ?? null;
  if ('integration' in item.origin) return null;
  return view.records.requirements.get(item.origin.verification.id)?.forCapability ?? null;
}

interface ItemState {
  readonly started: Set<string>;
  readonly completed: Map<string, string>;
  readonly yielded: Map<string, string[]>;
}

function itemStates(view: RunView): ItemState {
  const started = new Set<string>();
  const completed = new Map<string, string>();
  const yielded = new Map<string, string[]>();
  for (const event of view.events) {
    switch (event.type) {
      case 'work-item-started': started.add(event.data.workItem); break;
      case 'work-item-completed': completed.set(event.data.workItem, event.data.gate); yielded.delete(event.data.workItem); break;
      case 'work-item-yielded': yielded.set(event.data.workItem, [...event.data.requirements]); break;
      case 'work-item-resumed': yielded.delete(event.data.workItem); break;
      default: break;
    }
  }
  return { started, completed, yielded };
}

function summaryOf(view: RunView, item: WorkItem, states: ItemState): WorkItemSummary {
  const assignments = [...view.records.assignments.values()].filter(assignment => assignment.workItem === item.id);
  const open = assignments.filter(assignment => !view.records.results.has(assignment.id)).at(-1);
  const gates = [...view.gates.values()].filter(gate => gate.body.subject.workItem === item.id);
  const invocations = [...view.records.invocations.values()].filter(invocation => invocation.work.workItem === item.id);
  const completedBy = states.completed.get(item.id) ?? null;
  const waitingFor = states.yielded.get(item.id) ?? [];
  const state = completedBy !== null
    ? 'completed'
    : waitingFor.length > 0 ? 'yielded' : states.started.has(item.id) ? 'working' : 'todo';
  return {
    id: item.id,
    module: item.module,
    capability: capabilityOfItem(view, item),
    origin: originKindOf(item),
    goal: item.goal,
    state,
    follows: item.follows ?? null,
    startedFor: item.startedFor,
    currentIteration: open?.id ?? null,
    waitingFor,
    completedBy,
    counts: {
      outlineRevisions: view.records.outlines.get(item.id)?.length ?? 0,
      iterations: assignments.length,
      gateAttempts: gates.length,
      invocations: invocations.length,
    },
  };
}

/** Every work item, unbounded, for projections that provide their own paging. */
export function allWorkItemsOf(view: RunView): WorkItemSummary[] {
  const states = itemStates(view);
  return view.records.workItems.map(item => summaryOf(view, item, states));
}

/** Every work item, at most 200, in the order the log committed them. */
export function workItemsOf(view: RunView): { workItems: WorkItemSummary[]; total: number } {
  const all = allWorkItemsOf(view);
  return { workItems: all.slice(0, runQueryLimits.workItems), total: all.length };
}

function gateSummary(gate: GateView | ReturnType<typeof gateBody>) {
  return { id: gate.id, checkpoint: gate.checkpoint, verdict: gate.verdict, cause: gate.cause, next: gate.next, repairRound: gate.repairRound };
}

function gateBody(view: RunView, id: string) {
  return view.gates.get(id)!.body;
}

function scopeOf(assignment: IterationAssignment) {
  const base = assignment.scope.base;
  const broad = 'modules' in base;
  return {
    modules: broad ? [...base.modules] : [base.module],
    includedChildren: broad ? [] : [...base.includedChildren],
    broad,
    rationale: broad ? base.rationale : assignment.scope.rationale,
    extra: assignment.scope.extra.map(extra => ({ path: extra.path, purpose: extra.purpose })),
    read: [...assignment.scope.read],
  };
}

/** Every plan deviation the log committed, in recorded order, as packages render them. */
function planDeviationsOf(view: RunView): PackageDeviation[] {
  const deviations: PackageDeviation[] = [];
  for (const line of view.entries) {
    for (const record of line.transaction.records) {
      if ((record.body as { schema?: unknown } | null)?.schema !== 'ramify-agent.plan-deviation/1') continue;
      const parsed = planDeviationSchema.safeParse(record.body);
      if (parsed.success) deviations.push(packageDeviation(parsed.data));
    }
  }
  return deviations;
}

/** An assignment's package, rendered again from the frozen catalog and the IDs its record holds. */
function packageOf(assignment: IterationAssignment, evidence: AcceptedEvidence, planDeviations: readonly PackageDeviation[]) {
  const cited = assignment.source;
  if (cited === undefined) return null;
  const citation = { elements: [...cited.elements], deviations: [...cited.deviations], hash: cited.hash };
  if (evidence.status === 'unavailable') return { ...citation, text: null, unavailable: evidence.reason };
  const delivered = deliverPackage(evidence.catalog, planDeviations, cited);
  return delivered.status === 'available'
    ? { ...citation, text: delivered.text, unavailable: null }
    : { ...citation, text: null, unavailable: delivered.reason };
}

/** One work item with its outlines, iterations, gates, requirements and placement requests. */
export async function workItemOf(view: RunView, id: string): Promise<WorkItemResponse> {
  const item = view.records.workItems.find(candidate => candidate.id === id);
  if (item === undefined) throw new ProjectionError('not-found', `Run ${view.record.jobId} has no work item ${id}`);
  const states = itemStates(view);
  const verified = new Set<string>();
  for (const event of view.events) {
    if (event.type === 'requirement-verified') verified.add(`${event.data.requirement}@${event.data.revision}`);
  }
  const decisionOfRequest = new Map([...view.records.decisions.values()].filter(decision => decision.request !== null).map(decision => [decision.request!, decision.id]));
  const assignments = [...view.records.assignments.values()].filter(assignment => assignment.workItem === id);
  const iterationIds = new Set(assignments.map(assignment => assignment.id));
  const evidence = assignments.some(assignment => assignment.source !== undefined)
    ? await readAcceptedEvidence(view.directory, view.record, view.events)
    : { status: 'unavailable' as const, reason: 'No assignment cites a package' };
  const planDeviations = planDeviationsOf(view);

  return {
    workItem: summaryOf(view, item, states),
    outlines: (view.records.outlines.get(id) ?? []).map(outline => ({
      revision: outline.revision,
      invocation: outline.invocation,
      changes: outline.changes,
      decomposition: { kind: outline.decomposition.kind, rationale: outline.decomposition.rationale },
      stages: outline.stages.map(stage => ({ title: stage.title, approach: stage.approach, dependsOn: [...stage.dependsOn], note: stage.note })),
      breakingChanges: outline.breakingChanges.map(change => ({ guarantee: change.guarantee, reason: change.reason, affectedConsumers: [...change.affectedConsumers] })),
      reuse: outline.reuse.map(reuse => ({ capability: reuse.capability, owner: reuse.owner, role: reuse.role })),
      revisionReason: outline.revisionReason,
      hypothesesSeen: outline.hypothesesSeen.map(seen => ({ id: seen.id, revision: seen.revision })),
    })),
    iterations: assignments.map(assignment => {
      const result = view.records.results.get(assignment.id);
      return {
        id: assignment.id,
        kind: assignment.kind,
        stage: assignment.stage,
        goal: assignment.goal,
        approach: assignment.approach,
        scope: scopeOf(assignment),
        checkpoint: assignment.gate.checkpoint,
        completionEvidence: assignment.completionEvidence,
        authorizations: assignment.authorizations.map(authorization => ({
          path: authorization.path, rationale: authorization.rationale, by: `${authorization.by.id}@${authorization.by.revision}`,
        })),
        result: result === undefined
          ? null
          : {
              outcome: result.outcome,
              gate: result.gate,
              commit: result.commit,
              findings: [...result.findings],
              changedAssumptions: [...result.changedAssumptions],
              recommendation: result.recommendation ?? null,
              failure: result.failure === undefined ? null : { digest: digestLines(result.failure.digest), analysis: result.failure.analysis },
            },
        gates: [...view.gates.keys()].filter(gate => gateBody(view, gate).subject.iteration === assignment.id).map(gate => gateSummary(gateBody(view, gate))),
        invocations: [...view.records.invocations.values()]
          .filter(invocation => invocation.work.iteration === assignment.id)
          .map(invocation => {
            const outcome = view.records.outcomes.get(invocation.id);
            return { id: invocation.id, role: invocation.role, ended: outcome?.ended ?? null, outsideScope: [...(outcome?.outsideScope ?? [])] };
          }),
        package: packageOf(assignment, evidence, planDeviations),
      };
    }),
    gates: [...view.gates.keys()]
      .filter(gate => {
        const subject = gateBody(view, gate).subject;
        return subject.workItem === id && (subject.iteration === undefined || !iterationIds.has(subject.iteration));
      })
      .map(gate => gateSummary(gateBody(view, gate))),
    requirements: [...view.records.requirements.values()]
      .filter(requirement => requirement.workItem === id)
      .map(requirement => ({
        id: requirement.id,
        revision: requirement.revision,
        obligation: requirement.obligation,
        consumer: requirement.consumer,
        forCapability: requirement.forCapability,
        behavior: requirement.behavior,
        verified: verified.has(`${requirement.id}@${requirement.revision}`),
      })),
    requests: [...view.records.requests.values()]
      .filter(request => request.workItem === id)
      .map(request => ({
        id: request.id,
        question: request.question,
        requiredBehavior: request.requiredBehavior,
        forCapability: request.forCapability,
        candidates: request.candidates.map(candidate => ({ capability: candidate.capability ?? null, owner: candidate.owner ?? null, note: candidate.note })),
        hypotheses: request.hypotheses.map(tested => ({ id: tested.ref.id, revision: tested.ref.revision, stance: tested.stance, evidence: tested.evidence })),
        decision: decisionOfRequest.get(request.id) ?? null,
      })),
  };
}

/** The last `bytes` of a text, cut at a character boundary. */
export function boundedTail(text: string, bytes: number = runQueryLimits.outputTailBytes): string {
  const encoded = Buffer.from(text, 'utf8');
  if (encoded.byteLength <= bytes) return text;
  let start = encoded.byteLength - bytes;
  // A UTF-8 continuation byte is not the start of a character.
  while (start < encoded.byteLength && (encoded[start]! & 0xc0) === 0x80) start += 1;
  return encoded.subarray(start).toString('utf8');
}

/** One gate attempt with bounded output tails and no command environment. */
export function gateOf(view: RunView, id: string): GateView {
  const gate = view.gates.get(id)?.body;
  if (gate === undefined) throw new ProjectionError('not-found', `Run ${view.record.jobId} has no gate attempt ${id}`);
  return {
    id: gate.id,
    checkpoint: gate.checkpoint,
    subject: { ...gate.subject },
    repairRound: gate.repairRound,
    infrastructureAttempt: gate.infrastructureAttempt,
    head: gate.head,
    commit: gate.commit,
    audited: gate.audited,
    evidence: gate.evidence === null ? null : { ...gate.evidence },
    verdict: gate.verdict,
    cause: gate.cause,
    next: gate.next,
    guardedChanges: gate.guardedChanges.map(change => ({
      path: change.path,
      before: change.before,
      after: change.after,
      authorizedBy: change.authorizedBy === null ? null : { id: change.authorizedBy.id, revision: change.authorizedBy.revision },
    })),
    rules: (gate.rules ?? []).map(rule => ({
      rule: rule.rule,
      outcome: rule.outcome,
      violations: rule.violations.map(violation => ({ ...violation })),
      ...(rule.limits === undefined ? {} : { limits: [...rule.limits] }),
    })),
    commands: gate.commands.map(command => ({
      kind: command.kind,
      name: command.name ?? null,
      argv: [...command.command.argv],
      cwd: command.command.cwd,
      startedAt: command.startedAt,
      elapsedMs: command.elapsedMs,
      ...(command.lockWaitMs === undefined ? {} : { lockWaitMs: command.lockWaitMs }),
      exitCode: command.exitCode,
      outcome: command.outcome,
      notVerified: command.notVerified ?? null,
      runnerError: command.runnerError,
      selection: command.selection === undefined
        ? null
        : {
            policy: command.selection.policy,
            exactOwners: [...command.selection.exactOwners],
            subtrees: [...command.selection.subtrees],
            extraSuites: [...command.selection.extraSuites],
            resolved: [...command.selection.resolved],
          },
      output: {
        path: command.output.path,
        bytes: command.output.bytes,
        truncated: command.output.truncated,
        tail: boundedTail(command.output.tail),
      },
      stopped: command.stopped ?? null,
      outputIncomplete: command.outputIncomplete === true,
      scenarios: command.scenarios === undefined ? null : scenarioCheckViewOf(command.scenarios),
    })),
  };
}

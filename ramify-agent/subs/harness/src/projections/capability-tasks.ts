import type { CapabilityTasksResponse, CapabilityTaskView } from '../interfaces/protocol/capability-tasks.js';
import { replayCapabilityState } from '../capability/state.js';
import { capabilityReviewSchema } from '../capability/records.js';
import { ProjectionError, type RunView } from './inputs.js';

/** Current task meaning comes from the event reducer; immutable content comes
 * from records committed on those same log lines. No record file is read. */
export function capabilityTasksOf(view: RunView): CapabilityTasksResponse {
  const state = replayCapabilityState(view.events);
  const requests = [...view.records.capabilityRequests.values()].map(record => {
    const current = state.requests.get(record.id);
    if (!current) throw new ProjectionError('unreadable', `Request ${record.id} has no committed transition`);
    const qualification = view.events.find(event => event.type === 'capability-qualified' && event.data.request === record.id);
    return { id: record.id, parent: record.parent.id, assignment: record.assignment, need: record.original.need,
      outcome: current.task ? 'delegated' as const : current.qualification ?? 'pending' as const,
      task: current.task, evidence: qualification?.type === 'capability-qualified' ? qualification.data.evidence : [] };
  });
  const tasks = [...view.records.capabilityTasks.values()].map(record => {
    const current = state.tasks.get(record.id);
    const request = view.records.capabilityRequests.get(record.request);
    const plan = view.records.capabilityPlans.get(record.id)?.at(-1);
    if (!current || !request || !plan || current.planRevision !== plan.revision) {
      throw new ProjectionError('unreadable', `Task ${record.id} lacks its current request, state or plan`);
    }
    const taskEvents = view.events.filter(event => 'task' in event.data && event.data.task === record.id);
    const reviews = taskEvents.filter(event => event.type === 'capability-review-recorded').map(event => {
      if (event.type !== 'capability-review-recorded') throw new Error('unreachable');
      const committed = view.entries.find(line => line.sequence === event.sequence)?.transaction.records
        .find(item => (item.body as { schema?: string }).schema === 'ramify-agent.capability-review/1');
      const parsed = capabilityReviewSchema.safeParse(committed?.body);
      if (!parsed.success || parsed.data.task !== record.id || parsed.data.gate !== event.data.gate ||
        parsed.data.planRevision !== event.data.planRevision || parsed.data.outcome !== event.data.outcome) {
        throw new ProjectionError('unreadable', `Capability review at event ${event.sequence} has no matching committed body`);
      }
      return { gate: event.data.gate, planRevision: event.data.planRevision,
        outcome: event.data.outcome, findings: parsed.data.findings };
    });
    const gateAttempts = [...view.gates.values()].filter(entry => entry.body.proposedBy !== null &&
      view.records.invocations.get(entry.body.proposedBy)?.work.capabilityTask === record.id);
    const gates = [...new Set([...gateAttempts.map(entry => entry.body.id), ...taskEvents.flatMap(event =>
      event.type === 'capability-review-recorded' || event.type === 'capability-candidate-accepted' ? [event.data.gate] : [])])];
    const verificationFailed = taskEvents.filter(event => event.type === 'capability-verification-failed')
      .map(event => event.type === 'capability-verification-failed' ? event.data.finding : '');
    const gateFailures = gateAttempts.filter(entry => entry.body.verdict !== 'passed')
      .map(entry => `${entry.body.id}: ${entry.body.verdict}${entry.body.attribution?.outside.length
        ? `; outside assignment: ${entry.body.attribution.outside.join(', ')}` : ''}`);
    const lastVerification = [...taskEvents].reverse().find(event => event.type === 'capability-review-recorded' ||
      event.type === 'capability-verification-failed' || event.type === 'capability-candidate-accepted' ||
      event.type === 'capability-verification-started');
    const assignments = [...view.records.capabilityAssignments.values()].filter(item => item.task === record.id)
      .sort((left, right) => left.sequence - right.sequence).map(item => ({
        id: item.id, owner: item.owner, purpose: item.purpose, approach: item.approach,
        status: current.assignments.get(item.id) ?? 'active' as const, intendedEvidence: item.intendedEvidence,
        failures: taskEvents.flatMap(event => event.type === 'capability-assignment-interrupted' && event.data.assignment === item.id
          ? [event.data.cause] : event.type === 'capability-assignment-settled' && event.data.assignment === item.id
            ? event.data.unfinished ?? [] : []),
      }));
    const consultations = [...view.records.capabilityExchanges.values()].flatMap(revisions => {
      const exchange = revisions.at(-1);
      return exchange?.task === record.id ? [{ id: exchange.id, question: exchange.question, references: exchange.references,
        answer: exchange.answer?.text ?? null, objections: exchange.answer?.objections ?? [] }] : [];
    });
    const handback = view.records.capabilityHandbacks.get(record.id);
    const value: CapabilityTaskView = {
      id: record.id, request: record.request, parent: record.parent, consumer: record.consumer, provider: record.provider,
      status: current.status, active: state.stack.at(-1) === record.id,
      currentCoordinator: state.stack.at(-1) === record.id && current.status !== 'stopped' ? current.coordinatorInvocation : null,
      original: { need: request.original.need, usage: request.original.usage, constraints: request.original.constraints,
        knownInterface: request.original.knownInterface, suggestedProvider: request.original.suggestedProvider ?? null,
        examples: request.original.examples },
      source: { acceptedBase: request.source.acceptedBase, tree: request.source.tree,
        delta: request.source.delta.map(change => ({ path: change.path, staged: change.staged })) },
      placementReason: record.placementReason, relatedEntries: record.relatedEntries, deferredWorkItems: record.deferredWorkItems,
      plan: { revision: plan.revision, revisionReason: plan.revisionReason, need: plan.need,
        proposedInterface: plan.proposedInterface, useCases: plan.useCases, compatibility: plan.compatibility,
        outline: plan.outline, decisions: plan.decisions, openQuestions: plan.openQuestions,
        requirementRefs: plan.requirementRefs },
      assignments, consultations,
      children: [...state.tasks.values()].filter(child => child.parent === record.id).map(child => child.id),
      activeChild: current.activeChild,
      verification: { status: handback ? 'passed' : current.status === 'verifying' ? 'running'
        : lastVerification?.type === 'capability-verification-failed' ||
          (lastVerification?.type === 'capability-review-recorded' && lastVerification.data.outcome === 'failed') ? 'failed' : 'pending',
        gates, reviews, findings: [...verificationFailed, ...gateFailures] },
      handback: handback ? { summary: handback.summary, returnedTree: handback.returnedTree,
        deltaFromSuspension: handback.deltaFromSuspension, interfaces: handback.interfaces,
        limitations: handback.limitations,
        checks: handback.checks.map(item => ({ id: item.id, revision: item.revision })),
        reviews: handback.reviews.map(item => ({ id: item.id, revision: item.revision })) } : null,
    };
    return value;
  });
  const ending = [...view.events].reverse().find(event =>
    event.type === 'job-completed' || event.type === 'job-failed' || event.type === 'job-stopped' || event.type === 'job-interrupted');
  const terminal = ending?.type === 'job-failed' ? { state: 'failed' as const,
    reason: ending.data.reason, message: ending.data.message }
    : ending?.type === 'job-interrupted' ? { state: 'interrupted' as const, reason: null, message: ending.data.message }
      : ending?.type === 'job-stopped' ? { state: 'stopped' as const, reason: null, message: null }
        : ending?.type === 'job-completed' ? { state: 'completed' as const, reason: null, message: null }
          : { state: 'running' as const, reason: null, message: null };
  return { schema: 'capability-tasks/1', version: view.entries.at(-1)?.sequence ?? 0,
    terminal, requests, tasks, stack: [...state.stack] };
}

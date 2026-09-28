import type { z } from 'zod';
import { RunLog, type RunEvent, type RunEventInput } from '../run/log.js';
import { committedRecords, recordHash } from '../work/committed.js';
import type { RecordBody } from '../../subs/ledger/src/ledger.js';
import {
  capabilityAssignmentSchema, capabilityExchangeSchema, capabilityHandbackSchema, capabilityReviewSchema,
  capabilityLayout, capabilityPlanSchema, capabilityRequestSchema, capabilityTaskSchema,
} from './records.js';
import { capabilityCompletionBlockers, capabilityDependencyCycle, capabilityHandbackReadiness, isCapabilityEvent, replayCapabilityState, transitionCapabilityState } from './state.js';

type CapabilityInput = Extract<RunEventInput, { type: `capability-${string}` }>;
type RecordSpecification = { readonly path: string; readonly schema: z.ZodType; readonly id: string; readonly revision: number };

/** The one real-ledger write path for capability records. Validate the event
 * against replayed authority and the exact bodies it promises before append.
 * The ledger then commits event and immutable bodies in one transaction. */
export async function commitCapabilityTransition(
  log: RunLog, input: CapabilityInput, records: readonly RecordBody[], at: Date = new Date(),
): Promise<RunEvent> {
  const event = log.next(input, at);
  if (!isCapabilityEvent(event)) throw new Error(`${event.type} is not a capability event`);
  const prior = replayCapabilityState(log.events);
  transitionCapabilityState(prior, event);
  const expected = specifications(event);
  if (records.length !== expected.length) throw new Error(`${event.type} requires ${expected.length} record bodies`);
  for (let index = 0; index < expected.length; index += 1) {
    const spec = expected[index]!;
    const actual = records[index]!;
    if (actual.path !== spec.path || actual.id !== spec.id || actual.revision !== spec.revision) {
      throw new Error(`${event.type} record ${index + 1} must be ${spec.path} at revision ${spec.revision}`);
    }
    const parsed = spec.schema.safeParse(actual.body);
    if (!parsed.success) throw new Error(`${actual.path}: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const committed = committedRecords(log.ledger.replay());
  if (event.type === 'capability-requested') {
    const request = capabilityRequestSchema.parse(records[0]!.body);
    if (request.id !== event.data.request || request.parent.id !== event.data.parent ||
      request.assignment !== event.data.assignment || request.invocation !== event.data.invocation ||
      request.original.examples.some((example, index) => example.id !== `${request.id}.ex${String(index + 1).padStart(2, '0')}`)) {
      throw new Error('Request must retain its harness IDs, parent and stable example order');
    }
    if (request.parent.kind === 'capability-task' && request.original.revises !== undefined) {
      const cycle = capabilityDependencyCycle(prior, request.parent.id, request.original.revises.task);
      if (cycle !== null) throw new Error(`Exact capability dependency cycle: ${cycle.join(' -> ')}`);
    }
  }
  if (event.type === 'capability-delegated') {
    const task = capabilityTaskSchema.parse(records[0]!.body);
    const plan = capabilityPlanSchema.parse(records[1]!.body);
    const request = committed.capabilityRequests.get(event.data.request);
    if (!request || task.id !== event.data.task || task.request !== request.id || plan.task !== task.id ||
      task.parent.id !== request.parent.id || task.parent.kind !== request.parent.kind || task.originatingAssignment !== request.assignment ||
      task.source.tree !== request.source.tree || plan.originalExamples.join('\0') !== request.original.examples.map(example => example.id).join('\0')) {
      throw new Error('Delegation must retain its original request, parent, source and examples');
    }
    const revises = request.original.revises;
    const earlier = revises === undefined ? undefined : committed.capabilityHandbacks.get(revises.task);
    if ((revises === undefined) !== (task.revises === undefined) ||
      (revises !== undefined && (earlier === undefined || task.revises?.handback.id !== revises.task ||
        task.revises.handback.hash !== recordHash(earlier) || task.revises.sourceRevision !== earlier.sourceRevision ||
        task.revises.reason !== revises.reason))) {
      throw new Error('Revision task must link its immutable accepted handback and source');
    }
    if (committed.workItems.length + committed.capabilityTasks.size >= task.limits.maxWorkUnits) throw new Error('Combined work-unit limit exhausted');
  }
  if (event.type === 'capability-plan-revised') {
    const plan = capabilityPlanSchema.parse(records[0]!.body);
    const previous = committed.capabilityPlans.get(plan.task)?.at(-1);
    if (!previous || plan.revision !== event.data.revision || plan.basedOn !== previous.revision ||
      plan.originalExamples.join('\0') !== previous.originalExamples.join('\0') ||
      previous.useCases.some(old => !plan.useCases.some(next => next.id === old.id))) {
      throw new Error('Plan revision is stale or drops an original example or existing case');
    }
  }
  if (event.type === 'capability-exchange-opened' || event.type === 'capability-exchange-answered') {
    const exchange = capabilityExchangeSchema.parse(records[0]!.body);
    const priorExchange = committed.capabilityExchanges.get(exchange.id)?.at(-1);
    if (exchange.id !== event.data.exchange || exchange.task !== event.data.task ||
      (event.type === 'capability-exchange-opened' && (exchange.answer !== null || priorExchange !== undefined)) ||
      (event.type === 'capability-exchange-answered' && (!priorExchange || exchange.answer === null ||
        exchange.question !== priorExchange.question || exchange.request !== priorExchange.request))) {
      throw new Error('Exchange answer must preserve its recorded question and task');
    }
  }
  if (event.type === 'capability-assigned') {
    const assignment = capabilityAssignmentSchema.parse(records[0]!.body);
    const task = committed.capabilityTasks.get(assignment.task);
    if (!task || assignment.id !== event.data.assignment || assignment.sequence !== event.data.sequence ||
      assignment.sequence > task.limits.maxAssignments || assignment.plan.revision !== prior.tasks.get(task.id)?.planRevision) {
      throw new Error('Assignment is not within the task\'s captured limit');
    }
  }
  if (event.type === 'capability-review-recorded') {
    const review = capabilityReviewSchema.parse(records[0]!.body);
    if (review.task !== event.data.task || review.planRevision !== event.data.planRevision ||
      review.tree !== event.data.tree || review.gate !== event.data.gate || review.outcome !== event.data.outcome) {
      throw new Error('Capability review event and record differ');
    }
  }
  if (event.type === 'capability-handed-back') {
    const handback = capabilityHandbackSchema.parse(records[0]!.body);
    const task = committed.capabilityTasks.get(handback.task);
    const request = committed.capabilityRequests.get(handback.request);
    const plan = committed.capabilityPlans.get(handback.task)?.at(-1);
    const state = prior.tasks.get(handback.task);
    const completedAssignments = new Set([...state?.assignments ?? []].filter(([, outcome]) => outcome === 'accepted').map(([id]) => id));
    if (!task || !request || !plan || !state || capabilityCompletionBlockers(prior, handback.task, completedAssignments).length > 0 ||
      handback.plan.revision !== plan.revision || handback.plan.hash !== recordHash(plan) ||
      handback.task !== event.data.task || handback.sourceRevision === '' ||
      capabilityHandbackReadiness(task, request, plan, state).length > 0) {
      throw new Error('Handback lacks current resolved structural evidence');
    }
  }
  await log.ledger.append({ event, records });
  return event;
}

function specifications(event: Extract<RunEvent, { type: `capability-${string}` }>): readonly RecordSpecification[] {
  switch (event.type) {
    case 'capability-requested': return [{ path: capabilityLayout.request(event.data.request), schema: capabilityRequestSchema, id: event.data.request, revision: 1 }];
    case 'capability-delegated': return [
      { path: capabilityLayout.task(event.data.task), schema: capabilityTaskSchema, id: event.data.task, revision: 1 },
      { path: capabilityLayout.plan(event.data.task, 1), schema: capabilityPlanSchema, id: event.data.task, revision: 1 },
    ];
    case 'capability-plan-revised': return [{ path: capabilityLayout.plan(event.data.task, event.data.revision), schema: capabilityPlanSchema, id: event.data.task, revision: event.data.revision }];
    case 'capability-exchange-opened': return [{ path: capabilityLayout.exchange(event.data.task, event.data.exchange, 1), schema: capabilityExchangeSchema, id: event.data.exchange, revision: 1 }];
    case 'capability-exchange-answered': return [{ path: capabilityLayout.exchange(event.data.task, event.data.exchange, 2), schema: capabilityExchangeSchema, id: event.data.exchange, revision: 2 }];
    case 'capability-assigned': return [{ path: capabilityLayout.assignment(event.data.task, event.data.assignment), schema: capabilityAssignmentSchema, id: event.data.assignment, revision: 1 }];
    case 'capability-review-recorded': return [{ path: capabilityLayout.review(event.data.task, event.data.gate, event.data.planRevision), schema: capabilityReviewSchema, id: event.data.review, revision: 1 }];
    case 'capability-handed-back': return [{ path: capabilityLayout.handback(event.data.task), schema: capabilityHandbackSchema, id: event.data.task, revision: 1 }];
    default: return [];
  }
}

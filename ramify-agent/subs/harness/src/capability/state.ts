import type { RunEvent } from '../run/log.js';
import type { CapabilityPlan, CapabilityRequest, CapabilityTask } from './records.js';

const capabilityTypes = [
  'capability-requested', 'capability-qualified', 'capability-delegated', 'capability-plan-revised', 'capability-coordinator-resumed',
  'capability-exchange-opened', 'capability-exchange-answered', 'capability-assigned', 'capability-assignment-settled',
  'capability-verification-started', 'capability-verification-failed', 'capability-handed-back', 'capability-stopped',
] as const;
export type CapabilityEvent = Extract<RunEvent, { type: typeof capabilityTypes[number] }>;

export type CapabilityTaskStatus = 'coordinating' | 'awaiting-consumer' | 'implementing' | 'awaiting-dependency' | 'verifying' | 'handed-back' | 'stopped';
export interface CapabilityTaskState {
  readonly id: string;
  readonly request: string;
  readonly parent: string;
  readonly status: CapabilityTaskStatus;
  readonly planRevision: number;
  readonly coordinatorInvocation: string | null;
  readonly pendingExchange: string | null;
  readonly activeAssignment: string | null;
  readonly activeChild: string | null;
  readonly assignments: ReadonlyMap<string, 'active' | 'accepted' | 'partial' | 'failed' | 'interrupted'>;
  readonly nextAssignmentSequence: number;
  readonly handback: string | null;
}
export interface CapabilityState {
  readonly requests: ReadonlyMap<string, { readonly parent: string; readonly assignment: string; readonly invocation: string; readonly task: string | null;
    readonly qualification?: 'satisfied' | 'request-placement' | 'unresolved' }>;
  readonly tasks: ReadonlyMap<string, CapabilityTaskState>;
  /** The ordinary work item remains at the bottom while child tasks are active. */
  readonly stack: readonly string[];
}

export const emptyCapabilityState = (): CapabilityState => ({ requests: new Map(), tasks: new Map(), stack: [] });

export class CapabilityStateError extends Error {
  constructor(readonly event: CapabilityEvent['type'], message: string) {
    super(`${event}: ${message}`);
    this.name = 'CapabilityStateError';
  }
}

/** A pure replay reducer. An invalid authority transition is corruption, not
 * a reason to silently advance the ordinary frontier. */
export function transitionCapabilityState(previous: CapabilityState, event: CapabilityEvent): CapabilityState {
  const requests = new Map(previous.requests);
  const tasks = new Map(previous.tasks);
  let stack = [...previous.stack];
  const fail = (message: string): never => { throw new CapabilityStateError(event.type, message); };
  const active = (task: string): CapabilityTaskState => {
    const current = tasks.get(task);
    if (!current) return fail(`unknown task ${task}`);
    if (stack.at(-1) !== task) return fail(`${task} is not the active stack frame`);
    return current;
  };
  const update = (task: CapabilityTaskState, patch: Partial<CapabilityTaskState>): void => {
    tasks.set(task.id, { ...task, ...patch });
  };
  const coordinating = (task: string, invocation: string): CapabilityTaskState => {
    const current = active(task);
    if (current.status !== 'coordinating') return fail(`${task} is ${current.status}`);
    if (current.coordinatorInvocation !== invocation) return fail(`invocation ${invocation} has no coordination authority`);
    return current;
  };

  switch (event.type) {
    case 'capability-requested': {
      const { request, parent, assignment, invocation } = event.data;
      if (requests.has(request)) return fail(`request ${request} already exists`);
      if (stack.length === 0) stack = [parent];
      if (stack.at(-1) !== parent) return fail(`request parent ${parent} is not active`);
      const parentTask = tasks.get(parent);
      if (parentTask && parentTask.status !== 'implementing') return fail(`nested request parent ${parent} is ${parentTask.status}`);
      requests.set(request, { parent, assignment, invocation, task: null });
      break;
    }
    case 'capability-qualified': {
      const request = requests.get(event.data.request);
      if (!request || request.task !== null || request.qualification !== undefined) return fail(`request ${event.data.request} cannot be qualified here`);
      requests.set(event.data.request, { ...request, qualification: event.data.outcome });
      break;
    }
    case 'capability-delegated': {
      const { task, request, parent, invocation } = event.data;
      const original = requests.get(request);
      if (!original || original.task !== null || original.parent !== parent) return fail(`request ${request} is not pending for ${parent}`);
      if (tasks.has(task)) return fail(`task ${task} already exists`);
      if (stack.at(-1) !== parent) return fail(`parent ${parent} is not active`);
      const parentTask = tasks.get(parent);
      if (parentTask) update(parentTask, { status: 'awaiting-dependency', activeChild: task });
      requests.set(request, { ...original, task });
      tasks.set(task, {
        id: task, request, parent, status: 'coordinating', planRevision: 1,
        coordinatorInvocation: invocation, pendingExchange: null, activeAssignment: null, activeChild: null,
        assignments: new Map(), nextAssignmentSequence: 1, handback: null,
      });
      stack.push(task);
      break;
    }
    case 'capability-plan-revised': {
      const { task, basedOn, revision, invocation } = event.data;
      const current = coordinating(task, invocation);
      if (basedOn !== current.planRevision || revision !== basedOn + 1) return fail(`stale plan revision ${basedOn}`);
      update(current, { planRevision: revision });
      break;
    }
    case 'capability-coordinator-resumed': {
      const current = active(event.data.task);
      if (current.status !== 'coordinating') return fail(`cannot resume while ${current.status}`);
      update(current, { coordinatorInvocation: event.data.invocation });
      break;
    }
    case 'capability-exchange-opened': {
      const current = coordinating(event.data.task, event.data.invocation);
      if (current.pendingExchange) return fail(`exchange ${current.pendingExchange} remains open`);
      update(current, { status: 'awaiting-consumer', pendingExchange: event.data.exchange });
      break;
    }
    case 'capability-exchange-answered': {
      const current = active(event.data.task);
      if (current.status !== 'awaiting-consumer' || current.pendingExchange !== event.data.exchange) return fail('no matching open exchange');
      update(current, { status: 'coordinating', pendingExchange: null });
      break;
    }
    case 'capability-assigned': {
      const { task, assignment, sequence, invocation } = event.data;
      const current = coordinating(task, invocation);
      if (sequence !== current.nextAssignmentSequence || current.assignments.has(assignment)) return fail(`assignment sequence ${sequence} is not next`);
      const assignments = new Map(current.assignments);
      assignments.set(assignment, 'active');
      update(current, { status: 'implementing', activeAssignment: assignment, assignments, nextAssignmentSequence: sequence + 1 });
      break;
    }
    case 'capability-assignment-settled': {
      const { task, assignment, outcome } = event.data;
      const current = active(task);
      if (current.status !== 'implementing' || current.activeAssignment !== assignment) return fail(`assignment ${assignment} is not active`);
      const assignments = new Map(current.assignments);
      assignments.set(assignment, outcome);
      update(current, { status: 'coordinating', activeAssignment: null, assignments });
      break;
    }
    case 'capability-verification-started': {
      const current = coordinating(event.data.task, event.data.invocation);
      if ([...current.assignments.values()].some(result => result !== 'accepted')) return fail('unfinished or failed assignments prevent verification');
      if (current.activeChild !== null) return fail('unfinished child task prevents verification');
      update(current, { status: 'verifying' });
      break;
    }
    case 'capability-verification-failed': {
      const current = active(event.data.task);
      if (current.status !== 'verifying') return fail('verification is not active');
      update(current, { status: 'coordinating' });
      break;
    }
    case 'capability-handed-back': {
      const { task, handback, invocation } = event.data;
      const current = active(task);
      if (current.status !== 'verifying' || current.coordinatorInvocation !== invocation) return fail('verified coordinator authority is required');
      if (current.activeAssignment || current.activeChild || [...current.assignments.values()].some(result => result !== 'accepted')) {
        return fail('unfinished work prevents handback');
      }
      update(current, { status: 'handed-back', handback });
      stack.pop();
      const parent = tasks.get(current.parent);
      if (parent) {
        if (parent.status !== 'awaiting-dependency' || parent.activeChild !== task) return fail('parent was not awaiting this child');
        update(parent, { status: parent.activeAssignment === null ? 'coordinating' : 'implementing', activeChild: null });
      }
      break;
    }
    case 'capability-stopped': {
      const current = active(event.data.task);
      if (current.status === 'handed-back') return fail('a handed-back task cannot stop');
      update(current, { status: 'stopped' });
      break;
    }
  }
  return { requests, tasks, stack };
}

export function replayCapabilityState(events: readonly RunEvent[]): CapabilityState {
  let state = emptyCapabilityState();
  for (const event of events) {
    if (isCapabilityEvent(event)) state = transitionCapabilityState(state, event);
  }
  return state;
}

export function isCapabilityEvent(event: RunEvent): event is CapabilityEvent {
  return (capabilityTypes as readonly string[]).includes(event.type);
}

/** Structural readiness only. Test adequacy and real-provider use remain
 * agent/review judgments, while the gate later verifies recorded executions. */
export function capabilityHandbackReadiness(task: CapabilityTask, request: CapabilityRequest, plan: CapabilityPlan, state: CapabilityTaskState): readonly string[] {
  const failures: string[] = [];
  if (task.request !== request.id || plan.task !== task.id || state.id !== task.id) failures.push('Task, request and plan references differ');
  if (state.status !== 'verifying') failures.push('Task is not verifying');
  if (plan.revision !== state.planRevision) failures.push('Plan revision is stale');
  if (state.activeAssignment || [...state.assignments.values()].some(outcome => outcome !== 'accepted')) failures.push('Assignments are unfinished');
  if (state.activeChild) failures.push('A child task is unfinished');
  for (const example of request.original.examples) {
    const useCase = plan.useCases.find(item => item.id === example.id);
    if (!useCase || useCase.coverage.state === 'unresolved') failures.push(`Example ${example.id} lacks resolved coverage`);
  }
  return failures;
}

/** The policy's combined work-unit bound counts both record families. */
export function canCreateCapabilityTask(workItems: number, tasks: number, maxWorkUnits: number): boolean {
  return workItems + tasks < maxWorkUnits;
}

/** A repair or reconstruction within an assignment does not consume its next number. */
export function canAssignCapabilityTask(state: CapabilityTaskState, maxAssignments: number): boolean {
  return state.status === 'coordinating' && state.nextAssignmentSequence <= maxAssignments;
}

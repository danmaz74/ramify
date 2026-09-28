import {
  capabilityExampleId, capabilityRequestId, capabilityTaskId,
  type CapabilityPlan, type CapabilityRequest, type CapabilityTask,
} from '../../capability/records.js';

/** Small record builders for scripted Plan 16 transitions. Later fixtures
 * can vary the need, provider and source without copying a whole run. */
export const capabilityFixtureIds = {
  request: capabilityRequestId(1),
  task: capabilityTaskId(1),
  example: capabilityExampleId(capabilityRequestId(1), 1),
} as const;

const hash = 'a'.repeat(64);

export function fixtureRequest(): CapabilityRequest {
  return {
    schema: 'ramify-agent.capability-request/1', id: capabilityFixtureIds.request,
    parent: { kind: 'work-item', id: 'wi-001' }, assignment: 'wi-001.i01', invocation: 'inv-0001', consumer: 'a',
    requirementPackage: { id: 'pkg-001', revision: 1, hash }, continuation: { session: 'ses-0001', point: 'turn-1' },
    source: { acceptedBase: 'base', tree: hash, snapshot: 'snapshots/need-001', delta: [
      { path: 'subs/a/src/caller.ts', before: null, after: hash, staged: false },
    ], writerSettledBy: 'inv-0001' },
    summary: 'Caller is partially implemented', original: {
      need: 'Format the new B fact in A', usage: [{ path: 'subs/a/src/caller.ts', symbol: 'formatFact', use: 'Render the result', prospective: false }],
      constraints: ['Preserve the existing D consumer'], knownInterface: { kind: 'none-known' },
      examples: [{ id: capabilityFixtureIds.example, title: 'formats a result', code: 'expect(formatFact(result)).toBe("ok")', designation: 'pseudocode' }],
      suggestedProvider: { module: 'b', reason: 'B owns the fact' },
    },
  };
}

export function fixtureTask(request: CapabilityRequest = fixtureRequest()): CapabilityTask {
  return {
    schema: 'ramify-agent.capability-task/1', id: capabilityFixtureIds.task, request: request.id,
    parent: request.parent, originatingAssignment: request.assignment, consumer: request.consumer, provider: 'b',
    placementReason: 'B owns the fact', authority: [{ owner: 'b', reason: 'Provider implementation' }, { owner: 'a', reason: 'Consumer integration' }],
    relatedEntries: [], deferredWorkItems: ['wi-002'], source: request.source,
    limits: { maxAssignments: 12, maxWorkUnits: 64, maxInvocations: 400 },
  };
}

export function fixturePlan(request: CapabilityRequest = fixtureRequest(), task: CapabilityTask = fixtureTask(request)): CapabilityPlan {
  const example = request.original.examples[0]!;
  return {
    schema: 'ramify-agent.capability-plan/1', task: task.id, revision: 1, basedOn: 0, updatedBy: 'inv-0002',
    revisionReason: 'Initial qualified plan', need: request.original.need, proposedInterface: 'B exports a result reader',
    useCases: [{ id: example.id, expectedBehavior: 'A formats the fact', derivedFrom: [example.id], coverage: { state: 'unresolved', reason: 'Implementation pending' } }],
    compatibility: ['D uses the old result shape'], outline: ['Implement B', 'Migrate D', 'Integrate A'],
    decisions: [{ decision: 'Place in B', reason: 'B owns fact source', evidence: ['architect-view'] }],
    openQuestions: [], requirementRefs: [], originalExamples: [example.id],
  };
}

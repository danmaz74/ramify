import { capabilityTasksResponseSchema, type CapabilityTasksResponse } from '../../../../harness/src/interfaces/protocol/capability-tasks.js';

/**
 * One delegated capability task as the protocol serves it: awaiting the
 * consumer's answer, repairing a failed combined verification, or handed
 * back with its interfaces and checks.
 */
export function capabilityTasksResponse(version: number, stage: 'waiting' | 'repair' | 'handed-back'): CapabilityTasksResponse {
  const handedBack = stage === 'handed-back';
  return capabilityTasksResponseSchema.parse({ schema: 'capability-tasks/1', version,
    terminal: { state: 'running', reason: null, message: null },
    requests: [{ id: 'need-001', parent: 'wi-001', assignment: 'wi-001.i01', need: 'A needs B source', outcome: 'delegated', task: 'cap-001', evidence: [] }],
    stack: handedBack ? ['wi-001'] : ['wi-001', 'cap-001'], tasks: [{ id: 'cap-001', request: 'need-001',
      parent: { kind: 'work-item', id: 'wi-001' }, consumer: 'a', provider: 'b',
      status: handedBack ? 'handed-back' : stage === 'waiting' ? 'awaiting-consumer' : 'coordinating', active: !handedBack,
      currentCoordinator: 'inv-0002', original: { need: 'A needs B source',
        usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Display B source', prospective: false }],
        constraints: ['Keep D compatible'], knownInterface: { kind: 'none-known' },
        suggestedProvider: { module: 'b', reason: 'B owns source' }, examples: [{ id: 'need-001.ex01', title: 'source appears',
          code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }] },
      source: { acceptedBase: 'base', tree: 'a'.repeat(40), delta: [{ path: 'subs/a/src/caller.ts', staged: false }] },
      placementReason: 'B owns source', relatedEntries: [{ entry: 'b-entry', reason: 'B has its own entry' }],
      deferredWorkItems: ['wi-002'], plan: { revision: handedBack ? 3 : 2, revisionReason: 'Consumer feedback',
        need: 'A needs B source', proposedInterface: 'B exports readWithSource',
        useCases: [{ id: 'need-001.ex01', expectedBehavior: 'A displays B source', derivedFrom: ['need-001.ex01'] }],
        compatibility: ['D must migrate'], outline: ['Implement B', 'Migrate D', 'Integrate A'],
        decisions: [{ decision: 'Place in B', reason: 'B owns the fact', evidence: [] }],
        openQuestions: [], requirementRefs: [] },
      assignments: stage === 'waiting' ? [] : [{ id: 'cap-001.i01', owner: 'b', purpose: 'Implement B', approach: 'Add reader',
        status: handedBack ? 'accepted' : 'partial', intendedEvidence: ['A real test'],
        failures: handedBack ? [] : ['Type check failed in D'] }],
      consultations: [{ id: 'ex-001', question: 'What should A display?', references: ['subs/a/src/caller.ts'],
        answer: stage === 'waiting' ? null : 'B source metadata', objections: [] }],
      obligations: [{ id: 'cap-001', kind: 'outcome', responsible: { kind: 'capability-task', id: 'cap-001' },
        status: handedBack ? 'done' : 'pending', revision: handedBack ? 1 : 0, case: null, description: null, registeredBy: null,
        binding: null, report: handedBack ? { judgment: 'done', revision: 1, basedOnRevision: 0, where: 'subs/b/src/source.ts readWithSource',
          invocation: 'inv-0002', submission: 'c'.repeat(64), sequence: 9, at: '2026-10-07T12:00:00.000Z' } : null }],
      children: [], activeChild: null,
      verification: { status: handedBack ? 'passed' : stage === 'repair' ? 'failed' : 'pending',
        gates: stage === 'waiting' ? [] : ['ga-001'], reviews: [], findings: stage === 'repair' ? ['D type migration failed'] : [] },
      handback: handedBack ? { summary: 'B source is usable by A', returnedTree: 'b'.repeat(40),
        deltaFromSuspension: ['subs/b/src/source.ts'], interfaces: [{ path: 'subs/b/src/source.ts', symbols: ['readWithSource'], use: 'A reads source' }],
        limitations: [], checks: [{ id: 'ga-001', revision: 1 }], reviews: [] } : null,
    }] });
}

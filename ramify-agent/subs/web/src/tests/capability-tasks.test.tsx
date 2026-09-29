import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { capabilityTasksResponseSchema, type CapabilityTasksResponse } from '../../../harness/src/interfaces/protocol/capability-tasks.js';
import type { ProtocolClient } from '../client.js';
import { CapabilityTasksArea } from '../capability-tasks.js';

afterEach(cleanup);

function response(version: number, stage: 'waiting' | 'repair' | 'handed-back'): CapabilityTasksResponse {
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
        useCases: [{ id: 'need-001.ex01', expectedBehavior: 'A displays B source', derivedFrom: ['need-001.ex01'],
          coverage: handedBack ? { state: 'exercised', tests: ['A real test'], candidate: 'tree', configuration: 'vitest' }
            : { state: 'unresolved', reason: 'Type migration still fails' } }],
        compatibility: ['D must migrate'], outline: ['Implement B', 'Migrate D', 'Integrate A'],
        decisions: [{ decision: 'Place in B', reason: 'B owns the fact', evidence: [] }],
        openQuestions: [], requirementRefs: [] },
      assignments: stage === 'waiting' ? [] : [{ id: 'cap-001.i01', owner: 'b', purpose: 'Implement B', approach: 'Add reader',
        status: handedBack ? 'accepted' : 'partial', intendedEvidence: ['A real test'],
        failures: handedBack ? [] : ['Type check failed in D'] }],
      consultations: [{ id: 'ex-001', question: 'What should A display?', references: ['subs/a/src/caller.ts'],
        answer: stage === 'waiting' ? null : 'B source metadata', objections: [] }],
      children: [], activeChild: null,
      verification: { status: handedBack ? 'passed' : stage === 'repair' ? 'failed' : 'pending',
        gates: stage === 'waiting' ? [] : ['ga-001'], reviews: [], findings: stage === 'repair' ? ['D type migration failed'] : [] },
      handback: handedBack ? { summary: 'B source is usable by A', returnedTree: 'b'.repeat(40),
        deltaFromSuspension: ['subs/b/src/source.ts'], interfaces: [{ path: 'subs/b/src/source.ts', symbols: ['readWithSource'], use: 'A reads source' }],
        limitations: [], checks: [{ id: 'ga-001', revision: 1 }], reviews: [] } : null,
    }] });
}

function client(load: (version: number) => Promise<CapabilityTasksResponse>): ProtocolClient {
  return { getCapabilityTasks: (_planId: string, _runId: string, version: number) => load(version) } as ProtocolClient;
}

test('CA23 CA34: the browser follows consultation, provisional failure and handback without completing B entry', async () => {
  const answers = new Map([[1, response(1, 'waiting')], [2, response(2, 'repair')], [3, response(3, 'handed-back')]]);
  const openGate = vi.fn();
  const view = render(<CapabilityTasksArea client={client(async version => answers.get(version)!)} planId="p" runId="r" version={1} onOpenGate={openGate} />);
  expect(await screen.findByText(/awaiting A engineer/)).toBeTruthy();
  expect(screen.getByText(/Coordination stack: wi-001 → cap-001/)).toBeTruthy();
  view.rerender(<CapabilityTasksArea client={client(async version => answers.get(version)!)} planId="p" runId="r" version={2} onOpenGate={openGate} />);
  expect(await screen.findByText('Type check failed in D')).toBeTruthy();
  expect(screen.getByText(/Real combined verification pending|Combined verification failed/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'ga-001' }));
  expect(openGate).toHaveBeenCalledWith('ga-001');
  view.rerender(<CapabilityTasksArea client={client(async version => answers.get(version)!)} planId="p" runId="r" version={3} onOpenGate={openGate} />);
  expect(await screen.findByText('B source is usable by A')).toBeTruthy();
  expect(screen.getByText(/Handback does not complete them/)).toBeTruthy();
  expect(screen.getByText(/Original assignment and separate entry work require their own completion/)).toBeTruthy();
});

test('a slow old response cannot replace the newer task and plan revision', async () => {
  let oldResolve!: (value: CapabilityTasksResponse) => void;
  const old = new Promise<CapabilityTasksResponse>(resolve => { oldResolve = resolve; });
  const load = vi.fn((version: number) => version === 1 ? old : Promise.resolve(response(2, 'handed-back')));
  const view = render(<CapabilityTasksArea client={client(load)} planId="p" runId="r" version={1} />);
  view.rerender(<CapabilityTasksArea client={client(load)} planId="p" runId="r" version={2} />);
  expect(await screen.findByText('B source is usable by A')).toBeTruthy();
  oldResolve(response(1, 'waiting'));
  await waitFor(() => expect(screen.getByText('B source is usable by A')).toBeTruthy());
  expect(screen.queryByText(/awaiting A engineer/)).toBeNull();
  expect(screen.getAllByText(/revision 3/)).toHaveLength(2);
});

test('an accepted shared iteration shows its commit and review coverage while task handback remains pending', async () => {
  const data = response(2, 'repair');
  const task = data.tasks[0]!;
  const updated = capabilityTasksResponseSchema.parse({ ...data, tasks: [{ ...task, assignments: [{
    ...task.assignments[0], status: 'accepted', result: { outcome: 'accepted', gate: 'ga-002', commit: 'candidate-commit', findings: [] },
    reviews: [{ id: 'rq-001', kind: 'code', result: 'complete' }, { id: 'rq-002', kind: 'design', result: null }],
  }] }] });
  const openGate = vi.fn();
  render(<CapabilityTasksArea client={client(async () => updated)} planId="p" runId="r" version={2} onOpenGate={openGate} />);
  expect(await screen.findByText('candidate-commit')).toBeTruthy();
  expect(screen.getByText(/code review coverage: complete/)).toBeTruthy();
  expect(screen.getByText(/design review coverage: pending/)).toBeTruthy();
  expect(screen.getByText('No accepted handback is recorded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'ga-002' }));
  expect(openGate).toHaveBeenCalledWith('ga-002');
});

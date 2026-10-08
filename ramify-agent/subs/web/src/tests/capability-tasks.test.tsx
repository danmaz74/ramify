import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { capabilityTasksResponseSchema, type CapabilityTasksResponse } from '../../../harness/src/interfaces/protocol/capability-tasks.js';
import type { ProtocolClient } from '../client.js';
import { CapabilityTasksArea } from '../capability-tasks.js';
import { capabilityTasksResponse as response } from './helpers/capability-tasks.js';

afterEach(cleanup);

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

test('PB3-D08: examples are the request\'s context and the handback is the architect\'s report, with no per-example state', async () => {
  const pending = render(<CapabilityTasksArea client={client(async () => response(2, 'repair'))} planId="p" runId="r" version={2} />);
  const reports = await screen.findByRole('region', { name: 'Architect reports of cap-001' });
  expect(reports.textContent).toContain('cap-001 · delegated outcome · pending · no architect report');
  expect(screen.getByText(/The request's original examples, unchanged by plan revisions/)).toBeTruthy();
  expect(screen.getByText(/need-001.ex01/, { selector: 'strong' }).parentElement?.textContent).toBe('need-001.ex01: A displays B source');
  for (const state of ['unresolved', 'exercised', 'corrected']) expect(screen.queryByText(new RegExp(state))).toBeNull();
  pending.unmount();
  render(<CapabilityTasksArea client={client(async () => response(3, 'handed-back'))} planId="p" runId="r" version={3} />);
  expect((await screen.findByRole('region', { name: 'Architect reports of cap-001' })).textContent)
    .toContain('cap-001 · delegated outcome · done · architect report done by inv-0002 (revision 1), where: subs/b/src/source.ts readWithSource');
  expect(screen.getByText(/Handed back on the architect's report:/).textContent)
    .toBe("Handed back on the architect's report: cap-001 done by inv-0002, where: subs/b/src/source.ts readWithSource.");
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

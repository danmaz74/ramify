// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ExecutionMapSnapshot } from '../execution-map-client.js';
import type { ProtocolClient } from '../client.js';
import { executionLayout } from '../execution-map-layout.js';
import { ExecutionMapArea } from '../execution-map.js';
import { canvasNodes, canvasLinks, canvasMap, capabilityDetail, scenarioDetail } from './helpers/execution-map-canvas.js';

const flow = vi.hoisted(() => ({ setCenter: vi.fn(), fitView: vi.fn() }));
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    ReactFlow: ({ nodes, nodeTypes, viewport, onMove }: any) => React.createElement('div', {
      'aria-label': 'Mock flow', 'data-viewport': `${viewport.x},${viewport.y},${viewport.zoom}`,
    }, React.createElement('button', { onClick: () => onMove({}, { x: 20, y: 30, zoom: 1.5 }) }, 'Pan and zoom'),
    nodes.map((node: any) => React.createElement('div', { key: node.id, 'data-node': node.id,
      'data-position': `${node.position.x},${node.position.y}` }, React.createElement(nodeTypes.execution, { id: node.id, data: node.data })))),
    ReactFlowProvider: ({ children }: any) => children, Background: () => null, Controls: () => null, Handle: () => null,
    Position: { Left: 'left', Right: 'right' }, useReactFlow: () => flow,
  };
});
afterEach(() => { cleanup(); flow.setCenter.mockClear(); flow.fitView.mockClear(); });

const map: ExecutionMapSnapshot = canvasMap;
function client(): ProtocolClient {
  return { getExecutionMap: async () => map, getExecutionCapability: async () => capabilityDetail,
    getExecutionScenario: async () => scenarioDetail,
    getGate: async () => ({ commit: null, audited: null, evidence: null, commands: [] }),
  } as unknown as ProtocolClient;
}
function view(onOpenGate = vi.fn()) {
  render(<ExecutionMapArea client={client()} planId="nested-provider-map" runId="run-scripted-map" version={42}
    events={[{ sequence: 2, at: '2026-09-24T00:00:00.000Z', transition: 'analysis-accepted', summary: 'Analysis accepted', refs: [{ kind: 'capability', id: 'status-badge' }] }]}
    onOpenGate={onOpenGate} />);
  return onOpenGate;
}

test('typed layout keeps one shared provider and finite cycle references, with ordered iterations', () => {
  const result = executionLayout(canvasNodes, canvasLinks, new Set());
  expect(result.placements.filter(p => p.key === 'capability:theme-tokens')).toHaveLength(1);
  expect(result.placements.filter(p => canvasNodes.find(n => n.key === p.key && n.kind === 'capability' && n.level === 'entry'))).toHaveLength(2);
  expect(result.placements.find(p => p.key === 'session:ses-local-status')?.parent).toBe('work-item:wi-status');
  expect(result.placements.find(p => p.key === 'iteration:it-status-1')!.y).toBeLessThan(result.placements.find(p => p.key === 'iteration:it-status-2')!.y);
  expect(result.references.filter(l => l.kind === 'depends-on')).toHaveLength(2);
  const collapsed = executionLayout(canvasNodes, canvasLinks, new Set(['capability:status-badge']));
  expect(collapsed.hidden.has('scenario:sc-status')).toBe(true);
  expect(collapsed.hiddenCount.get('capability:status-badge')).toBeGreaterThan(1);
  expect(collapsed.placements.some(p => p.key === 'session:ses-initial')).toBe(true);
});

test('a local architect marker opens a floating transcript with its full module path', async () => {
  view();
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  fireEvent.click(within(canvas).getByRole('button', { name: /Status local architect, session/ }));
  const floating = await screen.findByLabelText('Transcript window ses-local-status');
  expect(within(floating).getByText(/project\/ui/)).toBeTruthy();
  expect(within(floating).getByRole('link', { name: 'Open full page' }).getAttribute('href')).toContain('/sessions/ses-local-status');
  fireEvent.click(within(floating).getByRole('button', { name: 'Close ses-local-status' }));
  expect(screen.queryByLabelText('Transcript window ses-local-status')).toBeNull();
});

test('roots, coverage, complete shelf, Now, keyboard buttons, details and independent audit are available', async () => {
  const opened = view();
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  expect(canvas.textContent).toContain('Status badge');
  expect(canvas.textContent).toContain('Accessible tone');
  expect(screen.getByText(new RegExp(`nodes ${map.nodes.length} / ${map.nodes.length}`))).toBeTruthy();
  expect(within(screen.getByLabelText('All sessions')).getAllByRole('listitem')).toHaveLength(3);
  expect(within(screen.getByLabelText('All gates')).getAllByRole('listitem')).toHaveLength(2);
  expect(within(screen.getByLabelText('References')).getByText(/depends-on: capability:theme-tokens → capability:status-badge/)).toBeTruthy();
  const root = within(canvas).getByRole('button', { name: /Status badge, capability/ });
  expect(root.tabIndex).toBe(0);
  expect(root.textContent).toContain('The reopened provider requirement needs verification.');
  fireEvent.click(root);
  expect(await screen.findByText(/Render a status badge whose tone uses the shared theme contract/)).toBeTruthy();
  fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse Status badge' }));
  expect(within(canvas).getByRole('button', { name: /Status badge, capability/ }).querySelectorAll('.execution-dots i')).toHaveLength(1);
  fireEvent.click(within(canvas).getByRole('button', { name: 'Expand Status badge' }));
  expect(within(canvas).getByRole('button', { name: /Renders the status badge, scenario/ })).toBeTruthy();
  expect(within(canvas).getByText(/Local architect lane · 2 invocations across the work item/)).toBeTruthy();
  expect(within(canvas).getByRole('button', { name: /Status local architect, session/ }).querySelector('svg')).toBeTruthy();
  fireEvent.click(within(canvas).getByRole('button', { name: /Renders the status badge, scenario/ }));
  expect(await screen.findByText(/Given a valid status/)).toBeTruthy();
  expect(screen.getByText(/No recorded gate result/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Now' }));
  await waitFor(() => expect(flow.setCenter).toHaveBeenCalled());
  expect(within(canvas).getByRole('button', { name: /Status engineer, session/ })).toBeTruthy();
  fireEvent.click(within(screen.getByLabelText('All gates')).getByRole('button', { name: /Status iteration gate, failed/ }));
  expect(await screen.findByText(/Verdict failed; audit passed/)).toBeTruthy();
  expect(within(canvas).getByLabelText('Verdict failed; audit passed').classList.contains('audit-passed')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open full check and audit detail' }));
  expect(opened).toHaveBeenCalledWith('ga-005');
  fireEvent.click(within(screen.getByLabelText('All gates')).getByRole('button', { name: /Status iteration gate, repaired/ }));
  expect(within(canvas).getByLabelText('Verdict passed; audit incomplete').classList.contains('audit-incomplete')).toBe(true);
  expect(within(canvas).getByRole('button', { name: /Status iteration gate, repaired, gate/ }).textContent).toContain('✗ → ✓');
  fireEvent.click(within(canvas).getByRole('button', { name: 'Pan and zoom' }));
  expect(within(canvas).getByLabelText('Mock flow').getAttribute('data-viewport')).toBe('20,30,1.5');
});

test('21 scenario marks use a bar while 20 use dots, and an active gate has no settled result', async () => {
  const root = canvasNodes.find(n => n.key === 'capability:status-badge');
  if (root?.kind !== 'capability') throw new Error('fixture root missing');
  const gate = canvasNodes.find(n => n.key === 'gate:ga-005');
  if (gate?.kind !== 'gate') throw new Error('fixture gate missing');
  const otherRoot = canvasNodes.find(n => n.key === 'capability:accessible-tone');
  if (otherRoot?.kind !== 'capability') throw new Error('second fixture root missing');
  const expanded = { ...root, scenarios: { coverage: { state: 'complete' as const, known: 21, total: 21 }, passed: 21, failed: 0, other: 0, noRealRun: 0, unavailable: 0 } };
  const twenty = { ...otherRoot, scenarios: { coverage: { state: 'complete' as const, known: 20, total: 20 }, passed: 0, failed: 20, other: 0, noRealRun: 0, unavailable: 0 } };
  const active = { ...gate, active: true, verdict: null, audit: 'not-started' as const };
  const altered = { ...map, current: { awaitedSession: null, runningGate: gate.key, source: gate.sourceRefs[0]! },
    nodes: map.nodes.map(n => n.key === root.key ? expanded : n.key === otherRoot.key ? twenty : n.key === gate.key ? active : n) };
  const c = { ...client(), getExecutionMap: async () => altered } as ProtocolClient;
  render(<ExecutionMapArea client={c} planId="nested-provider-map" runId="run-scripted-map" version={42} events={[]} onOpenGate={vi.fn()} />);
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse Status badge' }));
  expect(canvas.querySelectorAll('.execution-card-main .execution-segments')).toHaveLength(1);
  expect(canvas.querySelectorAll('.execution-card-main .execution-dots')).toHaveLength(1);
  expect(canvas.querySelectorAll('.execution-card-main .execution-dots i')).toHaveLength(20);
  fireEvent.click(within(screen.getByLabelText('All gates')).getByRole('button', { name: /Status iteration gate, failed/ }));
  expect(await screen.findByText(/The gate is running/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open full check and audit detail' })).toBeNull();
});

test('ordinary version updates retain existing card positions and add a new run-wide card', async () => {
  let answer = map;
  const c = { ...client(), getExecutionMap: async () => answer } as ProtocolClient;
  const props = { client: c, planId: 'nested-provider-map', runId: 'run-scripted-map', events: [], onOpenGate: vi.fn() };
  const rendered = render(<ExecutionMapArea {...props} version={42} />);
  const position = (key: string) => document.querySelector(`[data-node="${key}"]`)?.getAttribute('data-position');
  await waitFor(() => expect(position('capability:status-badge')).toBeTruthy());
  const first = position('capability:status-badge');
  const initial = canvasNodes.find(n => n.key === 'session:ses-initial');
  if (initial?.kind !== 'session') throw new Error('fixture session missing');
  answer = { ...map, runVersion: 43, nodes: [...map.nodes, { ...initial, key: 'session:ses-new', label: 'New run session', runVersion: 43,
    sourceRefs: [{ kind: 'run-event', id: 'ev-new', sequence: 1, revision: null }] }],
    coverage: { ...map.coverage, nodes: { shown: map.nodes.length + 1, total: map.nodes.length + 1 } } };
  rendered.rerender(<ExecutionMapArea {...props} version={43} />);
  await waitFor(() => expect(position('session:ses-new')).toBeTruthy());
  expect(position('capability:status-badge')).toBe(first);
  expect(position('session:ses-new')).not.toBe(first);
});

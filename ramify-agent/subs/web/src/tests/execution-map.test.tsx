// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ExecutionMapSnapshot } from '../execution-map-client.js';
import type { ProtocolClient } from '../client.js';
import { cardGap, executionLayout, settlePositions } from '../execution-map-layout.js';
import { ExecutionMapArea } from '../execution-map.js';
import { canvasNodes, canvasLinks, canvasMap, capabilityDetail, scenarioDetail } from './helpers/execution-map-canvas.js';

const flow = vi.hoisted(() => ({ setCenter: vi.fn(), fitView: vi.fn(), setViewport: vi.fn() }));
/** The canvas's latest change handler, through which a test reports a card the person dragged. */
const handlers = vi.hoisted(() => ({ onNodesChange: null as null | ((changes: unknown[]) => void) }));
/** The rendered height the mock canvas reports for a card, as React Flow reports what it measures; by default 100 px. */
const measured = vi.hoisted(() => ({ height: (_key: string): number => 100 }));
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    ReactFlow: ({ nodes, nodeTypes, viewport, onMove, onNodesChange }: any) => {
      handlers.onNodesChange = onNodesChange;
      React.useEffect(() => { onNodesChange?.(nodes.map((node: any) => ({ id: node.id, type: 'dimensions', dimensions: { width: 244, height: measured.height(node.id) } }))); });
      return React.createElement('div', {
        'aria-label': 'Mock flow', 'data-viewport': `${viewport.x},${viewport.y},${viewport.zoom}`,
      }, React.createElement('button', { onClick: () => onMove({}, { x: 20, y: 30, zoom: 1.5 }) }, 'Pan and zoom'),
      nodes.map((node: any) => React.createElement('div', { key: node.id, 'data-node': node.id,
        'data-position': `${node.position.x},${node.position.y}`, 'data-measured': node.measured ? `${node.measured.width},${node.measured.height}` : '' }, React.createElement(nodeTypes.execution, { id: node.id, data: node.data }))));
    },
    ReactFlowProvider: ({ children }: any) => children, Background: () => null, Controls: () => null, Handle: () => null,
    Position: { Left: 'left', Right: 'right' }, useReactFlow: () => flow,
  };
});
afterEach(() => { cleanup(); flow.setCenter.mockClear(); flow.fitView.mockClear(); flow.setViewport.mockClear(); measured.height = () => 100; });

const map: ExecutionMapSnapshot = canvasMap;
function client(): ProtocolClient {
  return { getExecutionMap: async () => map, getExecutionCapability: async () => capabilityDetail,
    getExecutionScenario: async () => scenarioDetail,
    getCapabilityTasks: async (_planId: string, _runId: string, version: number) => ({
      schema: 'capability-tasks/1', version, terminal: { state: 'running', reason: null, message: null }, requests: [], tasks: [], stack: [],
    }),
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

/** Every pair of rendered cards that share a column and whose measured extents meet. */
function overlappingCards(height: (key: string) => number): string[] {
  const cards = [...document.querySelectorAll('[data-node]')].map(element => {
    const [x, y] = element.getAttribute('data-position')!.split(',').map(Number);
    const key = element.getAttribute('data-node')!;
    return { key, x: x!, top: y!, bottom: y! + height(key) };
  });
  return cards.flatMap((a, i) => cards.slice(i + 1).filter(b => Math.abs(a.x - b.x) < 244 && a.top < b.bottom && b.top < a.bottom)
    .map(b => `${a.key} ${a.top}-${a.bottom} meets ${b.key} ${b.top}-${b.bottom}`));
}

test('cards taller than the old fixed row spacing never overlap, before and after a version update', async () => {
  // As in the real run: capability cards measure about 220 px and gate cards about 150 px.
  measured.height = key => key.startsWith('capability:') ? 226 : key.startsWith('gate:') ? 148 : 97;
  let answer = map;
  const c = { ...client(), getExecutionMap: async () => answer } as ProtocolClient;
  const props = { client: c, planId: 'nested-provider-map', runId: 'run-scripted-map', events: [], onOpenGate: vi.fn() };
  const rendered = render(<ExecutionMapArea {...props} version={42} />);
  await waitFor(() => expect(document.querySelectorAll('[data-node]').length).toBeGreaterThan(5));
  await waitFor(() => expect(overlappingCards(measured.height)).toEqual([]));
  await act(async () => {});
  // A card grows after the canvas measured it: the cards below it move down, the rest stay.
  const before = new Map([...document.querySelectorAll('[data-node]')].map(e => [e.getAttribute('data-node')!, e.getAttribute('data-position')!]));
  const grown = 'capability:status-badge';
  measured.height = key => key === grown ? 400 : key.startsWith('capability:') ? 226 : key.startsWith('gate:') ? 148 : 97;
  answer = { ...map, runVersion: 43 };
  rendered.rerender(<ExecutionMapArea {...props} version={43} />);
  await waitFor(() => expect(overlappingCards(measured.height)).toEqual([]));
  const after = new Map([...document.querySelectorAll('[data-node]')].map(e => [e.getAttribute('data-node')!, e.getAttribute('data-position')!]));
  expect(after.get(grown)).toBe(before.get(grown));
  expect(after.get('run-band')).toBe(before.get('run-band'));
});

test('the layout stacks each card below the previous one by its own height, and settling keeps kept cards apart', () => {
  const height = (key: string) => key.startsWith('capability:') ? 226 : key.startsWith('gate:') ? 148 : 97;
  const { placements } = executionLayout(canvasNodes, canvasLinks, new Set(), height);
  const stack = [...placements].sort((a, b) => a.y - b.y);
  for (const [i, card] of stack.slice(1).entries()) expect(card.y).toBe(stack[i]!.y + height(stack[i]!.key) + cardGap);
  // Kept positions from shorter cards: the grown card stays, and each card below it in its column moves just below.
  const kept = new Map(placements.map(p => [p.key, { x: p.x, y: p.y }]));
  const grown = stack.find(p => p.key.startsWith('capability:'))!;
  const grownHeight = (key: string) => key === grown.key ? height(key) + 300 : height(key);
  const settled = settlePositions(placements, kept, grownHeight);
  expect(settled.get(grown.key)).toEqual(kept.get(grown.key));
  for (const p of stack.filter(p => p.y < grown.y)) expect(settled.get(p.key)).toEqual(kept.get(p.key));
  const cards = [...settled].map(([key, at]) => ({ key, ...at, bottom: at.y + grownHeight(key) }));
  for (const a of cards) for (const b of cards) if (a !== b && Math.abs(a.x - b.x) < 244) expect(a.bottom + cardGap <= b.y || b.bottom + cardGap <= a.y).toBe(true);
  // A card without a kept position takes the first free place below its layout position in its column.
  const newcomer = stack.at(-1)!;
  const withoutNewcomer = new Map([...kept].filter(([key]) => key !== newcomer.key).map(([key, at]) => [key, key === stack.at(-2)!.key ? { ...at, x: newcomer.x, y: newcomer.y } : at]));
  const placed = settlePositions(placements, withoutNewcomer, height).get(newcomer.key)!;
  expect(placed.y).toBe(newcomer.y + height(stack.at(-2)!.key) + cardGap);
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
  expect(canvas.textContent).toContain('status-badge');
  expect(canvas.textContent).toContain('accessible-tone');
  expect(screen.getByText(new RegExp(`nodes ${map.nodes.length} / ${map.nodes.length}`))).toBeTruthy();
  expect(within(screen.getByLabelText('All sessions')).getAllByRole('listitem')).toHaveLength(3);
  expect(within(screen.getByLabelText('All gates')).getAllByRole('listitem')).toHaveLength(2);
  expect(within(screen.getByLabelText('References')).getByText(/depends-on: capability:theme-tokens → capability:status-badge/)).toBeTruthy();
  const root = within(canvas).getByRole('button', { name: /status-badge, capability/ });
  expect(root.tabIndex).toBe(0);
  expect(root.textContent).toContain('The reopened provider requirement needs verification.');
  fireEvent.click(root);
  expect(await screen.findByText(/Render a status badge whose tone uses the shared theme contract/)).toBeTruthy();
  fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse status-badge' }));
  expect(within(canvas).getByRole('button', { name: /status-badge, capability/ }).querySelectorAll('.execution-dots i')).toHaveLength(1);
  fireEvent.click(within(canvas).getByRole('button', { name: 'Expand status-badge' }));
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
  fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse status-badge' }));
  expect(canvas.querySelectorAll('.execution-card-main .execution-segments')).toHaveLength(1);
  expect(canvas.querySelectorAll('.execution-card-main .execution-dots')).toHaveLength(1);
  expect(canvas.querySelectorAll('.execution-card-main .execution-dots i')).toHaveLength(20);
  fireEvent.click(within(screen.getByLabelText('All gates')).getByRole('button', { name: /Status iteration gate, failed/ }));
  expect(await screen.findByText(/The gate is running/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open full check and audit detail' })).toBeNull();
});

test('a version update lays out every card again, while a card the person dragged keeps its place', async () => {
  let answer = map;
  const c = { ...client(), getExecutionMap: async () => answer } as ProtocolClient;
  const props = { client: c, planId: 'nested-provider-map', runId: 'run-scripted-map', events: [], onOpenGate: vi.fn() };
  const rendered = render(<ExecutionMapArea {...props} version={42} />);
  const position = (key: string) => document.querySelector(`[data-node="${key}"]`)?.getAttribute('data-position');
  await waitFor(() => expect(position('capability:status-badge')).toBeTruthy());
  await act(async () => {});
  const first = position('capability:status-badge')!;
  // The person drags the second root aside.
  act(() => handlers.onNodesChange!([{ id: 'capability:accessible-tone', type: 'position', position: { x: 900, y: 40 }, dragging: false }]));
  expect(position('capability:accessible-tone')).toBe('900,40');
  const initial = canvasNodes.find(n => n.key === 'session:ses-initial');
  if (initial?.kind !== 'session') throw new Error('fixture session missing');
  answer = { ...map, runVersion: 43, nodes: [...map.nodes, { ...initial, key: 'session:ses-new', label: 'New run session', runVersion: 43,
    sourceRefs: [{ kind: 'run-event', id: 'ev-new', sequence: 1, revision: null }] }],
    coverage: { ...map.coverage, nodes: { shown: map.nodes.length + 1, total: map.nodes.length + 1 } } };
  rendered.rerender(<ExecutionMapArea {...props} version={43} />);
  await waitFor(() => expect(position('session:ses-new')).toBeTruthy());
  await act(async () => {});
  // The new run-wide session comes first in the run, so the undragged root moves down one card to make room.
  const [x, y] = first.split(',').map(Number);
  expect(position('capability:status-badge')).toBe(`${x},${y! + 100 + cardGap}`);
  expect(position('capability:accessible-tone')).toBe('900,40');
  expect(overlappingCards(() => 100)).toEqual([]);
  // Relayout returns the dragged card to the layout.
  fireEvent.click(screen.getByRole('button', { name: 'Relayout' }));
  expect(position('capability:accessible-tone')).not.toBe('900,40');
  expect(overlappingCards(() => 100)).toEqual([]);
});

test('collapsing a branch closes its gap: the cards below it move up', async () => {
  view();
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  const position = (key: string) => document.querySelector(`[data-node="${key}"]`)!.getAttribute('data-position')!.split(',').map(Number);
  await act(async () => {});
  const before = position('capability:accessible-tone')[1]!;
  fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse status-badge' }));
  await act(async () => {});
  const root = position('capability:status-badge');
  expect(position('capability:accessible-tone')).toEqual([root[0], root[1]! + 100 + cardGap]);
  expect(position('capability:accessible-tone')[1]).toBeLessThan(before);
});

test('a long coverage list keeps its count and first facts visible, with every gap expandable', async () => {
  const gaps = Array.from({ length: 14 }, (_, i) => `Historical gate ga-${String(i + 1).padStart(4, '0')} has no audit result.`);
  const altered = { ...map, coverage: { ...map.coverage, gaps } };
  const c = { ...client(), getExecutionMap: async () => altered } as ProtocolClient;
  render(<ExecutionMapArea client={c} planId="nested-provider-map" runId="run-scripted-map" version={42} events={[]} onOpenGate={vi.fn()} />);
  const area = await screen.findByLabelText('Execution map');
  expect(within(area).getByText(/Coverage gaps: 14/)).toBeTruthy();
  const details = area.querySelector<HTMLDetailsElement>('.execution-coverage-gaps')!;
  expect(details.open).toBe(false);
  expect(details.querySelector('summary')?.textContent).toContain(gaps[0]);
  expect(details.querySelector('summary')?.textContent).not.toContain(gaps[13]);
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(true);
  expect(details.querySelectorAll('li')).toHaveLength(14);
  expect(details.lastElementChild?.textContent).toContain(gaps[13]);
});

test('a work item the run holds for the person\'s decision is marked on its card, in words', async () => {
  render(<ExecutionMapArea client={client()} planId="nested-provider-map" runId="run-scripted-map" version={42} events={[]}
    onOpenGate={vi.fn()} waitingWorkItems={new Set(['wi-status'])} />);
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  const card = within(canvas).getByRole('button', { name: /^Implement status badge, work-item, waiting for your decision/ });
  expect(card.textContent).toContain('Waiting for your decision');
  expect(canvas.querySelectorAll('.execution-awaiting-decision')).toHaveLength(1);
  expect(card.closest('.execution-card')!.classList.contains('execution-awaiting-decision')).toBe(true);
});

test('each card carries its measured size back to the canvas, so a re-render (a pan frame) does not hide it for re-measuring', async () => {
  measured.height = key => key.startsWith('capability:') ? 226 : 97;
  view();
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  await waitFor(() => expect(canvas.querySelector('[data-node="capability:status-badge"]')?.getAttribute('data-measured')).toBe('244,226'));
  fireEvent.click(within(canvas).getByRole('button', { name: 'Pan and zoom' }));
  expect(canvas.querySelector('[data-node="capability:status-badge"]')?.getAttribute('data-measured')).toBe('244,226');
  expect(canvas.querySelector('[data-node="session:ses-initial"]')?.getAttribute('data-measured')).toBe('244,97');
});

test('the canvas centres a card only when asked, never after a pan, a version update or an expanded branch', async () => {
  let answer = map;
  const c = { ...client(), getExecutionMap: async () => answer } as ProtocolClient;
  const props = { client: c, planId: 'nested-provider-map', runId: 'run-scripted-map', events: [], onOpenGate: vi.fn() };
  const rendered = render(<ExecutionMapArea {...props} version={42} />);
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  await act(async () => {});
  expect(flow.setCenter).not.toHaveBeenCalled();
  fireEvent.click(within(canvas).getByRole('button', { name: /status-badge, capability/ }));
  await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(1));
  // The person pans away; a version update, a card growing and a collapsed branch leave the view where they put it.
  fireEvent.click(within(canvas).getByRole('button', { name: 'Pan and zoom' }));
  measured.height = key => key === 'capability:status-badge' ? 300 : 100;
  answer = { ...map, runVersion: 43 };
  rendered.rerender(<ExecutionMapArea {...props} version={43} />);
  await waitFor(() => expect(document.querySelector('[data-node="capability:status-badge"]')?.getAttribute('data-measured')).toBe('244,300'));
  fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse status-badge' }));
  await act(async () => {});
  expect(within(canvas).queryByRole('button', { name: /Status engineer, session/ })).toBeNull();
  expect(flow.setCenter).toHaveBeenCalledTimes(1);
  expect(within(canvas).getByLabelText('Mock flow').getAttribute('data-viewport')).toBe('20,30,1.5');
  // A jump to a card inside the collapsed branch reveals it and centres on it once.
  fireEvent.click(within(screen.getByLabelText('All sessions')).getByRole('button', { name: /Status engineer/ }));
  await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(2));
  expect(within(canvas).getByRole('button', { name: /Status engineer, session/ })).toBeTruthy();
  await act(async () => {});
  expect(flow.setCenter).toHaveBeenCalledTimes(2);
  fireEvent.click(within(canvas).getByRole('button', { name: /status-badge, capability/ }));
  await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(3));
});

function gateView(nodes: ExecutionMapSnapshot['nodes'], events: { sequence: number; at: string }[] = []) {
  const altered = { ...map, nodes };
  const c = { ...client(), getExecutionMap: async () => altered } as ProtocolClient;
  render(<ExecutionMapArea client={c} planId="nested-provider-map" runId="run-scripted-map" version={42}
    events={events.map(event => ({ ...event, transition: 'gate-started', summary: 'Gate started', refs: [] }))} onOpenGate={vi.fn()} />);
  return screen.findByLabelText('Zoomable execution canvas');
}

test('a running readiness gate card says Running and for how long, Run-wide, with no kind label, round or audit', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse('2026-09-24T21:45:12.000Z') });
  try {
    const readiness = { key: 'gate:ga-0001', label: 'Readiness gate ga-0001', runVersion: 42, modules: [],
      sourceRefs: [{ kind: 'run-event' as const, id: 'ev-8', sequence: 8, revision: null }], kind: 'gate' as const, checkpoint: 'readiness' as const,
      verdict: null, audit: 'not-applicable' as const, repairRound: 0, commit: null, auditedCommit: null, active: true,
      subject: { workItem: null, iteration: null }, cause: null, evidencePresent: false };
    const canvas = await gateView([...map.nodes, readiness], [{ sequence: 8, at: '2026-09-24T21:43:40.000Z' }]);
    const card = within(canvas).getByRole('button', { name: /^Readiness gate ga-0001, gate/ });
    expect(card.querySelector('.execution-gate-mark')?.textContent).toBe('Running for 1m 32s');
    expect(within(card).getByText('Run-wide')).toBeTruthy();
    expect(card.textContent).not.toMatch(/\$|readiness ·|round|audit|^gate/i);
    expect([...card.querySelectorAll('small')].map(line => line.textContent)).toEqual(['Running for 1m 32s', 'Run-wide']);
  } finally { vi.useRealTimers(); }
});

test('a settled gate card names its verdict in words, and its repair round and audit only where they apply', async () => {
  const canvas = await gateView(map.nodes);
  const failed = within(canvas).getByRole('button', { name: /Status iteration gate, failed, gate/ });
  expect(failed.querySelector('.execution-gate-mark')?.textContent).toBe('Failed');
  expect(failed.textContent).toContain('Audit passed');
  expect(failed.textContent).not.toMatch(/round|\$|iteration ·/i);
  const repaired = within(canvas).getByRole('button', { name: /Status iteration gate, repaired, gate/ });
  expect(repaired.querySelector('.execution-gate-mark')?.textContent).toBe('Passed');
  expect(repaired.textContent).toContain('✗ → ✓ · Repair round 1 · Audit incomplete');
  // A gate of a work item names the work item's module.
  expect(within(repaired).getByText('project/ui')).toBeTruthy();
});

test('a missing module reads Run-wide only for run-wide elements, and Module not recorded otherwise, as for a gate whose work item has none', async () => {
  const gate = map.nodes.find(node => node.key === 'gate:ga-005')!;
  const work = map.nodes.find(node => node.key === 'work-item:wi-status')!;
  if (gate.kind !== 'gate' || work.kind !== 'work-item') throw new Error('fixture nodes missing');
  const canvas = await gateView(map.nodes.map(node => node.key === gate.key ? { ...gate, modules: [] }
    : node.key === work.key ? { ...work, module: null } : node));
  expect(within(within(canvas).getByRole('button', { name: /Status iteration gate, failed, gate/ })).getByText('Module not recorded')).toBeTruthy();
  expect(within(within(canvas).getByRole('button', { name: /^Implement status badge, work-item/ })).getByText('Module not recorded')).toBeTruthy();
  expect(within(within(canvas).getByRole('button', { name: /^Initial architect, session/ })).getByText('Run-wide')).toBeTruthy();
});

test('a drag that starts on a card pans the canvas: its buttons refuse a node drag, not a pan', async () => {
  view();
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  const main = within(canvas).getByRole('button', { name: /status-badge, capability/ });
  expect(main.classList.contains('nodrag')).toBe(true);
  expect(main.classList.contains('nopan')).toBe(false);
  expect(within(canvas).getByRole('button', { name: 'Collapse status-badge' }).classList.contains('nopan')).toBe(false);
});

const readiness = { key: 'gate:ga-0001', label: 'Readiness gate ga-0001', runVersion: 42, modules: [],
  sourceRefs: [{ kind: 'run-event' as const, id: 'ev-8', sequence: 8, revision: null }], kind: 'gate' as const, checkpoint: 'readiness' as const,
  verdict: null, audit: 'not-applicable' as const, repairRound: 0, commit: null, auditedCommit: null, active: true,
  subject: { workItem: null, iteration: null }, cause: null, evidencePresent: false };

test('the All gates list words each gate as its card does: verdict, module, repair round and audit only where they apply', async () => {
  await gateView([...map.nodes, readiness]);
  const rows = within(screen.getByLabelText('All gates')).getAllByRole('button').map(button => button.textContent);
  expect(rows).toEqual([
    'Status iteration gate, failed · Failed · project/ui · Audit passed',
    'Status iteration gate, repaired · Passed · project/ui · ✗ → ✓ · Repair round 1 · Audit incomplete',
    'Readiness gate ga-0001 · Running · Run-wide',
  ]);
  expect(rows.join('\n')).not.toMatch(/not-applicable|round 0|audit not/);
});

test('a capability card names its scenario results that occur, out of its scenarios, and says not run yet', async () => {
  const withScenarios = (key: string, scenarios: Partial<Record<'passed' | 'failed' | 'other' | 'noRealRun' | 'unavailable', number>>) => {
    const node = map.nodes.find(n => n.key === key);
    if (node?.kind !== 'capability') throw new Error('fixture capability missing');
    const counts = { passed: 0, failed: 0, other: 0, noRealRun: 0, unavailable: 0, ...scenarios };
    const known = Object.values(counts).reduce((a, b) => a + b, 0);
    return { ...node, scenarios: { coverage: { state: 'complete' as const, known, total: known }, ...counts } };
  };
  const canvas = await gateView(map.nodes.map(node => node.key === 'capability:status-badge' ? withScenarios(node.key, { noRealRun: 2 })
    : node.key === 'capability:accessible-tone' ? withScenarios(node.key, { passed: 3, failed: 1 }) : node));
  const summary = (name: RegExp) => within(canvas).getByRole('button', { name }).querySelector('.execution-scenario-summary')!;
  expect(summary(/^status-badge, capability/).textContent).toBe('2 of 2 not run yet');
  expect(summary(/^status-badge, capability/).getAttribute('aria-label')).toBe('Scenarios: 2 of 2 not run yet');
  expect(summary(/^accessible-tone, capability/).textContent).toBe('3 passed · 1 failed of 4');
  expect(summary(/^theme-tokens, capability/).textContent).toBe('No scenarios');
  expect(canvas.textContent).not.toMatch(/no real run|no-real-run|0 passed|0 unavailable/);
  // A scenario card words its result the same way.
  expect(within(canvas).getByRole('button', { name: /^Integration across modules, scenario/ }).textContent).toContain('not run yet · pending');
});

test('a capability card is titled by its id as registered, in code, with its behavior beneath', async () => {
  view();
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  const card = within(canvas).getByRole('button', { name: /^status-badge, capability/ });
  expect(card.querySelector('strong code')?.textContent).toBe('status-badge');
  expect(card.querySelector('.execution-capability-behavior')?.textContent).toBe('Shows the run\'s status as a badge.');
  fireEvent.click(card);
  expect((await screen.findByLabelText('Details for status-badge')).querySelector('h3 code')?.textContent).toBe('status-badge');
});

test('a running gate card and its detail name the command it is on', async () => {
  const running = { ...map, nodes: [...map.nodes, readiness], current: { awaitedSession: null, runningGate: readiness.key, source: readiness.sourceRefs[0]!,
    gateCommand: { kind: 'type-check' as const, position: 2, total: 4, source: { kind: 'run-event' as const, id: 'ev-9', sequence: 9, revision: null } } } };
  const c = { ...client(), getExecutionMap: async () => running } as ProtocolClient;
  render(<ExecutionMapArea client={c} planId="nested-provider-map" runId="run-scripted-map" version={42} events={[]} onOpenGate={vi.fn()} />);
  const canvas = await screen.findByLabelText('Zoomable execution canvas');
  const card = within(canvas).getByRole('button', { name: /^Readiness gate ga-0001, gate/ });
  expect([...card.querySelectorAll('small')].map(line => line.textContent)).toEqual(['Running', 'Type check (2 of 4)', 'Run-wide']);
  fireEvent.click(card);
  expect(await screen.findByText(/The gate is running: Type check \(2 of 4\); its full check result/)).toBeTruthy();
  // Only the running gate names a command.
  expect(canvas.querySelectorAll('.execution-gate-step')).toHaveLength(1);
});

test('a running gate on a setup command names it the build when the project named it build, and the setup otherwise', async () => {
  const onCommand = async (gateCommand: NonNullable<ExecutionMapSnapshot['current']['gateCommand']>) => {
    const running = { ...map, nodes: [...map.nodes, readiness], current: { awaitedSession: null, runningGate: readiness.key, source: readiness.sourceRefs[0]!, gateCommand } };
    const c = { ...client(), getExecutionMap: async () => running } as ProtocolClient;
    const rendered = render(<ExecutionMapArea client={c} planId="nested-provider-map" runId="run-scripted-map" version={42} events={[]} onOpenGate={vi.fn()} />);
    const canvas = await screen.findByLabelText('Zoomable execution canvas');
    const card = within(canvas).getByRole('button', { name: /^Readiness gate ga-0001, gate/ });
    const lines = [...card.querySelectorAll('small')].map(line => line.textContent);
    rendered.unmount();
    return lines;
  };
  const source = { kind: 'run-event' as const, id: 'ev-9', sequence: 9, revision: null };
  expect(await onCommand({ kind: 'setup', name: 'build', position: 1, total: 5, source })).toEqual(['Running', 'Build (1 of 5)', 'Run-wide']);
  expect(await onCommand({ kind: 'setup', name: 'generate schemas', position: 2, total: 5, source })).toEqual(['Running', 'Setup (2 of 5)', 'Run-wide']);
  expect(await onCommand({ kind: 'setup', position: 1, total: 4, source })).toEqual(['Running', 'Setup (1 of 4)', 'Run-wide']);
});

describe('the initial view', () => {
  const pane = (width: number, height: number) => {
    const spies = [vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width),
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)];
    return () => spies.forEach(spy => spy.mockRestore());
  };
  const open = async (snapshot: ExecutionMapSnapshot) => {
    const c = { ...client(), getExecutionMap: async () => snapshot } as ProtocolClient;
    const rendered = render(<ExecutionMapArea client={c} planId="nested-provider-map" runId="run-scripted-map" version={42} events={[]} onOpenGate={vi.fn()} />);
    await screen.findByLabelText('Zoomable execution canvas');
    await act(async () => {});
    return rendered;
  };

  test('fits the whole run when it fits at a readable zoom', async () => {
    const restore = pane(4000, 4000);
    try {
      await open(map);
      expect(flow.fitView).toHaveBeenCalledTimes(1);
      expect(flow.setCenter).not.toHaveBeenCalled();
    } finally { restore(); }
  });

  test('opens at a readable zoom on the active card when the whole run would be too small to read', async () => {
    const restore = pane(800, 400);
    try {
      await open(map);
      expect(flow.fitView).not.toHaveBeenCalled();
      expect(flow.setCenter).toHaveBeenCalledTimes(1);
      const at = document.querySelector('[data-node="session:ses-engineer"]')!.getAttribute('data-position')!.split(',').map(Number);
      expect(flow.setCenter).toHaveBeenCalledWith(at[0]! + 122, at[1]! + 50, { zoom: 0.8, duration: 0 });
      // It happens once: a version update, a measured card or a pan keeps the view.
      fireEvent.click(screen.getByRole('button', { name: 'Pan and zoom' }));
      await act(async () => {});
      expect(flow.setCenter).toHaveBeenCalledTimes(1);
    } finally { restore(); }
  });

  test('opens at a readable zoom on the top of the run when nothing is active', async () => {
    const restore = pane(800, 400);
    try {
      await open({ ...map, current: { awaitedSession: null, runningGate: null, source: null } });
      expect(flow.fitView).not.toHaveBeenCalled();
      expect(flow.setCenter).not.toHaveBeenCalled();
      expect(flow.setViewport).toHaveBeenCalledWith({ x: 24, y: 24, zoom: 0.8 }, { duration: 0 });
    } finally { restore(); }
  });
});

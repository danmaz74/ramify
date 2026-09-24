// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ProtocolClient } from '../client.js';
import type { ExecutionMapSnapshot } from '../execution-map-client.js';
import { ExecutionMapArea } from '../execution-map.js';
import { canvasMap, capabilityDetail, scenarioDetail } from './helpers/execution-map-canvas.js';

const flow = vi.hoisted(() => ({ setCenter: vi.fn(), fitView: vi.fn() }));
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    ReactFlow: ({ nodes, nodeTypes, viewport, onMove }: any) => React.createElement('div', {
      'aria-label': 'Mock execution flow', 'data-viewport': `${viewport.x},${viewport.y},${viewport.zoom}`,
    }, React.createElement('button', { onClick: () => onMove({}, { x: 10, y: 20, zoom: 1.4 }) }, 'Move execution'),
    nodes.map((node: any) => React.createElement('div', { key: node.id, 'data-node': node.id },
      React.createElement(nodeTypes.execution, { id: node.id, data: node.data })))),
    ReactFlowProvider: ({ children }: any) => children, Background: () => null, Controls: () => null, Handle: () => null,
    Position: { Left: 'left', Right: 'right' }, useReactFlow: () => flow,
  };
});
vi.mock('ramify.ts/module-tree', async () => {
  const React = await import('react');
  return { ModuleTreeCanvas: ({ nodes, selectedNodeId, highlightedNodeIds, ariaLabelOf, renderNodeBody, onSelectNode }: any) => {
    const [zoom, setZoom] = React.useState(1);
    return React.createElement('div', { role: 'tree', 'aria-label': 'Current modules hierarchy', 'data-zoom': zoom },
      React.createElement('button', { onClick: () => setZoom(1.8) }, 'Move modules'),
      nodes.map((node: any) => React.createElement('div', { key: node.id, role: 'treeitem', tabIndex: 0,
        'data-module-id': node.id, 'data-color': node.color, 'data-emphasis': node.emphasis,
        'data-highlighted': highlightedNodeIds.has(node.id), 'aria-selected': selectedNodeId === node.id,
        'aria-label': ariaLabelOf(node) + (highlightedNodeIds.has(node.id) ? ', highlighted' : ''),
        onClick: () => onSelectNode(node.id), onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter') onSelectNode(node.id); },
      }, renderNodeBody(node)))); } };
});

const line = (added: number, deleted: number, coverage: 'complete' | 'partial' | 'unavailable') => ({
  totals: { added, deleted, textPaths: added || deleted ? 1 : 0, invocationIds: added || deleted ? ['inv-1'] : [] },
  coverage, gaps: coverage === 'partial' ? ['One writer snapshot missing.'] : [], binary: { paths: 0, invocationIds: [] },
  methodLimit: 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const,
});
const source = canvasMap.nodes[0]!.sourceRefs[0]!;
const direct = (element: string, role: 'owner' | 'consumer' | 'provider') => ({ element, role, source });
const tree = { status: 'available' as const, revision: 'tree-r1', input: 'input-r1', modules: [
  { module: 'project', parent: null, dir: '' },
  { module: 'project/ui', parent: 'project', dir: 'subs/ui' },
  { module: 'project/theme', parent: 'project', dir: 'subs/theme' },
  { module: 'project/accessibility', parent: 'project', dir: 'subs/accessibility' },
] };
const moduleMap: ExecutionMapSnapshot['moduleMap'] = { tree, modules: [
  { ...tree.modules[0]!, direct: [], workedIn: false, involvedDescendants: 2, lines: line(0, 0, 'complete') },
  { ...tree.modules[1]!, direct: [direct('scenario:sc-status', 'owner'), direct('scenario:sc-status', 'consumer'), direct('work-item:wi-status', 'owner'),
    direct('requirement:req-status', 'consumer')], workedIn: true, involvedDescendants: 0, lines: line(10, 4, 'partial') },
  { ...tree.modules[2]!, direct: [direct('capability:theme-tokens', 'owner'), direct('requirement:req-status', 'provider')],
    workedIn: true, involvedDescendants: 0, lines: line(5, 2, 'complete') },
  { ...tree.modules[3]!, direct: [], workedIn: false, involvedDescendants: 0, lines: line(0, 0, 'unavailable') },
], outsideTree: [{ module: 'project/legacy', direct: [direct('gate:ga-005', 'owner')], workedIn: false,
  lines: line(0, 0, 'unavailable') }],
proposed: [{ module: 'project/proposed', parent: 'project', directory: 'subs/proposed', element: 'capability:theme-tokens' }],
unplaced: [{ element: 'work-item:wi-provider', reason: 'No current placement.' }],
unmapped: line(0, 0, 'unavailable'), lines: line(15, 6, 'partial') };
const map: ExecutionMapSnapshot = { ...canvasMap, tree, moduleMap,
  nodes: canvasMap.nodes.map(node => node.key === 'requirement:req-status' ? { ...node,
    modules: [{ module: 'project/ui', role: 'consumer' as const, source }, { module: 'project/theme', role: 'provider' as const, source }] } : node),
  coverage: { ...canvasMap.coverage, modules: { shown: 6, total: 6 }, moduleRelations: { shown: 6, total: 6 } } };
function client(snapshot: ExecutionMapSnapshot = map): ProtocolClient { return { getExecutionMap: async () => snapshot,
  getExecutionCapability: async () => capabilityDetail, getExecutionScenario: async () => scenarioDetail,
  getGate: async () => ({ commit: null, audited: null, evidence: null, commands: [] }),
} as unknown as ProtocolClient; }
function view(snapshot: ExecutionMapSnapshot = map) { render(<ExecutionMapArea client={client(snapshot)} planId="p" runId="r" version={42} events={[]} onOpenGate={vi.fn()} />); }
afterEach(() => { cleanup(); flow.setCenter.mockClear(); flow.fitView.mockClear(); });

test('companion hierarchy keeps neutral parent, direct violet participation, coverage and exceptions', async () => {
  view();
  const modules = await screen.findByRole('tree', { name: 'Current modules hierarchy' });
  const root = within(modules).getByRole('treeitem', { name: /project, current module, no direct work, 2 involved descendants/ });
  expect(root.getAttribute('data-color')).toBe('#94a3b8');
  const ui = within(modules).getByRole('treeitem', { name: /project\/ui, current module, worked in directly/ });
  expect(ui.getAttribute('data-color')).toBe('#6d28d9');
  expect(ui.textContent).toContain('Captured writer changes: +10 / −4 · partial subtotal');
  expect(ui.querySelector('.execution-module-lines-partial')).toBeTruthy();
  expect(ui.querySelector('.execution-line-positive b')?.getAttribute('style')).toContain('100%');
  expect(within(modules).getByRole('treeitem', { name: /project\/theme/ }).querySelector('.execution-line-positive b')?.getAttribute('style')).toContain('50%');
  const unavailable = within(modules).getByRole('treeitem', { name: /project\/accessibility/ });
  expect(unavailable.textContent).toContain('Captured writer changes unavailable');
  expect(unavailable.querySelector('.execution-line-bars')).toBeNull();
  expect(within(modules).getByRole('treeitem', { name: /project\/proposed, proposed module/ }).getAttribute('data-emphasis')).toBe('provisional');
  fireEvent.click(ui);
  const detail = screen.getByLabelText('Details for module project/ui');
  expect(detail.textContent).toContain('project/ui');
  expect(detail.textContent).toContain('One writer snapshot missing.');
  expect(screen.getByLabelText('Unplaced work').textContent).toContain('work-item:wi-provider');
});

test('main selection highlights several modules; module selection counts hidden canonical matches and reveals one', async () => {
  view();
  const execution = await screen.findByLabelText('Zoomable execution canvas');
  const modules = screen.getByRole('tree', { name: 'Current modules hierarchy' });
  fireEvent.click(within(execution).getByRole('button', { name: /Status requires theme tokens, requirement/ }));
  expect(within(modules).getByRole('treeitem', { name: /project\/ui.*highlighted/ }).getAttribute('data-highlighted')).toBe('true');
  expect(within(modules).getByRole('treeitem', { name: /project\/theme.*highlighted/ }).getAttribute('data-highlighted')).toBe('true');
  fireEvent.click(within(execution).getByRole('button', { name: 'Collapse Status badge' }));
  fireEvent.keyDown(within(modules).getByRole('treeitem', { name: /project\/ui/ }), { key: 'Enter' });
  expect(within(execution).getByRole('button', { name: 'Expand Status badge, 3 matches inside' }).textContent).toContain('3 matches inside');
  const detail = screen.getByLabelText('Details for module project/ui');
  expect(detail.textContent).toContain('3 directly related execution nodes; 3 hidden in collapsed branches');
  fireEvent.click(within(detail).getByRole('button', { name: /Renders the status badge.*hidden; reveal/ }));
  expect(within(execution).getByRole('button', { name: /Renders the status badge, scenario/ })).toBeTruthy();
  expect(screen.queryByLabelText('Details for module project/ui')).toBeNull();
  await waitFor(() => expect(flow.setCenter).toHaveBeenCalled());
});

test('the two maps keep independent pan and zoom state and expose a narrow drawer control', async () => {
  view();
  const execution = await screen.findByLabelText('Zoomable execution canvas');
  const modules = screen.getByRole('tree', { name: 'Current modules hierarchy' });
  fireEvent.click(within(execution).getByRole('button', { name: 'Move execution' }));
  expect(within(execution).getByLabelText('Mock execution flow').getAttribute('data-viewport')).toBe('10,20,1.4');
  expect(modules.getAttribute('data-zoom')).toBe('1');
  fireEvent.click(within(modules).getByRole('button', { name: 'Move modules' }));
  expect(modules.getAttribute('data-zoom')).toBe('1.8');
  expect(within(execution).getByLabelText('Mock execution flow').getAttribute('data-viewport')).toBe('10,20,1.4');
  const toggle = screen.getByRole('button', { name: 'Open modules' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Close modules' }).getAttribute('aria-expanded')).toBe('true');
});

test('unavailable current tree stays explicit without false line zeroes or a fabricated hierarchy', async () => {
  view({ ...canvasMap, moduleMap: { ...canvasMap.moduleMap,
    proposed: [{ module: 'project/proposed', parent: 'project', directory: 'subs/proposed', element: 'capability:theme-tokens' }] } });
  expect((await screen.findByRole('status')).textContent).toContain('Current module tree unavailable: No current tree.');
  expect(screen.queryByRole('tree', { name: 'Current modules hierarchy' })).toBeNull();
  expect(screen.getByLabelText('Proposed modules').textContent).toContain('project/proposed');
  const area = screen.getByLabelText('Companion modules map');
  expect(area.textContent).not.toContain('+0 / −0');
});

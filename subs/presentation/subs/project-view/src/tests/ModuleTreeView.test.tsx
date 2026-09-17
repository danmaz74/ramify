/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModuleTreeView, type ModuleTreeViewProps } from '../ModuleTreeView.js';
import type { ExplorerModule } from '../interfaces/project-view.js';
import { PROJECT_NODE_ID } from '../module-tree.js';
import { createTreeFixture } from './module-tree-fixture.js';

const flowProps: Array<Record<string, any>> = [];

vi.mock('@xyflow/react', () => {
  function ReactFlow(props: Record<string, any>) {
    flowProps.push(props);
    return (
      <div data-testid="mock-reactflow">
        <button type="button" data-testid="mock-pane" onClick={() => props.onPaneClick?.()}>pane</button>
        {(props.nodes ?? []).map((node: Record<string, any>) => {
          const View = props.nodeTypes[node.type];
          return (
            <div key={node.id} data-testid={`node-${node.id}`}
              onClick={event => props.onNodeClick?.(event, node)}
              onDoubleClick={event => props.onNodeDoubleClick?.(event, node)}>
              <View id={node.id} data={node.data} />
            </div>
          );
        })}
        {props.children}
      </div>
    );
  }
  return {
    ReactFlow,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    BackgroundVariant: { Dots: 'dots' },
  };
});

beforeEach(() => { flowProps.length = 0; });
afterEach(cleanup);

describe('ModuleTreeView', () => {
  it('MT02 lays out the root at the top with one edge per visible parent-child pair', () => {
    render(<ModuleTreeView {...props()} />);
    const { nodes, edges } = lastFlow();
    const byId = new Map<string, Record<string, any>>(nodes.map((node: Record<string, any>) => [node.id, node]));
    expect(nodes).toHaveLength(17);
    expect(nodes[0].id).toBe('app');
    for (const node of nodes) {
      const parent = (node.data.module as ExplorerModule).parent;
      if (parent) expect(node.position.y).toBeGreaterThan(byId.get(parent)!.position.y);
    }
    expect(edges).toHaveLength(16);
    expect(edges.every((edge: Record<string, any>) => edge.type === 'treeElbow'
      && byId.get(edge.target)!.data.module.parent === edge.source)).toBe(true);
    expect(edges.some((edge: Record<string, any>) => edge.source === 'app/ui' && edge.target === 'app/core')).toBe(false);
  });

  it('MT03 shows name, class, counts and markers on a node', () => {
    render(<ModuleTreeView {...props()} />);
    const ui = within(screen.getByTestId('node-app/ui'));
    expect(ui.getByText('ui')).toBeInTheDocument();
    expect(ui.getByText('Browser + Ui')).toBeInTheDocument();
    expect(ui.getByText('5 files · 12 subs')).toBeInTheDocument();
    expect(ui.getByTitle('Denied accesses')).toHaveTextContent('2');
    expect(within(screen.getByTestId('node-app/core')).getByTitle('Coverage notes')).toBeInTheDocument();
    expect(within(screen.getByTestId('node-app/core/store')).getByText('no README')).toBeInTheDocument();
    expect(within(screen.getByTestId('node-app/core/model')).queryByText('no README')).toBeNull();
  });

  it('MT04 toggles collapse without selecting, and shows hidden counts', () => {
    const onToggleCollapsed = vi.fn();
    const onSelectModule = vi.fn();
    const { rerender } = render(<ModuleTreeView {...props({ onToggleCollapsed, onSelectModule })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse ui' }));
    expect(onToggleCollapsed).toHaveBeenCalledWith('app/ui');
    expect(onSelectModule).not.toHaveBeenCalled();
    rerender(<ModuleTreeView {...props({ onToggleCollapsed, onSelectModule, selectedModuleId: 'app/ui',
      collapsedModuleIds: new Set(['app/ui']) })} />);
    expect(screen.getByRole('button', { name: 'Expand ui' })).toHaveTextContent('+12');
    expect(lastFlow().nodes).toHaveLength(5);
    expect(screen.getByTestId('module-tree-detail')).toHaveTextContent('ui');
  });

  it('MT04 selects on node click, clears on pane click and supports the keyboard', () => {
    const onSelectModule = vi.fn();
    const onToggleCollapsed = vi.fn();
    const onOpenModule = vi.fn();
    render(<ModuleTreeView {...props({ onSelectModule, onToggleCollapsed, onOpenModule,
      collapsedModuleIds: new Set(['app/ui']) })} />);
    fireEvent.click(screen.getByTestId('node-app/core'));
    expect(onSelectModule).toHaveBeenLastCalledWith('app/core');
    fireEvent.click(screen.getByTestId('mock-pane'));
    expect(onSelectModule).toHaveBeenLastCalledWith(null);
    const core = screen.getByRole('treeitem', { name: 'core' });
    fireEvent.keyDown(core, { key: 'Enter' });
    expect(onSelectModule).toHaveBeenLastCalledWith('app/core');
    fireEvent.keyDown(core, { key: 'ArrowLeft' });
    expect(onToggleCollapsed).toHaveBeenLastCalledWith('app/core');
    fireEvent.keyDown(core, { key: 'ArrowRight' });
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'ui' }), { key: 'ArrowRight' });
    expect(onToggleCollapsed).toHaveBeenLastCalledWith('app/ui');
    fireEvent.keyDown(core, { key: 'o' });
    expect(onOpenModule).toHaveBeenCalledWith('app/core');
  });

  it('MT04 header buttons expand all and collapse to depth 1', () => {
    const onExpandAll = vi.fn();
    const onCollapseToDepth = vi.fn();
    render(<ModuleTreeView {...props({ onExpandAll, onCollapseToDepth })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse to depth 1' }));
    expect(onExpandAll).toHaveBeenCalledOnce();
    expect(onCollapseToDepth).toHaveBeenCalledWith(1);
  });

  it('MT05 shows every detail section for a selected module', () => {
    render(<ModuleTreeView {...props({ selectedModuleId: 'app/core' })} />);
    const detail = within(screen.getByTestId('module-tree-detail'));
    expect(detail.getByRole('heading', { name: 'core' })).toBeInTheDocument();
    expect(detail.getByText('subs/core')).toBeInTheDocument();
    expect(detail.getByText('The core module.')).toBeInTheDocument();
    for (const section of ['Structure', 'Files', 'Imports', 'Exports', 'Coverage notes']) {
      expect(detail.getByRole('button', { name: new RegExp(`^.${section}`) })).toBeInTheDocument();
    }
    expect(detail.getByText('Subtree modules').previousSibling).toHaveTextContent('2');
    expect(detail.getByText('Tests').previousSibling).toHaveTextContent('1');
    expect(detail.getByText('Resources').previousSibling).toHaveTextContent('1');
    expect(detail.getByText('To parent (1)')).toBeInTheDocument();
    expect(detail.getByText('To descendants (1)')).toBeInTheDocument();
    expect(detail.getByText('Not exposed (1)')).toBeInTheDocument();
    expect(detail.getByText('forwarded')).toBeInTheDocument();
    expect(detail.getByText('Used by')).toBeInTheDocument();
    expect(detail.getByText('denied')).toBeInTheDocument();
    expect(detail.getByText(/unresolved-original/)).toBeInTheDocument();
  });

  it('MT05 states a missing purpose and shows the summary without a selection', () => {
    const { rerender } = render(<ModuleTreeView {...props({ selectedModuleId: 'app/core/store' })} />);
    expect(screen.getByText('No README purpose (missing-file): subs/core/subs/store/README.md')).toBeInTheDocument();
    rerender(<ModuleTreeView {...props()} />);
    expect(screen.getByRole('heading', { name: 'Project summary' })).toBeInTheDocument();
    expect(screen.getByText('Modules').previousSibling).toHaveTextContent('17');
    expect(screen.getByText('Coverage notes').previousSibling).toHaveTextContent('1');
  });

  it('MT05 a clicked dependency selects it and expands its collapsed ancestors', () => {
    const onSelectModule = vi.fn();
    const onToggleCollapsed = vi.fn();
    render(<ModuleTreeView {...props({ selectedModuleId: 'app/ui', onSelectModule, onToggleCollapsed,
      collapsedModuleIds: new Set(['app', 'app/core']) })} />);
    fireEvent.click(within(screen.getByTestId('module-tree-detail')).getByRole('button', { name: 'core' }));
    expect(onToggleCollapsed).toHaveBeenCalledWith('app');
    expect(onToggleCollapsed).not.toHaveBeenCalledWith('app/core');
    expect(onSelectModule).toHaveBeenLastCalledWith('app/core');
  });

  it('MT06 double-click and the panel link open the module', () => {
    const onOpenModule = vi.fn();
    render(<ModuleTreeView {...props({ selectedModuleId: 'app/core/model', onOpenModule })} />);
    fireEvent.doubleClick(screen.getByTestId('node-app/core/model'));
    expect(onOpenModule).toHaveBeenLastCalledWith('app/core/model');
    fireEvent.click(screen.getByRole('button', { name: 'Open in import explorer' }));
    expect(onOpenModule).toHaveBeenCalledTimes(2);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Collapse core' }));
    expect(onOpenModule).toHaveBeenCalledTimes(2);
  });

  it('MT06 the synthetic project node neither selects nor opens', () => {
    const onOpenModule = vi.fn();
    const onSelectModule = vi.fn();
    const model = createTreeFixture();
    const forest = { ...model, modules: model.modules.filter(module => module.parent === 'app/core')
      .map(module => ({ ...module, parent: null })) };
    render(<ModuleTreeView {...props({ data: forest, onOpenModule, onSelectModule })} />);
    fireEvent.doubleClick(screen.getByTestId(`node-${PROJECT_NODE_ID}`));
    fireEvent.click(screen.getByTestId(`node-${PROJECT_NODE_ID}`));
    expect(onOpenModule).not.toHaveBeenCalled();
    expect(onSelectModule).not.toHaveBeenCalled();
  });

  it('renders loading, unavailable, empty, stale and notice states', () => {
    const { rerender } = render(<ModuleTreeView {...props({ isLoading: true })} />);
    expect(screen.getByText('Loading module tree...')).toBeInTheDocument();
    rerender(<ModuleTreeView {...props({ unavailableReason: 'no report' })} />);
    expect(screen.getByText('no report')).toBeInTheDocument();
    rerender(<ModuleTreeView {...props({ data: { ...createTreeFixture(), modules: [] } })} />);
    expect(screen.getByText('No modules found')).toBeInTheDocument();
    rerender(<ModuleTreeView {...props({ isStale: true, notice: 'Reconnecting to the daemon' })} />);
    expect(screen.getByRole('button', { name: 'Refresh (stale)' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting to the daemon');
    expect(screen.getByText('17 modules, depth 2')).toBeInTheDocument();
  });
});

function lastFlow(): Record<string, any> {
  return flowProps[flowProps.length - 1]!;
}

function props(overrides: Partial<ModuleTreeViewProps> = {}): ModuleTreeViewProps {
  return {
    data: createTreeFixture(),
    isLoading: false,
    error: null,
    unavailableReason: null,
    isStale: false,
    notice: null,
    selectedModuleId: null,
    collapsedModuleIds: new Set(),
    onSelectModule: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onExpandAll: vi.fn(),
    onCollapseToDepth: vi.fn(),
    onOpenModule: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

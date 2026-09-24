/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  ModuleTreeCanvas,
  type ModuleTreeCanvasNode,
  type ModuleTreeCanvasProps,
} from '../ModuleTreeCanvas.js';
import { indexHierarchy, layoutModuleTree, PROJECT_NODE_ID, TREE_NODE_HEIGHT, TREE_NODE_WIDTH } from '../module-tree.js';

const flowProps: Array<Record<string, any>> = [];
const instance = vi.hoisted(() => ({
  fitView: vi.fn(async () => true),
  setCenter: vi.fn(async () => true),
  getZoom: vi.fn(() => 0.25),
  // A recognisable mapping, so a centre asserted below is the focused box's own centre.
  screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x: x * 2, y: y * 3 })),
}));

vi.mock('@xyflow/react', async () => {
  const { useEffect } = await import('react');
  function ReactFlow(props: Record<string, any>) {
    flowProps.push(props);
    useEffect(() => { props.onInit?.(instance); }, []);
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
  function MiniMap(props: Record<string, any>) {
    const NodeComponent = props.nodeComponent;
    const nodes: Record<string, any>[] = flowProps[flowProps.length - 1]?.nodes ?? [];
    return (
      <svg data-testid="mock-minimap">
        {nodes.map(node => <NodeComponent key={node.id} id={node.id} x={node.position.x} y={node.position.y}
          width={node.initialWidth} height={node.initialHeight} borderRadius={5} className=""
          shapeRendering="crispEdges" selected={false} color={props.nodeColor(node)} />)}
      </svg>
    );
  }
  return {
    ReactFlow,
    MiniMap,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    BackgroundVariant: { Dots: 'dots' },
  };
});

beforeEach(() => {
  flowProps.length = 0;
  instance.fitView.mockClear();
  instance.setCenter.mockClear();
  instance.getZoom.mockClear();
  instance.screenToFlowPosition.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Plan 6C's MT07 budget: at most 25 ms median of 20 layouts of 500 modules. */
const MT07_BUDGET_MS = 25;
/** MT07's median measured before the extraction, recorded in the iteration results. */
const MT07_BASELINE_MEDIAN_MS = 4.5;

describe('ModuleTreeCanvas layout', () => {
  it('uses every supplied size: a depth row starts below the tallest node of the row above', () => {
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes() })} />);
    const nodes = flowNodes();
    for (const item of mixedNodes()) {
      expect(nodes.get(item.id)).toMatchObject({ initialWidth: item.width, initialHeight: item.height });
      expect(screen.getByRole('treeitem', { name: item.name })).toHaveStyle({ width: `${item.width}px`, height: `${item.height}px` });
    }
    const top = (id: string) => nodes.get(id)!.position.y as number;
    expect(top('a')).toBe(top('b'));
    expect(top('a1')).toBeGreaterThanOrEqual(top('a') + 300);
    expect(top('a1')).toBe(top('b1'));
  });

  it('places no two nodes over each other and centres each parent over its visible children', () => {
    const items = seededTree(60, 4, 7, 180);
    const layout = layoutModuleTree(indexHierarchy(items), new Set(), id => items.find(item => item.id === id)!);
    for (let left = 0; left < layout.nodes.length; left += 1) {
      for (let right = left + 1; right < layout.nodes.length; right += 1) {
        const a = layout.nodes[left]!;
        const b = layout.nodes[right]!;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
    const byId = new Map(layout.nodes.map(node => [node.id, node]));
    for (const item of items) {
      const children = layout.nodes.filter(node => items.find(entry => entry.id === node.id)!.parent === item.id);
      if (children.length === 0) continue;
      const parent = byId.get(item.id)!;
      const first = children[0]!;
      const last = children[children.length - 1]!;
      const span = last.x + last.width - first.x;
      if (span < parent.width) continue;
      const centre = (first.x + first.width / 2 + last.x + last.width / 2) / 2;
      expect(Math.abs(parent.x + parent.width / 2 - centre)).toBeLessThanOrEqual(0.5);
    }
  });

  it('ends every edge on the boundaries of its parent and child', () => {
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes() })} />);
    const nodes = flowNodes();
    const edges: Record<string, any>[] = lastFlow().edges;
    expect(edges).toHaveLength(5);
    for (const edge of edges) {
      const parent = nodes.get(edge.source)!;
      const child = nodes.get(edge.target)!;
      const points = edge.data.points;
      expect(edge.type).toBe('treeElbow');
      expect(points[0]).toEqual({ x: parent.position.x + parent.initialWidth / 2, y: parent.position.y + parent.initialHeight });
      expect(points[points.length - 1]).toEqual({ x: child.position.x + child.initialWidth / 2, y: child.position.y });
    }
  });

  it('parents several roots with the project node, which neither selects nor opens', () => {
    const onSelectNode = vi.fn();
    const onOpenNode = vi.fn();
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, onOpenNode })} />);
    expect(lastFlow().nodes.map((node: Record<string, any>) => node.id)).toEqual(
      [PROJECT_NODE_ID, 'a', 'a1', 'a2', 'b', 'b1']);
    expect(flowNodes().get(PROJECT_NODE_ID)).toMatchObject({ initialWidth: TREE_NODE_WIDTH, initialHeight: TREE_NODE_HEIGHT,
      selectable: false });
    expect(lastFlow().edges.filter((edge: Record<string, any>) => edge.source === PROJECT_NODE_ID)).toHaveLength(2);
    fireEvent.click(screen.getByTestId(`node-${PROJECT_NODE_ID}`));
    fireEvent.doubleClick(screen.getByTestId(`node-${PROJECT_NODE_ID}`));
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onOpenNode).not.toHaveBeenCalled();
  });

  it('keeps a single parentless node as the root', () => {
    const items = mixedNodes().filter(item => item.id === 'a' || item.id === 'a1');
    render(<ModuleTreeCanvas {...props({ nodes: items, rootNodeId: 'a' })} />);
    expect(lastFlow().nodes.map((node: Record<string, any>) => node.id)).toEqual(['a', 'a1']);
  });

  it('lays out 500 nodes at 184 by 64 within MT07, and 500 mixed-height nodes within twice that', () => {
    const fixed = seededTree(500, 6, 0, 0).map(item => ({ ...item, width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT }));
    const mixed = seededTree(500, 6, 20260921, 2000);
    expect(new Set(mixed.map(item => item.height)).size).toBeGreaterThan(100);
    expect(Math.min(...mixed.map(item => item.height))).toBeGreaterThanOrEqual(64);
    expect(Math.max(...mixed.map(item => item.height))).toBeLessThanOrEqual(2000);
    const fixedMedian = medianLayoutMs(fixed);
    const mixedMedian = medianLayoutMs(mixed);
    expect(fixedMedian).toBeLessThanOrEqual(MT07_BUDGET_MS);
    expect(mixedMedian).toBeLessThanOrEqual(2 * Math.max(fixedMedian, MT07_BASELINE_MEDIAN_MS));
  });
});

describe('ModuleTreeCanvas interaction', () => {
  it('shows hidden-descendant counts on collapse controls and toggles without selecting', () => {
    const onToggleCollapsed = vi.fn();
    const onSelectNode = vi.fn();
    const { rerender } = render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onToggleCollapsed, onSelectNode })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));
    expect(onToggleCollapsed).toHaveBeenCalledWith('a');
    expect(onSelectNode).not.toHaveBeenCalled();
    rerender(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onToggleCollapsed, onSelectNode,
      collapsedNodeIds: new Set(['a']) })} />);
    expect(screen.getByRole('button', { name: 'Expand Alpha' })).toHaveTextContent('+2');
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).toHaveAttribute('aria-expanded', 'false');
    expect(lastFlow().nodes.map((node: Record<string, any>) => node.id)).not.toContain('a1');
    expect(screen.queryByRole('button', { name: /Collapse B1/ })).toBeNull();
  });

  it('renders normal, muted and provisional shells with distinct classes and non-color cues', () => {
    const nodes = mixedNodes().map(item => item.id === 'a1' ? { ...item, emphasis: 'muted' as const }
      : item.id === 'b' ? { ...item, emphasis: 'provisional' as const } : item);
    render(<ModuleTreeCanvas {...props({ nodes })} />);
    const shell = (name: string) => screen.getByRole('treeitem', { name });
    expect(shell('Alpha')).toHaveAttribute('data-emphasis', 'normal');
    expect(shell('Alpha').className).toBe('module-tree__node');
    expect(shell('A1')).toHaveClass('module-tree__node', 'module-tree__node--muted');
    expect(shell('A1')).toHaveAttribute('data-emphasis', 'muted');
    expect(shell('Beta')).toHaveClass('module-tree__node', 'module-tree__node--provisional');
    const css = readFileSync(sibling('module-tree-canvas.css'), 'utf8');
    expect(rule(css, '.module-tree__node--muted')).toMatch(/opacity:\s*0\.\d+/);
    expect(rule(css, '.module-tree__node--muted')).toMatch(/box-shadow:\s*none/);
    expect(rule(css, '.module-tree__node--provisional')).toMatch(/border-style:\s*dashed/);
  });

  it('body controls neither select, open nor toggle, by click or key, and cannot drag or pan', () => {
    const onSelectNode = vi.fn();
    const onOpenNode = vi.fn();
    const onToggleCollapsed = vi.fn();
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, onOpenNode, onToggleCollapsed,
      renderNodeBody: controlBody })} />);
    const node = within(screen.getByTestId('node-a'));
    const controls = [node.getByRole('button', { name: 'row Alpha' }), node.getByRole('link', { name: 'link Alpha' }),
      node.getByRole('textbox'), node.getByRole('button', { name: 'role Alpha' }), node.getByText('focusable Alpha'),
      node.getByText('inside Alpha')];
    for (const control of controls) {
      const target = control.closest('button, a, input, [role="button"], [tabindex]')!;
      expect(target).toHaveClass('nodrag', 'nopan');
      fireEvent.click(control);
      fireEvent.doubleClick(control);
      for (const key of ['Enter', 'ArrowLeft', 'ArrowRight', 'o']) fireEvent.keyDown(control, { key });
    }
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onOpenNode).not.toHaveBeenCalled();
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveClass('nodrag');
    fireEvent.click(node.getByText('text Alpha'));
    expect(onSelectNode).toHaveBeenLastCalledWith('a');
  });

  it('marks a body control that a later render replaced, when a pointer goes down on it', () => {
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), renderNodeBody: controlBody })} />);
    const button = within(screen.getByTestId('node-a')).getByRole('button', { name: 'row Alpha' });
    button.className = 'row';
    fireEvent.mouseDown(button);
    expect(button).toHaveClass('row', 'nodrag', 'nopan');
  });

  it('orders focus as the shell, its body controls, then its collapse control', () => {
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), renderNodeBody: controlBody })} />);
    expect(lastFlow().nodes.every((node: Record<string, any>) => node.focusable === false)).toBe(true);
    const wrapper = screen.getByTestId('node-a');
    const focusable = [...wrapper.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]')]
      .filter(element => element.tabIndex >= 0);
    const shell = screen.getByRole('treeitem', { name: 'Alpha' });
    expect(focusable[0]).toBe(shell);
    expect(focusable.slice(1, -1).map(element => element.textContent || element.tagName)).toEqual(
      ['row Alpha', 'link Alpha', 'INPUT', 'role Alpha', 'focusable Alpha', 'inside Alpha']);
    expect(focusable[focusable.length - 1]).toBe(within(wrapper).getByRole('button', { name: 'Collapse Alpha' }));
  });

  it('selects by shell click, marks the selected shell and clears on a pane click', () => {
    const onSelectNode = vi.fn();
    const { rerender } = render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode })} />);
    fireEvent.click(screen.getByRole('treeitem', { name: 'B1' }));
    expect(onSelectNode).toHaveBeenLastCalledWith('b1');
    fireEvent.click(screen.getByTestId('mock-pane'));
    expect(onSelectNode).toHaveBeenLastCalledWith(null);
    rerender(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, selectedNodeId: 'b1' })} />);
    expect(screen.getByRole('treeitem', { name: 'B1' })).toHaveClass('module-tree__node--selected');
    expect(screen.getByRole('treeitem', { name: 'B1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'false');
  });

  it('supports several accessible highlights without changing the primary selection', () => {
    const { rerender } = render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), selectedNodeId: 'a',
      highlightedNodeIds: new Set(['b', 'b1']) })} />);
    for (const id of ['b', 'b1']) {
      const shell = document.querySelector(`[data-module-id="${id}"]`)!;
      expect(shell).toHaveClass('module-tree__node--highlighted');
      expect(shell).toHaveAttribute('aria-label', expect.stringContaining('highlighted'));
      expect(shell).toHaveAttribute('aria-selected', 'false');
    }
    expect(document.querySelector('[data-module-id="a"]')).toHaveAttribute('aria-selected', 'true');
    rerender(<ModuleTreeCanvas {...props({ nodes: mixedNodes() })} />);
    expect(document.querySelectorAll('.module-tree__node--highlighted')).toHaveLength(0);
    expect(screen.getByRole('treeitem', { name: 'B1' })).toHaveAttribute('aria-selected', 'false');
  });

  it('leaves Enter and the other shell keys on a focused collapse control to the control', () => {
    const onSelectNode = vi.fn();
    const onToggleCollapsed = vi.fn();
    const onOpenNode = vi.fn();
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, onToggleCollapsed, onOpenNode })} />);
    const toggle = screen.getByRole('button', { name: 'Collapse Alpha' });
    // Not prevented, so the browser turns Enter into the control's own click.
    for (const key of ['Enter', 'ArrowLeft', 'ArrowRight', 'o']) expect(fireEvent.keyDown(toggle, { key })).toBe(true);
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    expect(onOpenNode).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('pans to a keyboard-focused element outside the viewport, at the current zoom, and stops fitting', () => {
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { observers.push(callback); }
      observe() {}
      disconnect() {}
    });
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), renderNodeBody: controlBody })} />);
    expect(instance.fitView).toHaveBeenCalledTimes(1);
    stubRect(screen.getByRole('tree', { name: 'Test tree' }), { left: 0, top: 0, width: 400, height: 300 });
    // A row low in the tall B1 node: its own box lies outside the viewport, where its node starts inside it.
    const row = within(screen.getByTestId('node-b1')).getByRole('button', { name: 'row B1' });
    stubRect(row, { left: 120, top: 900, width: 160, height: 20 });
    stubFocusRing(row, true);
    row.focus();
    expect(instance.setCenter).toHaveBeenCalledTimes(1);
    // The focused element's own centre, at the zoom the viewer is already looking at.
    expect(instance.setCenter).toHaveBeenCalledWith(200 * 2, 910 * 3, { zoom: 0.25 });
    expect(instance.setCenter).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), { zoom: 1 });
    // A focus pan is a viewer move: the canvas stops fitting itself afterwards.
    act(() => { for (const observer of observers) observer([], {} as ResizeObserver); });
    expect(instance.fitView).toHaveBeenCalledTimes(1);
    // A shell the viewer tabs to, off to the right of the viewport, is centred the same way.
    const shell = screen.getByRole('treeitem', { name: 'Beta' });
    stubRect(shell, { left: 500, top: 40, width: 220, height: 90 });
    stubFocusRing(shell, true);
    shell.focus();
    expect(instance.setCenter).toHaveBeenLastCalledWith(610 * 2, 85 * 3, { zoom: 0.25 });
    expect(instance.setCenter).toHaveBeenCalledTimes(2);
    // Already within the viewport: nothing moves.
    const inside = within(screen.getByTestId('node-a')).getByRole('button', { name: 'row Alpha' });
    stubRect(inside, { left: 10, top: 20, width: 100, height: 20 });
    stubFocusRing(inside, true);
    inside.focus();
    expect(instance.setCenter).toHaveBeenCalledTimes(2);
    // Focus without a ring, as a pointer leaves it: outside the viewport, and still nothing moves.
    const pointed = within(screen.getByTestId('node-b1')).getByRole('link', { name: 'link B1' });
    stubRect(pointed, { left: 900, top: 900, width: 80, height: 20 });
    stubFocusRing(pointed, false);
    pointed.focus();
    expect(instance.setCenter).toHaveBeenCalledTimes(2);
  });

  // Found by the browser evidence of Plan 8 iteration 5: Chromium scrolls React Flow's own
  // element to reveal the focused row, and React Flow resets that scroll a moment later. The
  // canvas read the revealed box, decided the row was already in view, and never panned.
  it('undoes the scroll a browser applies to reveal the focused element, then pans to it', () => {
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), renderNodeBody: controlBody })} />);
    stubRect(screen.getByRole('tree', { name: 'Test tree' }), { left: 0, top: 0, width: 400, height: 300 });
    const row = within(screen.getByTestId('node-b1')).getByRole('button', { name: 'row B1' });
    // The browser has scrolled an ancestor between the row and the canvas viewport, as
    // Chromium scrolls React Flow's own element.
    const scrolled = screen.getByTestId('mock-reactflow');
    stubScroll(scrolled, { top: 800, left: 60 });
    // Where the row is drawn once that scroll is undone, and where the browser briefly put it.
    stubRect(row, () => scrolled.scrollTop === 0 && scrolled.scrollLeft === 0
      ? { left: 120, top: 900, width: 160, height: 20 }
      : { left: 60, top: 100, width: 160, height: 20 });
    stubFocusRing(row, true);
    row.focus();
    expect([scrolled.scrollTop, scrolled.scrollLeft]).toEqual([0, 0]);
    expect(instance.setCenter).toHaveBeenCalledTimes(1);
    expect(instance.setCenter).toHaveBeenCalledWith(200 * 2, 910 * 3, { zoom: 0.25 });
  });

  it('keeps Space on a body control off React Flow\'s pan-activation key, and leaves the shell\'s Space alone', () => {
    const panKey = vi.fn();
    document.addEventListener('keydown', panKey);
    const controlKey = vi.fn();
    const body = (node: ModuleTreeCanvasNode) => (
      <button type="button" onKeyDown={controlKey} onKeyUp={controlKey}>row {node.name}</button>
    );
    try {
      const onSelectNode = vi.fn();
      render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, renderNodeBody: body })} />);
      const control = within(screen.getByTestId('node-a')).getByRole('button', { name: 'row Alpha' });
      // Not prevented, so the browser still turns the control's Space into its own click.
      expect(fireEvent.keyDown(control, { key: ' ', code: 'Space' })).toBe(true);
      expect(fireEvent.keyUp(control, { key: ' ', code: 'Space' })).toBe(true);
      expect(controlKey).toHaveBeenCalledTimes(2);
      expect(panKey).not.toHaveBeenCalled();
      expect(onSelectNode).not.toHaveBeenCalled();
      // The shell and the pane keep their Space behavior.
      fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Alpha' }), { key: ' ', code: 'Space' });
      expect(panKey).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(screen.getByTestId('mock-pane'), { key: ' ', code: 'Space' });
      expect(panKey).toHaveBeenCalledTimes(2);
    } finally {
      document.removeEventListener('keydown', panKey);
    }
  });

  it('is a size container that hides the minimap below a 480 px canvas width', () => {
    render(<ModuleTreeCanvas {...props()} />);
    expect(screen.getByTestId('mock-minimap')).toBeInTheDocument();
    const css = readFileSync(sibling('module-tree-canvas.css'), 'utf8');
    expect(rule(css, '.module-tree__canvas')).toMatch(/container-type:\s*inline-size/);
    const query = css.slice(css.indexOf('@container'), css.indexOf('@container') + 200);
    expect(css).toContain('@container (width < 480px)');
    expect(query).toMatch(/\.module-tree__canvas \.react-flow__minimap\s*\{[^}]*display:\s*none/);
  });

  it('handles Enter, arrows and o on the shell, and opens by double-click', () => {
    const onSelectNode = vi.fn();
    const onToggleCollapsed = vi.fn();
    const onOpenNode = vi.fn();
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, onToggleCollapsed, onOpenNode,
      collapsedNodeIds: new Set(['b']) })} />);
    const alpha = screen.getByRole('treeitem', { name: 'Alpha' });
    fireEvent.keyDown(alpha, { key: 'Enter' });
    expect(onSelectNode).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    fireEvent.keyDown(alpha, { key: 'ArrowLeft' });
    expect(onToggleCollapsed).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Beta' }), { key: 'ArrowRight' });
    expect(onToggleCollapsed).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(alpha, { key: 'o' });
    expect(onOpenNode).toHaveBeenLastCalledWith('a');
    fireEvent.doubleClick(screen.getByTestId('node-a1'));
    expect(onOpenNode).toHaveBeenLastCalledWith('a1');
  });

  it('ignores o and double-click without an open handler', () => {
    const onSelectNode = vi.fn();
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), onSelectNode, onOpenNode: undefined })} />);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Alpha' }), { key: 'o' });
    fireEvent.doubleClick(screen.getByTestId('node-a'));
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('names shells and collapse controls with ariaLabelOf, and titles minimap marks with names', () => {
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), ariaLabelOf: node => `module ${node.id}` })} />);
    expect(screen.getByRole('tree', { name: 'Test tree' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'module a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse module a' })).toBeInTheDocument();
    const minimap = screen.getByTestId('mock-minimap');
    expect([...minimap.querySelectorAll('title')].map(title => title.textContent))
      .toEqual(['Project', 'Alpha', 'A1', 'A2', 'Beta', 'B1']);
    expect(minimap.querySelectorAll('rect')[1]).toHaveStyle({ fill: '#2563eb' });
    expect(minimap.querySelectorAll('rect')[1]).toHaveClass('react-flow__minimap-node');
  });

  it('fits the view once laid out, or centres a requested node instead', () => {
    const { unmount } = render(<ModuleTreeCanvas {...props({ nodes: mixedNodes() })} />);
    expect(instance.fitView).toHaveBeenCalledWith({ padding: 0.12, minZoom: 0.1, maxZoom: 1.2 });
    expect(lastFlow().fitView).toBe(true);
    unmount();
    instance.fitView.mockClear();
    render(<ModuleTreeCanvas {...props({ nodes: mixedNodes(), centerNodeId: 'a1' })} />);
    const a1 = flowNodes().get('a1')!;
    expect(instance.fitView).not.toHaveBeenCalled();
    expect(lastFlow().fitView).toBe(false);
    expect(instance.setCenter).toHaveBeenCalledWith(a1.position.x + 184 / 2, a1.position.y + 120 / 2, { zoom: 1 });
  });

  it('imports no explorer model, no stylesheet and nothing from ModuleTreeView', () => {
    const source = readFileSync(sibling('ModuleTreeCanvas.tsx'), 'utf8');
    const imports = [...source.matchAll(/^import[^;]*?from\s+'([^']+)'|^import\s+'([^']+)'/gm)].map(match => match[1] ?? match[2]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter(path => path!.endsWith('.css'))).toEqual([]);
    expect(imports.filter(path => /ModuleTreeView|interfaces\/project-view|ProjectExplorer/.test(path!))).toEqual([]);
    expect(source).not.toMatch(/ExplorerModule|ProjectExplorerModel/);
  });
});

function lastFlow(): Record<string, any> {
  return flowProps[flowProps.length - 1]!;
}

function flowNodes(): Map<string, Record<string, any>> {
  return new Map(lastFlow().nodes.map((node: Record<string, any>) => [node.id, node]));
}

/** A source file of the owner. */
function sibling(file: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', file);
}

/**
 * States whether the element carries a focus ring. jsdom answers `:focus-visible` from its own
 * record of the interactions that led to the focus; the rule under test is what the canvas does
 * with the answer.
 */
function stubFocusRing(element: HTMLElement, visible: boolean): void {
  const matches = element.matches.bind(element);
  element.matches = ((selectors: string) => selectors === ':focus-visible' ? visible
    : matches(selectors)) as Element['matches'];
}

interface Box { left: number; top: number; width: number; height: number }

/** Fixes an element's box, which jsdom otherwise reports as empty; a function follows the layout. */
function stubRect(element: Element, box: Box | (() => Box)): void {
  element.getBoundingClientRect = () => {
    const at = typeof box === 'function' ? box() : box;
    return {
      x: at.left, y: at.top, left: at.left, top: at.top,
      right: at.left + at.width, bottom: at.top + at.height, width: at.width, height: at.height,
      toJSON: () => ({}),
    };
  };
}

/** Gives an element scroll offsets, which jsdom keeps at zero for want of a layout. */
function stubScroll(element: Element, at: { top: number; left: number }): void {
  Object.defineProperty(element, 'scrollTop', { value: at.top, writable: true, configurable: true });
  Object.defineProperty(element, 'scrollLeft', { value: at.left, writable: true, configurable: true });
}

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

/** Two roots of mixed heights and widths: `a` (300 tall) with two children, `b` with one. */
function mixedNodes(): ModuleTreeCanvasNode[] {
  return [
    canvasNode('a', 'Alpha', null, ['a1', 'a2'], 184, 300, '#2563eb'),
    canvasNode('a1', 'A1', 'a', [], 184, 120, '#16a34a'),
    canvasNode('a2', 'A2', 'a', [], 240, 64, '#16a34a'),
    canvasNode('b', 'Beta', null, ['b1'], 220, 90, '#9333ea'),
    canvasNode('b1', 'B1', 'b', [], 184, 1000, '#9333ea'),
  ];
}

function canvasNode(id: string, name: string, parent: string | null, children: string[], width: number,
  height: number, color: string): ModuleTreeCanvasNode {
  return { id, name, parent, children, color, width, height };
}

function controlBody(node: ModuleTreeCanvasNode): React.ReactNode {
  return (
    <div>
      <span>text {node.name}</span>
      <button type="button">row {node.name}</button>
      <a href="#row">link {node.name}</a>
      <input aria-label={`input ${node.name}`} />
      <span role="button" tabIndex={0}>role {node.name}</span>
      <div tabIndex={0}>focusable {node.name}</div>
      <button type="button"><span>inside {node.name}</span></button>
    </div>
  );
}

/**
 * A breadth-first tree of `count` nodes whose deepest level is `depth`, as in MT07. A non-zero
 * `maxHeight` gives heights from 64 to `maxHeight` in a fixed sequence seeded by `seed`.
 */
function seededTree(count: number, depth: number, seed: number, maxHeight: number): ModuleTreeCanvasNode[] {
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const rows: { id: string; parent: string | null; children: string[]; level: number }[] = [
    { id: 'm0', parent: null, children: [], level: 0 },
  ];
  for (let index = 1; index < count; index += 1) {
    const candidates = rows.filter(row => row.level < depth);
    const parent = candidates[Math.floor((index - 1) / 3) % candidates.length]!;
    const row = { id: `m${index}`, parent: parent.id, children: [], level: parent.level + 1 };
    parent.children.push(row.id);
    rows.push(row);
  }
  return rows.map(row => ({ id: row.id, name: row.id, parent: row.parent, children: row.children, color: '#64748b',
    width: TREE_NODE_WIDTH, height: maxHeight > 0 ? 64 + (next() % (maxHeight - 63)) : TREE_NODE_HEIGHT }));
}

function medianLayoutMs(items: readonly ModuleTreeCanvasNode[]): number {
  const index = indexHierarchy(items, items[0]!.id);
  const byId = new Map(items.map(item => [item.id, item]));
  const sizeOf = (id: string) => byId.get(id)!;
  expect(layoutModuleTree(index, new Set(), sizeOf).nodes).toHaveLength(items.length);
  const timings: number[] = [];
  for (let run = 0; run < 20; run += 1) {
    const started = performance.now();
    layoutModuleTree(index, new Set(), sizeOf);
    timings.push(performance.now() - started);
  }
  timings.sort((left, right) => left - right);
  return timings[10]!;
}

function props(overrides: Partial<ModuleTreeCanvasProps> = {}): ModuleTreeCanvasProps {
  return {
    nodes: mixedNodes(),
    selectedNodeId: null,
    collapsedNodeIds: new Set(),
    ariaLabel: 'Test tree',
    renderNodeBody: node => <span>text {node.name}</span>,
    onSelectNode: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onOpenNode: vi.fn(),
    ...overrides,
  };
}

/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExplorerModule, ProjectExplorerModel } from '../../../presentation/subs/project-view/src/interfaces/project-view.js';
import type { ContextRevision } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { ServerStatusResult } from '../../../service-api/src/interfaces/explorer-service.js';
import { importExplorerUrl, ModuleTreePage } from '../ModuleTreePage.js';
import type { ExplorerClient } from '../published-project-view.js';

const flowNodes: { current: string[] } = { current: [] };
const flowProps: { current: Record<string, any> } = { current: {} };

vi.mock('@xyflow/react', () => ({
  ReactFlow(props: Record<string, any>) {
    flowNodes.current = props.nodes.map((node: Record<string, any>) => node.id);
    flowProps.current = props;
    return <div>
      {props.nodes.map((node: Record<string, any>) => {
        const View = props.nodeTypes[node.type];
        return <div key={node.id} data-testid={`node-${node.id}`} onClick={event => props.onNodeClick?.(event, node)}
          onDoubleClick={event => props.onNodeDoubleClick?.(event, node)}>
          <View id={node.id} data={node.data} />
        </div>;
      })}
    </div>;
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  BackgroundVariant: { Dots: 'dots' },
}));

beforeEach(() => { flowNodes.current = []; });
afterEach(() => { cleanup(); });

const generation = '00000000-0000-0000-0000-000000000001';
const revisionId = (sequence: number) => `rev/1:${generation}:${sequence}`;

function revision(sequence: number): ContextRevision {
  return { token: { context: `ctx/1:${'a'.repeat(64)}`, generation: `gen/1:${generation}` }, revision: revisionId(sequence),
    sequence } as unknown as ContextRevision;
}

function status(sequence: number, binding: ServerStatusResult['binding'] = 'ready', message: string | null = null): ServerStatusResult {
  return { root: '/project', binding, message, published: binding === 'ready' ? revision(sequence) : null, daemonPid: 1 };
}

/** A root with `groups` children, each with `leaves` children. */
function model(sequence: number, groups: string[], leaves: number): ProjectExplorerModel {
  const metrics = { ownedFiles: 1, subtreeFiles: 1, dependencies: 0, dependents: 0, accessOccurrences: 0,
    selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0, approximateIcs: 0 };
  const module = (id: string, parent: string | null, children: string[]): ExplorerModule => ({
    id, name: id.split('/').pop()!, directory: id, parent, children, tags: [], presentationClass: 'untagged',
    purpose: { state: 'present', readme: `${id}/README.md`, paragraph: `${id} purpose.` }, files: [], exports: [], metrics });
  const leafIds = (group: string) => Array.from({ length: leaves }, (_, index) => `root/${group}/leaf${index}`);
  const modules = [
    module('root', null, groups.map(group => `root/${group}`)),
    ...groups.flatMap(group => [module(`root/${group}`, 'root', leafIds(group)),
      ...leafIds(group).map(id => module(id, `root/${group}`, []))]),
  ];
  return { revision: revisionId(sequence), rootModuleId: 'root', state: 'complete',
    registry: { id: 'registry', definitions: [], isDefault: true }, modules, edges: [], coverage: [],
    summary: { owners: modules.length, ownedFiles: modules.length, edges: 0, accessOccurrences: 0, selectedSymbols: 0,
      deniedAccesses: 0, limitedAccesses: 0, coverageNotes: 0 } } as unknown as ProjectExplorerModel;
}

function client(views: () => { sequence: number; view: ProjectExplorerModel }, serverStatus: () => ServerStatusResult): ExplorerClient {
  return {
    async projectView() { const current = views(); return { status: 'ready', revision: revision(current.sequence), view: current.view }; },
    async serverStatus() { return serverStatus(); },
    async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    async dependencyView() { throw new Error('The module tree never requests dependency views'); },
  };
}

describe('MT09: connected module tree page', () => {
  it('expands a tree of 60 modules and collapses below depth 2 at 61', async () => {
    // 1 root + 3 groups + 3 * 18 leaves = 58; add a fourth group of 1 leaf -> 60.
    const sixty = model(1, ['a', 'b', 'c'], 18);
    const withExtra = (count: number): ProjectExplorerModel => {
      const base = model(1, ['a', 'b', 'c', 'd'], 0);
      const leaves = Array.from({ length: count }, (_, index) => `root/a/leaf${index}`);
      return { ...base, modules: base.modules.map(item => item.id === 'root/a' ? { ...item, children: leaves } : item)
        .concat(leaves.map(id => ({ ...base.modules[1]!, id, name: id, parent: 'root/a', children: [] }))) };
    };
    expect(sixty.modules).toHaveLength(58);
    const exactly60 = withExtra(55);
    const over = withExtra(56);
    expect(exactly60.modules).toHaveLength(60);
    expect(over.modules).toHaveLength(61);

    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: exactly60 }), () => status(1))} pollIntervalMs={60_000} />);
    await screen.findByText('60 modules, depth 2');
    expect(flowNodes.current).toHaveLength(60);
    cleanup();

    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: over }), () => status(1))} pollIntervalMs={60_000} />);
    await screen.findByText('61 modules, depth 2');
    // Depth-2 modules have no children, so every module stays visible; depth 1 collapses on request.
    expect(flowNodes.current).toHaveLength(61);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse to depth 1' }));
    expect(flowNodes.current).toEqual(['root', 'root/a', 'root/b', 'root/c', 'root/d']);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(flowNodes.current).toHaveLength(61);
  });

  it('collapses modules with children below depth 2 in a large tree', async () => {
    const deep = model(1, ['a', 'b', 'c'], 20);
    const withGrandchildren: ProjectExplorerModel = { ...deep, modules: deep.modules.map(item => item.id === 'root/a/leaf0'
      ? { ...item, children: ['root/a/leaf0/x'] } : item)
      .concat([{ ...deep.modules[0]!, id: 'root/a/leaf0/x', name: 'x', parent: 'root/a/leaf0', children: [] }]) };
    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: withGrandchildren }), () => status(1))} pollIntervalMs={60_000} />);
    await screen.findByText('65 modules, depth 3');
    expect(flowNodes.current).toHaveLength(64);
    expect(flowNodes.current).not.toContain('root/a/leaf0/x');
    expect(screen.getByRole('button', { name: 'Expand leaf0' })).toHaveTextContent('+1');
  });

  it('marks a newer revision stale and keeps surviving selection and collapsed IDs on refresh', async () => {
    let current = 1;
    const views = () => current === 1
      ? { sequence: 1, view: model(1, ['a', 'b'], 2) }
      : { sequence: 2, view: model(2, ['a', 'c'], 2) };
    render(<ModuleTreePage client={client(views, () => status(current))} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse b' }));
    fireEvent.click(screen.getByTestId('node-root/a'));
    expect(screen.getByRole('heading', { name: 'a' })).toBeInTheDocument();

    current = 2;
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(2)}`);
    expect(screen.getByRole('heading', { name: 'a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand a' })).toBeInTheDocument();
    expect(flowNodes.current).toEqual(['root', 'root/a', 'root/c', 'root/c/leaf0', 'root/c/leaf1']);

    fireEvent.click(screen.getByTestId('node-root/c/leaf0'));
    current = 3;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh (stale)' })).toBeEnabled());
  });

  it('drops a selection whose module was removed', async () => {
    let current = 1;
    const views = () => current === 1
      ? { sequence: 1, view: model(1, ['a', 'b'], 1) }
      : { sequence: 2, view: model(2, ['a'], 1) };
    render(<ModuleTreePage client={client(views, () => status(current))} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    fireEvent.click(screen.getByTestId('node-root/b'));
    expect(screen.getByRole('heading', { name: 'b' })).toBeInTheDocument();
    current = 2;
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(2)}`);
    expect(screen.getByRole('heading', { name: 'Project summary' })).toBeInTheDocument();
  });

  it('keeps the tree and shows the binding notice while the binding is not ready', async () => {
    let serverStatus = status(1);
    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: model(1, ['a'], 1) }), () => serverStatus)} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    serverStatus = status(0, 'retrying', 'Daemon connection lost');
    expect(await screen.findByRole('status')).toHaveTextContent('Reconnecting to the daemon: Daemon connection lost');
    expect(screen.getByTestId('node-root/a')).toBeInTheDocument();
  });

  it('opens a module in the import explorer through the opener', async () => {
    const openModule = vi.fn();
    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: model(1, ['a'], 1) }), () => status(1))}
      pollIntervalMs={60_000} openModule={openModule} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    fireEvent.doubleClick(screen.getByTestId('node-root/a/leaf0'));
    expect(openModule).toHaveBeenCalledWith('root/a/leaf0');
    expect(importExplorerUrl('root/a/leaf0')).toBe('/analysis/latest?module=root%2Fa%2Fleaf0');
  });
});

describe('MT11: tree focus from ?module=', () => {
  it('selects a nested target, expands its collapsed ancestors and centres it', async () => {
    const deep = model(1, ['a', 'b', 'c'], 20);
    const withGrandchildren: ProjectExplorerModel = { ...deep, modules: deep.modules.map(item => item.id === 'root/a/leaf0'
      ? { ...item, children: ['root/a/leaf0/x'] } : item)
      .concat([{ ...deep.modules[0]!, id: 'root/a/leaf0/x', name: 'x', parent: 'root/a/leaf0', children: [] }]) };
    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: withGrandchildren }), () => status(1))}
      pollIntervalMs={60_000} initialModuleId="root/a/leaf0/x" />);
    await screen.findByText('65 modules, depth 3');
    expect(screen.getByRole('heading', { name: 'x' })).toBeInTheDocument();
    expect(flowNodes.current).toContain('root/a/leaf0/x');
    expect(flowProps.current.fitView).toBe(false);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the default tree and a notice for an unknown target', async () => {
    render(<ModuleTreePage client={client(() => ({ sequence: 1, view: model(1, ['a'], 1) }), () => status(1))}
      pollIntervalMs={60_000} initialModuleId="root/missing" />);
    expect(await screen.findByRole('status')).toHaveTextContent('Module root/missing is not in this revision');
    expect(screen.getByRole('heading', { name: 'Project summary' })).toBeInTheDocument();
    expect(flowProps.current.fitView).toBe(true);
  });
});


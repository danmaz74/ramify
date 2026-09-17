/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplorerModule, ProjectExplorerModel } from '../../../presentation/subs/project-view/src/interfaces/project-view.js';
import type { ModuleGraphProps } from '../../../presentation/subs/project-view/src/moduleGraphShared.js';
import type { ContextRevision } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';
import { focusModule, moduleTreeUrl, ProjectExplorerPage } from '../ProjectExplorerPage.js';
import { importExplorerUrl } from '../ModuleTreePage.js';
import type { ExplorerClient } from '../published-project-view.js';

vi.mock('../../../presentation/subs/project-view/src/ModuleGraphRadial.js', () => ({
  ModuleGraphRadial: (props: ModuleGraphProps) => <div data-testid="graph" data-modules={props.modules.map(module => module.id).join(',')}
    data-selected={props.selectedModuleId ?? ''} />,
}));

afterEach(() => { cleanup(); });

const revisionId = 'rev/1:00000000-0000-0000-0000-000000000001:1';

function model(): ProjectExplorerModel {
  const metrics = { ownedFiles: 1, subtreeFiles: 1, dependencies: 0, dependents: 0, accessOccurrences: 0,
    selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0, approximateIcs: 0 };
  const module = (id: string, parent: string | null, children: string[], tags: string[]): ExplorerModule => ({
    id, name: id.split('/').pop()!, directory: id, parent, children, tags,
    presentationClass: tags.length ? tags.join('+') : 'untagged',
    purpose: { state: 'present', readme: `${id}/README.md`, paragraph: `${id} purpose.` }, files: [], exports: [], metrics });
  const modules = [
    module('app', null, ['app/analysis', 'app/ui'], []),
    module('app/analysis', 'app', ['app/analysis/model', 'app/analysis/project'], []),
    module('app/analysis/model', 'app/analysis', [], ['browser']),
    module('app/analysis/project', 'app/analysis', [], []),
    module('app/ui', 'app', [], ['ui']),
  ];
  return { revision: revisionId, rootModuleId: 'app', state: 'complete', registry: { id: 'r', definitions: [], isDefault: true },
    modules, edges: [], coverage: [], summary: { owners: 5, ownedFiles: 5, edges: 0, accessOccurrences: 0,
      selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0, coverageNotes: 0 } } as unknown as ProjectExplorerModel;
}

const client: ExplorerClient = {
  async projectView() {
    return { status: 'ready', revision: { revision: revisionId, sequence: 1, fingerprints: { inputId: 'input/1:focus' },
      token: { context: 'ctx', generation: 'gen' } } as unknown as ContextRevision, view: model() };
  },
  async serverStatus() {
    return { root: '/p', binding: 'ready', message: null, daemonPid: 1,
      published: { revision: revisionId, sequence: 1, fingerprints: { inputId: 'input/1:focus' }, token: { context: 'ctx', generation: 'gen' } } as unknown as ContextRevision };
  },
  async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
  async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
};

describe('MT12: import explorer focus from ?module=', () => {
  it('maps each target kind to a scope and selection', () => {
    expect(focusModule(model(), 'missing')).toBeNull();
    expect(focusModule(model(), 'app')).toEqual({ scope: null, selected: null });
    expect(focusModule(model(), 'app/ui')).toEqual({ scope: null, selected: 'app/ui' });
    expect(focusModule(model(), 'app/analysis/model')).toEqual({ scope: 'app/analysis', selected: 'app/analysis/model' });
  });

  it('scopes a nested module to its parent, selects it and keeps every class filter on', async () => {
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} initialModuleId="app/analysis/model" />);
    const graph = await screen.findByTestId('graph');
    await vi.waitFor(() => expect(graph).toHaveAttribute('data-selected', 'app/analysis/model'));
    expect(graph).toHaveAttribute('data-modules', 'app/analysis/model,app/analysis/project');
    expect(within(screen.getByRole('navigation', { name: 'Module navigation' })).getByText('analysis')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'model' })).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      if (!(checkbox as HTMLInputElement).disabled) expect(checkbox).toBeChecked();
    }
  });

  it('selects a top-level module in the default scope', async () => {
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} initialModuleId="app/ui" />);
    const graph = await screen.findByTestId('graph');
    await vi.waitFor(() => expect(graph).toHaveAttribute('data-selected', 'app/ui'));
    expect(graph).toHaveAttribute('data-modules', 'app/analysis,app/ui');
    expect(screen.queryByRole('navigation', { name: 'Module navigation' })).not.toBeInTheDocument();
  });

  it('shows the default view for the root and a notice for an unknown module', async () => {
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} initialModuleId="app" />);
    const graph = await screen.findByTestId('graph');
    expect(graph).toHaveAttribute('data-selected', '');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    cleanup();
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} initialModuleId="app/missing" />);
    expect(await screen.findByRole('status')).toHaveTextContent('Module app/missing is not in this revision');
    expect(screen.getByTestId('graph')).toHaveAttribute('data-modules', 'app/analysis,app/ui');
  });
});

describe('MT13: links between the pages', () => {
  it('opens the selected module in the module tree', async () => {
    const openModuleTree = vi.fn();
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} initialModuleId="app/analysis/model"
      openModuleTree={openModuleTree} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show in module tree' }));
    expect(openModuleTree).toHaveBeenCalledWith('app/analysis/model');
  });

  it('encodes slashes in both URLs', () => {
    expect(moduleTreeUrl('app/analysis/model')).toBe('/modules/latest?module=app%2Fanalysis%2Fmodel');
    expect(importExplorerUrl('app/analysis/model')).toBe('/analysis/latest?module=app%2Fanalysis%2Fmodel');
  });
});

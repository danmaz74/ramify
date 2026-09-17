/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectExplorerModel } from '../../../presentation/subs/project-view/src/interfaces/project-view.js';
import type { ModuleGraphProps } from '../../../presentation/subs/project-view/src/moduleGraphShared.js';
import type { ContextRevision, ContextToken } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { ServerStatusResult } from '../../../service-api/src/interfaces/explorer-service.js';
import { ProjectExplorerPage, type ExplorerClient } from '../ProjectExplorerPage.js';

vi.mock('../../../presentation/subs/project-view/src/ModuleGraphRadial.js', () => ({
  ModuleGraphRadial: (props: ModuleGraphProps) => <div data-testid="connected-graph">
    {props.modules.map(module => <button key={module.id} onClick={() => props.onSelectModule(module.id)}>{module.name}</button>)}
    {props.edges.map(edge => <button key={edge.id} onClick={() => props.onSelectEdge({ kind: 'edge', id: edge.id, edge })}>
      {edge.consumer} to {edge.provider}
    </button>)}
  </div>,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); });

const generationA = '00000000-0000-0000-0000-000000000001';
const generationB = '00000000-0000-0000-0000-000000000002';
const token: ContextToken = { context: `ctx/1:${'a'.repeat(64)}`, generation: `gen/1:${generationA}` };
const revisionId = (sequence: number, generation = generationA) => `rev/1:${generation}:${sequence}`;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; };

function revision(sequence: number, generation = generationA): ContextRevision {
  return { token: { ...token, generation: `gen/1:${generation}` }, revision: revisionId(sequence, generation), sequence, publishedAt: sequence, cause: 'watch',
    fingerprints: {}, changed: [], checked: {}, delta: { added: 0, removed: 0, positionOnly: 0 }, timings: {}, capture: {},
    outcome: { execution: 'completed', check: 'passed', coverage: 'complete' }, summary: {} } as unknown as ContextRevision;
}

function model(sequence: number, options: { exportItem?: boolean; name?: string; edgeAccessCount?: number; generation?: string } = {}): ProjectExplorerModel {
  const metrics = { ownedFiles: 1, subtreeFiles: 1, dependencies: 0, dependents: 0,
    accessOccurrences: 0, selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0, approximateIcs: 0 };
  const exportItem = options.exportItem ? [{ id: 'export-value', name: 'value', aliases: ['value'],
    original: { kind: 'code', owner: 'a', file: 'api.ts', binding: 'value' }, file: 'api.ts', locations: [],
    capability: 'value', tags: [], forwarded: false, exposures: [], signature: { state: 'loadable',
      request: { original: { kind: 'code', owner: 'a', file: 'api.ts', binding: 'value' }, exportName: 'value' } } }] : [];
  return { revision: revisionId(sequence, options.generation), rootModuleId: 'root', state: 'complete',
    registry: { definitions: [] } as unknown as ProjectExplorerModel['registry'],
    modules: [
      { id: 'root', name: 'Root', directory: '.', parent: null, children: ['a'], tags: [], presentationClass: 'untagged',
        purpose: { state: 'present', paragraph: 'Root', readme: 'README.md' }, files: [], exports: [], metrics },
      { id: 'a', name: options.name ?? 'Module A', directory: 'subs/a', parent: 'root', children: [], tags: [], presentationClass: 'untagged',
        purpose: { state: 'present', paragraph: 'A', readme: 'subs/a/README.md' }, files: [], exports: exportItem, metrics },
    ], edges: options.edgeAccessCount === undefined ? [] : [{ id: 'a->root', consumer: 'a', provider: 'root',
      consumerFiles: ['subs/a/src/use.ts'], providerFiles: ['src/index.ts'], accessCount: options.edgeAccessCount,
      symbolCount: 1, accesses: [], status: 'allowed', reasons: ['same-owner'], coverageIds: [] }],
    coverage: [], summary: { owners: 2, ownedFiles: 1, edges: options.edgeAccessCount === undefined ? 0 : 1,
      accessOccurrences: options.edgeAccessCount ?? 0, selectedSymbols: options.edgeAccessCount === undefined ? 0 : 1,
      deniedAccesses: 0, limitedAccesses: 0, coverageNotes: 0 } } as unknown as ProjectExplorerModel;
}

function status(sequence: number, generation = generationA,
  binding: ServerStatusResult['binding'] = 'ready', message: string | null = null): ServerStatusResult {
  return { root: '/project', binding, message, published: binding === 'ready' ? revision(sequence, generation) : null,
    daemonPid: binding === 'ready' ? 4242 : null };
}

describe('connected project explorer revision state', () => {
  it('renders a real published report obtained through the production router', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-connected-page-')));
    const put = async (path: string, value: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), value); };
    try {
      await put('module.ramify', 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n');
      await put('README.md', '# Fixture\n\nA connected page fixture.\n');
      await put('package.json', '{"type":"module"}');
      await put('tsconfig.json', JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] }));
      await put('src/interfaces/api.ts', 'export const value = 1;\n');
      await put('subs/consumer/module.ramify', 'ramify 1\nmodule consumer\n');
      await put('subs/consumer/README.md', '# Consumer\n\nConsumes the public value.\n');
      await put('subs/consumer/src/use.ts', "import { value } from '../../../src/interfaces/api.js'; void value;\n");
      const helper = join(process.cwd(), 'subs/explorer/src/tests/real-router-model.ts');
      const output = await promisify(execFile)(process.execPath, ['--import', 'tsx', helper, root], { maxBuffer: 32 * 1024 * 1024 });
      const result = JSON.parse(output.stdout) as { view: Awaited<ReturnType<ExplorerClient['projectView']>>;
        status: ServerStatusResult };
      expect(result.status).toMatchObject({ root, binding: 'ready', message: null });
      const client: ExplorerClient = {
        async projectView() { return result.view; },
        async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
        async serverStatus() { return result.status; },
      };
      render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} />);
      expect(await screen.findByRole('button', { name: 'consumer' })).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`Revision ${revisionId(1).slice(0, 6)}`))).toBeInTheDocument();
    } finally {
      cleanup();
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);

  it('offers explicit refresh, preserves a valid selection and discards the earlier late response', async () => {
    const late = deferred<any>();
    let views = 0;
    const client: ExplorerClient = {
      async projectView() {
        views++;
        if (views === 1) return { status: 'ready', revision: revision(1), view: model(1) };
        if (views === 2) return late.promise;
        return { status: 'ready', revision: revision(3), view: model(3) };
      },
      async serverStatus() { return status(2); },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Module A' }));
    expect(screen.getByText('Export inventory')).toBeInTheDocument();
    const refresh = await screen.findByRole('button', { name: 'Refresh (stale)' });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    await screen.findByText(`Revision ${revisionId(3)}`);
    expect(screen.getByText('Export inventory')).toBeInTheDocument();
    late.resolve({ status: 'ready', revision: revision(2), view: model(2, { name: 'Late Module' }) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByText(`Revision ${revisionId(3)}`)).toBeInTheDocument();
    expect(screen.queryByText('Late Module')).not.toBeInTheDocument();
  });

  it('reconciles only a module edge with the same ID across newer revisions', async () => {
    let current = 1;
    const client: ExplorerClient = {
      async projectView() {
        return { status: 'ready', revision: revision(current),
          view: model(current, current < 3 ? { edgeAccessCount: current } : {}) };
      },
      async serverStatus() { return status(current); },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    fireEvent.click(screen.getByRole('button', { name: 'a to root' }));
    expect(screen.getByRole('heading', { name: 'Dependency Edge' })).toBeInTheDocument();

    current = 2;
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(2)}`);
    expect(screen.getByRole('heading', { name: 'Dependency Edge' })).toBeInTheDocument();
    const accessMetric = screen.getByText('Access occurrences').closest('.module-arch__metric');
    expect(accessMetric).toHaveTextContent('2');

    current = 3;
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(3)}`);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dependency Edge' })).not.toBeInTheDocument());
  });

  it('drops an old detail response on refresh and loads the current revision detail on re-expansion', async () => {
    const oldDetail = deferred<any>();
    let sequence = 1;
    let details = 0;
    const client: ExplorerClient = {
      async projectView(input) { sequence = input.revision ? 2 : sequence; return { status: 'ready', revision: revision(sequence), view: model(sequence, { exportItem: true }) }; },
      async serverStatus() { return status(2); },
      async explorerDetails() {
        details++;
        if (details === 1) return oldDetail.promise;
        return { status: 'ready', revision: revision(2), details: [{ state: 'described',
          original: { kind: 'code', owner: 'a', file: 'api.ts', binding: 'value' }, exportName: 'value', signature: 'export const value: 2' }] };
      },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Module A' }));
    fireEvent.click(screen.getByRole('button', { name: /value/i }));
    expect(screen.getByText('Loading signature...')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(2)}`);
    oldDetail.resolve({ status: 'ready', revision: revision(1), details: [{ state: 'described',
      original: { kind: 'code', owner: 'a', file: 'api.ts', binding: 'value' }, exportName: 'value', signature: 'old signature' }] });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText('old signature')).not.toBeInTheDocument();
    expect(await screen.findByText('export const value: 2')).toBeInTheDocument();
  });

  it('RS12: marks a lower sequence in a new generation as fresher and loads it on refresh', async () => {
    let published = status(5);
    const requested: (string | undefined)[] = [];
    const client: ExplorerClient = {
      async projectView(input) {
        requested.push(input.revision);
        const current = published.published!;
        return { status: 'ready', revision: current, view: model(current.sequence, { generation: current.revision.split(':')[1] }) };
      },
      async serverStatus() { return published; },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(5)}`);
    // Same revision: not stale.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    published = status(1, generationB);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(1, generationB)}`);
    expect(requested.at(-1)).toBe(revisionId(1, generationB));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('RS12: marks a higher sequence in the same generation as fresher', async () => {
    let published = status(1);
    const client: ExplorerClient = {
      async projectView() { const current = published.published!; return { status: 'ready', revision: current, view: model(current.sequence) }; },
      async serverStatus() { return published; },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    published = status(2);
    expect(await screen.findByRole('button', { name: 'Refresh (stale)' })).toBeEnabled();
  });

  it('RS12: keeps the displayed model and shows a one-line notice while the binding is not ready', async () => {
    let published = status(3);
    let viewResult: Awaited<ReturnType<ExplorerClient['projectView']>> = { status: 'ready', revision: revision(3), view: model(3) };
    const client: ExplorerClient = {
      async projectView() { return viewResult; },
      async serverStatus() { return published; },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={10} />);
    await screen.findByText(`Revision ${revisionId(3)}`);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    published = status(0, generationA, 'retrying', 'Daemon connection lost');
    viewResult = { status: 'unavailable', reason: 'Daemon connection lost' };
    expect(await screen.findByRole('status')).toHaveTextContent('Reconnecting to the daemon: Daemon connection lost');
    expect(screen.getByText(`Revision ${revisionId(3)}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Module A' })).toBeInTheDocument();
    // A refresh while unavailable keeps the model too.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByText(`Revision ${revisionId(3)}`)).toBeInTheDocument();

    published = status(1, generationB);
    viewResult = { status: 'ready', revision: revision(1, generationB), view: model(1, { generation: generationB }) };
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await screen.findByText(`Revision ${revisionId(1, generationB)}`);
  });
});

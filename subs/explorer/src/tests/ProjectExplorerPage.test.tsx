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
import type { ExplorerDependencyModel } from '../../../service-api/src/interfaces/explorer-dependencies.js';
import { ProjectExplorerPage } from '../ProjectExplorerPage.js';
import type { ExplorerClient } from '../published-project-view.js';

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
const inputOf = (sequence: number, generation = generationA) => `input/1:${generation}:${sequence}`;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; };

function revision(sequence: number, generation = generationA): ContextRevision {
  return { token: { ...token, generation: `gen/1:${generation}` }, revision: revisionId(sequence, generation), sequence, publishedAt: sequence, cause: 'watch',
    fingerprints: { inputId: inputOf(sequence, generation) }, changed: [], checked: {}, delta: { added: 0, removed: 0, positionOnly: 0 }, timings: {}, capture: {},
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
        async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
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
      async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
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

  it('draws no occurrence edge and keeps occurrences as module evidence without a dependency result', async () => {
    // Plan 6D: links come only from a dependency result.
    const client: ExplorerClient = {
      async projectView() { return { status: 'ready', revision: revision(1), view: model(1, { edgeAccessCount: 2 }) }; },
      async serverStatus() { return status(1); },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
      async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
    };
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    const moduleA = await screen.findByRole('button', { name: 'Module A' });
    expect(screen.queryByRole('button', { name: 'a to root' })).not.toBeInTheDocument();
    expect((await screen.findAllByText('Dependency diagram unavailable: not under test.')).length).toBeGreaterThan(0);
    fireEvent.click(moduleA);
    fireEvent.click(screen.getByRole('button', { name: /Source evidence: import occurrences/ }));
    expect(screen.getByText('Occurrences this module imports')).toBeInTheDocument();
    expect(screen.getByText('2 accesses')).toBeInTheDocument();
  });

  it('drops an old detail response on refresh and loads the current revision detail on re-expansion', async () => {
    const oldDetail = deferred<any>();
    let sequence = 1;
    let details = 0;
    const client: ExplorerClient = {
      async projectView(input) { sequence = input.revision ? 2 : sequence; return { status: 'ready', revision: revision(sequence), view: model(sequence, { exportItem: true }) }; },
      async serverStatus() { return status(2); },
      async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
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
      async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
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
      async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
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
      async dependencyView() { return { status: 'unavailable', reason: 'not under test' }; },
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

describe('connected dependency view (C7)', () => {
  type DependencyResult = Awaited<ReturnType<ExplorerClient['dependencyView']>>;
  const moduleIds = ['root', 'root/a', 'root/b'] as const;

  function project(sequence: number): ProjectExplorerModel {
    const metrics = { ownedFiles: 1, subtreeFiles: 1, dependencies: 0, dependents: 0,
      accessOccurrences: 0, selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0, approximateIcs: 0 };
    const module = (id: string, parent: string | null, children: string[]) => ({ id, name: id === 'root' ? 'Root' : `Module ${id.slice(5).toUpperCase()}`,
      directory: id, parent, children, tags: [], presentationClass: 'untagged',
      purpose: { state: 'present', paragraph: id, readme: `${id}/README.md` }, files: [], exports: [], metrics });
    return { revision: revisionId(sequence), rootModuleId: 'root', state: 'complete',
      registry: { definitions: [] } as unknown as ProjectExplorerModel['registry'],
      modules: [module('root', null, ['root/a', 'root/b']), module('root/a', 'root', []), module('root/b', 'root', [])],
      edges: [], coverage: [], summary: { owners: 3, ownedFiles: 3, edges: 0, accessOccurrences: 0, selectedSymbols: 0,
        deniedAccesses: 0, limitedAccesses: 0, coverageNotes: 0 } } as unknown as ProjectExplorerModel;
  }

  /** One behavioral link a>b and, with `nonBehavioral`, one non-behavioral-only link b>a; inputs follow the revision. */
  function dependencies(sequence: number, options: { behavioral?: number; inputId?: string } = {}): ExplorerDependencyModel {
    const behavioral = options.behavioral ?? 1;
    const evidence = (consumer: string, provider: string, classification: 'behavioral' | 'non-behavioral', binding: string) => ({
      original: { kind: 'code', owner: provider, file: 'src/index.ts', binding }, originalOwner: provider, importedModule: provider,
      classification, consumerFiles: [`${consumer}/src/use.ts`], importedFiles: [`${provider}/src/index.ts`],
      originalFiles: [`${provider}/src/index.ts`], accessIds: ['access-1'], status: 'allowed', reasons: ['exposed'], coverageIds: [] });
    const behavioralEvidence = Array.from({ length: behavioral }, (_, index) => evidence('root/a', 'root/b', 'behavioral', `act${index}`));
    const imported = (id: string, consumer: string, provider: string, b: number, nb: number, rows: unknown[]) => ({
      id: `dependency-edge/1:imported-module:${id}`, projection: 'imported-module', consumer, provider,
      counts: { behavioralUsedOriginals: b, nonBehavioralUsedOriginals: nb },
      originalOwners: [{ owner: provider, counts: { behavioralUsedOriginals: b, nonBehavioralUsedOriginals: nb } }], evidence: rows });
    const owner = (id: string, consumer: string, provider: string, b: number, nb: number, rows: unknown[]) => ({
      id: `dependency-edge/1:original-owner:${id}`, projection: 'original-owner', consumer, provider,
      counts: { behavioral: b, nonBehavioral: nb },
      importedThrough: [{ module: provider, counts: { behavioralUsedOriginals: b, nonBehavioralUsedOriginals: nb } }], evidence: rows });
    const zero = { behavioral: 0, nonBehavioral: 0 }, zeroImported = { behavioralUsedOriginals: 0, nonBehavioralUsedOriginals: 0 };
    return { schemaVersion: 'ramify.explorer-dependencies/1', inputId: options.inputId ?? inputOf(sequence), state: 'complete',
      project: { behavioral, nonBehavioral: 1 },
      modules: [
        { id: 'root', uses: zero, usedThrough: zeroImported, ownedUsedByOthers: zero },
        { id: 'root/a', uses: { behavioral, nonBehavioral: 0 }, usedThrough: { behavioralUsedOriginals: 0, nonBehavioralUsedOriginals: 1 },
          ownedUsedByOthers: { behavioral: 0, nonBehavioral: 1 } },
        { id: 'root/b', uses: { behavioral: 0, nonBehavioral: 1 }, usedThrough: { behavioralUsedOriginals: behavioral, nonBehavioralUsedOriginals: 0 },
          ownedUsedByOthers: { behavioral, nonBehavioral: 0 } },
      ],
      importedModuleEdges: [imported('ab', 'root/a', 'root/b', behavioral, 0, behavioralEvidence),
        imported('ba', 'root/b', 'root/a', 0, 1, [evidence('root/b', 'root/a', 'non-behavioral', 'Shape')])],
      originalOwnerEdges: [owner('ab', 'root/a', 'root/b', behavioral, 0, behavioralEvidence),
        owner('ba', 'root/b', 'root/a', 0, 1, [evidence('root/b', 'root/a', 'non-behavioral', 'Shape')])],
      coverage: { unknownDependencies: 0, limitIds: [] } } as unknown as ExplorerDependencyModel;
  }

  const ready = (sequence: number, options?: Parameters<typeof dependencies>[1]): DependencyResult =>
    ({ status: 'ready', revision: revision(sequence), view: dependencies(sequence, options) });
  const pending = (sequence: number, phase: 'waiting' | 'analyzing' = 'analyzing'): DependencyResult =>
    ({ status: 'pending', revision: revision(sequence), phase });
  const state = () => document.querySelector('.module-arch__dependency-status')?.getAttribute('data-dependency-state');
  const links = () => screen.queryAllByRole('button', { name: /^root\/[ab] to root\/[ab]$/ }).map(button => button.textContent);

  interface Recorder { readonly calls: { readonly kind: 'project' | 'dependency'; readonly revision?: string; readonly at: number }[] }
  function recording(respond: {
    project(input: { revision?: string }): Promise<Awaited<ReturnType<ExplorerClient['projectView']>>>;
    dependency(input: { revision: string }, index: number): Promise<DependencyResult>;
    status(): ServerStatusResult;
  }): ExplorerClient & Recorder {
    const calls: Recorder['calls'][number][] = [];
    let dependencyCalls = 0;
    return {
      calls,
      async projectView(input) { calls.push({ kind: 'project', revision: input.revision, at: performance.now() }); return respond.project(input); },
      async dependencyView(input) { calls.push({ kind: 'dependency', revision: input.revision, at: performance.now() }); return respond.dependency(input, dependencyCalls++); },
      async serverStatus() { return respond.status(); },
      async explorerDetails() { return { status: 'unavailable', reason: 'unused' }; },
    };
  }
  const dependencyCalls = (client: Recorder) => client.calls.filter(call => call.kind === 'dependency');

  it('requests the displayed revision after the project view, polls pending one second apart, stops on ready and never requests for settings', async () => {
    const client = recording({
      project: async () => ({ status: 'ready', revision: revision(1), view: project(1) }),
      dependency: async (_input, index) => index < 2 ? pending(1, index === 0 ? 'analyzing' : 'waiting') : ready(1),
      status: () => status(1),
    });
    render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} />);
    await screen.findByText(`Revision ${revisionId(1)}`);
    await waitFor(() => expect(state()).toBe('complete'), { timeout: 5000 });
    const requests = dependencyCalls(client);
    expect(requests.map(call => call.revision)).toEqual([revisionId(1), revisionId(1), revisionId(1)]);
    expect(client.calls.findIndex(call => call.kind === 'project')).toBeLessThan(client.calls.findIndex(call => call.kind === 'dependency'));
    for (let index = 1; index < requests.length; index++) expect(requests[index]!.at - requests[index - 1]!.at).toBeGreaterThanOrEqual(950);
    expect(links()).toEqual(['root/a to root/b']);
    expect(screen.getByText(/Showing 2 of 3 modules, 1 displayed link$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show non-behavioral dependencies' }));
    expect(links()).toEqual(['root/a to root/b', 'root/b to root/a']);
    fireEvent.click(screen.getByRole('radio', { name: 'Original owners' }));
    expect(screen.getByRole('radio', { name: 'Original owners' })).toHaveAttribute('aria-checked', 'true');
    expect(links()).toEqual(['root/a to root/b', 'root/b to root/a']);
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(dependencyCalls(client)).toHaveLength(3);
  }, 15_000);

  it('issues no dependency request while the page is hidden and resumes when it becomes visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const client = recording({
        project: async () => ({ status: 'ready', revision: revision(1), view: project(1) }),
        dependency: async (_input, index) => index === 0 ? pending(1) : ready(1),
        status: () => status(1),
      });
      render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} />);
      await screen.findByText(`Revision ${revisionId(1)}`);
      await new Promise(resolve => setTimeout(resolve, 1200));
      expect(dependencyCalls(client)).toHaveLength(0);
      expect(state()).toBe('idle');

      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(state()).toBe('analyzing'));
      // Hidden again before the next poll: the pending request is not polled.
      visibility.mockReturnValue('hidden');
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(dependencyCalls(client)).toHaveLength(1);
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(state()).toBe('complete'));
      expect(dependencyCalls(client)).toHaveLength(2);
    } finally { visibility.mockRestore(); }
  }, 15_000);

  it('keeps a ready graph stale after a newer publication; refresh loads the project first and never mixes it with old counts', async () => {
    let published = status(1);
    const next = deferred<DependencyResult>();
    const client = recording({
      project: async () => { const current = published.published!; return { status: 'ready', revision: current, view: project(current.sequence) }; },
      dependency: async input => input.revision === revisionId(1) ? ready(1) : next.promise,
      status: () => published,
    });
    render(<ProjectExplorerPage client={client} pollIntervalMs={20} />);
    await waitFor(() => expect(state()).toBe('complete'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show non-behavioral dependencies' }));

    published = status(2);
    const refresh = await screen.findByRole('button', { name: 'Refresh (stale)' });
    expect(state()).toBe('stale');
    expect(screen.getByText(`Stale dependency diagram for input ${inputOf(1)}. Refresh to update.`)).toBeInTheDocument();
    expect(links()).toEqual(['root/a to root/b', 'root/b to root/a']);
    expect(screen.getByText(`Revision ${revisionId(1)}`)).toBeInTheDocument();
    expect(dependencyCalls(client)).toHaveLength(1);

    const before = client.calls.length;
    fireEvent.click(refresh);
    await screen.findByText(`Revision ${revisionId(2)}`);
    // The new project model is displayed without the earlier revision's links or counts.
    await waitFor(() => expect(state()).toBe('analyzing'));
    expect(links()).toEqual([]);
    expect(screen.queryByText(inputOf(1))).not.toBeInTheDocument();
    expect(client.calls.slice(before).map(call => [call.kind, call.revision])).toEqual([['project', revisionId(2)], ['dependency', revisionId(2)]]);

    next.resolve(ready(2, { behavioral: 2 }));
    await waitFor(() => expect(state()).toBe('complete'));
    // Settings persist across refresh of the mounted page.
    expect(screen.getByRole('checkbox', { name: 'Show non-behavioral dependencies' })).toBeChecked();
    expect(links()).toEqual(['root/a to root/b', 'root/b to root/a']);
    expect(screen.getByText(inputOf(2))).toBeInTheDocument();
  }, 15_000);

  it('discards a late response to the earlier revision and refuses a ready result for another input', async () => {
    let published = status(1);
    const late = deferred<DependencyResult>();
    const client = recording({
      project: async () => { const current = published.published!; return { status: 'ready', revision: current, view: project(current.sequence) }; },
      dependency: async input => input.revision === revisionId(1) ? late.promise : ready(2, { behavioral: 3 }),
      status: () => published,
    });
    render(<ProjectExplorerPage client={client} pollIntervalMs={20} />);
    await waitFor(() => expect(dependencyCalls(client)).toHaveLength(1));
    published = status(2);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh (stale)' }));
    await waitFor(() => expect(state()).toBe('complete'));
    expect(screen.getByText(inputOf(2))).toBeInTheDocument();

    late.resolve(ready(1, { behavioral: 1 }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByText(`Revision ${revisionId(2)}`)).toBeInTheDocument();
    expect(screen.getByText(inputOf(2))).toBeInTheDocument();
    expect(screen.queryByText(inputOf(1))).not.toBeInTheDocument();
    expect(state()).toBe('complete');
    cleanup();

    const mismatched = recording({
      project: async () => ({ status: 'ready', revision: revision(1), view: project(1) }),
      dependency: async () => ready(1, { inputId: 'input/1:other' }),
      status: () => status(1),
    });
    render(<ProjectExplorerPage client={mismatched} pollIntervalMs={60_000} />);
    await waitFor(() => expect(state()).toBe('unavailable'));
    expect(links()).toEqual([]);
    expect(screen.getAllByText(/does not match the displayed revision and input/).length).toBeGreaterThan(0);
  }, 15_000);

  it('stops polling on superseded and on unavailable', async () => {
    for (const answer of [
      { status: 'superseded', current: revisionId(2), reason: 'The requested revision is no longer the published revision' },
      { status: 'unavailable', reason: 'analysis-failed: helper exited' },
    ] as const) {
      const client = recording({
        project: async () => ({ status: 'ready', revision: revision(1), view: project(1) }),
        dependency: async () => answer,
        status: () => status(1),
      });
      render(<ProjectExplorerPage client={client} pollIntervalMs={60_000} />);
      await waitFor(() => expect(state()).toBe(answer.status));
      await new Promise(resolve => setTimeout(resolve, 1300));
      expect(dependencyCalls(client)).toHaveLength(1);
      expect(screen.getAllByText(new RegExp(answer.reason)).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Module A' })).toBeInTheDocument();
      cleanup();
    }
  }, 15_000);
});

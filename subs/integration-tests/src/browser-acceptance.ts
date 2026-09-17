import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chmod, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, symlink, writeFile, copyFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { connectDaemon } from '../../daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../daemon/src/discovery.js';
import type { EndpointSelection, ServiceConnection } from '../../daemon/src/interfaces/daemon.js';
import type { CheckOutcome, ContextRevision, ContextToken } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectExplorerModel } from '../../service-api/src/project-view.js';
import type { ExplorerProcessRecord, ServerStatusResult } from '../../service-api/src/interfaces/explorer-service.js';
import { explorerProjectKey, readExplorerProcessRecord, selectExplorerEndpoint } from '../../service-api/src/web-discovery.js';
import type { ProjectExplorerModel } from '../../presentation/subs/project-view/src/interfaces/project-view.js';

const packageRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const chromiumPath = process.env.RAMIFY_CHROMIUM ?? '/usr/bin/chromium';
const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;
const ignored = new Set(['node_modules', 'dist', '.git', '.reference-work', 'site', 'examples', '.cucumber-viz',
  '.claude', '.agents', '.devcontainer', '.github', '.vite']);

type ReadyCheck = Extract<CheckOutcome, { readonly status: 'reported'; readonly published: true }>;
type ReadyProjection = Extract<ReturnType<typeof createProjectExplorerModel>, { readonly status: 'ready' }>;

interface BrowserSnapshot {
  readonly listeners: number;
  readonly listenerTypes: Readonly<Record<string, number>>;
  readonly intervals: number;
  readonly timeouts: number;
  readonly models: number;
  readonly graphNodes: number;
  readonly graphEdges: number;
  readonly revision: string | null;
}

async function copyTree(from: string, to: string, excluded: ReadonlySet<string>): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (excluded.has(entry.name) || /^\.ramify(?:\.(?:tmp|old)-[0-9a-f]+)?$/.test(entry.name)) continue;
    const source = join(from, entry.name), destination = join(to, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await copyTree(source, destination, excluded);
    else await copyFile(source, destination);
  }
}

async function isolatedProject(kind: 'reference' | 'toolkit', scratch: string): Promise<{ root: string; dispose(): Promise<void> }> {
  const root = await mkdtemp(join(scratch, `${kind}-`));
  const source = kind === 'reference' ? join(packageRoot, 'examples/collection-review') : packageRoot;
  await copyTree(source, root, kind === 'reference'
    ? new Set(['node_modules', 'dist', '.reference-work', '.git', '.vite']) : ignored);
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
  return { root: await realpath(root), dispose: () => rm(root, { recursive: true, force: true }) };
}

async function put(root: string, path: string, value: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value);
}

async function mutationProject(scratch: string): Promise<{ root: string; dispose(): Promise<void> }> {
  const root = await realpath(await mkdtemp(join(scratch, 'mutations-')));
  const files: Readonly<Record<string, string>> = {
    'module.ramify': 'ramify 1\nmodule fixture\n',
    'README.md': '# Fixture\n\nOwns the mutation acceptance project.\n',
    'package.json': '{"type":"module"}\n',
    'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
    'src/index.ts': 'export const rootValue = 1;\n',
    'subs/provider/module.ramify': 'ramify 1\nmodule provider\nexpose-src publicValue from "interfaces/api.ts" to parent\n',
    'subs/provider/README.md': '# Provider\n\nProvides the initial browser value.\n',
    'subs/provider/src/interfaces/api.ts': 'export const publicValue = 1;\nexport const extra = 2;\n',
    'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
    'subs/consumer/README.md': '# Consumer\n\nConsumes the provider value.\n',
    'subs/consumer/src/use.ts': "import { publicValue } from '../../provider/src/interfaces/api.js';\nvoid publicValue;\n",
  };
  for (const [path, value] of Object.entries(files)) await put(root, path, value);
  await symlink(join(packageRoot, 'node_modules'), join(root, 'node_modules'));
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function waitForPidExit(pid: number): Promise<void> {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    try { process.kill(pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error; }
    await new Promise(resolvePause => setTimeout(resolvePause, 25));
  }
  throw new Error(`Process ${pid} survived cleanup`);
}

async function installBrowserInstrumentation(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: `(() => {
    const targetIds = new WeakMap(), listenerIds = new WeakMap();
    let nextTargetId = 1, nextListenerId = 1;
    const listeners = new Map(), onceWrappers = new Map(), intervals = new Set(), timeouts = new Set();
    const id = (map, value, next) => { let found = map.get(value); if (!found) { found = next(); map.set(value, found); } return found; };
    const key = (target, type, listener, options) => {
      const targetId = id(targetIds, target, () => nextTargetId++);
      const listenerId = id(listenerIds, listener, () => nextListenerId++);
      const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
      return targetId + ':' + type + ':' + listenerId + ':' + capture;
    };
    Object.defineProperty(window, '__ramifyAcceptanceSnapshot', { configurable: false, value: () => {
      const byType = {}; for (const type of listeners.values()) byType[type] = (byType[type] || 0) + 1;
      return { listeners: listeners.size, listenerTypes: byType, intervals: intervals.size, timeouts: timeouts.size,
        models: document.querySelectorAll('.module-arch__revision').length,
        graphNodes: document.querySelectorAll('.react-flow__node').length,
        graphEdges: document.querySelectorAll('.react-flow__edge').length,
        revision: document.querySelector('.module-arch__revision')?.textContent || null };
    } });
    const originalAdd = EventTarget.prototype.addEventListener, originalRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (!listener) return originalAdd.call(this, type, listener, options);
      if (this !== window && this !== document) return originalAdd.call(this, type, listener, options);
      const listenerKey = key(this, type, listener, options); listeners.set(listenerKey, type);
      if (typeof options === 'object' && options && options.once) {
        const wrapped = function(...values) {
          listeners.delete(listenerKey); onceWrappers.delete(listenerKey);
          return typeof listener === 'function' ? listener.apply(this, values) : listener.handleEvent(...values);
        };
        onceWrappers.set(listenerKey, wrapped); return originalAdd.call(this, type, wrapped, options);
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (!listener) return originalRemove.call(this, type, listener, options);
      if (this !== window && this !== document) return originalRemove.call(this, type, listener, options);
      const listenerKey = key(this, type, listener, options), wrapped = onceWrappers.get(listenerKey);
      listeners.delete(listenerKey); onceWrappers.delete(listenerKey);
      return originalRemove.call(this, type, wrapped || listener, options);
    };
    const nativeSetInterval = window.setInterval.bind(window), nativeClearInterval = window.clearInterval.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window), nativeClearTimeout = window.clearTimeout.bind(window);
    window.setInterval = (handler, timeout, ...args) => { const timer = nativeSetInterval(handler, timeout, ...args); intervals.add(timer); return timer; };
    window.clearInterval = timer => { intervals.delete(timer); nativeClearInterval(timer); };
    window.setTimeout = (handler, timeout, ...args) => {
      let timer = 0; const wrapped = typeof handler === 'function' ? (...values) => { timeouts.delete(timer); handler(...values); } : handler;
      timer = nativeSetTimeout(wrapped, timeout, ...args); timeouts.add(timer); return timer;
    };
    window.clearTimeout = timer => { timeouts.delete(timer); nativeClearTimeout(timer); };
  })();` });
}

async function snapshot(page: Page): Promise<BrowserSnapshot> {
  const read = () => page.evaluate(() => (window as unknown as { __ramifyAcceptanceSnapshot(): BrowserSnapshot }).__ramifyAcceptanceSnapshot());
  const deadline = performance.now() + 3000;
  let previous: BrowserSnapshot | undefined;
  while (performance.now() < deadline) {
    await page.waitForTimeout(100);
    const current = await read();
    if (previous && current.timeouts === 0 && current.listeners === previous.listeners
      && current.intervals === previous.intervals && current.models === previous.models
      && current.graphNodes === previous.graphNodes && current.graphEdges === previous.graphEdges) return current;
    previous = current;
  }
  return previous ?? read();
}

async function clickGraphNode(page: Page, id: string, double = false): Promise<void> {
  const found = await page.locator('.react-flow__node').evaluateAll((nodes, input) => {
    const node = nodes.find(item => item.getAttribute('data-id') === input.id);
    if (!node) return false;
    node.dispatchEvent(new MouseEvent(input.double ? 'dblclick' : 'click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, { id, double });
  assert.ok(found, `Graph node ${id} was not rendered`);
}

async function clickGraphEdge(page: Page, id: string): Promise<void> {
  const found = await page.locator('.react-flow__edge').evaluateAll((edges, input) => {
    const edge = edges.find(item => item.getAttribute('data-testid') === `rf__edge-${input}`);
    if (!edge) return false;
    edge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, id);
  assert.ok(found, `Graph edge ${id} was not rendered`);
}

function initialVisible(model: ProjectExplorerModel): readonly string[] {
  const top = model.modules.filter(module => module.parent === null);
  const root = model.modules.find(module => module.id === model.rootModuleId);
  return top.length === 1 && root && root.children.length > 0 ? root.children : top.map(module => module.id);
}

function expectedSubtitle(model: ProjectExplorerModel): string {
  const visible = new Set(initialVisible(model));
  const edges = model.edges.filter(edge => visible.has(edge.consumer) && visible.has(edge.provider)).length;
  return `Showing ${visible.size} of ${model.modules.length} modules, ${edges} module dependencies`;
}

function reportExternalWitness(check: ReadyCheck): Record<string, unknown> {
  const accesses = check.report!.snapshot!.accesses;
  const nonApplication = accesses.filter(access => access.target.kind !== 'application');
  assert.ok(nonApplication.length > 0, 'Published analysis report has no non-application access witness');
  return {
    totalAccesses: accesses.length,
    nonApplicationAccesses: nonApplication.length,
    targetKinds: [...new Set(nonApplication.map(access => access.target.kind))].sort(),
    specifiers: [...new Set(nonApplication.map(access => access.specifier).filter(value => value !== null))].sort(),
  };
}

function assertModuleOnlyModel(model: ProjectExplorerModel): void {
  const moduleIds = new Set(model.modules.map(module => module.id));
  assert.ok(model.modules.length > 1, 'Module-only projection lost its positive module control');
  assert.ok(model.edges.length > 0, 'Module-only projection lost its positive dependency-edge control');
  for (const edge of model.edges) {
    assert.ok(moduleIds.has(edge.consumer), `Explorer edge consumer is not a declared module: ${edge.consumer}`);
    assert.ok(moduleIds.has(edge.provider), `Explorer edge provider is not a declared module: ${edge.provider}`);
  }
  const encoded = JSON.stringify(model);
  assert.ok(!encoded.includes('otherTargets'), 'Explorer JSON retained otherTargets');
  assert.ok(!encoded.includes('targetIds'), 'Explorer JSON retained targetIds');
}

function topology(model: ProjectExplorerModel): Record<string, unknown> {
  return {
    modules: model.modules.map(module => ({ id: module.id, parent: module.parent, children: module.children })),
    edges: model.edges.map(edge => ({ id: edge.id, consumer: edge.consumer, provider: edge.provider })),
  };
}

function visibleImportMetrics(model: ProjectExplorerModel): Record<string, unknown> {
  return {
    summary: { edges: model.summary.edges, accessOccurrences: model.summary.accessOccurrences,
      selectedSymbols: model.summary.selectedSymbols, deniedAccesses: model.summary.deniedAccesses,
      limitedAccesses: model.summary.limitedAccesses },
    modules: model.modules.map(module => ({ id: module.id, dependencies: module.metrics.dependencies,
      dependents: module.metrics.dependents, accessOccurrences: module.metrics.accessOccurrences,
      selectedSymbols: module.metrics.selectedSymbols, deniedAccesses: module.metrics.deniedAccesses,
      limitedAccesses: module.metrics.limitedAccesses })),
    edges: model.edges.map(edge => ({ id: edge.id, accessCount: edge.accessCount, symbolCount: edge.symbolCount,
      status: edge.status, reasons: edge.reasons })),
  };
}

async function assertModuleOnlyDom(page: Page, model: ProjectExplorerModel): Promise<Record<string, unknown>> {
  const moduleIds = new Set(model.modules.map(module => module.id));
  const edgeIds = new Set(model.edges.map(edge => edge.id));
  const renderedNodes = await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
  const renderedEdges = await page.locator('.react-flow__edge').evaluateAll(edges => edges.map(edge =>
    edge.getAttribute('data-testid')?.replace(/^rf__edge-/, '') ?? null));
  assert.ok(renderedNodes.every(id => id !== null && moduleIds.has(id)), `Rendered a non-module node: ${JSON.stringify(renderedNodes)}`);
  assert.ok(renderedEdges.every(id => id !== null && edgeIds.has(id)), `Rendered a non-module edge: ${JSON.stringify(renderedEdges)}`);
  assert.equal(await page.getByRole('heading', { name: 'Other target' }).count(), 0);
  return { renderedNodes, renderedEdges, otherTargetDetails: 0 };
}

async function checkPublished(connection: ServiceConnection, token: ContextToken): Promise<ReadyCheck> {
  const result = await connection.check({ token, requestId: `acceptance-${crypto.randomUUID()}`, scope: 'report',
    freshness: { mode: 'published', wait: true }, deadlineMs: 120_000 });
  assert.ok(result.ok, result.ok ? '' : result.error.message);
  assert.equal(result.value.status, 'reported', JSON.stringify(result.value));
  assert.equal(result.value.published, true, JSON.stringify(result.value));
  assert.ok(result.value.report && result.value.revision);
  return result.value as ReadyCheck;
}

async function publishMutation(connection: ServiceConnection, token: ContextToken, root: string,
  path: string, value: string): Promise<ReadyCheck> {
  await put(root, path, value);
  const result = await connection.check({ token, requestId: `mutation-${crypto.randomUUID()}`, scope: 'report',
    freshness: { mode: 'synchronized', expect: [{ path, sha256: sha256(Buffer.from(value)) }] }, deadlineMs: 120_000 });
  assert.ok(result.ok, result.ok ? '' : result.error.message);
  assert.equal(result.value.status, 'reported', JSON.stringify(result.value));
  assert.equal(result.value.published, true, JSON.stringify(result.value));
  assert.ok(result.value.report && result.value.revision);
  return result.value as ReadyCheck;
}

async function refreshTo(page: Page, revision: ContextRevision): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const refresh = page.getByRole('button', { name: 'Refresh (stale)' });
  await refresh.waitFor({ state: 'visible', timeout: 15_000 });
  await refresh.click();
  await page.locator('.module-arch__revision').filter({ hasText: revision.revision }).waitFor({ timeout: 120_000 });
}

async function exerciseReference(page: Page, model: ProjectExplorerModel): Promise<Record<string, unknown>> {
  const visible = initialVisible(model);
  assert.equal(await page.locator('.module-arch__subtitle').textContent(), expectedSubtitle(model));
  const module = model.modules.find(item => visible.includes(item.id) && item.exports.length > 0) ?? model.modules.find(item => visible.includes(item.id));
  assert.ok(module, 'Reference graph has no selectable visible module');
  await clickGraphNode(page, module.id);
  await page.locator('.module-arch__detail-name').filter({ hasText: module.name }).waitFor();
  let detailState = 'no-export';
  if (module.exports.length > 0) {
    await page.locator('.export-list__toggle').first().click();
    await page.locator('.export-list__signature-loading').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    detailState = await page.locator('.export-list__signature-container').first().innerText();
    await page.locator('.export-list__locations').first().waitFor();
  }

  const edgeIds = await page.locator('.react-flow__edge').evaluateAll(edges => edges.map(edge =>
    edge.getAttribute('data-testid')?.replace(/^rf__edge-/, '') ?? ''));
  const moduleEdge = model.edges.find(edge => edgeIds.includes(edge.id));
  assert.ok(moduleEdge, 'Reference graph has no rendered module edge');
  await clickGraphEdge(page, moduleEdge.id);
  await page.getByRole('heading', { name: 'Dependency Edge' }).waitFor();

  const sidebar = page.locator('.module-arch__sidebar');
  const separator = page.getByRole('separator', { name: 'Resize sidebar' });
  const beforeWidth = (await sidebar.boundingBox())!.width;
  const box = await separator.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down(); await page.mouse.move(box.x - 80, box.y + 20, { steps: 4 }); await page.mouse.up();
  const afterWidth = (await sidebar.boundingBox())!.width;
  assert.ok(afterWidth > beforeWidth + 30, `Sidebar did not resize: ${beforeWidth} -> ${afterWidth}`);

  const viewport = page.locator('.react-flow__viewport');
  const transformBefore = await viewport.getAttribute('style');
  await page.locator('.react-flow__controls-zoomin').click();
  await page.waitForTimeout(100);
  const transformZoom = await viewport.getAttribute('style');
  assert.notEqual(transformZoom, transformBefore, 'Zoom did not change the viewport transform');
  const pane = page.locator('.react-flow__pane');
  const paneBox = await pane.boundingBox(); assert.ok(paneBox);
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  await page.mouse.down(); await page.mouse.move(paneBox.x + paneBox.width / 2 + 70, paneBox.y + paneBox.height / 2 + 40, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(100);
  const transformPan = await viewport.getAttribute('style');
  assert.notEqual(transformPan, transformZoom, 'Pan did not change the viewport transform');

  const drill = model.modules.find(item => visible.includes(item.id) && item.children.length > 0);
  if (drill) {
    await clickGraphNode(page, drill.id, true);
    await page.getByRole('navigation', { name: 'Module navigation' }).waitFor();
    await page.getByRole('button', { name: 'All Modules' }).click();
  }
  const filter = page.locator('.module-arch__filter-item').filter({ has: page.locator('input:not(:disabled):checked') }).first();
  const checked = filter.locator('input');
  const beforeFilter = await page.locator('.react-flow__node').count();
  await checked.click();
  await page.waitForTimeout(100);
  const afterFilter = await page.locator('.react-flow__node').count();
  assert.ok(afterFilter < beforeFilter, `Filter did not reduce graph nodes: ${beforeFilter} -> ${afterFilter}`);
  await checked.click();
  return { module: module.id, moduleEdge: moduleEdge.id, detailState,
    sidebar: { beforeWidth, afterWidth }, viewport: { before: transformBefore, zoom: transformZoom, pan: transformPan },
    filter: { beforeNodes: beforeFilter, afterNodes: afterFilter }, navigation: drill?.id ?? 'no-nested-visible-module' };
}

const version = '0.0.0';
const explorerEntry = join(packageRoot, 'dist/src/explorer-entry.js');
const ramifyCommand = join(packageRoot, 'dist/src/ramify');

const pause = (ms: number) => new Promise<void>(resolvePause => setTimeout(resolvePause, ms));

async function until<T>(read: () => Promise<T | null | undefined | false>, timeoutMs: number, describe: () => string | Promise<string>): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (performance.now() > deadline) throw new Error(`Condition not reached within ${timeoutMs} ms: ${await describe()}`);
    await pause(100);
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

/** Resident set size from procfs; the acceptance host is Linux. */
async function rss(pid: number): Promise<{ readonly pid: number; readonly rssBytes: number; readonly peakRssBytes: number }> {
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  const field = (name: string) => Number(new RegExp(`^${name}:\\s+(\\d+) kB$`, 'm').exec(status)?.[1] ?? Number.NaN) * 1024;
  return { pid, rssBytes: field('VmRSS'), peakRssBytes: field('VmHWM') };
}

/** RSS of a process plus its descendants, such as the daemon's per-context session supervisors. */
async function treeRss(pid: number): Promise<{ readonly pid: number; readonly rssBytes: number; readonly peakRssBytes: number;
  readonly descendants: readonly { readonly pid: number; readonly rssBytes: number }[]; readonly treeRssBytes: number }> {
  const parents = new Map<number, number[]>();
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const stat = await readFile(`/proc/${name}/stat`, 'utf8').catch(() => null);
    const parent = stat ? Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) : Number.NaN;
    if (Number.isSafeInteger(parent)) parents.set(parent, [...(parents.get(parent) ?? []), Number(name)]);
  }
  const own = await rss(pid), descendants: { pid: number; rssBytes: number }[] = [];
  const pending = [...(parents.get(pid) ?? [])];
  while (pending.length > 0) {
    const child = pending.shift()!;
    const measured = await rss(child).catch(() => null);
    if (measured) descendants.push({ pid: child, rssBytes: measured.rssBytes });
    pending.push(...(parents.get(child) ?? []));
  }
  return { ...own, descendants, treeRssBytes: own.rssBytes + descendants.reduce((sum, item) => sum + item.rssBytes, 0) };
}

/** Processes whose command line runs the explorer entry for exactly this root. */
async function explorerPids(root: string): Promise<number[]> {
  const pids: number[] = [];
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const args = (await readFile(`/proc/${name}/cmdline`, 'utf8').catch(() => '')).split('\0');
    const rootIndex = args.indexOf('--root');
    if (args.some(arg => arg.endsWith('dist/src/explorer-entry.js')) && rootIndex >= 0 && args[rootIndex + 1] === root) pids.push(Number(name));
  }
  return pids.sort((a, b) => a - b);
}

interface Isolated { readonly processRoot: string; readonly directory: string; readonly endpoint: EndpointSelection }

/** A private endpoint directory: no daemon or server of another session is ever touched. */
async function isolatedEndpoint(): Promise<Isolated> {
  const processRoot = await realpath(await mkdtemp(join('/tmp', 'rx6b-')));
  const directory = join(processRoot, 'e'); await mkdir(directory, { mode: 0o700 });
  return { processRoot, directory, endpoint: await selectEndpoint({ packageRoot, version, endpointDirectory: directory }) };
}

async function connectHarness(isolated: Isolated, start: 'if-needed' | 'never', name: string): Promise<ServiceConnection> {
  const connected = await connectDaemon({ start, client: { name, version }, engine: `ramify.ts@${version}+typescript@7.0.2`,
    daemonEntry: start === 'never' ? null : join(packageRoot, 'dist/src/daemon-entry.js'), packageRoot, endpointDirectory: isolated.directory });
  assert.equal(connected.status, 'connected', JSON.stringify(connected));
  return (connected as Extract<typeof connected, { status: 'connected' }>).connection;
}

async function openProject(connection: ServiceConnection, root: string): Promise<ContextToken> {
  const opened = await connection.openContext({ project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
    setup: { registry: 'default', capabilities } });
  assert.ok(opened.ok && opened.value.status === 'opened', JSON.stringify(opened));
  return opened.value.token;
}

/** Stop the isolated daemon, if one runs, and wait for its process to exit. */
async function stopIsolatedDaemon(isolated: Isolated): Promise<void> {
  const record = await readDaemonRecord(isolated.endpoint).catch(() => null);
  if (!record || record.state === 'stopped' || !alive(record.pid)) return;
  const connected = await connectDaemon({ start: 'never', client: { name: 'acceptance-cleanup', version },
    engine: `ramify.ts@${version}+typescript@7.0.2`, daemonEntry: null, packageRoot, endpointDirectory: isolated.directory }).catch(() => null);
  if (connected?.status === 'connected') {
    await connected.connection.stopDaemon({ instanceId: connected.connection.daemon.instance.instanceId }).catch(() => {});
    await connected.connection.close().catch(() => {});
  }
  await waitForPidExit(record.pid).catch(() => { if (alive(record.pid)) process.kill(record.pid, 'SIGKILL'); });
}

async function stopServerPid(pid: number): Promise<void> {
  if (!alive(pid)) return;
  process.kill(pid, 'SIGTERM');
  await waitForPidExit(pid).catch(() => { if (alive(pid)) process.kill(pid, 'SIGKILL'); });
}

async function serverStatus(record: Pick<ExplorerProcessRecord, 'origin'>): Promise<ServerStatusResult> {
  const response = await fetch(`${record.origin}/trpc/serverStatus`);
  const body = await response.json() as { result?: { data?: ServerStatusResult } };
  assert.ok(response.ok && body.result?.data, JSON.stringify(body));
  return body.result.data;
}

async function daemonRecordEvidence(isolated: Isolated): Promise<Record<string, unknown> | null> {
  const record = await readDaemonRecord(isolated.endpoint);
  return record && { pid: record.pid, instanceId: record.instanceId, state: record.state, stopped: record.stopped,
    startedAt: record.startedAt, alive: alive(record.pid) };
}

interface CommandResult { readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly stdout: string; readonly stderr: string; readonly durationMs: number }

function runCommand(args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs = 180_000): Promise<CommandResult> {
  const started = performance.now();
  return new Promise((resolveRun, reject) => {
    const child = spawn(ramifyCommand, args, { cwd: packageRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', text => { stdout += text; });
    child.stderr.setEncoding('utf8').on('data', text => { stderr += text; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`ramify ${args.join(' ')} timed out: ${stdout} ${stderr}`)); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); resolveRun({ code, signal, stdout, stderr, durationMs: performance.now() - started }); });
  });
}

/** PATH directories for the installed CLI. `opener` records each URL instead of starting a desktop browser;
 * `no-opener` has no `xdg-open`, so the platform opener fails as on a host without one. */
async function commandPaths(scratch: string): Promise<{ readonly opener: string; readonly noOpener: string; readonly opened: string }> {
  const opener = join(scratch, 'bin-opener'), noOpener = join(scratch, 'bin-no-opener'), opened = join(scratch, 'opened.txt');
  for (const directory of [opener, noOpener]) {
    await mkdir(directory, { recursive: true });
    await symlink(process.execPath, join(directory, 'node'));
    for (const tool of ['uname', 'readlink']) await symlink(await realpath(`/usr/bin/${tool}`), join(directory, tool));
  }
  await writeFile(join(opener, 'xdg-open'), `#!/bin/sh\nprintf '%s\\n' "$1" >> '${opened}'\n`);
  await chmod(join(opener, 'xdg-open'), 0o755);
  return { opener, noOpener, opened };
}

function commandEnvironment(isolated: Isolated, path: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: path, RAMIFY_ENDPOINT_DIR: isolated.directory };
  delete env.NODE_OPTIONS; delete env.RAMIFY_DAEMON_ENTRY;
  return env;
}

/** Run `ramify explore --root` and return the discovered record of the server it printed. */
async function exploreWithCli(isolated: Isolated, root: string, path: string): Promise<{ readonly command: CommandResult;
  readonly url: string; readonly record: ExplorerProcessRecord }> {
  const command = await runCommand(['explore', '--root', root], commandEnvironment(isolated, path));
  assert.equal(command.code, 0, JSON.stringify(command));
  const url = /^Explorer: (\S+)$/m.exec(command.stdout)?.[1];
  assert.ok(url, JSON.stringify(command));
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/analysis\/latest$/);
  const records = (await readdir(isolated.directory)).filter(name => /^explorer-[0-9a-f]{16}-[0-9a-f]{16}\.json$/.test(name));
  const matching: ExplorerProcessRecord[] = [];
  for (const name of records) {
    const projectKey = name.slice(-21, -5);
    const record = await readExplorerProcessRecord(selectExplorerEndpoint(isolated.endpoint, projectKey));
    if (record && record.root === root && record.state === 'running') matching.push(record);
  }
  assert.equal(matching.length, 1, JSON.stringify({ records, matching }));
  assert.equal(url, `${matching[0]!.origin}/analysis/latest`);
  return { command, url, record: matching[0]! };
}

async function openExplorerPage(browser: Browser, url: string, viewport: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport });
  await installBrowserInstrumentation(context);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Project Explorer' }).waitFor({ timeout: 120_000 });
  return { context, page };
}

/** RS17: the Plan 6/6A workflow on a server that `ramify explore` started, at `/analysis/latest`. */
async function runFixture(kind: 'reference' | 'toolkit', project: { root: string }, scratch: string,
  browser: Browser, paths: Awaited<ReturnType<typeof commandPaths>>): Promise<Record<string, unknown>> {
  const isolated = await isolatedEndpoint();
  let connection: ServiceConnection | undefined;
  let serverPid: number | undefined;
  let context: BrowserContext | undefined;
  try {
    // A running daemon without this project's context: `ramify explore` opens the context cold.
    connection = await connectHarness(isolated, 'if-needed', `acceptance-${kind}`);
    const explored = await exploreWithCli(isolated, project.root, paths.opener);
    serverPid = explored.record.pid;
    const openedUrls = (await readFile(paths.opened, 'utf8')).trim().split('\n');
    assert.equal(openedUrls.at(-1), explored.url);
    const token = await openProject(connection, project.root);
    assert.equal(explorerProjectKey(token.context), explorerProjectKey(explored.record.context));
    const check = await checkPublished(connection, token);
    const projectionStarted = performance.now();
    const projected = createProjectExplorerModel({ revision: check.revision, report: check.report! });
    const projectionDurationMs = performance.now() - projectionStarted;
    assert.equal(projected.status, 'ready', JSON.stringify({ projected, outcome: check.report!.outcome,
      stages: check.report!.stages, diagnostics: check.report!.diagnostics, warnings: check.report!.warnings }));
    const ready = projected as ReadyProjection;
    const encodedBytes = Buffer.byteLength(JSON.stringify(ready.view));
    assertModuleOnlyModel(ready.view);
    const externalAccesses = reportExternalWitness(check);

    const opened = await openExplorerPage(browser, explored.url, { width: 1440, height: 1000 });
    context = opened.context; const page = opened.page;
    try { await page.locator('.module-arch__revision').filter({ hasText: ready.view.revision }).waitFor({ timeout: 60_000 }); }
    catch (error) { throw new Error(`Browser did not display ${ready.view.revision}: ${await page.locator('body').innerText()}`, { cause: error }); }
    assert.equal(await page.locator('.module-arch__subtitle').textContent(), expectedSubtitle(ready.view));
    const dom = await assertModuleOnlyDom(page, ready.view);
    const visible = new Set(initialVisible(ready.view));
    const visibleEdges = ready.view.edges.filter(edge => visible.has(edge.consumer) && visible.has(edge.provider)).length;
    const countEvidence = { displayed: await page.locator('.module-arch__subtitle').textContent(),
      displayedRevision: await page.locator('.module-arch__revision').textContent(),
      reportRevision: check.revision.revision,
      reportModules: check.report!.snapshot!.inventory!.modules.length, projectedModules: ready.view.modules.length,
      visibleModules: visible.size, reportAccesses: check.report!.snapshot!.accesses.length,
      projectedEdges: ready.view.edges.length, visibleEdges, encodedBytes };
    assert.equal(countEvidence.reportModules, countEvidence.projectedModules);

    const interactions = kind === 'reference' ? await exerciseReference(page, ready.view) : null;
    const refreshes: Record<string, unknown>[] = [];
    let refreshBaseline: BrowserSnapshot | null = null;
    if (kind === 'reference') {
      // Start the repeated-use observation from a clean, fully rendered page;
      // the preceding interaction workflow deliberately leaves selected UI.
      await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
      await page.locator('.module-arch__revision').filter({ hasText: ready.view.revision }).waitFor();
      refreshBaseline = await snapshot(page);
      const baseline = refreshBaseline;
      for (let cycle = 1; cycle <= 10; cycle++) {
        const published = await publishMutation(connection, token, project.root, 'README.md',
          `# Collection Review\n\nIteration 4 explicit refresh cycle ${cycle}.\n`);
        await refreshTo(page, published.revision);
        const settled = await snapshot(page);
        const stable: boolean = settled.listeners === baseline.listeners
          && settled.intervals === baseline.intervals && settled.timeouts === baseline.timeouts
          && settled.models === baseline.models && settled.graphNodes === baseline.graphNodes
          && settled.graphEdges === baseline.graphEdges;
        assert.ok(stable, `Refresh ${cycle} did not settle to baseline: ${JSON.stringify({ refreshBaseline, settled })}`);
        refreshes.push({ cycle, revision: published.revision, settled, stable });
      }
    }
    assert.equal(page.url(), explored.url, 'The explorer URL changed during the workflow');
    const daemon = await connection.daemonStatus(); assert.ok(daemon.ok, JSON.stringify(daemon));
    const webMemory = await rss(explored.record.pid);
    return { kind, root: project.root, url: explored.url, finalUrl: page.url(),
      explore: { exitCode: explored.command.code, durationMs: explored.command.durationMs, stdout: explored.command.stdout,
        stderr: explored.command.stderr, serverPid: explored.record.pid, defaultStartupMs: 5000 },
      revision: check.revision, projectionDurationMs, encodedBytes,
      counts: countEvidence, externalAccesses, dom, interactions, refreshBaseline, refreshes,
      memory: { web: webMemory, daemon: { ...(await treeRss(daemon.value.pid)), ...daemon.value.memory,
        contexts: daemon.value.contexts.map(item => ({ context: item.token.context, history: item.history,
          retainedBytes: item.retainedBytes, leases: item.leases, pending: item.pending })) } } };
  } finally {
    await context?.close().catch(() => {});
    if (serverPid !== undefined) await stopServerPid(serverPid);
    await connection?.close().catch(() => {});
    await stopIsolatedDaemon(isolated);
    await rm(isolated.processRoot, { recursive: true, force: true });
    void scratch;
  }
}

async function forcePoll(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

/** RS13–RS16 on the mutation fixture, against one server started as a process manager starts it. */
async function runMutations(project: { root: string }, other: { root: string }, scratch: string, browser: Browser,
  paths: Awaited<ReturnType<typeof commandPaths>>): Promise<Record<string, unknown>> {
  const isolated = await isolatedEndpoint();
  const probe = await new Promise<number>((resolvePort, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address() as AddressInfo; server.close(() => resolvePort(address.port)); });
  });
  const logPath = join(isolated.processRoot, 'server.log');
  const log = await open(logPath, 'w', 0o600);
  // Foreground, fixed port, environment-selected endpoint: exactly the PM2 `explorer` app's invocation.
  const server = spawn(process.execPath, [explorerEntry, '--root', project.root, '--port', String(probe)],
    { cwd: packageRoot, stdio: ['ignore', log.fd, log.fd], env: commandEnvironment(isolated, process.env.PATH ?? '') });
  const serverExit = new Promise<[number | null, NodeJS.Signals | null]>(resolveExit => server.once('exit', (code, signal) => resolveExit([code, signal])));
  const serverLog = () => readFile(logPath, 'utf8').catch(() => '');
  let connection: ServiceConnection | undefined;
  let context: BrowserContext | undefined;
  let otherServerPid: number | undefined;
  try {
    assert.ok(server.pid);
    const discovered = await until(async () => {
      const names = (await readdir(isolated.directory)).filter(name => /^explorer-[0-9a-f]{16}-[0-9a-f]{16}\.json$/.test(name));
      return names.length === 1 ? readExplorerProcessRecord(selectExplorerEndpoint(isolated.endpoint, names[0]!.slice(-21, -5))) : null;
    }, 120_000, serverLog);
    assert.equal(discovered.pid, server.pid); assert.equal(discovered.port, probe); assert.equal(discovered.root, project.root);
    const latestUrl = `${discovered.origin}/analysis/latest`;
    const daemonAtStart = await readDaemonRecord(isolated.endpoint);
    assert.ok(daemonAtStart && daemonAtStart.state === 'running', 'The server did not start the isolated daemon');

    connection = await connectHarness(isolated, 'never', 'acceptance-mutations');
    let token = await openProject(connection, project.root);
    assert.equal(token.context, discovered.context);
    const initial = await checkPublished(connection, token);

    // Home page: the page list, root and binding state.
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installBrowserInstrumentation(context);
    const page = await context.newPage();
    await page.goto(`${discovered.origin}/`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('heading', { name: 'Ramify', level: 1 }).waitFor();
    await page.locator('dd[data-binding="ready"]').waitFor({ timeout: 15_000 });
    const home = { binding: await page.locator('dd[data-binding]').getAttribute('data-binding'),
      text: await page.locator('dl').first().innerText() };
    assert.ok(home.text.includes(project.root), home.text);
    await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Module explorer' }).click();
    await page.waitForURL(latestUrl);
    await page.getByRole('heading', { name: 'Project Explorer' }).waitFor({ timeout: 120_000 });

    // RS13: an edit makes the control stale and the refresh shows it at the same URL.
    const initialProjection = createProjectExplorerModel({ revision: initial.revision, report: initial.report! });
    assert.equal(initialProjection.status, 'ready'); const initialModel = (initialProjection as ReadyProjection).view;
    assertModuleOnlyModel(initialModel);
    await page.locator('.module-arch__revision').filter({ hasText: initialModel.revision }).waitFor({ timeout: 60_000 });
    assert.equal(await page.getByRole('button', { name: 'Refresh', exact: true }).isDisabled(), true);

    const npmOnlySource = "import * as React from 'react';\nexport const reactVersion = React.version;\n";
    const npmOnly = await publishMutation(connection, token, project.root, 'subs/consumer/src/npm-only.ts', npmOnlySource);
    assert.ok(npmOnly.revision.sequence > initial.revision.sequence);
    assert.notEqual(npmOnly.report!.inputId, initial.report!.inputId);
    const initialAccesses = initial.report!.snapshot!.accesses;
    const npmOnlyAccesses = npmOnly.report!.snapshot!.accesses;
    assert.ok(npmOnlyAccesses.length > initialAccesses.length, 'npm-only edit did not change the analysis report');
    const npmWitness = npmOnlyAccesses.find(access => access.specifier === 'react' && access.target.kind === 'external');
    assert.ok(npmWitness, 'npm-only edit did not publish the expected external package access');
    const npmProjection = createProjectExplorerModel({ revision: npmOnly.revision, report: npmOnly.report! });
    assert.equal(npmProjection.status, 'ready'); const npmModel = (npmProjection as ReadyProjection).view;
    assert.deepEqual(topology(npmModel), topology(initialModel));
    assert.deepEqual(visibleImportMetrics(npmModel), visibleImportMetrics(initialModel));
    await refreshTo(page, npmOnly.revision);
    assert.equal(await page.locator('.module-arch__revision').textContent(), `Revision ${npmOnly.revision.revision}`);
    const npmDom = await assertModuleOnlyDom(page, npmModel);

    await clickGraphNode(page, 'fixture/provider');
    await page.locator('.module-arch__detail-description').filter({ hasText: 'Provides the initial browser value.' }).waitFor();
    const readme = await publishMutation(connection, token, project.root, 'subs/provider/README.md',
      '# Provider\n\nProvides the changed browser purpose.\n');
    await refreshTo(page, readme.revision);
    await page.locator('.module-arch__detail-description').filter({ hasText: 'Provides the changed browser purpose.' }).waitFor();

    const extraAccess = "import { publicValue } from '../../provider/src/interfaces/api.js';\nexport const again = publicValue;\n";
    const source = await publishMutation(connection, token, project.root, 'subs/consumer/src/use-again.ts', extraAccess);
    await refreshTo(page, source.revision);
    const sourceProjection = createProjectExplorerModel({ revision: source.revision, report: source.report! });
    assert.equal(sourceProjection.status, 'ready');
    const sourceModel = (sourceProjection as ReadyProjection).view;
    const sourceEdge = sourceModel.edges.find(item => item.consumer === 'fixture/consumer' && item.provider === 'fixture/provider');
    assert.ok(sourceEdge && sourceEdge.accessCount === 2, JSON.stringify(sourceEdge));
    await clickGraphEdge(page, sourceEdge.id);
    await page.getByRole('heading', { name: 'Dependency Edge' }).waitFor();
    assert.equal(await page.locator('.module-arch__metric').filter({ hasText: 'Access occurrences' })
      .locator('.module-arch__metric-value').textContent(), '2');

    const declaration = 'ramify 1\nmodule provider\nexpose-src publicValue, extra from "interfaces/api.ts" to parent\n';
    const exposure = await publishMutation(connection, token, project.root, 'subs/provider/module.ramify', declaration);
    await refreshTo(page, exposure.revision);
    const exposureProjection = createProjectExplorerModel({ revision: exposure.revision, report: exposure.report! });
    assert.equal(exposureProjection.status, 'ready');
    const exposureModel = (exposureProjection as ReadyProjection).view;
    const extra = exposureModel.modules.find(item => item.id === 'fixture/provider')?.exports.find(item => item.name === 'extra');
    if (!extra || !extra.exposures.some(item => item.destinations.includes('parent'))) {
      throw new Error(`Expected the extra export to be exposed to parent: ${JSON.stringify(extra)}`);
    }
    await clickGraphNode(page, 'fixture/provider');
    const extraToggle = page.locator('.export-list__toggle').filter({ hasText: 'extra' });
    await extraToggle.click();
    await extraToggle.locator('..').locator('.export-list__barrel-badge').filter({ hasText: 'parent' }).waitFor();
    assert.equal(page.url(), latestUrl);
    const rs13 = { url: latestUrl, finalUrl: page.url(), home, initialRevision: initial.revision,
      npmOnly: { revision: npmOnly.revision, reportInputBefore: initial.report!.inputId,
        reportInputAfter: npmOnly.report!.inputId, reportAccessesBefore: initialAccesses.length,
        reportAccessesAfter: npmOnlyAccesses.length, addedAccess: npmWitness.id,
        topology: topology(npmModel), visibleImportMetrics: visibleImportMetrics(npmModel), dom: npmDom },
      readme: { revision: readme.revision, visiblePurpose: 'Provides the changed browser purpose.' },
      source: { revision: source.revision, edge: sourceEdge.id, accessCount: sourceEdge.accessCount },
      exposure: { revision: exposure.revision, export: extra.name, destinations: extra.exposures.flatMap(item => item.destinations) } };

    // RS14 memory: server and daemon RSS before and after ten edits, each refreshed in the page.
    const daemonPid = (await readDaemonRecord(isolated.endpoint))!.pid;
    const memoryBefore = { server: await rss(server.pid), daemon: await treeRss(daemonPid) };
    const edits: Record<string, unknown>[] = [];
    for (let cycle = 1; cycle <= 10; cycle++) {
      const published = await publishMutation(connection, token, project.root, 'README.md',
        `# Fixture\n\nOwns the mutation acceptance project, edit ${cycle}.\n`);
      await refreshTo(page, published.revision);
      edits.push({ cycle, revision: published.revision.revision });
    }
    const memoryAfter = { server: await rss(server.pid), daemon: await treeRss(daemonPid) };
    const lastBeforeKill = (edits.at(-1) as { revision: string }).revision;

    // RS14: kill the daemon. The page shows the notice and recovers at the same URL with a newer generation.
    await connection.close().catch(() => {}); connection = undefined;
    const killedAt = Date.now();
    process.kill(daemonPid, 'SIGKILL');
    await waitForPidExit(daemonPid);
    const notice = page.locator('p[role="status"]');
    const noticeText = await until(async () => {
      await forcePoll(page);
      return await notice.count() > 0 ? (await notice.first().textContent()) ?? '' : null;
    }, 30_000, async () => `no connection notice; server status ${JSON.stringify(await serverStatus(discovered).catch(String))}`);
    const modelKeptDuringOutage = await page.locator('.module-arch__revision').textContent();
    assert.equal(modelKeptDuringOutage, `Revision ${lastBeforeKill}`);
    const restarted = await until(async () => {
      const record = await readDaemonRecord(isolated.endpoint);
      return record && record.state === 'running' && record.pid !== daemonPid && alive(record.pid) ? record : null;
    }, 60_000, serverLog);
    const recoveredStatus = await until(async () => {
      const status = await serverStatus(discovered);
      return status.binding === 'ready' ? status : null;
    }, 60_000, serverLog);
    assert.equal(recoveredStatus.daemonPid, restarted.pid);
    await until(async () => { await forcePoll(page); return await notice.count() === 0; }, 30_000, () => 'notice remained after recovery');
    connection = await connectHarness(isolated, 'never', 'acceptance-mutations-recovered');
    token = await openProject(connection, project.root);
    const recovered = await checkPublished(connection, token);
    const generationOf = (revision: string) => revision.slice('rev/1:'.length, revision.lastIndexOf(':'));
    assert.notEqual(generationOf(recovered.revision.revision), generationOf(lastBeforeKill));
    await refreshTo(page, recovered.revision);
    assert.equal(page.url(), latestUrl);
    const serverLogText = await serverLog();
    const rs14 = { killedDaemonPid: daemonPid, killedAt, noticeText, modelKeptDuringOutage,
      restartedDaemon: { pid: restarted.pid, instanceId: restarted.instanceId, startedAt: restarted.startedAt },
      serverStatusAfterRecovery: recoveredStatus, revisionBeforeKill: lastBeforeKill, revisionAfterRecovery: recovered.revision.revision,
      generationBefore: generationOf(lastBeforeKill), generationAfter: generationOf(recovered.revision.revision),
      recoveredUrl: page.url(), serverRestartedDaemon: recoveredStatus.daemonPid === restarted.pid,
      bindingLog: serverLogText.split('\n').filter(line => line.startsWith('{')).slice(-12),
      memory: { edits, before: memoryBefore, afterTenEdits: memoryAfter,
        afterRecovery: { server: await rss(server.pid), daemon: await treeRss(restarted.pid) } } };

    // RS15: an explicit stop is respected; `ramify check` restarts the daemon and the server resumes.
    await connection.close().catch(() => {}); connection = undefined;
    const stop = await runCommand(['daemon', 'stop'], commandEnvironment(isolated, paths.opener));
    assert.equal(stop.code, 0, JSON.stringify(stop));
    await waitForPidExit(restarted.pid);
    const stoppedStatus = await until(async () => {
      const status = await serverStatus(discovered);
      return status.binding === 'daemon-stopped' ? status : null;
    }, 30_000, serverLog);
    await until(async () => { await forcePoll(page); return await notice.count() > 0; }, 15_000, () => 'no notice while stopped');
    const stoppedNotice = await notice.first().textContent();
    const stoppedObservations: Record<string, unknown>[] = [];
    for (let index = 0; index < 4; index++) {
      await pause(4000);
      const status = await serverStatus(discovered), record = await readDaemonRecord(isolated.endpoint);
      assert.equal(status.binding, 'daemon-stopped', JSON.stringify(status));
      assert.ok(record && record.state === 'stopped' && record.stopped?.reason === 'explicit' && record.pid === restarted.pid,
        `The server restarted an explicitly stopped daemon: ${JSON.stringify(record)}`);
      stoppedObservations.push({ atMs: 4000 * (index + 1), binding: status.binding, daemonPid: status.daemonPid,
        record: { pid: record.pid, state: record.state, stopped: record.stopped }, daemonAlive: alive(record.pid) });
    }
    const checkStartedAt = Date.now();
    const check = await runCommand(['check', '--root', project.root], commandEnvironment(isolated, paths.opener));
    assert.ok(check.code === 0 || check.code === 1, JSON.stringify(check));
    const checkDaemon = await readDaemonRecord(isolated.endpoint);
    assert.ok(checkDaemon && checkDaemon.state === 'running' && checkDaemon.pid !== restarted.pid && checkDaemon.startedAt >= checkStartedAt,
      JSON.stringify(checkDaemon));
    const resumed = await until(async () => {
      const status = await serverStatus(discovered);
      return status.binding === 'ready' ? status : null;
    }, 30_000, serverLog);
    assert.equal(resumed.daemonPid, checkDaemon.pid);
    const rs15 = { stop: { exitCode: stop.code, stdout: stop.stdout, stderr: stop.stderr }, stoppedStatus, stoppedNotice,
      stoppedObservations, check: { exitCode: check.code, durationMs: check.durationMs, startedAt: checkStartedAt },
      daemonStartedByCheck: { pid: checkDaemon.pid, startedAt: checkDaemon.startedAt, instanceId: checkDaemon.instanceId },
      resumedStatus: resumed, resumeMs: Date.now() - checkStartedAt - check.durationMs };

    // RS16: `ramify explore` reuses this server (no second PID); another root gets a separate server.
    const pidsBefore = await explorerPids(project.root);
    assert.deepEqual(pidsBefore, [server.pid]);
    const reuse = await runCommand(['explore', '--root', project.root], commandEnvironment(isolated, paths.noOpener));
    assert.equal(reuse.code, 0, JSON.stringify(reuse));
    assert.ok(reuse.stdout.includes(`Explorer: ${latestUrl}\n`), JSON.stringify(reuse));
    assert.match(reuse.stderr, /Could not open the browser/);
    const pidsAfter = await explorerPids(project.root);
    assert.deepEqual(pidsAfter, [server.pid]);
    assert.equal((await readExplorerProcessRecord(selectExplorerEndpoint(isolated.endpoint, discovered.context.slice(6, 22))))?.pid, server.pid);
    const separate = await exploreWithCli(isolated, other.root, paths.opener);
    otherServerPid = separate.record.pid;
    assert.notEqual(separate.record.pid, server.pid);
    assert.notEqual(separate.record.port, discovered.port);
    assert.notEqual(explorerProjectKey(separate.record.context), explorerProjectKey(discovered.context));
    assert.deepEqual(await explorerPids(other.root), [separate.record.pid]);
    assert.deepEqual(await explorerPids(project.root), [server.pid]);
    const otherStatus = await serverStatus(separate.record);
    assert.equal(otherStatus.binding, 'ready'); assert.equal(otherStatus.root, other.root);
    await stopServerPid(separate.record.pid); otherServerPid = undefined;
    const otherStopped = await readExplorerProcessRecord(selectExplorerEndpoint(isolated.endpoint, explorerProjectKey(separate.record.context)));
    const rs16 = { reuse: { exitCode: reuse.code, stdout: reuse.stdout, stderr: reuse.stderr, durationMs: reuse.durationMs,
      explorerPidsBefore: pidsBefore, explorerPidsAfter: pidsAfter, serverPid: server.pid },
    separate: { exitCode: separate.command.code, stdout: separate.command.stdout, durationMs: separate.command.durationMs,
      url: separate.url, pid: separate.record.pid, port: separate.record.port, projectKey: explorerProjectKey(separate.record.context),
      status: otherStatus, stoppedRecord: otherStopped && { state: otherStopped.state, stopped: otherStopped.stopped } },
    firstProjectKey: explorerProjectKey(discovered.context) };

    await context.close(); context = undefined;
    server.kill('SIGINT');
    const exit = await serverExit;
    assert.deepEqual(exit, [0, null]);
    const finalRecord = await readExplorerProcessRecord(selectExplorerEndpoint(isolated.endpoint, explorerProjectKey(discovered.context)));
    assert.equal(finalRecord?.stopped?.reason, 'explicit');
    return { server: { pid: server.pid, port: discovered.port, origin: discovered.origin, exit, finalRecordState: finalRecord.state },
      rs13, rs14, rs15, rs16, daemonAtStart: await Promise.resolve({ pid: daemonAtStart.pid, startedAt: daemonAtStart.startedAt }),
      daemonAtEnd: await daemonRecordEvidence(isolated) };
  } finally {
    await context?.close().catch(() => {});
    if (otherServerPid !== undefined) await stopServerPid(otherServerPid);
    if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await Promise.race([serverExit, pause(5000)]); }
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await log.close().catch(() => {});
    await connection?.close().catch(() => {});
    await stopIsolatedDaemon(isolated);
    await rm(isolated.processRoot, { recursive: true, force: true });
    void scratch;
  }
}

async function main(): Promise<void> {
  assert.ok((await stat(chromiumPath)).isFile(), `Chromium executable not found: ${chromiumPath}`);
  assert.ok((await stat(join(packageRoot, 'dist/explorer/index.html'))).isFile(), 'Run npm run build before browser acceptance');
  const args = process.argv.slice(2), outputIndex = args.indexOf('--output'), onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
  assert.ok(args.length === (outputIndex >= 0 ? 2 : 0) + (onlyIndex >= 0 ? 2 : 0)
    && (outputIndex < 0 || args[outputIndex + 1]) && (only === undefined || ['reference', 'toolkit', 'mutations'].includes(only)),
  'Usage: npm run measure:project-explorer -- [--output FILE] [--only reference|toolkit|mutations]');
  const output = resolve(outputIndex >= 0 ? args[outputIndex + 1]! : join(packageRoot, 'docs/plans/iteration-6b-resident-explorer-server/evidence/iteration4-browser-acceptance.json'));
  const scratch = await realpath(await mkdtemp(join('/tmp', 'ramify-explorer-acceptance-')));
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const runtimeIdentity = JSON.parse(await readFile(join(packageRoot, 'dist/runtime-identity.json'), 'utf8')) as { buildIdentity: string; buildKey?: string };
  const report: Record<string, unknown> = { schemaVersion: 'ramify.resident-explorer-acceptance/1', measuredAt: new Date().toISOString(),
    status: 'incomplete', passed: false, command: ['npm', 'run', 'measure:project-explorer', '--', ...args],
    environment: { node: process.version, versions: process.versions, platform: platform(), release: release(),
      cpuCount: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(), chromiumPath,
      dependencies: { playwrightCore: manifest.devDependencies['playwright-core'], react: manifest.dependencies.react,
        reactDom: manifest.dependencies['react-dom'], xyflow: manifest.dependencies['@xyflow/react'], vite: manifest.devDependencies.vite } },
    inputs: { buildIdentity: runtimeIdentity.buildIdentity }, workloads: {}, failures: [] };
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath: chromiumPath, headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    (report.environment as Record<string, unknown>).chromiumVersion = browser.version();
    const paths = await commandPaths(scratch);
    const workloads = report.workloads as Record<string, unknown>;
    if (only === undefined || only === 'reference') {
      const reference = await isolatedProject('reference', scratch);
      try { workloads.reference = await runFixture('reference', reference, scratch, browser, paths); } finally { await reference.dispose(); }
    }
    if (only === undefined || only === 'toolkit') {
      const toolkit = await isolatedProject('toolkit', scratch);
      try { workloads.toolkit = await runFixture('toolkit', toolkit, scratch, browser, paths); } finally { await toolkit.dispose(); }
    }
    if (only === undefined || only === 'mutations') {
      const mutations = await mutationProject(scratch), other = await mutationProject(scratch);
      try { workloads.mutations = await runMutations(mutations, other, scratch, browser, paths); }
      finally { await Promise.all([mutations.dispose(), other.dispose()]); }
    }
    report.status = 'passed'; report.passed = true;
  } catch (error) {
    (report.failures as unknown[]).push(error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error));
    throw error;
  } finally {
    await browser?.close().catch(() => {}); await rm(scratch, { recursive: true, force: true });
    report.completedAt = new Date().toISOString(); await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ output, status: report.status, passed: report.passed, failures: report.failures }, null, 2)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.exitCode = 1; });
}

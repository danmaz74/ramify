import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile, copyFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { connectDaemon } from '../../daemon/src/connect-daemon.js';
import { selectEndpoint } from '../../daemon/src/discovery.js';
import type { ServiceConnection } from '../../daemon/src/interfaces/daemon.js';
import type { CheckOutcome, ContextRevision, ContextToken } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectExplorerModel } from '../../service-api/src/project-view.js';
import { ensureExplorerWebProcess } from '../../service-api/src/web-launcher.js';
import { explorerProjectUrl, selectExplorerEndpoint } from '../../service-api/src/web-discovery.js';
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

async function inspectorMemory(log: string): Promise<NodeJS.MemoryUsage> {
  const deadline = performance.now() + 5000;
  let url: string | undefined;
  while (performance.now() < deadline) {
    const content = await readFile(log, 'utf8').catch(() => '');
    url = /Debugger listening on (ws:\/\/[^\s]+)/.exec(content)?.[1];
    if (url) break;
    await new Promise(resolvePause => setTimeout(resolvePause, 25));
  }
  assert.ok(url, 'Explorer Node inspector URL was not recorded');
  return new Promise<NodeJS.MemoryUsage>((accept, reject) => {
    const socket = new WebSocket(url!);
    const timer = setTimeout(() => { socket.close(); reject(new Error('Explorer inspector timed out')); }, 5000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
      params: { expression: 'JSON.stringify(process.memoryUsage())', returnByValue: true } })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: string } }; error?: unknown };
      if (message.id !== 1) return;
      clearTimeout(timer); socket.close();
      if (message.error || !message.result?.result?.value) reject(new Error(`Explorer inspector failed: ${JSON.stringify(message)}`));
      else accept(JSON.parse(message.result.result.value) as NodeJS.MemoryUsage);
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Explorer inspector connection failed')); });
  });
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

async function runFixture(kind: 'reference' | 'toolkit', project: { root: string }, scratch: string,
  browser: Browser): Promise<Record<string, unknown>> {
  const processRoot = await realpath(await mkdtemp(join('/tmp', 'rx7-')));
  const endpointDirectory = join(processRoot, 'e'); await mkdir(endpointDirectory, { mode: 0o700 });
  const endpoint = await selectEndpoint({ packageRoot, version: '0.0.0', endpointDirectory });
  const connected = await connectDaemon({ start: 'if-needed', client: { name: `iteration7-${kind}`, version: '0.0.0' },
    engine: 'ramify.ts@0.0.0+typescript@7.0.2', daemonEntry: join(packageRoot, 'dist/src/daemon-entry.js'), packageRoot, endpointDirectory });
  assert.equal(connected.status, 'connected', JSON.stringify(connected));
  const connection = connected.connection;
  let token: ContextToken | undefined;
  let web: Awaited<ReturnType<typeof ensureExplorerWebProcess>> | undefined;
  let page: Page | undefined;
  try {
    const opened = await connection.openContext({ project: { cwd: project.root, root: project.root, scope: 'whole-project', configuration: 'discover' },
      setup: { registry: 'default', capabilities } });
    assert.ok(opened.ok && opened.value.status === 'opened', JSON.stringify(opened));
    token = opened.value.token;
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

    const previousNodeOptions = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--inspect=127.0.0.1:0';
    try {
      web = await ensureExplorerWebProcess({ endpoint: selectExplorerEndpoint(endpoint), version: '0.0.0',
        explorerEntry: join(packageRoot, 'dist/src/explorer-entry.js'), startupMs: 15_000 });
    } finally {
      if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previousNodeOptions;
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installBrowserInstrumentation(context); page = await context.newPage();
    await page.goto(explorerProjectUrl(web.record, token), { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('heading', { name: 'Project Explorer' }).waitFor();
    try { await page.locator('.module-arch__revision').filter({ hasText: ready.view.revision }).waitFor({ timeout: 30_000 }); }
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
          `# Collection Review\n\nIteration 7 explicit refresh cycle ${cycle}.\n`);
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
    const daemon = await connection.daemonStatus(); assert.ok(daemon.ok, JSON.stringify(daemon));
    const webMemory = await inspectorMemory(selectExplorerEndpoint(endpoint).log);
    await context.close(); page = undefined;
    return { kind, root: project.root, revision: check.revision, projectionDurationMs, encodedBytes,
      counts: countEvidence, externalAccesses, dom, interactions, refreshBaseline, refreshes,
      memory: { web: { pid: web.record.pid, ...webMemory }, daemon: { pid: daemon.value.pid, ...daemon.value.memory,
        contexts: daemon.value.contexts.map(item => ({ context: item.token.context, history: item.history,
          retainedBytes: item.retainedBytes, leases: item.leases, pending: item.pending })) } } };
  } finally {
    if (page) await page.context().close().catch(() => {});
    if (token) await connection.closeContext({ token }).catch(() => {});
    if (web) { const pid = web.record.pid; await web.terminateOwned().catch(() => {}); await waitForPidExit(pid).catch(() => {}); }
    const instance = connection.daemon.instance;
    await connection.stopDaemon({ instanceId: instance.instanceId }).catch(() => {});
    await connection.close().catch(() => {});
    await waitForPidExit(instance.pid).catch(() => {});
    await rm(processRoot, { recursive: true, force: true });
    void scratch;
  }
}

async function runMutations(project: { root: string }, browser: Browser): Promise<Record<string, unknown>> {
  const processRoot = await realpath(await mkdtemp(join('/tmp', 'rx7-'))), endpointDirectory = join(processRoot, 'e');
  await mkdir(endpointDirectory, { mode: 0o700 });
  const endpoint = await selectEndpoint({ packageRoot, version: '0.0.0', endpointDirectory });
  const connected = await connectDaemon({ start: 'if-needed', client: { name: 'iteration7-mutations', version: '0.0.0' },
    engine: 'ramify.ts@0.0.0+typescript@7.0.2', daemonEntry: join(packageRoot, 'dist/src/daemon-entry.js'), packageRoot, endpointDirectory });
  assert.equal(connected.status, 'connected', JSON.stringify(connected));
  const connection = connected.connection;
  let token: ContextToken | undefined, web: Awaited<ReturnType<typeof ensureExplorerWebProcess>> | undefined;
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  try {
    const opened = await connection.openContext({ project: { cwd: project.root, root: project.root, scope: 'whole-project', configuration: 'discover' },
      setup: { registry: 'default', capabilities } });
    assert.ok(opened.ok && opened.value.status === 'opened', JSON.stringify(opened)); token = opened.value.token;
    const initial = await checkPublished(connection, token);
    web = await ensureExplorerWebProcess({ endpoint: selectExplorerEndpoint(endpoint), version: '0.0.0',
      explorerEntry: join(packageRoot, 'dist/src/explorer-entry.js'), startupMs: 15_000 });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installBrowserInstrumentation(context); const page = await context.newPage();
    await page.goto(explorerProjectUrl(web.record, token), { waitUntil: 'networkidle', timeout: 120_000 });
    const initialProjection = createProjectExplorerModel({ revision: initial.revision, report: initial.report! });
    assert.equal(initialProjection.status, 'ready'); const initialModel = (initialProjection as ReadyProjection).view;
    assertModuleOnlyModel(initialModel);
    await page.locator('.module-arch__revision').filter({ hasText: initialModel.revision }).waitFor();

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
    return { initialRevision: initial.revision,
      npmOnly: { revision: npmOnly.revision, reportInputBefore: initial.report!.inputId,
        reportInputAfter: npmOnly.report!.inputId, reportAccessesBefore: initialAccesses.length,
        reportAccessesAfter: npmOnlyAccesses.length, addedAccess: npmWitness.id,
        topology: topology(npmModel), visibleImportMetrics: visibleImportMetrics(npmModel), dom: npmDom },
      readme: { revision: readme.revision, visiblePurpose: 'Provides the changed browser purpose.' },
      source: { revision: source.revision, edge: sourceEdge.id, accessCount: sourceEdge.accessCount },
      exposure: { revision: exposure.revision, export: extra.name, destinations: extra.exposures.flatMap(item => item.destinations) } };
  } finally {
    await context?.close().catch(() => {});
    if (token) await connection.closeContext({ token }).catch(() => {});
    if (web) { const pid = web.record.pid; await web.terminateOwned().catch(() => {}); await waitForPidExit(pid).catch(() => {}); }
    const instance = connection.daemon.instance;
    await connection.stopDaemon({ instanceId: instance.instanceId }).catch(() => {});
    await connection.close().catch(() => {}); await waitForPidExit(instance.pid).catch(() => {});
    await rm(processRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  assert.ok((await stat(chromiumPath)).isFile(), `Chromium executable not found: ${chromiumPath}`);
  assert.ok((await stat(join(packageRoot, 'dist/explorer/index.html'))).isFile(), 'Run npm run build before browser acceptance');
  const args = process.argv.slice(2), outputIndex = args.indexOf('--output');
  assert.ok(args.length === 0 || outputIndex === 0 && args.length === 2, 'Usage: npm run measure:project-explorer -- [--output FILE]');
  const output = resolve(outputIndex === 0 ? args[1]! : join(packageRoot, 'docs/plans/iteration-6a-module-only-project-explorer/evidence/iteration4-browser-acceptance.json'));
  const scratch = await realpath(await mkdtemp(join('/tmp', 'ramify-explorer-acceptance-')));
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const runtimeIdentity = JSON.parse(await readFile(join(packageRoot, 'dist/runtime-identity.json'), 'utf8')) as { buildIdentity: string; buildKey?: string };
  const report: Record<string, unknown> = { schemaVersion: 'ramify.module-only-project-explorer-acceptance/1', measuredAt: new Date().toISOString(),
    status: 'incomplete', passed: false, command: ['npm', 'run', 'measure:project-explorer', '--', '--output', output],
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
    const reference = await isolatedProject('reference', scratch), toolkit = await isolatedProject('toolkit', scratch), mutations = await mutationProject(scratch);
    try {
      (report.workloads as Record<string, unknown>).reference = await runFixture('reference', reference, scratch, browser);
      (report.workloads as Record<string, unknown>).toolkit = await runFixture('toolkit', toolkit, scratch, browser);
      (report.workloads as Record<string, unknown>).mutations = await runMutations(mutations, browser);
    } finally { await Promise.all([reference.dispose(), toolkit.dispose(), mutations.dispose()]); }
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

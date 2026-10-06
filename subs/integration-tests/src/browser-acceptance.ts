import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chmod, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, symlink, writeFile, copyFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core';
import { connectDaemon } from '../../daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../daemon/src/discovery.js';
import type { EndpointSelection, ServiceConnection } from '../../daemon/src/interfaces/daemon.js';
import type { CheckOutcome, ContextRevision, ContextToken } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectExplorerModel } from '../../service-api/src/project-view.js';
import type { ExplorerProcessRecord, ServerStatusResult } from '../../service-api/src/interfaces/explorer-service.js';
import type { DependencyViewResult, ExplorerDependencyModel } from '../../service-api/src/interfaces/explorer-dependencies.js';
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

/**
 * The root description's owned nested trees that a copy leaves out are
 * recreated empty: each must exist as a real directory, and nothing beneath
 * one is ever read, so an empty directory is an equivalent input.
 */
async function restoreOwnedNestedTrees(root: string): Promise<void> {
  const description = await readFile(join(root, 'module.ramify'), 'utf8');
  for (const [, directory] of description.matchAll(/^(?:owned-unwired|owned-nested-project) "([^"\\]+)"[ \t]*$/gm)) await mkdir(join(root, directory!), { recursive: true });
}
async function isolatedProject(kind: 'reference' | 'toolkit', scratch: string): Promise<{ root: string; dispose(): Promise<void> }> {
  const root = await mkdtemp(join(scratch, `${kind}-`));
  const source = kind === 'reference' ? join(packageRoot, 'examples/collection-review') : packageRoot;
  await copyTree(source, root, kind === 'reference'
    ? new Set(['node_modules', 'dist', '.reference-work', '.git', '.vite']) : ignored);
  await restoreOwnedNestedTrees(root);
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
    'module.ramify': 'ramify 1\nroot module fixture\n',
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

/** Records every dependency state the page displays, so transient states are observed. */
async function installDependencyStateHistory(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: `(() => {
    const history = []; let last = null;
    Object.defineProperty(window, '__ramifyDependencyStates', { configurable: false, value: history });
    const record = () => {
      const element = document.querySelector('.module-arch__dependency-status');
      const revision = document.querySelector('.module-arch__revision');
      const state = element ? element.getAttribute('data-dependency-state') + '@' + (revision ? revision.textContent : '') : null;
      if (state !== null && state !== last) { history.push({ at: performance.now(), state }); last = state; }
    };
    document.addEventListener('DOMContentLoaded', () => new MutationObserver(record)
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-dependency-state'], characterData: true }));
  })();` });
}

/** The dependency states displayed for `revision`, in order. */
async function dependencyStateHistory(page: Page, revision: string): Promise<string[]> {
  const history = await page.evaluate(() => (window as unknown as { __ramifyDependencyStates: { state: string }[] }).__ramifyDependencyStates);
  return history.filter(item => item.state.endsWith(`@Revision ${revision}`)).map(item => item.state.slice(0, item.state.indexOf('@')));
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

interface LinkSettings {
  readonly showNonBehavioral: boolean;
  readonly depthMode: 'level' | 'exact';
  readonly showOutsideScope: boolean;
  readonly showOwnSourceNode: boolean;
}
const defaultLinks: LinkSettings = { showNonBehavioral: false, depthMode: 'level', showOutsideScope: true,
  showOwnSourceNode: false };

interface ScopeShape {
  readonly frameModule: string | null;
  readonly nodes: readonly string[];
  readonly depth: number;
  /** The scope module whose own source is drawn as a node; null while it is folded. */
  readonly ownSourceNode: string | null;
}

/** The own-source node's ID, spelled independently of the view. */
const ownSourceNode = (module: string): string => `own-source/1:${module}`;

/** Ancestors of a module, root first, from the project model alone. */
function ancestorsOfModule(model: ProjectExplorerModel, id: string): string[] {
  const byId = new Map(model.modules.map(module => [module.id, module]));
  const result: string[] = [];
  let parent = byId.get(id)?.parent ?? null;
  while (parent !== null) { result.unshift(parent); parent = byId.get(parent)?.parent ?? null; }
  return result;
}

const containedBy = (model: ProjectExplorerModel, id: string, ancestor: string): boolean =>
  id === ancestor || ancestorsOfModule(model, id).includes(ancestor);

/** The frame and candidate nodes of one scope, reproducing the view's scope selection. */
function scopeOf(model: ProjectExplorerModel, scopeModuleId: string | null,
  showOwnSourceNode = false): ScopeShape {
  if (scopeModuleId !== null) {
    return { frameModule: scopeModuleId, depth: ancestorsOfModule(model, scopeModuleId).length + 1,
      nodes: model.modules.filter(module => module.parent === scopeModuleId).map(module => module.id),
      ownSourceNode: showOwnSourceNode ? scopeModuleId : null };
  }
  const topLevel = model.modules.filter(module => module.parent === null);
  const root = model.modules.find(module => module.id === model.rootModuleId);
  if (topLevel.length === 1 && root && root.children.length > 0) {
    return { frameModule: root.id, nodes: [...root.children],
      depth: ancestorsOfModule(model, root.id).length + 1, ownSourceNode: null };
  }
  return { frameModule: null, nodes: topLevel.map(module => module.id), depth: 0, ownSourceNode: null };
}

type ScopeEndShape = { readonly kind: 'frame' }
  | { readonly kind: 'own-source'; readonly module: string }
  | { readonly kind: 'node'; readonly module: string; readonly inScope: boolean };

/** Where one exact module lands at a scope, calculated from the project structure. */
function endOf(model: ProjectExplorerModel, scope: ScopeShape, id: string,
  depthMode: LinkSettings['depthMode']): ScopeEndShape {
  if (depthMode === 'exact') {
    return { kind: 'node', module: id,
      inScope: scope.frameModule === null || containedBy(model, id, scope.frameModule) };
  }
  for (const node of scope.nodes) if (containedBy(model, id, node)) return { kind: 'node', module: node, inScope: true };
  if (scope.frameModule !== null && id === scope.frameModule) {
    return scope.ownSourceNode !== null ? { kind: 'own-source', module: id } : { kind: 'frame' };
  }
  const outside = scope.depth - 1;
  const chain = [...ancestorsOfModule(model, id), id];
  return { kind: 'node', inScope: false,
    module: chain.length - 1 <= outside ? id : chain[outside] ?? chain[0]! };
}

const coversProject = (model: ProjectExplorerModel, scope: ScopeShape): boolean =>
  model.modules.every(module => (scope.frameModule !== null && containedBy(model, module.id, scope.frameModule))
    || scope.nodes.some(node => containedBy(model, module.id, node)));

/** The modules a scope displays: its candidate nodes, before any class filter. */
const visibleAt = (model: ProjectExplorerModel, scopeModuleId: string | null): readonly string[] =>
  scopeOf(model, scopeModuleId).nodes;

/** Every node a scope draws: its displayed modules and, while the control is on, its own source. */
function drawnNodesAt(model: ProjectExplorerModel, scopeModuleId: string | null,
  settings: LinkSettings, displayedNodes?: readonly string[]): readonly string[] {
  const modules = displayedNodes ?? visibleAt(model, scopeModuleId);
  const scope = scopeOf(model, scopeModuleId, settings.depthMode === 'level' && settings.showOwnSourceNode);
  return scope.ownSourceNode !== null ? [...modules, ownSourceNode(scope.ownSourceNode)] : modules;}

function initialVisible(model: ProjectExplorerModel): readonly string[] {
  return visibleAt(model, null);
}

interface ScopeLink {
  readonly id: string;
  readonly consumer: string;
  readonly provider: string;
  readonly behavioral: number;
  readonly nonBehavioral: number;
  readonly leavesScope: boolean;
  readonly sources: readonly string[];
}

/**
 * The links one scope draws, computed independently of the view: the ends map from the project
 * structure, and each group's counts are its distinct `(exact consumer module, original)` pairs,
 * settled behavioral when any of its evidence rows is behavioral.
 */
function scopeLinks(model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  scopeModuleId: string | null, settings: LinkSettings = defaultLinks,
  displayedNodes?: readonly string[]): ScopeLink[] {
  const scope = scopeOf(model, scopeModuleId, settings.depthMode === 'level' && settings.showOwnSourceNode);
  const displayed = new Set(displayedNodes ?? scope.nodes);
  const covers = coversProject(model, scope);
  // An own-source end takes its node ID, is drawn and is always in scope.
  const nodeIdOf = (end: Exclude<ScopeEndShape, { kind: 'frame' }>) =>
    end.kind === 'own-source' ? ownSourceNode(end.module) : end.module;
  const groups = new Map<string, { consumer: string; provider: string; leavesScope: boolean;
    sources: ExplorerDependencyModel['originalOwnerEdges'][number][] }>();
  for (const edge of deps.originalOwnerEdges) {
    const consumer = endOf(model, scope, edge.consumer, settings.depthMode);
    const provider = endOf(model, scope, edge.provider, settings.depthMode);
    if (consumer.kind === 'frame' || provider.kind === 'frame') continue;
    const consumerNode = nodeIdOf(consumer);
    const providerNode = nodeIdOf(provider);
    if (consumerNode === providerNode) continue;
    if (consumer.kind !== 'own-source' && provider.kind !== 'own-source'
      && !displayed.has(consumerNode) && !displayed.has(providerNode)) continue;
    const key = JSON.stringify([consumerNode, providerNode]);
    const group = groups.get(key)
      ?? { consumer: consumerNode, provider: providerNode, leavesScope: false, sources: [] };
    group.leavesScope = group.leavesScope || (!covers
      && ((consumer.kind === 'node' && !consumer.inScope) || (provider.kind === 'node' && !provider.inScope)));
    group.sources.push(edge);
    groups.set(key, group);
  }
  const byPair = (left: { consumer: string; provider: string }, right: { consumer: string; provider: string }) =>
    left.consumer < right.consumer ? -1 : left.consumer > right.consumer ? 1
      : left.provider < right.provider ? -1 : left.provider > right.provider ? 1 : 0;
  const result: ScopeLink[] = [];
  for (const group of groups.values()) {
    if (group.leavesScope && !settings.showOutsideScope) continue;
    const sources = [...group.sources].sort(byPair);
    const pairs = new Map<string, boolean>();
    for (const edge of sources) {
      for (const item of edge.evidence) {
        const key = JSON.stringify([edge.consumer, item.original]);
        pairs.set(key, (pairs.get(key) ?? false) || item.classification === 'behavioral');
      }
    }
    let behavioral = 0, nonBehavioral = 0;
    for (const settled of pairs.values()) { if (settled) behavioral += 1; else nonBehavioral += 1; }
    if (behavioral + (settings.showNonBehavioral ? nonBehavioral : 0) === 0) continue;
    result.push({
      id: settings.depthMode === 'exact' ? sources[0]!.id
        : `scoped-link/1:level:${scope.frameModule ?? '-'}:${JSON.stringify([group.consumer, group.provider])}`,
      consumer: group.consumer, provider: group.provider, behavioral, nonBehavioral,
      leavesScope: group.leavesScope, sources: sources.map(edge => edge.id),
    });
  }
  return result.sort(byPair);
}

/** Link IDs drawn at one scope, in the order the DOM comparison uses. */
function expectedLinks(model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  scopeModuleId: string | null, settings: LinkSettings = defaultLinks,
  displayedNodes?: readonly string[]): string[] {
  return scopeLinks(model, deps, scopeModuleId, settings, displayedNodes).map(link => link.id).sort();
}

/** Modules drawn out of view: the mapped ends of a drawn link that are not displayed nodes. */
function expectedOutOfView(model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  scopeModuleId: string | null, settings: LinkSettings = defaultLinks,
  displayedNodes?: readonly string[]): string[] {
  const displayed = new Set(drawnNodesAt(model, scopeModuleId, settings, displayedNodes));
  const related = new Set<string>();
  for (const link of scopeLinks(model, deps, scopeModuleId, settings, displayedNodes)) {
    if (!displayed.has(link.consumer)) related.add(link.consumer);
    if (!displayed.has(link.provider)) related.add(link.provider);
  }
  return [...related].sort();
}

/** The counts the scope's panels show: its links before the non-behavioral display filter. */
function scopeCounts(model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  scopeModuleId: string | null, settings: LinkSettings = defaultLinks,
  displayedNodes?: readonly string[]): { behavioral: number; nonBehavioral: number } {
  return scopeLinks(model, deps, scopeModuleId, { ...settings, showNonBehavioral: true }, displayedNodes)
    .reduce((sum, link) => ({ behavioral: sum.behavioral + link.behavioral,
      nonBehavioral: sum.nonBehavioral + link.nonBehavioral }), { behavioral: 0, nonBehavioral: 0 });
}

/** The measured totals of a module and all of its descendants, from the served rows. */
function subtreeCounts(model: ProjectExplorerModel, deps: ExplorerDependencyModel, id: string): {
  uses: { behavioral: number; nonBehavioral: number };
  ownedUsedByOthers: { behavioral: number; nonBehavioral: number };
  usedThrough: { behavioralUsedOriginals: number; nonBehavioralUsedOriginals: number };
} {
  const rows = deps.modules.filter(row => containedBy(model, row.id, id));
  const add = (select: (row: ExplorerDependencyModel['modules'][number]) => number) =>
    rows.reduce((sum, row) => sum + select(row), 0);
  return {
    uses: { behavioral: add(row => row.uses.behavioral), nonBehavioral: add(row => row.uses.nonBehavioral) },
    ownedUsedByOthers: { behavioral: add(row => row.ownedUsedByOthers.behavioral),
      nonBehavioral: add(row => row.ownedUsedByOthers.nonBehavioral) },
    usedThrough: { behavioralUsedOriginals: add(row => row.usedThrough.behavioralUsedOriginals),
      nonBehavioralUsedOriginals: add(row => row.usedThrough.nonBehavioralUsedOriginals) },
  };
}

function expectedSubtitle(model: ProjectExplorerModel, deps: ExplorerDependencyModel, settings = defaultLinks): string {
  const visible = initialVisible(model);
  const links = expectedLinks(model, deps, null, settings).length;
  return `Showing ${visible.length} of ${model.modules.length} modules, ${links} displayed ${links === 1 ? 'link' : 'links'}`;
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

async function renderedEdgeIds(page: Page): Promise<string[]> {
  return (await page.locator('.react-flow__edge').evaluateAll(edges => edges.map(edge =>
    edge.getAttribute('data-testid')?.replace(/^rf__edge-/, '') ?? ''))).sort();
}

async function renderedNodeIds(page: Page): Promise<string[]> {
  return (await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id') ?? ''))).sort();
}

/** The drawn links become exactly the expected IDs; the graph re-renders a frame after a settings change. */
async function waitForLinks(page: Page, expected: readonly string[], what: string): Promise<string[]> {
  return until(async () => {
    const rendered = await renderedEdgeIds(page);
    return JSON.stringify(rendered) === JSON.stringify(expected) ? rendered : null;
  }, 10_000, async () => `${what}: rendered ${JSON.stringify(await renderedEdgeIds(page))}, expected ${JSON.stringify(expected)}`);
}

/**
 * Module nodes only, and the links are exactly the scope roll-up of the dependency model at the
 * project scope: no occurrence edge of the project model is drawn.
 */
async function assertModuleOnlyDom(page: Page, model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  settings = defaultLinks): Promise<Record<string, unknown>> {
  const moduleIds = new Set(model.modules.map(module => module.id));
  const visible = initialVisible(model);
  const expected = expectedLinks(model, deps, null, settings);
  const renderedEdges = await waitForLinks(page, expected, 'Project-scope links');
  const renderedNodes = await renderedNodeIds(page);
  assert.ok(renderedNodes.every(id => moduleIds.has(id)), `Rendered a non-module node: ${JSON.stringify(renderedNodes)}`);
  assert.deepEqual(renderedNodes, [...visible, ...expectedOutOfView(model, deps, null, settings)].sort());
  const occurrenceEdges = new Set(model.edges.map(edge => edge.id));
  assert.ok(renderedEdges.every(id => !occurrenceEdges.has(id)), 'Rendered an occurrence edge');
  assert.equal(await page.getByRole('heading', { name: 'Other target' }).count(), 0);
  return { renderedNodes, renderedEdges, occurrenceEdges: model.edges.length, otherTargetDetails: 0 };
}

const settledDependencyStates = new Set(['complete', 'partial', 'zero']);

/** Daemon and server state added to a dependency wait's failure; set by the running workflow. */
let dependencyDiagnostics: (() => Promise<unknown>) | null = null;

async function dependencyStatus(page: Page): Promise<{ readonly state: string | null; readonly text: string | null }> {
  const status = page.locator('.module-arch__dependency-status');
  if (await status.count() === 0) return { state: null, text: null };
  return { state: await status.getAttribute('data-dependency-state'), text: await status.textContent() };
}

/** Waits until the page displays `revision` with a settled dependency result; unavailable and superseded fail. */
async function waitForDependencies(page: Page, revision: string, timeoutMs = 180_000,
  accepted: ReadonlySet<string> = settledDependencyStates): Promise<string> {
  await page.locator('.module-arch__revision').filter({ hasText: revision }).waitFor({ timeout: timeoutMs });
  return until(async () => {
    const status = await dependencyStatus(page);
    if (status.state && !accepted.has(status.state) && (status.state === 'unavailable' || status.state === 'superseded')) {
      throw new Error(`Dependency view ${status.state} at ${revision}: ${status.text}`);
    }
    return status.state && accepted.has(status.state) ? status.state : null;
  }, timeoutMs, async () => `dependency state at ${revision}: ${JSON.stringify(await dependencyStatus(page))}; ${
    JSON.stringify(await dependencyDiagnostics?.().catch(String) ?? null)}`);
}

async function dependencyViewOver(origin: string, revision: string): Promise<DependencyViewResult> {
  const response = await fetch(`${origin}/trpc/dependencyView?input=${encodeURIComponent(JSON.stringify({ revision }))}`);
  const body = await response.json() as { result?: { data?: DependencyViewResult } };
  assert.ok(response.ok && body.result?.data, JSON.stringify(body));
  return body.result.data;
}

/** The served ready model of `revision`, bound to its exact revision and input ID. */
async function readyDependencies(origin: string, revision: ContextRevision): Promise<ExplorerDependencyModel> {
  const result = await dependencyViewOver(origin, revision.revision);
  assert.equal(result.status, 'ready', JSON.stringify(result));
  const ready = result as Extract<DependencyViewResult, { readonly status: 'ready' }>;
  assert.equal(ready.revision.revision, revision.revision);
  assert.equal(ready.revision.fingerprints.inputId, revision.fingerprints.inputId);
  assert.equal(ready.view.inputId, revision.fingerprints.inputId);
  return ready.view;
}

/** Browser requests to the explorer's procedures, as the page sent them over HTTP. */
interface RequestLog {
  readonly entries: { readonly at: number; readonly procedures: readonly string[]; readonly body: string | null }[];
  dependencyViews(): number;
}

function recordRequests(page: Page): RequestLog {
  const entries: RequestLog['entries'][number][] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/trpc/')) return;
    entries.push({ at: performance.now(), procedures: url.pathname.slice('/trpc/'.length).split(','), body: request.postData() });
  });
  return { entries, dependencyViews: () => entries.reduce((sum, entry) => sum + entry.procedures.filter(name => name === 'dependencyView').length, 0) };
}

async function headlineCards(scope: ReturnType<Page['locator']>): Promise<{ behavioral: number; nonBehavioral: number; note: string }> {
  return { behavioral: Number(await scope.locator('[data-headline="behavioral"] .module-arch__headline-value').first().textContent()),
    nonBehavioral: Number(await scope.locator('[data-headline="non-behavioral"] .module-arch__headline-value').first().textContent()),
    note: (await scope.locator('[data-headline="non-behavioral"] .module-arch__headline-note').first().textContent()) ?? '' };
}

async function metricValue(page: Page, label: string): Promise<string> {
  const item = page.locator('.module-arch__sidebar .module-arch__metric')
    .filter({ has: page.locator('.module-arch__metric-label', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await item.locator('.module-arch__metric-value').textContent()) ?? '';
}

async function setShowNonBehavioral(page: Page, value: boolean): Promise<void> {
  const box = page.getByRole('checkbox', { name: 'Show non-behavioral dependencies' });
  if (await box.isChecked() !== value) await box.click();
}

async function setLinkDepth(page: Page, depthMode: LinkSettings['depthMode']): Promise<void> {
  await page.getByRole('radio', { name: depthMode === 'level' ? 'Modules at this level' : 'Exact module' }).click();
}

/** The leaving-scope toggle; it is absent at a scope that covers the project. */
async function setShowOutsideScope(page: Page, value: boolean): Promise<void> {
  const box = page.getByRole('checkbox', { name: 'Show dependencies that leave this module' });
  if (await box.count() === 0) {
    assert.ok(value, 'The leaving-scope toggle is absent, so it cannot be turned off');
    return;
  }
  if (await box.isChecked() !== value) await box.click();
}

/** The own-source toggle; it is absent at a scope with no scope module. */
async function setShowOwnSourceNode(page: Page, value: boolean): Promise<void> {
  const box = page.getByRole('checkbox', { name: "Show this module's own source as a node" });
  if (await box.count() === 0) {
    assert.ok(!value, 'The own-source toggle is absent, so it cannot be turned on');
    return;
  }
  if (await box.isChecked() !== value) await box.click();
}

/** Every control at once, in the order the page applies them. */
async function applyLinkSettings(page: Page, settings: LinkSettings): Promise<void> {
  await setShowNonBehavioral(page, settings.showNonBehavioral);
  // The own-source control is disabled in `Exact module`, so it is set before the depth changes.
  if (settings.depthMode === 'level') {
    await setLinkDepth(page, settings.depthMode);
    await setShowOwnSourceNode(page, settings.showOwnSourceNode);
  } else {
    await setShowOwnSourceNode(page, false);
    await setLinkDepth(page, settings.depthMode);
  }
  await setShowOutsideScope(page, settings.showOutsideScope);
}

/** One labelled card pair of a panel region, such as `This view` or `Including internals`. */
async function labelledCards(scope: ReturnType<Page['locator']>, label: string): Promise<{
  behavioral: number; nonBehavioral: number; note: string }> {
  return headlineCards(scope.locator(`.module-arch__card-pair[aria-label="${label}"]`).first());
}

/** Opens a `<details>` panel section, so its content reaches the accessibility tree. */
async function openDisclosure(page: Page, summary: string): Promise<void> {
  const details = page.locator('.module-arch__sidebar details.module-arch__alternate-role')
    .filter({ has: page.locator('summary', { hasText: summary }) }).first();
  if (await details.count() === 0) return;
  if (!await details.evaluate(node => (node as HTMLDetailsElement).open)) await details.locator('summary').click();
}

async function expandSection(page: Page, title: string): Promise<void> {
  const header = page.locator('.module-arch__sidebar .module-arch__collapsible-header').filter({ hasText: title }).first();
  if (await header.getAttribute('aria-expanded') !== 'true') await header.click();
}

/** Direct children of a process from procfs, across its threads. */
async function childPids(pid: number): Promise<number[]> {
  const tasks = await readdir(`/proc/${pid}/task`).catch(() => [] as string[]);
  const children = new Set<number>();
  for (const task of tasks) {
    const text = await readFile(`/proc/${pid}/task/${task}/children`, 'utf8').catch(() => '');
    for (const value of text.trim().split(/\s+/).filter(Boolean)) children.add(Number(value));
  }
  return [...children];
}

interface TreeProcess { readonly pid: number; readonly parent: number; readonly depth: number; readonly args: string }

async function processTree(root: number): Promise<TreeProcess[]> {
  const result: TreeProcess[] = [];
  const pending: [number, number, number][] = (await childPids(root)).map(pid => [pid, root, 1]);
  while (pending.length > 0) {
    const [pid, parent, depth] = pending.shift()!;
    const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0').join(' ');
    result.push({ pid, parent, depth, args });
    for (const child of await childPids(pid)) pending.push([child, pid, depth + 1]);
  }
  return result;
}

/** Analyzer processes the daemon started, with their compiler helper and native compiler descendants. */
type AnalyzerRole = 'analyzer' | 'configuration-helper' | 'compiler-helper' | 'native-compiler';

async function analyzerTree(daemonPid: number): Promise<(TreeProcess & { readonly role: AnalyzerRole })[]> {
  const tree = await processTree(daemonPid);
  const analyzers = new Set(tree.filter(item => item.parent === daemonPid && item.args.includes('dependency-analyzer-entry.js')).map(item => item.pid));
  const members = new Map<number, AnalyzerRole>([...analyzers].map(pid => [pid, 'analyzer']));
  // Breadth-first order: a parent precedes its children.
  for (const item of tree) {
    const parentRole = members.get(item.parent);
    if (parentRole && !members.has(item.pid)) {
      members.set(item.pid, parentRole !== 'analyzer' ? 'native-compiler'
        : item.args.includes('configuration-helper.') ? 'configuration-helper' : 'compiler-helper');
    }
  }
  return tree.filter(item => members.has(item.pid)).map(item => ({ ...item, role: members.get(item.pid)! }));
}

interface AnalyzerMemory {
  readonly samples: number;
  readonly processes: readonly { readonly pid: number; readonly role: string; readonly peakRssBytes: number; readonly firstSeenMs: number; readonly lastSeenMs: number }[];
  readonly peakRssBytes: Readonly<Record<AnalyzerRole, number>>;
  readonly peakCombinedRssBytes: number;
}

/** Samples the analyzer tree's resident memory; each process's VmHWM is its own peak while it lives. */
function sampleAnalyzerMemory(daemonPid: number, intervalMs = 40): { stop(): Promise<AnalyzerMemory> } {
  const started = performance.now();
  const peaks = new Map<number, { pid: number; role: string; peakRssBytes: number; firstSeenMs: number; lastSeenMs: number }>();
  let samples = 0, combinedPeak = 0, running = true;
  const loop = (async () => {
    while (running) {
      let combined = 0;
      for (const item of await analyzerTree(daemonPid).catch(() => [])) {
        const measured = await rss(item.pid).catch(() => null);
        if (!measured || !Number.isFinite(measured.peakRssBytes)) continue;
        combined += measured.rssBytes;
        const at = performance.now() - started, previous = peaks.get(item.pid);
        peaks.set(item.pid, { pid: item.pid, role: previous?.role ?? item.role, firstSeenMs: previous?.firstSeenMs ?? at, lastSeenMs: at,
          peakRssBytes: Math.max(previous?.peakRssBytes ?? 0, measured.peakRssBytes, measured.rssBytes) });
      }
      combinedPeak = Math.max(combinedPeak, combined);
      samples++;
      await pause(intervalMs);
    }
  })();
  return {
    async stop() {
      running = false; await loop;
      const processes = [...peaks.values()].map(item => ({ ...item, firstSeenMs: Math.round(item.firstSeenMs), lastSeenMs: Math.round(item.lastSeenMs) }));
      const peak = (role: string) => Math.max(0, ...processes.filter(item => item.role === role).map(item => item.peakRssBytes));
      return { samples, processes, peakCombinedRssBytes: combinedPeak,
        peakRssBytes: { analyzer: peak('analyzer'), 'configuration-helper': peak('configuration-helper'),
          'compiler-helper': peak('compiler-helper'), 'native-compiler': peak('native-compiler') } };
    },
  };
}

/** Diagram counters and the context's retained bytes, with the daemon's settled tree memory. */
async function daemonDiagramState(connection: ServiceConnection, token: ContextToken): Promise<{
  readonly behaviorRuns: number; readonly dependencyDiagrams: number; readonly dependencyDiagramInputChanges: number;
  readonly retainedBytes: number | null; readonly daemonPid: number; readonly analyzerProcesses: number }> {
  const status = await connection.daemonStatus();
  assert.ok(status.ok, JSON.stringify(status));
  const counters = status.value.counters as unknown as Record<string, number>;
  const context = status.value.contexts.find(item => item.token.context === token.context);
  return { behaviorRuns: counters.behaviorRuns!, dependencyDiagrams: counters.dependencyDiagrams!,
    dependencyDiagramInputChanges: counters.dependencyDiagramInputChanges!, retainedBytes: context?.retainedBytes ?? null,
    daemonPid: status.value.pid, analyzerProcesses: (await analyzerTree(status.value.pid)).length };
}

/** Settled daemon memory: no analyzer process remains, then the daemon tree's resident memory. */
async function settledDaemonMemory(connection: ServiceConnection, token: ContextToken): Promise<Record<string, unknown>> {
  const state = await until(async () => { const current = await daemonDiagramState(connection, token); return current.analyzerProcesses === 0 ? current : null; },
    10_000, () => 'analyzer process still running');
  await pause(1000);
  const status = await connection.daemonStatus(); assert.ok(status.ok);
  return { ...state, tree: await treeRss(state.daemonPid), heap: status.value.memory };
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

async function refreshTo(page: Page, revision: ContextRevision, dependencies = true): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const refresh = page.getByRole('button', { name: 'Refresh (stale)' });
  await refresh.waitFor({ state: 'visible', timeout: 15_000 });
  await refresh.click();
  await page.locator('.module-arch__revision').filter({ hasText: revision.revision }).waitFor({ timeout: 120_000 });
  if (dependencies) await waitForDependencies(page, revision.revision);
}

/**
 * BD39 and BD52 on the reference: the rolled-up default, every panel scope, all three controls and
 * a drilled-in scope over the served model, with no further dependency request.
 */
async function exerciseReference(page: Page, model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  requests: RequestLog): Promise<Record<string, unknown>> {
  const visible = initialVisible(model);
  assert.equal(await page.locator('.module-arch__subtitle').textContent(), expectedSubtitle(model, deps));
  const requestsBefore = requests.dependencyViews();
  const sidebar = page.locator('.module-arch__sidebar');
  const projectPanelRegion = () => sidebar.getByRole('region', { name: 'Project dependencies' });

  // Project panel: every dependency of the reference is internal to a top-level node or folded
  // into the root's own source, so this scope draws nothing.
  await page.locator('.module-arch__detail-name').filter({ hasText: 'Project dependencies' }).waitFor();
  const defaultIds = expectedLinks(model, deps, null);
  assert.deepEqual(defaultIds, [], `The reference project scope drew links: ${JSON.stringify(defaultIds)}`);
  const projectView = scopeCounts(model, deps, null);
  const whole = { behavioral: deps.project.behavioral, nonBehavioral: deps.project.nonBehavioral };
  assert.deepEqual(await labelledCards(projectPanelRegion(), 'This view'),
    { ...projectView, note: 'not drawn' });
  assert.deepEqual(await labelledCards(projectPanelRegion(), 'Whole project'), { ...whole, note: 'not drawn' });
  const notDrawn = await sidebar.locator('.module-arch__not-drawn').getAttribute('data-not-drawn');
  assert.equal(notDrawn, `${whole.behavioral - projectView.behavioral}/${whole.nonBehavioral - projectView.nonBehavioral}`);
  assert.equal(await metricValue(page, 'Displayed module links'), String(defaultIds.length));
  const coverage = await metricValue(page, 'Coverage');
  assert.equal(coverage, deps.state === 'complete' ? 'Complete' : `Partial: ${deps.coverage.unknownDependencies} omitted`);
  assert.equal(await metricValue(page, 'Input'), deps.inputId);
  // The project scope covers a single-root project, so no link can leave it.
  assert.equal(await page.getByRole('checkbox', { name: 'Show dependencies that leave this module' }).count(), 0);
  const projectPanel = { thisView: projectView, wholeProject: whole, notDrawn,
    displayedLinks: defaultIds.length, coverage, inputId: deps.inputId };

  // Drill into the one scope whose children carry the links, and exercise all three controls there.
  const nested = model.modules.filter(item => visible.includes(item.id) && item.children.length > 0);
  assert.ok(nested.length > 0, 'Reference has no nested visible module');
  const scoped = nested.reduce((best, item) =>
    scopeLinks(model, deps, item.id, { ...defaultLinks, showNonBehavioral: true }).length
      > scopeLinks(model, deps, best.id, { ...defaultLinks, showNonBehavioral: true }).length ? item : best);
  await clickGraphNode(page, scoped.id, true);
  await page.getByRole('navigation', { name: 'Module navigation' }).waitFor();
  const scopeChildren = visibleAt(model, scoped.id);
  await waitForLinks(page, expectedLinks(model, deps, scoped.id), `Links inside ${scoped.id}`);

  const combinations: Record<string, unknown>[] = [];
  for (const settings of [
    { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true, showOwnSourceNode: false },
    { showNonBehavioral: true, depthMode: 'level', showOutsideScope: false, showOwnSourceNode: false },
    { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true, showOwnSourceNode: true },
    { showNonBehavioral: true, depthMode: 'level', showOutsideScope: false, showOwnSourceNode: true },
    { showNonBehavioral: true, depthMode: 'exact', showOutsideScope: true, showOwnSourceNode: false },
    { showNonBehavioral: false, depthMode: 'exact', showOutsideScope: true, showOwnSourceNode: false },
    defaultLinks,
  ] as const satisfies readonly LinkSettings[]) {
    await applyLinkSettings(page, settings);
    const expected = expectedLinks(model, deps, scoped.id, settings);
    const rendered = await waitForLinks(page, expected, `Links for ${JSON.stringify(settings)} inside ${scoped.id}`);
    const outOfView = expectedOutOfView(model, deps, scoped.id, settings);
    assert.deepEqual(await renderedNodeIds(page),
      [...drawnNodesAt(model, scoped.id, settings), ...outOfView].sort());
    const counts = scopeCounts(model, deps, scoped.id, settings);
    const cards = await labelledCards(projectPanelRegion(), 'This view');
    assert.deepEqual(cards, { ...counts, note: settings.showNonBehavioral ? 'shown' : 'not drawn' });
    assert.deepEqual(await labelledCards(projectPanelRegion(), 'Whole project'),
      { ...whole, note: settings.showNonBehavioral ? 'shown' : 'not drawn' });
    combinations.push({ settings, links: rendered.length, outOfView, thisView: counts, note: cards.note });
  }
  assert.ok(new Set(combinations.map(item => item.links)).size > 1,
    `The controls did not change the drawn links: ${JSON.stringify(combinations)}`);
  // The scope's own source is reported, not drawn.
  const ownSource = sidebar.getByRole('region', { name: "Scope's own source" });
  const ownRow = deps.modules.find(row => row.id === scoped.id)!;
  assert.deepEqual(await labelledCards(ownSource, 'Uses'), { ...ownRow.uses, note: 'not drawn' });
  assert.deepEqual(await labelledCards(ownSource, 'Owned originals used by others'),
    { ...ownRow.ownedUsedByOthers, note: 'not drawn' });
  const ownSourcePanel = await exerciseOwnSourceNode(page, model, deps, scoped.id, ownRow);

  // Module panel at this scope: the filtered numbers against the measured subtree totals.
  await setShowNonBehavioral(page, true);
  const rows = new Map(deps.modules.map(row => [row.id, row]));
  const level = scopeLinks(model, deps, scoped.id, { ...defaultLinks, showNonBehavioral: true });
  const module = model.modules.filter(item => scopeChildren.includes(item.id))
    .sort((left, right) => level.filter(link => link.consumer === right.id).length
      - level.filter(link => link.consumer === left.id).length)[0];
  assert.ok(module, 'The drilled-in scope has no selectable module');
  await clickGraphNode(page, module.id);
  await page.locator('.module-arch__detail-name').filter({ hasText: module.name }).waitFor();
  const subtree = subtreeCounts(model, deps, module.id);
  const atLevel = (select: (link: ScopeLink) => boolean) => level.filter(select)
    .reduce((sum, link) => ({ behavioral: sum.behavioral + link.behavioral,
      nonBehavioral: sum.nonBehavioral + link.nonBehavioral }), { behavioral: 0, nonBehavioral: 0 });
  const usesRegion = sidebar.getByRole('region', { name: 'Uses' });
  assert.deepEqual(await labelledCards(usesRegion, 'At this level'),
    { ...atLevel(link => link.consumer === module.id), note: 'shown' });
  assert.deepEqual(await labelledCards(usesRegion, 'Including internals'), { ...subtree.uses, note: 'shown' });
  const ownedRegion = sidebar.getByRole('region', { name: 'Owned originals used by others' });
  assert.deepEqual(await labelledCards(ownedRegion, 'At this level'),
    { ...atLevel(link => link.provider === module.id), note: 'shown' });
  assert.deepEqual(await labelledCards(ownedRegion, 'Including internals'),
    { ...subtree.ownedUsedByOthers, note: 'shown' });
  await openDisclosure(page, 'Used through this module');
  const throughRegion = sidebar.getByRole('region', { name: 'Used through this module' });
  assert.deepEqual(await labelledCards(throughRegion, 'Including internals'),
    { behavioral: subtree.usedThrough.behavioralUsedOriginals,
      nonBehavioral: subtree.usedThrough.nonBehavioralUsedOriginals, note: 'shown' });
  assert.equal(await metricValue(page, 'Links displayed'),
    String(level.filter(link => link.consumer === module.id || link.provider === module.id).length));
  let detailState = 'no-export';
  if (module.exports.length > 0) {
    await page.locator('.export-list__toggle').first().click();
    await page.locator('.export-list__signature-loading').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    detailState = await page.locator('.export-list__signature-container').first().innerText();
    await page.locator('.export-list__locations').first().waitFor();
  }
  const modulePanel = { module: module.id, atLevelUses: atLevel(link => link.consumer === module.id),
    subtreeUses: subtree.uses, subtreeOwned: subtree.ownedUsedByOthers, rows: rows.get(module.id), detailState };

  // Rolled-up link panel: its contributing exact modules and its imported-through breakdown.
  const rolled = level.find(link => link.sources.length > 1) ?? level[0]!;
  await clickGraphEdge(page, rolled.id);
  await page.getByRole('heading', { name: 'Rolled-up link' }).waitFor();
  assert.deepEqual(await labelledCards(sidebar.getByRole('region', { name: 'Dependencies' }), 'At this level'),
    { behavioral: rolled.behavioral, nonBehavioral: rolled.nonBehavioral, note: 'shown' });
  const rolledModules = await sidebar.getByRole('region', { name: 'Rolled-up modules' })
    .locator('.module-arch__breakdown-item').evaluateAll(items => items.map(item =>
      [item.getAttribute('data-consumer'), item.getAttribute('data-provider')]));
  assert.deepEqual(rolledModules, rolled.sources.map(id => {
    const edge = deps.originalOwnerEdges.find(item => item.id === id)!;
    return [edge.consumer, edge.provider];
  }));
  const importedThrough = new Set(rolled.sources.flatMap(id =>
    deps.originalOwnerEdges.find(item => item.id === id)!.importedThrough.map(item => item.module)));
  await openDisclosure(page, 'Imported through');
  assert.equal(await sidebar.getByRole('region', { name: 'Imported through' }).locator('li').count(), importedThrough.size);
  await expandSection(page, 'Referenced originals');
  const rolledOriginals = await sidebar.locator('.module-arch__evidence-item').count();
  assert.equal(rolledOriginals, new Set(rolled.sources.flatMap(id =>
    deps.originalOwnerEdges.find(item => item.id === id)!.evidence.map(item => JSON.stringify(item.original)))).size);

  const separator = page.getByRole('separator', { name: 'Resize sidebar' });
  const beforeWidth = (await sidebar.boundingBox())!.width;
  const box = await separator.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down(); await page.mouse.move(box.x - 80, box.y + 20, { steps: 4 }); await page.mouse.up();
  const afterWidth = (await sidebar.boundingBox())!.width;
  assert.ok(afterWidth > beforeWidth + 30, `Sidebar did not resize: ${beforeWidth} -> ${afterWidth}`);

  // Exact link panel: changing the depth mode clears the rolled-up selection.
  await setLinkDepth(page, 'exact');
  const exactIds = expectedLinks(model, deps, scoped.id, { ...defaultLinks, showNonBehavioral: true, depthMode: 'exact' });
  await waitForLinks(page, exactIds, 'Exact links inside the scope');
  await page.locator('.module-arch__detail-name').filter({ hasText: 'Project dependencies' }).waitFor();
  const exactLink = scopeLinks(model, deps, scoped.id, { ...defaultLinks, showNonBehavioral: true, depthMode: 'exact' })[0]!;
  await clickGraphEdge(page, exactLink.id);
  await page.getByRole('heading', { name: 'Original-owner link' }).waitFor();
  const exactCards = await headlineCards(sidebar.getByRole('region', { name: 'Dependencies' }));
  assert.deepEqual([exactCards.behavioral, exactCards.nonBehavioral], [exactLink.behavioral, exactLink.nonBehavioral]);
  const exactEdge = deps.originalOwnerEdges.find(item => item.id === exactLink.id)!;
  assert.equal(await sidebar.getByRole('region', { name: 'Imported through' }).locator('li').count(),
    exactEdge.importedThrough.length);
  await setLinkDepth(page, 'level');
  await waitForLinks(page, expectedLinks(model, deps, scoped.id, { ...defaultLinks, showNonBehavioral: true }),
    'Rolled-up links after the exact panel');
  await setShowNonBehavioral(page, false);

  const viewport = page.locator('.react-flow__viewport');
  const transformBefore = await viewport.getAttribute('style');
  await page.locator('.react-flow__controls-zoomin').click();
  await page.waitForTimeout(100);
  const transformZoom = await viewport.getAttribute('style');
  assert.notEqual(transformZoom, transformBefore, 'Zoom did not change the viewport transform');
  const pane = page.locator('.react-flow__pane');
  const paneBox = await pane.boundingBox(); assert.ok(paneBox);
  // From an empty corner of the pane, clear of module nodes and links.
  await page.mouse.move(paneBox.x + 40, paneBox.y + 40);
  await page.mouse.down(); await page.mouse.move(paneBox.x + 110, paneBox.y + 80, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(100);
  const transformPan = await viewport.getAttribute('style');
  assert.notEqual(transformPan, transformZoom, 'Pan did not change the viewport transform');

  // The class filter changes the displayed nodes without changing how an end maps: a
  // filtered-out child keeps receiving its subtree's ends and becomes a related node.
  const children = model.modules.filter(item => scopeChildren.includes(item.id));
  const classes = [...new Set(children.map(item => item.presentationClass))].sort();
  assert.ok(classes.length > 1, `The drilled-in scope has one tag class: ${JSON.stringify(classes)}`);
  const hiddenClass = classes[0]!;
  const stillDisplayed = children.filter(item => item.presentationClass !== hiddenClass).map(item => item.id);
  const hiddenChildren = children.filter(item => item.presentationClass === hiddenClass).map(item => item.id);
  assert.ok(hiddenChildren.length > 0 && stillDisplayed.length > 0);
  const checked = page.locator(
    `.module-arch__filters[aria-label="Presentation class filters"] .module-arch__filter-item[data-presentation-class="${hiddenClass}"] input`);
  const beforeFilter = await page.locator('.react-flow__node').count();
  await checked.click();
  const filteredLinks = await waitForLinks(page, expectedLinks(model, deps, scoped.id, defaultLinks, stillDisplayed),
    'Links after the class filter');
  const filteredOutOfView = expectedOutOfView(model, deps, scoped.id, defaultLinks, stillDisplayed);
  assert.deepEqual(await renderedNodeIds(page), [...stillDisplayed, ...filteredOutOfView].sort());
  const subtitle = await page.locator('.module-arch__subtitle').textContent();
  assert.ok(subtitle?.includes(`Showing ${stillDisplayed.length} sub-modules`), subtitle ?? '');
  const afterFilter = await page.locator('.react-flow__node').count();
  await checked.click();
  await waitForLinks(page, expectedLinks(model, deps, scoped.id), 'Default links after the filter');
  const scopes: Record<string, unknown>[] = [{ scope: scoped.id, children: scopeChildren.length,
    links: expectedLinks(model, deps, scoped.id).length,
    outOfView: expectedOutOfView(model, deps, scoped.id), hiddenClass,
    filter: { beforeNodes: beforeFilter, afterNodes: afterFilter, hiddenChildren,
      displayed: stillDisplayed, links: filteredLinks.length, outOfView: filteredOutOfView } }];

  // Back to the project scope, then into a grandchild scope: the roll-up applies at every level.
  await page.getByRole('button', { name: 'All Modules' }).click();
  await waitForLinks(page, defaultIds, 'Project-scope links after leaving a scope');
  await clickGraphNode(page, scoped.id, true);
  const grandchild = model.modules.find(item => scopeChildren.includes(item.id) && item.children.length > 0);
  if (grandchild) {
    await clickGraphNode(page, grandchild.id, true);
    const inner = expectedLinks(model, deps, grandchild.id);
    await waitForLinks(page, inner, `Links inside ${grandchild.id}`);
    assert.deepEqual(await renderedNodeIds(page),
      [...visibleAt(model, grandchild.id), ...expectedOutOfView(model, deps, grandchild.id)].sort());
    scopes.push({ scope: grandchild.id, children: visibleAt(model, grandchild.id).length, links: inner.length,
      outOfView: expectedOutOfView(model, deps, grandchild.id) });
  }
  await page.getByRole('button', { name: 'All Modules' }).click();
  await waitForLinks(page, defaultIds, 'Project-scope links at the end');
  assert.ok(scopes.some(item => (item.outOfView as string[]).length > 0),
    `No scope drew an out-of-view module: ${JSON.stringify(scopes)}`);

  // BD52: no control, selection or scope change requested dependency data again.
  assert.equal(requests.dependencyViews(), requestsBefore, 'A control or scope change requested the dependency view');
  return { projectPanel, combinations, modulePanel, ownSourceNode: ownSourcePanel,
    rolledUpLinkPanel: { id: rolled.id, consumer: rolled.consumer, provider: rolled.provider,
      behavioral: rolled.behavioral, nonBehavioral: rolled.nonBehavioral, sources: rolled.sources,
      rolledModules, importedThrough: importedThrough.size, referencedOriginals: rolledOriginals },
    exactLinkPanel: { id: exactLink.id, consumer: exactLink.consumer, provider: exactLink.provider,
      behavioral: exactLink.behavioral, nonBehavioral: exactLink.nonBehavioral,
      importedThrough: exactEdge.importedThrough.length },
    scopes, dependencyViewRequests: { beforeControls: requestsBefore, afterControls: requests.dependencyViews() },
    sidebar: { beforeWidth, afterWidth }, viewport: { before: transformBefore, zoom: transformZoom, pan: transformPan } };
}

/**
 * BD61: the own-source control inside a drilled-in scope. The drawn links, the node and the panel
 * numbers are compared with the independent calculation; the control requests nothing.
 */
async function exerciseOwnSourceNode(page: Page, model: ProjectExplorerModel, deps: ExplorerDependencyModel,
  scopeModuleId: string, row: ExplorerDependencyModel['modules'][number]): Promise<Record<string, unknown>> {
  const sidebar = page.locator('.module-arch__sidebar');
  const projectPanelRegion = () => sidebar.getByRole('region', { name: 'Project dependencies' });
  const measured = { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true } as const;
  const folded: LinkSettings = { ...measured, showOwnSourceNode: false };
  const withNode: LinkSettings = { ...measured, showOwnSourceNode: true };
  const node = ownSourceNode(scopeModuleId);
  const scopeName = model.modules.find(item => item.id === scopeModuleId)!.name;

  // The control is off by default and named like the other checkboxes.
  const toggle = page.getByRole('checkbox', { name: "Show this module's own source as a node" });
  assert.equal(await toggle.count(), 1, 'The drilled-in scope renders no own-source control');
  await applyLinkSettings(page, folded);
  assert.equal(await toggle.isChecked(), false);
  const before = scopeLinks(model, deps, scopeModuleId, folded);
  const beforeCounts = scopeCounts(model, deps, scopeModuleId, folded);
  await waitForLinks(page, expectedLinks(model, deps, scopeModuleId, folded), 'Folded links before the control');
  assert.equal(await page.locator(`[data-own-source="${scopeModuleId}"]`).count(), 0);

  // On: exactly the calculated links appear, in both directions where the model has them.
  await applyLinkSettings(page, withNode);
  const after = scopeLinks(model, deps, scopeModuleId, withNode);
  const ownLinks = after.filter(link => link.consumer === node || link.provider === node);
  assert.ok(ownLinks.length > 0, `The scope has no own-source link: ${scopeModuleId}`);
  await waitForLinks(page, expectedLinks(model, deps, scopeModuleId, withNode), 'Links with the own-source node');
  assert.deepEqual(await renderedNodeIds(page),
    [...drawnNodesAt(model, scopeModuleId, withNode), ...expectedOutOfView(model, deps, scopeModuleId, withNode)].sort());
  const drawnNode = page.locator(`[data-own-source="${scopeModuleId}"]`);
  assert.equal(await drawnNode.count(), 1, 'The own-source node is not drawn');
  assert.equal(await drawnNode.getAttribute('aria-label'), `${scopeName} · own source`);
  const nodeShape = await drawnNode.evaluate(element => ({
    borderRadius: getComputedStyle(element).borderRadius,
    subModuleBadge: element.textContent?.includes(' sub') ?? false,
  }));
  assert.ok(!nodeShape.subModuleBadge, 'The own-source node shows a sub-module count');

  // Its pairs move from the numbers not drawn into this view.
  const afterCounts = scopeCounts(model, deps, scopeModuleId, withNode);
  const ownCounts = ownLinks.reduce((sum, link) => ({ behavioral: sum.behavioral + link.behavioral,
    nonBehavioral: sum.nonBehavioral + link.nonBehavioral }), { behavioral: 0, nonBehavioral: 0 });
  assert.deepEqual(afterCounts, { behavioral: beforeCounts.behavioral + ownCounts.behavioral,
    nonBehavioral: beforeCounts.nonBehavioral + ownCounts.nonBehavioral });
  assert.deepEqual(await labelledCards(projectPanelRegion(), 'This view'), { ...afterCounts, note: 'shown' });
  const whole = { behavioral: deps.project.behavioral, nonBehavioral: deps.project.nonBehavioral };
  assert.deepEqual(await labelledCards(projectPanelRegion(), 'Whole project'), { ...whole, note: 'shown' });
  const notDrawn = await sidebar.locator('.module-arch__not-drawn').getAttribute('data-not-drawn');
  assert.equal(notDrawn,
    `${whole.behavioral - afterCounts.behavioral}/${whole.nonBehavioral - afterCounts.nonBehavioral}`);
  const notDrawnText = await sidebar.locator('.module-arch__not-drawn').textContent() ?? '';
  assert.ok(!notDrawnText.includes('folded'), `The not-drawn causes still name folding: ${notDrawnText}`);
  const ownStatement = await sidebar.getByRole('region', { name: "Scope's own source" })
    .locator('.module-arch__sidebar-hint').textContent();
  assert.ok(ownStatement?.includes('drawn as its own node'), ownStatement ?? '');

  // The node's panel: its drawn links against the scope module's own served row.
  await clickGraphNode(page, node);
  await page.getByRole('heading', { name: `${scopeName} · own source` }).waitFor();
  const atLevel = (select: (link: ScopeLink) => boolean) => ownLinks.filter(select)
    .reduce((sum, link) => ({ behavioral: sum.behavioral + link.behavioral,
      nonBehavioral: sum.nonBehavioral + link.nonBehavioral }), { behavioral: 0, nonBehavioral: 0 });
  const usesRegion = sidebar.getByRole('region', { name: 'Uses' });
  assert.deepEqual(await labelledCards(usesRegion, 'At this level'),
    { ...atLevel(link => link.consumer === node), note: 'shown' });
  assert.deepEqual(await labelledCards(usesRegion, 'Excluding internals'), { ...row.uses, note: 'shown' });
  const ownedRegion = sidebar.getByRole('region', { name: 'Owned originals used by others' });
  assert.deepEqual(await labelledCards(ownedRegion, 'At this level'),
    { ...atLevel(link => link.provider === node), note: 'shown' });
  assert.deepEqual(await labelledCards(ownedRegion, 'Excluding internals'),
    { ...row.ownedUsedByOthers, note: 'shown' });
  await openDisclosure(page, 'Used through this module');
  assert.deepEqual(await labelledCards(sidebar.getByRole('region', { name: 'Used through this module' }),
    'Excluding internals'), { behavioral: row.usedThrough.behavioralUsedOriginals,
    nonBehavioral: row.usedThrough.nonBehavioralUsedOriginals, note: 'shown' });
  assert.equal(await metricValue(page, 'Links displayed'), String(ownLinks.length));

  // A selected own-source link keeps its calculated identity and counts.
  const link = ownLinks[0]!;
  await clickGraphEdge(page, link.id);
  await page.getByRole('heading', { name: 'Rolled-up link' }).waitFor();
  assert.deepEqual(await labelledCards(sidebar.getByRole('region', { name: 'Dependencies' }), 'At this level'),
    { behavioral: link.behavioral, nonBehavioral: link.nonBehavioral, note: 'shown' });

  // Off again: the folded default returns and the selection is cleared.
  await applyLinkSettings(page, folded);
  await waitForLinks(page, expectedLinks(model, deps, scopeModuleId, folded), 'Folded links after the control');
  assert.equal(await page.locator(`[data-own-source="${scopeModuleId}"]`).count(), 0);
  await page.locator('.module-arch__detail-name').filter({ hasText: 'Project dependencies' }).waitFor();
  assert.deepEqual(await labelledCards(projectPanelRegion(), 'This view'), { ...beforeCounts, note: 'shown' });
  return { scope: scopeModuleId, node, label: `${scopeName} · own source`, nodeShape,
    foldedLinks: before.length, linksWithNode: after.length,
    ownLinks: ownLinks.map(item => ({ id: item.id, consumer: item.consumer, provider: item.provider,
      behavioral: item.behavioral, nonBehavioral: item.nonBehavioral, leavesScope: item.leavesScope,
      sources: item.sources })),
    ownCounts, beforeCounts, afterCounts, notDrawn, measuredRow: row };
}

// Endpoint selection and the installed entries verify the package's own version.
const version = (JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string }).version;
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

async function openExplorerPage(browser: Browser, url: string, viewport: { width: number; height: number }): Promise<{
  context: BrowserContext; page: Page; requests: RequestLog }> {
  const context = await browser.newContext({ viewport });
  await installBrowserInstrumentation(context);
  await installDependencyStateHistory(context);
  const page = await context.newPage();
  const requests = recordRequests(page);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Project Explorer' }).waitFor({ timeout: 120_000 });
  return { context, page, requests };
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

    // Ordinary checks never run the classifier; the context retains no diagram before the page asks.
    const daemonPid = (await daemonDiagramState(connection, token)).daemonPid;
    const diagnosticConnection = connection;
    dependencyDiagnostics = async () => ({ daemon: await daemonDiagramState(diagnosticConnection, token),
      server: await dependencyViewOver(explored.record.origin, (await serverStatus(explored.record)).published?.revision ?? 'none').catch(String) });
    const beforePage = await settledDaemonMemory(connection, token);
    assert.equal(beforePage.behaviorRuns, 0, JSON.stringify(beforePage));
    assert.equal(beforePage.dependencyDiagrams, 0, JSON.stringify(beforePage));

    const sampler = sampleAnalyzerMemory(daemonPid);
    const pageStarted = performance.now();
    const opened = await openExplorerPage(browser, explored.url, { width: 1440, height: 1000 });
    context = opened.context; const page = opened.page;
    try { await page.locator('.module-arch__revision').filter({ hasText: ready.view.revision }).waitFor({ timeout: 60_000 }); }
    catch (error) { throw new Error(`Browser did not display ${ready.view.revision}: ${await page.locator('body').innerText()}`, { cause: error }); }
    const dependencyState = await waitForDependencies(page, ready.view.revision);
    const dependencyReadyMs = performance.now() - pageStarted;
    const withDiagram = await settledDaemonMemory(connection, token);
    const analyzerMemory = await sampler.stop();
    assert.equal(withDiagram.behaviorRuns, 1, JSON.stringify(withDiagram));
    assert.equal(withDiagram.dependencyDiagrams, 1, JSON.stringify(withDiagram));
    assert.ok(analyzerMemory.peakRssBytes.analyzer > 0 && analyzerMemory.peakRssBytes['compiler-helper'] > 0, JSON.stringify(analyzerMemory));
    const deps = await readyDependencies(explored.record.origin, check.revision);
    assert.equal(dependencyState, deps.state === 'partial' ? 'partial' : deps.project.behavioral + deps.project.nonBehavioral === 0 ? 'zero' : 'complete');
    assert.equal(await page.locator('.module-arch__subtitle').textContent(), expectedSubtitle(ready.view, deps));
    const dom = await assertModuleOnlyDom(page, ready.view, deps);
    const visible = new Set(initialVisible(ready.view));
    const countEvidence = { displayed: await page.locator('.module-arch__subtitle').textContent(),
      displayedRevision: await page.locator('.module-arch__revision').textContent(),
      reportRevision: check.revision.revision,
      reportModules: check.report!.snapshot!.inventory!.modules.length, projectedModules: ready.view.modules.length,
      visibleModules: visible.size, reportAccesses: check.report!.snapshot!.accesses.length,
      occurrenceEdges: ready.view.edges.length, visibleLinks: expectedLinks(ready.view, deps, null).length, encodedBytes };
    assert.equal(countEvidence.reportModules, countEvidence.projectedModules);
    const dependencies = { revision: check.revision.revision, inputId: deps.inputId, state: deps.state, project: deps.project,
      coverage: deps.coverage, modules: deps.modules.length, importedModuleEdges: deps.importedModuleEdges.length,
      originalOwnerEdges: deps.originalOwnerEdges.length, encodedBytes: Buffer.byteLength(JSON.stringify(deps)),
      pageToReadyMs: Math.round(dependencyReadyMs), browserDependencyViewRequests: opened.requests.dependencyViews(),
      memory: { withoutRetainedDiagram: beforePage, withRetainedDiagram: withDiagram, analyzer: analyzerMemory } };

    const interactions = kind === 'reference' ? await exerciseReference(page, ready.view, deps, opened.requests) : null;
    const refreshes: Record<string, unknown>[] = [];
    const sameRevisionReloads: Record<string, unknown>[] = [];
    let refreshBaseline: BrowserSnapshot | null = null;
    let publishCycles: Record<string, unknown> | null = null;
    if (kind === 'reference') {
      // Start the repeated-use observation from a clean, fully rendered page;
      // the preceding interaction workflow deliberately leaves selected UI.
      await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
      await waitForDependencies(page, ready.view.revision);
      refreshBaseline = await snapshot(page);
      const baseline = refreshBaseline;
      const stableTo = (settled: BrowserSnapshot) => settled.listeners === baseline.listeners
        && settled.intervals === baseline.intervals && settled.timeouts === baseline.timeouts
        && settled.models === baseline.models && settled.graphNodes === baseline.graphNodes
        && settled.graphEdges === baseline.graphEdges;
      // BD42: ten settled refreshes of the same revision answer from retention and start no analyzer.
      const reloadStart = await daemonDiagramState(connection, token);
      for (let cycle = 1; cycle <= 10; cycle++) {
        const requestsBefore = opened.requests.dependencyViews();
        await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
        await waitForDependencies(page, ready.view.revision);
        const settled = await snapshot(page);
        const state = await daemonDiagramState(connection, token);
        assert.ok(stableTo(settled), `Reload ${cycle} did not settle to baseline: ${JSON.stringify({ refreshBaseline, settled })}`);
        assert.equal(state.behaviorRuns, reloadStart.behaviorRuns);
        assert.equal(state.dependencyDiagrams, reloadStart.dependencyDiagrams);
        assert.equal(state.retainedBytes, reloadStart.retainedBytes);
        sameRevisionReloads.push({ cycle, settled, dependencyViewRequests: opened.requests.dependencyViews() - requestsBefore,
          behaviorRuns: state.behaviorRuns, dependencyDiagrams: state.dependencyDiagrams, retainedBytes: state.retainedBytes });
      }
      const publishStart = await daemonDiagramState(connection, token);
      for (let cycle = 1; cycle <= 10; cycle++) {
        const published = await publishMutation(connection, token, project.root, 'README.md',
          `# Collection Review\n\nIteration 4 explicit refresh cycle ${cycle}.\n`);
        await refreshTo(page, published.revision);
        const settled = await snapshot(page);
        const stable: boolean = stableTo(settled);
        assert.ok(stable, `Refresh ${cycle} did not settle to baseline: ${JSON.stringify({ refreshBaseline, settled })}`);
        const shown = await readyDependencies(explored.record.origin, published.revision);
        assert.deepEqual(shown.project, deps.project);
        refreshes.push({ cycle, revision: published.revision, inputId: shown.inputId, settled, stable });
      }
      const publishEnd = await daemonDiagramState(connection, token);
      // Each new revision is one on-demand diagram; the retained diagram stays one current result.
      assert.equal(publishEnd.dependencyDiagrams - publishStart.dependencyDiagrams, 10);
      assert.equal(publishEnd.behaviorRuns - publishStart.behaviorRuns, 10);
      publishCycles = { before: publishStart, after: publishEnd };
    }
    assert.equal(page.url(), explored.url, 'The explorer URL changed during the workflow');
    const daemon = await connection.daemonStatus(); assert.ok(daemon.ok, JSON.stringify(daemon));
    const webMemory = await rss(explored.record.pid);
    return { kind, root: project.root, url: explored.url, finalUrl: page.url(),
      explore: { exitCode: explored.command.code, durationMs: explored.command.durationMs, stdout: explored.command.stdout,
        stderr: explored.command.stderr, serverPid: explored.record.pid, defaultStartupMs: 5000 },
      revision: check.revision, projectionDurationMs, encodedBytes,
      counts: countEvidence, dependencies, externalAccesses, dom, interactions, refreshBaseline, sameRevisionReloads, refreshes, publishCycles,
      memory: { web: webMemory, daemon: { ...(await treeRss(daemon.value.pid)), ...daemon.value.memory, counters: daemon.value.counters,
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
    await waitForDependencies(page, initialModel.revision);
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
    const npmDom = await assertModuleOnlyDom(page, npmModel, await readyDependencies(discovered.origin, npmOnly.revision));

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
    // The consumer's data use of the provider is a non-behavioral link; its evidence counts both occurrences.
    const sourceDeps = await readyDependencies(discovered.origin, source.revision);
    const sourceBoundary = sourceDeps.importedModuleEdges.find(item => item.consumer === 'fixture/consumer' && item.provider === 'fixture/provider');
    assert.ok(sourceBoundary && sourceBoundary.counts.behavioralUsedOriginals === 0 && sourceBoundary.counts.nonBehavioralUsedOriginals === 1, JSON.stringify(sourceBoundary));
    const sourceOwner = sourceDeps.originalOwnerEdges.find(item => item.consumer === 'fixture/consumer' && item.provider === 'fixture/provider');
    assert.ok(sourceOwner && sourceOwner.counts.behavioral === 0 && sourceOwner.counts.nonBehavioral === 1, JSON.stringify(sourceOwner));
    assert.deepEqual(await renderedEdgeIds(page), []);
    await setShowNonBehavioral(page, true);
    const nonBehavioralLinks = { ...defaultLinks, showNonBehavioral: true };
    const sourceLink = scopeLinks(sourceModel, sourceDeps, null, nonBehavioralLinks)
      .find(link => link.consumer === 'fixture/consumer' && link.provider === 'fixture/provider');
    assert.ok(sourceLink && sourceLink.sources.length === 1 && sourceLink.sources[0] === sourceOwner.id,
      JSON.stringify(sourceLink));
    await waitForLinks(page, expectedLinks(sourceModel, sourceDeps, null, nonBehavioralLinks), 'Non-behavioral source link');
    await clickGraphEdge(page, sourceLink.id);
    await page.getByRole('heading', { name: 'Rolled-up link' }).waitFor();
    await expandSection(page, 'Referenced originals');
    assert.equal(await page.locator('.module-arch__evidence-occurrences').textContent(), 'Supporting occurrences: 2');
    await setShowNonBehavioral(page, false);

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
      source: { revision: source.revision, edge: sourceEdge.id, accessCount: sourceEdge.accessCount, link: sourceLink.id,
        linkCounts: { behavioral: sourceLink.behavioral, nonBehavioral: sourceLink.nonBehavioral },
        sources: sourceLink.sources, supportingOccurrences: 2 },
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

/** A foreground server for one root on a free fixed port, as the PM2 `explorer` app runs it. */
async function startTreeServer(isolated: Isolated, root: string): Promise<{
  readonly record: ExplorerProcessRecord; readonly stop: () => Promise<void>; readonly log: () => Promise<string> }> {
  const port = await new Promise<number>((resolvePort, reject) => {
    const probe = createServer(); probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const address = probe.address() as AddressInfo; probe.close(() => resolvePort(address.port)); });
  });
  const logPath = join(isolated.processRoot, `tree-server-${port}.log`);
  const log = await open(logPath, 'w', 0o600);
  const server = spawn(process.execPath, [explorerEntry, '--root', root, '--port', String(port)],
    { cwd: packageRoot, stdio: ['ignore', log.fd, log.fd], env: commandEnvironment(isolated, process.env.PATH ?? '') });
  const exited = new Promise<void>(resolveExit => server.once('exit', () => resolveExit()));
  const readLog = () => readFile(logPath, 'utf8').catch(() => '');
  const stop = async () => {
    if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await Promise.race([exited, pause(5000)]); }
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await log.close().catch(() => {});
  };
  try {
    const record = await until(async () => {
      const names = (await readdir(isolated.directory)).filter(name => /^explorer-[0-9a-f]{16}-[0-9a-f]{16}\.json$/.test(name));
      for (const name of names) {
        const found = await readExplorerProcessRecord(selectExplorerEndpoint(isolated.endpoint, name.slice(-21, -5)));
        if (found && found.pid === server.pid && found.state === 'running') return found;
      }
      return null;
    }, 120_000, readLog);
    return { record, stop, log: readLog };
  } catch (error) { await stop(); throw error; }
}

/**
 * The graph canvas fills the window below the header, and after fitting every rendered node lies
 * inside it. Waits for the fit, which runs a frame after nodes or the canvas size change.
 */
async function canvasFit(page: Page, canvasSelector: string): Promise<Record<string, unknown>> {
  const viewport = page.viewportSize()!;
  return until(async () => {
    const measured = await page.evaluate(selector => {
      const canvas = document.querySelector(selector)?.getBoundingClientRect();
      if (!canvas) return null;
      const nodes = [...document.querySelectorAll('.react-flow__node')].map(node => node.getBoundingClientRect());
      const outside = nodes.filter(box => box.left < canvas.left - 1 || box.right > canvas.right + 1
        || box.top < canvas.top - 1 || box.bottom > canvas.bottom + 1).length;
      return { canvasTop: canvas.top, canvasBottom: canvas.bottom, canvasHeight: canvas.height, canvasWidth: canvas.width, nodes: nodes.length, outside,
        minimapNodes: document.querySelectorAll('.react-flow__minimap-node').length,
        documentHeight: document.documentElement.scrollHeight };
    }, canvasSelector);
    if (!measured || measured.nodes === 0 || measured.outside > 0) return null;
    // The canvas runs from below the header to the window's bottom page padding, without page scroll.
    if (measured.canvasBottom < viewport.height - 40 || measured.documentHeight > viewport.height) return null;
    return { viewport, ...measured };
  }, 10_000, async () => `canvas ${canvasSelector} did not fill the window and fit: ${JSON.stringify(await page.evaluate(selector => ({
    canvas: document.querySelector(selector)?.getBoundingClientRect(), documentHeight: document.documentElement.scrollHeight }), canvasSelector))}`);
}

/** Instruments the page with the time the first tree node appeared. */
async function installTreeTiming(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: `(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.module-tree__node')) { window.__ramifyTreeRenderedAt = performance.now(); observer.disconnect(); }
    });
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));
  })();` });
}

async function treeNodeIds(page: Page): Promise<string[]> {
  return page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id') ?? ''));
}

/** Milliseconds from a toggle click to the second animation frame after it. */
async function toggleToPaint(page: Page, label: string): Promise<number> {
  return page.evaluate(async name => {
    const button = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === name);
    if (!button) throw new Error(`No toggle ${name}`);
    const started = performance.now();
    button.click();
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    return performance.now() - started;
  }, label);
}

async function openTreePage(context: BrowserContext, url: string, revision: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Module tree' }).waitFor({ timeout: 120_000 });
  await page.locator('.module-arch__revision').filter({ hasText: revision }).waitFor({ timeout: 60_000 });
  return page;
}

async function gzipBundleBytes(): Promise<{ readonly files: Record<string, number>; readonly gzipBytes: number }> {
  const { gzipSync } = await import('node:zlib');
  const assets = join(packageRoot, 'dist/explorer/assets');
  const files: Record<string, number> = {};
  for (const name of (await readdir(assets)).filter(item => item.endsWith('.js'))) {
    files[name] = gzipSync(await readFile(join(assets, name))).length;
  }
  return { files, gzipBytes: Object.values(files).reduce((sum, bytes) => sum + bytes, 0) };
}

const tsconfigFixture = JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] });

async function writeProject(scratch: string, name: string, files: Readonly<Record<string, string>>): Promise<{ root: string; dispose(): Promise<void> }> {
  const root = await realpath(await mkdtemp(join(scratch, `${name}-`)));
  for (const [path, value] of Object.entries(files)) await put(root, path, value);
  await symlink(join(packageRoot, 'node_modules'), join(root, 'node_modules'));
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}

/**
 * `forwarding`: A, B and B/A, where B forwards originals owned by B/A. A's one access selects the allowed
 * `act` and the denied `secret`, and A imports C's `helper` without using it. D uses `act` through B and
 * directly through B/A. E's use of C's `any` value is unknown, so coverage is partial.
 */
function forwardingProject(scratch: string): Promise<{ root: string; dispose(): Promise<void> }> {
  return writeProject(scratch, 'forwarding', {
    'module.ramify': 'ramify 1\nroot module fixture\nexpose-sub act from b to descendants\nexpose-sub helper, loose from c to descendants\n',
    'README.md': '# Fixture\n\nOwns the forwarding acceptance project.\n',
    'package.json': '{"type":"module"}\n',
    'tsconfig.json': tsconfigFixture,
    'src/index.ts': 'export const rootValue = 1;\n',
    'subs/a/module.ramify': 'ramify 1\nmodule a\n',
    'subs/a/README.md': '# A\n\nUses originals forwarded by B.\n',
    'subs/a/src/use.ts': "import { act, secret } from '../../b/src/index.js';\nimport { helper } from '../../c/src/index.js';\nact();\nexport const level = secret.level;\n",
    'subs/b/module.ramify': 'ramify 1\nmodule b\nexpose-sub act from a to parent\n',
    'subs/b/README.md': '# B\n\nForwards originals owned by its child.\n',
    'subs/b/src/index.ts': "export { act, secret } from '../subs/a/src/index.js';\n",
    'subs/b/subs/a/module.ramify': 'ramify 1\nmodule a\nexpose-src act from "index.ts" to parent\n',
    'subs/b/subs/a/README.md': '# B/A\n\nOwns the forwarded originals.\n',
    'subs/b/subs/a/src/index.ts': 'export function act(): void {}\nexport const secret = { level: 1 };\n',
    'subs/c/module.ramify': 'ramify 1\nmodule c\nexpose-src helper, loose from "index.ts" to parent\n',
    'subs/c/README.md': '# C\n\nProvides an import that A never uses.\n',
    'subs/c/src/index.ts': 'export function helper(): void {}\nexport const loose: any = 1;\n',
    'subs/d/module.ramify': 'ramify 1\nmodule d\n',
    'subs/d/README.md': '# D\n\nUses one original through two imported modules.\n',
    'subs/d/src/use.ts': "import { act } from '../../b/src/index.js';\nimport { act as direct } from '../../b/subs/a/src/index.js';\nact();\ndirect();\n",
    'subs/e/module.ramify': 'ramify 1\nmodule e\n',
    'subs/e/README.md': '# E\n\nUses a value whose capability the classifier cannot determine.\n',
    'subs/e/src/use.ts': "import { loose } from '../../c/src/index.js';\nvoid (loose + 1);\n",
  });
}

/** The consumer source of the dependency mutation fixture: `twice` adds a second behavioral dependency. */
function consumerSource(edit: number, twice: boolean): string {
  return "import { act, helper, type Shape } from '../../provider/src/interfaces/api.js';\n"
    + 'export const shape: Shape = { size: act() };\n'
    + (twice ? 'export const twice = helper(act());\n' : '') + `// edit ${edit}\n`;
}

/** `mutation` for Plan 6D: an isolated small project whose consumer edits publish new input IDs and counts. */
function dependencyMutationProject(scratch: string): Promise<{ root: string; dispose(): Promise<void> }> {
  return writeProject(scratch, 'dependency-mutation', {
    'module.ramify': 'ramify 1\nroot module fixture\nexpose-sub act, helper, Shape from provider to descendants\n',
    'README.md': '# Fixture\n\nOwns the dependency mutation acceptance project.\n',
    'package.json': '{"type":"module"}\n',
    'tsconfig.json': tsconfigFixture,
    'src/index.ts': 'export const rootValue = 1;\n',
    'subs/provider/module.ramify': 'ramify 1\nmodule provider\nexpose-src act, helper, Shape from "interfaces/api.ts" to parent\n',
    'subs/provider/README.md': '# Provider\n\nProvides behavior and a type.\n',
    'subs/provider/src/interfaces/api.ts': 'export function act(): number { return 1; }\nexport function helper(value: number): number { return value + 1; }\nexport interface Shape { readonly size: number }\n',
    'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
    'subs/consumer/README.md': '# Consumer\n\nUses the provider.\n',
    'subs/consumer/src/use.ts': consumerSource(0, false),
  });
}

function linkBetween<T extends { readonly consumer: string; readonly provider: string }>(edges: readonly T[], consumer: string, provider: string): T {
  const found = edges.find(edge => edge.consumer === consumer && edge.provider === provider);
  assert.ok(found, `No link ${consumer} -> ${provider}: ${JSON.stringify(edges.map(edge => [edge.consumer, edge.provider]))}`);
  return found;
}

async function evidenceRows(page: Page): Promise<{ original: string; paths: { classification: string; status: string; occurrences: string }[] }[]> {
  await expandSection(page, 'Referenced originals');
  return page.locator('.module-arch__sidebar .module-arch__evidence-item').evaluateAll(items => items.map(item => ({
    original: item.querySelector('.module-arch__evidence-original')?.textContent ?? '',
    paths: [...item.querySelectorAll('.module-arch__evidence-path')].map(path => {
      const badges = [...path.querySelectorAll('.module-arch__dependency-badge')].map(badge => badge.textContent ?? '');
      return { classification: badges[0] ?? '', status: badges[1] ?? '', occurrences: path.querySelector('.module-arch__evidence-occurrences')?.textContent ?? '' };
    }),
  })));
}

/** One foreground server for `root` with the harness connection and its project context. */
async function serveProject(isolated: Isolated, root: string, name: string): Promise<{ server: Awaited<ReturnType<typeof startTreeServer>>;
  connection: ServiceConnection; token: ContextToken; daemonPid: number }> {
  const server = await startTreeServer(isolated, root);
  try {
    const connection = await connectHarness(isolated, 'never', name);
    const token = await openProject(connection, root);
    assert.equal(token.context, server.record.context);
    return { server, connection, token, daemonPid: (await daemonDiagramState(connection, token)).daemonPid };
  } catch (error) { await server.stop(); throw error; }
}

/** BD40: B versus B/A endpoints, per-original status and both boundaries on the real forwarding fixture. */
async function runForwarding(project: { root: string }, browser: Browser): Promise<Record<string, unknown>> {
  const isolated = await isolatedEndpoint();
  let served: Awaited<ReturnType<typeof serveProject>> | undefined;
  let context: BrowserContext | undefined;
  try {
    served = await serveProject(isolated, project.root, 'acceptance-forwarding');
    const { connection, token, server } = served;
    const check = await checkPublished(connection, token);
    const projected = createProjectExplorerModel({ revision: check.revision, report: check.report! });
    assert.equal(projected.status, 'ready', JSON.stringify(projected));
    const model = (projected as ReadyProjection).view;
    const opened = await openExplorerPage(browser, `${server.record.origin}/analysis/latest`, { width: 1440, height: 1000 });
    context = opened.context; const page = opened.page;
    const state = await waitForDependencies(page, check.revision.revision);
    const deps = await readyDependencies(server.record.origin, check.revision);
    const id = (name: string) => `${model.rootModuleId}${name ? `/${name}` : ''}`;
    const [A, B, BA, C, D, E] = [id('a'), id('b'), id('b/a'), id('c'), id('d'), id('e')];
    // Partial: the unknown dependency is omitted from every count and link, and the page says so.
    assert.equal(state, 'partial');
    assert.equal(deps.state, 'partial');
    assert.equal(deps.coverage.unknownDependencies, 1);
    const partialText = (await dependencyStatus(page)).text;
    assert.equal(partialText, 'Partial coverage: 1 unknown dependency omitted');
    assert.equal(await metricValue(page, 'Coverage'), 'Partial: 1 omitted');
    const coverageWarning = await page.locator('.module-arch__sidebar .module-arch__coverage-warning').textContent();
    assert.ok(coverageWarning?.includes('1 unknown dependency'), coverageWarning ?? '');
    assert.deepEqual(deps.modules.find(row => row.id === E)!.uses, { behavioral: 0, nonBehavioral: 0 });

    // Units: A uses act (behavioral) and secret (non-behavioral) through B; B forwards both; D uses act through B and B/A.
    assert.deepEqual(deps.project, { behavioral: 2, nonBehavioral: 3 });
    const importedAB = linkBetween(deps.importedModuleEdges, A, B);
    assert.deepEqual(importedAB.counts, { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 1 });
    assert.deepEqual(importedAB.originalOwners.map(item => item.owner), [BA]);
    const ownerABA = linkBetween(deps.originalOwnerEdges, A, BA);
    assert.deepEqual(ownerABA.counts, { behavioral: 1, nonBehavioral: 1 });
    assert.equal(deps.importedModuleEdges.some(edge => edge.consumer === A && edge.provider === BA), false);
    assert.equal(deps.originalOwnerEdges.some(edge => edge.consumer === A && edge.provider === B), false);
    // The unused import of C makes no link in either projection.
    assert.equal([...deps.importedModuleEdges, ...deps.originalOwnerEdges].some(edge => [C, E].includes(edge.consumer) || [C, E].includes(edge.provider)), false);
    const importedDB = linkBetween(deps.importedModuleEdges, D, B), importedDBA = linkBetween(deps.importedModuleEdges, D, BA);
    const ownerDBA = linkBetween(deps.originalOwnerEdges, D, BA);
    assert.deepEqual([importedDB.counts, importedDBA.counts], [{ behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 },
      { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 }]);
    assert.deepEqual(ownerDBA.counts, { behavioral: 1, nonBehavioral: 0 });
    assert.deepEqual(ownerDBA.importedThrough.map(item => item.module), [B, BA]);
    assert.deepEqual(deps.modules.find(row => row.id === D)!.uses, { behavioral: 1, nonBehavioral: 0 });

    const visible = initialVisible(model);
    assert.deepEqual([...visible].sort(), [A, B, C, D, E]);
    // Default: the rolled-up links onto the `b` subtree, whose ends are both displayed nodes.
    const rolled = scopeLinks(model, deps, null);
    assert.deepEqual(rolled.map(link => [link.consumer, link.provider, link.behavioral, link.nonBehavioral]),
      [[A, B, 1, 1], [D, B, 1, 0]]);
    const rolledIds = await waitForLinks(page, expectedLinks(model, deps, null), 'Forwarding rolled-up links');
    assert.deepEqual(await renderedNodeIds(page), [A, B, C, D, E].sort());
    const sidebar = page.locator('.module-arch__sidebar');
    const projectRegion = sidebar.getByRole('region', { name: 'Project dependencies' });
    assert.deepEqual(await labelledCards(projectRegion, 'Whole project'),
      { behavioral: 2, nonBehavioral: 3, note: 'not drawn' });
    assert.deepEqual(await labelledCards(projectRegion, 'This view'),
      { ...scopeCounts(model, deps, null), note: 'not drawn' });
    const requestsBefore = opened.requests.dependencyViews();

    // Per-original status on the rolled-up A -> B: act allowed, secret denied, and the link is denied.
    await setShowNonBehavioral(page, true);
    const withNonBehavioral = { ...defaultLinks, showNonBehavioral: true };
    await waitForLinks(page, expectedLinks(model, deps, null, withNonBehavioral), 'Forwarding non-behavioral links');
    const rolledAB = scopeLinks(model, deps, null, withNonBehavioral)
      .find(link => link.consumer === A && link.provider === B)!;
    assert.deepEqual(rolledAB.sources, [ownerABA.id]);
    await clickGraphEdge(page, rolledAB.id);
    await page.getByRole('heading', { name: 'Rolled-up link' }).waitFor();
    const rolledStatus = await sidebar.locator('.module-arch__detail-header .module-arch__dependency-badge').first().textContent();
    assert.equal(rolledStatus, 'denied');
    const rolledRows = await evidenceRows(page);
    assert.deepEqual(rolledRows.map(row => [row.original, row.paths.map(path => [path.classification, path.status])]),
      [['act', [['behavioral', 'allowed']]], ['secret', [['non-behavioral', 'denied']]]]);
    // The rolled-up panel names the exact modules the link covers.
    const rolledModules = await sidebar.getByRole('region', { name: 'Rolled-up modules' })
      .locator('.module-arch__breakdown-item').evaluateAll(items => items.map(item =>
        [item.getAttribute('data-consumer'), item.getAttribute('data-provider')]));
    assert.deepEqual(rolledModules, [[A, BA]]);
    await openDisclosure(page, 'Imported through');
    const rolledThrough = await sidebar.getByRole('region', { name: 'Imported through' }).locator('li')
      .evaluateAll(items => items.map(item => item.getAttribute('data-module')));
    assert.deepEqual(rolledThrough, [B]);

    // Exact ends: A links to B/A, with B/A out of view, and there is no A -> B exact link.
    await setLinkDepth(page, 'exact');
    const exactSettings = { ...defaultLinks, showNonBehavioral: true, depthMode: 'exact' as const };
    const exactIds = await waitForLinks(page, expectedLinks(model, deps, null, exactSettings), 'Forwarding exact links');
    assert.ok(exactIds.includes(ownerABA.id));
    assert.deepEqual(await renderedNodeIds(page), [A, B, BA, C, D, E].sort());
    assert.deepEqual(expectedOutOfView(model, deps, null, exactSettings), [BA]);
    assert.equal(deps.originalOwnerEdges.some(edge => edge.consumer === A && edge.provider === B), false);
    await clickGraphEdge(page, ownerABA.id);
    await page.getByRole('heading', { name: 'Original-owner link' }).waitFor();
    const ownerThrough = await sidebar.getByRole('region', { name: 'Imported through' }).locator('li')
      .evaluateAll(items => items.map(item => item.getAttribute('data-module')));
    assert.deepEqual(ownerThrough, [B]);
    const ownerRows = await evidenceRows(page);
    assert.deepEqual(ownerRows.map(row => [row.original, row.paths.map(path => [path.classification, path.status])]),
      [['act', [['behavioral', 'allowed']]], ['secret', [['non-behavioral', 'denied']]]]);

    // Both boundaries: D's one dependency, drawn once and imported through B and B/A.
    await setShowNonBehavioral(page, false);
    await waitForLinks(page, expectedLinks(model, deps, null, { ...defaultLinks, depthMode: 'exact' }),
      'Forwarding behavioral exact links');
    await clickGraphEdge(page, ownerDBA.id);
    await page.getByRole('heading', { name: 'Original-owner link' }).waitFor();
    const dCards = await headlineCards(sidebar.getByRole('region', { name: 'Dependencies' }));
    assert.deepEqual([dCards.behavioral, dCards.nonBehavioral], [1, 0]);
    const dThrough = await sidebar.getByRole('region', { name: 'Imported through' }).locator('li')
      .evaluateAll(items => items.map(item => item.getAttribute('data-module')));
    assert.deepEqual(dThrough, [B, BA]);
    const dRows = await evidenceRows(page);
    assert.deepEqual(dRows.map(row => [row.original, row.paths.length]), [['act', 2]]);
    await setLinkDepth(page, 'level');
    await waitForLinks(page, rolledIds, 'Forwarding rolled-up links again');
    await clickGraphNode(page, D);
    await page.locator('.module-arch__detail-name').filter({ hasText: 'd' }).waitFor();
    const dSubtree = subtreeCounts(model, deps, D);
    await openDisclosure(page, 'Used through this module');
    assert.deepEqual(await labelledCards(sidebar.getByRole('region', { name: 'Uses' }), 'At this level'),
      { behavioral: 1, nonBehavioral: 0, note: 'not drawn' });
    assert.deepEqual(await labelledCards(sidebar.getByRole('region', { name: 'Uses' }), 'Including internals'),
      { ...dSubtree.uses, note: 'not drawn' });
    assert.equal(await metricValue(page, 'Links displayed'), '1');

    // Drilled into `b`: `b`'s own source is folded into the frame, so no drawn link has it as an end.
    await clickGraphNode(page, B, true);
    await page.getByRole('navigation', { name: 'Module navigation' }).waitFor();
    const insideB = { ...defaultLinks, showNonBehavioral: true };
    await setShowNonBehavioral(page, true);
    const insideIds = await waitForLinks(page, expectedLinks(model, deps, B, insideB), 'Links inside b');
    const insideLinks = scopeLinks(model, deps, B, insideB);
    assert.deepEqual(insideLinks.map(link => [link.consumer, link.provider]), [[A, BA], [D, BA]]);
    assert.equal(insideLinks.some(link => link.consumer === B || link.provider === B), false);
    assert.equal(endOf(model, scopeOf(model, B), B, 'level').kind, 'frame');
    const bRow = deps.modules.find(row => row.id === B)!;
    const ownSource = sidebar.getByRole('region', { name: "Scope's own source" });
    assert.deepEqual(await labelledCards(ownSource, 'Uses'), { ...bRow.uses, note: 'shown' });
    assert.deepEqual(await labelledCards(ownSource, 'Owned originals used by others'),
      { ...bRow.ownedUsedByOthers, note: 'shown' });
    // The leaving-scope toggle applies here and removes every link with an outside end.
    await setShowOutsideScope(page, false);
    await waitForLinks(page, expectedLinks(model, deps, B, { ...insideB, showOutsideScope: false }), 'Links inside b, staying');
    assert.deepEqual(await renderedNodeIds(page), [...visibleAt(model, B)].sort());
    await setShowOutsideScope(page, true);
    await waitForLinks(page, insideIds, 'Links inside b again');
    await page.getByRole('button', { name: 'All Modules' }).click();
    await setShowNonBehavioral(page, false);
    await waitForLinks(page, rolledIds, 'Forwarding rolled-up links at the end');
    assert.equal(opened.requests.dependencyViews(), requestsBefore, 'A forwarding control change requested the dependency view');
    const counters = await daemonDiagramState(connection, token);
    return { root: project.root, revision: check.revision.revision, inputId: deps.inputId, checkOutcome: check.report!.outcome,
      project: deps.project, partial: { state, text: partialText, coverage: deps.coverage, coverageWarning },
      stateHistory: await dependencyStateHistory(page, check.revision.revision), modules: model.modules.map(item => item.id),
      importedModuleEdges: deps.importedModuleEdges.map(edge => ({ consumer: edge.consumer, provider: edge.provider, counts: edge.counts,
        status: edge.evidence.map(item => `${item.original.binding}:${item.status}`) })),
      originalOwnerEdges: deps.originalOwnerEdges.map(edge => ({ consumer: edge.consumer, provider: edge.provider, counts: edge.counts,
        importedThrough: edge.importedThrough.map(item => item.module) })),
      dom: { rolledUpLinks: rolled.map(link => [link.consumer, link.provider, link.behavioral, link.nonBehavioral]),
        exactLinks: exactIds.length, rolledStatus, rolledRows, rolledModules, rolledThrough, ownerThrough, ownerRows,
        bothBoundaries: { ownerLink: ownerDBA.id, cards: dCards, importedThrough: dThrough, uses: dSubtree.uses },
        insideB: { links: insideLinks.map(link => [link.consumer, link.provider]), ownSource: bRow } },
      dependencyViewRequests: { total: opened.requests.dependencyViews(), beforeControls: requestsBefore }, counters };
  } finally {
    await context?.close().catch(() => {});
    await served?.connection.close().catch(() => {});
    await served?.server.stop();
    await stopIsolatedDaemon(isolated);
    await rm(isolated.processRoot, { recursive: true, force: true });
  }
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  // A source string: the page receives no transpiler helpers.
  await page.evaluate(hidden
    ? `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))`
    : `delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))`);
}

/** Waits, polling tightly, until the daemon has started an analyzer process. */
async function analyzerStarted(daemonPid: number, timeoutMs = 30_000): Promise<number> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const tree = await analyzerTree(daemonPid);
    const analyzer = tree.find(item => item.role === 'analyzer');
    if (analyzer) return analyzer.pid;
    await pause(5);
  }
  throw new Error('No analyzer process started');
}

/** Milliseconds from now until `pid` exits, observed every 10 ms; rejects after `timeoutMs`. */
function watchExit(pid: number, timeoutMs: number): Promise<number> {
  const started = performance.now();
  return (async () => {
    while (alive(pid)) {
      if (performance.now() - started > timeoutMs) throw new Error(`process ${pid} still alive after ${timeoutMs} ms`);
      await pause(10);
    }
    return Math.round(performance.now() - started);
  })();
}

async function waitForExit(pid: number, timeoutMs: number): Promise<number> {
  const started = performance.now();
  await until(async () => !alive(pid), timeoutMs, () => `process ${pid} still alive`);
  return Math.round(performance.now() - started);
}

/** BD41–BD43 on the dependency mutation fixture: zero-run checks, staleness, hidden polling, edits during a job, late responses and close. */
async function runDependencyLifecycle(project: { root: string }, other: { root: string }, browser: Browser,
  paths: Awaited<ReturnType<typeof commandPaths>>): Promise<Record<string, unknown>> {
  const isolated = await isolatedEndpoint();
  let served: Awaited<ReturnType<typeof serveProject>> | undefined;
  let context: BrowserContext | undefined;
  let edit = 0;
  const publishConsumer = async (twice: boolean) => {
    edit++;
    return publishMutation(served!.connection, served!.token, project.root, 'subs/consumer/src/use.ts', consumerSource(edit, twice));
  };
  try {
    served = await serveProject(isolated, project.root, 'acceptance-dependencies');
    const { connection, token, server, daemonPid } = served;
    const origin = server.record.origin;
    dependencyDiagnostics = async () => ({ daemon: await daemonDiagramState(connection, token),
      server: await dependencyViewOver(origin, (await serverStatus(server.record)).published?.revision ?? 'none').catch(String) });

    // Zero classifier runs for ordinary and changed-file checks through the CLI and the daemon client.
    const env = commandEnvironment(isolated, paths.opener);
    const ordinary = await runCommand(['check', '--root', project.root], env);
    assert.equal(ordinary.code, 0, JSON.stringify(ordinary));
    edit++;
    await put(project.root, 'subs/consumer/src/use.ts', consumerSource(edit, false));
    const changed = await runCommand(['check', '--root', project.root, '--changed', 'subs/consumer/src/use.ts'], env);
    assert.equal(changed.code, 0, JSON.stringify(changed));
    const published = await publishConsumer(false);
    const zeroRuns = await daemonDiagramState(connection, token);
    assert.deepEqual([zeroRuns.behaviorRuns, zeroRuns.dependencyDiagrams, zeroRuns.dependencyDiagramInputChanges], [0, 0, 0]);
    const withoutDiagram = await settledDaemonMemory(connection, token);
    const serverAtStart = await rss(server.record.pid);

    // First request: the page asks for its revision and the daemon starts one analyzer.
    const sampler = sampleAnalyzerMemory(daemonPid);
    const opened = await openExplorerPage(browser, `${origin}/analysis/latest`, { width: 1280, height: 900 });
    context = opened.context; const page = opened.page;
    await waitForDependencies(page, published.revision.revision);
    const withDiagram = await settledDaemonMemory(connection, token);
    const analyzerMemory = await sampler.stop();
    assert.deepEqual([withDiagram.behaviorRuns, withDiagram.dependencyDiagrams], [1, 1]);
    const first = await readyDependencies(origin, published.revision);
    const firstRequests = opened.requests.dependencyViews();
    assert.deepEqual(first.project, { behavioral: 1, nonBehavioral: 1 });
    const mutationModel = (createProjectExplorerModel({ revision: published.revision,
      report: published.report! }) as ReadyProjection).view;
    assert.deepEqual([...initialVisible(mutationModel)].sort(), ['fixture/consumer', 'fixture/provider']);
    const firstLinks = await waitForLinks(page, expectedLinks(mutationModel, first, null), 'Mutation links');
    assert.equal(firstLinks.length, 1);
    const serverAfterReady = await rss(server.record.pid);

    // After analysis: a newer publication keeps the coherent old graph as stale until refresh.
    const afterReady = await publishConsumer(true);
    await forcePoll(page);
    await page.getByRole('button', { name: 'Refresh (stale)' }).waitFor({ timeout: 15_000 });
    const staleStatus = await dependencyStatus(page);
    assert.equal(staleStatus.state, 'stale');
    assert.equal(await page.locator('.module-arch__revision').textContent(), `Revision ${published.revision.revision}`);
    assert.deepEqual(await renderedEdgeIds(page), firstLinks);
    assert.equal(await metricValue(page, 'Input'), first.inputId);
    const staleCards = await headlineCards(page.locator('.module-arch__sidebar').getByRole('region', { name: 'Project dependencies' }));
    assert.deepEqual([staleCards.behavioral, staleCards.nonBehavioral], [1, 1]);
    const releasedOnPublication = await daemonDiagramState(connection, token);
    await refreshTo(page, afterReady.revision);
    const second = await readyDependencies(origin, afterReady.revision);
    assert.deepEqual(second.project, { behavioral: 2, nonBehavioral: 1 });
    assert.equal(await metricValue(page, 'Input'), second.inputId);
    const refreshedCards = await headlineCards(page.locator('.module-arch__sidebar').getByRole('region', { name: 'Project dependencies' }));
    assert.deepEqual([refreshedCards.behavioral, refreshedCards.nonBehavioral], [2, 1]);
    const afterAnalysis = { staleRevision: published.revision.revision, newerRevision: afterReady.revision.revision, staleStatus,
      staleCards, staleLinks: firstLinks, refreshedInputId: second.inputId, refreshedCards,
      retainedBytes: { withDiagram: withDiagram.retainedBytes, afterNewerPublication: releasedOnPublication.retainedBytes } };

    // Waiting and hidden-page polling: another context's job holds the daemon's one slot.
    const otherToken = await openProject(connection, other.root);
    const otherCheck = await checkPublished(connection, otherToken);
    const waitingRevision = await publishConsumer(false);
    await forcePoll(page);
    await page.getByRole('button', { name: 'Refresh (stale)' }).waitFor({ timeout: 15_000 });
    const beforeOther = await daemonDiagramState(connection, token);
    const otherJob = connection.dependencyDiagram({ token: otherToken, requestId: `acceptance-other-${crypto.randomUUID()}`, revision: otherCheck.revision.revision });
    let otherSettled = false;
    void otherJob.then(() => { otherSettled = true; }, () => { otherSettled = true; });
    await until(async () => (await daemonDiagramState(connection, token)).dependencyDiagrams > beforeOther.dependencyDiagrams, 10_000, () => 'the other job did not start');
    await page.getByRole('button', { name: 'Refresh (stale)' }).click();
    await page.locator('.module-arch__revision').filter({ hasText: waitingRevision.revision.revision }).waitFor({ timeout: 60_000 });
    // The server's answers over HTTP while the other job runs: busy is remembered as waiting for one second.
    const serverPhases: string[] = [];
    while (!otherSettled && serverPhases.length < 40) {
      const answer = await dependencyViewOver(origin, waitingRevision.revision.revision);
      serverPhases.push(answer.status === 'pending' ? `pending/${answer.phase}` : answer.status);
      if (serverPhases.length === 2) break;
      await pause(250);
    }
    const pendingAtHide = await dependencyStatus(page);
    assert.ok(pendingAtHide.state === 'waiting' || pendingAtHide.state === 'analyzing', JSON.stringify(pendingAtHide));
    const visibleWaiting = opened.requests.entries.filter(entry => entry.procedures.includes('dependencyView')).slice(-3).map(entry => Math.round(entry.at));
    await setHidden(page, true);
    await pause(100);
    const hiddenStart = opened.requests.dependencyViews();
    const otherRunningAtHide = !otherSettled;
    while (!otherSettled && serverPhases.length < 40) {
      const answer = await dependencyViewOver(origin, waitingRevision.revision.revision);
      serverPhases.push(answer.status === 'pending' ? `pending/${answer.phase}` : answer.status);
      await pause(250);
    }
    assert.ok(otherRunningAtHide, 'The other job settled before the page was hidden');
    assert.ok(serverPhases.includes('pending/waiting'), `The server never answered waiting: ${JSON.stringify(serverPhases)}`);
    const otherOutcome = await otherJob;
    assert.ok(otherOutcome.ok && otherOutcome.value.status === 'ready', JSON.stringify(otherOutcome).slice(0, 500));
    await pause(3000);
    const hiddenRequests = opened.requests.dependencyViews() - hiddenStart;
    const hiddenState = await dependencyStatus(page);
    assert.equal(hiddenRequests, 0, 'The hidden page polled the dependency view');
    assert.ok(hiddenState.state === 'waiting' || hiddenState.state === 'analyzing', JSON.stringify(hiddenState));
    await setHidden(page, false);
    await waitForDependencies(page, waitingRevision.revision.revision);
    const resumed = await readyDependencies(origin, waitingRevision.revision);
    const pollTimes = opened.requests.entries.filter(entry => entry.procedures.includes('dependencyView') && entry.at > 0).map(entry => entry.at);
    const hiddenPolling = { waitingRevision: waitingRevision.revision.revision, otherContext: otherToken.context,
      otherDiagram: { inputId: otherCheck.revision.fingerprints.inputId }, visibleWaitingRequestTimes: visibleWaiting,
      pendingAtHide, otherRunningAtHide, serverPhasesOverHttp: serverPhases,
      hiddenMs: 3000 + 100, hiddenRequests, hiddenState, stateHistory: await dependencyStateHistory(page, waitingRevision.revision.revision), resumedRequests: opened.requests.dependencyViews() - hiddenStart,
      minimumVisibleGapMs: Math.round(Math.min(...pollTimes.slice(1).map((at, index) => at - pollTimes[index]!).filter(gap => gap > 50))),
      resumedProject: resumed.project };
    await connection.closeContext({ token: otherToken });

    // An analyzer failure is unavailable with its reason; polling stops and the modules stay drawn.
    const failureRevision = await publishConsumer(true);
    await forcePoll(page);
    await page.getByRole('button', { name: 'Refresh (stale)' }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Refresh (stale)' }).click();
    const failedAnalyzer = await analyzerStarted(daemonPid);
    process.kill(failedAnalyzer, 'SIGKILL');
    await waitForDependencies(page, failureRevision.revision.revision, 60_000, new Set(['unavailable']));
    const unavailableStatus = await dependencyStatus(page);
    const unavailableRequests = opened.requests.dependencyViews();
    await pause(3000);
    assert.equal(opened.requests.dependencyViews(), unavailableRequests, 'Polling continued after unavailable');
    assert.deepEqual(await renderedEdgeIds(page), []);
    assert.deepEqual(await renderedNodeIds(page), [...initialVisible(mutationModel)].sort());
    const unavailable = { revision: failureRevision.revision.revision, killedAnalyzer: failedAnalyzer, status: unavailableStatus,
      pollingStoppedFor: 3000, stateHistory: await dependencyStateHistory(page, failureRevision.revision.revision),
      counters: await daemonDiagramState(connection, token) };

    // An edit during the job: it supersedes the job or changes its inputs; polling stops and refresh obtains the new model.
    const duringAttempts: Record<string, unknown>[] = [];
    let during: Record<string, unknown> | null = null;
    for (let attempt = 1; attempt <= 3 && during === null; attempt++) {
      const target = await publishConsumer(attempt % 2 === 1);
      await forcePoll(page);
      await page.getByRole('button', { name: 'Refresh (stale)' }).waitFor({ timeout: 15_000 });
      const before = await daemonDiagramState(connection, token);
      await page.getByRole('button', { name: 'Refresh (stale)' }).click();
      const analyzerPid = await analyzerStarted(daemonPid);
      const analyzerExit = watchExit(analyzerPid, 5000);
      edit++;
      const text = consumerSource(edit, attempt % 2 === 0);
      await put(project.root, 'subs/consumer/src/use.ts', text);
      const analyzerAliveAtEdit = alive(analyzerPid);
      const newer = await publishMutation(connection, token, project.root, 'subs/consumer/src/use.ts', text);
      const reached = await waitForDependencies(page, target.revision.revision, 60_000, new Set(['superseded', 'complete', 'stale']));
      const analyzerExitMs = await analyzerExit;
      const after = await daemonDiagramState(connection, token);
      const record = { attempt, revision: target.revision.revision, newerRevision: newer.revision.revision, analyzerPid, analyzerAliveAtEdit,
        reached, analyzerExitFromEditMs: analyzerExitMs, counters: { before, after } };
      duringAttempts.push(record);
      if (reached !== 'superseded') { await refreshTo(page, newer.revision); continue; }
      const stopped = opened.requests.dependencyViews();
      await pause(3000);
      assert.equal(opened.requests.dependencyViews(), stopped, 'Polling continued after superseded');
      assert.deepEqual(await renderedEdgeIds(page), [], 'A superseded request drew links for the newer model');
      assert.equal(after.behaviorRuns, before.behaviorRuns, 'The aborted job reported a classifier run');
      await refreshTo(page, newer.revision);
      const matching = await readyDependencies(origin, newer.revision);
      const shownCards = await headlineCards(page.locator('.module-arch__sidebar').getByRole('region', { name: 'Project dependencies' }));
      assert.deepEqual([shownCards.behavioral, shownCards.nonBehavioral], [matching.project.behavioral, matching.project.nonBehavioral]);
      assert.equal(await metricValue(page, 'Input'), newer.revision.fingerprints.inputId);
      const refreshedModel = createProjectExplorerModel({ revision: newer.revision, report: newer.report! });
      assert.equal(refreshedModel.status, 'ready');
      assert.deepEqual((refreshedModel as ReadyProjection).view.modules.map(item => item.id).sort(), matching.modules.map(item => item.id));
      during = { ...record, pollingStoppedFor: 3000, stateHistory: await dependencyStateHistory(page, target.revision.revision), matching: { inputId: matching.inputId, project: matching.project },
        inputsChanged: after.dependencyDiagramInputChanges - before.dependencyDiagramInputChanges };
    }
    assert.ok(during, `No edit reached a running job: ${JSON.stringify(duringAttempts)}`);

    // A late response to the earlier revision cannot overwrite the refreshed graph.
    const lateRevision = await publishConsumer(true);
    await forcePoll(page);
    await page.getByRole('button', { name: 'Refresh (stale)' }).waitFor({ timeout: 15_000 });
    let held: Route | null = null;
    await page.route(url => url.pathname.includes('dependencyView'), async route => {
      if (held === null && (route.request().postData() ?? '').includes(lateRevision.revision.revision)) { held = route; return; }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Refresh (stale)' }).click();
    await page.locator('.module-arch__revision').filter({ hasText: lateRevision.revision.revision }).waitFor({ timeout: 60_000 });
    await until(async () => held !== null, 15_000, () => 'the page sent no dependency request for the late revision');
    await until(async () => (await dependencyViewOver(origin, lateRevision.revision.revision)).status === 'ready', 120_000, () => 'late revision not ready');
    const lateResponse = await (held as unknown as Route).fetch();
    const lateBody = await lateResponse.text();
    assert.ok(lateBody.includes('"status":"ready"') && lateBody.includes(lateRevision.revision.fingerprints.inputId), lateBody.slice(0, 300));
    const current = await publishConsumer(false);
    await refreshTo(page, current.revision);
    const currentDeps = await readyDependencies(origin, current.revision);
    await (held as unknown as Route).fulfill({ response: lateResponse });
    await pause(1500);
    assert.equal(await page.locator('.module-arch__revision').textContent(), `Revision ${current.revision.revision}`);
    assert.equal(await metricValue(page, 'Input'), currentDeps.inputId);
    const lateCards = await headlineCards(page.locator('.module-arch__sidebar').getByRole('region', { name: 'Project dependencies' }));
    assert.deepEqual([lateCards.behavioral, lateCards.nonBehavioral], [currentDeps.project.behavioral, currentDeps.project.nonBehavioral]);
    assert.equal((await dependencyStatus(page)).state, 'complete');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const settledPage = await snapshot(page);
    assert.equal(settledPage.timeouts, 0, 'A settled page kept a polling timer');
    const late = { heldRevision: lateRevision.revision.revision, heldInputId: lateRevision.revision.fingerprints.inputId,
      heldBodyBytes: lateBody.length, heldAnswer: 'ready', currentRevision: current.revision.revision, currentInputId: currentDeps.inputId,
      shownCards: lateCards, settledPage };

    // Server close during a job: the in-flight request is aborted and the analyzer exits.
    const closeRevision = await publishConsumer(true);
    await forcePoll(page);
    await page.getByRole('button', { name: 'Refresh (stale)' }).waitFor({ timeout: 15_000 });
    const beforeClose = await daemonDiagramState(connection, token);
    const serverBeforeClose = await rss(server.record.pid);
    await page.getByRole('button', { name: 'Refresh (stale)' }).click();
    const closeAnalyzer = await analyzerStarted(daemonPid);
    const analyzerExit = watchExit(closeAnalyzer, 5000);
    const closeStarted = performance.now();
    process.kill(server.record.pid, 'SIGINT');
    const serverExitMs = await waitForExit(server.record.pid, 20_000);
    const analyzerAliveAtServerExit = alive(closeAnalyzer);
    const analyzerExitMs = await analyzerExit;
    const afterClose = await settledDaemonMemory(connection, token);
    assert.equal(afterClose.behaviorRuns, beforeClose.behaviorRuns, 'A job whose only caller closed reported a classifier run');
    const close = { revision: closeRevision.revision.revision, analyzerPid: closeAnalyzer, serverExitMs, analyzerAliveAtServerExit,
      analyzerExitFromCloseMs: analyzerExitMs, settledAfterCloseMs: Math.round(performance.now() - closeStarted),
      counters: { before: beforeClose, after: afterClose }, serverBeforeClose };
    await context.close(); context = undefined;

    return { root: project.root, zeroRuns: { ordinaryCheck: { exitCode: ordinary.code, durationMs: Math.round(ordinary.durationMs) },
      changedFileCheck: { exitCode: changed.code, durationMs: Math.round(changed.durationMs), changed: 'subs/consumer/src/use.ts' },
      clientCheck: published.revision.revision, counters: zeroRuns },
    firstDiagram: { revision: published.revision.revision, inputId: first.inputId, project: first.project,
      browserDependencyViewRequests: firstRequests },
    memory: { daemonWithoutRetainedDiagram: withoutDiagram, daemonWithRetainedDiagram: withDiagram, analyzer: analyzerMemory,
      server: { atStart: serverAtStart, afterReady: serverAfterReady, beforeClose: serverBeforeClose } },
    afterAnalysis, hiddenPolling, unavailable, duringJob: { attempts: duringAttempts, witness: during }, late, close };
  } finally {
    dependencyDiagnostics = null;
    await context?.close().catch(() => {});
    await served?.connection.close().catch(() => {});
    await served?.server.stop();
    await stopIsolatedDaemon(isolated);
    await rm(isolated.processRoot, { recursive: true, force: true });
  }
}

/** Plan 6C: MT14 on the toolkit, MT15 on the mutation fixture and MT16 on the reference. */
async function runModuleTree(kind: 'reference' | 'toolkit' | 'mutations', project: { root: string },
  browser: Browser): Promise<Record<string, unknown>> {
  const isolated = await isolatedEndpoint();
  let server: Awaited<ReturnType<typeof startTreeServer>> | undefined;
  let connection: ServiceConnection | undefined;
  let context: BrowserContext | undefined;
  const consoleErrors: string[] = [];
  try {
    server = await startTreeServer(isolated, project.root);
    connection = await connectHarness(isolated, 'never', `acceptance-tree-${kind}`);
    const token = await openProject(connection, project.root);
    const check = await checkPublished(connection, token);
    const projected = createProjectExplorerModel({ revision: check.revision, report: check.report! });
    assert.equal(projected.status, 'ready', JSON.stringify(projected));
    const model = (projected as ReadyProjection).view;
    const encodedBytes = Buffer.byteLength(JSON.stringify(model));
    const treeUrl = `${server.record.origin}/modules/latest`;

    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installTreeTiming(context);
    context.on('page', page => {
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${message.text()} (${message.location().url})`); });
      page.on('response', response => { if (response.status() >= 400) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`); });
    });
    const page = await openTreePage(context, treeUrl, model.revision);
    const expectedVisible = model.modules.length;
    const initialNodes = await treeNodeIds(page);
    const firstRender = await page.evaluate(() => {
      const view = performance.getEntriesByType('resource').filter(entry => entry.name.includes('projectView'))
        .map(entry => (entry as PerformanceResourceTiming).responseEnd);
      const rendered = (window as unknown as { __ramifyTreeRenderedAt?: number }).__ramifyTreeRenderedAt;
      return { projectViewResponseEnd: view[0] ?? null, treeRenderedAt: rendered ?? null,
        firstRenderMs: rendered !== undefined && view[0] !== undefined ? rendered - view[0] : null };
    });
    const subtitle = await page.locator('.module-arch__subtitle').textContent();
    assert.ok(subtitle?.startsWith(`${model.modules.length} modules, depth `), subtitle ?? '');

    if (kind === 'toolkit') {
      // MT14: collapse, select, double-click to the import explorer and back.
      assert.equal(initialNodes.length, expectedVisible);
      // Full height: the tree fills the window, fits, and fits again after the window shrinks.
      const treeFit = await canvasFit(page, '.module-tree__canvas');
      assert.ok((treeFit.minimapNodes as number) > 0, JSON.stringify(treeFit));
      await page.setViewportSize({ width: 1100, height: 700 });
      const treeRefit = await canvasFit(page, '.module-tree__canvas');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await canvasFit(page, '.module-tree__canvas');
      const target = model.modules.find(item => item.id.endsWith('/analysis/model'));
      const parent = target && model.modules.find(item => item.id === target.parent);
      assert.ok(target && parent && target.purpose.state === 'present', 'Toolkit has no analysis/model module with a README');
      await page.getByRole('button', { name: `Collapse ${parent.name}` }).click();
      await until(async () => !(await treeNodeIds(page)).includes(target.id), 10_000, () => 'collapse did not hide the child');
      const collapsedLabel = await page.getByRole('button', { name: `Expand ${parent.name}` }).textContent();
      const collapsedNodes = (await treeNodeIds(page)).length;
      await page.getByRole('button', { name: `Expand ${parent.name}` }).click();
      await until(async () => (await treeNodeIds(page)).includes(target.id), 10_000, () => 'expand did not show the child');
      await clickGraphNode(page, target.id);
      await page.locator('.module-arch__detail-description').filter({ hasText: target.purpose.paragraph }).waitFor();
      const explorerPromise = context.waitForEvent('page');
      await clickGraphNode(page, target.id, true);
      const explorer = await explorerPromise;
      await explorer.waitForLoadState('networkidle');
      const expectedExplorerUrl = `${server.record.origin}/analysis/latest?module=${encodeURIComponent(target.id)}`;
      assert.equal(explorer.url(), expectedExplorerUrl);
      await explorer.getByRole('heading', { name: 'Project Explorer' }).waitFor({ timeout: 60_000 });
      await explorer.locator('.module-arch__detail-name').filter({ hasText: target.name }).waitFor({ timeout: 60_000 });
      const breadcrumb = await explorer.getByRole('navigation', { name: 'Module navigation' }).innerText();
      assert.ok(breadcrumb.includes(parent.name), breadcrumb);
      const explorerFit = await canvasFit(explorer, '.module-arch__radial-canvas');
      assert.ok((explorerFit.minimapNodes as number) > 0, JSON.stringify(explorerFit));
      const treePromise = context.waitForEvent('page');
      await explorer.getByRole('button', { name: 'Show in module tree' }).click();
      const back = await treePromise;
      await back.waitForLoadState('networkidle');
      assert.equal(back.url(), `${treeUrl}?module=${encodeURIComponent(target.id)}`);
      await back.getByRole('heading', { name: 'Module tree' }).waitFor({ timeout: 60_000 });
      await back.locator('.module-arch__detail-name').filter({ hasText: target.name }).waitFor({ timeout: 60_000 });
      await back.locator(`.module-tree__node--selected[data-module-id="${target.id}"]`).waitFor({ timeout: 10_000 });
      assert.deepEqual(consoleErrors, []);
      return { kind, root: project.root, revision: model.revision, modules: model.modules.length, encodedBytes, firstRender,
        mt14: { treeUrl, initialNodes: initialNodes.length, collapsed: { parent: parent.id, label: collapsedLabel, nodes: collapsedNodes },
          selected: target.id, purpose: target.purpose.paragraph, explorerUrl: explorer.url(), breadcrumb,
          backUrl: back.url() }, fullHeight: { tree: treeFit, treeAfterResize: treeRefit, explorer: explorerFit }, consoleErrors };
    }

    if (kind === 'mutations') {
      // MT15: a new module appears after refresh at the same URL, and the selection survives.
      const selected = model.modules.find(item => item.id.endsWith('/provider'));
      assert.ok(selected, 'Mutation fixture has no provider module');
      await clickGraphNode(page, selected.id);
      await page.locator('.module-arch__detail-name').filter({ hasText: selected.name }).waitFor();
      await put(project.root, 'subs/extra/README.md', '# Extra\n\nAdded while the tree is open.\n');
      await put(project.root, 'subs/extra/src/index.ts', 'export const extra = 1;\n');
      const added = await publishMutation(connection, token, project.root, 'subs/extra/module.ramify', 'ramify 1\nmodule extra\n');
      const addedId = `${model.rootModuleId}/extra`;
      assert.ok(added.report!.snapshot!.inventory!.modules.some(item => item.id === addedId), 'The new module was not analysed');
      await forcePoll(page);
      const refresh = page.getByRole('button', { name: 'Refresh (stale)' });
      await refresh.waitFor({ state: 'visible', timeout: 15_000 });
      await refresh.click();
      await page.locator('.module-arch__revision').filter({ hasText: added.revision.revision }).waitFor({ timeout: 60_000 });
      await until(async () => (await treeNodeIds(page)).includes(addedId), 10_000, () => 'the added module was not rendered');
      assert.equal(await page.locator('.module-arch__detail-name').textContent(), selected.name);
      assert.equal(page.url(), treeUrl);
      assert.deepEqual(consoleErrors, []);
      return { kind, root: project.root, revision: model.revision, modules: model.modules.length, encodedBytes, firstRender,
        mt15: { treeUrl, finalUrl: page.url(), selected: selected.id, added: addedId, before: initialNodes.length,
          after: (await treeNodeIds(page)).length, refreshedRevision: added.revision.revision }, consoleErrors };
    }

    // MT16: first render, collapse and expand budgets, bundle size and transport size.
    const index = new Map(model.modules.map(item => [item.id, item]));
    const subtree = (id: string): number => (index.get(id)?.children ?? []).reduce((sum, child) => sum + 1 + subtree(child), 0);
    const root = index.get(model.rootModuleId)!;
    const largest = [...root.children].sort((left, right) => subtree(right) - subtree(left))[0];
    assert.ok(largest && subtree(largest) > 0, 'Reference root has no child with descendants');
    const largestName = index.get(largest)!.name;
    const collapseMs = await toggleToPaint(page, `Collapse ${largestName}`);
    const collapsedNodes = (await treeNodeIds(page)).length;
    const expandMs = await toggleToPaint(page, `Expand ${largestName}`);
    const expandedNodes = (await treeNodeIds(page)).length;
    assert.equal(collapsedNodes, initialNodes.length - subtree(largest));
    assert.equal(expandedNodes, initialNodes.length);
    assert.ok(firstRender.firstRenderMs !== null && firstRender.firstRenderMs <= 500, JSON.stringify(firstRender));
    assert.ok(collapseMs <= 100 && expandMs <= 100, JSON.stringify({ collapseMs, expandMs }));
    const bundle = await gzipBundleBytes();
    assert.ok(bundle.gzipBytes - planSixBBundleGzipBytes <= treeBundleBudgetBytes, JSON.stringify(bundle));
    assert.deepEqual(consoleErrors, []);
    return { kind, root: project.root, revision: model.revision, modules: model.modules.length,
      mt16: { firstRender, collapse: { module: largest, descendants: subtree(largest), collapseMs, expandMs, collapsedNodes, expandedNodes },
        bundle, baselineGzipBytes: planSixBBundleGzipBytes, addedGzipBytes: bundle.gzipBytes - planSixBBundleGzipBytes,
        budgetBytes: treeBundleBudgetBytes, encodedBytes }, consoleErrors };
  } finally {
    await context?.close().catch(() => {});
    await connection?.close().catch(() => {});
    await server?.stop();
    await stopIsolatedDaemon(isolated);
    await rm(isolated.processRoot, { recursive: true, force: true });
  }
}

/** Plan 6B's explorer JavaScript at commit 25f50ee, gzipped by node:zlib as `gzipBundleBytes` measures it. */
const planSixBBundleGzipBytes = 193_873;
/** T7: the tree page may add at most 25 KiB gzipped. */
const treeBundleBudgetBytes = 25 * 1024;

async function main(): Promise<void> {
  assert.ok((await stat(chromiumPath)).isFile(), `Chromium executable not found: ${chromiumPath}`);
  assert.ok((await stat(join(packageRoot, 'dist/explorer/index.html'))).isFile(), 'Run npm run build before browser acceptance');
  const args = process.argv.slice(2), outputIndex = args.indexOf('--output'), onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
  assert.ok(args.length === (outputIndex >= 0 ? 2 : 0) + (onlyIndex >= 0 ? 2 : 0)
    && (outputIndex < 0 || args[outputIndex + 1])
    && (only === undefined || ['reference', 'toolkit', 'mutations', 'forwarding', 'dependencies', 'tree'].includes(only)),
  'Usage: npm run measure:project-explorer -- [--output FILE] [--only reference|toolkit|mutations|forwarding|dependencies|tree]');
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
    if (only === undefined || only === 'forwarding') {
      const forwarding = await forwardingProject(scratch);
      try { workloads.forwarding = await runForwarding(forwarding, browser); } finally { await forwarding.dispose(); }
    }
    if (only === undefined || only === 'dependencies') {
      const mutation = await dependencyMutationProject(scratch), reference = await isolatedProject('reference', scratch);
      try { workloads.dependencies = await runDependencyLifecycle(mutation, reference, browser, paths); }
      finally { await Promise.all([mutation.dispose(), reference.dispose()]); }
    }
    if (only === undefined || only === 'tree') {
      const tree: Record<string, unknown> = {};
      const toolkit = await isolatedProject('toolkit', scratch);
      try { tree.toolkit = await runModuleTree('toolkit', toolkit, browser); } finally { await toolkit.dispose(); }
      const mutations = await mutationProject(scratch);
      try { tree.mutations = await runModuleTree('mutations', mutations, browser); } finally { await mutations.dispose(); }
      const reference = await isolatedProject('reference', scratch);
      try { tree.reference = await runModuleTree('reference', reference, browser); } finally { await reference.dispose(); }
      workloads.tree = tree;
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

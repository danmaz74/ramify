import { basename, dirname, join, relative, resolve } from 'node:path';
import type { Capture } from './capture.js';
import { acquireProject } from './read-project.js';
import type { AcquiredProject } from './read-project.js';
import { AcquisitionError, Cancelled, byteOrder, freeze, within } from './data.js';
import { excludedDirectory, inventoryFileKind, outsideSourceWarnings } from './inventory.js';
import { readPurpose } from './purpose.js';
import { exactReferences } from './references.js';
import { ReportedObservations, inputIdentity, reportedInput } from './observations.js';
import type { ConfigurationData } from './configuration-data.js';
import type {
  CapturedInput, ExactReference, InventoryFile, InventoryModule, InventoryUpdate, ObservationSink,
  ObservedChange, ProjectInventory, ProjectIssue, ProjectObserve, ProjectObserver, ProjectReadOptions,
  ProjectResolution, RetainedConfiguration,
} from './interfaces/project.js';

type Classified =
  | { readonly kind: 'description'; readonly path: string; readonly directory: string }
  | { readonly kind: 'readme'; readonly path: string; readonly directory: string }
  | { readonly kind: 'owned'; readonly path: string; readonly module: InventoryModule }
  | { readonly kind: 'input'; readonly path: string }
  | { readonly kind: 'structural'; readonly path: string }
  | { readonly kind: 'ignored'; readonly path: string };

const issueOrder = (a: ProjectIssue, b: ProjectIssue): number =>
  byteOrder(a.path, b.path) || byteOrder(a.code, b.code) || byteOrder(a.message, b.message);
/** A configuration or manifest read is never a locally repairable input. */
const broadRoles = new Set<CapturedInput['role']>(['configuration']);
const broadNames = new Set(['tsconfig.json', 'package.json', 'package-lock.json']);

/**
 * One acquired project kept observed instead of sealed. Every input keeps its
 * role and identity, local changes update the inventory in place, structural
 * ones rebuild it, and the sweep re-observes the whole recorded set.
 */
class Observer implements ProjectObserver {
  #capture: Capture;
  #inventory: ProjectInventory;
  #configuration: RetainedConfiguration;
  #configurationData: ConfigurationData;
  #resolution: Extract<ProjectResolution, { status: 'resolved' }>;
  #reported = new ReportedObservations();
  /** The last merged list and identity with the state they describe; the next read replaces them. */
  #merged: { readonly capture: Capture; readonly captured: number; readonly reported: number; readonly inputs: readonly CapturedInput[] } | undefined;
  #recordedId: { readonly inputs: readonly CapturedInput[]; readonly inventory: ProjectInventory; readonly id: string } | undefined;
  #work: Promise<unknown> = Promise.resolve();
  #disposed = false;

  constructor(private readonly options: ProjectReadOptions, acquired: AcquiredProject) {
    this.#capture = acquired.capture;
    this.#inventory = acquired.inventory;
    this.#configuration = acquired.configuration;
    this.#configurationData = acquired.configurationData;
    this.#resolution = acquired.resolution;
    this.#capture.retainAcquisition();
  }

  get inventory(): ProjectInventory { return this.#inventory; }
  get resolution(): Extract<ProjectResolution, { status: 'resolved' }> { return this.#resolution; }
  /** Filesystem work performed so far, for locality evidence outside the port. */
  get enumerations(): number { return this.#capture.enumerations; }
  get sink(): ObservationSink { return this.#reported.sink; }
  /**
   * Captured inputs merged with pending reports. Both sides carry versions, so
   * an unchanged observer returns the list it last built; without pending
   * reports the capture's own list is already the merged order.
   */
  get inputs(): readonly CapturedInput[] {
    const capture = this.#capture;
    const captured = capture.inputs;
    const reported = this.#reported.pending;
    if (!reported.length) { this.#merged = undefined; return captured; }
    const cached = this.#merged;
    if (cached?.capture === capture && cached.captured === capture.version && cached.reported === this.#reported.version) return cached.inputs;
    const known = new Set(captured.map(input => input.path));
    const merged = [...captured];
    for (const observation of reported) {
      const label = capture.label(capture.path(observation.path));
      if (!known.has(label)) merged.push(reportedInput(observation, label));
    }
    const inputs = freeze(merged.sort((a, b) => byteOrder(a.path, b.path)));
    this.#merged = { capture, captured: capture.version, reported: this.#reported.version, inputs };
    return inputs;
  }
  /** Recomputed only when the merged list or the inventory is a different object. */
  get inputId(): string {
    const inputs = this.inputs, inventory = this.#inventory;
    const cached = this.#recordedId;
    if (cached?.inputs === inputs && cached.inventory === inventory) return cached.id;
    const id = inputIdentity(inventory, this.options.registry ?? '', inputs);
    this.#recordedId = { inputs, inventory, id };
    return id;
  }

  async readDescription(path: string): Promise<string | undefined> {
    return this.#serialize(() => this.#capture.readFile(this.#capture.path(path), 'description'));
  }
  async readReadme(path: string): Promise<string | undefined> {
    return this.#serialize(() => this.#capture.readFile(this.#capture.path(path), 'readme'));
  }

  async apply(changes: readonly ObservedChange[], signal?: AbortSignal): Promise<InventoryUpdate> {
    return this.#serialize(async () => {
      signal?.throwIfAborted();
      try {
        await this.#promote();
        const update = await this.#update(changes, signal);
        if (update.kind === 'local' && (update.created.length || update.deleted.length)) {
          await this.#capture.retireReported();
          this.#reported.clear();
        }
        return update;
      } catch (error) {
        if (error instanceof Cancelled || signal?.aborted) throw signal?.reason ?? error;
        return this.#incomplete(error);
      }
    });
  }

  async reobserve(signal?: AbortSignal): Promise<readonly ObservedChange[]> {
    return this.#serialize(async () => {
      signal?.throwIfAborted();
      const changes = new Map<string, ObservedChange>();
      for (const change of await this.#promote()) changes.set(change.path, change);
      for (const change of await this.#capture.changes(signal)) {
        if (!changes.has(change.path)) changes.set(change.path, { path: change.path, kind: change.kind });
      }
      return freeze([...changes.values()].sort((a, b) => byteOrder(a.path, b.path)));
    });
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#reported.clear();
    this.#merged = undefined; this.#recordedId = undefined;
    await this.#work.catch(() => undefined);
    await this.#capture.dispose();
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#disposed) return Promise.reject(new AcquisitionError('read-failure', this.#capture.root, 'Observer is disposed'));
    const next = this.#work.then(operation, operation);
    this.#work = next.catch(() => undefined);
    return next;
  }

  /**
   * Merge reported callbacks into the acquisition table. A report whose disk
   * state no longer matches what the reporter saw is an observed change.
   */
  async #promote(): Promise<readonly ObservedChange[]> {
    return this.#capture.reported(() => this.#promoteReported());
  }
  async #promoteReported(): Promise<readonly ObservedChange[]> {
    const changes: ObservedChange[] = [];
    for (const observation of this.#reported.take()) {
      const path = this.#capture.path(observation.path);
      const known = this.#capture.recorded(path);
      const previous = known ? this.#identity(known.path, known.entries) : undefined;
      // A report that disagrees with the recorded state re-observes the path:
      // either the observer was stale or the reporter saw a superseded state.
      if (known && this.#disagrees(observation, previous)) await this.#capture.refresh(path);
      const entry = await this.#capture.observe(path);
      if (entry.kind !== 'absent' && observation.shape === 'file') await this.#capture.readFile(path, observation.role);
      if (entry.kind !== 'absent' && observation.shape === 'directory') await this.#capture.readDirectory(path);
      if (observation.shape === 'absent' && entry.kind !== 'absent') { changes.push({ path, kind: 'created' }); continue; }
      if (observation.shape === 'file' && entry.kind === 'absent') { changes.push({ path, kind: 'deleted' }); continue; }
      const current = this.#identity(path, this.#capture.recorded(path)?.entries);
      if (this.#disagrees(observation, current) || (previous !== undefined && previous !== current)) {
        changes.push({ path, kind: 'changed' });
      }
    }
    return changes;
  }

  /** What a reported path currently holds: read bytes, or enumerated members. */
  #identity(path: string, entries: readonly string[] | undefined): string | undefined {
    const digest = this.#capture.digest(path);
    if (digest !== undefined) return digest;
    return entries ? JSON.stringify(entries.map(child => basename(child)).sort(byteOrder)) : undefined;
  }
  #disagrees(observation: { sha256: string | null; entries: readonly string[] | undefined }, identity: string | undefined): boolean {
    if (identity === undefined) return false;
    if (observation.sha256 !== null) return observation.sha256 !== identity;
    if (observation.entries) return JSON.stringify([...observation.entries].map(child => basename(child)).sort(byteOrder)) !== identity;
    return false;
  }

  #incomplete(error: unknown): InventoryUpdate {
    const failure = error instanceof AcquisitionError ? error
      : new AcquisitionError('read-failure', this.#capture.root, error instanceof Error ? error.message : String(error));
    return freeze({ kind: 'incomplete', issues: [{ code: failure.code,
      path: this.#capture.label(this.#capture.path(failure.path)), message: failure.message }] });
  }

  #moduleAt(directory: string): InventoryModule | undefined {
    const relativeDirectory = relative(this.#capture.root, directory) || '.';
    return this.#inventory.modules.find(module => module.directory === relativeDirectory);
  }
  /** The owner whose ordinary source area contains a path, if any. */
  #owner(path: string): InventoryModule | undefined {
    return this.#inventory.modules.find(module =>
      within(join(this.#capture.root, module.directory, 'src'), path) && basename(path) !== 'module.ramify');
  }

  #classify(path: string): Classified {
    const name = basename(path);
    if (!within(this.#capture.root, path)) {
      return this.#capture.recorded(path) ? { kind: 'input', path } : { kind: 'ignored', path };
    }
    if (name === 'module.ramify') {
      const directory = dirname(path);
      return this.#moduleAt(directory) ? { kind: 'description', path, directory } : { kind: 'structural', path };
    }
    const owner = this.#owner(path);
    if (owner) return { kind: 'owned', path, module: owner };
    if (name === 'README.md' && this.#moduleAt(dirname(path))) return { kind: 'readme', path, directory: dirname(path) };
    // A directory beneath `subs/` can only be a new or removed child boundary.
    if (this.#inventory.modules.some(module => within(join(this.#capture.root, module.directory, 'subs'), path))) {
      return { kind: 'structural', path };
    }
    const recorded = this.#capture.recorded(path);
    if (!recorded) return { kind: 'ignored', path };
    if (broadRoles.has(recorded.role) || broadNames.has(name)) return { kind: 'structural', path };
    return { kind: 'input', path };
  }

  async #update(changes: readonly ObservedChange[], signal?: AbortSignal): Promise<InventoryUpdate> {
    const paths = [...new Set(changes.map(change => resolve(this.#capture.root, change.path)))].sort(byteOrder);
    const classified = paths.map(path => this.#classify(path));
    if (classified.every(item => item.kind === 'ignored')) return freeze({ kind: 'unchanged' });
    if (classified.some(item => item.kind === 'structural')) return this.#rebuild(signal);

    const modules = new Map(this.#inventory.modules.map(module => [module.directory, module]));
    const files = new Map(this.#inventory.files.map(file => [file.path, file]));
    const descriptions: string[] = [], readmes: string[] = [], created: string[] = [], deleted: string[] = [], changed: string[] = [];
    const issues: ProjectIssue[] = [];
    let relink = false;

    for (const item of classified) {
      signal?.throwIfAborted();
      const label = relative(this.#capture.root, item.path);
      if (item.kind === 'ignored') continue;
      if (item.kind === 'input') { await this.#capture.reported(() => this.#capture.refresh(item.path)); changed.push(label); continue; }
      if (item.kind === 'description') {
        const module = this.#moduleAt(item.directory)!;
        await this.#capture.refresh(item.path);
        let text: string | undefined;
        try { text = await this.#capture.readFile(item.path, 'description'); }
        catch (error) {
          if (!(error instanceof AcquisitionError) || !error.message.includes('UTF-8')) throw error;
          issues.push({ code: 'invalid-description', path: label, message: '1:1: invalid-encoding: Description is not valid UTF-8' });
          continue;
        }
        if (text === undefined) return this.#rebuild(signal);
        const parsed = this.options.parse(label, text);
        if (parsed.status === 'invalid') {
          for (const issue of parsed.issues) {
            issues.push({ code: 'invalid-description', path: label,
              message: `${issue.span.line}:${issue.span.column}: ${issue.code}: ${issue.message} [${issue.span.start},${issue.span.end})` });
          }
          continue;
        }
        // A renamed owner changes identity, ancestry and sibling uniqueness.
        if (parsed.document.module.name !== module.name) return this.#rebuild(signal);
        modules.set(module.directory, { ...module, description: parsed, headerTags: parsed.document.module.tags });
        descriptions.push(label); relink = true;
        continue;
      }
      if (item.kind === 'readme') {
        const module = this.#moduleAt(item.directory)!;
        await this.#capture.refresh(item.path);
        const text = await this.#capture.readFile(item.path, 'readme');
        modules.set(module.directory, { ...modules.get(module.directory)!, purpose: readPurpose(label, text) });
        readmes.push(label);
        continue;
      }
      if (item.kind !== 'owned') continue;
      const outcome = await this.#owned(item.path, item.module, files, modules);
      if (outcome === 'structural') return this.#rebuild(signal);
      if (outcome === 'created') { created.push(label); relink = true; }
      else if (outcome === 'deleted') { deleted.push(label); relink = true; }
      else if (outcome === 'changed') changed.push(label);
    }
    if (issues.length) return freeze({ kind: 'invalid', inventory: null, issues: issues.sort(issueOrder) });

    const nextModules = [...modules.values()].sort((a, b) => byteOrder(a.directory, b.directory));
    const nextFiles = [...files.values()].sort((a, b) => byteOrder(a.path, b.path));
    let references: readonly ExactReference[] = this.#inventory.references;
    if (relink) {
      const recomputed: ExactReference[] = [];
      // A reference issue is a function of its recorded status, which the
      // inventory carries. Only a layout or description error is an invalid
      // update; a missing exposure target stays a local inventory change.
      await exactReferences(this.#capture, nextModules, new Set(nextFiles.map(file => file.path)), [], recomputed);
      references = recomputed;
    }
    const inventory: ProjectInventory = freeze({
      scope: { ...this.#inventory.scope,
        walkedAreas: nextModules.flatMap(module => module.areas.map(area => area.root)).sort(byteOrder) },
      modules: nextModules, files: nextFiles, references,
      outsideModuleFiles: this.#inventory.outsideModuleFiles,
      warnings: outsideSourceWarnings(this.#inventory.outsideModuleFiles),
    });
    this.#inventory = inventory;
    return freeze({ kind: 'local', inventory, descriptions: descriptions.sort(byteOrder), readmes: readmes.sort(byteOrder),
      created: created.sort(byteOrder), deleted: deleted.sort(byteOrder), changed: changed.sort(byteOrder) });
  }

  /** One owned path inside an existing source area, created, deleted or edited. */
  async #owned(path: string, module: InventoryModule, files: Map<string, InventoryFile>,
    modules: Map<string, InventoryModule>): Promise<'created' | 'deleted' | 'changed' | 'structural' | 'unchanged'> {
    const label = relative(this.#capture.root, path);
    const moduleRoot = join(this.#capture.root, module.directory);
    for (let directory = dirname(path); within(join(moduleRoot, 'src'), directory); directory = dirname(directory)) {
      if (excludedDirectory(directory, this.#configurationData)) return 'structural';
    }
    const known = files.get(label);
    const observed = this.#capture.recorded(path);
    if (known) await this.#capture.refresh(path);
    else await this.#capture.reported(() => this.#capture.refresh(path));
    const kind = this.#capture.recorded(path)?.kind ?? 'absent';
    if (kind === 'absent') {
      // A hook can name a file after its deletion was already published.
      // Only an inventoried file can be deleted; preserve any compiler-owned
      // absence probe and discard an otherwise unobserved request path.
      if (!known) {
        if (!observed) await this.#capture.forget(path);
        return 'unchanged';
      }
      await this.#refreshChain(path, moduleRoot);
      await this.#capture.forget(path);
      files.delete(label);
      await this.#refreshAreas(module, modules);
      return 'deleted';
    }
    // Plan 1 observes but never traverses a symlink, and never invents an owner
    // for one. A new non-file entry is a layout change, not a local edit.
    if (kind !== 'file') return 'structural';
    if (!known) {
      await this.#refreshChain(path, moduleRoot);
      if (!await this.#capture.hasExactEntry(path)) return 'structural';
      const area = within(join(moduleRoot, 'src/tests'), path) ? 'tests' : 'ordinary';
      const fileKind = inventoryFileKind(path);
      files.set(label, { path: label, owner: module.id, area, kind: fileKind,
        ...await this.#capture.application(path, fileKind) });
      await this.#refreshAreas(module, modules);
      return 'created';
    }
    files.set(label, { ...known, ...await this.#capture.application(path, known.kind) });
    return 'changed';
  }

  /** Membership of every directory between an area root and a changed entry. */
  async #refreshChain(path: string, moduleRoot: string): Promise<void> {
    const chain: string[] = [];
    for (let directory = dirname(path); within(join(moduleRoot, 'src'), directory); directory = dirname(directory)) chain.push(directory);
    for (const directory of chain.reverse()) {
      await this.#capture.refresh(directory);
      if (this.#capture.recorded(directory)?.kind === 'directory') await this.#capture.readDirectory(directory);
    }
  }

  /** `src/tests/` can appear or vanish with its first or last owned file. */
  async #refreshAreas(module: InventoryModule, modules: Map<string, InventoryModule>): Promise<void> {
    const current = modules.get(module.directory) ?? module;
    const areas = await Promise.all(current.areas.map(async area => {
      await this.#capture.refresh(join(this.#capture.root, area.root));
      return { ...area, present: await this.#capture.kind(join(this.#capture.root, area.root)) === 'directory' };
    }));
    if (JSON.stringify(areas) !== JSON.stringify(current.areas)) modules.set(current.directory, { ...current, areas });
  }

  /** A layout change rebuilds the whole inventory through Plan 1's acquisition. */
  async #rebuild(signal?: AbortSignal): Promise<InventoryUpdate> {
    const result = await acquireProject({ ...this.options, retained: this.#configuration, ...(signal ? { signal } : {}) });
    if (result.status === 'cancelled') throw signal?.reason ?? new Cancelled();
    if (result.status !== 'acquired') {
      return freeze(result.status === 'invalid'
        ? { kind: 'invalid', inventory: result.inventory, issues: result.issues }
        : { kind: 'incomplete', issues: result.issues });
    }
    const previous = this.#capture;
    this.#capture = result.acquired.capture;
    this.#inventory = result.acquired.inventory;
    this.#configuration = result.acquired.configuration;
    this.#configurationData = result.acquired.configurationData;
    this.#resolution = result.acquired.resolution;
    this.#capture.retainAcquisition();
    this.#merged = undefined; this.#recordedId = undefined;
    await previous.dispose();
    // The broad compiler update supplies the current dependency observations;
    // callbacks from a removed module must not enter this new acquisition.
    this.#reported.clear();
    return freeze({ kind: 'structural', inventory: this.#inventory });
  }
}

/** Directory enumerations an observer has performed; evidence, not a contract. */
export function observedEnumerations(observer: ProjectObserver): number {
  if (!(observer instanceof Observer)) throw new Error('Enumeration evidence needs this owner\'s observer');
  return observer.enumerations;
}

/**
 * Acquire one project and keep it observed. The caller owns the observer and
 * disposes it; `readProject` and `resolveProjectRoot` are unaffected.
 */
export async function observeProject(options: ProjectReadOptions): Promise<ProjectObserve> {
  const result = await acquireProject(options);
  if (result.status !== 'acquired') return result;
  return { status: 'observing', observer: new Observer(options, result.acquired) };
}

import { basename, dirname, join, relative, resolve } from 'node:path';
import type { Capture } from './capture.js';
import { acquireProject } from './read-project.js';
import type { AcquiredProject } from './read-project.js';
import { AcquisitionError, Cancelled, byteOrder, freeze, within } from './data.js';
import { auxiliarySource, excludedDirectory, inventoryFileKind, scopeOwnership } from './inventory.js';
import { isRamifyGeneratedPath } from './generated-path.js';
import { descriptionMarker } from './marker.js';
import { readPurpose } from './purpose.js';
import { classifyProjectPath } from './ownership.js';
import { exactReferences } from './references.js';
import { ReportedObservations, inputIdentity, reportedInput } from './observations.js';
import type { ConfigurationData } from './configuration-data.js';
import type {
  CapturedInput, ExactReference, InventoryFile, InventoryModule, InventoryUpdate, ObservationSink,
  ObservationRetirement, ObservedChange, ProjectExclusion, ProjectInventory, ProjectIssue, ProjectObserve, ProjectObserver, ProjectReadOptions,
  ProjectResolution, RetainedConfiguration,
} from './interfaces/project.js';

type Classified =
  | { readonly kind: 'description'; readonly path: string; readonly directory: string }
  | { readonly kind: 'readme'; readonly path: string; readonly directory: string }
  | { readonly kind: 'owned'; readonly path: string; readonly module: InventoryModule }
  | { readonly kind: 'auxiliary'; readonly path: string; readonly module: InventoryModule; readonly file: InventoryFile | undefined }
  | { readonly kind: 'input'; readonly path: string; readonly refreshed: boolean }
  | { readonly kind: 'structural'; readonly path: string }
  | { readonly kind: 'ignored'; readonly path: string };

/** Lookups of one inventory, so classifying a path follows its depth rather than the inventory's size. */
interface InventoryIndex {
  readonly files: ReadonlyMap<string, InventoryFile>;
  readonly modules: ReadonlyMap<string, InventoryModule>;
  /** The proper ancestors of every inventoried auxiliary file. */
  readonly auxiliary: ReadonlySet<string>;
  /** Every module directory other than the root's, with its proper ancestors. */
  readonly modulePaths: ReadonlySet<string>;
  /** The proper ancestors of every declared owned nested or external directory. */
  readonly declared: ReadonlySet<string>;
}
const indices = new WeakMap<ProjectInventory, InventoryIndex>();
/** Add a project-relative directory and its ancestors below the root; a present entry already has its ancestors. */
function addChain(set: Set<string>, directory: string): void {
  for (let current = directory; current !== '.' && current !== '' && !set.has(current); current = dirname(current)) set.add(current);
}
function indexOf(inventory: ProjectInventory): InventoryIndex {
  const known = indices.get(inventory);
  if (known) return known;
  const auxiliary = new Set<string>(), modulePaths = new Set<string>(), declared = new Set<string>();
  for (const file of inventory.files) if (file.placement === 'auxiliary') addChain(auxiliary, dirname(file.path));
  for (const module of inventory.modules) addChain(modulePaths, module.directory);
  for (const exclusion of inventory.scope.ownership.exclusions) {
    if (exclusion.kind === 'owned-unwired' || exclusion.kind === 'owned-nested-project' || exclusion.kind === 'external') addChain(declared, dirname(exclusion.directory));
  }
  const index: InventoryIndex = { files: new Map(inventory.files.map(file => [file.path, file])),
    modules: new Map(inventory.modules.map(module => [module.directory, module])), auxiliary, modulePaths, declared };
  indices.set(inventory, index);
  return index;
}

/** The kind and written directory of each nested-tree statement, in order. */
const nestedTrees = (description: InventoryModule['description']): readonly (readonly [string, string])[] =>
  description.status === 'valid' ? description.document.statements.flatMap(statement =>
    'directory' in statement ? [[statement.kind, statement.directory.value] as const] : []) : [];
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
  /** Rebuild options without the opening operation's signal; each rebuild passes its own. */
  private readonly options: Omit<ProjectReadOptions, 'signal'>;

  constructor(options: ProjectReadOptions, acquired: AcquiredProject) {
    const { signal: _signal, ...retained } = options;
    this.options = retained;
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
  auxiliarySource(path: string): boolean { return auxiliarySource(path, this.#configurationData); }
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
        return await this.#update(changes, signal);
      } catch (error) {
        if (error instanceof Cancelled || signal?.aborted) throw signal?.reason ?? error;
        return this.#incomplete(error);
      }
    });
  }

  async retire(retirement: ObservationRetirement): Promise<void> {
    return this.#serialize(async () => {
      if (retirement.kind === 'probes') { this.#capture.markReported(); return; }
      await this.#capture.retireReported();
      // Reports not yet promoted belong to the retired compiler state.
      this.#reported.clear();
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
      await this.#capture.confirm(path, observation.shape);
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
    await this.#capture.retireUnconfirmed();
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
    return indexOf(this.#inventory).modules.get(relative(this.#capture.root, directory) || '.');
  }

  /**
   * Classify one changed path from the current inventory and ownership table.
   * Only a path whose answer depends on the disk is re-observed here: an
   * excluded or otherwise unanalyzed entry is compared with what was recorded
   * about it, never read, so a byte edit of it changes nothing.
   */
  async #classify(path: string): Promise<Classified> {
    const root = this.#capture.root;
    const relativePath = relative(root, path);
    // Generated final and transient publisher output is never a real input:
    // ignore it before it can become owned, structural, description, readme
    // or otherwise-observed evidence, at any segment position.
    if (isRamifyGeneratedPath(relativePath)) return { kind: 'ignored', path };
    if (!within(root, path)) {
      return this.#capture.recorded(path) ? { kind: 'input', path, refreshed: false } : { kind: 'ignored', path };
    }
    const name = basename(path);
    const index = indexOf(this.#inventory);
    const ownership = relativePath === '' ? null : classifyProjectPath(this.#inventory.scope, relativePath);
    const exclusion = ownership?.status === 'owned' || ownership?.status === 'excluded' ? ownership.exclusion : null;
    if (exclusion) {
      if (exclusion.kind === 'owned-unwired' || exclusion.kind === 'owned-nested-project' || exclusion.kind === 'external' || exclusion.kind === 'scratch') {
        return this.#excluded(path, relativePath, exclusion);
      }
      // Repository metadata, installed packages and compiler output are never
      // walked: only a path a stage observed there is an input.
      const recorded = this.#capture.recorded(path);
      if (!recorded) return { kind: 'ignored', path };
      return broadRoles.has(recorded.role) || broadNames.has(name) ? { kind: 'structural', path } : { kind: 'input', path, refreshed: false };
    }
    // A directory on the way to a declared tree carries that tree's existence.
    if (index.declared.has(relativePath)) return { kind: 'structural', path };
    if (name === 'module.ramify') {
      const directory = dirname(path);
      return this.#moduleAt(directory) ? { kind: 'description', path, directory } : { kind: 'structural', path };
    }
    // A walked manifest is a module's dependency input or an undeclared project boundary.
    if (name === 'package.json') return { kind: 'structural', path };
    const module = ownership?.status === 'owned' ? index.modules.get(ownership.directory) : undefined;
    if (module && within(join(root, module.directory, 'src'), path)) return { kind: 'owned', path, module };
    if (name === 'README.md' && this.#moduleAt(dirname(path))) return { kind: 'readme', path, directory: dirname(path) };
    const file = index.files.get(relativePath);
    if (module && file?.placement === 'auxiliary') return { kind: 'auxiliary', path, module, file };
    // A directory holding auxiliary source or a module boundary: acquisition recomputes what lies beneath.
    if (index.auxiliary.has(relativePath) || index.modulePaths.has(relativePath)) return { kind: 'structural', path };
    if (module && !file && auxiliarySource(path, this.#configurationData)) return { kind: 'auxiliary', path, module, file: undefined };
    return this.#walked(path, name);
  }

  /**
   * A declared nested tree or scratch directory is never entered. Its own
   * directory is boundary evidence. A path beneath it matters only as far as a
   * stage observed it: a byte edit of read bytes keeps the ordinary input rule,
   * and a changed kind or membership of an entry the compiler configuration
   * listed, read or not, can change the compiler selection and its warnings, so
   * acquisition decides. A byte edit of an unread entry leaves its identity, and
   * so the inputs, unchanged.
   */
  async #excluded(path: string, relativePath: string, exclusion: ProjectExclusion): Promise<Classified> {
    const before = this.#capture.recorded(path);
    if (exclusion.directory === relativePath) {
      return before && await this.#unchanged(path) ? { kind: 'ignored', path } : { kind: 'structural', path };
    }
    if (!before) {
      // Unobserved: it matters only by changing what a stage recorded of its
      // nearest observed directory, up to the tree's own: a listing that gained
      // or lost it, or a directory, such as an absent tree, that now exists.
      const top = join(this.#capture.root, exclusion.directory);
      for (let directory = dirname(path); within(top, directory); directory = dirname(directory)) {
        const recorded = this.#capture.recorded(directory);
        if (!recorded) continue;
        return await this.#unchanged(directory) ? { kind: 'ignored', path } : { kind: 'structural', path };
      }
      return { kind: 'ignored', path };
    }
    if (before.read) {
      if (broadRoles.has(before.role) || broadNames.has(basename(path))) return { kind: 'structural', path };
      // A read entry that appeared or vanished in a listing a stage recorded,
      // such as the compiler configuration's, can change the compiler selection
      // and its warnings, as an unread one does; a byte edit stays an input.
      const parent = dirname(path);
      if (this.#capture.recorded(parent)?.directory && !await this.#unchanged(parent)) return { kind: 'structural', path };
      return { kind: 'input', path, refreshed: false };
    }
    if (!await this.#unchanged(path)) return { kind: 'structural', path };
    // Bytes read through a link at another path still depend on this file.
    return this.#capture.readThrough(path) ? { kind: 'input', path, refreshed: true } : { kind: 'ignored', path };
  }

  /**
   * A walked path outside every source area that no other rule names: an inert
   * file, a directory, or a candidate a stage observed without reading it. A new
   * or changed directory can hold anything discovery reads, so acquisition
   * decides; an inert file changes its input only when its kind does.
   */
  async #walked(path: string, name: string): Promise<Classified> {
    const before = this.#capture.recorded(path);
    if (before && (broadRoles.has(before.role) || broadNames.has(name))) return { kind: 'structural', path };
    if (before?.read) return { kind: 'input', path, refreshed: false };
    if (!before) {
      await this.#capture.reported(() => this.#capture.refresh(path));
      if (this.#capture.recorded(path)?.kind === 'directory') return { kind: 'structural', path };
      // Discovery never needs an inert entry's own observation: leave none.
      await this.#capture.forget(path);
      return { kind: 'ignored', path };
    }
    const same = await this.#unchanged(path) && !this.#capture.readThrough(path);
    if (before.kind === 'directory' || this.#capture.recorded(path)?.kind === 'directory') {
      return same ? { kind: 'ignored', path } : { kind: 'structural', path };
    }
    return same ? { kind: 'ignored', path } : { kind: 'input', path, refreshed: true };
  }

  /** Re-observe one recorded path as a compiler report would; true when its input identity is the same. */
  async #unchanged(path: string): Promise<boolean> {
    const identity = this.#capture.identity(path);
    await this.#capture.reported(() => this.#capture.refresh(path));
    return identity !== undefined && this.#capture.identity(path) === identity;
  }

  async #update(changes: readonly ObservedChange[], signal?: AbortSignal): Promise<InventoryUpdate> {
    const paths = [...new Set(changes.map(change => resolve(this.#capture.root, change.path)))].sort(byteOrder);
    const classified: Classified[] = [];
    for (const path of paths) {
      signal?.throwIfAborted();
      const item = await this.#classify(path);
      if (item.kind === 'structural') return this.#rebuild(signal);
      classified.push(item);
    }
    if (classified.every(item => item.kind === 'ignored')) return freeze({ kind: 'unchanged' });

    const modules = new Map(this.#inventory.modules.map(module => [module.directory, module]));
    const files = new Map(this.#inventory.files.map(file => [file.path, file]));
    const descriptions: string[] = [], readmes: string[] = [], created: string[] = [], deleted: string[] = [], changed: string[] = [];
    const issues: ProjectIssue[] = [];
    let relink = false;

    for (const item of classified) {
      signal?.throwIfAborted();
      const label = relative(this.#capture.root, item.path);
      if (item.kind === 'ignored') continue;
      if (item.kind === 'input') {
        if (!item.refreshed) await this.#capture.reported(() => this.#capture.refresh(item.path));
        changed.push(label);
        continue;
      }
      if (item.kind === 'description') {
        const module = this.#moduleAt(item.directory)!;
        await this.#capture.refresh(item.path);
        // A gained or lost root marker changes the root's selection or makes a
        // child another project's root: acquisition decides either.
        const bytes = this.#capture.recorded(item.path)?.kind === 'file' ? await this.#capture.bytes(item.path, 'description') : undefined;
        if (bytes !== undefined && (descriptionMarker(label, bytes, this.options.marker) !== null) !== (module.parent === null)) return this.#rebuild(signal);
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
        // A changed nested-tree declaration moves a discovery boundary: acquisition prunes and validates it.
        if (JSON.stringify(nestedTrees(parsed)) !== JSON.stringify(nestedTrees(module.description))) return this.#rebuild(signal);
        // Build on this update's record, so a README of the same module applied earlier keeps its purpose.
        modules.set(module.directory, { ...modules.get(module.directory)!, description: parsed, headerTags: parsed.document.module.tags });
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
      if (item.kind === 'auxiliary') {
        const outcome = await this.#auxiliaryFile(item.path, item.module, item.file, files);
        if (outcome === 'structural') return this.#rebuild(signal);
        if (outcome === 'created') created.push(label);
        else if (outcome === 'deleted') deleted.push(label);
        else if (outcome === 'changed') changed.push(label);
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
      const referenceIssues: ProjectIssue[] = [];
      // A created, deleted or redeclared file can leave an exposure statement
      // without its exact file. The acquisition rejects that project, so the
      // update reports it invalid as well; the session then recomputes it.
      await exactReferences(this.#capture, nextModules, new Set(nextFiles.map(file => file.path)), referenceIssues, recomputed);
      if (referenceIssues.length) return freeze({ kind: 'invalid', inventory: null, issues: referenceIssues.sort(issueOrder) });
      references = recomputed;
    }
    const inventory: ProjectInventory = freeze({
      scope: { ...this.#inventory.scope,
        walkedAreas: nextModules.flatMap(module => module.areas.map(area => area.root)).sort(byteOrder),
        ownership: scopeOwnership(this.#capture.root, nextModules, this.#configurationData) },
      modules: nextModules, files: nextFiles, references,
      // A local update moves no boundary and changes no compiler selection
      // inside a declared tree or scratch directory, so every warning carries
      // over; a rebuild recomputes them.
      warnings: this.#inventory.warnings,
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
      // absence probe and discard an otherwise unobserved request path. A
      // removed directory takes every file beneath it: acquisition decides.
      if (!known) {
        if (observed?.kind === 'directory') return 'structural';
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
      files.set(label, { path: label, owner: module.id, area, kind: fileKind, placement: 'src',
        ...await this.#capture.application(path, fileKind) });
      await this.#refreshAreas(module, modules);
      return 'created';
    }
    files.set(label, { ...known, ...await this.#capture.application(path, known.kind) });
    return 'changed';
  }

  /**
   * One owned compiler source path outside its owner's `src/`, created, deleted
   * or edited, under the ordinary membership rule. The inventory changes in
   * place when the walk reaches the file through directories it already lists;
   * a new directory, a removed one or a link on the way is left to acquisition.
   */
  async #auxiliaryFile(path: string, module: InventoryModule, known: InventoryFile | undefined,
    files: Map<string, InventoryFile>): Promise<'created' | 'deleted' | 'changed' | 'structural' | 'unchanged'> {
    const label = relative(this.#capture.root, path);
    const observed = this.#capture.recorded(path);
    if (known) await this.#capture.refresh(path);
    else await this.#capture.reported(() => this.#capture.refresh(path));
    const kind = this.#capture.recorded(path)?.kind ?? 'absent';
    if (kind === 'absent') {
      // A path a stage saw present is an input that moved, which only acquisition can place.
      if (!known) {
        if (!observed) await this.#capture.forget(path);
        return observed && observed.kind !== 'absent' ? 'structural' : 'unchanged';
      }
      if (!await this.#listedParent(path)) return 'structural';
      await this.#capture.forget(path);
      files.delete(label);
      return 'deleted';
    }
    if (kind !== 'file') return 'structural';
    if (known) {
      files.set(label, { ...known, ...await this.#capture.application(path, 'source') });
      return 'changed';
    }
    if (!await this.#listedChain(path, join(this.#capture.root, module.directory)) || !await this.#capture.hasExactEntry(path)) return 'structural';
    files.set(label, { path: label, owner: module.id, area: 'ordinary', kind: 'source', placement: 'auxiliary',
      ...await this.#capture.application(path, 'source') });
    return 'created';
  }

  /** Re-list a file's directory, which the walk enumerated; false when it is no longer such a directory. */
  async #listedParent(path: string): Promise<boolean> {
    const parent = dirname(path);
    if (!this.#capture.recorded(parent)?.directory) return false;
    await this.#capture.refresh(parent);
    const now = this.#capture.recorded(parent);
    return now?.kind === 'directory' && now.directory;
  }
  /** As `#listedParent`, when every directory above it up to the owner's directory is one the walk lists. */
  async #listedChain(path: string, owner: string): Promise<boolean> {
    for (let directory = dirname(dirname(path)); within(owner, directory); directory = dirname(directory)) {
      const recorded = this.#capture.recorded(directory);
      if (recorded?.kind !== 'directory' || !recorded.directory) return false;
      if (directory === owner) break;
    }
    return this.#listedParent(path);
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

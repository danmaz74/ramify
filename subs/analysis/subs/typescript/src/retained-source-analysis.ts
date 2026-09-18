import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { API, type Project } from 'typescript/unstable/sync';
import { isStringLiteral } from 'typescript/unstable/ast';
import type { ObservationSink, ProjectInventory } from '../../project/src/interfaces/project.js';
import type { SourceArea } from '../../model/src/interfaces/model.js';
import { AccessInterpretation } from './accesses.js';
import { createDescriptionSet, type DescriptionSet } from './descriptions.js';
import { describeExportShapes } from './export-shapes.js';
import type { AccessInterpreter, CatalogDelta, CatalogExport, ExportShape, ExportShapeRequest, FileDescription, MembershipReach,
  RetainedSourceAnalysis, RetainedSourceInputs, SourceCatalog, SourceChangeSet, SourceWorkLimits, SymbolDetail, SymbolDetailLimits,
  SymbolDetailRequest } from './interfaces/source.js';
import type { CatalogHost } from './resolution.js';
import { describeSymbolDetails } from './symbol-details.js';
import { referencesOnly, syntheticCandidate, syntheticInputs } from './synthetic.js';
import { FILE_BYTES, SourceFailure, freezeData, type HelperInputs } from './wire.js';

type Snapshot = ReturnType<API['updateSnapshot']>;
type Kind = 'file' | 'directory' | 'absent' | 'other';
type Probe = Parameters<ObservationSink['probe']>[1];

const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const missing = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** What the API keeps private but the evidence exports read: the server
 * process and the live snapshot registry. Absent shapes disable that evidence. */
interface ApiInternals {
  readonly client?: { readonly channel?: { readonly child?: ChildProcess } };
  readonly activeSnapshots?: ReadonlySet<unknown>;
}

/** Evidence about the compiler behind one adapter, outside its port. */
export interface RetainedCompilerEvidence {
  readonly hot: boolean;
  /** Snapshots the compiler API currently registers as live. */
  readonly liveSnapshots: number;
  /** The most snapshots registered at once during the last replacement. */
  readonly peakLiveSnapshots: number;
  /** Whether the snapshot the last update replaced has been disposed. */
  readonly previousDisposed: boolean | null;
  readonly serverPid: number | undefined;
  readonly syntheticConfiguration: string | null;
  readonly programHas: (path: string) => boolean;
}

/**
 * One warm compiler server with exactly one live snapshot, updated from named
 * change sets. Every filesystem callback reads the disk and reports to the
 * project observer's sink, so the compiler's reads are observed inputs. Facts
 * are plain data; the compiler stays inside this owner.
 */
class RetainedSourceState implements RetainedSourceAnalysis {
  #root: string;
  #configuration: string;
  #inventory: ProjectInventory;
  #areas: readonly SourceArea[];
  #limits: SourceWorkLimits;
  #sink: ObservationSink;
  #lifetime: AbortSignal | undefined;
  #api: API | undefined;
  #snapshot: Snapshot | undefined;
  #previous: Snapshot | undefined;
  #project: Project | undefined;
  #child: ChildProcess | undefined;
  #exited: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  #aborted = (): void => this.#discard();
  #virtual = new Map<string, string>();
  #synthetic: string | undefined;
  #witness: string | undefined;
  #selectedFiles: readonly string[] = [];
  /** Text of each file the last configuration parse read, null when absent. */
  #configurationTexts = new Map<string, string | null>();
  /** The reads of a configuration parse in progress. */
  #parseReads: Map<string, string | null> | undefined;
  #owned = new Map<string, 'source' | 'resource'>();
  #set: DescriptionSet = createDescriptionSet();
  #runtime = new Map<CatalogExport, boolean>();
  #interpretation: AccessInterpretation | undefined;
  #port: AccessInterpreter | undefined;
  /** The next description reads every owned file: cold, reopened or invalidated. */
  #broad = true;
  #described = false;
  #lost: SourceFailure | undefined;
  #callbackFailure: SourceFailure | undefined;
  #disposed = false;
  #sequence = 0;
  #peak = 0;
  #host: CatalogHost;

  constructor(inputs: RetainedSourceInputs) {
    this.#root = resolve(inputs.root);
    this.#configuration = resolve(this.#root, inputs.configuration);
    this.#inventory = inputs.inventory;
    this.#areas = inputs.areas;
    this.#limits = inputs.limits;
    this.#sink = inputs.sink;
    this.#lifetime = inputs.signal;
    this.#adoptInventory(inputs.inventory);
    this.#host = { fileExists: path => this.#fileExists(path), readFile: path => this.#readFile(path), resourceWitness: '' };
    this.#lifetime?.addEventListener('abort', this.#aborted, { once: true });
  }

  get hot(): boolean { return this.#api !== undefined; }

  /** Evidence outside the port; see `retainedCompilerEvidence`. */
  get evidence(): RetainedCompilerEvidence {
    const internals = this.#api as unknown as ApiInternals | undefined;
    const project = this.#project;
    return {
      hot: this.hot,
      liveSnapshots: internals?.activeSnapshots?.size ?? 0,
      peakLiveSnapshots: this.#peak,
      previousDisposed: this.#previous ? this.#previous.isDisposed() : null,
      serverPid: this.#child?.pid,
      syntheticConfiguration: this.#synthetic ? this.#virtual.get(this.#synthetic) ?? null : null,
      programHas: path => !!project && !!this.#guarded(() => project.program.getSourceFile(resolve(this.#root, path))),
    };
  }

  async update(changes: SourceChangeSet, signal?: AbortSignal): Promise<{ readonly snapshot: number; readonly elapsedMs: number;
    readonly reach?: MembershipReach }> {
    this.#check(signal);
    const start = performance.now();
    const ownedBefore = new Set(this.#owned.keys());
    let reach: MembershipReach | undefined;
    if (changes.inventory) this.#adoptInventory(changes.inventory);
    if (!this.#api) {
      // A released or discarded compiler reopens from the disk as it is now;
      // the retained descriptions are then read afresh in full.
      this.#open();
      this.#broad = true;
    } else {
      const absolute = (paths: readonly string[]): string[] => [...new Set(paths.map(path => resolve(this.#root, path)))].sort(order);
      const changed = new Set(absolute(changes.changed));
      const created = absolute(changes.created), deleted = absolute(changes.deleted);
      if (changes.invalidateAll) {
        // A configuration change can select other files, so the explicit
        // roots follow a fresh parse; everything else is re-read anyway.
        const configuration = this.#guarded(() => this.#parseConfiguration());
        for (const path of this.#regenerate()) changed.add(path);
        // A whole invalidation re-reads every file but keeps the project's parsed
        // options. Configuration files whose text changed are named first, so
        // an options-only edit reaches the program, its libraries included.
        if (configuration.changed.length || configuration.deleted.length) {
          this.#replaceSnapshot({ changed: [...configuration.changed], deleted: [...configuration.deleted] });
        }
        this.#replaceSnapshot({ invalidateAll: true });
        this.#broad = true;
      } else {
        let removedConfiguration: readonly string[] = [];
        if (changes.inventory) {
          // Configured roots also change with membership. Retaining the old
          // fileNames list would keep a deleted source in the synthetic roots.
          // A configuration text this update did not announce still reaches the
          // compiler's options, so the recorded texts never absorb a change.
          const configuration = this.#guarded(() => this.#parseConfiguration());
          for (const path of [...this.#regenerate(), ...configuration.changed]) changed.add(path);
          removedConfiguration = configuration.deleted;
        }
        const membership = created.length > 0 || deleted.length > 0;
        const before = membership ? this.#programFiles() : [];
        const global = membership ? deleted.filter(path => this.#reachesGlobally(path)) : [];
        if (changed.size || created.length || deleted.length || removedConfiguration.length) {
          this.#replaceSnapshot({ changed: [...changed].sort(order), created, deleted: [...deleted, ...removedConfiguration].sort(order) });
        }
        if (membership) {
          const owned = (path: string): boolean => ownedBefore.has(path) || this.#owned.has(path);
          const previous = new Set(before.filter(path => !owned(path)));
          const current = new Set(this.#programFiles().filter(path => !owned(path)));
          const label = (paths: Iterable<string>): string[] => [...paths].map(path => relative(this.#root, path)).sort(order);
          const options = this.#project!.program.getCompilerOptions() as { readonly baseUrl?: string; readonly rootDirs?: readonly string[];
            readonly paths?: Readonly<Record<string, readonly string[]>>; readonly pathsBasePath?: string };
          reach = {
            added: label([...current].filter(path => !previous.has(path))),
            removed: label([...previous].filter(path => !current.has(path))),
            global: label([...global, ...created.filter(path => this.#reachesGlobally(path))]),
            // Resolution records a paths substitution only against an absolute base.
            spelled: !options.baseUrl && !options.rootDirs?.length && (!options.paths || isAbsolute(options.pathsBasePath ?? '')),
          };
        }
      }
    }
    this.#interpretation?.refresh(this.#project!, this.#helperInputs());
    this.#described = false;
    this.#sequence++;
    return freezeData({ snapshot: this.#sequence, elapsedMs: performance.now() - start, ...(reach ? { reach } : {}) });
  }

  /** Every file of the current program, as absolute paths. */
  #programFiles(): readonly string[] {
    const project = this.#requireProject();
    return this.#guarded(() => project.program.getSourceFileNames().map(path => resolve(path)));
  }

  /** Whether an owned source in the current program can reach other files through
   * anything but a resolved import: see `MembershipReach.global`. A file the
   * program does not hold reaches nothing. */
  #reachesGlobally(path: string): boolean {
    const project = this.#requireProject();
    return this.#guarded(() => {
      const source = project.program.getSourceFile(path);
      if (!source) return false;
      if (!source.externalModuleIndicator || source.isDeclarationFile || source.moduleAugmentations.length > 0
        || source.ambientModuleNames.length > 0 || source.referencedFiles.length > 0 || source.typeReferenceDirectives.length > 0
        || source.libReferenceDirectives.length > 0) return true;
      // An import the compiler did not resolve can still have read a package manifest.
      return source.imports.some(node => {
        const text = isStringLiteral(node) ? node.text : undefined;
        const relativeSpecifier = text !== undefined && (text.startsWith('./') || text.startsWith('../') || text === '.' || text === '..' || text.startsWith('/'));
        return !relativeSpecifier && !project.checker.getSymbolAtLocation(node);
      });
    });
  }

  async describe(files: readonly string[], signal?: AbortSignal): Promise<{ readonly descriptions: readonly FileDescription[]; readonly delta: CatalogDelta }> {
    this.#check(signal);
    const project = this.#requireProject();
    const owned = new Set(this.#inventory.files.map(file => file.path));
    const before = this.#set.all().map(description => description.file);
    const names = this.#broad ? [...owned] : [...files];
    const update = this.#guarded(() => this.#set.describe(project, this.#helperInputs(), this.#host, this.#runtime, names));
    this.#broad = false;
    this.#described = true;
    this.#pruneRuntime();
    const removed = before.filter(file => !owned.has(file));
    this.#interpretation?.replaceDescriptions(update.descriptions, removed, true);
    return freezeData({ descriptions: update.descriptions, delta: update.delta });
  }

  catalog(): SourceCatalog {
    this.#check();
    if (!this.#described) throw new SourceFailure('unavailable', 'Describe the current update before reading its catalog');
    return freezeData(this.#set.catalog());
  }

  async details(requests: readonly SymbolDetailRequest[], limits: SymbolDetailLimits, signal?: AbortSignal): Promise<readonly SymbolDetail[]> {
    this.#check(signal);
    const project = this.#requireProject();
    return this.#guarded(() => describeSymbolDetails(project, { inventory: this.#inventory, areas: this.#areas }, requests, limits, signal));
  }

  async shapes(requests: readonly ExportShapeRequest[], signal?: AbortSignal): Promise<readonly ExportShape[]> {
    this.#check(signal);
    const project = this.#requireProject();
    return this.#guarded(() => describeExportShapes(project, { inventory: this.#inventory, areas: this.#areas }, requests, signal));
  }

  interpreter(): AccessInterpreter {
    this.#check();
    const project = this.#requireProject();
    if (!this.#described) throw new SourceFailure('unavailable', 'Describe the current update before interpreting accesses');
    if (!this.#interpretation) {
      this.#interpretation = this.#guarded(() => new AccessInterpretation(project, this.#helperInputs(), this.#host, this.#set.catalog(), this.#runtime));
      this.#port = undefined;
    }
    this.#port ??= Object.freeze({
      interpret: async (files: readonly string[], signal?: AbortSignal) => {
        this.#check(signal);
        const interpretation = this.#requireInterpretation();
        return freezeData(this.#guarded(() => interpretation.interpret(files)));
      },
      replaceDescriptions: (descriptions: readonly FileDescription[], removed: readonly string[]) => {
        this.#check();
        this.#requireInterpretation().replaceDescriptions(descriptions, removed, true);
      },
      dispose: async () => { this.#interpretation?.dispose(); this.#interpretation = undefined; this.#port = undefined; },
    });
    return this.#port;
  }

  async releaseCompiler(): Promise<void> {
    if (this.#disposed) return;
    this.#discard();
    this.#lost = undefined;
    this.#broad = true;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#discard();
    this.#lifetime?.removeEventListener('abort', this.#aborted);
    this.#lost = undefined;
    this.#set = createDescriptionSet();
    this.#runtime.clear();
    this.#owned.clear();
    this.#described = false;
  }

  #check(signal?: AbortSignal): void {
    if (this.#disposed) throw new SourceFailure('disposed', 'Retained source analysis has been disposed');
    if (this.#lost) { const failure = this.#lost; this.#lost = undefined; throw failure; }
    if (this.#lifetime?.aborted) {
      this.#discard();
      throw new SourceFailure('cancelled', 'Retained source analysis lifetime was cancelled');
    }
    if (signal?.aborted) throw new SourceFailure('cancelled', 'Retained source operation was cancelled before execution');
  }

  #requireProject(): Project {
    if (!this.#project) throw new SourceFailure('unavailable', 'The compiler is released; update before describing or interpreting');
    return this.#project;
  }
  #requireInterpretation(): AccessInterpretation {
    if (!this.#interpretation) throw new SourceFailure('disposed', 'Access interpreter has been disposed');
    if (!this.#described) throw new SourceFailure('unavailable', 'Describe the current update before interpreting accesses');
    return this.#interpretation;
  }

  #helperInputs(): HelperInputs { return { inventory: this.#inventory, areas: this.#areas, limits: this.#limits }; }

  #adoptInventory(inventory: ProjectInventory): void {
    this.#inventory = inventory;
    this.#owned = new Map(inventory.files.map(file => [resolve(this.#root, file.path), file.kind]));
  }

  /**
   * Run compiler-bearing work. A failure raised by one of this adapter's own
   * callbacks keeps its code; any other failure of a request means the server
   * or its channel is gone. Both discard the compiler, so no later call can
   * read a fact from a snapshot that no longer answers.
   */
  #guarded<T>(operation: () => T): T {
    this.#callbackFailure = undefined;
    try { return operation(); }
    catch (error) {
      if (error instanceof SourceFailure && !this.#callbackFailure) throw error;
      const failure = this.#callbackFailure
        ?? new SourceFailure('read-failure', `Compiler server request failed: ${error instanceof Error ? error.message : String(error)}`);
      this.#callbackFailure = undefined;
      this.#discard();
      throw failure;
    }
  }

  /** The server exited on its own: nothing it produced is answered again. */
  #lose(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    if (child !== this.#child) return;
    this.#discard();
    this.#lost = new SourceFailure('read-failure', `Compiler server exited (${signal ?? code ?? 'unknown'})`);
  }

  #discard(): void {
    this.#interpretation?.dispose(); this.#interpretation = undefined; this.#port = undefined;
    const api = this.#api, snapshot = this.#snapshot, child = this.#child, exited = this.#exited;
    this.#api = undefined; this.#snapshot = undefined; this.#previous = undefined; this.#project = undefined;
    this.#child = undefined; this.#exited = undefined;
    if (child && exited) child.off('exit', exited);
    try { if (snapshot && !snapshot.isDisposed()) snapshot.dispose(); } catch { /* The server may already be gone. */ }
    try { api?.close(); } catch { /* Closing kills the child; a dead child is fine. */ }
    this.#virtual.clear(); this.#synthetic = undefined; this.#witness = undefined;
    this.#host = { ...this.#host, resourceWitness: '' };
  }

  #open(): void {
    const api = new API({ cwd: this.#root, fs: {
      readFile: path => this.#readFile(path),
      fileExists: path => this.#fileExists(path),
      directoryExists: path => this.#directoryExists(path),
      getAccessibleEntries: path => this.#readDirectory(path),
      realpath: path => this.#realpath(path),
    } });
    this.#api = api;
    const child = (api as unknown as ApiInternals).client?.channel?.child;
    if (child) {
      this.#child = child;
      this.#exited = (code, signal) => this.#lose(child, code, signal);
      child.once('exit', this.#exited);
    }
    try {
      this.#guarded(() => {
        this.#configurationTexts.clear();
        this.#parseConfiguration();
        const text = this.#readFile(this.#configuration);
        if (text === null) throw new SourceFailure('unavailable', 'The selected compiler configuration is missing');
        if (referencesOnly(text, this.#selectedFiles)) throw new SourceFailure('unavailable', 'Solution-style compiler configurations are unavailable');
        // Occupancy of the synthetic names is an observation of their directory,
        // exactly as the finite helper's absence probe enumerates it.
        const directory = resolve(this.#configuration, '..');
        const entries = this.#listing(directory);
        for (let candidate = 0; candidate < 1000; candidate++) {
          const names = syntheticCandidate(this.#configuration, candidate);
          if (!entries.has(basename(names.configuration)) && !entries.has(basename(names.witness))) {
            this.#synthetic = names.configuration; this.#witness = names.witness; break;
          }
        }
        if (!this.#synthetic || !this.#witness) throw new SourceFailure('resource-limit', 'No unoccupied synthetic compiler input paths were available');
        this.#host = { ...this.#host, resourceWitness: this.#witness };
        this.#regenerate();
        this.#replaceSnapshot(undefined);
      });
    } catch (error) { this.#discard(); throw error; }
  }

  /**
   * Parse the selected configuration for its explicit roots, recording the text
   * of every file the parse read. Returns the files whose text differs from the
   * previous parse: present ones as changed, now absent ones as deleted.
   */
  #parseConfiguration(): { readonly changed: readonly string[]; readonly deleted: readonly string[] } {
    const reads = new Map<string, string | null>();
    this.#parseReads = reads;
    try { this.#selectedFiles = this.#api!.parseConfigFile(this.#configuration).fileNames; }
    finally { this.#parseReads = undefined; }
    const previous = this.#configurationTexts;
    this.#configurationTexts = reads;
    const differing = [...reads].filter(([path, text]) => previous.has(path) ? previous.get(path) !== text : text !== null);
    return {
      changed: differing.filter(([, text]) => text !== null).map(([path]) => path).sort(order),
      deleted: differing.filter(([, text]) => text === null).map(([path]) => path).sort(order),
    };
  }

  /** Regenerate the virtual inputs; the virtual paths whose text changed. */
  #regenerate(): readonly string[] {
    const generated = syntheticInputs(this.#inventory, this.#configuration, this.#selectedFiles, this.#witness!);
    const changed: string[] = [];
    for (const [path, text] of [[this.#synthetic!, generated.configuration], [this.#witness!, generated.witness]] as const) {
      if (this.#virtual.get(path) !== text) { this.#virtual.set(path, text); changed.push(path); }
    }
    return changed;
  }

  /** Replace the live snapshot; the previous one is disposed before return. */
  #replaceSnapshot(fileChanges: { changed?: string[]; created?: string[]; deleted?: string[] } | { invalidateAll: true } | undefined): void {
    const api = this.#api!;
    this.#guarded(() => {
      const previous = this.#snapshot;
      const snapshot = api.updateSnapshot({ openProjects: [this.#synthetic!], ...(fileChanges ? { fileChanges } : {}) });
      this.#peak = (api as unknown as ApiInternals).activeSnapshots?.size ?? (previous ? 2 : 1);
      this.#snapshot = snapshot;
      if (previous) { previous.dispose(); this.#previous = previous; }
      const project = snapshot.getProject(this.#synthetic!);
      if (!project) throw new SourceFailure('unavailable', 'The compiler could not create the selected project');
      this.#project = project;
    });
  }

  /** Keep only the export-path flags of exports a current description reaches. */
  #pruneRuntime(): void {
    const reachable = new Set<CatalogExport>();
    const visit = (entries: readonly CatalogExport[]): void => {
      for (const entry of entries) {
        if (reachable.has(entry)) continue;
        reachable.add(entry);
        if (entry.namespace) visit(entry.namespace);
      }
    };
    for (const description of this.#set.all()) visit(description.exports.exports);
    for (const entry of [...this.#runtime.keys()]) if (!reachable.has(entry)) this.#runtime.delete(entry);
  }

  // Filesystem callbacks: the disk is read directly and every observation is
  // reported, with the shape the batch capture records for the same call.

  #fail(failure: SourceFailure): never { this.#callbackFailure = failure; throw failure; }

  #role(path: string): Parameters<ObservationSink['file']>[3] {
    if (path === this.#configuration) return 'configuration';
    return this.#owned.get(path) ?? 'dependency';
  }

  /** Observe a path's kind through its symlink, as the capture's target lookup does. */
  #observe(path: string, operation: Probe): Kind {
    let stat;
    try { stat = lstatSync(path); }
    catch (error) {
      if (!missing(error)) this.#fail(new SourceFailure('read-failure', `Cannot observe ${path}: ${String(error)}`, path));
      this.#sink.probe(path, operation);
      return 'absent';
    }
    this.#sink.probe(path, operation);
    if (stat.isSymbolicLink()) {
      let canonical: string;
      try { canonical = realpathSync(path); }
      catch (error) { if (missing(error)) return 'absent'; this.#fail(new SourceFailure('read-failure', `Cannot resolve ${path}: ${String(error)}`, path)); }
      this.#sink.probe(canonical, operation);
      try { stat = statSync(canonical); }
      catch (error) { if (missing(error)) return 'absent'; this.#fail(new SourceFailure('read-failure', `Cannot observe ${canonical}: ${String(error)}`, path)); }
    }
    return stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
  }

  #readFile(requested: string): string | null {
    const text = this.#readObserved(requested);
    this.#parseReads?.set(resolve(requested), text);
    return text;
  }

  #readObserved(requested: string): string | null {
    const path = resolve(requested);
    const virtual = this.#virtual.get(path);
    if (virtual !== undefined) return virtual;
    let bytes: Buffer;
    try { bytes = readFileSync(path); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (missing(error)) {
        // A dangling link is an observed entry, not an absent path.
        if (this.#dangling(path)) this.#sink.probe(path, 'fileExists'); else this.#sink.absent(path);
        return null;
      }
      if (code === 'EISDIR') { this.#sink.probe(path, 'fileExists'); return null; }
      this.#fail(new SourceFailure('read-failure', `Cannot read ${path}: ${String(error)}`, path));
    }
    if (bytes.length > FILE_BYTES) this.#fail(new SourceFailure('resource-limit', 'Source read exceeds 8 MiB', path));
    this.#sink.file(path, createHash('sha256').update(bytes).digest('hex'), bytes.length, this.#role(path));
    try { return decoder.decode(bytes); }
    catch { return this.#fail(new SourceFailure('read-failure', 'Input is not valid UTF-8', path)); }
  }

  #dangling(path: string): boolean {
    try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
  }

  #fileExists(requested: string): boolean {
    const path = resolve(requested);
    if (this.#virtual.has(path)) return true;
    return this.#observe(path, 'fileExists') === 'file';
  }

  #directoryExists(requested: string): boolean {
    return this.#observe(resolve(requested), 'directoryExists') === 'directory';
  }

  #realpath(requested: string): string {
    const path = resolve(requested);
    if (this.#virtual.has(path)) return path;
    this.#sink.probe(path, 'realPath');
    try { return realpathSync(path); }
    catch (error) {
      if (missing(error)) return path;
      return this.#fail(new SourceFailure('read-failure', `Cannot resolve ${path}: ${String(error)}`, path));
    }
  }

  /** Enumerate a directory and report it with its members' full paths. */
  #listing(path: string): Set<string> {
    if (this.#observe(path, 'directoryExists') !== 'directory') return new Set();
    let names: string[];
    try { names = readdirSync(path); }
    catch (error) {
      if (missing(error)) return new Set();
      return this.#fail(new SourceFailure('read-failure', `Cannot enumerate ${path}: ${String(error)}`, path));
    }
    const entries = names.map(name => resolve(path, name)).sort(order);
    this.#sink.directory(path, entries);
    return new Set(names);
  }

  #readDirectory(requested: string): { files: string[]; directories: string[] } {
    const path = resolve(requested);
    const files: string[] = [], directories: string[] = [];
    for (const name of [...this.#listing(path)].sort(order)) {
      // The helper classifies each member through the view's existence probes,
      // which observe the member; so does this.
      const kind = this.#observe(resolve(path, name), 'fileExists');
      if (kind === 'file') files.push(name);
      else if (kind === 'directory') directories.push(name);
    }
    return { files, directories };
  }
}

/** Open one warm compiler over the current disk state. The caller owns the
 * adapter and disposes it; the sink is project's observer port. */
export async function createRetainedSourceAnalysis(inputs: RetainedSourceInputs): Promise<RetainedSourceAnalysis> {
  if (inputs.signal?.aborted) throw new SourceFailure('cancelled', 'Retained source analysis was cancelled before startup');
  if (Object.values(inputs.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new SourceFailure('resource-limit', 'Source work limits must be positive safe integers');
  }
  const analysis = new RetainedSourceState(inputs);
  try { await analysis.update({ changed: [], created: [], deleted: [], inventory: null, invalidateAll: false }); }
  catch (error) { await analysis.dispose(); throw error; }
  return analysis;
}

/** Compiler evidence for tests and the reference harness; not a contract. */
export function retainedCompilerEvidence(analysis: RetainedSourceAnalysis): RetainedCompilerEvidence {
  if (!(analysis instanceof RetainedSourceState)) throw new Error('Compiler evidence needs this owner\'s retained adapter');
  return analysis.evidence;
}

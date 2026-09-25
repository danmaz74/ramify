import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, readlink, realpath, readdir, opendir, open } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { AcquisitionLimits, CapturedInput } from './interfaces/project.js';
import { AcquisitionError, Cancelled, byteOrder, freeze, hash, missing, within } from './data.js';
import { isRamifyGeneratedSegment } from './generated-path.js';

type Role = CapturedInput['role'];
type Kind = 'file' | 'directory' | 'symlink' | 'other' | 'absent';
interface Observation {
  path: string;
  kind: Kind;
  signature: string;
  canonical: string | undefined;
  link?: string;
  bytes?: Buffer;
  entries?: readonly string[];
  role: Role;
  exactName?: boolean;
  /** Content identity and reported input, recorded once per mutation of this observation. */
  sha256?: string;
  input?: CapturedInput;
}
type Mutable = 'role' | 'bytes' | 'entries' | 'exactName';
type ObservationRecipe = { path: string; role: Role; read: boolean; directory: boolean; exact: boolean };

/** Private, invocation-owned capture. No filesystem object escapes to a report. */
export class Capture {
  #observations = new Map<string, Observation>();
  #pending = new Map<string, Promise<Observation>>();
  #reads = new Map<string, Promise<Buffer | undefined>>();
  #directories = new Map<string, Promise<readonly string[]>>();
  #closed = false;
  #acquired = false;
  #disposed = false;
  #bytes = 0;
  #files = 0;
  #enumerations = 0;
  #application = new Set<string>();
  #applicationBytes = 0;
  #acquisition: Map<string, ObservationRecipe> | undefined;
  /** Compiler-reported observations awaiting confirmation by the next promotion. */
  #marked: Set<string> | undefined;
  #reporting = false;
  #root: string;
  #version = 0;
  #inputs: readonly CapturedInput[] | undefined;
  #signal: AbortSignal | undefined;
  constructor(root: string, readonly limits: AcquisitionLimits, readonly deadline: number, signal?: AbortSignal) {
    this.#root = root;
    this.#signal = signal;
  }
  /** The acquiring operation's signal, until the acquisition finishes. */
  get signal(): AbortSignal | undefined { return this.#signal; }
  get root(): string { return this.#root; }
  /** Labels are relative to the root, so every recorded input is relabelled. */
  set root(root: string) {
    if (root === this.#root) return;
    this.#root = root;
    for (const entry of this.#observations.values()) entry.input = undefined;
    this.#changed();
  }
  /** Advances with every change to what `inputs` reports; evidence and a cache key, not an identity. */
  get version(): number { return this.#version; }
  /**
   * The one place a change to the observation table becomes visible. Adding,
   * forgetting or clearing observations, relabelling, and every field
   * `inputs` reads pass here: the list is dropped and the version advances.
   */
  #changed(): void {
    this.#version++;
    this.#inputs = undefined;
  }
  #assign<K extends Mutable>(entry: Observation, field: K, value: Observation[K]): void {
    if (entry[field] === value) return;
    entry[field] = value;
    entry.sha256 = undefined; entry.input = undefined;
    this.#changed();
  }
  /** The hash `inputs` reports for one observation, computed once per mutation. */
  #hash(entry: Observation): string {
    return entry.sha256 ??= hash(entry.bytes ?? JSON.stringify([entry.signature, entry.link, entry.entries, entry.exactName]));
  }
  check(): void {
    if (this.#signal?.aborted) throw new Cancelled();
    if (this.#disposed) throw new AcquisitionError('read-failure', this.root, 'Input view is disposed');
    if (!this.#acquired && performance.now() >= this.deadline) throw new AcquisitionError('resource-limit', this.root, 'Acquisition deadline exceeded');
  }
  /**
   * A retained capture outlives the operation that acquired it. It releases
   * that operation's signal, so a later abort of the finished operation never
   * cancels another; each later operation checks its own signal.
   */
  finishAcquisition(): void { this.#acquired = true; this.#signal = undefined; }
  /** The observer keeps acquisition reads separate from compiler callbacks. */
  retainAcquisition(): void { this.#acquisition = new Map(this.observations().map(entry => [entry.path, entry])); }
  async reported<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#reporting;
    this.#reporting = true;
    try { return await operation(); } finally { this.#reporting = previous; }
  }
  #retain(path: string, fields: Partial<Omit<ObservationRecipe, 'path'>> = {}): void {
    if (!this.#acquisition || this.#reporting) return;
    const previous = this.#acquisition.get(path) ?? { path, role: 'dependency', read: false, directory: false, exact: false };
    this.#acquisition.set(path, { ...previous, ...fields });
  }
  /** Retire the preceding compiler input set without rescanning the inventory.
   * A shared path is restored to its acquisition recipe, including probe-only
   * paths that the compiler had subsequently read or enumerated. */
  async retireReported(): Promise<void> {
    this.#marked = undefined;
    if (!this.#acquisition) return;
    for (const entry of this.observations()) {
      if (!this.#reportedOnly(entry)) continue;
      await this.#retire(entry.path);
    }
  }
  /**
   * Mark every compiler-reported observation that holds no read bytes: an
   * existence probe, an absence or a listing. Read bytes stay as they are. The
   * next `retireUnconfirmed` releases each mark that `confirm` did not clear.
   */
  markReported(): void {
    if (!this.#acquisition) return;
    this.#marked = new Set(this.observations().filter(entry => !entry.read && this.#reportedOnly(entry)).map(entry => entry.path));
  }
  /** A compiler report of a marked path keeps it, unless the path holds a listing the report no longer makes. */
  async confirm(path: string, shape: 'file' | 'directory' | 'absent' | 'probe'): Promise<void> {
    if (!this.#marked?.delete(path)) return;
    const entry = this.#observations.get(path);
    if (entry?.entries !== undefined && !this.#acquisition?.get(path)?.directory && shape !== 'directory') await this.#retire(path);
  }
  /** Release every marked observation no compiler report confirmed. */
  async retireUnconfirmed(): Promise<void> {
    const marked = this.#marked;
    this.#marked = undefined;
    for (const path of marked ?? []) if (this.#observations.has(path)) await this.#retire(path);
  }
  /** Whether an observation differs from its acquisition recipe, so a compiler report added it. */
  #reportedOnly(entry: ObservationRecipe): boolean {
    const retained = this.#acquisition?.get(entry.path);
    return !retained || JSON.stringify(retained) !== JSON.stringify(entry);
  }
  async #retire(path: string): Promise<void> {
    const retained = this.#acquisition?.get(path);
    await this.#settle(path);
    this.#forget(path);
    if (retained) await this.replay([retained]);
  }
  path(path: string): string { return resolve(this.root, path); }
  label(path: string): string {
    return within(this.root, path) ? relative(this.root, path) || '.'
      : `external:${hash(dirname(path)).slice(0, 16)}/${basename(path)}`;
  }
  #admit(bytes: number, path: string): void {
    // Reserve transfer/decoded copies as well as retained original bytes.
    if ((this.#bytes + bytes) * 4 > this.limits.maxInputBytes) {
      throw new AcquisitionError('resource-limit', path, 'Captured and in-flight input byte limit exceeded');
    }
    this.#bytes += bytes;
  }
  async #disk(path: string): Promise<Observation> {
    try {
      const stat = await lstat(path);
      const kind: Kind = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
      let canonical: string | undefined;
      try { canonical = await realpath(path); } catch (error) { if (!missing(error)) throw error; }
      return { path, kind, canonical, role: kind === 'directory' ? 'directory' : 'dependency',
        // A kind/existence lookup does not depend on directory membership.
        // Enumerated membership is captured and validated separately below.
        signature: JSON.stringify(kind === 'directory' ? [kind, stat.dev, stat.ino, stat.mode, canonical]
          : [kind, stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs, canonical]),
        ...(kind === 'symlink' ? { link: await readlink(path) } : {}) };
    } catch (error) {
      if (missing(error)) return { path, kind: 'absent', canonical: undefined, signature: 'absent', role: 'absent' };
      throw new AcquisitionError('read-failure', path, `Cannot observe input: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async observe(input: string): Promise<Observation> {
    this.check();
    const path = this.path(input);
    this.#retain(path);
    const old = this.#observations.get(path);
    if (old) return old;
    const pending = this.#pending.get(path);
    if (pending) return pending;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot observe a new input after sealing');
    if (this.#observations.size + this.#pending.size >= this.limits.maxFiles * 8) {
      throw new AcquisitionError('resource-limit', path, 'Filesystem observation limit exceeded');
    }
    const operation = (async () => {
      try {
        const observation = await this.#disk(path);
        this.check();
        if (observation.kind === 'file' && ++this.#files > this.limits.maxFiles) {
          throw new AcquisitionError('resource-limit', path, 'Captured file limit exceeded');
        }
        this.#admit(Buffer.byteLength(path) + Buffer.byteLength(observation.signature), path);
        this.#observations.set(path, observation);
        this.#changed();
        return observation;
      } finally { this.#pending.delete(path); }
    })();
    this.#pending.set(path, operation);
    return operation;
  }
  /** A root climb observes only the named marker, not unrelated ancestor entries. */
  async hasExactEntry(path: string): Promise<boolean> {
    const entry = await this.observe(path);
    if (entry.kind === 'absent') return false;
    this.#retain(entry.path, { exact: true });
    if (entry.exactName !== undefined) return entry.exactName;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot capture an exact name after sealing');
    this.#assign(entry, 'exactName', (await readdir(dirname(entry.path))).includes(basename(entry.path)));
    return entry.exactName!;
  }
  async kind(path: string): Promise<Kind> { return (await this.observe(path)).kind; }
  async #target(path: string): Promise<Observation> {
    const entry = await this.observe(path);
    if (entry.kind === 'symlink' && entry.canonical) return this.observe(entry.canonical);
    return entry;
  }
  async fileExists(path: string): Promise<boolean> { return (await this.#target(path)).kind === 'file'; }
  async directoryExists(path: string): Promise<boolean> { return (await this.#target(path)).kind === 'directory'; }
  async realPath(path: string): Promise<string | undefined> { return (await this.observe(path)).canonical; }
  async bytes(path: string, role: Role = 'dependency'): Promise<Buffer | undefined> {
    const entry = await this.#target(path);
    if (entry.kind !== 'file') return undefined;
    const acquiredRole = this.#acquisition?.get(entry.path)?.role;
    this.#retain(entry.path, { read: true, role: role === 'dependency' && acquiredRole ? acquiredRole : role });
    if (role !== 'dependency' || entry.role === 'dependency') this.#assign(entry, 'role', role);
    if (entry.bytes) return entry.bytes;
    const old = this.#reads.get(entry.path);
    if (old) return old;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot capture new bytes after sealing');
    const operation = (async () => {
      // Forget the pending read however it ends, a failed open included, so a later read retries the disk.
      try {
        const handle = await open(entry.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => { throw new AcquisitionError('read-failure', entry.path, `Cannot read input: ${String(error)}`); });
        try {
          const stat = await handle.stat();
          if (!stat.isFile()) throw new AcquisitionError('changed-input', path, 'File kind changed before capture');
          if (stat.size > this.limits.maxFileBytes) throw new AcquisitionError('resource-limit', path, 'Individual file byte limit exceeded');
          this.#admit(stat.size, path);
          // Read only the admitted size; detect growth without unbounded readFile allocation.
          const buffer = Buffer.alloc(stat.size);
          let offset = 0;
          while (offset < buffer.length) {
            this.check();
            const read = await handle.read(buffer, offset, buffer.length - offset, offset);
            if (!read.bytesRead) break;
            offset += read.bytesRead;
          }
          const extra = await handle.read(Buffer.alloc(1), 0, 1, offset);
          if (offset !== buffer.length || extra.bytesRead || (await this.#disk(entry.path)).signature !== entry.signature) {
            throw new AcquisitionError('changed-input', path, 'File changed while capturing bytes');
          }
          this.check();
          this.#assign(entry, 'bytes', buffer);
          return buffer;
        } finally { await handle.close(); }
      } finally { this.#reads.delete(entry.path); }
    })();
    this.#reads.set(entry.path, operation);
    return operation;
  }
  async readFile(path: string, role: Role = 'dependency'): Promise<string | undefined> {
    const bytes = await this.bytes(path, role);
    if (!bytes) return undefined;
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new AcquisitionError('read-failure', path, 'Input is not valid UTF-8'); }
  }
  async readDirectory(path: string): Promise<readonly string[]> {
    const entry = await this.#target(path);
    if (entry.kind !== 'directory') return [];
    this.#retain(entry.path, { directory: true, role: 'directory' });
    if (entry.entries) return entry.entries;
    const old = this.#directories.get(entry.path);
    if (old) return old;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot enumerate a new directory after sealing');
    const operation = (async () => {
      try {
        const entries: string[] = [];
        this.#enumerations++;
        const directory = await opendir(entry.path);
        for await (const child of directory) {
          this.check();
          // A reserved generated name never joins a recorded listing: a
          // directory's captured entries and identity stay insensitive to
          // generated churn, so a directory whose only change is a `.ramify`
          // sibling appearing or disappearing never reports as changed.
          if (isRamifyGeneratedSegment(child.name)) continue;
          const childPath = join(entry.path, child.name);
          this.#admit(Buffer.byteLength(childPath) * 2 + 4, path);
          entries.push(childPath);
        }
        entries.sort(byteOrder);
        this.#assign(entry, 'entries', Object.freeze(entries));
        return entry.entries!;
      } finally { this.#directories.delete(entry.path); }
    })();
    this.#directories.set(entry.path, operation);
    return operation;
  }
  async application(path: string, role: 'source' | 'resource'): Promise<{ sha256: string; bytes: number }> {
    const bytes = await this.bytes(path, role);
    if (!bytes) throw new AcquisitionError('changed-input', path, 'Inventoried application file disappeared');
    if (!this.#application.has(path)) {
      if (this.#application.size >= this.limits.maxApplicationFiles || this.#applicationBytes + bytes.length > this.limits.maxApplicationBytes) {
        throw new AcquisitionError('resource-limit', path, 'Owned application input limit exceeded');
      }
      this.#application.add(path);
      this.#applicationBytes += bytes.length;
    }
    const entry = this.#observations.get(this.path(path));
    const target = entry?.kind === 'symlink' && entry.canonical ? this.#observations.get(entry.canonical) : entry;
    return { sha256: target?.bytes === bytes ? this.#hash(target) : hash(bytes), bytes: bytes.length };
  }
  /** Private replay recipe retains absolute addresses, never filesystem handles. */
  observations(): readonly { path: string; role: Role; read: boolean; directory: boolean; exact: boolean }[] {
    return [...this.#observations.values()].map(entry => ({ path: entry.path, role: entry.role,
      read: entry.bytes !== undefined, directory: entry.entries !== undefined, exact: entry.exactName !== undefined }));
  }
  async replay(observations: ReturnType<Capture['observations']>): Promise<void> {
    for (const entry of observations) {
      await this.observe(entry.path);
      if (entry.exact) await this.hasExactEntry(entry.path);
      if (entry.read) await this.readFile(entry.path, entry.role);
      if (entry.directory) await this.readDirectory(entry.path);
    }
  }
  /**
   * The sorted observed inputs. The list is kept until the next mutation and
   * each entry until its observation changes, so an unchanged table costs no
   * hashing, labelling or sorting.
   */
  get inputs(): readonly CapturedInput[] {
    if (this.#inputs) return this.#inputs;
    const inputs = [...this.#observations.values()].map(entry => entry.input ??= freeze({ path: this.label(entry.path), role: entry.role,
      sha256: this.#hash(entry), bytes: entry.bytes?.length ?? 0 }));
    this.#inputs = freeze(inputs.sort((a, b) => byteOrder(a.path, b.path)));
    return this.#inputs;
  }
  /**
   * What every recorded query answered: kind, canonical path, exact name,
   * enumerated members and read bytes. Stat metadata such as size and times is
   * left out, so an edited file that was only probed answers the same.
   */
  get answers(): string {
    const entries = [...this.#observations.values()].sort((a, b) => byteOrder(a.path, b.path));
    return hash(JSON.stringify(entries.map(entry => [entry.path, entry.kind, entry.canonical ?? null, entry.exactName ?? null,
      entry.entries ?? null, entry.bytes === undefined ? null : this.#hash(entry)])));
  }
  /** Enumerations actually performed; a cached listing costs none. */
  get enumerations(): number { return this.#enumerations; }
  /** What was recorded about one path, without re-reading it. */
  recorded(input: string): { path: string; kind: Kind; role: Role; read: boolean; directory: boolean; exact: boolean; entries: readonly string[] | undefined } | undefined {
    const entry = this.#observations.get(this.path(input));
    if (!entry) return undefined;
    return { path: entry.path, kind: entry.kind, role: entry.role, read: entry.bytes !== undefined,
      directory: entry.entries !== undefined, exact: entry.exactName !== undefined, entries: entry.entries };
  }
  digest(input: string): string | undefined {
    const entry = this.#observations.get(this.path(input));
    return entry?.bytes === undefined ? undefined : this.#hash(entry);
  }
  async #settle(path: string): Promise<void> {
    await Promise.allSettled([this.#pending.get(path), this.#reads.get(path), this.#directories.get(path)]);
  }
  /** Release one observation and its reserved bytes so it can be observed again. */
  #forget(path: string): Observation | undefined {
    const old = this.#observations.get(path);
    if (!old) return undefined;
    this.#observations.delete(path);
    this.#changed();
    if (old.kind === 'file') this.#files--;
    this.#bytes -= Buffer.byteLength(path) + Buffer.byteLength(old.signature) + (old.bytes?.length ?? 0)
      + (old.entries?.reduce((total, entry) => total + Buffer.byteLength(entry) * 2 + 4, 0) ?? 0);
    if (this.#application.delete(path)) this.#applicationBytes -= old.bytes?.length ?? 0;
    return old;
  }
  async forget(input: string): Promise<void> {
    const path = this.path(input);
    await this.#settle(path);
    this.#forget(path);
    if (!this.#reporting) this.#acquisition?.delete(path);
  }
  /** Re-observe one input in place, repeating exactly the reads made of it. */
  async refresh(input: string): Promise<void> {
    const path = this.path(input);
    await this.#settle(path);
    const old = this.#forget(path);
    if (!old) { await this.observe(path); return; }
    // A link's bytes live on its resolved target; both records must move.
    if (old.kind === 'symlink' && old.canonical) { await this.#settle(old.canonical); this.#forget(old.canonical); }
    const application = this.#application.has(path);
    const observation = await this.observe(path);
    if (old.exactName !== undefined) await this.hasExactEntry(path);
    if (observation.kind === 'absent') return;
    // Re-observation reads bytes; decoding belongs to the caller that needs text.
    if (old.bytes !== undefined) {
      if (application && (old.role === 'source' || old.role === 'resource')) await this.application(path, old.role);
      else await this.bytes(path, old.role);
    }
    if (old.entries !== undefined) await this.readDirectory(path);
  }
  /** Validate without sealing so a later compiler stage can add its first reads. */
  async validate(): Promise<readonly string[]> {
    return (await this.changes()).map(change => this.label(change.path)).sort(byteOrder);
  }
  /**
   * Stat every observed path and report the ones whose recorded state moved.
   * A caller's signal stops the comparison between paths and between hashed chunks.
   */
  async changes(signal?: AbortSignal): Promise<readonly { path: string; kind: 'changed' | 'created' | 'deleted' }[]> {
    await Promise.all([...this.#pending.values(), ...this.#reads.values(), ...this.#directories.values()]);
    const check = (): void => { this.check(); if (signal?.aborted) throw new Cancelled(); };
    const changed: { path: string; kind: 'changed' | 'created' | 'deleted' }[] = [];
    for (const entry of this.#observations.values()) {
      check();
      const current = await this.#disk(entry.path);
      let different = current.signature !== entry.signature || current.link !== entry.link;
      if (!different && entry.exactName !== undefined) {
        different = (await readdir(dirname(entry.path))).includes(basename(entry.path)) !== entry.exactName;
      }
      if (!different && entry.entries) {
        // A recorded listing never held a reserved generated name
        // (readDirectory omits it); the freshly read listing must be
        // filtered the same way, so a `.ramify` sibling appearing or
        // disappearing alone never reports this directory as changed.
        const names = (await readdir(entry.path)).filter(name => !isRamifyGeneratedSegment(name))
          .sort(byteOrder).map(name => join(entry.path, name));
        different = JSON.stringify(names) !== JSON.stringify(entry.entries);
      }
      if (!different && entry.bytes) {
        const handle = await open(entry.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const digest = await hashFile(handle, entry.bytes.length, check);
          different = digest !== hash(entry.bytes);
        } finally { await handle.close(); }
      }
      if (different) {
        changed.push({ path: entry.path, kind: entry.kind === 'absent' ? 'created'
          : current.kind === 'absent' ? 'deleted' : 'changed' });
      }
    }
    return changed.sort((a, b) => byteOrder(a.path, b.path));
  }
  async seal(): Promise<{ readonly status: 'coherent'; readonly inputs: readonly CapturedInput[] } | { readonly status: 'changed'; readonly paths: readonly string[] }> {
    this.check();
    this.#closed = true;
    const changed = await this.validate();
    return freeze(changed.length ? { status: 'changed' as const, paths: changed } : { status: 'coherent' as const, inputs: this.inputs });
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await Promise.allSettled([...this.#pending.values(), ...this.#reads.values(), ...this.#directories.values()]);
    this.#observations.clear(); this.#changed(); this.#pending.clear(); this.#reads.clear(); this.#directories.clear(); this.#application.clear();
    this.#acquisition?.clear(); this.#marked = undefined;
    this.#bytes = 0;
  }
}

async function hashFile(handle: Awaited<ReturnType<typeof open>>, length: number, check: () => void): Promise<string | undefined> {
  const digest = createHash('sha256');
  const chunk = Buffer.alloc(64 * 1024);
  let offset = 0;
  while (offset <= length) {
    check();
    const read = await handle.read(chunk, 0, Math.min(chunk.length, length + 1 - offset), offset);
    if (!read.bytesRead) return offset === length ? digest.digest('hex') : undefined;
    digest.update(chunk.subarray(0, read.bytesRead)); offset += read.bytesRead;
  }
  return undefined;
}

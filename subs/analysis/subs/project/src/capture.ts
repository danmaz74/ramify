import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, readlink, realpath, readdir, opendir, open } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { AcquisitionLimits, CapturedInput } from './interfaces/project.js';
import { AcquisitionError, Cancelled, byteOrder, freeze, hash, missing, within } from './data.js';

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
}

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
  #application = new Set<string>();
  #applicationBytes = 0;
  root: string;
  constructor(root: string, readonly limits: AcquisitionLimits, readonly deadline: number, readonly signal?: AbortSignal) {
    this.root = root;
  }
  check(): void {
    if (this.signal?.aborted) throw new Cancelled();
    if (this.#disposed) throw new AcquisitionError('read-failure', this.root, 'Input view is disposed');
    if (!this.#acquired && performance.now() >= this.deadline) throw new AcquisitionError('resource-limit', this.root, 'Acquisition deadline exceeded');
  }
  finishAcquisition(): void { this.#acquired = true; }
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
    if (entry.exactName !== undefined) return entry.exactName;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot capture an exact name after sealing');
    entry.exactName = (await readdir(dirname(entry.path))).includes(basename(entry.path));
    return entry.exactName;
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
    if (role !== 'dependency' || entry.role === 'dependency') entry.role = role;
    if (entry.bytes) return entry.bytes;
    const old = this.#reads.get(entry.path);
    if (old) return old;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot capture new bytes after sealing');
    const operation = (async () => {
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
        entry.bytes = buffer;
        return buffer;
      } finally { await handle.close(); this.#reads.delete(entry.path); }
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
    if (entry.entries) return entry.entries;
    const old = this.#directories.get(entry.path);
    if (old) return old;
    if (this.#closed) throw new AcquisitionError('read-failure', path, 'Cannot enumerate a new directory after sealing');
    const operation = (async () => {
      try {
        const entries: string[] = [];
        const directory = await opendir(entry.path);
        for await (const child of directory) {
          this.check();
          const childPath = join(entry.path, child.name);
          this.#admit(Buffer.byteLength(childPath) * 2 + 4, path);
          entries.push(childPath);
        }
        entries.sort(byteOrder);
        entry.entries = Object.freeze(entries);
        return entry.entries;
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
    return { sha256: hash(bytes), bytes: bytes.length };
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
  get inputs(): readonly CapturedInput[] {
    return freeze([...this.#observations.values()].map(entry => ({ path: this.label(entry.path), role: entry.role,
      sha256: hash(entry.bytes ?? JSON.stringify([entry.signature, entry.link, entry.entries, entry.exactName])), bytes: entry.bytes?.length ?? 0,
    })).sort((a, b) => byteOrder(a.path, b.path)));
  }
  /** Validate without sealing so a later compiler stage can add its first reads. */
  async validate(): Promise<readonly string[]> {
    await Promise.all([...this.#pending.values(), ...this.#reads.values(), ...this.#directories.values()]);
    const changed: string[] = [];
    for (const entry of this.#observations.values()) {
      this.check();
      const current = await this.#disk(entry.path);
      let different = current.signature !== entry.signature || current.link !== entry.link;
      if (!different && entry.exactName !== undefined) {
        different = (await readdir(dirname(entry.path))).includes(basename(entry.path)) !== entry.exactName;
      }
      if (!different && entry.entries) {
        const names = (await readdir(entry.path)).sort(byteOrder).map(name => join(entry.path, name));
        different = JSON.stringify(names) !== JSON.stringify(entry.entries);
      }
      if (!different && entry.bytes) {
        const handle = await open(entry.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const digest = await hashFile(handle, entry.bytes.length, () => this.check());
          different = digest !== hash(entry.bytes);
        } finally { await handle.close(); }
      }
      if (different) changed.push(this.label(entry.path));
    }
    return changed.sort(byteOrder);
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
    this.#observations.clear(); this.#pending.clear(); this.#reads.clear(); this.#directories.clear(); this.#application.clear();
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

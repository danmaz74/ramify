import fs from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { ClockPort, WatchBatch, WatchEvent, WatcherHandle, WatcherPort, WatchRegistrations, WatchScope } from '../subs/contexts/src/interfaces/contexts.js';

/** Excluded directories whose own creation, removal or replacement the context observes:
 * declared trees and scratch directories. Nothing beneath any exclusion is delivered, and
 * the own entries of repository, package, output and generated directories are not either. */
const observedRoots: ReadonlySet<string> = new Set(['owned-unwired', 'owned-nested-project', 'external', 'scratch']);
/** Pruned directories a registrations answer lists; `prunedCount` gives the total. */
const listedPruned = 20;
const maximumPaths = 10_000;
const batchMs = 100;
const overflowCodes = new Set(['ENOSPC', 'EMFILE', 'ENFILE', 'ENOBUFS', 'ERR_FS_WATCHER_QUEUE_OVERFLOW']);

interface DirectoryWatch {
  readonly identity: string;
  close(): Promise<void>;
}

/** Recursive coverage through one handle per registered directory, without following
 * symlinks. The scope's exclusions prune registration: no directory an exclusion holds,
 * and nothing beneath one, is registered, so registrations follow the directories outside
 * every exclusion and each classification costs the path's depth.
 * Events are hints: rename never guesses creation/deletion, and unknown paths,
 * overflow or watcher failure require the consumer to reconcile conservatively. */
export function createFilesystemWatcher(clock: Pick<ClockPort, 'now'> = { now: Date.now }): WatcherPort {
  return { watch: (root, scope, listener) => watchTree(root, scope, listener, clock) };
}

const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

async function watchTree(root: string, scope: WatchScope, listener: (events: readonly WatchEvent[], batch: WatchBatch) => void,
  clock: Pick<ClockPort, 'now'>): Promise<WatcherHandle> {
  const canonicalRoot = await realpath(root);
  let current = scope;
  let deliver: typeof listener | undefined = listener;
  const directories = new Map<string, DirectoryWatch>();
  /** The excluded child directories of each registered directory, none of them registered. */
  const pruned = new Map<string, Set<string>>();
  const projectPath = (path: string): string => relative(canonicalRoot, path).split(sep).join('/') || '.';
  const pending = new Map<string, WatchEvent['kind']>();
  const signals = new Set<'overflow' | 'error'>();
  let closed = false;
  let starting = true;
  let dirty = false;
  let rescanAll = true;
  const changedDirectories = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Receipt of the first event since the last flush. */
  let receivedAt: number | undefined;
  let scanning: Promise<void> | undefined;
  let closing: Promise<void> | undefined;

  function enqueue(path: string, kind: WatchEvent['kind']): void {
    if (closed) return;
    receivedAt ??= clock.now();
    if (kind === 'error' || kind === 'overflow') signals.add(kind);
    else if (!signals.has('overflow')) {
      if (!pending.has(path) && pending.size === maximumPaths) {
        pending.clear();
        signals.add('overflow');
      } else if (pending.get(path) !== 'renamed') pending.set(path, kind);
    }
    // A fixed batching window also bounds latency during continuous edits.
    timer ??= setTimeout(flush, batchMs);
  }

  function failure(error: unknown): void {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    enqueue('', 'error');
    if (typeof code === 'string' && overflowCodes.has(code)) enqueue('', 'overflow');
  }

  function flush(): void {
    timer = undefined;
    if (closed) return;
    if (dirty && !starting && !scanning) {
      scanning = refresh().catch(failure).finally(() => {
        scanning = undefined;
        if (dirty && !closed) timer ??= setTimeout(flush, batchMs);
      });
    }
    const events: WatchEvent[] = [
      ...[...signals].sort().map(kind => ({ path: '', kind })),
      ...[...pending].sort(([a], [b]) => a.localeCompare(b)).map(([path, kind]) => ({ path, kind })),
    ];
    pending.clear(); signals.clear();
    const received = receivedAt; receivedAt = undefined;
    if (!events.length) return;
    const flushedAt = clock.now();
    deliver?.(Object.freeze(events.map(event => Object.freeze(event))), Object.freeze({ receivedAt: received ?? flushedAt, flushedAt }));
  }

  function attach(directory: string, identity: string): DirectoryWatch {
    const watcher = fs.watch(directory, { persistent: true, encoding: 'utf8' });
    let requestedClose = false;
    let resolveClosed: () => void;
    const done = new Promise<void>(resolve => { resolveClosed = resolve; });
    const entry: DirectoryWatch = {
      identity,
      close() { requestedClose = true; watcher.close(); return done; },
    };
    const changed = (kind: string, filename: string | Buffer | null): void => {
      if (closed || requestedClose) return;
      if (filename === null) { dirty = true; rescanAll = true; enqueue('', 'overflow'); return; }
      const name = filename.toString();
      const path = relative(canonicalRoot, join(directory, name));
      if (isAbsolute(name) || !name || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
        dirty = true; rescanAll = true; enqueue('', 'overflow'); return;
      }
      const exclusion = current.excluded(path.split(sep).join('/'));
      if (exclusion) {
        // Only an excluded directory's own entry can be meant: a rename re-lists the directory
        // holding it, and a declared tree's or scratch directory's own change is delivered.
        if (exclusion.directory !== path.split(sep).join('/')) return;
        if (kind === 'rename') { dirty = true; changedDirectories.add(directory); timer ??= setTimeout(flush, batchMs); }
        if (!observedRoots.has(exclusion.kind)) return;
      }
      if (kind === 'rename') { dirty = true; changedDirectories.add(directory); }
      enqueue(path, kind === 'rename' ? 'renamed' : 'changed');
    };
    const failed = (error: Error): void => { if (!requestedClose) { dirty = true; rescanAll = true; failure(error); } };
    watcher.on('change', changed);
    watcher.on('error', failed);
    watcher.once('close', () => {
      watcher.removeListener('change', changed);
      watcher.removeListener('error', failed);
      if (directories.get(directory) === entry) directories.delete(directory);
      if (!requestedClose) enqueue('', 'error');
      resolveClosed();
    });
    return entry;
  }

  async function visit(directory: string, recursive: boolean): Promise<void> {
    if (closed) return;
    let stat;
    try { stat = await lstat(directory); }
    catch (error) {
      if (directory !== canonicalRoot && error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await removeTree(directory); return;
      }
      throw error;
    }
    if (closed) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      if (directory === canonicalRoot) throw new Error('Watcher root is not a directory');
      await removeTree(directory); return;
    }
    const identity = `${stat.dev}:${stat.ino}`;
    const previous = directories.get(directory);
    if (previous && previous.identity !== identity) { await removeTree(directory); recursive = true; }
    if (closed) return;
    if (!directories.has(directory)) { directories.set(directory, attach(directory, identity)); recursive = true; }
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (directory !== canonicalRoot && error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await removeTree(directory); return;
      }
      throw error;
    }
    const children = new Set<string>(), excluded = new Set<string>();
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const path = join(directory, entry.name);
        if (current.excluded(projectPath(path))) { excluded.add(path); continue; }
        children.add(path);
        // Re-stat direct children on rename so replacement of an existing
        // directory cannot keep a watcher attached to its old inode.
        if (recursive || !directories.has(path)) await visit(path, recursive);
        else {
          const child = await lstat(path).catch(() => null);
          if (!child || `${child.dev}:${child.ino}` !== directories.get(path)!.identity) await visit(path, true);
        }
      }
    }
    const removed = new Set<string>();
    for (const path of directories.keys()) {
      if (path !== directory && path.startsWith(`${directory}${sep}`)) {
        const first = join(directory, relative(directory, path).split(sep)[0]);
        if (!children.has(first)) removed.add(first);
      }
    }
    for (const first of removed) await removeTree(first);
    if (excluded.size) pruned.set(directory, excluded); else pruned.delete(directory);
  }

  async function refresh(): Promise<void> {
    // One bounded pass per batching window. Known rename events only inspect
    // that directory; unchanged descendants retain their existing handles.
    const full = rescanAll;
    rescanAll = false; dirty = false;
    const targets = full ? [canonicalRoot] : [...changedDirectories];
    changedDirectories.clear();
    for (const directory of targets) await visit(directory, full);
  }

  async function removeTree(directory: string): Promise<void> {
    for (const [path, handle] of directories) {
      if (path === directory || path.startsWith(`${directory}${sep}`)) { pruned.delete(path); await handle.close(); }
    }
  }

  /** Apply `current` to the registrations: those an exclusion now holds end, their roots
   * becoming pruned entries, and pruned directories no exclusion holds are registered, whose
   * number it returns. */
  async function reapply(): Promise<number> {
    let added = 0;
    for (const directory of [...directories.keys()].sort(byteOrder)) {
      if (closed) return added;
      if (directory === canonicalRoot || !directories.has(directory)) continue;
      const path = projectPath(directory), exclusion = current.excluded(path);
      if (!exclusion) continue;
      await removeTree(directory);
      if (exclusion.directory !== path) continue;
      const parent = dirname(directory);
      if (directories.has(parent)) pruned.set(parent, new Set([...pruned.get(parent) ?? [], directory]));
    }
    for (const [parent, children] of [...pruned]) {
      for (const child of [...children]) {
        if (closed) return added;
        if (current.excluded(projectPath(child))) continue;
        children.delete(child);
        if (!directories.has(parent)) continue;
        const known = directories.size;
        await visit(child, true);
        added += Math.max(0, directories.size - known);
      }
      if (!children.size && pruned.get(parent) === children) pruned.delete(parent);
    }
    return added;
  }

  async function reconfigure(next: WatchScope): Promise<number> {
    if (closed) return 0;
    current = next;
    while (scanning) await scanning;
    if (closed) return 0;
    let added = 0;
    scanning = reapply().then(count => { added = count; }, failure).finally(() => {
      scanning = undefined;
      if (dirty && !closed) timer ??= setTimeout(flush, batchMs);
    });
    await scanning;
    return added;
  }

  function registrations(): WatchRegistrations {
    const all = [...pruned.values()].flatMap(children => [...children].map(projectPath)).sort(byteOrder);
    return { sequence: current.sequence, directories: directories.size, pruned: all.slice(0, listedPruned), prunedCount: all.length };
  }

  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    deliver = undefined;
    clearTimeout(timer); timer = undefined;
    pending.clear(); signals.clear(); changedDirectories.clear();
    closing = (async () => {
      while (scanning) await scanning;
      await Promise.all([...directories.values()].map(handle => handle.close()));
      directories.clear(); pruned.clear();
    })();
    return closing;
  }

  try {
    await refresh();
    starting = false;
    if (dirty && !closed) timer ??= setTimeout(flush, batchMs);
    return { reconfigure, registrations, close };
  } catch (error) {
    await close();
    throw error;
  }
}

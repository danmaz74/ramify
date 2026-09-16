import fs from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { ClockPort, WatchBatch, WatchEvent, WatcherHandle, WatcherPort } from '../subs/contexts/src/interfaces/contexts.js';
// Cross-subtree relay pending (coordinator): `isRamifyGeneratedPath` is owned
// by `analysis/project` and reaches `daemon` only through the root's and
// `analysis`'s named `expose-sub` relay lists, not yet amended for this name.
// This relative import follows the same physical path the daemon's other
// direct `../../analysis/...` imports already use (see connection.ts,
// service.ts) and compiles today; it is not yet a legal Ramify import until
// those two relay lines are extended.
import { isRamifyGeneratedPath } from '../../analysis/subs/project/src/generated-path.js';

const excluded = new Set(['node_modules', '.git', 'dist', '.reference-work']);
const maximumPaths = 10_000;
const batchMs = 100;
const overflowCodes = new Set(['ENOSPC', 'EMFILE', 'ENFILE', 'ENOBUFS', 'ERR_FS_WATCHER_QUEUE_OVERFLOW']);

interface DirectoryWatch {
  readonly identity: string;
  close(): Promise<void>;
}

/** Recursive coverage through pruned directory handles, without following symlinks.
 * Events are hints: rename never guesses creation/deletion, and unknown paths,
 * overflow or watcher failure require the consumer to reconcile conservatively. */
export function createFilesystemWatcher(clock: Pick<ClockPort, 'now'> = { now: Date.now }): WatcherPort {
  return { watch: (root, listener) => watchTree(root, listener, clock) };
}

async function watchTree(root: string, listener: (events: readonly WatchEvent[], batch: WatchBatch) => void,
  clock: Pick<ClockPort, 'now'>): Promise<WatcherHandle> {
  const canonicalRoot = await realpath(root);
  let deliver: typeof listener | undefined = listener;
  const directories = new Map<string, DirectoryWatch>();
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
      if (path.split(sep).some(part => excluded.has(part) || isRamifyGeneratedPath(part))) return;
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

  async function refresh(): Promise<void> {
    // One bounded pass per batching window. Known rename events only inspect
    // that directory; unchanged descendants retain their existing handles.
    const full = rescanAll;
    rescanAll = false; dirty = false;
    const targets = full ? [canonicalRoot] : [...changedDirectories];
    changedDirectories.clear();
    async function removeTree(directory: string): Promise<void> {
      for (const [path, handle] of directories) {
        if (path === directory || path.startsWith(`${directory}${sep}`)) await handle.close();
      }
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
      const children = new Set<string>();
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink() && !excluded.has(entry.name) && !isRamifyGeneratedPath(entry.name)) {
          const path = join(directory, entry.name); children.add(path);
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
    }
    for (const directory of targets) await visit(directory, full);
  }

  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    deliver = undefined;
    clearTimeout(timer); timer = undefined;
    pending.clear(); signals.clear(); changedDirectories.clear();
    closing = (async () => {
      await scanning;
      await Promise.all([...directories.values()].map(handle => handle.close()));
      directories.clear();
    })();
    return closing;
  }

  try {
    await refresh();
    starting = false;
    if (dirty && !closed) timer ??= setTimeout(flush, batchMs);
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}

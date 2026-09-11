import fs from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { WatchEvent, WatcherHandle, WatcherPort } from '../subs/contexts/src/interfaces/contexts.js';

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
export function createFilesystemWatcher(): WatcherPort {
  return { watch: watchTree };
}

async function watchTree(root: string, listener: (events: readonly WatchEvent[]) => void): Promise<WatcherHandle> {
  const canonicalRoot = await realpath(root);
  let deliver: typeof listener | undefined = listener;
  const directories = new Map<string, DirectoryWatch>();
  const pending = new Map<string, WatchEvent['kind']>();
  const signals = new Set<'overflow' | 'error'>();
  let closed = false;
  let starting = true;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scanning: Promise<void> | undefined;
  let closing: Promise<void> | undefined;

  function enqueue(path: string, kind: WatchEvent['kind']): void {
    if (closed) return;
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
      scanning = refresh().catch(failure).finally(() => { scanning = undefined; });
    }
    const events: WatchEvent[] = [
      ...[...signals].sort().map(kind => ({ path: '', kind })),
      ...[...pending].sort(([a], [b]) => a.localeCompare(b)).map(([path, kind]) => ({ path, kind })),
    ];
    pending.clear(); signals.clear();
    if (events.length) deliver?.(Object.freeze(events.map(event => Object.freeze(event))));
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
      if (filename === null) { dirty = true; enqueue('', 'overflow'); return; }
      const name = filename.toString();
      const path = relative(canonicalRoot, join(directory, name));
      if (isAbsolute(name) || !name || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
        dirty = true; enqueue('', 'overflow'); return;
      }
      if (path.split(sep).some(part => excluded.has(part))) return;
      if (kind === 'rename') dirty = true;
      enqueue(path, kind === 'rename' ? 'renamed' : 'changed');
    };
    const failed = (error: Error): void => { if (!requestedClose) failure(error); };
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
    do {
      dirty = false;
      const seen = new Set<string>();
      async function visit(directory: string): Promise<void> {
        if (closed) return;
        let stat;
        try { stat = await lstat(directory); }
        catch (error) {
          if (directory !== canonicalRoot && error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
          throw error;
        }
        if (closed) return;
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          if (directory === canonicalRoot) throw new Error('Watcher root is not a directory');
          return;
        }
        seen.add(directory);
        const identity = `${stat.dev}:${stat.ino}`;
        const previous = directories.get(directory);
        if (previous && previous.identity !== identity) await previous.close();
        if (closed) return;
        if (!directories.has(directory)) directories.set(directory, attach(directory, identity));
        let entries;
        try { entries = await readdir(directory, { withFileTypes: true }); }
        catch (error) {
          if (directory !== canonicalRoot && error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            seen.delete(directory); return;
          }
          throw error;
        }
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.isSymbolicLink() && !excluded.has(entry.name)) await visit(join(directory, entry.name));
        }
      }
      await visit(canonicalRoot);
      for (const [directory, handle] of directories) if (!seen.has(directory)) await handle.close();
    } while (dirty && !closed);
  }

  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    deliver = undefined;
    clearTimeout(timer); timer = undefined;
    pending.clear(); signals.clear();
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
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}

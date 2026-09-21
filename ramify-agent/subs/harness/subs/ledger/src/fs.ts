import { mkdir, open, readFile, rename, rm, stat, truncate } from 'node:fs/promises';

/** How a handle is opened: append, create-exclusive, or read. */
export type LedgerOpenFlags = 'a' | 'wx' | 'r';

/** An open file, or an open directory when only `sync` and `close` are used. */
export interface LedgerFileHandle {
  /** Writes every byte of `data` at the handle's position. */
  write(data: Uint8Array): Promise<void>;
  /** Flushes the file's data. */
  datasync(): Promise<void>;
  /** Flushes the file's data and metadata; on a directory, its entries. */
  sync(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Every file system operation the ledger performs, as one seam. The ledger
 * writes only through it, so a test can fail any single write, flush, rename
 * or directory sync and observe what a crash at that point leaves behind.
 * The primitives `atomic.ts` and `jsonl.ts` expose are for callers with plain
 * files and keep their own direct access to Node.
 */
export interface LedgerFileSystem {
  open(path: string, flags: LedgerOpenFlags): Promise<LedgerFileHandle>;
  readFile(path: string): Promise<Uint8Array>;
  /** The file's size in bytes, or `null` when it does not exist. */
  size(path: string): Promise<number | null>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Creates the directory and every missing parent. */
  mkdir(path: string): Promise<void>;
  truncate(path: string, length: number): Promise<void>;
}

/** The ledger's file system on Node. */
export const nodeFileSystem: LedgerFileSystem = {
  async open(path, flags) {
    const handle = await open(path, flags);
    return {
      async write(data) {
        let written = 0;
        while (written < data.byteLength) {
          const result = await handle.write(data, written, data.byteLength - written);
          if (result.bytesWritten === 0) throw new Error(`${path}: the write made no progress`);
          written += result.bytesWritten;
        }
      },
      datasync: () => handle.datasync(),
      sync: () => handle.sync(),
      close: () => handle.close(),
    };
  },
  async readFile(path) {
    return await readFile(path);
  },
  async size(path) {
    try {
      return (await stat(path)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  rename: (from, to) => rename(from, to),
  remove: (path) => rm(path, { force: true }),
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  truncate: (path, length) => truncate(path, length),
};

/**
 * Flushes a directory's entries, so that a new name in it survives a crash.
 * A file system that refuses to sync a directory makes the entry as durable
 * as it can, which is not an error here.
 */
export async function syncDirectoryThrough(fs: LedgerFileSystem, path: string): Promise<void> {
  let handle: LedgerFileHandle;
  try {
    handle = await fs.open(path, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EISDIR') return;
    throw error;
  }
  try {
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EINVAL' && code !== 'EISDIR' && code !== 'EBADF') throw error;
  } finally {
    await handle.close();
  }
}

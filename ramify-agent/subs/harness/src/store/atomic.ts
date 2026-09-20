import { randomBytes } from 'node:crypto';
import { link, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Writes `content` to `path` so that a reader sees either the old file or the
 * whole new one: the content goes to a temporary file in the same directory,
 * is flushed, and then replaces `path` by rename.
 */
export async function writeFileAtomic(path: string, content: string | Uint8Array): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(content);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** What `writeFileExclusive` found at the target. */
export type ExclusiveWrite = 'created' | 'exists';

/**
 * Writes `content` to `path` only if nothing is there, atomically and never
 * overwriting: the content goes to a flushed temporary file that is then
 * hard-linked to `path`, which fails if `path` exists. A reader sees no file
 * or the whole file. Returns `exists`, leaving the target untouched, when
 * `path` was already present.
 */
export async function writeFileExclusive(path: string, content: string | Uint8Array): Promise<ExclusiveWrite> {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, path);
    await syncDirectory(dirname(path));
    return 'created';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Flushes a directory's entries, so that a new name in it survives a crash. */
export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } catch (error) {
    // Some file systems refuse to sync a directory; the entry is then as durable as they make it.
    if ((error as NodeJS.ErrnoException).code !== 'EINVAL' && (error as NodeJS.ErrnoException).code !== 'EISDIR') throw error;
  } finally {
    await handle.close();
  }
}

import { randomBytes } from 'node:crypto';
import { readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { writeFileExclusive } from '../../subs/ledger/src/atomic.js';
import { ensureStateDirectory } from './state-directory.js';

/** The project lock's path, relative to the project root. */
export const lockPath = 'plans/.harness/lock';

const lockRecordSchema = z.object({
  pid: z.int().positive(),
  /** When the owning process started. */
  startedAt: z.iso.datetime(),
  /** The owning process's start time in the kernel's clock ticks, where the system reports it; it tells a reused process ID apart. */
  processStart: z.string().nullable(),
  /** Unique to one acquisition. */
  token: z.string().min(1),
}).strict();
export type LockRecord = z.infer<typeof lockRecordSchema>;

/** The lock is held by a live process, or cannot be read. */
export class ProjectLockError extends Error {
  constructor(message: string, readonly holder?: LockRecord) {
    super(message);
    this.name = 'ProjectLockError';
  }
}

/** Whether an unknown failure is the harness's project-lock refusal. */
export function isProjectLockError(error: unknown): boolean {
  return error instanceof ProjectLockError;
}

export interface ProjectLock {
  readonly path: string;
  readonly record: LockRecord;
  /** Whether the lock file still holds this acquisition. */
  held(): Promise<boolean>;
  /** Removes the lock file if it still holds this acquisition. */
  release(): Promise<void>;
}

/**
 * Takes the project lock, `plans/.harness/lock`, holding the process ID and
 * start time of this process. A lock whose process is gone, or whose process
 * ID now belongs to a process that started at another time, is taken over.
 * A lock held by a live process is refused with `ProjectLockError`.
 */
export async function acquireProjectLock(projectRoot: string): Promise<ProjectLock> {
  const path = join(projectRoot, lockPath);
  await ensureStateDirectory(dirname(path), { gitignore: true });
  const record: LockRecord = {
    pid: process.pid,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    processStart: await processStartTicks(process.pid),
    token: randomBytes(12).toString('hex'),
  };
  const content = `${JSON.stringify(record)}\n`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await writeFileExclusive(path, content) === 'created') return handle(path, record);
    const existing = await readLock(path);
    if (existing === undefined) continue; // Released meanwhile; try again.
    if (existing === 'unreadable') throw new ProjectLockError(`The project lock ${path} cannot be read; remove it if no harness is running`);
    if (await isAlive(existing)) {
      throw new ProjectLockError(`Another harness (process ${existing.pid}, started ${existing.startedAt}) holds the project lock ${path}`, existing);
    }
    await takeOver(path, existing);
  }
  throw new ProjectLockError(`The project lock ${path} is contended`);
}

function handle(path: string, record: LockRecord): ProjectLock {
  const held = async () => {
    const current = await readLock(path);
    return typeof current === 'object' && current.token === record.token;
  };
  return {
    path,
    record,
    held,
    release: async () => {
      if (await held()) await rm(path, { force: true });
    },
  };
}

/**
 * Moves a dead owner's lock aside. If what was moved is not the lock that
 * was judged dead, another harness took it over first: its lock is put back.
 */
async function takeOver(path: string, dead: LockRecord): Promise<void> {
  const grave = `${path}.${randomBytes(6).toString('hex')}.stale`;
  try {
    await rename(path, grave);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const moved = await readLock(grave);
  if (typeof moved === 'object' && moved.token !== dead.token) {
    await writeFileExclusive(path, `${JSON.stringify(moved)}\n`);
  }
  await rm(grave, { force: true });
}

async function readLock(path: string): Promise<LockRecord | 'unreadable' | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const parsed = lockRecordSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** Whether the lock's owner still runs: its process ID exists and, where known, started when the lock says. */
export async function isAlive(record: LockRecord): Promise<boolean> {
  try {
    process.kill(record.pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
  }
  if (record.processStart === null) return true;
  const current = await processStartTicks(record.pid);
  return current === null || current === record.processStart;
}

/** A process's start time from `/proc/<pid>/stat`, or `null` where the system does not report it. */
async function processStartTicks(pid: number): Promise<string | null> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    // The command name is parenthesized and may contain spaces; fields resume after the last ')'.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

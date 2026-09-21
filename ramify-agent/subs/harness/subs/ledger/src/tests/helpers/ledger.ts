import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { z } from 'zod';
import { nodeFileSystem, type LedgerFileSystem } from '../../fs.js';
import { openLedger, type Ledger, type RecordBody, type Transaction } from '../../ledger.js';

/** The event type the ledger's own tests are generic over. */
export const eventSchema = z.object({ kind: z.string().min(1), step: z.number().int() });
export type TestEvent = z.infer<typeof eventSchema>;

/** A ledger over `directory`, with its log and records where the tests expect them. */
export async function testLedger(
  directory: string,
  fs?: LedgerFileSystem,
): Promise<Ledger<TestEvent>> {
  return await openLedger({
    logPath: join(directory, 'events.jsonl'),
    recordsRoot: join(directory, 'records'),
    eventSchema,
    ...(fs ? { fs } : {}),
  });
}

/** One transaction committing one record. */
export function transaction(step: number, records: readonly RecordBody[] = []): Transaction<TestEvent> {
  return { event: { kind: 'step', step }, records };
}

/** A record body of the shape the tests commit. */
export function record(id: string, revision: number, body: unknown): RecordBody {
  return { path: `${id}/${String(revision).padStart(2, '0')}.json`, id, revision, body };
}

/** Asserts that every record file the log names holds exactly what the log says. */
export async function recordsMatchLog(ledger: Ledger<TestEvent>, recordsRoot: string): Promise<number> {
  const wanted = new Map<string, unknown>();
  for (const entry of ledger.replay()) {
    for (const body of entry.transaction.records) wanted.set(body.path, body.body);
  }
  for (const [path, body] of wanted) {
    expect(await readFile(join(recordsRoot, path), 'utf8')).toBe(`${JSON.stringify(body, null, 2)}\n`);
  }
  return wanted.size;
}

/** The names of the file system operations a crash can interrupt: write, flush, rename, directory sync. */
export type FaultPoint = string;

/**
 * Wraps a file system so that every write, flush, rename and directory sync
 * is announced. `hook` may throw, which is what a crash at that point looks
 * like to the ledger.
 */
export function instrument(
  hook: (point: FaultPoint, index: number) => void,
  base: LedgerFileSystem = nodeFileSystem,
): LedgerFileSystem {
  let index = 0;
  const gate = (point: FaultPoint): void => {
    index += 1;
    hook(point, index);
  };
  return {
    async open(path, flags) {
      const handle = await base.open(path, flags);
      const kind = flags === 'r' ? 'directory' : 'file';
      return {
        async write(data) {
          gate(`write:${path}`);
          await handle.write(data);
        },
        async datasync() {
          gate(`flush:${path}`);
          await handle.datasync();
        },
        async sync() {
          gate(`${kind === 'directory' ? 'directory-sync' : 'flush'}:${path}`);
          await handle.sync();
        },
        close: () => handle.close(),
      };
    },
    readFile: (path) => base.readFile(path),
    size: (path) => base.size(path),
    async rename(from, to) {
      gate(`rename:${to}`);
      await base.rename(from, to);
    },
    remove: (path) => base.remove(path),
    mkdir: (path) => base.mkdir(path),
    truncate: (path, length) => base.truncate(path, length),
  };
}

/** The injected failure, distinguishable from a real one. */
export class InjectedFault extends Error {
  constructor(readonly point: FaultPoint, readonly index: number) {
    super(`injected fault at operation ${index}: ${point}`);
    this.name = 'InjectedFault';
  }
}

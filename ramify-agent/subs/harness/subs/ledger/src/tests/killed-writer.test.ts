import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { recordsMatchLog, testLedger } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const packageRoot = fileURLToPath(new URL('../../../../../../', import.meta.url));
const tsx = join(packageRoot, 'node_modules', '.bin', 'tsx');
const child = fileURLToPath(new URL('./helpers/killed-writer-child.ts', import.meta.url));

/** The transaction shape the child writes, so the parent's own append matches it. */
function writerTransaction(step: number): { event: { kind: string; step: number }; records: Array<{ path: string; id: string; revision: number; body: unknown }> } {
  return {
    event: { kind: 'step', step },
    records: [
      { path: `run/${String(step).padStart(4, '0')}.json`, id: 'run', revision: step, body: { step, filler: 'x'.repeat(4_000) } },
      { path: 'run/latest.json', id: 'run', revision: step, body: { step } },
    ],
  };
}

/** What one kill left behind. */
interface Round {
  readonly version: number;
  readonly appendsSurvived: number;
  readonly killedAfterMilliseconds: number;
  /** Whether the kill left a partial line, which is the case this test exists for. */
  readonly tornLine: boolean;
}

/**
 * Starts a real writer on `path`, kills its whole process group with
 * `SIGKILL` after `delay`, and resolves once it is gone.
 */
async function killAWriter(path: string, delay: number): Promise<void> {
  const writer = spawn(tsx, [child, path], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const errors: string[] = [];
  writer.stderr.on('data', (chunk: Buffer) => errors.push(chunk.toString('utf8')));

  const exited = new Promise<void>((resolve) => writer.once('close', () => resolve()));
  const ready = new Promise<void>((resolve, reject) => {
    let seen = '';
    writer.stdout.on('data', (chunk: Buffer) => {
      seen += chunk.toString('utf8');
      if (seen.includes('\n')) resolve();
    });
    writer.once('close', () => reject(new Error(`the writer exited before it was ready: ${errors.join('')}`)));
    setTimeout(() => reject(new Error('the writer never reported that it was ready')), 30_000).unref();
  });

  await ready;
  await new Promise((resolve) => setTimeout(resolve, delay));
  process.kill(-writer.pid!, 'SIGKILL');
  await exited;
}

describe('a real writer process killed with SIGKILL in the middle of appending', () => {
  test('every resulting log reopens, replays to a complete transaction and accepts the next append', async () => {
    const rounds: Round[] = [];
    let previous = 0;

    for (let round = 0; round < 12; round += 1) {
      const delay = 40 + Math.floor(Math.random() * 160);
      await killAWriter(directory.path, delay);

      // What the killed process left on disk, before anything reads it as a ledger.
      // A `SIGKILL` cannot interrupt a `write` that has entered the kernel, so a torn
      // line is not expected here; the count is reported rather than asserted, and
      // `torn-line.test.ts` covers the torn case at every byte offset.
      const left = await readFile(join(directory.path, 'events.jsonl'));
      const tornLine = left.at(-1) !== 0x0a;

      // Everything below runs on what the killed process left on disk.
      const reopened = await testLedger(directory.path);
      const history = reopened.replay();

      // The log replays to complete transactions only, densely sequenced.
      expect(history.map((entry) => entry.sequence)).toEqual(Array.from({ length: history.length }, (_u, i) => i + 1));
      expect(history.map((entry) => entry.transaction.event.step)).toEqual(
        Array.from({ length: history.length }, (_u, i) => i + 1),
      );
      for (const entry of history) {
        expect(entry.transaction.records).toHaveLength(2);
        expect(entry.transaction.records[0]!.body).toMatchObject({ step: entry.sequence });
      }

      // No history was lost to the kill, and the writer did do some work.
      expect(reopened.version).toBeGreaterThanOrEqual(previous);
      const appendsSurvived = reopened.version - previous;

      // Nothing after the last complete line is left on disk.
      const bytes = await readFile(join(directory.path, 'events.jsonl'));
      expect(bytes.at(-1)).toBe(0x0a);

      // Every record file matches the log once it is repaired, and the next append is accepted.
      await reopened.materialize();
      await recordsMatchLog(reopened, join(directory.path, 'records'));
      const next = await reopened.append(writerTransaction(reopened.version + 1));
      expect(next.sequence).toBe(reopened.version);

      previous = reopened.version;
      rounds.push({ version: reopened.version, appendsSurvived, killedAfterMilliseconds: delay, tornLine });
    }

    const worked = rounds.filter((one) => one.appendsSurvived > 0);
    expect(worked.length).toBeGreaterThanOrEqual(10);
    console.log(
      `killed-writer: ${rounds.length} SIGKILLs, ${rounds.filter((one) => one.tornLine).length} of which left a torn last line; ` +
        `appends surviving each: ${rounds.map((one) => one.appendsSurvived).join(', ')}; final version ${previous}`,
    );
  }, 300_000);
});

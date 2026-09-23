import { appendFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { TranscriptEntry } from '../interfaces/protocol/transcripts.js';
import { TranscriptPages } from '../transcripts/pages.js';
import { temporaryDirectory } from './helpers/fixture.js';

/*
 * Pages of a transcript after a cursor, read as a follower reads them: only
 * the bytes appended since the last read, a torn last line left until it is
 * complete, a damaged line skipped and reported, and a cursor that never
 * moves back.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function transcript(): Promise<string> {
  const made = await temporaryDirectory();
  cleanups.push(made.remove);
  return join(made.path, 'ses-0001.jsonl');
}

/** A user message of `size` characters, numbered `n`. */
const entry = (n: number, size = 10): TranscriptEntry => ({
  n, at: '2026-09-23T10:00:00.000Z', type: 'message', invocation: 'inv-0001', role: 'user',
  blocks: [{ type: 'text', body: { stored: 'inline', text: 'x'.repeat(size), bytes: size } }],
});
const line = (value: TranscriptEntry): string => `${JSON.stringify(value)}\n`;
const lines = (from: number, to: number, size?: number): string => Array.from({ length: to - from + 1 }, (_, index) => line(entry(from + index, size))).join('');
const bounds = { entries: 200, bytes: 512 * 1024 };

describe('transcript pages', () => {
  test('pages follow the cursor to the end, bounded by count, and a cursor past the end stays where it is', async () => {
    const path = await transcript();
    await writeFile(path, lines(1, 450));
    const pages = new TranscriptPages();
    const first = await pages.page(path, 0, bounds);
    expect([first.entries.length, first.entries[0]!.n, first.cursor, first.more]).toEqual([200, 1, 200, true]);
    const second = await pages.page(path, first.cursor, bounds);
    expect([second.entries[0]!.n, second.cursor, second.more]).toEqual([201, 400, true]);
    const third = await pages.page(path, second.cursor, bounds);
    expect([third.entries.length, third.cursor, third.more]).toEqual([50, 450, false]);
    expect(await pages.page(path, 450, bounds)).toMatchObject({ entries: [], cursor: 450, more: false });
    expect(await pages.page(path, 900, bounds)).toMatchObject({ entries: [], cursor: 900, more: false });
  });

  test('the byte bound ends a page early, and a page larger than the bound still holds its one entry', async () => {
    const path = await transcript();
    await writeFile(path, lines(1, 3, 4000));
    const pages = new TranscriptPages();
    const small = await pages.page(path, 0, { entries: 200, bytes: 9000 });
    expect([small.entries.map(value => value.n), small.more]).toEqual([[1, 2], true]);
    const tiny = await pages.page(path, 0, { entries: 200, bytes: 10 });
    expect([tiny.entries.map(value => value.n), tiny.more, tiny.cursor]).toEqual([[1], true, 1]);
    // A poll whose budget is spent gets no entry, and is told more follow.
    expect(await pages.page(path, 0, { entries: 0, bytes: 0 })).toMatchObject({ entries: [], cursor: 0, more: true, bytes: 0 });
  });

  test('entries appended since are read, a torn line waits for its newline, and a damaged line is skipped and reported', async () => {
    const path = await transcript();
    await writeFile(path, lines(1, 2));
    const pages = new TranscriptPages();
    expect((await pages.page(path, 0, bounds)).cursor).toBe(2);

    const third = line(entry(3));
    await appendFile(path, third.slice(0, 20));
    expect(await pages.page(path, 2, bounds)).toMatchObject({ entries: [], cursor: 2, more: false, partial: true });
    await appendFile(path, third.slice(20));
    const completed = await pages.page(path, 2, bounds);
    expect([completed.entries.map(value => value.n), completed.partial]).toEqual([[3], false]);

    await appendFile(path, 'not a JSON value\n');
    await appendFile(path, `${JSON.stringify({ n: 4, type: 'nothing' })}\n`);
    await appendFile(path, lines(5, 5));
    const next = await pages.page(path, 3, bounds);
    expect([next.entries.map(value => value.n), next.unreadable, next.cursor]).toEqual([[5], [4, 5], 5]);
    // The whole file again, from a new reader: the same entries and the same lines.
    const again = await new TranscriptPages().page(path, 0, bounds);
    expect([again.entries.map(value => value.n), again.unreadable]).toEqual([[1, 2, 3, 5], [4, 5]]);
    expect(await pages.last(path)).toMatchObject({ n: 5 });
  });

  test('a missing file is missing, and a file replaced by a shorter one is read again', async () => {
    const path = await transcript();
    const pages = new TranscriptPages();
    expect(await pages.page(path, 0, bounds)).toMatchObject({ missing: true, entries: [], cursor: 0 });
    expect(await pages.last(path)).toBeNull();
    await writeFile(path, lines(1, 5));
    expect((await pages.page(path, 0, bounds)).cursor).toBe(5);
    await rm(path);
    expect(await pages.page(path, 5, bounds)).toMatchObject({ missing: true, cursor: 5 });
    await writeFile(path, lines(1, 2));
    expect((await pages.page(path, 0, bounds)).entries.map(value => value.n)).toEqual([1, 2]);
  });
});

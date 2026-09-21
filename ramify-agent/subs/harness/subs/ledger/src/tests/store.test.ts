import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { writeFileAtomic } from '../atomic.js';
import { appendJsonLine, CorruptJsonLinesError, discardPartialLine, readJsonLines } from '../jsonl.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

describe('writeFileAtomic', () => {
  test('creates and replaces a file and leaves no temporary file', async () => {
    const path = join(directory.path, 'job.json');
    await writeFileAtomic(path, '{"a":1}');
    await writeFileAtomic(path, '{"a":2}');
    expect(await readFile(path, 'utf8')).toBe('{"a":2}');
    expect(await readdir(directory.path)).toEqual(['job.json']);
  });

  test('fails without leaving a temporary file when the directory is missing', async () => {
    await expect(writeFileAtomic(join(directory.path, 'missing', 'x.json'), 'x')).rejects.toThrow();
    expect(await readdir(directory.path)).toEqual([]);
  });
});

describe('JSON Lines', () => {
  test('a missing file has no records', async () => {
    expect(await readJsonLines(join(directory.path, 'events.jsonl')))
      .toEqual({ records: [], discardedPartial: null, completeBytes: 0 });
  });

  test('appended records load in order', async () => {
    const path = join(directory.path, 'events.jsonl');
    await appendJsonLine(path, { sequence: 1 });
    await appendJsonLine(path, { sequence: 2, text: 'line\nbreak' });
    const loaded = await readJsonLines(path);
    expect(loaded.records).toEqual([{ sequence: 1 }, { sequence: 2, text: 'line\nbreak' }]);
    expect(loaded.discardedPartial).toBeNull();
  });

  test('a trailing partial line is discarded on load and can be truncated before the next append', async () => {
    const path = join(directory.path, 'events.jsonl');
    await writeFile(path, '{"sequence":1}\n{"sequence":2}\n{"seque');
    const loaded = await readJsonLines(path);
    expect(loaded.records).toEqual([{ sequence: 1 }, { sequence: 2 }]);
    expect(loaded.discardedPartial).toBe('{"seque');
    await discardPartialLine(path, loaded);
    await appendJsonLine(path, { sequence: 3 });
    expect((await readJsonLines(path)).records).toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
  });

  test('a trailing line that parses but lacks its newline is still partial', async () => {
    const path = join(directory.path, 'events.jsonl');
    await writeFile(path, '{"sequence":1}\n{"sequence":2}');
    expect((await readJsonLines(path)).records).toEqual([{ sequence: 1 }]);
  });

  test('a corrupt complete line is an error, not a discarded line', async () => {
    const path = join(directory.path, 'events.jsonl');
    await writeFile(path, '{"sequence":1}\nnot json\n{"sequence":3}\n');
    await expect(readJsonLines(path)).rejects.toThrow(CorruptJsonLinesError);
    await expect(readJsonLines(path)).rejects.toThrow(/:2: not a JSON value/);
  });
});

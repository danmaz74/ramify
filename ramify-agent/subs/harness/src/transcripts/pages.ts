import { open, stat } from 'node:fs/promises';
import { transcriptEntrySchema, type TranscriptEntry } from '../interfaces/protocol/transcripts.js';

/*
 * Pages of transcripts, for a reader that follows them.
 *
 * A transcript is append-only: the writer adds whole lines and only ever
 * removes a torn last line, which a reader never counted. So each file is
 * indexed once, line by line, and afterwards only the bytes appended since
 * are read: a poll of a long live transcript reads its new entries, not the
 * whole file again. The index holds each complete line's offset and its
 * entry's number, never an entry itself.
 *
 * A line that is not an entry, whether not JSON or not of the schema, is
 * skipped and reported by its line number. A trailing line without its
 * newline is an append in progress or one a crash interrupted, and is not
 * read until it is complete. Nothing here writes.
 */

/** The entries of one transcript after a cursor. */
export interface TranscriptPageRead {
  /** The file does not exist. */
  readonly missing: boolean;
  readonly entries: readonly TranscriptEntry[];
  /** The last returned entry's number, or the cursor asked for. */
  readonly cursor: number;
  readonly more: boolean;
  /** A trailing line without its newline was left unread. */
  readonly partial: boolean;
  /** Complete lines after the cursor that are not entries, by line number. */
  readonly unreadable: readonly number[];
  /** The bytes of the returned entries' lines. */
  readonly bytes: number;
}

/** How much one page may hold. A page holds at least one entry, whatever its size. */
export interface PageBounds {
  readonly entries: number;
  readonly bytes: number;
}

interface LineIndex {
  /** The bytes of complete lines indexed so far. */
  size: number;
  /** Each complete line's first byte. */
  readonly starts: number[];
  /** Each complete line's entry number, or null for a line that is not an entry. */
  readonly numbers: Array<number | null>;
  partial: boolean;
}

export class TranscriptPages {
  private readonly indexes = new Map<string, LineIndex>();

  /** The entries after `after`, within `bounds`. */
  async page(path: string, after: number, bounds: PageBounds): Promise<TranscriptPageRead> {
    const index = await this.indexed(path);
    if (index === null) return { missing: true, entries: [], cursor: after, more: false, partial: false, unreadable: [], bytes: 0 };
    const lines = index.numbers.length;
    const end = (line: number): number => (line + 1 < lines ? index.starts[line + 1]! : index.size);

    // The first line after the last entry the cursor has read.
    let first = 0;
    for (let line = lines - 1; line >= 0; line -= 1) {
      const number = index.numbers[line];
      if (number !== null && number !== undefined && number <= after) {
        first = line + 1;
        break;
      }
    }
    let last = first;
    let taken = 0;
    let bytes = 0;
    while (last < lines) {
      if (index.numbers[last] !== null) {
        const length = end(last) - index.starts[last]!;
        if (taken >= bounds.entries || (taken > 0 && bytes + length > bounds.bytes)) break;
        taken += 1;
        bytes += length;
      }
      last += 1;
    }

    const entries: TranscriptEntry[] = [];
    const unreadable: number[] = [];
    if (last > first) {
      const text = await readRange(path, index.starts[first]!, end(last - 1));
      text.split('\n').slice(0, last - first).forEach((line, offset) => {
        const entry = parseEntry(line);
        if (entry === null) unreadable.push(first + offset + 1);
        else if (entry.n > after) entries.push(entry);
      });
    }
    let more = false;
    for (let line = last; line < lines && !more; line += 1) more = index.numbers[line] !== null;
    return { missing: false, entries, cursor: Math.max(after, entries.at(-1)?.n ?? after), more, partial: index.partial, unreadable, bytes };
  }

  /** The transcript's last entry, or null where it has none or does not exist. */
  async last(path: string): Promise<TranscriptEntry | null> {
    const index = await this.indexed(path);
    if (index === null) return null;
    for (let line = index.numbers.length - 1; line >= 0; line -= 1) {
      if (index.numbers[line] === null) continue;
      const until = line + 1 < index.numbers.length ? index.starts[line + 1]! : index.size;
      return parseEntry((await readRange(path, index.starts[line]!, until)).replace(/\n$/, ''));
    }
    return null;
  }

  /** The file's index, brought up to its current complete lines; null where the file does not exist. */
  private async indexed(path: string): Promise<LineIndex | null> {
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.indexes.delete(path);
        return null;
      }
      throw error;
    }
    let index = this.indexes.get(path);
    // A file shorter than what was indexed is not the file that was: index it again.
    if (index === undefined || size < index.size) {
      index = { size: 0, starts: [], numbers: [], partial: false };
      this.indexes.set(path, index);
    }
    if (size === index.size) {
      index.partial = false;
      return index;
    }
    const appended = await readBytes(path, index.size, size);
    const complete = appended.lastIndexOf(0x0a) + 1;
    let start = 0;
    while (start < complete) {
      const newline = appended.indexOf(0x0a, start);
      index.starts.push(index.size + start);
      index.numbers.push(parseEntry(appended.subarray(start, newline).toString('utf8'))?.n ?? null);
      start = newline + 1;
    }
    index.size += complete;
    index.partial = complete < appended.length;
    return index;
  }
}

function parseEntry(line: string): TranscriptEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = transcriptEntrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function readBytes(path: string, from: number, until: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(until - from);
    let read = 0;
    while (read < buffer.length) {
      const { bytesRead } = await handle.read(buffer, read, buffer.length - read, from + read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

async function readRange(path: string, from: number, until: number): Promise<string> {
  return (await readBytes(path, from, until)).toString('utf8');
}

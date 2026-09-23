import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { appendJsonLine, discardPartialLine, readJsonLines } from '../../subs/ledger/src/jsonl.js';
import {
  transcriptEntrySchema, type TranscriptBody, type TranscriptEntry,
} from '../interfaces/protocol/transcripts.js';
import type { ContentStore } from './store.js';

/*
 * One session's transcript file. Entries are appended one line at a time
 * with the ledger's `appendJsonLine`, which syncs each line, so a crash
 * loses at most the entry being written; the torn line it leaves is
 * discarded when the file is next opened. The file is raw output and goes
 * through no ledger: no state of a run derives from it.
 *
 * Only the harness writes it, one writer per session. Appends are ordered
 * in the order they are asked for, and each is numbered one above the last
 * entry in the file, so a number is never reset. A failed append is
 * reported to its caller, and the next append reads the file again first.
 */

/** An entry to append: everything but its number and its time. */
export type TranscriptEntryInput = TranscriptEntry extends infer E ? E extends TranscriptEntry ? Omit<E, 'n' | 'at'> : never : never;

/** How an entry's builder turns content into bodies. */
export interface TranscriptBodies {
  /**
   * A body from text: inline up to the inline limit, in the content store
   * above it. `stored` puts it in the store whatever its size, for content
   * many entries share, such as a system prompt.
   */
  text(content: string, placement?: 'by-size' | 'stored'): Promise<TranscriptBody>;
  /** A body that is a file the harness already keeps, by its absolute path beneath the transcript's directory. */
  file(path: string): Promise<TranscriptBody>;
}

export interface TranscriptWriterOptions {
  /** The session the transcript is of. */
  readonly session: string;
  /** The transcript file, absolute. */
  readonly path: string;
  /** The directory a `file` body's path is relative to: the run's, or the standalone session's. */
  readonly root: string;
  readonly store: ContentStore;
  /** The policy's inline limit: a larger body goes to the content store. */
  readonly inlineBytes: number;
  readonly now?: (() => Date) | undefined;
}

/** How many characters of a stored body's first line its header previews. */
export const previewCharacters = 120;

export class TranscriptWriter {
  /** The next entry's number; undefined until the file has been read, and again after a failed append. */
  private next: number | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly bodies: TranscriptBodies;

  constructor(private readonly options: TranscriptWriterOptions) {
    this.bodies = {
      text: (content, placement = 'by-size') => this.textBody(content, placement),
      file: path => this.fileBody(path),
    };
  }

  get session(): string {
    return this.options.session;
  }

  get path(): string {
    return this.options.path;
  }

  /**
   * Appends one entry, after every append asked for before it. The builder
   * runs in turn, so the bodies it stores and the number the entry gets
   * follow the same order. It rejects when the entry could not be written.
   */
  append(build: (bodies: TranscriptBodies) => TranscriptEntryInput | Promise<TranscriptEntryInput>): Promise<TranscriptEntry> {
    const task = this.tail.then(() => this.write(build));
    this.tail = task.catch(() => undefined);
    return task;
  }

  /** Waits for every append asked for so far. */
  async drain(): Promise<void> {
    await this.tail;
  }

  private async write(build: (bodies: TranscriptBodies) => TranscriptEntryInput | Promise<TranscriptEntryInput>): Promise<TranscriptEntry> {
    try {
      const number = this.next ?? await this.load();
      const input = await build(this.bodies);
      const entry = transcriptEntrySchema.parse({ n: number, at: (this.options.now?.() ?? new Date()).toISOString(), ...input });
      await appendJsonLine(this.options.path, entry);
      this.next = number + 1;
      return entry;
    } catch (error) {
      // Whether the line reached the file is unknown; the file says.
      this.next = undefined;
      throw error;
    }
  }

  /** Reads the file, removes a torn last line, and answers the next number. */
  private async load(): Promise<number> {
    await mkdir(dirname(this.options.path), { recursive: true });
    const loaded = await readJsonLines(this.options.path);
    await discardPartialLine(this.options.path, loaded);
    const last = loaded.records.at(-1) as { readonly n?: unknown } | undefined;
    this.next = typeof last?.n === 'number' ? last.n + 1 : loaded.records.length + 1;
    return this.next;
  }

  private async textBody(content: string, placement: 'by-size' | 'stored'): Promise<TranscriptBody> {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (placement === 'by-size' && bytes <= this.options.inlineBytes) return { stored: 'inline', text: content, bytes };
    const stored = await this.options.store.put(content);
    return { stored: 'blob', hash: stored.hash, bytes: stored.bytes, preview: previewOf(content) };
  }

  private async fileBody(path: string): Promise<TranscriptBody> {
    const bytes = await stat(path).then(found => found.size, () => null);
    return { stored: 'file', path: relativePath(this.options.root, path), bytes };
  }
}

/** A body's first line that has text, shortened for a header. */
export function previewOf(content: string): string {
  const line = content.split('\n').find(candidate => candidate.trim() !== '')?.trim() ?? '';
  return line.length > previewCharacters ? `${line.slice(0, previewCharacters - 1)}…` : line;
}

function relativePath(root: string, path: string): string {
  const shown = isAbsolute(path) ? relative(root, path) : path;
  return shown.split(sep).join('/');
}

/** A transcript as a reader loads it. */
export interface TranscriptRead {
  /** The file does not exist; it has no entries. */
  readonly missing: boolean;
  readonly entries: readonly TranscriptEntry[];
  /** A trailing line without its newline was discarded, as an interrupted append. */
  readonly discardedPartial: boolean;
  /** Complete lines that are not entries of this schema, JSON or not, by line number. */
  readonly unreadable: readonly number[];
}

/**
 * Reads a transcript without changing it. A missing file has no entries,
 * and says so. A torn last line is discarded; a complete line that is not an
 * entry, whether it is not JSON or not of the schema, is reported by its
 * number and skipped, so one damaged line never hides the others.
 */
export async function readTranscript(path: string): Promise<TranscriptRead> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { missing: true, entries: [], discardedPartial: false, unreadable: [] };
    throw error;
  }
  const complete = bytes.lastIndexOf(0x0a) + 1;
  const lines = bytes.subarray(0, complete).toString('utf8').split('\n');
  lines.pop();
  const entries: TranscriptEntry[] = [];
  const unreadable: number[] = [];
  lines.forEach((line, index) => {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      unreadable.push(index + 1);
      return;
    }
    const parsed = transcriptEntrySchema.safeParse(record);
    if (parsed.success) entries.push(parsed.data);
    else unreadable.push(index + 1);
  });
  return { missing: false, entries, discardedPartial: complete < bytes.length, unreadable };
}

/** A body's content: inline, from the content store, or the file it names. Null where it can no longer be read. */
export async function readBody(root: string, store: ContentStore, body: TranscriptBody): Promise<string | null> {
  if (body.stored === 'inline') return body.text;
  if (body.stored === 'blob') return store.read(body.hash);
  const path = join(root, ...body.path.split('/'));
  if (relative(root, path).startsWith('..')) return null;
  return readFile(path, 'utf8').catch(() => null);
}

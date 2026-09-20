import { open, readFile, truncate } from 'node:fs/promises';

/** The records of a JSON Lines file, as loaded. */
export interface JsonLines {
  readonly records: readonly unknown[];
  /** A trailing line without its newline, discarded as an interrupted append. */
  readonly discardedPartial: string | null;
  /** The byte length of the complete lines; truncating to it removes the partial line. */
  readonly completeBytes: number;
}

/** A complete line that is not JSON. Only a trailing partial line is tolerated. */
export class CorruptJsonLinesError extends Error {
  constructor(readonly path: string, readonly line: number, cause: unknown) {
    super(`${path}:${line}: not a JSON value`, { cause });
    this.name = 'CorruptJsonLinesError';
  }
}

/**
 * Loads an append-only JSON Lines file. A missing file has no records. A
 * trailing line without its newline is the remains of an interrupted append;
 * it is discarded and reported, never parsed.
 */
export async function readJsonLines(path: string): Promise<JsonLines> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { records: [], discardedPartial: null, completeBytes: 0 };
    throw error;
  }
  const end = bytes.lastIndexOf(0x0a) + 1;
  const complete = bytes.subarray(0, end).toString('utf8');
  const partial = end < bytes.length ? bytes.subarray(end).toString('utf8') : null;
  const lines = complete.split('\n');
  lines.pop();
  const records = lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error) {
      throw new CorruptJsonLinesError(path, index + 1, error);
    }
  });
  return { records, discardedPartial: partial, completeBytes: end };
}

/**
 * Appends one record as one line and flushes it. The caller must first
 * remove a partial line reported by `readJsonLines`, with
 * `discardPartialLine`, or the new record would be joined to it.
 */
export async function appendJsonLine(path: string, record: unknown): Promise<void> {
  const line = JSON.stringify(record);
  if (line === undefined) throw new TypeError('The record has no JSON representation');
  const handle = await open(path, 'a');
  try {
    await handle.appendFile(`${line}\n`);
    await handle.datasync();
  } finally {
    await handle.close();
  }
}

/** Truncates the file to its complete lines. */
export async function discardPartialLine(path: string, loaded: JsonLines): Promise<void> {
  if (loaded.discardedPartial !== null) await truncate(path, loaded.completeBytes);
}

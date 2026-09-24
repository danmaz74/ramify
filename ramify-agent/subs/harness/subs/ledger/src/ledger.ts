import { randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { EffectSpec, PendingEffect } from './effects.js';
import { nodeFileSystem, syncDirectoryThrough, type LedgerFileSystem } from './fs.js';

/** The largest line the log accepts, including its newline. */
export const maximumLineBytes = 8 * 1024 * 1024;

/** The body of one record the transition commits, and where it is materialized. */
export interface RecordBody {
  /** Relative to the records root; a path that escapes it is refused. */
  readonly path: string;
  readonly id: string;
  readonly revision: number;
  readonly body: unknown;
}

/** One transition: its event and the bodies of every record it commits. */
export interface Transaction<E> {
  readonly event: E;
  readonly records: ReadonlyArray<RecordBody>;
}

/** One complete line of the log, as replayed. */
export interface LedgerEntry<E> {
  readonly sequence: number;
  readonly at: string;
  readonly transaction: Transaction<E>;
}

/** What reading a materialized record file found. Absence is a failure, never a value. */
export type RecordRead<T> =
  | { readonly kind: 'valid'; readonly value: T }
  | { readonly kind: 'unsupported-version'; readonly schema: string; readonly path: string }
  | { readonly kind: 'invalid'; readonly errors: readonly string[]; readonly path: string };

/** What a record file must declare for a reader to accept it. */
export interface RecordSchema<T> {
  /** The one schema literal this reader supports, such as `ramify-agent.run/1`. */
  readonly schema: string;
  readonly body: z.ZodType<T>;
}

/** A log that cannot be replayed: the path, the line and the reason. */
export class LedgerCorruptError extends Error {
  constructor(
    readonly path: string,
    readonly line: number,
    readonly reason: string,
    readonly text: string | null = null,
    options?: ErrorOptions,
  ) {
    super(`${path}:${line}: ${reason}`, options);
    this.name = 'LedgerCorruptError';
  }
}

/** The durable writer: one flushed line is one transaction. */
export interface Ledger<E> {
  /** The last sequence in the log; 0 before any. */
  readonly version: number;
  /** Appends one line holding the whole transaction, flushed before it resolves, then materializes its records. */
  append(transaction: Transaction<E>): Promise<{ readonly sequence: number; readonly at: string }>;
  /** Every complete line, in order. */
  replay(): ReadonlyArray<LedgerEntry<E>>;
  /** Rewrites every record file that is missing or differs from the log; removes none it did not write. */
  materialize(): Promise<{ readonly rewritten: readonly string[] }>;
  /** Reads one materialized record file: valid, unsupported version, or invalid. */
  readRecord<T>(path: string, schema: RecordSchema<T>): Promise<RecordRead<T>>;
  /** Intent, the effect under its key, completion. Resolves with the effect's result. */
  effect<R>(spec: EffectSpec<E, R>): Promise<R>;
  /** Intents without a completion, for the caller to perform again on load. */
  pendingEffects(): ReadonlyArray<PendingEffect<E>>;
}

export interface OpenLedgerOptions<E> {
  readonly logPath: string;
  readonly recordsRoot: string;
  readonly eventSchema: z.ZodType<E>;
  /** The file system the ledger writes through. Node's by default. */
  readonly fs?: LedgerFileSystem;
  /** The clock the append time comes from. The system clock by default. */
  readonly now?: () => Date;
}

/** How a line records an external effect, when it records one. */
interface EffectMark {
  readonly key: string;
  readonly phase: 'intent' | 'completion';
  /** The effect's result, on a completion, so a repeat returns it without performing. */
  readonly result?: unknown;
}

interface Line {
  readonly sequence: number;
  readonly at: string;
  readonly event: unknown;
  readonly records: readonly RecordBody[];
  readonly effect?: EffectMark;
}

const recordBodySchema = z.object({
  path: z.string().min(1),
  id: z.string(),
  revision: z.number().int().nonnegative(),
  body: z.unknown(),
});

const effectMarkSchema = z.object({
  key: z.string().min(1),
  phase: z.enum(['intent', 'completion']),
  result: z.unknown().optional(),
});

const lineSchema = z.object({
  sequence: z.number().int().positive(),
  at: z.string().min(1),
  event: z.unknown(),
  records: z.array(recordBodySchema),
  effect: effectMarkSchema.optional(),
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The bytes a record file holds for `body`, pretty-printed for people to read. */
function recordBytes(body: unknown): Uint8Array {
  const text = JSON.stringify(body, null, 2);
  if (text === undefined) throw new TypeError('A record body has no JSON representation');
  return encoder.encode(`${text}\n`);
}

/**
 * Resolves a record's path under `recordsRoot`, refusing anything that leaves
 * it. Returns the absolute path.
 */
function resolveRecordPath(recordsRoot: string, path: string): string {
  if (isAbsolute(path)) throw new TypeError(`The record path "${path}" is absolute; it must be relative to the records root`);
  if (path.endsWith('/') || path.endsWith(sep)) throw new TypeError(`The record path "${path}" names a directory`);
  const root = resolve(recordsRoot);
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new TypeError(`The record path "${path}" resolves outside the records root`);
  }
  if (target === root) throw new TypeError(`The record path "${path}" is the records root itself`);
  if (normalize(path).split(/[\\/]/).includes('..')) {
    throw new TypeError(`The record path "${path}" leaves the records root`);
  }
  return target;
}

/** Writes `bytes` to `path` so that a reader sees the old file or the whole new one. */
async function writeRecordFile(fs: LedgerFileSystem, path: string, bytes: Uint8Array): Promise<void> {
  const directory = dirname(path);
  await fs.mkdir(directory);
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx');
    try {
      await handle.write(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, path);
    await syncDirectoryThrough(fs, directory);
  } catch (error) {
    await fs.remove(temporary).catch(() => undefined);
    throw error;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * Opens the ledger of one log. A torn last line is truncated away; any other
 * line the envelope, the sequence, the record paths or the event schema
 * rejects is a `LedgerCorruptError`, so a malformed line never yields a
 * shorter history.
 */
export async function openLedger<E>(options: OpenLedgerOptions<E>): Promise<Ledger<E>> {
  const fs = options.fs ?? nodeFileSystem;
  const now = options.now ?? (() => new Date());
  const { logPath, recordsRoot, eventSchema } = options;

  await fs.mkdir(dirname(logPath));
  await fs.mkdir(recordsRoot);

  const loaded = await loadLog<E>(fs, logPath, recordsRoot, eventSchema);
  const lines: Line[] = loaded.lines;
  let logBytes = loaded.completeBytes;

  /** Appends are serialized here; the chain also carries a failure to its caller only. */
  let queue: Promise<unknown> = Promise.resolve();

  function entries(): LedgerEntry<E>[] {
    return lines.map((line) => ({
      sequence: line.sequence,
      at: line.at,
      transaction: { event: line.event as E, records: line.records },
    }));
  }

  async function appendLine(transaction: Transaction<E>, effect?: EffectMark): Promise<Line> {
    for (const record of transaction.records) resolveRecordPath(recordsRoot, record.path);

    const sequence = (lines.at(-1)?.sequence ?? 0) + 1;
    const at = now().toISOString();
    const line: Line = { sequence, at, event: transaction.event, records: [...transaction.records], ...(effect ? { effect } : {}) };
    const text = JSON.stringify(line);
    if (text === undefined) throw new TypeError('The transaction has no JSON representation');
    const bytes = encoder.encode(`${text}\n`);
    if (bytes.byteLength > maximumLineBytes) {
      throw new RangeError(
        `The transaction is ${bytes.byteLength} bytes, over the ${maximumLineBytes}-byte line bound; write it to a file beside the log and reference it`,
      );
    }

    const size = await fs.size(logPath);
    if ((size ?? 0) !== logBytes) {
      throw new LedgerCorruptError(logPath, sequence, `the log is ${size ?? 0} bytes where this ledger wrote ${logBytes}: another writer appended to it`);
    }

    const handle = await fs.open(logPath, 'a');
    try {
      await handle.write(bytes);
      await handle.datasync();
    } finally {
      await handle.close();
    }
    logBytes += bytes.byteLength;
    lines.push(line);
    return line;
  }

  /**
   * Writes this transaction's record files. A failure is not a failed
   * transaction: the line is in the log, and `materialize` repairs the file.
   */
  async function materializeLine(line: Line): Promise<void> {
    for (const record of line.records) {
      try {
        await writeRecordFile(fs, resolveRecordPath(recordsRoot, record.path), recordBytes(record.body));
      } catch {
        // The log holds the transaction; `materialize` rewrites what is missing or differs.
      }
    }
  }

  async function serialized<R>(work: () => Promise<R>): Promise<R> {
    const run = queue.then(work, work);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }

  function pending(): PendingEffect<E>[] {
    const completed = new Set(lines.filter((line) => line.effect?.phase === 'completion').map((line) => line.effect!.key));
    return lines
      .filter((line) => line.effect?.phase === 'intent' && !completed.has(line.effect.key))
      .map((line) => ({ key: line.effect!.key, sequence: line.sequence, at: line.at, event: line.event as E }));
  }

  const ledger: Ledger<E> = {
    get version() {
      return lines.at(-1)?.sequence ?? 0;
    },

    async append(transaction) {
      return await serialized(async () => {
        const line = await appendLine(transaction);
        await materializeLine(line);
        return { sequence: line.sequence, at: line.at };
      });
    },

    replay() {
      return entries();
    },

    async materialize() {
      return await serialized(async () => {
        const wanted = new Map<string, Uint8Array>();
        for (const line of lines) {
          for (const record of line.records) wanted.set(record.path, recordBytes(record.body));
        }
        const rewritten: string[] = [];
        for (const [path, bytes] of wanted) {
          const target = resolveRecordPath(recordsRoot, path);
          let current: Uint8Array | null = null;
          try {
            current = await fs.readFile(target);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (current !== null && sameBytes(current, bytes)) continue;
          await writeRecordFile(fs, target, bytes);
          rewritten.push(path);
        }
        return { rewritten };
      });
    },

    async readRecord<T>(path: string, schema: RecordSchema<T>): Promise<RecordRead<T>> {
      const target = resolveRecordPath(recordsRoot, path);
      let bytes: Uint8Array;
      try {
        bytes = await fs.readFile(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { kind: 'invalid', errors: ['the record file is missing'], path };
        }
        throw error;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(decoder.decode(bytes)) as unknown;
      } catch (error) {
        return { kind: 'invalid', errors: [`the record file is not a JSON value: ${(error as Error).message}`], path };
      }
      const declared = typeof parsed === 'object' && parsed !== null ? (parsed as { schema?: unknown }).schema : undefined;
      if (typeof declared !== 'string') {
        return { kind: 'invalid', errors: ['the record declares no schema'], path };
      }
      if (declared !== schema.schema) {
        return { kind: 'unsupported-version', schema: declared, path };
      }
      const result = schema.body.safeParse(parsed);
      if (!result.success) {
        return {
          kind: 'invalid',
          errors: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
          path,
        };
      }
      return { kind: 'valid', value: result.data };
    },

    async effect<R>(spec: EffectSpec<E, R>): Promise<R> {
      const completion = lines.find((line) => line.effect?.phase === 'completion' && line.effect.key === spec.key);
      if (completion !== undefined) return completion.effect!.result as R;

      const held = spec.serialize ?? (<T>(work: () => Promise<T>) => work());
      await held(async () => {
        const started = lines.some((line) => line.effect?.phase === 'intent' && line.effect.key === spec.key);
        if (started) return;
        const intent = typeof spec.intent === 'function' ? spec.intent() : spec.intent;
        await serialized(async () => {
          const line = await appendLine(intent, { key: spec.key, phase: 'intent' });
          await materializeLine(line);
        });
      });
      const result = await spec.perform(spec.key);
      if (JSON.stringify(result ?? null) === undefined) {
        throw new TypeError(`The result of effect "${spec.key}" has no JSON representation`);
      }
      await held(async () => {
        const completion = spec.complete(result);
        await serialized(async () => {
          const line = await appendLine(completion, { key: spec.key, phase: 'completion', result: result ?? null });
          await materializeLine(line);
        });
      });
      return result;
    },

    pendingEffects() {
      return pending();
    },
  };

  return ledger;
}

/** Reads the log, discarding a torn last line and refusing anything else malformed. */
async function loadLog<E>(
  fs: LedgerFileSystem,
  logPath: string,
  recordsRoot: string,
  eventSchema: z.ZodType<E>,
): Promise<{ lines: Line[]; completeBytes: number }> {
  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(logPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { lines: [], completeBytes: 0 };
    throw error;
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = buffer.lastIndexOf(0x0a) + 1;
  if (end < buffer.byteLength) await fs.truncate(logPath, end);

  const texts = buffer.subarray(0, end).toString('utf8').split('\n');
  texts.pop();

  const lines: Line[] = [];
  texts.forEach((text, index) => {
    const number = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (error) {
      throw new LedgerCorruptError(logPath, number, 'not a JSON value', text, { cause: error });
    }
    const envelope = lineSchema.safeParse(parsed);
    if (!envelope.success) {
      throw new LedgerCorruptError(logPath, number, `not a transaction line: ${issues(envelope.error)}`, text);
    }
    const line = envelope.data as Line;
    if (line.sequence !== number) {
      throw new LedgerCorruptError(logPath, number, `sequence ${line.sequence} where ${number} was expected`, text);
    }
    for (const record of line.records) {
      try {
        resolveRecordPath(recordsRoot, record.path);
      } catch (error) {
        throw new LedgerCorruptError(logPath, number, (error as Error).message, text, { cause: error });
      }
    }
    const event = eventSchema.safeParse(line.event);
    if (!event.success) {
      throw new LedgerCorruptError(logPath, number, `the event does not match the schema: ${issues(event.error)}`, text);
    }
    lines.push({ ...line, event: event.data });
  });
  return { lines, completeBytes: end };
}

function issues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');
}

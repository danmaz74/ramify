import {
  jobEventSchema,
  terminalEventTypes,
  type JobEvent,
  type JobEventOf,
  type JobEventType,
} from '../interfaces/protocol/jobs.js';
import { appendJsonLine, discardPartialLine, readJsonLines } from '../store/jsonl.js';

/** An event to append: its type and data. The log assigns the sequence and time. */
export type EventInput = { [T in JobEventType]: { readonly type: T; readonly data: JobEventOf<T>['data'] } }[JobEventType];

/** A log line that is not a valid event in sequence. */
export class CorruptJobLogError extends Error {
  constructor(path: string, line: number, reason: string) {
    super(`${path}:${line}: ${reason}`);
    this.name = 'CorruptJobLogError';
  }
}

const terminal = new Set<string>(terminalEventTypes);

/**
 * A job's event log, `events.jsonl`: the only record of its state. Each line
 * is one event whose sequence number is one more than the line before; the
 * job's version is the last sequence number. Appends are flushed before they
 * count, and the caller serializes them.
 */
export class JobLog {
  private constructor(
    readonly path: string,
    readonly jobId: string,
    private readonly list: JobEvent[],
  ) {}

  /**
   * Loads the log, first truncating a trailing partial line left by an
   * interrupted append. A missing file is an empty log.
   */
  static async open(path: string, jobId: string): Promise<JobLog> {
    const loaded = await readJsonLines(path);
    await discardPartialLine(path, loaded);
    const events = loaded.records.map((record, index) => {
      const parsed = jobEventSchema.safeParse(record);
      if (!parsed.success) throw new CorruptJobLogError(path, index + 1, `not a job event: ${parsed.error.issues[0]?.message ?? ''}`);
      if (parsed.data.sequence !== index + 1) throw new CorruptJobLogError(path, index + 1, `sequence ${parsed.data.sequence}, expected ${index + 1}`);
      if (parsed.data.jobId !== jobId) throw new CorruptJobLogError(path, index + 1, `event of job ${parsed.data.jobId}`);
      return parsed.data;
    });
    events.forEach((event, index) => {
      const refusal = followRefusal(events.slice(0, index), event.type);
      if (refusal) throw new CorruptJobLogError(path, index + 1, refusal);
    });
    return new JobLog(path, jobId, events);
  }

  get events(): readonly JobEvent[] {
    return this.list;
  }

  get version(): number {
    return this.list.length;
  }

  /** The event that ended the job, if any. Only an approval may follow it. */
  get terminal(): JobEvent | undefined {
    return terminalOf(this.list);
  }

  find<T extends JobEventType>(type: T): JobEventOf<T> | undefined {
    return this.list.find((event): event is JobEventOf<T> => event.type === type);
  }

  /** The next event's sequence number. */
  get nextSequence(): number {
    return this.list.length + 1;
  }

  /**
   * Appends one event and returns it once it is flushed. A terminal log
   * accepts nothing more, except one approval after `job-completed`.
   */
  async append(input: EventInput, at: Date = new Date()): Promise<JobEvent> {
    const refusal = followRefusal(this.list, input.type);
    if (refusal) throw new Error(`Job ${this.jobId}: ${refusal}`);
    const event = jobEventSchema.parse({ sequence: this.nextSequence, jobId: this.jobId, at: at.toISOString(), type: input.type, data: input.data });
    await appendJsonLine(this.path, event);
    this.list.push(event);
    return event;
  }
}

/** The first terminal event of `events`; at most one exists. */
export function terminalOf(events: readonly JobEvent[]): JobEvent | undefined {
  return events.find(event => terminal.has(event.type));
}

/** Why an event of `type` cannot follow `events`, or `undefined` when it can. */
function followRefusal(events: readonly JobEvent[], type: JobEventType): string | undefined {
  const ended = terminalOf(events);
  if (type === 'map-approved') {
    if (ended?.type !== 'job-completed') return 'map-approved can only follow job-completed';
    if (events.some(event => event.type === 'map-approved')) return 'the job\'s revision is already approved';
    return undefined;
  }
  return ended ? `the job has ended; ${type} cannot follow ${ended.type}` : undefined;
}

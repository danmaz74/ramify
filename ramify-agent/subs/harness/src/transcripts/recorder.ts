import type {
  AgentEvent, AssistantBlock, ContentBlock, MessageEvent, SessionMode, SubmissionVerdict, ToolAction,
} from '../../subs/agent/src/interfaces/port.js';
import type {
  TranscriptAssistantBlock, TranscriptContentBlock, TranscriptHarnessDecision, TranscriptToolAction,
} from '../interfaces/protocol/transcripts.js';
import type { Role } from '../interfaces/protocol/runs.js';
import type {
  ContinueRelation, ForkRelation, InvocationOutcome, InvocationWork, ReplaceRelation, RequestRelation,
} from '../run/records.js';
import type { TranscriptBodies, TranscriptEntryInput, TranscriptWriter } from './writer.js';

/*
 * What one invocation leaves in its session's transcript: its start, every
 * message, compaction and retry the port reports, the harness's own
 * decisions beside them, its end and the point that end is. An
 * implementation run and a standalone session write the same entries from
 * the same events.
 *
 * Port callbacks are synchronous, so entries are queued in the order they
 * arrive and written in that order. A failed write never fails the session:
 * the first one is recorded as a coverage gap in the invocation's
 * observations, and the transcript goes on with the next entry.
 */

/** One check a post-write note reports, with the absolute path of the log the harness kept, or null. */
export interface PostWriteCheckNote {
  readonly paths: readonly string[];
  readonly mode: 'changed' | 'complete';
  readonly outcome: 'passed' | 'findings' | 'not-checked';
  readonly reason: string | null;
  readonly newFindings: number;
  readonly log: string | null;
}

/**
 * A decision of the harness, as the transcript records it. Each text is
 * what the agent was told or what was appended; the transcript holds it as
 * a body.
 */
export type HarnessNote =
  | {
      readonly kind: 'guard-denied'; readonly callId: string; readonly tool: string;
      readonly verdict: 'blocked-scope' | 'blocked-unresolved'; readonly requested: string; readonly reason: string;
      readonly text: string;
    }
  | {
      readonly kind: 'submission-verdict'; readonly callId: string; readonly tool: string;
      readonly verdict: 'accepted' | 'rejected' | 'refused'; readonly text: string | null;
    }
  | {
      readonly kind: 'post-write-check'; readonly callId: string | null; readonly atCompletion: boolean;
      readonly checks: readonly PostWriteCheckNote[]; readonly text: string | null;
    }
  | { readonly kind: 'read-reminder'; readonly callId: string | null; readonly text: string }
  | {
      readonly kind: 'brief-appended'; readonly decision: string; readonly generation: number;
      readonly outcome: 'appended' | 'already-present'; readonly text: string;
    }
  | { readonly kind: 'note-appended'; readonly text: string }
  | { readonly kind: 'budget-reached'; readonly tokens: number | null; readonly threshold: number | null; readonly reportDelivered: boolean };

/**
 * How equipment tells the transcript what the harness decided while a
 * session runs. Neither call waits, and neither can fail the session.
 */
export interface TranscriptNotes {
  note(note: HarnessNote): void;
  /** The complete output of one call, a file the harness keeps, which the call's result names. */
  output(callId: string, path: string): void;
}

/** What an invocation's `started` entry is written from, before its session starts. */
export interface InvocationStart {
  readonly role: Role;
  readonly work: InvocationWork;
  readonly start: 'opened' | 'continued';
  readonly requested: SessionMode;
  readonly continues?: ContinueRelation | undefined;
  readonly fork?: ForkRelation | undefined;
  readonly replaces?: ReplaceRelation | undefined;
  readonly requestedBy?: RequestRelation | undefined;
  readonly executor: string;
  readonly model: string | null;
  readonly systemPrompt: string;
  readonly prompt: string;
}

/** What an invocation's `ended` entry is written from. */
export interface InvocationEnd {
  readonly ended: InvocationOutcome['ended'];
  readonly interruption: NonNullable<InvocationOutcome['interruption']> | 'stopped-by-caller' | null;
  readonly error: string | null;
  /** The start that was actual; null where the session never ran, or recovery closed the invocation. */
  readonly actual: { readonly mode: SessionMode; readonly degradedReason: string | null } | null;
}

type Build = (bodies: TranscriptBodies) => TranscriptEntryInput | Promise<TranscriptEntryInput>;

export class InvocationTranscript implements TranscriptNotes {
  /** Set once the end is being written: what the session reports afterwards is not its transcript. */
  private closed = false;
  private gapRecorded = false;
  private gapWrite: Promise<void> = Promise.resolve();
  private readonly outputs = new Map<string, string>();

  /**
   * `gap` records a coverage gap in the invocation's observations. It is
   * called at most once, for the first entry that could not be written.
   */
  constructor(
    private readonly writer: TranscriptWriter,
    readonly invocation: string,
    private readonly gap: (detail: string) => Promise<void>,
  ) {}

  /** Writes the start. It is awaited before the session starts, so it precedes the model call. */
  started(start: InvocationStart): Promise<void> {
    return this.append('started', async bodies => ({
      type: 'started',
      invocation: this.invocation,
      role: start.role,
      work: { ...start.work },
      start: start.start,
      requested: start.requested,
      continues: start.continues ?? null,
      fork: start.fork ?? null,
      replaces: start.replaces ?? null,
      requestedBy: start.requestedBy ?? null,
      executor: start.executor,
      model: start.model,
      // Every invocation of a role shares its system prompt, so it is
      // stored once by content, whatever its size.
      systemPrompt: await bodies.text(start.systemPrompt, 'stored'),
      prompt: await bodies.text(start.prompt),
    }));
  }

  /** Queues the entry a port event makes, if it makes one. */
  event(event: AgentEvent): void {
    if (this.closed) return;
    if (event.type === 'message') {
      const output = event.role === 'tool-result' ? this.outputs.get(event.callId) : undefined;
      void this.append(`${event.role} message`, messageEntry(event, this.invocation, output));
    } else if (event.type === 'compaction' || event.type === 'retry') {
      void this.append(event.type, () => ({ ...event, invocation: this.invocation }));
    }
  }

  note(note: HarnessNote): void {
    if (this.closed) return;
    void this.append(note.kind, harnessEntry(note, this.invocation));
  }

  output(callId: string, path: string): void {
    this.outputs.set(callId, path);
  }

  /** Writes the end and the point it is, after every entry queued before it. */
  async end(end: InvocationEnd): Promise<void> {
    this.closed = true;
    await this.append('ended', () => ({
      type: 'ended',
      invocation: this.invocation,
      ended: end.ended,
      interruption: end.interruption,
      error: end.error,
      actual: end.actual === null ? null : { ...end.actual },
    }));
    await this.append('point', () => ({
      type: 'point',
      invocation: this.invocation,
      point: { session: this.writer.session, invocation: this.invocation },
    }));
  }

  /** Waits for every entry queued so far, and for the gap a failed one records. */
  async drain(): Promise<void> {
    await this.writer.drain();
    await this.gapWrite;
  }

  private append(what: string, build: Build): Promise<void> {
    return this.writer.append(build).then(() => undefined, (error: unknown) => {
      if (this.gapRecorded) return;
      this.gapRecorded = true;
      this.gapWrite = this.gap(
        `the ${what} entry of ${this.writer.session}'s transcript could not be written, and later entries of this invocation may be missing too: ${message(error)}`,
      ).catch(() => undefined);
    });
  }
}

/**
 * Writes what the harness appended to a kept session between its
 * invocations, and, for a brief, the point the append is. It rejects when
 * an entry could not be written; there is no invocation to record the gap
 * against.
 */
export async function recordAppend(
  writer: TranscriptWriter,
  note: Extract<HarnessNote, { readonly kind: 'brief-appended' | 'note-appended' }>,
  append: number | null,
): Promise<void> {
  await writer.append(harnessEntry(note, null));
  if (append !== null) {
    await writer.append(() => ({ type: 'point', invocation: null, point: { session: writer.session, append } }));
  }
}

/** A submission verdict as a note: accepted, rejected with its errors, or refused with no attempt left. */
export function verdictNote(callId: string, tool: string, verdict: SubmissionVerdict): HarnessNote {
  if (verdict.accepted) return { kind: 'submission-verdict', callId, tool, verdict: 'accepted', text: verdict.text ?? null };
  return { kind: 'submission-verdict', callId, tool, verdict: 'final' in verdict ? 'refused' : 'rejected', text: verdict.errors.join('\n') };
}

function messageEntry(event: MessageEvent, invocation: string, output: string | undefined): Build {
  return async bodies => {
    switch (event.role) {
      case 'user':
        return { type: 'message', invocation, role: 'user', blocks: await contentBlocks(event.blocks, bodies) };
      case 'assistant':
        return {
          type: 'message',
          invocation,
          role: 'assistant',
          blocks: await assistantBlocks(event.blocks, bodies),
          usage: event.usage === null ? null : { ...event.usage },
          detail: {
            ...event.detail,
            cost: event.detail.cost === null ? null : { ...event.detail.cost },
            cacheWrites: event.detail.cacheWrites === null ? null : { ...event.detail.cacheWrites },
          },
        };
      case 'tool-result':
        return {
          type: 'message',
          invocation,
          role: 'tool-result',
          callId: event.callId,
          tool: event.tool,
          isError: event.isError,
          blocks: await contentBlocks(event.blocks, bodies),
          output: output === undefined ? null : await bodies.file(output),
        };
    }
  };
}

async function contentBlocks(blocks: readonly ContentBlock[], bodies: TranscriptBodies): Promise<TranscriptContentBlock[]> {
  const written: TranscriptContentBlock[] = [];
  for (const block of blocks) {
    written.push(block.type === 'text'
      ? { type: 'text', body: await bodies.text(block.text) }
      : { type: 'other', kind: block.kind, description: block.description });
  }
  return written;
}

async function assistantBlocks(blocks: readonly AssistantBlock[], bodies: TranscriptBodies): Promise<TranscriptAssistantBlock[]> {
  const written: TranscriptAssistantBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        written.push({ type: 'text', body: await bodies.text(block.text) });
        break;
      case 'thinking':
        written.push({ type: 'thinking', visibility: block.visibility, body: await bodies.text(block.text) });
        break;
      case 'tool-call':
        written.push({
          type: 'tool-call', callId: block.callId, tool: block.tool, action: actionOf(block.action),
          input: await bodies.text(JSON.stringify(block.input) ?? 'null'),
        });
        break;
      case 'other':
        written.push({ type: 'other', kind: block.kind, description: block.description });
        break;
    }
  }
  return written;
}

function actionOf(action: ToolAction): TranscriptToolAction {
  switch (action.kind) {
    case 'read': return { kind: 'read', path: action.path, range: action.range === null ? null : { ...action.range } };
    case 'write': return { kind: 'write', paths: [...action.paths] };
    default: return { ...action };
  }
}

function harnessEntry(note: HarnessNote, invocation: string | null): Build {
  const entry = (decision: TranscriptHarnessDecision): TranscriptEntryInput => ({ type: 'harness', invocation, decision });
  return async bodies => {
    switch (note.kind) {
      case 'guard-denied':
      case 'read-reminder':
      case 'brief-appended':
      case 'note-appended':
        return entry({ ...note, text: await bodies.text(note.text) });
      case 'submission-verdict':
        return entry({ ...note, text: note.text === null ? null : await bodies.text(note.text) });
      case 'post-write-check': {
        const checks = [];
        for (const check of note.checks) {
          checks.push({ ...check, paths: [...check.paths], log: check.log === null ? null : await bodies.file(check.log) });
        }
        return entry({ ...note, checks, text: note.text === null ? null : await bodies.text(note.text) });
      }
      case 'budget-reached':
        return entry({ ...note });
    }
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

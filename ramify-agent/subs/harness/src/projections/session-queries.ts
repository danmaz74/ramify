import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { z } from 'zod';
import type { InvocationEvaluation } from '../interfaces/protocol/runs.js';
import {
  sessionBodyHashSchema, sessionQueryLimits, standaloneSessionIdSchema,
  type RunSessionView, type RunSessionResponse, type RunSessionsResponse, type SessionBodyResponse, type SessionCursor, type SessionListResponse,
  type SessionRef, type SessionListEntry, type SessionTranscriptResponse, type SessionUpdatesResponse, type StandaloneSessionResponse,
  type TranscriptPage, type UnservedSessionSource,
} from '../interfaces/protocol/sessions.js';
import { runLayout } from '../run/records.js';
import {
  sessionLayout, sessionOutcomeSchema, sessionRecordSchema, sessionsDirectory,
  type SessionOutcomeRecord, type SessionRecord,
} from '../sessions/records.js';
import { TranscriptPages, type PageBounds, type TranscriptPageRead } from '../transcripts/pages.js';
import { readTranscript } from '../transcripts/writer.js';
import { ProjectionError, runView, type RunView } from './inputs.js';
import { evaluationOf, invocationEvaluation, readObservationLog } from './metrics.js';
import { servedRun, type RunSource } from './queries.js';
import { orderSessions, runSessionEntry, runSessionViews, standaloneEntry } from './sessions.js';

/*
 * The session queries. Every answer is a projection of a run's log and
 * records, of a standalone session's records, or of a transcript; nothing
 * here writes.
 *
 * A run's sessions are derived once per run version and kept: the project's
 * list and every poll compare each run's version with the one they were
 * derived at, and derive again only the runs that changed. An ended
 * invocation's evaluation is final, so it is read once; the evaluation of an
 * invocation still awaited is read by every query. A finished standalone
 * session never changes, so its records are read once. Transcripts are read
 * through `TranscriptPages`, which reads only what was appended since.
 */

/** A run's sessions as its log derived them at one version. */
interface RunSessionsAt {
  readonly version: number;
  readonly view: RunView;
  readonly sessions: readonly RunSessionView[];
}

/** A standalone session's records, as a reader finds them. */
interface StandaloneRead {
  readonly directory: string;
  readonly record: SessionRecord;
  readonly outcome: SessionOutcomeRecord | null;
}

const runKey = (planId: string, runId: string): string => `${planId}\u0000${runId}`;

export class SessionQueries {
  private readonly runs = new Map<string, RunSessionsAt>();
  private readonly evaluations = new Map<string, InvocationEvaluation>();
  private readonly finishedStandalone = new Map<string, StandaloneRead>();
  private readonly pages = new TranscriptPages();

  constructor(private readonly source: RunSource) {}

  /** Every session of the project, in the project's order, one page from `offset`. */
  async list(offset: number): Promise<SessionListResponse> {
    const entries: SessionListEntry[] = [];
    const unserved: UnservedSessionSource[] = [];
    for (const { planId, runId, version } of this.source.runVersions()) {
      try {
        const at = await this.at(planId, runId, version);
        entries.push(...at.sessions.map(session => runSessionEntry(planId, runId, session)));
      } catch (error) {
        if (!(error instanceof ProjectionError)) throw error;
        unserved.push({ source: 'run', path: join('plans', planId, '.harness', 'jobs', runId), message: error.message });
      }
    }
    for (const found of await this.standaloneSessions()) {
      if ('error' in found) {
        unserved.push({ source: 'standalone', path: join(sessionsDirectory, found.id), message: found.error.message });
        continue;
      }
      const last = found.outcome === null ? await this.pages.last(join(found.directory, sessionLayout.transcript)) : null;
      entries.push(standaloneEntry(found.record, found.outcome, last?.at ?? null));
    }
    const ordered = orderSessions(entries);
    const page = ordered.slice(offset, offset + sessionQueryLimits.sessions);
    const next = offset + page.length;
    return { sessions: page, total: ordered.length, offset, next: next < ordered.length ? next : null, unserved };
  }

  /** A run's sessions with their invocations' evaluations, at the run's current version. */
  async runSessions(planId: string, runId: string): Promise<RunSessionsResponse> {
    const at = await this.at(planId, runId);
    const sessions = at.sessions.slice(0, sessionQueryLimits.runSessions);
    return { version: at.version, sessions: await this.evaluated(planId, runId, at, sessions), total: at.sessions.length };
  }

  /** A targeted session can be read even when it lies beyond the bounded run list. */
  async runSession(planId: string, runId: string, session: string): Promise<RunSessionResponse> {
    const at = await this.at(planId, runId);
    const found = at.sessions.find(candidate => candidate.session === session);
    if (found === undefined) throw new ProjectionError('not-found', `Run ${runId} has no session ${session}`);
    return { version: at.version, session: (await this.evaluated(planId, runId, at, [found]))[0]! };
  }

  /** The entries of one session after `after`. */
  async transcript(ref: SessionRef, after: number): Promise<SessionTranscriptResponse> {
    const path = ref.source === 'run'
      ? this.transcriptOf(await this.at(ref.planId, ref.runId), ref.runId, ref.session)
      : join((await this.standalone(ref.session)).directory, sessionLayout.transcript);
    return { session: ref, page: pageOf(await this.pages.page(path, after, { entries: sessionQueryLimits.entries, bytes: sessionQueryLimits.pageBytes })) };
  }

  /**
   * One poll of a run: every session changed after `version`, and the
   * entries of each followed session after its cursor. The sessions are
   * derived first, so a state committed before the poll is in its answer;
   * an entry written after that version may arrive before the state it
   * belongs to, which the next poll brings. The pages share one byte bound,
   * in the request's order.
   */
  async updates(planId: string, runId: string, version: number, cursors: readonly SessionCursor[]): Promise<SessionUpdatesResponse> {
    const at = await this.at(planId, runId);
    if (version > at.version) {
      throw new ProjectionError('invalid-request', `Version ${version} is after run ${runId}'s last event, ${at.version}`);
    }
    const paths = cursors.map(cursor => this.transcriptOf(at, runId, cursor.session));
    const changed = at.sessions.filter(session => session.changed.sequence > version).slice(0, sessionQueryLimits.runSessions);
    const sessions = await this.evaluated(planId, runId, at, changed);
    let budget: number = sessionQueryLimits.pageBytes;
    const transcripts: SessionUpdatesResponse['transcripts'] = [];
    for (const [index, cursor] of cursors.entries()) {
      const bounds: PageBounds = budget > 0 ? { entries: sessionQueryLimits.entries, bytes: budget } : { entries: 0, bytes: 0 };
      const read = await this.pages.page(paths[index]!, cursor.after, bounds);
      budget -= read.bytes;
      transcripts.push({ session: cursor.session, page: pageOf(read) });
    }
    return { version: at.version, sessions, transcripts };
  }

  /** A body of the run's content store. */
  async runBody(planId: string, runId: string, hash: string): Promise<SessionBodyResponse> {
    const at = await this.at(planId, runId);
    return blobOf(join(at.view.directory, runLayout.blobs), hash);
  }

  /** A file one of the run's session transcripts names, relative to the run's directory. */
  async runFile(planId: string, runId: string, session: string, path: string): Promise<SessionBodyResponse> {
    const at = await this.at(planId, runId);
    return namedFile(at.view.directory, this.transcriptOf(at, runId, session), path);
  }

  /** One standalone session: its summary, prompt, outcome and evaluation. */
  async standaloneSession(id: string): Promise<StandaloneSessionResponse> {
    const found = await this.standalone(id);
    const { record, outcome } = found;
    const last = outcome === null ? await this.pages.last(join(found.directory, sessionLayout.transcript)) : null;
    return {
      session: standaloneEntry(record, outcome, last?.at ?? null),
      prompt: record.prompt,
      outcome: outcome === null
        ? null
        : { ended: outcome.ended, interruption: outcome.interruption ?? null, error: outcome.error ?? null, finishedAt: outcome.finishedAt },
      // The session is its own one invocation, and a writer. It records no
      // line events, which its lines say rather than showing none.
      evaluation: evaluationOf({
        invocation: { id: record.id, role: record.role, work: {}, writer: true },
        outcome,
        observations: await readObservationLog(join(found.directory, sessionLayout.observations), sessionLayout.observations),
        lines: { unavailable: 'a standalone session records no line events' },
      }),
    };
  }

  async standaloneBody(id: string, hash: string): Promise<SessionBodyResponse> {
    return blobOf(join((await this.standalone(id)).directory, sessionLayout.blobs), hash);
  }

  /** A file the standalone session's transcript names, relative to its directory. */
  async standaloneFile(id: string, path: string): Promise<SessionBodyResponse> {
    const { directory } = await this.standalone(id);
    return namedFile(directory, join(directory, sessionLayout.transcript), path);
  }

  /**
   * A served run's sessions at its current version: the kept ones where the
   * version has not moved, derived again where it has. `known` is the
   * version the caller already read, which saves looking it up.
   */
  private async at(planId: string, runId: string, known?: number): Promise<RunSessionsAt> {
    const version = known ?? this.source.runVersions().find(entry => entry.planId === planId && entry.runId === runId)?.version;
    const key = runKey(planId, runId);
    const cached = this.runs.get(key);
    if (version !== undefined && cached !== undefined && cached.version === version) return cached;
    const view = runView(await servedRun(this.source, planId, runId));
    const at: RunSessionsAt = { version: view.events.at(-1)?.sequence ?? 0, view, sessions: runSessionViews(view) };
    this.runs.set(key, at);
    return at;
  }

  /** The sessions, with each invocation's evaluation. */
  private async evaluated(planId: string, runId: string, at: RunSessionsAt, sessions: readonly RunSessionView[]): Promise<RunSessionView[]> {
    const result: RunSessionView[] = [];
    for (const session of sessions) {
      const invocations = [];
      for (const invocation of session.invocations) {
        invocations.push({ ...invocation, evaluation: await this.evaluation(planId, runId, at.view, invocation.invocation) });
      }
      result.push({ ...session, invocations });
    }
    return result;
  }

  private async evaluation(planId: string, runId: string, view: RunView, id: string): Promise<InvocationEvaluation | null> {
    const key = `${runKey(planId, runId)}\u0000${id}`;
    const kept = this.evaluations.get(key);
    if (kept !== undefined) return kept;
    const invocation = view.records.invocations.get(id);
    if (invocation === undefined) return null;
    const evaluation = await invocationEvaluation(view, invocation);
    if (view.records.outcomes.has(id)) this.evaluations.set(key, evaluation);
    return evaluation;
  }

  /** A session's transcript file; a session the run never opened is not found. */
  private transcriptOf(at: RunSessionsAt, runId: string, session: string): string {
    if (!at.sessions.some(candidate => candidate.session === session)) {
      throw new ProjectionError('not-found', `Run ${runId} has no session ${session}`);
    }
    return join(at.view.directory, runLayout.transcript(session));
  }

  /** Every standalone session directory of the project, read, or with why it cannot be. */
  private async standaloneSessions(): Promise<Array<StandaloneRead | { readonly id: string; readonly error: ProjectionError }>> {
    let names: string[];
    try {
      names = (await readdir(join(this.source.projectRoot, sessionsDirectory), { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && standaloneSessionIdSchema.safeParse(entry.name).success)
        .map(entry => entry.name)
        .sort();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return [];
      throw error;
    }
    const found: Array<StandaloneRead | { id: string; error: ProjectionError }> = [];
    for (const id of names) {
      try {
        found.push(await this.standalone(id));
      } catch (error) {
        if (!(error instanceof ProjectionError)) throw error;
        found.push({ id, error });
      }
    }
    return found;
  }

  /** One standalone session's records. A finished one is kept, since nothing changes it again. */
  private async standalone(id: string): Promise<StandaloneRead> {
    const kept = this.finishedStandalone.get(id);
    if (kept !== undefined) return kept;
    if (!standaloneSessionIdSchema.safeParse(id).success) throw new ProjectionError('not-found', `No standalone session "${id}"`);
    const directory = join(this.source.projectRoot, sessionsDirectory, id);
    const shown = (name: string): string => join(sessionsDirectory, id, name);
    const rawText = await readFile(join(directory, sessionLayout.session), 'utf8').catch(error => {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
      throw error;
    });
    let raw: { policy?: { version?: unknown } } | null = null;
    if (rawText !== null) {
      try { raw = JSON.parse(rawText) as { policy?: { version?: unknown } } | null; } catch { throw new ProjectionError('unreadable', `${shown(sessionLayout.session)} is not JSON`, [shown(sessionLayout.session)]); }
    }
    if (raw !== null && raw.policy?.version !== 'run-policy/7') throw new ProjectionError('unsupported-version', `Run policy ${String(raw.policy?.version ?? '(missing policy)')} is refused by run-policy/7; a fresh run is required`);
    const record = await readRecord(join(directory, sessionLayout.session), shown(sessionLayout.session), sessionRecordSchema, 'ramify-agent.session/2');
    if (record === null) throw new ProjectionError('not-found', `No standalone session "${id}"`);
    if (record.id !== id) throw new ProjectionError('unreadable', `${shown(sessionLayout.session)} names another session, ${record.id}`, [shown(sessionLayout.session)]);
    const outcome = await readRecord(join(directory, sessionLayout.outcome), shown(sessionLayout.outcome), sessionOutcomeSchema, 'ramify-agent.session-outcome/1');
    const read = { directory, record, outcome };
    if (outcome !== null) this.finishedStandalone.set(id, read);
    return read;
  }
}

/** A page as the protocol states it. */
function pageOf(read: TranscriptPageRead): TranscriptPage {
  return {
    file: read.missing ? 'missing' : 'present',
    entries: [...read.entries],
    cursor: read.cursor,
    more: read.more,
    partial: read.partial,
    unreadable: [...read.unreadable],
  };
}

/** A record of one schema version, or null where the file is not there. */
async function readRecord<T>(path: string, shown: string, schema: z.ZodType<T>, version: string): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new ProjectionError('unreadable', `${shown} is not JSON`, [shown]);
  }
  const declared = (document as { schema?: unknown } | null)?.schema;
  if (declared !== version) {
    throw new ProjectionError('unsupported-version', `${shown} declares ${typeof declared === 'string' ? declared : 'no schema'}; this harness reads ${version}`, [shown]);
  }
  const parsed = schema.safeParse(document);
  if (parsed.success) return parsed.data;
  throw new ProjectionError('unreadable', `${shown} does not satisfy ${version}`, [
    shown, ...parsed.error.issues.map(issue => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`),
  ]);
}

/** One blob of a content store, by its hash. */
async function blobOf(directory: string, hash: string): Promise<SessionBodyResponse> {
  if (!sessionBodyHashSchema.safeParse(hash).success) throw new ProjectionError('invalid-request', `"${hash}" is not a content hash`);
  const body = await boundedRead(join(directory, hash));
  if (body === null) throw new ProjectionError('not-found', `The content store holds no body ${hash}`);
  return body;
}

/**
 * A file the transcript names as a body, relative to `root`. A path the
 * transcript does not name, or one outside `root`, is not served: a body
 * query reads raw output the transcript points to, nothing else of the
 * directory.
 */
async function namedFile(root: string, transcript: string, path: string): Promise<SessionBodyResponse> {
  const named = new Set<string>();
  for (const entry of (await readTranscript(transcript)).entries) collectFiles(entry, named);
  const absolute = join(root, ...path.split('/'));
  const inside = relative(root, absolute);
  if (!named.has(path) || inside.startsWith('..') || inside === '') {
    throw new ProjectionError('not-found', `The transcript names no file ${path}`);
  }
  const body = await boundedRead(absolute);
  if (body === null) throw new ProjectionError('not-found', `The file ${path} the transcript names is no longer there`);
  return body;
}

/** Every `file` body's path in an entry. */
function collectFiles(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectFiles(item, into);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const body = node as { stored?: unknown; path?: unknown };
  if (body.stored === 'file' && typeof body.path === 'string') into.add(body.path);
  for (const value of Object.values(node)) collectFiles(value, into);
}

/** At most the body bound of a file, cut at a character boundary; null where it is not there. */
async function boundedRead(path: string): Promise<SessionBodyResponse | null> {
  let size: number;
  try {
    const found = await stat(path);
    if (!found.isFile()) return null;
    size = found.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const limit = Math.min(size, sessionQueryLimits.bodyBytes);
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(limit);
    let read = 0;
    while (read < limit) {
      const { bytesRead } = await handle.read(buffer, read, limit - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    // A streaming decode leaves a character the bound cut in half undecoded.
    const content = new TextDecoder('utf-8').decode(buffer.subarray(0, read), { stream: size > limit });
    return { content, bytes: size, truncated: size > limit };
  } finally {
    await handle.close();
  }
}

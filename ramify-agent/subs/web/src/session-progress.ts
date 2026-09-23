import { useEffect, useState } from 'react';
import type {
  RunSessionView, SessionRef, ShownSessionState, StandaloneSessionResponse, TranscriptPage,
} from '../../harness/src/interfaces/protocol/sessions.js';
import type { TranscriptEntry } from '../../harness/src/interfaces/protocol/transcripts.js';
import { ClientError, type ProtocolClient } from './client.js';
import { sessionKey } from './routes.js';

/** What the harness says of the session itself: one of a run's, with the run's other sessions, or a standalone one. */
export type SessionDetail =
  | {
    readonly source: 'run';
    /** The run version the sessions were last derived at. */
    readonly version: number;
    readonly session: RunSessionView;
    /** Every session of the run read so far, by ID, for the links between them. */
    readonly sessions: ReadonlyMap<string, RunSessionView>;
  }
  | { readonly source: 'standalone'; readonly standalone: StandaloneSessionResponse };

export interface SessionTranscript {
  readonly detail: SessionDetail | undefined;
  /** Every entry received, in order, each once. */
  readonly entries: readonly TranscriptEntry[];
  /** Whether the transcript file is there; undefined until the first page. */
  readonly file: TranscriptPage['file'] | undefined;
  /** Complete lines the harness could not read as entries, by line number. */
  readonly unreadable: readonly number[];
  /** Whether the page still asks for newer entries and state. */
  readonly following: boolean;
  /** The last failure to read; what was read stays shown. */
  readonly error: Error | undefined;
}

const empty: SessionTranscript = { detail: undefined, entries: [], file: undefined, unreadable: [], following: false, error: undefined };

/** A state the harness will not change again. */
export function isFinal(state: ShownSessionState): boolean {
  return state === 'finished' || state === 'interrupted';
}

/** Polls with no new entry, after the session's state is final, before the page stops asking. */
const quietPolls = 2;

/**
 * A session's detail and its transcript, followed while it can change.
 *
 * The transcript is read page by page after a cursor, the last entry
 * number received. A run's session is then followed with the run's update
 * poll every `interval` milliseconds: one request answers the sessions whose
 * state changed since the last run version and the entries after the cursor,
 * and a page that says `more` is followed at once. The page stops asking once
 * the session is finished or interrupted and its entries are complete: the
 * last is an invocation's end or point, or two polls brought nothing, since
 * an end's entries can follow its state by one poll. A standalone session is
 * never followed: the server never sees one running.
 */
export function useSessionTranscript(client: ProtocolClient, ref: SessionRef, interval = 1000): SessionTranscript {
  const key = sessionKey(ref);
  const [state, setState] = useState<SessionTranscript & { key: string }>({ key: '', ...empty });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detail: SessionDetail | undefined;
    let entries: TranscriptEntry[] = [];
    let cursor = 0;
    let file: TranscriptPage['file'] | undefined;
    const unreadable = new Set<number>();
    let quiet = 0;

    const shownState = (): ShownSessionState | undefined =>
      detail === undefined ? undefined : detail.source === 'run' ? detail.session.state : detail.standalone.session.state;
    const complete = (): boolean => {
      const last = entries.at(-1);
      return file === 'missing' || last?.type === 'point' || last?.type === 'ended' || quiet >= quietPolls;
    };
    const settled = (more: boolean): boolean => {
      if (detail?.source === 'standalone') return true;
      const current = shownState();
      return current !== undefined && isFinal(current) && !more && complete();
    };
    const publish = (following: boolean, error?: Error) => {
      if (cancelled) return;
      setState({ key, detail, entries, file, unreadable: [...unreadable].sort((a, b) => a - b), following, error });
    };
    const absorb = (page: TranscriptPage): number => {
      file = page.file;
      for (const line of page.unreadable) unreadable.add(line);
      const fresh = page.entries.filter(entry => entry.n > cursor);
      if (fresh.length > 0) entries = entries.concat(fresh);
      cursor = Math.max(cursor, page.cursor, fresh.at(-1)?.n ?? 0);
      return fresh.length;
    };
    const failure = (error: unknown) => error instanceof Error ? error : new Error(String(error));
    const schedule = (step: () => Promise<void>, delay: number) => {
      if (!cancelled) timer = setTimeout(() => void step(), delay);
    };

    const poll = async (): Promise<void> => {
      if (detail?.source !== 'run' || ref.source !== 'run') return;
      let more = false;
      try {
        const answer = await client.pollSessions(ref.planId, ref.runId, detail.version, [{ session: ref.session, after: cursor }]);
        if (cancelled) return;
        const sessions = new Map(detail.sessions);
        for (const session of answer.sessions) sessions.set(session.session, session);
        detail = { source: 'run', version: answer.version, session: sessions.get(ref.session) ?? detail.session, sessions };
        const page = answer.transcripts.find(transcript => transcript.session === ref.session)?.page;
        const added = page === undefined ? 0 : absorb(page);
        more = page?.more ?? false;
        quiet = isFinal(detail.session.state) && added === 0 ? quiet + 1 : 0;
      } catch (error) {
        if (cancelled) return;
        publish(true, failure(error));
        schedule(poll, interval);
        return;
      }
      const done = settled(more);
      publish(!done);
      if (!done) schedule(poll, more ? 0 : interval);
    };

    const start = async (): Promise<void> => {
      try {
        if (ref.source === 'run') {
          const answer = await client.getRunSessions(ref.planId, ref.runId);
          const sessions = new Map(answer.sessions.map(session => [session.session, session] as const));
          const session = sessions.get(ref.session);
          if (session === undefined) throw new ClientError('protocol', `The run has no session ${ref.session}`, 'not-found');
          detail = { source: 'run', version: answer.version, session, sessions };
        } else {
          detail = { source: 'standalone', standalone: await client.getStandaloneSession(ref.session) };
        }
        for (;;) {
          const { page } = await client.getTranscript(ref, cursor);
          if (cancelled) return;
          absorb(page);
          if (!page.more) break;
        }
      } catch (error) {
        if (cancelled) return;
        // The harness's refusal, such as an unknown session, is final; no answer is tried again.
        const refused = error instanceof ClientError && error.kind === 'protocol';
        publish(!refused, failure(error));
        if (!refused) schedule(start, interval);
        return;
      }
      const done = settled(false);
      publish(!done);
      if (!done) schedule(poll, interval);
    };

    void start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, key, interval]);
  return state.key === key ? state : empty;
}

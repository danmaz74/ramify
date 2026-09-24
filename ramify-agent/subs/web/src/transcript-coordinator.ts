import { useEffect, useRef, useState } from 'react';
import type { RunSessionView, TranscriptPage } from '../../harness/src/interfaces/protocol/sessions.js';
import type { TranscriptEntry } from '../../harness/src/interfaces/protocol/transcripts.js';
import { ClientError, type ProtocolClient } from './client.js';
import { isFinal, type SessionDetail, type SessionTranscript } from './session-progress.js';

interface Reading {
  detail: Extract<SessionDetail, { source: 'run' }> | undefined;
  entries: TranscriptEntry[];
  cursor: number;
  file: TranscriptPage['file'] | undefined;
  unreadable: Set<number>;
  following: boolean;
  error: Error | undefined;
  detailError: Error | undefined;
  loading: boolean;
  quiet: number;
  more: boolean;
}

const pollLimit = 50;
const errorOf = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));
const snapshot = (reading: Reading): SessionTranscript => ({
  detail: reading.detail, entries: [...reading.entries], file: reading.file,
  unreadable: [...reading.unreadable].sort((a, b) => a - b), following: reading.following, error: reading.error,
});
const empty: SessionTranscript = { detail: undefined, entries: [], file: undefined, unreadable: [], following: false, error: undefined };

function absorb(reading: Reading, page: TranscriptPage): number {
  reading.file = page.file;
  for (const line of page.unreadable) reading.unreadable.add(line);
  const fresh = page.entries.filter(entry => entry.n > reading.cursor);
  reading.entries.push(...fresh);
  reading.cursor = Math.max(reading.cursor, page.cursor, fresh.at(-1)?.n ?? 0);
  reading.more = page.more;
  return fresh.length;
}

/** One run-wide reader batches all open cursors; no window creates its own poll. */
export function useTranscriptCoordinator(client: ProtocolClient, planId: string, runId: string,
  sessionIds: readonly string[], interval = 1000): ReadonlyMap<string, SessionTranscript> {
  const [shown, setShown] = useState<{ identity: string; readings: ReadonlyMap<string, SessionTranscript> }>(
    { identity: `${planId}/${runId}`, readings: new Map() });
  const recordsRef = useRef(new Map<string, Reading>());
  const identityRef = useRef(`${planId}/${runId}`);
  if (identityRef.current !== `${planId}/${runId}`) {
    recordsRef.current = new Map();
    identityRef.current = `${planId}/${runId}`;
  }
  const idsKey = [...new Set(sessionIds)].sort().join(',');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let round = 0;
    const records = recordsRef.current;
    const publish = () => { if (!cancelled) setShown({ identity: `${planId}/${runId}`,
      readings: new Map([...records].map(([id, reading]) => [id, snapshot(reading)])) }); };
    const next = (delay: number) => { clearTimeout(timer); if (!cancelled) timer = setTimeout(() => void poll(), delay); };
    const active = (id: string) => !cancelled && records.has(id);

    const load = async (id: string, reading: Reading) => {
      let failed = false;
      try {
        const answer = await client.getRunSession(planId, runId, id);
        if (!active(id)) return;
        reading.detail = { source: 'run', version: answer.version, session: answer.session,
          sessions: new Map([[id, answer.session]]) };
        reading.detailError = undefined;
        publish();
        do {
          const { page } = await client.getTranscript({ source: 'run', planId, runId, session: id }, reading.cursor);
          if (!active(id)) return;
          absorb(reading, page);
          publish();
        } while (reading.more);
        reading.following = reading.file !== 'missing';
        reading.error = undefined;
      } catch (error) {
        if (!active(id)) return;
        failed = true;
        reading.error = errorOf(error);
        reading.following = !(error instanceof ClientError && error.kind === 'protocol');
      } finally {
        if (active(id)) { reading.loading = false; publish(); next(failed ? interval : 0); }
      }
    };

    const poll = async () => {
      if (cancelled || polling) return;
      for (const [id, reading] of records) if (!reading.loading && reading.following && reading.detail === undefined) {
        reading.loading = true;
        void load(id, reading);
      }
      const pending = [...records].filter(([, reading]) => !reading.loading && reading.following && reading.detail);
      if (pending.length === 0) return;
      // Rotate the first cursor: the server shares a byte budget within each batch.
      const offset = round++ % pending.length;
      const ordered = pending.slice(offset).concat(pending.slice(0, offset));
      polling = true;
      let immediate = false;
      for (let start = 0; start < ordered.length && !cancelled; start += pollLimit) {
        const batch = ordered.slice(start, start + pollLimit);
        const version = Math.min(...batch.map(([, reading]) => reading.detail!.version));
        try {
          const answer = await client.pollSessions(planId, runId, version,
            batch.map(([session, reading]) => ({ session, after: reading.cursor })));
          if (cancelled) break;
          for (const [id, reading] of batch) {
            const prior = reading.detail!;
            const sessions = new Map(prior.sessions);
            for (const session of answer.sessions) sessions.set(session.session, session);
            let own: RunSessionView = sessions.get(id) ?? prior.session;
            // The changed-session list is bounded. A targeted read resolves an open session beyond it.
            if ((answer.version > prior.version && !answer.sessions.some(session => session.session === id) && !isFinal(own.state))
              || reading.detailError !== undefined) {
              try { own = (await client.getRunSession(planId, runId, id)).session; sessions.set(id, own); reading.detailError = undefined; }
              catch (error) { reading.detailError = errorOf(error); }
            }
            reading.detail = { source: 'run', version: answer.version, session: own, sessions };
            const page = answer.transcripts.find(transcript => transcript.session === id)?.page;
            if (page === undefined) { immediate = true; continue; }
            const added = absorb(reading, page);
            if (isFinal(own.state) && added === 0 && !page.more) reading.quiet++;
            else reading.quiet = 0;
            if (reading.quiet >= 2 || page.file === 'missing') reading.following = false;
            reading.error = reading.detailError;
            immediate ||= page.more;
          }
          publish();
        } catch (error) {
          if (cancelled) break;
          for (const [, reading] of batch) reading.error = errorOf(error);
          publish();
        }
      }
      polling = false;
      if (!cancelled && [...records.values()].some(reading => reading.following)) next(immediate ? 0 : interval);
    };

    const wanted = new Set(idsKey ? idsKey.split(',') : []);
    for (const id of records.keys()) if (!wanted.has(id)) records.delete(id);
    for (const id of wanted) {
      const reading: Reading = records.get(id) ?? { detail: undefined, entries: [], cursor: 0, file: undefined, unreadable: new Set(),
        following: false, error: undefined, detailError: undefined, loading: true, quiet: 0, more: false };
      records.set(id, reading);
      if (reading.detail === undefined || reading.loading) {
        reading.loading = true;
        void load(id, reading);
      }
    }
    publish();
    next(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, planId, runId, idsKey, interval]);
  return new Map(sessionIds.map(id => [id, shown.identity === `${planId}/${runId}` ? shown.readings.get(id) ?? empty : empty]));
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectedRunEvent, RunSnapshot } from '../../harness/src/interfaces/protocol/runs.js';
import type { ProtocolClient } from './client.js';
import { useQuery, type QueryState } from './use-query.js';

export interface RunProgress {
  readonly run: RunSnapshot | undefined;
  readonly events: readonly ProjectedRunEvent[];
  /** The last failure to read the run; the last state read stays shown. */
  readonly error: Error | undefined;
}

/**
 * A run's snapshot and every projected event so far, read after a cursor:
 * every page at once, then again every `interval` milliseconds while the run
 * runs. A page that is closed and opened again starts from cursor 0 and reads
 * the same events; nothing it does reaches the run.
 */
export function useRunProgress(client: ProtocolClient, planId: string, runId: string, interval = 1000): RunProgress {
  const key = `${planId}/${runId}`;
  const [progress, setProgress] = useState<RunProgress & { key: string }>({ key: '', run: undefined, events: [], error: undefined });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    let events: ProjectedRunEvent[] = [];
    let run: RunSnapshot | undefined;
    const poll = async () => {
      try {
        for (;;) {
          const page = await client.getEvents(planId, runId, cursor);
          if (cancelled) return;
          events = events.concat(page.events.filter(event => event.sequence > cursor));
          cursor = page.cursor;
          run = page.run;
          if (!page.more) break;
        }
        setProgress({ key, run, events, error: undefined });
        if (run?.state !== 'running') return;
      } catch (error) {
        if (cancelled) return;
        setProgress({ key, run, events, error: error instanceof Error ? error : new Error(String(error)) });
      }
      timer = setTimeout(() => void poll(), interval);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, planId, runId, interval, key]);
  return progress.key === key ? progress : { run: undefined, events: [], error: undefined };
}

/**
 * A query of the run that is read again whenever the run's version moves,
 * keeping the previous answer on the page until the new one arrives.
 */
export function useRunQuery<T>(key: string, version: number | undefined, load: () => Promise<T>): QueryState<T> {
  const { state, reload } = useQuery(key, load);
  const seen = useRef(version);
  const refresh = useCallback(() => reload(), [reload]);
  useEffect(() => {
    if (version === undefined || seen.current === version) return;
    seen.current = version;
    refresh();
  }, [version, refresh]);
  return state;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExplorerDependencyModel } from '../../service-api/src/interfaces/explorer-dependencies.js';
import type { ContextRevision } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { ExplorerClient } from './published-project-view.js';

export type DependencyViewPhase = 'idle' | 'waiting' | 'analyzing' | 'ready' | 'superseded' | 'unavailable';

/** Contract C7: the dependency result of the displayed project view. */
export interface PublishedDependencyView {
  readonly data: ExplorerDependencyModel | null;
  readonly phase: DependencyViewPhase;
  readonly reason: string | null;
  readonly isStale: boolean;
  /** Requests the displayed revision again unless its result is already ready. */
  refresh(): void;
}

/** A pending result is polled no more often than this. */
export const minimumDependencyPollMs = 1000;

interface HeldResult {
  /** The displayed revision this result was requested for. */
  readonly revision: ContextRevision | null;
  readonly data: ExplorerDependencyModel | null;
  readonly phase: DependencyViewPhase;
  readonly reason: string | null;
}

const idle: HeldResult = { revision: null, data: null, phase: 'idle', reason: null };

const readyFor = (held: HeldResult, revision: ContextRevision): boolean =>
  held.phase === 'ready' && held.data !== null && held.revision !== null
    && held.revision.revision === revision.revision
    && held.data.inputId === revision.fingerprints.inputId;

const visible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * Requests the dependency result of the displayed project revision once that view is ready. A pending
 * result is polled while the page is visible, at least one second apart; ready, superseded and
 * unavailable stop polling. A result is shown only for the exact revision and input ID of the displayed
 * project view, so a new project model is never combined with an earlier revision's counts, and a late
 * response to an earlier request is discarded.
 *
 * `displayed.revision` is a new object on every successful project load: a reload of an equal revision
 * keeps a ready result and requests any other state again.
 */
export function usePublishedDependencyView(client: ExplorerClient,
  displayed: { readonly revision: ContextRevision | null; readonly isStale: boolean },
  options: { readonly pollIntervalMs?: number } = {}): PublishedDependencyView {
  const pollMs = Math.max(minimumDependencyPollMs, options.pollIntervalMs ?? minimumDependencyPollMs);
  const [held, setHeld] = useState<HeldResult>(idle);
  const [attempt, setAttempt] = useState(0);
  const heldRef = useRef(held);
  heldRef.current = held;
  const request = useRef(0);
  const revision = displayed.revision;

  useEffect(() => {
    const token = ++request.current;
    if (revision === null) {
      setHeld(idle);
      return;
    }
    // An equal reloaded revision keeps its ready result without another request.
    if (readyFor(heldRef.current, revision)) return;
    const inputId = revision.fingerprints.inputId;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let awaitingVisibility = false;
    const live = () => active && token === request.current;
    const settle = (next: Omit<HeldResult, 'revision'>) => { if (live()) setHeld({ revision, ...next }); };
    const stop = () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
    const finish = (next: Omit<HeldResult, 'revision'>) => { settle(next); stop(); };
    const poll = async (): Promise<void> => {
      timer = undefined;
      if (!live()) return;
      // A hidden page issues no request; the next visibility change resumes.
      if (!visible()) { awaitingVisibility = true; return; }
      setHeld(previous => previous.revision === revision && previous.phase !== 'idle'
        ? previous : { revision, data: null, phase: 'analyzing', reason: null });
      let result: Awaited<ReturnType<ExplorerClient['dependencyView']>>;
      try {
        result = await client.dependencyView({ revision: revision.revision });
      } catch (cause) {
        if (live()) finish({ data: null, phase: 'unavailable', reason: cause instanceof Error ? cause.message : String(cause) });
        return;
      }
      // A response to an earlier displayed revision or request is discarded.
      if (!live()) return;
      switch (result.status) {
        case 'ready':
          if (result.revision.revision !== revision.revision || result.revision.fingerprints.inputId !== inputId
            || result.view.inputId !== inputId) {
            finish({ data: null, phase: 'unavailable',
              reason: 'the dependency result does not match the displayed revision and input' });
            return;
          }
          finish({ data: result.view, phase: 'ready', reason: null });
          return;
        case 'pending':
          if (result.revision.revision !== revision.revision) {
            finish({ data: null, phase: 'unavailable', reason: 'the pending dependency result names another revision' });
            return;
          }
          settle({ data: null, phase: result.phase, reason: null });
          timer = setTimeout(() => { void poll(); }, pollMs);
          return;
        case 'superseded':
          finish({ data: null, phase: 'superseded', reason: result.reason });
          return;
        case 'unavailable':
          finish({ data: null, phase: 'unavailable', reason: result.reason });
          return;
      }
    };
    function onVisibility(): void {
      if (awaitingVisibility && visible() && live()) {
        awaitingVisibility = false;
        void poll();
      }
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    setHeld({ revision, data: null, phase: 'idle', reason: null });
    void poll();
    return stop;
  }, [client, revision, attempt, pollMs]);

  const refresh = useCallback(() => { setAttempt(value => value + 1); }, []);

  // Only a result bound to the displayed revision, and for data its input ID, is rendered.
  const bound = revision !== null && held.revision !== null
    && (held.revision === revision || readyFor(held, revision))
    && (held.data === null || held.data.inputId === revision.fingerprints.inputId);
  if (!bound) return { data: null, phase: 'idle', reason: null, isStale: displayed.isStale, refresh };
  return { data: held.data, phase: held.phase, reason: held.reason, isStale: displayed.isStale, refresh };
}

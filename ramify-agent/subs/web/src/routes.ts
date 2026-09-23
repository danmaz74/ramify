import type { SessionRef } from '../../harness/src/interfaces/protocol/sessions.js';
import type { TranscriptPoint } from '../../harness/src/interfaces/protocol/transcripts.js';

/**
 * A place in a session's transcript a link can open: an invocation's
 * chapter, the point its end made, or the point an append made, by the
 * append's run event sequence.
 */
export type SessionAnchor =
  | { readonly kind: 'chapter'; readonly invocation: string }
  | { readonly kind: 'point'; readonly invocation: string }
  | { readonly kind: 'append'; readonly append: number };

/** A page of the client, addressed by the URL fragment. */
export type Route =
  | { readonly page: 'plans' }
  | { readonly page: 'plan'; readonly planId: string }
  | { readonly page: 'run'; readonly planId: string; readonly runId: string }
  | { readonly page: 'sessions' }
  | { readonly page: 'session'; readonly session: SessionRef; readonly anchor: SessionAnchor | null };

function decoded(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

const anchorPattern = '(?:/(chapters|points|appends)/([^/]+))?';

function anchorOf(kind: string | undefined, value: string | undefined): SessionAnchor | null | undefined {
  if (kind === undefined) return null;
  const decodedValue = decoded(value!);
  if (decodedValue === undefined) return undefined;
  if (kind === 'chapters') return { kind: 'chapter', invocation: decodedValue };
  if (kind === 'points') return { kind: 'point', invocation: decodedValue };
  return /^[1-9]\d*$/.test(decodedValue) ? { kind: 'append', append: Number(decodedValue) } : undefined;
}

/**
 * The route of a fragment such as `#/plans/review-notes`,
 * `#/plans/review-notes/runs/<run-id>`, `#/sessions`,
 * `#/plans/review-notes/runs/<run-id>/sessions/ses-0002/chapters/inv-0004` or
 * `#/sessions/standalone/<session-id>`; anything else is the plan list.
 */
export function parseRoute(hash: string): Route {
  if (/^#\/sessions\/?$/.test(hash)) return { page: 'sessions' };
  const standalone = new RegExp(`^#/sessions/standalone/([^/]+)${anchorPattern}/?$`).exec(hash);
  if (standalone) {
    const session = decoded(standalone[1]!);
    const anchor = anchorOf(standalone[2], standalone[3]);
    return session === undefined || anchor === undefined ? { page: 'plans' } : { page: 'session', session: { source: 'standalone', session }, anchor };
  }
  const runSession = new RegExp(`^#/plans/([^/]+)/runs/([^/]+)/sessions/([^/]+)${anchorPattern}/?$`).exec(hash);
  if (runSession) {
    const [planId, runId, session] = [decoded(runSession[1]!), decoded(runSession[2]!), decoded(runSession[3]!)];
    const anchor = anchorOf(runSession[4], runSession[5]);
    return planId === undefined || runId === undefined || session === undefined || anchor === undefined
      ? { page: 'plans' }
      : { page: 'session', session: { source: 'run', planId, runId, session }, anchor };
  }
  const run = /^#\/plans\/([^/]+)\/runs\/([^/]+)\/?$/.exec(hash);
  if (run) {
    const planId = decoded(run[1]!);
    const runId = decoded(run[2]!);
    return planId === undefined || runId === undefined ? { page: 'plans' } : { page: 'run', planId, runId };
  }
  const match = /^#\/plans\/([^/]+)\/?$/.exec(hash);
  if (!match) return { page: 'plans' };
  const planId = decoded(match[1]!);
  return planId === undefined ? { page: 'plans' } : { page: 'plan', planId };
}

function anchorSuffix(anchor: SessionAnchor | null): string {
  if (anchor === null) return '';
  switch (anchor.kind) {
    case 'chapter': return `/chapters/${encodeURIComponent(anchor.invocation)}`;
    case 'point': return `/points/${encodeURIComponent(anchor.invocation)}`;
    case 'append': return `/appends/${anchor.append}`;
  }
}

/** The fragment of a route. */
export function routeHref(route: Route): string {
  switch (route.page) {
    case 'plans': return '#/';
    case 'plan': return `#/plans/${encodeURIComponent(route.planId)}`;
    case 'run': return `#/plans/${encodeURIComponent(route.planId)}/runs/${encodeURIComponent(route.runId)}`;
    case 'sessions': return '#/sessions';
    case 'session': {
      const { session, anchor } = route;
      const base = session.source === 'run'
        ? `${routeHref({ page: 'run', planId: session.planId, runId: session.runId })}/sessions/${encodeURIComponent(session.session)}`
        : `#/sessions/standalone/${encodeURIComponent(session.session)}`;
      return `${base}${anchorSuffix(anchor)}`;
    }
  }
}

/** The fragment of a session's transcript, opened at `anchor` when one is given. */
export function sessionHref(session: SessionRef, anchor: SessionAnchor | null = null): string {
  return routeHref({ page: 'session', session, anchor });
}

/** The fragment of one invocation's chapter in its session's transcript: what a segment or a node's session opens. */
export function chapterHref(session: SessionRef, invocation: string): string {
  return sessionHref(session, { kind: 'chapter', invocation });
}

/**
 * The fragment of a point, which names its session: in a run, a session of
 * the same run as `from`; a standalone session's point is its own.
 */
export function pointHref(from: SessionRef, point: TranscriptPoint): string {
  const session: SessionRef = from.source === 'run' ? { ...from, session: point.session } : from;
  return sessionHref(session, 'invocation' in point ? { kind: 'point', invocation: point.invocation } : { kind: 'append', append: point.append });
}

/** A key that names a session wherever it is. */
export function sessionKey(session: SessionRef): string {
  return session.source === 'run' ? `run/${session.planId}/${session.runId}/${session.session}` : `standalone/${session.session}`;
}

import type { AnalysisReport } from '../../../../analysis/src/interfaces/analysis.js';
import type { RevisionId } from './interfaces/contexts.js';

export interface HistoryEntry<Revision> {
  readonly revision: Revision;
  readonly report: AnalysisReport;
  readonly bytes: number;
}

export interface RevisionHistory<Revision> {
  readonly count: number;
  readonly bytes: number;
  readonly published: HistoryEntry<Revision> | undefined;
  readonly oldest: HistoryEntry<Revision> | undefined;
  get(revision: RevisionId): HistoryEntry<Revision> | undefined;
  /** Reject an oversized candidate before changing the retained history. */
  append(revision: Revision, report: AnalysisReport): boolean;
  /** Remove the oldest historical report, never the current publication. */
  discardOldest(): HistoryEntry<Revision> | undefined;
  retainPublished(): void;
  dispose(): void;
}

/** Owner-private storage. The manager supplies immutable revision headers and
 * reports and owns publication eligibility, lastValid and retained products.
 * The header parameter will be ContextRevision when its provider types exist. */
export function createHistory<Revision extends { readonly revision: RevisionId }>(
  maxRevisions: number, maxBytes: number,
): RevisionHistory<Revision> {
  for (const bound of [maxRevisions, maxBytes]) {
    if (!Number.isSafeInteger(bound) || bound < 0) throw new RangeError('History bounds must be nonnegative safe integers');
  }
  const entries = new Map<RevisionId, HistoryEntry<Revision>>();
  let bytes = 0;
  let published: HistoryEntry<Revision> | undefined;
  let disposed = false;

  function oldest(): HistoryEntry<Revision> | undefined {
    return entries.values().next().value;
  }

  function discardOldest(): HistoryEntry<Revision> | undefined {
    const entry = oldest();
    if (!entry || entry === published) return undefined;
    entries.delete(entry.revision.revision);
    bytes -= entry.bytes;
    return entry;
  }

  return {
    get count() { return entries.size; },
    get bytes() { return bytes; },
    get published() { return published; },
    get oldest() { return oldest(); },
    get: revision => entries.get(revision),
    append(revision, report) {
      if (disposed) throw new Error('History is disposed');
      if (entries.has(revision.revision)) throw new Error('Revision is already retained');
      const reportBytes = Buffer.byteLength(JSON.stringify(report), 'utf8');
      if (maxRevisions === 0 || reportBytes > maxBytes) return false;
      const entry = Object.freeze({ revision, report, bytes: reportBytes });
      // Check the prospective sum before adding to keep accounting within the
      // configured bound (and safe integer range) throughout replacement.
      while (entries.size >= maxRevisions || bytes > maxBytes - reportBytes) {
        const removed = oldest()!;
        entries.delete(removed.revision.revision);
        bytes -= removed.bytes;
      }
      entries.set(revision.revision, entry);
      bytes += reportBytes;
      published = entry;
      return true;
    },
    discardOldest,
    retainPublished() {
      while (discardOldest()) { /* Release every older report. */ }
    },
    dispose() {
      disposed = true;
      entries.clear();
      bytes = 0;
      published = undefined;
    },
  };
}

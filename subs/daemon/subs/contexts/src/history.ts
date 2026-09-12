import type { AnalysisReport } from '../../../../analysis/src/interfaces/analysis.js';
import type { SessionRevision } from '../../../../analysis/src/interfaces/session.js';
import type { RevisionId } from './interfaces/contexts.js';

/** Reports and input observations are not copied into hot history. Immutable
 * fact versions live in the session until the matching entry is released. */
export interface HistoryEntry<Revision> extends Pick<SessionRevision, 'sequence' | 'diagnostics' | 'warnings' | 'coverage' | 'delta'> {
  readonly revision: Revision;
  readonly report: AnalysisReport | null;
  readonly bytes: number;
}
export interface RevisionHistory<Revision> {
  readonly count: number;
  readonly bytes: number;
  readonly published: HistoryEntry<Revision> | undefined;
  readonly oldest: HistoryEntry<Revision> | undefined;
  get(revision: RevisionId): HistoryEntry<Revision> | undefined;
  hasSequence(sequence: number): boolean;
  getPrevious(revision: RevisionId): HistoryEntry<Revision> | undefined;
  pin(revision: RevisionId): () => void;
  append(revision: Revision, data: SessionRevision, availableBytes?: number): boolean;
  discardOldest(): HistoryEntry<Revision> | undefined;
  retainPublished(report?: AnalysisReport): boolean;
  dispose(): void;
}
export function createHistory<Revision extends { readonly revision: RevisionId }>(
  maxRevisions: number, maxBytes: number, onEvict: (entry: HistoryEntry<Revision>) => void = () => {},
): RevisionHistory<Revision> {
  for (const bound of [maxRevisions, maxBytes]) {
    if (!Number.isSafeInteger(bound) || bound < 0) throw new RangeError('History bounds must be nonnegative safe integers');
  }
  const entries = new Map<RevisionId, HistoryEntry<Revision>>();
  const pins = new Map<RevisionId, number>();
  let bytes = 0;
  let published: HistoryEntry<Revision> | undefined;
  let disposed = false;
  const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  function remove(entry: HistoryEntry<Revision>): void {
    entries.delete(entry.revision.revision); bytes -= entry.bytes; onEvict(entry);
  }
  function discardOldest(): HistoryEntry<Revision> | undefined {
    const entry = [...entries.values()].find(item => item !== published && !pins.has(item.revision.revision));
    if (entry) remove(entry);
    return entry;
  }
  return {
    get count() { return entries.size; }, get bytes() { return bytes; },
    get published() { return published; }, get oldest() { return entries.values().next().value; },
    get: revision => entries.get(revision),
    hasSequence: sequence => [...entries.values()].some(entry => entry.report === null && entry.sequence === sequence),
    getPrevious(revision) {
      let previous: HistoryEntry<Revision> | undefined;
      for (const entry of entries.values()) { if (entry.revision.revision === revision) return previous; previous = entry; }
      return undefined;
    },
    pin(revision) {
      if (!entries.has(revision)) throw new Error('Cannot pin an evicted revision');
      pins.set(revision, (pins.get(revision) ?? 0) + 1);
      let released = false;
      return () => { if (released) return; released = true; const count = pins.get(revision) ?? 1;
        if (count === 1) pins.delete(revision); else pins.set(revision, count - 1); };
    },
    append(revision, data, availableBytes = maxBytes) {
      if (disposed) throw new Error('History is disposed');
      if (entries.has(revision.revision)) throw new Error('Revision is already retained');
      const compact = { revision, sequence: data.sequence, diagnostics: data.diagnostics, warnings: data.warnings,
        coverage: data.coverage, delta: data.delta, report: null };
      const entry = Object.freeze({ ...compact, bytes: size(compact) });
      const bound = Math.min(maxBytes, availableBytes);
      if (!maxRevisions || entry.bytes > bound) return false;
      const evictable = [...entries.values()].filter(item => !pins.has(item.revision.revision));
      let remainingBytes = bytes; let remainingCount = entries.size;
      const removals: HistoryEntry<Revision>[] = [];
      for (const old of evictable) {
        if (remainingCount < maxRevisions && remainingBytes <= bound - entry.bytes) break;
        remainingBytes -= old.bytes; remainingCount--; removals.push(old);
      }
      if (remainingCount >= maxRevisions || remainingBytes > bound - entry.bytes) return false;
      for (const old of removals) remove(old);
      entries.set(revision.revision, entry); bytes += entry.bytes; published = entry;
      return true;
    },
    discardOldest,
    retainPublished(report) {
      if (!published) return true;
      const compact = { ...published, report: report ?? published.report };
      const { bytes: _bytes, ...payload } = compact;
      const replacement = Object.freeze({ ...payload, bytes: size(payload) });
      if (replacement.bytes > maxBytes || [...pins.keys()].some(id => id !== published!.revision.revision)) return false;
      while (discardOldest()) { /* Release historical fact versions. */ }
      bytes = replacement.bytes; entries.set(replacement.revision.revision, replacement); published = replacement;
      return true;
    },
    dispose() { disposed = true; for (const entry of entries.values()) onEvict(entry);
      entries.clear(); pins.clear(); bytes = 0; published = undefined; },
  };
}

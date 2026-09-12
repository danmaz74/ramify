import { describe, expect, it } from 'vitest';
import type { SessionRevision } from '../../../../../analysis/src/interfaces/session.js';
import { createHistory } from '../history.js';
import type { RevisionHistory } from '../history.js';
import { historyReport } from './history-fixture.js';
import { capture } from './scripted-driver.js';

type Header = { readonly revision: string; readonly sequence: number };
const header = (sequence: number): Header => Object.freeze({ revision: `rev/1:history:${sequence}`, sequence });
const revision = (sequence: number): SessionRevision => capture(sequence).revision;

function dispose(history: RevisionHistory<Header>): void {
  history.dispose(); history.dispose();
  expect(history.count).toBe(0); expect(history.bytes).toBe(0);
  expect(history.published).toBeUndefined(); expect(history.oldest).toBeUndefined();
  expect(history.discardOldest()).toBeUndefined(); expect(history.get(header(1).revision)).toBeUndefined();
}
function findingRevision(sequence: number, message: string): SessionRevision {
  return { ...revision(sequence), diagnostics: [{ id: 'finding', category: 'execution', code: 'internal-error', message,
    location: null, related: [], importer: null, original: null, accessId: null }] };
}

describe('compact revision history', () => {
  it('retains the newest eight of twelve headers and releases each evicted session version', () => {
    const released: number[] = [];
    const history = createHistory<Header>(8, 1024 ** 2, entry => released.push(entry.sequence));
    try {
      for (let sequence = 1; sequence <= 12; sequence++) expect(history.append(header(sequence), revision(sequence))).toBe(true);
      expect(history.count).toBe(8); expect(history.oldest?.revision.sequence).toBe(5); expect(history.published?.revision.sequence).toBe(12);
      expect(released).toEqual([1, 2, 3, 4]);
      for (let sequence = 1; sequence < 5; sequence++) expect(history.get(header(sequence).revision)).toBeUndefined();
      for (let sequence = 5; sequence <= 12; sequence++) expect(history.get(header(sequence).revision)?.sequence).toBe(sequence);
      expect(history.getPrevious(header(8).revision)?.sequence).toBe(7);
      expect(history.getPrevious(header(5).revision)).toBeUndefined();
    } finally { dispose(history); }
    expect(released).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });

  it('stores diagnostic payloads, headers and deltas while keeping report and input graphs out of hot history', () => {
    const history = createHistory<Header>(8, 1024 ** 2);
    const data = { ...revision(1), inputs: Array.from({ length: 1000 }, (_, index) => ({ path: `src/${index}.ts`, role: 'source' as const, sha256: 'a'.repeat(64), bytes: 100 })) };
    try {
      expect(history.append(header(1), data)).toBe(true);
      expect(history.published).toMatchObject({ sequence: 1, report: null, diagnostics: [], warnings: [], coverage: [], delta: data.delta });
      expect(history.published).not.toHaveProperty('inputs'); expect(history.published).not.toHaveProperty('snapshot');
      expect(history.bytes).toBeLessThan(1024);
    } finally { dispose(history); }
  });

  it('retains at most three 10 MiB diagnostic payloads under the 32 MiB bound', () => {
    const history = createHistory<Header>(8, 32 * 1024 ** 2);
    const message = 'x'.repeat(10 * 1024 ** 2);
    try {
      for (let sequence = 1; sequence <= 4; sequence++) expect(history.append(header(sequence), findingRevision(sequence, message))).toBe(true);
      expect(history.count).toBe(3); expect(history.bytes).toBeGreaterThan(30 * 1024 ** 2);
      expect(history.bytes).toBeLessThanOrEqual(32 * 1024 ** 2);
      expect(history.oldest?.sequence).toBe(2); expect(history.get(header(1).revision)).toBeUndefined();
    } finally { dispose(history); }
  });

  it('replaces a 70 MiB diagnostic payload within 128 MiB without ignoring a caller admission bound', () => {
    const history = createHistory<Header>(8, 128 * 1024 ** 2);
    const message = 'x'.repeat(70 * 1024 ** 2);
    try {
      expect(history.append(header(1), findingRevision(1, message))).toBe(true);
      expect(history.append(header(2), findingRevision(2, message))).toBe(true);
      expect(history.count).toBe(1); expect(history.bytes).toBeLessThanOrEqual(128 * 1024 ** 2);
      expect(history.get(header(1).revision)).toBeUndefined();
      expect(history.append(header(3), findingRevision(3, message), 70 * 1024 ** 2)).toBe(false);
      expect(history.published?.sequence).toBe(2);
    } finally { dispose(history); }
  });

  it('counts UTF-8 bytes and preserves the exact immutable header and diagnostic arrays', () => {
    const history = createHistory<Header>(2, 1024 ** 2);
    const first = header(1); const plain = findingRevision(1, 'a'); const unicode = findingRevision(2, 'é');
    try {
      history.append(first, plain); const plainBytes = history.bytes;
      history.append(header(2), unicode);
      expect(history.bytes).toBe(plainBytes * 2 + 1);
      expect(history.get(first.revision)?.revision).toBe(first);
      expect(history.get(first.revision)?.diagnostics).toBe(plain.diagnostics);
      expect(Object.isFrozen(history.get(first.revision))).toBe(true);
    } finally { dispose(history); }
  });

  it('rejects an oversized candidate before changing history or releasing any current fact version', () => {
    const released: number[] = [];
    const history = createHistory<Header>(2, 4096, entry => released.push(entry.sequence));
    try {
      history.append(header(1), revision(1)); history.append(header(2), revision(2));
      const published = history.published; const oldest = history.oldest; const bytes = history.bytes;
      expect(history.append(header(3), findingRevision(3, 'x'.repeat(4097)))).toBe(false);
      expect(history.published).toBe(published); expect(history.oldest).toBe(oldest);
      expect(history.bytes).toBe(bytes); expect(history.count).toBe(2); expect(released).toEqual([]);
    } finally { dispose(history); }
  });

  it('keeps request pins until their final release and rejects admission if every slot is pinned', () => {
    const history = createHistory<Header>(2, 1024 ** 2);
    try {
      history.append(header(1), revision(1)); history.append(header(2), revision(2));
      const first = history.pin(header(1).revision); const second = history.pin(header(1).revision);
      const current = history.pin(header(2).revision);
      expect(history.append(header(3), revision(3))).toBe(false);
      first(); first(); expect(history.discardOldest()).toBeUndefined();
      second(); expect(history.discardOldest()?.sequence).toBe(1);
      current(); expect(history.discardOldest()).toBeUndefined();
      expect(history.append(header(3), revision(3))).toBe(true);
      expect(() => history.pin(header(1).revision)).toThrow('evicted');
    } finally { dispose(history); }
  });

  it('discards older versions under pressure while retaining the published one', () => {
    const history = createHistory<Header>(8, 1024 ** 2);
    try {
      for (let sequence = 1; sequence <= 3; sequence++) history.append(header(sequence), revision(sequence));
      expect(history.discardOldest()?.sequence).toBe(1); expect(history.discardOldest()?.sequence).toBe(2);
      expect(history.discardOldest()).toBeUndefined(); expect(history.count).toBe(1);
      expect(history.bytes).toBe(history.published?.bytes); expect(history.published?.sequence).toBe(3);
    } finally { dispose(history); }
  });

  it('retains and counts the detached report for cold reads, rejecting oversized projections atomically', () => {
    const history = createHistory<Header>(8, 4096);
    try {
      for (let sequence = 1; sequence <= 3; sequence++) history.append(header(sequence), revision(sequence));
      const published = history.published;
      expect(history.retainPublished({ ...historyReport(), runId: 'x'.repeat(4096) })).toBe(false);
      expect(history.published).toBe(published); expect(history.count).toBe(3);
      const report = historyReport();
      expect(history.retainPublished(report)).toBe(true); expect(history.retainPublished(report)).toBe(true);
      expect(history.count).toBe(1); expect(history.oldest).toBe(history.published);
      expect(history.published?.report).toBe(report); expect(history.bytes).toBeGreaterThan(Buffer.byteLength(JSON.stringify(report)));
      history.dispose(); expect(() => history.append(header(4), revision(4))).toThrow('disposed');
    } finally { dispose(history); }
  });

  it('rejects zero capacity and duplicate retained identifiers without replacing the current entry', () => {
    const history = createHistory<Header>(0, 1024 ** 2); const available = createHistory<Header>(1, 1024 ** 2);
    try {
      expect(history.append(header(1), revision(1))).toBe(false); expect(history.count).toBe(0);
      available.append(header(1), revision(1)); const original = available.published;
      expect(() => available.append(header(1), revision(2))).toThrow('already retained');
      expect(available.published).toBe(original);
    } finally { dispose(history); dispose(available); }
  });
});

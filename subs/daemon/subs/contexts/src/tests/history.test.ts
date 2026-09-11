import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../../../../analysis/src/interfaces/analysis.js';
import { createHistory } from '../history.js';
import type { RevisionHistory } from '../history.js';
import { historyReport } from './history-fixture.js';

type Header = { readonly revision: string; readonly sequence: number };
const header = (sequence: number): Header => Object.freeze({ revision: `rev/1:history:${sequence}`, sequence });

function dispose(history: RevisionHistory<Header>): void {
  history.dispose(); history.dispose();
  expect(history.count).toBe(0);
  expect(history.bytes).toBe(0);
  expect(history.published).toBeUndefined();
  expect(history.oldest).toBeUndefined();
  expect(history.discardOldest()).toBeUndefined();
  expect(history.get(header(1).revision)).toBeUndefined();
}

function sizedReport(bytes: number): AnalysisReport {
  const report = historyReport('');
  const overhead = Buffer.byteLength(JSON.stringify(report), 'utf8');
  return Object.freeze({ ...report, runId: 'x'.repeat(bytes - overhead) });
}

describe('report history storage (publication eligibility belongs to the manager)', () => {
  it('retains the newest eight of twelve entries and never substitutes the current report for a missing revision', () => {
    const history = createHistory<Header>(8, 1024 ** 2);
    try {
      for (let sequence = 1; sequence <= 12; sequence++) expect(history.append(header(sequence), historyReport())).toBe(true);
      expect(history.count).toBe(8);
      expect(history.oldest?.revision.sequence).toBe(5);
      expect(history.published?.revision.sequence).toBe(12);
      for (let sequence = 1; sequence < 5; sequence++) expect(history.get(header(sequence).revision)).toBeUndefined();
      for (let sequence = 5; sequence <= 12; sequence++) expect(history.get(header(sequence).revision)?.revision.sequence).toBe(sequence);
    } finally { dispose(history); }
  });

  it('retains at most three 10 MiB reports under the 32 MiB budget', () => {
    const history = createHistory<Header>(8, 32 * 1024 ** 2);
    const report = sizedReport(10 * 1024 ** 2);
    try {
      for (let sequence = 1; sequence <= 4; sequence++) expect(history.append(header(sequence), report)).toBe(true);
      expect(history.count).toBe(3);
      expect(history.bytes).toBe(30 * 1024 ** 2);
      expect(history.oldest?.revision.sequence).toBe(2);
      expect(history.get(header(1).revision)).toBeUndefined();
    } finally { dispose(history); }
  });

  it('publishes a 70 MiB report and replaces it within a 128 MiB history bound', () => {
    const bytes = 70 * 1024 ** 2;
    const history = createHistory<Header>(8, 128 * 1024 ** 2);
    const report = sizedReport(bytes);
    try {
      expect(history.append(header(1), report)).toBe(true);
      expect(history.append(header(2), report)).toBe(true);
      expect(history.count).toBe(1);
      expect(history.bytes).toBe(bytes);
      expect(history.get(header(1).revision)).toBeUndefined();
      expect(history.published?.revision.sequence).toBe(2);
      // A caller's lower admission allowance remains binding and cannot replace publication.
      expect(history.append(header(3), report, bytes - 1)).toBe(false);
      expect(history.published?.revision.sequence).toBe(2);
    } finally { dispose(history); }
  });

  it('counts UTF-8 bytes and returns the exact stored header and report', () => {
    const history = createHistory<Header>(2, 1024 ** 2);
    const plain = historyReport('a');
    const unicode = historyReport('é');
    const first = header(1);
    try {
      history.append(first, plain);
      const plainBytes = history.bytes;
      history.append(header(2), unicode);
      expect(history.bytes).toBe(plainBytes * 2 + 1);
      expect(history.get(first.revision)?.revision).toBe(first);
      expect(history.get(first.revision)?.report).toBe(plain);
      expect(history.published?.report).toBe(unicode);
      expect(Object.isFrozen(history.get(first.revision))).toBe(true);
    } finally { dispose(history); }
  });

  it('rejects a candidate that cannot fit without discarding current or historical reports', () => {
    const history = createHistory<Header>(2, 4096);
    try {
      history.append(header(1), historyReport('first'));
      history.append(header(2), historyReport('second'));
      const published = history.published;
      const oldest = history.oldest;
      const bytes = history.bytes;
      expect(history.append(header(3), sizedReport(4097))).toBe(false);
      expect(history.published).toBe(published);
      expect(history.oldest).toBe(oldest);
      expect(history.bytes).toBe(bytes);
      expect(history.count).toBe(2);
    } finally { dispose(history); }
  });

  it('discards oldest reports for global pressure and pins only the current publication', () => {
    const history = createHistory<Header>(8, 1024 ** 2);
    try {
      for (let sequence = 1; sequence <= 3; sequence++) history.append(header(sequence), historyReport());
      expect(history.discardOldest()?.revision.sequence).toBe(1);
      expect(history.discardOldest()?.revision.sequence).toBe(2);
      expect(history.discardOldest()).toBeUndefined();
      expect(history.count).toBe(1);
      expect(history.bytes).toBe(history.published?.bytes);
      expect(history.published?.revision.sequence).toBe(3);
    } finally { dispose(history); }
  });

  it('releases all past reports for cold retention and rejects writes after disposal', () => {
    const history = createHistory<Header>(8, 1024 ** 2);
    try {
      for (let sequence = 1; sequence <= 3; sequence++) history.append(header(sequence), historyReport());
      history.retainPublished(); history.retainPublished();
      expect(history.count).toBe(1);
      expect(history.oldest).toBe(history.published);
      expect(history.get(header(1).revision)).toBeUndefined();
      expect(history.get(header(2).revision)).toBeUndefined();
      expect(history.bytes).toBe(history.published?.bytes);
      history.dispose();
      expect(() => history.append(header(4), historyReport())).toThrow('disposed');
    } finally { dispose(history); }
  });

  it('rejects zero capacity and duplicate retained identifiers without changing the current entry', () => {
    const history = createHistory<Header>(0, 1024 ** 2);
    const available = createHistory<Header>(1, 1024 ** 2);
    try {
      expect(history.append(header(1), historyReport())).toBe(false);
      expect(history.count).toBe(0);
      available.append(header(1), historyReport('original'));
      const original = available.published;
      expect(() => available.append(header(1), historyReport('replacement'))).toThrow('already retained');
      expect(available.published).toBe(original);
    } finally { dispose(history); dispose(available); }
  });
});

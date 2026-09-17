import { describe, expect, it } from 'vitest';
import { isNewerRevision, type ComparableRevision } from '../revision-freshness.js';

const generation = (name: 'A' | 'B') => `gen/1:0000000${name === 'A' ? 1 : 2}-0000-0000-0000-000000000000`;
function revision(name: 'A' | 'B', sequence: number): ComparableRevision {
  return { revision: `rev/1:${generation(name).slice(6)}:${sequence}`, sequence, token: { generation: generation(name) } };
}

describe('RS12: fresher revision comparison', () => {
  it('treats the same revision as not newer', () => {
    expect(isNewerRevision(revision('A', 5), revision('A', 5))).toBe(false);
  });
  it('treats a higher sequence in the same generation as newer, and a lower or equal one as not', () => {
    expect(isNewerRevision(revision('A', 5), revision('A', 6))).toBe(true);
    expect(isNewerRevision(revision('A', 5), revision('A', 4))).toBe(false);
  });
  it('treats any different revision in another generation as newer, even with a lower sequence', () => {
    expect(isNewerRevision(revision('A', 5), revision('B', 1))).toBe(true);
    expect(isNewerRevision(revision('A', 1), revision('B', 7))).toBe(true);
  });
});

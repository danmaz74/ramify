import { describe, expect, it } from 'vitest';
import { createRequestIdentities } from '../request-identities.js';

describe('bounded connection identity admission', () => {
  it('rejects new identities at the lifetime bound while still detecting duplicates exactly', () => {
    const ids = createRequestIdentities(3);
    expect(['a', 'b', 'c'].map(id => ids.admit(id))).toEqual(['accepted', 'accepted', 'accepted']);
    expect(ids.admit('d')).toBe('exhausted');
    expect(ids.admit('a')).toBe('duplicate');
    expect(ids.admit('b')).toBe('duplicate');
    expect(ids.admit('d')).toBe('exhausted');
    const nextConnection = createRequestIdentities(3);
    expect(nextConnection.admit('a')).toBe('accepted');
    ids.clear();
  });
});

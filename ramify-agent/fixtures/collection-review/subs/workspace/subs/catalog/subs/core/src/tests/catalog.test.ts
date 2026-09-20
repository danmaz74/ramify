import { describe, expect, it } from 'vitest';

import { getRecord, inspect } from '../catalog.js';
import { resolvePredecessors } from '../history.js';
import { makeCatalogFixture } from './fixture.js';
import type { Observation } from '../../../../../contracts/src/interfaces/vocabulary.js';

function collect(): { observations: Observation[]; observe: (observation: Observation) => void } {
  const observations: Observation[] = [];
  return { observations, observe: (observation) => void observations.push(observation) };
}

describe('getRecord', () => {
  it('summarizes a record without exposing its revisions', () => {
    expect(getRecord('rec-valid')).toEqual({
      recordId: 'rec-valid',
      title: 'Intact revision history',
      revisionCount: 2,
      latestRevisionId: 'rev-2',
    });
  });

  it('answers with undefined for an unknown record', () => {
    expect(getRecord('rec-missing')).toBeUndefined();
  });
});

describe('inspect', () => {
  it('reports an intact chain with every predecessor resolved', () => {
    const { observations, observe } = collect();

    const report = inspect('rec-valid', { kind: 'all' }, observe);

    expect(report).toEqual({
      recordId: 'rec-valid',
      chain: [
        { id: 'rev-1', predecessor: null },
        { id: 'rev-2', predecessor: 'rev-1' },
      ],
      resolvedPredecessors: ['rev-1'],
      unresolvedPredecessors: [],
      findings: [],
    });
    expect(observations.map((observation) => observation.kind)).toEqual([
      'inspection-started',
      'inspection-finished',
    ]);
  });

  it('reports the predecessor reference that resolves to no revision, and no findings', () => {
    const { observe } = collect();

    const report = inspect('rec-broken', { kind: 'all' }, observe);

    expect(report?.unresolvedPredecessors).toEqual(['rev-0']);
    expect(report?.resolvedPredecessors).toEqual([]);
    expect(report?.findings).toEqual([]);
  });

  it('narrows the chain to the scope it was given', () => {
    const { observe } = collect();

    const report = inspect('rec-valid', { kind: 'latest', count: 1 }, observe);

    expect(report?.chain).toEqual([{ id: 'rev-2', predecessor: 'rev-1' }]);
    // `rev-1` is outside the scoped chain, so its reference resolves to no
    // revision of what was inspected.
    expect(report?.unresolvedPredecessors).toEqual(['rev-1']);
  });

  it('answers with undefined for an unknown record', () => {
    const { observations, observe } = collect();

    expect(inspect('rec-missing', { kind: 'all' }, observe)).toBeUndefined();
    expect(observations).toEqual([]);
  });
});

describe('resolvePredecessors', () => {
  // The helper is private to this owner: no description exposes it, so only
  // these tests and their own implementation can read it.
  it('ignores a first revision and splits the rest', () => {
    expect(
      resolvePredecessors([
        { id: 'rev-1', predecessor: null },
        { id: 'rev-2', predecessor: 'rev-1' },
        { id: 'rev-3', predecessor: 'rev-9' },
      ]),
    ).toEqual({ resolved: ['rev-1'], unresolved: ['rev-9'] });
  });

  it('reports nothing for an empty chain', () => {
    expect(resolvePredecessors([])).toEqual({ resolved: [], unresolved: [] });
  });
});

describe('makeCatalogFixture', () => {
  it('hands out both records as detached data', () => {
    const fixture = makeCatalogFixture();

    expect(fixture.map((record) => record.recordId)).toEqual(['rec-valid', 'rec-broken']);

    fixture[0].chain.push({ id: 'rev-3', predecessor: 'rev-2' });

    expect(getRecord('rec-valid')?.revisionCount).toBe(2);
  });
});

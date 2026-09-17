import { describe, expect, it } from 'vitest';
import { projectChangeAffinity } from '../index.js';
import type {
  AnalysisReport,
  ChangeAffinityInput,
  ChangeAffinityReport,
  ChangeAffinityThresholds,
  ChangeHistory,
  CandidateOwnership,
} from '../index.js';
import { buildReport, graphSpec, paths } from './modularity-fixture.js';

const report = buildReport(graphSpec);
const history: ChangeHistory = {
  provenance: { source: 'git', head: 'c9', range: 'HEAD', firstParent: false, merges: 'excluded', projectDirectory: '.' },
  commits: [
    { id: 'c1', paths: [paths.main, paths.model] },
    { id: 'c2', paths: ['README.md', paths.helper, paths.model] },
    { id: 'c3', paths: [paths.main, paths.model, paths.view] },
    { id: 'c4', paths: [paths.button, paths.view] },
    // Four owners: broad under a limit of three.
    { id: 'c5', paths: ['broad-only.md', paths.main, paths.model, paths.view, paths.button] },
    { id: 'c6', paths: ['explicit-only.md', paths.main, paths.model] },
    { id: 'c7', paths: ['docs/notes.md', 'package.json'] },
    // A test file and a resource are outside the production subset.
    { id: 'c8', paths: [paths.main, paths.modelTest, paths.css] },
    // A path no longer in the inventory maps to no owner.
    { id: 'c9', paths: [paths.model, 'subs/old/src/gone.ts'] },
  ],
};
const thresholds: ChangeAffinityThresholds = { minOwnerCommits: 3, minSharedCommits: 2, maxOwnersPerCommit: 3, excludedCommits: ['c6'] };

function projected(input: Partial<ChangeAffinityInput> = {}): ChangeAffinityReport {
  const outcome = projectChangeAffinity({ revision: 'batch:input-1', report, history, thresholds, filter: 'production', ...input });
  if (outcome.status !== 'projected') throw new Error(`Expected a projection: ${JSON.stringify(outcome)}`);
  return outcome.report;
}
const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, value: numerator / denominator });

describe('change affinity projection', () => {
  it('records provenance and counts examined, sampled and excluded commits', () => {
    const result = projected();
    expect(result.schemaVersion).toBe('ramify.change-affinity/1');
    expect(result.history).toEqual(history.provenance);
    expect(result.thresholds).toEqual(thresholds);
    expect([result.revision, result.filter, result.ownership, result.candidateId])
      .toEqual(['batch:input-1', 'production', 'declared', null]);
    expect(result.commits).toEqual({ examined: 9, sampled: 6, excludedBroad: 1, excludedExplicit: 1 });
    // Unmapped paths of excluded commits (broad-only.md, explicit-only.md) are not counted.
    expect(result.unmappedPaths).toBe(6);
  });

  it('computes Jaccard affinity with raw counts and applies both minimum-sample thresholds', () => {
    const result = projected();
    expect(result.owners).toEqual([
      { owner: 'app', commits: 3, sufficient: true },
      { owner: 'app/core', commits: 4, sufficient: true },
      { owner: 'app/ui', commits: 2, sufficient: false },
      { owner: 'app/ui/widgets', commits: 1, sufficient: false },
    ]);
    expect(result.pairs).toEqual([
      { first: 'app', second: 'app/core', shared: 2, affinity: ratio(2, 5), sufficient: true },
      { first: 'app', second: 'app/ui', shared: 1, affinity: ratio(1, 4), sufficient: false },
      { first: 'app/core', second: 'app/ui', shared: 1, affinity: ratio(1, 5), sufficient: false },
      // A perfect-looking small sample stays listed with its counts but is not sufficient.
      { first: 'app/ui', second: 'app/ui/widgets', shared: 1, affinity: ratio(1, 2), sufficient: false },
    ]);
    const stricter = projected({ thresholds: { ...thresholds, minSharedCommits: 3 } });
    expect(stricter.pairs.find(pair => pair.second === 'app/core')?.sufficient).toBe(false);
  });

  it('includes broad commits when the omnibus filter is disabled', () => {
    const result = projected({ thresholds: { ...thresholds, maxOwnersPerCommit: null, excludedCommits: [] } });
    expect(result.commits).toEqual({ examined: 9, sampled: 8, excludedBroad: 0, excludedExplicit: 0 });
    expect(result.unmappedPaths).toBe(8);
    expect(result.owners.map(owner => [owner.owner, owner.commits]))
      .toEqual([['app', 5], ['app/core', 6], ['app/ui', 3], ['app/ui/widgets', 2]]);
    expect(result.pairs.find(pair => pair.first === 'app/ui' && pair.second === 'app/ui/widgets'))
      .toEqual({ first: 'app/ui', second: 'app/ui/widgets', shared: 2, affinity: ratio(2, 3), sufficient: false });
  });

  it('maps paths through the filter subset only', () => {
    const result = projected({ filter: 'test', thresholds: { ...thresholds, excludedCommits: [] } });
    expect(result.owners).toEqual([
      { owner: 'app/core', commits: 1, sufficient: false },
      { owner: 'app/tools', commits: 0, sufficient: false },
    ]);
    expect(result.commits).toEqual({ examined: 9, sampled: 1, excludedBroad: 0, excludedExplicit: 0 });
    expect(result.pairs).toEqual([]);
  });

  it('serializes identically whatever the input order of paths, excluded ids and properties', () => {
    const reordered: ChangeHistory = {
      commits: history.commits.map(commit => ({ paths: [...commit.paths].reverse(), id: commit.id })),
      provenance: { projectDirectory: '.', merges: 'excluded', firstParent: false, range: 'HEAD', head: 'c9', source: 'git' },
    };
    const shuffled: ChangeAffinityThresholds = { excludedCommits: ['c6', 'c6'], maxOwnersPerCommit: 3, minSharedCommits: 2, minOwnerCommits: 3 };
    expect(JSON.stringify(projected({ history: reordered, thresholds: shuffled }))).toBe(JSON.stringify(projected()));
  });

  it('is unavailable for an incomplete analysis and rejects candidate ownership until it is implemented', () => {
    const incomplete: AnalysisReport = { ...report, outcome: { ...report.outcome, execution: 'incomplete' } };
    expect(projectChangeAffinity({ revision: 'r', report: incomplete, history, thresholds, filter: 'production' }))
      .toMatchObject({ status: 'unavailable', reason: 'analysis-incomplete' });
    const ownership: CandidateOwnership = { id: 'x', modules: [], files: [] };
    expect(() => projected({ ownership })).toThrow(/not implemented/);
  });
});

import type {
  ChangeAffinityInput,
  ChangeAffinityOutcome,
  OwnerChangeCount,
  OwnerPairAffinity,
} from './interfaces/modularity.js';
import type { ModuleId } from '../subs/model/src/interfaces/model.js';
import { resolveOwnership } from './modularity-candidate.js';
import { byteOrder, completeReport, ratio, viewFacts } from './modularity-context.js';

/**
 * Pure change-affinity projection of section 8 of
 * docs/architecture/modularity-report.spec.md. Git history arrives as plain
 * `ChangeHistory` data from a separate adapter; the analysis report supplies
 * the ownership in use and the filter's source subset.
 */
export function projectChangeAffinity(input: ChangeAffinityInput): ChangeAffinityOutcome {
  const { report, history, thresholds, filter } = input;
  if (!completeReport(report)) {
    return { status: 'unavailable', reason: 'analysis-incomplete',
      message: 'The analysis report is not a completed analysis with its registry, snapshot, catalog and model' };
  }
  const resolved = resolveOwnership(report, input.ownership);
  if (resolved.status === 'invalid') return { status: 'invalid-ownership', issues: resolved.issues };
  const { ownership } = resolved;
  const view = viewFacts(report, filter, ownership, []);
  const ownerOf = (path: string): ModuleId | null => view.sources.has(path) ? ownership.ownerOf(path) : null;

  const excluded = new Set(thresholds.excludedCommits);
  let excludedExplicit = 0;
  let excludedBroad = 0;
  const unmapped = new Set<string>();
  const sampled: (readonly ModuleId[])[] = [];
  for (const commit of history.commits) {
    if (excluded.has(commit.id)) {
      excludedExplicit++;
      continue;
    }
    const owners = new Set<ModuleId>();
    const missing: string[] = [];
    for (const path of commit.paths) {
      const owner = ownerOf(path);
      if (owner === null) missing.push(path);
      else owners.add(owner);
    }
    if (thresholds.maxOwnersPerCommit !== null && owners.size > thresholds.maxOwnersPerCommit) {
      excludedBroad++;
      continue;
    }
    for (const path of missing) unmapped.add(path);
    if (owners.size > 0) sampled.push([...owners].sort(byteOrder));
  }

  const commitsOf = new Map<ModuleId, number>();
  const sharedOf = new Map<string, number>();
  for (const owners of sampled) {
    for (const [index, first] of owners.entries()) {
      commitsOf.set(first, (commitsOf.get(first) ?? 0) + 1);
      for (const second of owners.slice(index + 1)) {
        const key = JSON.stringify([first, second]);
        sharedOf.set(key, (sharedOf.get(key) ?? 0) + 1);
      }
    }
  }
  const sufficient = (owner: ModuleId) => (commitsOf.get(owner) ?? 0) >= thresholds.minOwnerCommits;
  const owners: OwnerChangeCount[] = [...view.filesByOwner.keys()].sort(byteOrder)
    .map(owner => ({ owner, commits: commitsOf.get(owner) ?? 0, sufficient: sufficient(owner) }));
  const pairs: OwnerPairAffinity[] = [...sharedOf.entries()]
    .map(([key, shared]) => {
      const [first, second] = JSON.parse(key) as [ModuleId, ModuleId];
      const either = commitsOf.get(first)! + commitsOf.get(second)! - shared;
      return { first, second, shared, affinity: ratio(shared, either),
        sufficient: sufficient(first) && sufficient(second) && shared >= thresholds.minSharedCommits };
    })
    .sort((left, right) => byteOrder(left.first, right.first) || byteOrder(left.second, right.second));

  return { status: 'projected', report: {
    schemaVersion: 'ramify.change-affinity/1',
    // Rebuilt so properties serialize in contract declaration order whatever the caller's order.
    history: { source: history.provenance.source, head: history.provenance.head, range: history.provenance.range,
      firstParent: history.provenance.firstParent, merges: history.provenance.merges,
      projectDirectory: history.provenance.projectDirectory },
    thresholds: { minOwnerCommits: thresholds.minOwnerCommits, minSharedCommits: thresholds.minSharedCommits,
      maxOwnersPerCommit: thresholds.maxOwnersPerCommit, excludedCommits: [...excluded].sort(byteOrder) },
    revision: input.revision,
    filter,
    ownership: ownership.mode,
    candidateId: ownership.candidateId,
    commits: { examined: history.commits.length, sampled: sampled.length, excludedBroad, excludedExplicit },
    unmappedPaths: unmapped.size,
    owners,
    pairs,
  } };
}

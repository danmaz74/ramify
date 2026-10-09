import type { CandidateSource } from '../../subs/evidence/src/git.js';
import { resolveChangedPath, snapshotToolNames, type CandidateSnapshot } from './snapshot.js';

// Adapted from cucumber-viz 0.7.0's review-diff-payload.ts: the inline
// threshold, diff fencing and capped name-status rendering. Collection uses
// this project's pinned candidate source and path policy, never a worktree.
export const REVIEW_DIFF_INLINE_BUDGET_BYTES = 200 * 1024;
export const REVIEW_DIFF_SUMMARY_MAX_FILES = 200;

export interface ReviewDiffPayload {
  readonly mode: 'inline' | 'summary';
  readonly text: string;
  /** Only paths whose complete, nonempty patches appear in text. */
  readonly inlinePaths: readonly string[];
  /** UTF-8 bytes fetched before collection stopped, excluding presentation text.
   * In summary mode this is a lower bound on the full diff's bytes. */
  readonly bytes: number;
}

/** Collects review evidence from the fixed base/candidate before model startup. */
export async function collectReviewDiffPayload(
  snapshot: CandidateSnapshot,
  source: CandidateSource,
  projectRoot: string,
  signal?: AbortSignal,
  options: { readonly inlineBudgetBytes?: number; readonly summaryMaxFiles?: number } = {},
): Promise<ReviewDiffPayload> {
  const budget = options.inlineBudgetBytes ?? REVIEW_DIFF_INLINE_BUDGET_BYTES;
  const summaryMaxFiles = options.summaryMaxFiles ?? REVIEW_DIFF_SUMMARY_MAX_FILES;
  for (const [name, value] of [['inlineBudgetBytes', budget], ['summaryMaxFiles', summaryMaxFiles]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative safe integer`);
  }
  signal?.throwIfAborted();
  const patches: Array<{ path: string; patch: string }> = [];
  const unavailable: string[] = [];
  const visited = new Set<string>();
  let bytes = 0;
  for (const change of snapshot.changes) {
    signal?.throwIfAborted();
    const path = resolveChangedPath(snapshot, change.path);
    if (typeof path !== 'string') {
      unavailable.push(`${JSON.stringify(change.path)}: ${path.text}`);
      continue;
    }
    if (visited.has(path)) continue;
    visited.add(path);
    // Once the inline threshold is crossed, no subsequent patch will be
    // delivered. Still validate its path above and retain the full changed
    // list for the bounded summary, without fetching unused patch content.
    if (bytes > budget) continue;
    const patch = await source.diffPatch(projectRoot, snapshot.base, snapshot.commit, path, signal);
    signal?.throwIfAborted();
    bytes += Buffer.byteLength(patch, 'utf8');
    if (patch.trim().length === 0) unavailable.push(`${JSON.stringify(path)}: the source returned an empty patch`);
    else if (bytes <= budget) patches.push({ path, patch });
    if (bytes > budget) patches.length = 0;
  }
  const header = [
    '### Candidate Review Diff',
    '',
    `Base: ${snapshot.base}; candidate: ${snapshot.commit}.`,
    `Changed paths: ${snapshot.changes.length}; collected patch bytes: ${bytes}.`,
  ];
  const missing = unavailable.length === 0 ? [] : [
    '', 'Patches unavailable for automatic delivery (these paths do not count as inspected):',
    ...capLines(unavailable, summaryMaxFiles, 'unavailable paths'),
  ];
  if (bytes <= budget) {
    const patch = patches.map(entry => entry.patch).join('');
    // Source can contain Markdown fences; preserve the complete patch inside
    // a fence longer than every backtick run in it.
    let fenceLength = 3;
    for (const match of patch.matchAll(/`+/gu)) fenceLength = Math.max(fenceLength, match[0].length + 1);
    const fence = '`'.repeat(fenceLength);
    return {
      mode: 'inline', bytes, inlinePaths: patches.map(entry => entry.path),
      text: [...header, '', 'Complete patches below are supplied as inspection evidence. Request surrounding source when needed.',
        '', patch === '' ? '(no available patches)' : `${fence}diff\n${patch}\n${fence}`, ...missing].join('\n'),
    };
  }
  return {
    mode: 'summary', bytes, inlinePaths: [],
    text: [...header, '', `Collected patches exceed the ${budget}-byte inline budget; collection stopped at that threshold, so the collected byte count may be less than the full diff size. No patches are included; this summary does not count as inspection evidence.`,
      '', 'Name-status file list:',
      ...capLines(snapshot.changes.map(change => `${change.status}\t${JSON.stringify(change.path)}`), summaryMaxFiles, 'changed paths'),
      '', `Request complete per-file patches with ${snapshotToolNames.diff} and a path. Its reads use the same fixed base and candidate.`,
      `Use ${snapshotToolNames.diff} without a path only when you need changed paths omitted from this bounded summary.`, ...missing].join('\n'),
  };
}

/** The capped name-status pattern copied and adapted from cucumber-viz. */
function capLines(lines: readonly string[], maximum: number, kind: string): string[] {
  if (lines.length === 0) return ['(none)'];
  const shown = lines.slice(0, maximum);
  return lines.length <= maximum ? shown : [...shown, `(+${lines.length - maximum} more ${kind} omitted)`];
}

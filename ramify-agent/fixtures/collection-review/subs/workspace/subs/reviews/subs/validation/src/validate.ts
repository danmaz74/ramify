import type {
  Finding,
  InspectionReport,
} from '../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The review's rules about a revision chain.
 *
 * The validator reads a whole inspection report rather than a bare chain,
 * because the report already records which predecessor references resolved
 * within the revisions that were inspected. Re-deriving those facts here would
 * make this owner a second opinion about the inspection instead of a
 * judgement on its result.
 *
 * It is pure and deterministic: the same report always yields the same
 * findings in the same order. It imports nothing but the neutral vocabulary,
 * and nothing owned by the runtime that calls it is visible to it.
 */

/**
 * Every defect the reference rules find in one report, missing predecessors
 * first and repeated revision ids after them. An empty array means the
 * inspected chain is sound.
 */
export function validateRevisionChain(report: InspectionReport): Finding[] {
  return [...missingPredecessors(report), ...duplicateRevisions(report)];
}

/**
 * One finding per revision whose recorded predecessor resolved to no revision
 * of the inspected chain. The finding names the revision carrying the dangling
 * reference, which is where an author would have to look.
 */
function missingPredecessors(report: InspectionReport): Finding[] {
  const unresolved = new Set(report.unresolvedPredecessors);
  const findings: Finding[] = [];

  for (const revision of report.chain) {
    const predecessor = revision.predecessor;

    if (predecessor === null || !unresolved.has(predecessor)) {
      continue;
    }

    findings.push({
      code: 'missing-predecessor',
      message: `Revision ${revision.id} follows ${predecessor}, which is not a revision of the inspected chain.`,
      revisionId: revision.id,
    });
  }

  return findings;
}

/**
 * One finding per revision that repeats an id recorded earlier in the chain. A
 * chain naming the same revision twice has no single history, whatever its
 * predecessor references resolve to.
 */
function duplicateRevisions(report: InspectionReport): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];

  for (const revision of report.chain) {
    if (seen.has(revision.id)) {
      findings.push({
        code: 'duplicate-revision',
        message: `The chain records more than one revision under the id ${revision.id}.`,
        revisionId: revision.id,
      });
      continue;
    }

    seen.add(revision.id);
  }

  return findings;
}

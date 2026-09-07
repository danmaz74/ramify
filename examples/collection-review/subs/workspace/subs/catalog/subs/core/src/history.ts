import type { RevisionChain } from '../../../../contracts/src/interfaces/vocabulary.js';

/**
 * Reading predecessor references out of a revision chain.
 *
 * This helper is exported for this owner's own files and its own tests. It is
 * not exposed, so no other module can import it however its tags read.
 */

/** Which predecessor references name a revision of the chain, and which do not. */
export interface PredecessorResolution {
  readonly resolved: string[];
  readonly unresolved: string[];
}

/**
 * Splits a chain's predecessor references. A revision without a predecessor
 * contributes nothing; a reference is resolved when the chain contains a
 * revision with that id.
 */
export function resolvePredecessors(chain: RevisionChain): PredecessorResolution {
  const knownIds = new Set(chain.map((revision) => revision.id));
  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const revision of chain) {
    if (revision.predecessor === null) {
      continue;
    }

    if (knownIds.has(revision.predecessor)) {
      resolved.push(revision.predecessor);
    } else {
      unresolved.push(revision.predecessor);
    }
  }

  return { resolved, unresolved };
}

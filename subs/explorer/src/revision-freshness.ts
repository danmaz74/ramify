import type { ContextRevision } from '../../daemon/subs/contexts/src/interfaces/contexts.js';

/** The revision identity the fresher-analysis comparison needs. */
export type ComparableRevision = Pick<ContextRevision, 'revision' | 'sequence'> & {
  readonly token: Pick<ContextRevision['token'], 'generation'>;
};

/**
 * Whether a published revision is newer than the displayed one: its revision ID differs and either
 * its generation differs or its sequence is greater. A new generation restarts at sequence 1, so a
 * lower sequence in another generation is still newer.
 */
export function isNewerRevision(displayed: ComparableRevision, published: ComparableRevision): boolean {
  if (published.revision === displayed.revision) return false;
  return published.token.generation !== displayed.token.generation || published.sequence > displayed.sequence;
}

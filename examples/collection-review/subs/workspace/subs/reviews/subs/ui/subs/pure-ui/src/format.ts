import type { Finding } from '../../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * How this view writes a finding out.
 *
 * The formatter is exported so that this owner's own tests can read it
 * directly, and it is exposed by nothing: presentation wording is an internal
 * decision of the view that renders it. A consumer that needed the same string
 * would be asking for a contract this owner has not made.
 */

/**
 * One finding as a single line. A finding about a particular revision names it
 * first; a finding about the chain as a whole has no revision to name.
 */
export function formatFinding(finding: Finding): string {
  if (finding.revisionId === null) {
    return `${finding.code}: ${finding.message}`;
  }

  return `${finding.revisionId} — ${finding.code}: ${finding.message}`;
}

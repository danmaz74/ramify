import type { ReactElement } from 'react';

import { StatusBadge } from '../../../../../../shared-ui/src/status-badge.js';
import { formatFinding } from './format.js';
import styles from './review-result.module.css';
import type {
  Finding,
  Observation,
  RecordId,
  ReviewStatus,
} from '../../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * A finished review, rendered.
 *
 * The props are this owner's own type, written in the neutral vocabulary every
 * owner in the tree shares. That is what keeps the review runtime's own
 * `ReviewOutcome` out of the views: the outcome stops at the feature that
 * adapts it, and the connected panel above maps whatever the API answered onto
 * the shape declared here.
 */

/** What this view renders. Every member is neutral vocabulary. */
export interface ReviewResultProps {
  recordId: RecordId;
  status: ReviewStatus;
  findings: Finding[];
  observations: Observation[];
}

/** One review's verdict, its findings, and what the inspection observed. */
export function ReviewResult({
  recordId,
  status,
  findings,
  observations,
}: ReviewResultProps): ReactElement {
  return (
    <section className={styles.result}>
      <h3 className={styles.heading}>
        Review of {recordId} <StatusBadge status={status} />
      </h3>

      {findings.length === 0 ? (
        <p>No findings.</p>
      ) : (
        <ul className={styles.findings}>
          {findings.map((finding, index) => (
            <li key={`${index}-${finding.code}`}>{formatFinding(finding)}</li>
          ))}
        </ul>
      )}

      <ul className={styles.observations}>
        {observations.map((observation, index) => (
          <li key={`${index}-${observation.kind}`}>
            {observation.kind}: {observation.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

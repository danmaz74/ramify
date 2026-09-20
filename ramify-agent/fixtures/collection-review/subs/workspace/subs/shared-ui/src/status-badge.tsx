import type { ReactElement } from 'react';

import type { ReviewStatus } from '../../contracts/src/interfaces/vocabulary.js';

/**
 * The one presentation primitive both feature views render.
 *
 * It is deliberately tiny: a status and an optional label. Everything it needs
 * arrives as props, so the badge knows nothing about records, reviews, or the
 * protocol that produced either. Its styling is the application stylesheet's
 * plain `.status-badge` rules rather than a stylesheet of its own, which keeps
 * one badge looking the same wherever a feature places it.
 */

/** What the badge is rendered with. */
export interface StatusBadgeProps {
  status: ReviewStatus;
  label?: string;
}

/** The word each status reads as when the caller supplies no label. */
const defaultLabels: Record<ReviewStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
};

/**
 * One status, shown as a badge. `data-status` carries the status itself, so
 * both the stylesheet and a test can read it without matching on the label a
 * feature chose.
 */
export function StatusBadge({ status, label }: StatusBadgeProps): ReactElement {
  return (
    <span className="status-badge" data-status={status}>
      {label ?? defaultLabels[status]}
    </span>
  );
}

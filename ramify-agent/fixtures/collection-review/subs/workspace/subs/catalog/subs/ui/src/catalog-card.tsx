import type { ReactElement } from 'react';

import { CatalogSummary } from '../../core/src/catalog.js';
import { StatusBadge } from '../../../../shared-ui/src/status-badge.js';
import styles from './catalog-card.module.css';

/**
 * One record, shown as a card.
 *
 * The card is pure: it is handed a summary and renders it. It fetches nothing,
 * so it names no protocol type, and its own owner carries no `dispatch`
 * classification to name one with.
 *
 * `CatalogSummary` is imported without the `type` keyword on purpose. The
 * original is an interface with no runtime binding, so this is a type-only
 * request even though the source form is an ordinary import: the summary's
 * owner never promised that anything of its runtime is browser-safe, and this
 * browser-classified view still may import the shape.
 */

interface CatalogCardProps {
  summary: CatalogSummary;
}

/**
 * A card for one record. The badge reports whether the record has a recorded
 * history at all; it is not a review verdict, which is the neighbouring
 * panel's business.
 */
export function CatalogCard({ summary }: CatalogCardProps): ReactElement {
  const recorded = summary.revisionCount > 0;

  return (
    <article className={styles.card}>
      <h2>{summary.title}</h2>
      <StatusBadge
        status={recorded ? 'passed' : 'failed'}
        label={recorded ? 'History recorded' : 'No revisions'}
      />
      <dl className={styles.facts}>
        <dt>Record</dt>
        <dd>{summary.recordId}</dd>
        <dt>Revisions</dt>
        <dd>{summary.revisionCount}</dd>
        <dt>Latest revision</dt>
        <dd>{summary.latestRevisionId}</dd>
      </dl>
    </article>
  );
}

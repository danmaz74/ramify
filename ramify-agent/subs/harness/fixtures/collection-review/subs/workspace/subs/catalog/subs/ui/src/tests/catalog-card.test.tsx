import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CatalogCard } from '../catalog-card.js';

/**
 * The card, checked as static markup against a summary built here.
 *
 * The card takes its data as a prop, so a test needs no client, no server and
 * no record: the summary below is contextually typed by the component's own
 * props, which is what keeps it honest without a cast.
 */

describe('CatalogCard', () => {
  it('renders the record, its revision count and its latest revision', () => {
    const markup = renderToStaticMarkup(
      <CatalogCard
        summary={{
          recordId: 'rec-valid',
          title: 'Intact revision history',
          revisionCount: 2,
          latestRevisionId: 'rev-2',
        }}
      />,
    );

    expect(markup).toContain('Intact revision history');
    expect(markup).toContain('rec-valid');
    expect(markup).toContain('rev-2');
    expect(markup).toContain('History recorded');
    expect(markup).toContain('data-status="passed"');
  });

  it('says so when a record has no revisions at all', () => {
    const markup = renderToStaticMarkup(
      <CatalogCard
        summary={{
          recordId: 'rec-empty',
          title: 'Nothing recorded yet',
          revisionCount: 0,
          latestRevisionId: '',
        }}
      />,
    );

    expect(markup).toContain('No revisions');
    expect(markup).toContain('data-status="failed"');
  });
});

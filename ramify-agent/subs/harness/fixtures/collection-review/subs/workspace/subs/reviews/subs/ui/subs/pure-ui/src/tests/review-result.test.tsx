import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ReviewResult } from '../review-result.js';

/**
 * The view, checked as static markup against props built here.
 *
 * The props are the ones this owner declares, so a test needs neither a review
 * runtime nor a client to exercise the view: what the API answers is the
 * connected panel's problem, one module up.
 */

describe('ReviewResult', () => {
  it('renders the verdict, every finding and every observation', () => {
    const markup = renderToStaticMarkup(
      <ReviewResult
        recordId="rec-broken"
        status="failed"
        findings={[
          {
            code: 'missing-predecessor',
            message: 'Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
            revisionId: 'rev-2',
          },
        ]}
        observations={[
          { kind: 'inspection-started', message: 'Inspecting 2 of 2 revisions', recordId: 'rec-broken' },
        ]}
      />,
    );

    expect(markup).toContain('rec-broken');
    expect(markup).toContain('data-status="failed"');
    expect(markup).toContain('rev-2 — missing-predecessor');
    expect(markup).toContain('inspection-started: Inspecting 2 of 2 revisions');
  });

  it('says so when a review found nothing to report', () => {
    const markup = renderToStaticMarkup(
      <ReviewResult recordId="rec-valid" status="passed" findings={[]} observations={[]} />,
    );

    expect(markup).toContain('No findings.');
    expect(markup).toContain('data-status="passed"');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createTestSystem } from '../../../../../../../../src/tests/setup.js';
import { ReviewPanel, loadReview } from '../review-panel.js';
import { ReviewResult } from '../../subs/pure-ui/src/review-result.js';

/**
 * The connected view, driven against the configured system.
 *
 * The client below is the real one, over the real assembled router, so these
 * are the answers the listener gives. Rendering is static markup under Node:
 * this owner's test area carries `ui` and `dispatch` and never `browser`,
 * which is exactly the combination a Node test of a browser component needs.
 */

describe('loadReview', () => {
  it('maps a failed review onto the props the pure view declares', async () => {
    const { client } = createTestSystem();

    const props = await loadReview(client, 'rec-broken');

    expect(props).toEqual({
      recordId: 'rec-broken',
      status: 'failed',
      findings: [
        {
          code: 'missing-predecessor',
          message: 'Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
          revisionId: 'rev-2',
        },
      ],
      observations: [
        {
          kind: 'inspection-started',
          message: 'Inspecting 2 of 2 revisions',
          recordId: 'rec-broken',
        },
        {
          kind: 'inspection-finished',
          message: '1 predecessor reference(s) resolved to no revision',
          recordId: 'rec-broken',
        },
      ],
    });

    expect(renderToStaticMarkup(<ReviewResult {...props} />)).toContain(
      'rev-2 — missing-predecessor',
    );
  });

  it('maps a passed review the same way', async () => {
    const { client } = createTestSystem();

    const props = await loadReview(client, 'rec-valid');

    expect(props.recordId).toBe('rec-valid');
    expect(props.status).toBe('passed');
    expect(props.findings).toEqual([]);
    expect(props.observations.map((observation) => observation.kind)).toEqual([
      'inspection-started',
      'inspection-finished',
    ]);

    expect(renderToStaticMarkup(<ReviewResult {...props} />)).toContain('No findings.');
  });
});

describe('ReviewPanel', () => {
  it('offers the review before anything has been run', () => {
    const { client } = createTestSystem();

    const markup = renderToStaticMarkup(<ReviewPanel client={client} recordId="rec-broken" />);

    expect(markup).toContain('>Review</button>');
    expect(markup).not.toContain('missing-predecessor');
  });
});

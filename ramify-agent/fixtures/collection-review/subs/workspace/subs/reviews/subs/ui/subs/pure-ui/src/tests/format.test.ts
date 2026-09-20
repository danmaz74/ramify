import { describe, expect, it } from 'vitest';

import { formatFinding } from '../format.js';

/**
 * The private formatter, read directly.
 *
 * This owner's tests share its ownership, so they reach an export no other
 * module can. Nothing here goes through the component: the wording is worth
 * checking on its own, and the markup test beside this one checks that the
 * view uses it.
 */

describe('formatFinding', () => {
  it('names the revision a finding is about', () => {
    expect(
      formatFinding({
        code: 'missing-predecessor',
        message: 'Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
        revisionId: 'rev-2',
      }),
    ).toBe(
      'rev-2 — missing-predecessor: Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
    );
  });

  it('leaves out the revision when the finding is about the chain itself', () => {
    expect(
      formatFinding({
        code: 'empty-chain',
        message: 'The record has no revisions.',
        revisionId: null,
      }),
    ).toBe('empty-chain: The record has no revisions.');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../status-badge.js';

/**
 * The badge, checked as static markup.
 *
 * These tests run under Node: this owner's test area carries `ui` but never
 * `browser`, so a component written for the browser is exercised by rendering
 * it to a string rather than by mounting it in one.
 */

describe('StatusBadge', () => {
  it('reads a status back as its own word when no label is given', () => {
    expect(renderToStaticMarkup(<StatusBadge status="passed" />)).toContain('Passed');
    expect(renderToStaticMarkup(<StatusBadge status="failed" />)).toContain('Failed');
  });

  it('carries the status as an attribute whatever the label says', () => {
    const markup = renderToStaticMarkup(<StatusBadge status="failed" label="No revisions" />);

    expect(markup).toContain('data-status="failed"');
    expect(markup).toContain('No revisions');
    expect(markup).not.toContain('Failed');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { TRPCClient } from '@trpc/client';

import { createTestSystem } from '../../../../src/tests/setup.js';
import { Shell, loadShell } from '../app.js';
import type { AppRouter } from '../../../../src/interfaces/protocol.js';

/**
 * The shell, driven against the configured system.
 *
 * This owner's test area carries `testing`, `ui` and `dispatch`, which is what
 * lets one file use the root's testing-only setup and the views its feature
 * children expose upward. It never carries `browser`: the screen is rendered
 * to a string under Node instead of being mounted in one.
 *
 * The panel is lazily loaded, so a static render stops at its Suspense
 * fallback. That is the point of the split, not a limitation of it: the
 * panel's own tests exercise the panel.
 */

describe('the shell', () => {
  it('loads both records through the configured client', async () => {
    const { client } = createTestSystem();

    const summaries = await loadShell(client);

    expect(summaries).toEqual([
      {
        recordId: 'rec-valid',
        title: 'Intact revision history',
        revisionCount: 2,
        latestRevisionId: 'rev-2',
      },
      {
        recordId: 'rec-broken',
        title: 'Chain with a missing predecessor',
        revisionCount: 2,
        latestRevisionId: 'rev-2',
      },
    ]);
  });

  it('renders a card per record and the panel as its fallback', async () => {
    const { client } = createTestSystem();

    const markup = renderToStaticMarkup(
      <Shell client={client} summaries={await loadShell(client)} />,
    );

    expect(markup).toContain('Intact revision history');
    expect(markup).toContain('Chain with a missing predecessor');
    expect(markup).toContain('Loading the review panel');
    // The panel itself has not loaded, so its button is not in this markup.
    expect(markup).not.toContain('>Review</button>');
  });
});

/**
 * The client-side type assertions.
 *
 * A runtime call cannot tell an exact client type from a widened one, so these
 * assertions carry that half of the contract. `type-check` reports an unused
 * `@ts-expect-error` as an error, so neither negative below can go stale.
 */

describe('the typed client the shell holds', () => {
  it('keeps every procedure exactly as the root assembled it', async () => {
    const { client } = createTestSystem();

    expectTypeOf(client.catalog.get.query).parameter(0).toEqualTypeOf<{ recordId: string }>();
    expectTypeOf(client.reviews.run.mutate).parameter(0).toMatchObjectType<{ recordId: string }>();

    const summaries = await loadShell(client);

    expectTypeOf(summaries[0]).toMatchObjectType<{
      recordId: string;
      title: string;
      revisionCount: number;
      latestRevisionId: string;
    }>();
  });

  it('hands the lazily loaded panel exactly what the panel asks for', () => {
    type PanelProps = Parameters<
      typeof import('@features/reviews/subs/ui/src/review-panel.js').ReviewPanel
    >[0];

    expectTypeOf<PanelProps>().toMatchObjectType<{
      client: TRPCClient<AppRouter>;
      recordId: string;
    }>();
  });
});

/**
 * Neither declaration below is ever called: the assertion is the compiler
 * error each one provokes.
 */

async function catalogGetWithANumericRecordId(): Promise<void> {
  const { client } = createTestSystem();

  // @ts-expect-error The procedure's parser makes the record id a string, so a
  // number is not a legal call from the browser either.
  await client.catalog.get.query({ recordId: 1 });
}

async function reviewRunWithoutAnyInput(): Promise<void> {
  const { client } = createTestSystem();

  // @ts-expect-error The procedure has a required input, so the mutation
  // cannot be called with no argument at all.
  await client.reviews.run.mutate();
}

export { catalogGetWithANumericRecordId, reviewRunWithoutAnyInput };

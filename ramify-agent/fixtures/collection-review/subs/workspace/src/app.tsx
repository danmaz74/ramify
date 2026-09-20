import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { TRPCClient } from '@trpc/client';

import { createClient } from './client.js';
import { CatalogCard } from '@features/catalog/subs/ui/src/catalog-card.js';
import type { AppRouter } from '../../../src/interfaces/protocol.js';

/**
 * The screen: one card per record, and a review panel beside each.
 *
 * Both feature views arrive as symbols their features exposed upward to this
 * owner, through the one configured alias this example uses. Neither feature
 * can reach the other's view that way: a view travels up to the shell that
 * composes it, not down to a sibling.
 *
 * The panel is loaded lazily by a literal dynamic import that selects one
 * named member, so the bundler splits it into a chunk of its own and the
 * selected symbol stays identifiable.
 */
const ReviewPanel = lazy(() =>
  import('@features/reviews/subs/ui/src/review-panel.js').then((panel) => ({
    default: panel.ReviewPanel,
  })),
);

/**
 * The two records the screen shows. The API has no list procedure on purpose:
 * this application is two fixed records, and inventing a listing would be
 * inventing a capability the reference does not need.
 */
const shellRecordIds = ['rec-valid', 'rec-broken'] as const;

/**
 * What `catalog.get` answers, as the client infers it.
 *
 * The shell does not name `CatalogSummary`. That type is the catalog core's,
 * relayed down to the catalog's own view child and no further, so it is not
 * visible in this owner at all. Deriving the shape from the router type keeps
 * the shell exactly as precise without importing anything more.
 */
type RecordSummary = Awaited<ReturnType<TRPCClient<AppRouter>['catalog']['get']['query']>>;

/**
 * Fetches every record the screen shows. Loading is separated from rendering
 * so that a test can obtain the same data through the same client and then
 * render what came back.
 */
export async function loadShell(client: TRPCClient<AppRouter>): Promise<RecordSummary[]> {
  return Promise.all(shellRecordIds.map((recordId) => client.catalog.get.query({ recordId })));
}

interface ShellProps {
  client: TRPCClient<AppRouter>;
  summaries: readonly RecordSummary[];
}

/** The loaded screen. It renders what it is handed and fetches nothing. */
export function Shell({ client, summaries }: ShellProps): ReactElement {
  return (
    <main className="shell">
      <h1 className="shell__title">Collection Review</h1>
      <p className="shell__lead">
        Two records, one with an intact history and one whose chain names a revision it does not
        contain. Run a review to see what the difference is worth.
      </p>

      <ul className="shell__records">
        {summaries.map((summary) => (
          <li className="shell__record" key={summary.recordId}>
            <CatalogCard summary={summary} />
            <Suspense fallback={<p className="shell__loading">Loading the review panel</p>}>
              <ReviewPanel client={client} recordId={summary.recordId} />
            </Suspense>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** The application: it owns the client, loads the records, and renders them. */
export function App(): ReactElement {
  const [client] = useState(createClient);
  const [summaries, setSummaries] = useState<RecordSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;

    loadShell(client).then(
      (loaded) => {
        if (!abandoned) {
          setSummaries(loaded);
        }
      },
      (reason: unknown) => {
        if (!abandoned) {
          setFailure(reason instanceof Error ? reason.message : String(reason));
        }
      },
    );

    return () => {
      abandoned = true;
    };
  }, [client]);

  if (failure !== null) {
    return (
      <main className="shell">
        <h1 className="shell__title">Collection Review</h1>
        <p className="shell__failure" role="alert">
          The records could not be loaded: {failure}
        </p>
      </main>
    );
  }

  if (summaries === null) {
    return (
      <main className="shell">
        <h1 className="shell__title">Collection Review</h1>
        <p className="shell__loading">Loading the records</p>
      </main>
    );
  }

  return <Shell client={client} summaries={summaries} />;
}

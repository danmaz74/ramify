import type { PlanDocument } from '../../harness/src/interfaces/protocol/queries.js';
import type { ProtocolClient } from './client.js';
import { MapView } from './map-view.js';
import { mappingLabel } from './mapping.js';
import { Markdown } from './markdown.js';
import { routeHref } from './routes.js';
import { useQuery } from './use-query.js';

/** One plan: its Markdown, read-only, and its implementation map. */
export function PlanPage({ client, planId, view, revision, progressInterval }: {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly view: 'plan' | 'map';
  /** On the Map view, the saved revision chosen; the latest when absent. */
  readonly revision?: number | undefined;
  /** How often a running job's progress is fetched, in milliseconds. */
  readonly progressInterval?: number;
}) {
  const { state, reload } = useQuery(`plan:${planId}`, () => client.getPlan(planId));
  return (
    <section className="page">
      <p><a href={routeHref({ page: 'plans' })}>← All plans</a></p>
      {state.status === 'loading' && <p className="muted">Loading the plan…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the plan “{planId}”: {state.error.message}</p>}
      {state.status === 'ready' && <PlanViews client={client} plan={state.data} view={view} revision={revision} reload={reload} progressInterval={progressInterval} />}
    </section>
  );
}

function PlanViews({ client, plan, view, revision, reload, progressInterval }: {
  readonly client: ProtocolClient;
  readonly plan: PlanDocument;
  readonly view: 'plan' | 'map';
  readonly revision: number | undefined;
  readonly reload: () => void;
  readonly progressInterval: number | undefined;
}) {
  return (
    <>
      <header className="plan-header">
        <h1>{plan.title}</h1>
        <p className="muted"><code>{plan.path}</code> · {mappingLabel(plan.mapping)}</p>
      </header>
      <nav className="tabs" aria-label="Plan views">
        <a href={routeHref({ page: 'plan', planId: plan.id, view: 'plan' })} aria-current={view === 'plan' ? 'page' : undefined}>Plan</a>
        <a href={routeHref({ page: 'plan', planId: plan.id, view: 'map' })} aria-current={view === 'map' ? 'page' : undefined}>Map</a>
      </nav>
      {view === 'plan'
        ? <article className="plan-body" aria-label="Plan text"><Markdown source={plan.markdown} /></article>
        : <MapView client={client} plan={plan} revision={revision} reload={reload} progressInterval={progressInterval} />}
    </>
  );
}

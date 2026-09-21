import type { PlanEntry } from '../../harness/src/interfaces/protocol/queries.js';
import type { ProjectInfo, ProtocolClient } from './client.js';
import { routeHref } from './routes.js';
import { useQuery } from './use-query.js';

/** Every plan of the project. */
export function PlansPage({ client, project }: { readonly client: ProtocolClient; readonly project: ProjectInfo | undefined }) {
  const { state, reload, reloading } = useQuery('plans', () => client.listPlans());
  return (
    <section className="page" aria-labelledby="plans-heading">
      <header className="page-header">
        <h1 id="plans-heading">Plans</h1>
        <button type="button" onClick={reload} disabled={reloading || state.status === 'loading'}>
          {reloading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {state.status === 'loading' && <p className="muted">Loading plans…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the plans: {state.error.message}</p>}
      {state.status === 'ready' && (state.data.length === 0
        ? <EmptyPlans project={project} />
        : <PlanList plans={state.data} />)}
    </section>
  );
}

function EmptyPlans({ project }: { readonly project: ProjectInfo | undefined }) {
  return (
    <div className="empty">
      <p><strong>This project has no plans yet.</strong></p>
      <p>
        A plan is a Markdown file at <code>{project?.planPattern ?? 'plans/<plan-id>/plan.md'}</code>
        {project ? <> in <code>{project.root}</code></> : ' in the project root'}. Add one and refresh.
      </p>
    </div>
  );
}

function PlanList({ plans }: { readonly plans: readonly PlanEntry[] }) {
  return (
    <ul className="plan-list">
      {plans.map(plan => plan.status === 'readable'
        ? (
          <li key={plan.id} className="plan-entry">
            <a className="plan-title" href={routeHref({ page: 'plan', planId: plan.id })}>{plan.title}</a>
            <code className="plan-path">{plan.path}</code>
          </li>
        )
        : (
          <li key={plan.id} className="plan-entry plan-entry-error">
            <span className="plan-title">{plan.id}</span>
            <code className="plan-path">{plan.path}</code>
            <span className="failure">Unreadable: {plan.message}</span>
          </li>
        ))}
    </ul>
  );
}

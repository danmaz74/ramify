import { useEffect, useState } from 'react';
import type { ProtocolClient } from './client.js';
import { ConnectionStatus } from './connection.js';
import { PlanPage } from './plan-page.js';
import { PlansPage } from './plans-page.js';
import { RunPage } from './run-page.js';
import { parseRoute, routeHref, sessionKey } from './routes.js';
import { SessionPage } from './session-page.js';
import { SessionsPage } from './sessions-page.js';
import { useQuery } from './use-query.js';

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash;
}

/**
 * The web client: a header with the project and the connection, and the current page.
 *
 * `<main>` carries the current route as a class, so a route whose page draws a canvas
 * can lift the shell's reading-measure width cap for itself.
 */
export function App({ client }: { readonly client: ProtocolClient }) {
  const route = parseRoute(useHash());
  const { state: project } = useQuery('project', () => client.getProject());
  const projectInfo = project.status === 'ready' ? project.data : undefined;
  useEffect(() => {
    document.title = projectInfo ? `${projectInfo.name} · ramify-agent` : 'ramify-agent';
  }, [projectInfo]);
  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href={routeHref({ page: 'plans' })}>ramify-agent</a>
        <span className="project" title={projectInfo?.root}>{projectInfo?.name ?? ''}</span>
        <nav className="app-nav" aria-label="Pages">
          <a href={routeHref({ page: 'plans' })} aria-current={route.page === 'plans' ? 'page' : undefined}>Plans</a>
          <a href={routeHref({ page: 'sessions' })} aria-current={route.page === 'sessions' ? 'page' : undefined}>Sessions</a>
        </nav>
        <ConnectionStatus client={client} />
      </header>
      <main className={`route-${route.page}`}>
        {route.page === 'plans' && <PlansPage client={client} project={projectInfo} />}
        {route.page === 'plan' && <PlanPage client={client} planId={route.planId} />}
        {route.page === 'run' && <RunPage key={`${route.planId}/${route.runId}`} client={client} planId={route.planId} runId={route.runId} />}
        {route.page === 'sessions' && <SessionsPage client={client} />}
        {route.page === 'session' && <SessionPage key={sessionKey(route.session)} client={client} session={route.session} anchor={route.anchor} />}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { ProtocolClient } from './client.js';
import { ConnectionStatus } from './connection.js';
import { HeaderDecisionWaits, useDecisionWaits, waitingTitlePrefix } from './decision-waits.js';
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
 * The web client: a header with the project, the connection and every run that waits
 * for the person's decision, and the current page.
 *
 * `<main>` carries the current route as a class, so a route whose page draws a canvas
 * can lift the shell's reading-measure width cap for itself.
 */
export function App({ client, attentionInterval }: {
  readonly client: ProtocolClient;
  /** How often the header asks which runs wait for the person's decision, in milliseconds. */
  readonly attentionInterval?: number;
}) {
  const route = parseRoute(useHash());
  const { state: project } = useQuery('project', () => client.getProject());
  const projectInfo = project.status === 'ready' ? project.data : undefined;
  const waits = useDecisionWaits(client, attentionInterval);
  const waiting = waits.length > 0;
  // A background tab's title says a run waits for the person: there is no notification yet.
  useEffect(() => {
    document.title = `${waiting ? waitingTitlePrefix : ''}${projectInfo ? `${projectInfo.name} · ramify-agent` : 'ramify-agent'}`;
  }, [projectInfo, waiting]);
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
        <HeaderDecisionWaits waits={waits} />
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

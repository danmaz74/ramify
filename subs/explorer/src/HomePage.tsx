import React, { useEffect, useState } from 'react';
import type { ServerStatusResult } from '../../service-api/src/interfaces/explorer-service.js';
import { bindingStateText, type ExplorerClient } from './published-project-view.js';

/** The server's pages; the home page lists each one. */
export const serverPages = [
  { label: 'Module explorer', path: '/analysis/latest' },
  { label: 'Module tree', path: '/modules/latest' },
] as const;

export interface HomePageProps {
  readonly client: Pick<ExplorerClient, 'serverStatus'>;
  readonly pollIntervalMs?: number;
}

export function HomePage({ client, pollIntervalMs = 3000 }: HomePageProps): React.ReactElement {
  const [status, setStatus] = useState<ServerStatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const result = await client.serverStatus();
        if (!active) return;
        setStatus(result);
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    const timer = setInterval(() => { void poll(); }, pollIntervalMs);
    const visible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [client, pollIntervalMs]);

  return <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '48rem', margin: '0 auto', padding: '2rem 1rem' }}>
    <h1>Ramify</h1>
    <dl>
      <dt>Project root</dt>
      <dd>{status ? status.root : 'Loading...'}</dd>
      <dt>Binding</dt>
      <dd data-binding={status?.binding}>{status ? bindingStateText(status) : 'Loading...'}</dd>
      <dt>Daemon PID</dt>
      <dd>{status?.daemonPid ?? 'none'}</dd>
    </dl>
    {error && <p role="alert">Server status unavailable: {error}</p>}
    <nav aria-label="Pages">
      <ul>
        {serverPages.map(page => <li key={page.path}><a href={page.path}>{page.label}</a></li>)}
      </ul>
    </nav>
  </main>;
}

import { useEffect, useState } from 'react';
import type { ConnectionState, ProtocolClient } from './client.js';

const labels: Record<ConnectionState, string> = {
  connecting: 'Connecting to the harness',
  connected: 'Connected to the harness',
  disconnected: 'The harness is not answering',
};

/** The connection to the harness, shown apart from any page's content. */
export function ConnectionStatus({ client, probeInterval = 5000 }: {
  readonly client: ProtocolClient;
  /** How often to ask the harness when no page is asking, in milliseconds. */
  readonly probeInterval?: number;
}) {
  const [state, setState] = useState(client.connection());
  useEffect(() => {
    setState(client.connection());
    return client.onConnectionChange(setState);
  }, [client]);
  useEffect(() => {
    // Any answer updates the state; the probe's own result is not needed.
    const timer = setInterval(() => { client.getProject().catch(() => undefined); }, probeInterval);
    return () => clearInterval(timer);
  }, [client, probeInterval]);
  return (
    <p className={`connection connection-${state}`} role="status" aria-label="Connection">
      <span className="connection-dot" aria-hidden="true" />
      {labels[state]}
    </p>
  );
}

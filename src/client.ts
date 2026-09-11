import { fileURLToPath } from 'node:url';
import { connectDaemon } from '../subs/daemon/src/connect-daemon.js';
import type { ServiceConnector } from '../subs/daemon/src/interfaces/daemon.js';

/** Root selects process delivery; the lightweight client never reads a test override. */
export function createServiceConnector(version: string): ServiceConnector {
  return options => connectDaemon({ ...options, client: { name: 'ramify-cli', version },
    engine: `ramify.ts@${version}+typescript@7.0.2`,
    daemonEntry: process.env.RAMIFY_DAEMON_ENTRY ?? fileURLToPath(new URL('./daemon-entry.js', import.meta.url)),
    ...(process.env.RAMIFY_ENDPOINT_DIR ? { endpointDirectory: process.env.RAMIFY_ENDPOINT_DIR } : {}),
  });
}

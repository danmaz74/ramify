import { fileURLToPath } from 'node:url';
import { connectDaemon } from '../subs/daemon/src/connect-daemon.js';
import type { ServiceConnector } from '../subs/daemon/src/interfaces/daemon.js';

/** Where the installed build lives. The Node entry derives it from its own module path;
 * the compiled client, whose modules are embedded, supplies all three. */
export interface ClientLocation {
  readonly packageRoot: string;
  readonly daemonEntry: string;
  readonly daemonRuntime: string;
}

/** Root selects process delivery; the lightweight client never reads a test override. */
export function createServiceConnector(version: string, location?: ClientLocation): ServiceConnector {
  return options => connectDaemon({ ...options, client: { name: 'ramify-cli', version },
    engine: `ramify.ts@${version}+typescript@7.0.2`,
    daemonEntry: process.env.RAMIFY_DAEMON_ENTRY ?? location?.daemonEntry ?? fileURLToPath(new URL('./daemon-entry.js', import.meta.url)),
    ...(location ? { packageRoot: location.packageRoot, daemonRuntime: location.daemonRuntime } : {}),
    ...(process.env.RAMIFY_ENDPOINT_DIR ? { endpointDirectory: process.env.RAMIFY_ENDPOINT_DIR } : {}),
  });
}

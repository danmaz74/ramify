import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ContextToken } from '../../daemon/src/context-types.js';
import { explorerProjectKey } from '../../service-api/src/web-discovery.js';
import type { CliEnvironment, CliExitCode, ExplorerLaunch } from './interfaces/cli.js';
import { capabilities } from './command-support.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

interface ExploreArguments { readonly root?: string }

/** Select one project through the resident daemon, start or reuse that project's
 * resident explorer server and open its latest analysis page. The server outlives
 * this command, including when the platform opener fails. */
export async function exploreCommand(args: ExploreArguments, environment: CliEnvironment,
  control: RunControl): Promise<CliExitCode> {
  if (!environment.explore || !environment.openBrowser) {
    throw new CliFailure('unavailable', 'Explorer launch is unavailable in this CLI host', null);
  }
  const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
  if (connected.status === 'stopped') throw new CliFailure('stopped', 'Daemon stopped explicitly', connected.record);
  if (connected.status === 'not-running') throw new CliFailure('unavailable', 'No daemon running', connected);
  const connection = connected.connection;
  let token: ContextToken | undefined;
  let launched: ExplorerLaunch | undefined;
  try {
    const opened = await connection.openContext({ project: { cwd: environment.cwd,
      ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
    setup: { registry: 'default', capabilities } }, control);
    control.signal?.throwIfAborted();
    if (!opened.ok) throw serviceFailure(opened.error);
    if (opened.value.status === 'unresolved') {
      const message = opened.value.resolution.issues[0]?.message
        ?? `Project resolution ${opened.value.resolution.status}`;
      throw new CliFailure(opened.value.resolution.status === 'invalid' ? 'invalid-request' : 'unavailable', message, opened.value);
    }
    if (opened.value.status === 'unavailable') throw new CliFailure(
      opened.value.reason === 'disposed' || opened.value.reason === 'configuration-changed' ? 'unavailable' : opened.value.reason,
      opened.value.message, opened.value);
    token = opened.value.token;
    launched = await environment.explore({ root: opened.value.current.selection.root,
      projectKey: explorerProjectKey(token.context) }, control);
    control.signal?.throwIfAborted();
    environment.stdout(`Explorer: ${launched.url}\n`);
    try { await environment.openBrowser(launched.url, control); }
    catch (error) {
      control.signal?.throwIfAborted();
      // The resident server keeps running; the printed URL remains usable.
      environment.stderr(`Warning: Could not open the browser: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    return 0;
  } finally {
    try { if (token && connection.state === 'connected') await connection.closeContext({ token }); }
    finally { await connection.close(); }
  }
}

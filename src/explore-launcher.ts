import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { RunControl } from '../subs/analysis/src/interfaces/analysis.js';
import { selectEndpoint } from '../subs/daemon/src/discovery.js';
import { ensureExplorerWebProcess } from '../subs/service-api/src/web-launcher.js';
import { explorerProjectUrl, selectExplorerEndpoint } from '../subs/service-api/src/web-discovery.js';
import type { ClientLocation } from './client.js';
import type { BrowserOpener, ExplorerLaunch } from '../subs/cli/src/interfaces/cli.js';

export interface InstalledExplorerOptions {
  readonly packageRoot: string;
  readonly version: string;
  readonly location?: ClientLocation;
  readonly endpointDirectory?: string;
  readonly startupMs?: number;
}

/** Select the same installed-build endpoint as the daemon connector, then start
 * or reuse the resident server for this project. `root` is the context's resolved
 * root and `projectKey` the first 16 hex digits of its context ID. */
export async function launchInstalledExplorer(input: { readonly root: string; readonly projectKey: string },
  options: InstalledExplorerOptions, control: RunControl = {}): Promise<ExplorerLaunch> {
  const endpoint = await selectEndpoint({ packageRoot: options.packageRoot, version: options.version,
    ...(options.endpointDirectory ? { endpointDirectory: options.endpointDirectory } : {}) });
  const selected = selectExplorerEndpoint(endpoint, input.projectKey);
  const launched = await ensureExplorerWebProcess({ endpoint: selected, root: input.root, projectKey: input.projectKey,
    version: options.version, explorerEntry: join(options.packageRoot, 'dist/src/explorer-entry.js'),
    ...(options.location ? { runtime: options.location.daemonRuntime } : {}),
    ...(options.startupMs === undefined ? {} : { startupMs: options.startupMs }), signal: control.signal });
  return { url: explorerProjectUrl(launched.record), started: launched.started,
    cleanup: launched.terminateOwned };
}

/** Platform handoff port. Success means the opener process accepted the request;
 * the CLI does not wait for or own the browser application. */
export const openPlatformBrowser: BrowserOpener = async (url, control) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')) throw new Error('Refusing a non-local explorer URL');
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (!command) throw new Error(`Explorer browser opening is unsupported on ${process.platform}`);
  control?.signal?.throwIfAborted();
  const child = spawn(command, [url], { detached: true, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => {
    const abort = () => { child.kill('SIGTERM'); reject(control?.signal?.reason ?? new Error('Browser opening was cancelled')); };
    const cleanup = () => control?.signal?.removeEventListener('abort', abort);
    child.once('spawn', () => { cleanup(); child.unref(); resolve(); });
    child.once('error', (error: NodeJS.ErrnoException) => { cleanup(); reject(new Error(`Cannot run ${command} (${error.code ?? error.message})`)); });
    control?.signal?.addEventListener('abort', abort, { once: true });
    if (control?.signal?.aborted) abort();
  });
};

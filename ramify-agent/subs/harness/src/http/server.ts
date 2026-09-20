import { existsSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import { JobService, type JobServiceOptions, type RecoveryReport } from '../jobs/service.js';
import { architectProcedure } from '../mapping/architect.js';
import { demonstrationScript } from '../mapping/demo-script.js';
import type { MappingProcedure } from '../mapping/procedure.js';
import { privateRamify, type RamifyCli } from '../mapping/ramify-cli.js';
import { acquireProjectLock } from '../store/lock.js';
import { createApp } from './app.js';

/**
 * The agent that runs mapping jobs. `pi` is pi with the person's own login.
 * `fake` is the scripted fake with a demonstration script, chosen
 * explicitly; it is never the default.
 */
export type AgentChoice = 'pi' | 'fake' | AgentPort;

export interface ServerOptions {
  /** The project to serve; it must contain a root `module.ramify`. */
  readonly projectRoot: string;
  /** The port to listen on; 0 lets the system choose. */
  readonly port: number;
  /** The interface to bind. Defaults to the loopback interface. */
  readonly host?: string | undefined;
  /** The built web client; omitted or missing, only the protocol is served. */
  readonly assetsDirectory?: string | undefined;
  /** Without an agent, the harness serves plans and jobs but starts none. */
  readonly agent?: AgentChoice | undefined;
  /** The model pi runs, such as `anthropic/claude-opus-4-5`; default: the first model pi has credentials for. */
  readonly piModel?: string | undefined;
  /** The pause between the demonstration script's steps, in milliseconds. */
  readonly fakePaceMs?: number | undefined;
  /**
   * How the harness runs Ramify. Default: the `ramify` CLI with a daemon of
   * the harness's own, which each job restarts and `close` stops.
   */
  readonly ramify?: RamifyCli | undefined;
  /** Job settings for tests: the stop bound, the correction bound, the procedure and publication hooks. */
  readonly jobs?: (Omit<JobServiceOptions, 'projectRoot' | 'lock' | 'agent' | 'procedure'> & { readonly procedure?: MappingProcedure | undefined }) | undefined;
}

export interface RunningServer {
  /** The origin the server answers on, such as `http://127.0.0.1:4180`. */
  readonly url: string;
  readonly projectRoot: string;
  /** Whether the web client's assets are being served. */
  readonly servesWebClient: boolean;
  /** The agent's name, or `undefined` when none is configured. */
  readonly agent: string | undefined;
  /** For pi: the model it will run, or why it cannot run a session yet. */
  readonly agentStatus: string | undefined;
  /** What the start-up recovery did with jobs left without a terminal event. */
  readonly recovery: RecoveryReport;
  /** Stops serving, asks a running session to stop and releases the project lock. */
  close(): Promise<void>;
}

/** Thrown when the project root is not a Ramify project directory. */
export class ProjectRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectRootError';
  }
}

/**
 * Starts the harness for one project: takes the project lock, recovers the
 * jobs a previous harness left, and serves the protocol.
 */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new ProjectRootError(`The project root ${projectRoot} is not a directory`);
  }
  if (!existsSync(join(projectRoot, 'module.ramify'))) {
    throw new ProjectRootError(`The project root ${projectRoot} has no module.ramify`);
  }
  const agent = options.agent === 'fake'
    ? createScriptedAgent(demonstrationScript(options.fakePaceMs ?? 1500))
    : options.agent === 'pi' ? createPiAgent({ model: options.piModel }) : options.agent;
  const lock = await acquireProjectLock(projectRoot);
  let owned: Awaited<ReturnType<typeof privateRamify>> | undefined;
  let jobs: JobService;
  let recovery: RecoveryReport;
  try {
    let procedure = options.jobs?.procedure;
    if (!procedure) {
      let ramify = options.ramify;
      if (!ramify) {
        owned = await privateRamify();
        ramify = owned.ramify;
      }
      procedure = architectProcedure({ ramify, freshContextPerJob: true });
    }
    ({ service: jobs, recovery } = await JobService.open({ ...options.jobs, procedure, projectRoot, lock, agent }));
  } catch (error) {
    await owned?.dispose();
    await lock.release();
    throw error;
  }
  const servesWebClient = options.assetsDirectory !== undefined && existsSync(join(options.assetsDirectory, 'index.html'));
  const app = createApp({ projectRoot, assetsDirectory: servesWebClient ? options.assetsDirectory : undefined, jobs });
  const host = options.host ?? '127.0.0.1';
  let server: import('node:http').Server;
  try {
    server = await new Promise<import('node:http').Server>((accept, reject) => {
      const listening = app.listen(options.port, host, error => (error ? reject(error) : accept(listening)));
    });
  } catch (error) {
    await jobs.close();
    await owned?.dispose();
    throw error;
  }
  const { port } = server.address() as AddressInfo;
  let agentStatus: string | undefined;
  if (options.agent === 'pi') {
    const readiness = await piReadiness({ model: options.piModel });
    agentStatus = readiness.ready ? `pi runs ${readiness.model}.` : `pi cannot run a session yet: ${readiness.reason}`;
  }
  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    projectRoot,
    servesWebClient,
    agent: agent?.name,
    agentStatus,
    recovery,
    close: async () => {
      await new Promise<void>((accept, reject) => {
        server.close(error => (error ? reject(error) : accept()));
        server.closeAllConnections();
      });
      await jobs.close();
      await owned?.dispose();
    },
  };
}

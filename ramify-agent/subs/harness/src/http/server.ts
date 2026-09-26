import { existsSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { AgentPort, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import { privateRamify, type RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { InitialAnalysisSubmission } from '../analysis/submission.js';
import {
  checkToolName, intakeToolName, principleToolName, type CheckSubmission, type IntakeSubmission, type PrincipleSubmission,
} from '../analysis/extraction.js';
import { architectRunInputs } from '../run/inputs.js';
import { createAuditCheckExecution } from '../../subs/audit/src/check-execution.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { RunService, type RunRecoveryReport, type RunServiceOptions } from '../run/service.js';
import { acquireProjectLock } from '../store/lock.js';
import { createApp } from './app.js';

/**
 * The agent a run is started with. `pi` is pi with the person's own login.
 * `fake` is the scripted fake, chosen explicitly and never the default: its
 * initial architect submits an analysis with no entry capability, so the
 * run it drives exercises the lifecycle, readiness and the final gate over
 * the project's own commands, and changes no source. A test of this module
 * may supply an implementation of its own.
 */
export type AgentChoice = 'pi' | 'fake' | AgentPort;

/** What the root starts a server with. */
export interface ServerOptions {
  /** The project to serve; it must contain a root `module.ramify`. */
  readonly projectRoot: string;
  /** The port to listen on; 0 lets the system choose. */
  readonly port: number;
  /** The interface to bind. Defaults to the loopback interface. */
  readonly host?: string | undefined;
  /** The built web client; omitted or missing, only the protocol is served. */
  readonly assetsDirectory?: string | undefined;
  /** Without an agent, the harness serves plans and runs but starts none. */
  readonly agent?: 'pi' | 'fake' | undefined;
  /** The model pi runs, such as `anthropic/claude-opus-4-5`; default: the first model pi has credentials for. */
  readonly piModel?: string | undefined;
}

/**
 * What this module's own tests may add to the root's options: an agent they
 * built, the Ramify command line and run settings. They stay internal, with
 * the run service they configure.
 */
export interface ServerSettings extends Omit<ServerOptions, 'agent'> {
  readonly agent?: AgentChoice | undefined;
  /**
   * How the harness runs Ramify. Default: the `ramify` CLI with a daemon of
   * the harness's own, which `close` stops.
   */
  readonly ramify?: RamifyCli | undefined;
  /** Run settings for tests: the inputs, the policy, the stop bound and the write hook. */
  readonly runs?: Partial<Omit<RunServiceOptions, 'projectRoot' | 'lock' | 'agent' | 'ramify'>> | undefined;
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
  /** What the start-up recovery did with runs left without a terminal event. */
  readonly recovery: RunRecoveryReport;
  /** Stops serving, stops a running run's session, stops the harness's own daemon and releases the project lock. */
  close(): Promise<void>;
}

/** The server options the package root's `serve` command owns. */
export interface CliServerOptions {
  readonly projectRoot: string;
  readonly port: number;
  readonly assetsDirectory?: string | undefined;
  readonly agent?: 'pi' | 'fake' | undefined;
  readonly piModel?: string | undefined;
}

/** What the package root needs to print and stop after starting `serve`. */
export interface CliServer {
  readonly url: string;
  readonly projectRoot: string;
  readonly servesWebClient: boolean;
  readonly agent: string | undefined;
  readonly agentStatus: string | undefined;
  readonly recovery: {
    readonly interrupted: string[];
    readonly rematerialized: string[];
    readonly effects: string[];
    readonly invocations: string[];
    readonly skipped: string[];
  };
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
 * The scripted fake's turns: an intake that reads no element and
 * incorporates the root plan's scenarios, principles extractions and checks
 * that find nothing, and an analysis with no entry capability. It is typed
 * as the submissions it makes, so a change to their schemas fails to compile
 * here. A plan with a `gherkin` block of its own is beyond it: every plan
 * scenario must appear in the analysis, and this one names none.
 */
export function demonstrationScript(spec?: SessionSpec): ScriptStep[] {
  const submit = (input: unknown): ScriptStep[] => [{ kind: 'submit', input }];
  switch (spec?.submission.name) {
    case intakeToolName: {
      const plans = [...spec.prompt.matchAll(/^- (doc-\d{3,}) \(plan\):/gmu)].map(match => match[1]!);
      const intake: IntakeSubmission = {
        goal: 'The scripted fake reads nothing of the plan.',
        elements: [],
        incorporation: { documents: plans.map((document, index) => ({ document, scenarios: index === 0, uncertainty: '' })), missing: [] },
      };
      return submit(intake);
    }
    case principleToolName: return submit({ elements: [] } satisfies PrincipleSubmission);
    case checkToolName: return submit({ corrections: [], entries: [], scenarios: [] } satisfies CheckSubmission);
    default: break;
  }
  const analysis: InitialAnalysisSubmission = {
    elements: [],
    entries: [],
    hypotheses: [],
    coverageLimits: ['The scripted fake analyses nothing: this run exercises the lifecycle, readiness and the final gate only.'],
    scenarios: [],
    integrationScenarios: [],
  };
  return [
    { kind: 'message', text: 'The scripted fake reads nothing and assigns no entry capability.' },
    ...submit(analysis),
  ];
}

/**
 * Starts the harness for one project: takes the project lock, recovers the
 * runs a previous harness left without a terminal event, and serves the
 * protocol's queries and commands.
 */
export function startServer(options: ServerOptions): Promise<RunningServer> {
  return startServerWith(options);
}

/** `startServer`, with the settings only this module's tests supply. */
export async function startServerWith(options: ServerSettings): Promise<RunningServer> {
  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new ProjectRootError(`The project root ${projectRoot} is not a directory`);
  }
  if (!existsSync(join(projectRoot, 'module.ramify'))) {
    throw new ProjectRootError(`The project root ${projectRoot} has no module.ramify`);
  }
  const agent = options.agent === 'fake'
    ? createScriptedAgent(spec => demonstrationScript(spec))
    : options.agent === 'pi' ? createPiAgent({ model: options.piModel }) : options.agent;
  // pi resolves the model it runs, and each session records it.
  const readiness = options.agent === 'pi' ? await piReadiness({ model: options.piModel }) : undefined;
  const model = readiness?.ready === true ? readiness.model : options.piModel;
  const lock = await acquireProjectLock(projectRoot);
  let owned: Awaited<ReturnType<typeof privateRamify>> | undefined;
  let runs: RunService;
  let recovery: RunRecoveryReport;
  try {
    let ramify = options.ramify;
    if (!ramify) {
      owned = await privateRamify();
      ramify = owned.ramify;
    }
    ({ service: runs, recovery } = await RunService.open({
      inputs: architectRunInputs({ ramify }),
      ...options.runs,
      projectRoot,
      lock,
      ramify,
      checkExecution: options.runs?.checkExecution ?? createAuditCheckExecution({ workspaceOwnership: createAuditWorkspaceOwnership(projectRoot) }),
      ...(agent === undefined ? {} : { agent }),
      ...(model === undefined ? {} : { model }),
    }));
  } catch (error) {
    await owned?.dispose();
    await lock.release();
    throw error;
  }
  const servesWebClient = options.assetsDirectory !== undefined && existsSync(join(options.assetsDirectory, 'index.html'));
  const app = createApp({ projectRoot, assetsDirectory: servesWebClient ? options.assetsDirectory : undefined, runs });
  const host = options.host ?? '127.0.0.1';
  let server: import('node:http').Server;
  try {
    server = await new Promise<import('node:http').Server>((accept, reject) => {
      const listening = app.listen(options.port, host, error => (error ? reject(error) : accept(listening)));
    });
  } catch (error) {
    // Closing the run service releases the project lock.
    await runs.close();
    await owned?.dispose();
    throw error;
  }
  const { port } = server.address() as AddressInfo;
  const agentStatus = readiness === undefined
    ? undefined
    : readiness.ready ? `pi runs ${readiness.model}.` : `pi cannot run a session yet: ${readiness.reason}`;
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
      await runs.close();
      await owned?.dispose();
    },
  };
}

/** Starts the harness with exactly the options exposed by the package CLI. */
export function startCliServer(options: CliServerOptions): Promise<CliServer> {
  return startServer(options);
}

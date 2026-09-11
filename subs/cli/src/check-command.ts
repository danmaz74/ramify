import { randomUUID } from 'node:crypto';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ContextToken } from '../../daemon/src/context-types.js';
import type { CliEnvironment, CliExitCode } from './interfaces/cli.js';
import { capabilities, printReport } from './command-support.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

interface CheckArguments { readonly root?: string; readonly format: 'human' | 'json'; readonly batch: boolean }

export async function checkCommand(args: CheckArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  async function batch(mode: string): Promise<CliExitCode> {
    const result = await environment.batch({ cwd: environment.cwd,
      ...(args.root === undefined ? {} : { root: args.root }), capabilities }, control);
    if (result.status === 'cancelled' || control.signal?.aborted) throw new Error('Interrupted');
    const code = printReport(result.report, mode, args.format, environment);
    return result.exitCode === 2 ? 2 : result.exitCode === 1 && code === 0 ? 1 : code;
  }
  async function fallback(message: string): Promise<CliExitCode> {
    control.signal?.throwIfAborted();
    const mode = `batch fallback (${message})`;
    if (args.format === 'json') environment.stderr(`Mode: ${mode}\n`);
    return batch(mode);
  }
  if (args.batch) return batch('batch');
  const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') {
    if (connected.reason.kind === 'failure' && connected.attempts > 0) return fallback(disconnectFailure(connected.reason).message);
    throw disconnectFailure(connected.reason);
  }
  if (connected.status === 'stopped') throw new CliFailure('stopped', 'Daemon stopped explicitly', connected.record);
  if (connected.status === 'not-running') throw new CliFailure('unavailable', 'No daemon running', connected);
  const connection = connected.connection;
  let token: ContextToken | undefined, reopened = false, recovered = false;
  try {
    while (true) {
      try {
        const opened = await connection.openContext({ project: { cwd: environment.cwd,
          ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities } }, control);
        control.signal?.throwIfAborted();
        if (!opened.ok) throw serviceFailure(opened.error);
        if (opened.value.status === 'unresolved') return printReport(opened.value.report,
          `resident (daemon ${connection.daemon.instance.pid}; no context)`, args.format, environment);
        if (opened.value.status === 'unavailable') throw new CliFailure(
          opened.value.reason === 'disposed' ? 'unavailable' : opened.value.reason,
          opened.value.message, opened.value);
        token = opened.value.token;
        const response = await connection.check({ token, requestId: randomUUID(), freshness: { mode: 'synchronized', expect: [] } }, control);
        control.signal?.throwIfAborted();
        if (!response.ok) throw serviceFailure(response.error);
        const value = response.value;
        if (value.status === 'reported') {
          const revision = value.published ? `context ${token.context}; revision ${value.revision.sequence}`
            : `context ${token.context}; unpublished`;
          return printReport(value.report, `resident (daemon ${connection.daemon.instance.pid}; ${revision}; synchronized${value.freshness.reusedRevision ? '; revision reused' : ''})`, args.format, environment);
        }
        if (value.status === 'cancelled') throw new CliFailure('cancelled', 'Check was cancelled', value);
        if (value.status === 'unavailable' && ['expired-generation', 'unknown-context'].includes(value.reason) && !reopened) {
          reopened = true;
          await connection.closeContext({ token }); token = undefined;
          continue;
        }
        throw new CliFailure(value.status === 'unavailable' && value.reason === 'analysis-failed' ? 'analysis-failed'
          : value.status === 'unavailable' && value.reason === 'resource-unavailable' ? 'resource-unavailable' : 'unavailable',
        value.status === 'unavailable' ? value.message : `Check did not produce a report (${value.status})`, value);
      } catch (error) {
        control.signal?.throwIfAborted();
        if (error instanceof CliFailure && ['stopped', 'incompatible', 'resource-unavailable', 'invalid-request'].includes(error.code)) throw error;
        const reason = connection.reason;
        if (!recovered && reason && ['failure', 'slow-consumer'].includes(reason.kind)) {
          recovered = true;
          const outcome = await connection.recover('automatic');
          if (outcome.status === 'recovered') {
            environment.stderr(`Reconnected to daemon ${outcome.instance.pid} (restarted: ${outcome.restarted ? 'yes; generations changed' : 'no'})\n`);
            token = undefined;
            continue;
          }
          if (outcome.status === 'unavailable' && outcome.reason.kind === 'failure') {
            await connection.close();
            return fallback(disconnectFailure(outcome.reason).message);
          }
          if (outcome.status === 'stopped') throw new CliFailure('stopped', 'Daemon stopped explicitly', outcome.record);
          throw disconnectFailure(outcome.reason);
        }
        if (reason && reason.kind !== 'closed') throw disconnectFailure(reason);
        throw error;
      }
    }
  } finally {
    try { if (token && connection.state === 'connected') await connection.closeContext({ token }); }
    finally { await connection.close(); }
  }
}

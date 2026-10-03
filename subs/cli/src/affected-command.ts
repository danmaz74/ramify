import { randomUUID } from 'node:crypto';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { AffectedModule, AffectedSelection } from '../../analysis/src/interfaces/affected.js';
import type { ContextToken } from '../../daemon/src/context-types.js';
import type { AffectedOutcome } from '../../../src/interfaces/service.js';
import type { AffectedDocument, CliEnvironment, CliExitCode } from './interfaces/cli.js';
import { capabilities } from './command-support.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

interface AffectedArguments {
  readonly root?: string;
  readonly format: 'human' | 'json';
  readonly batch: boolean;
  readonly modules: readonly string[];
  readonly paths: readonly string[];
}

function moduleList(label: string, modules: readonly AffectedModule[]): string {
  return `${label} (${modules.length}):\n` + modules.map(module => `  ${module.id} (${module.directory})\n`).join('');
}

/** Root, mode, revision and selection, then one line per path seed and the three module lists. */
export function formatAffected(document: AffectedDocument): string {
  const { selection } = document;
  const sequence = document.revision.sequence === null ? 'fresh session' : `sequence ${document.revision.sequence}`;
  const notes = selection.coverage.notes.length;
  return `Root: ${document.root}\nMode: ${document.mode}\nRevision: ${sequence}, input ${document.revision.inputId}\n`
    + `Selection: ${selection.selection}${selection.widening.length ? ` (widened: ${selection.widening.join(', ')})` : ''}\n`
    + selection.paths.map(seed => `Path ${seed.path}: ${seed.module ?? 'no module'} (${seed.basis})\n`).join('')
    + moduleList('Changed modules', selection.changedModules)
    + moduleList('Affected modules', selection.affectedModules)
    + moduleList('Test modules', selection.testModules)
    + `Coverage: ${selection.coverage.status}, ${notes} ${notes === 1 ? 'note' : 'notes'}\n`
    + `Analysis check: ${selection.analysisCheck}\n`;
}

function print(environment: CliEnvironment, format: 'human' | 'json', mode: 'resident' | 'batch', sequence: number | null,
  selection: AffectedSelection): CliExitCode {
  const document: AffectedDocument = { schemaVersion: 'ramify.affected-cli/2', root: selection.scope.root, mode,
    revision: { sequence, inputId: selection.inputId }, ramifyVersion: environment.version, selection };
  environment.stdout(format === 'json' ? JSON.stringify(document) + '\n' : formatAffected(document));
  // An all-modules answer is complete and conservative; consumers read `selection` and `widening`.
  return 0;
}

function failure(root: string, format: 'human' | 'json', reason: string, message: string, exitCode: 1 | 2): string {
  if (format === 'json') return JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable',
    diagnostics: [{ category: 'execution', code: reason, message }], exitCode }) + '\n';
  return `Root: ${root}\nNot selected (${reason}): ${message}\nNo affected-module selection was claimed.\n`;
}

function interrupted(environment: CliEnvironment): CliExitCode {
  environment.stderr('Interrupted; no result claimed.\n');
  return 130;
}

function outcomeReason(value: Exclude<AffectedOutcome, { status: 'answered' | 'cancelled' }>): { reason: string; message: string; exitCode: 1 | 2 } {
  if (value.status === 'unavailable') {
    // As in the batch form, a refusal at a revision whose analysis found the project invalid is an invalid project.
    if ((value.reason === 'invalid-current' || value.reason === 'missing-facts') && value.revision?.outcome.execution === 'invalid') {
      return { reason: 'invalid-project', message: `${value.message} (revision ${value.revision.sequence} is invalid)`, exitCode: 1 };
    }
    const known = value.reason === 'unknown-module' || value.reason === 'invalid-query';
    const message = value.unknownModules.length && !value.unknownModules.every(id => value.message.includes(id))
      ? `${value.message} (unknown module IDs: ${value.unknownModules.join(', ')})` : value.message;
    return { reason: value.reason, message, exitCode: known ? 1 : 2 };
  }
  if (value.status === 'deadline-exceeded') return { reason: 'deadline-exceeded', message: `No revision was ready within the deadline (${value.elapsedMs} ms elapsed)`, exitCode: 2 };
  if (value.status === 'superseded') return { reason: 'superseded', message: 'A newer revision replaced this request before it completed', exitCode: 2 };
  if (value.status === 'pending') return { reason: 'pending', message: 'The context could not answer a synchronized request from an active capture', exitCode: 2 };
  return { reason: 'cold', message: 'No revision has ever been published for this context', exitCode: 2 };
}

async function batchAffected(args: AffectedArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  const operation = environment.affectedBatch;
  if (!operation) throw new CliFailure('unavailable', 'This client has no affected batch operation', null);
  const result = await operation({ cwd: environment.cwd, ...(args.root === undefined ? {} : { root: args.root }),
    modules: args.modules, paths: args.paths }, control);
  if (control.signal?.aborted) throw new Error('Interrupted');
  if (result.status === 'cancelled') return interrupted(environment);
  if (result.status === 'answered') return print(environment, args.format, 'batch', null, result.result);
  const message = result.unknownModules.length && !result.unknownModules.every(id => result.message.includes(id))
    ? `${result.message} (unknown module IDs: ${result.unknownModules.join(', ')})` : result.message;
  environment.stdout(failure(args.root ?? `(discovered from ${environment.cwd})`, args.format, result.reason, message, result.exitCode));
  return result.exitCode;
}

export async function affectedCommand(args: AffectedArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  control.signal?.throwIfAborted();
  if (args.batch) return batchAffected(args, environment, control);
  const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
  if (connected.status === 'stopped') throw new CliFailure('stopped', 'Daemon stopped explicitly', connected.record);
  if (connected.status === 'not-running') throw new CliFailure('unavailable', 'No daemon running', connected);
  const connection = connected.connection;
  let token: ContextToken | undefined, reopened = false, recovered = false;
  try {
    if (!connection.daemon.capabilities.includes('affected')) {
      throw new CliFailure('incompatible-service', 'The daemon does not offer affected', connection.daemon);
    }
    while (true) {
      try {
        const opened = await connection.openContext({ project: { cwd: environment.cwd,
          ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities } }, control);
        control.signal?.throwIfAborted();
        if (!opened.ok) throw serviceFailure(opened.error);
        if (opened.value.status === 'unresolved') {
          // The batch form's codes: an invalid project exits 1, one that cannot be found or read exits 2.
          const label = opened.value.resolution.status;
          const message = opened.value.resolution.issues[0]?.message ?? `project ${label}`;
          const [code, exitCode] = label === 'invalid' ? ['invalid-project', 1 as const] : ['project-unavailable', 2 as const];
          environment.stdout(failure(args.root ?? `(discovered from ${environment.cwd})`, args.format, code, message, exitCode));
          return exitCode;
        }
        if (opened.value.status === 'unavailable') throw new CliFailure(
          opened.value.reason === 'disposed' || opened.value.reason === 'configuration-changed' ? 'unavailable' : opened.value.reason,
          opened.value.message, opened.value);
        token = opened.value.token;
        const root = opened.value.current.selection.root;
        const response = await connection.affected({ token, requestId: randomUUID(),
          freshness: { mode: 'synchronized', expect: [] }, modules: args.modules, paths: args.paths }, control);
        control.signal?.throwIfAborted();
        if (!response.ok) throw serviceFailure(response.error);
        const value = response.value;
        if (value.status === 'answered') return print(environment, args.format, 'resident', value.revision.sequence, value.result);
        if (value.status === 'cancelled') return interrupted(environment);
        if (value.status === 'unavailable' && ['expired-generation', 'unknown-context'].includes(value.reason) && !reopened) {
          reopened = true;
          await connection.closeContext({ token }); token = undefined;
          continue;
        }
        const mapped = outcomeReason(value);
        environment.stdout(failure(root, args.format, mapped.reason, mapped.message, mapped.exitCode));
        return mapped.exitCode;
      } catch (error) {
        control.signal?.throwIfAborted();
        if (error instanceof CliFailure && ['stopped', 'incompatible', 'resource-unavailable', 'invalid-request', 'incompatible-service'].includes(error.code)) throw error;
        const reason = connection.reason;
        if (!recovered && reason && ['failure', 'slow-consumer'].includes(reason.kind)) {
          recovered = true;
          const outcome = await connection.recover('automatic');
          if (outcome.status === 'recovered') {
            environment.stderr(`Reconnected to daemon ${outcome.instance.pid} (restarted: ${outcome.restarted ? 'yes; generations changed' : 'no'})\n`);
            token = undefined;
            continue;
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

import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ApiViewSelection } from '../../analysis/src/interfaces/session.js';
import type { ContextToken } from '../../daemon/src/context-types.js';
import type { MaterializeOutcome, MaterializeViewId } from '../../../src/interfaces/service.js';
import type { CliEnvironment, CliExitCode } from './interfaces/cli.js';
import { capabilities } from './command-support.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

interface MaterializeArguments { readonly root?: string; readonly from?: string; readonly all: boolean;
  readonly views?: readonly MaterializeViewId[] }

const missing = (error: unknown): boolean => error instanceof Error && 'code' in error
  && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/** Every requested target's entry count, folded into one compact total. */
function entryCount(outcome: Extract<MaterializeOutcome, { status: 'materialized' }>): number {
  return outcome.targets.reduce((sum, target) => sum + target.entries, 0);
}

/** Compact success line per contracts.md's "CLI grammar and exits": names the
 * revision, target count, entry count, bytes written and unchanged-target count. */
function success(root: string, outcome: Extract<MaterializeOutcome, { status: 'materialized' }>): string {
  const unchanged = outcome.targets.filter(target => !target.changed).length;
  const architect = outcome.architect;
  return `Root: ${root}\n`
    + `Materialized: revision ${outcome.revision.sequence}; ${outcome.targets.length} target(s), ${entryCount(outcome)} entries, `
    + `${outcome.bytesWritten} bytes written, ${unchanged} unchanged\n`
    + (architect ? `Architect view: .ramify-architect, ${architect.modules} modules, ${architect.records} records, dependencies `
      + `${architect.dependencies === 'measured' ? 'measured' : `unavailable (${architect.dependencies.unavailable})`}\n` : '');
}

/** Compact failure line: names the stable reason and states that no complete
 * refresh was claimed, per the same contract section. */
function failureText(root: string, reason: string, message: string): string {
  return `Root: ${root}\n` + `Not materialized (${reason}): ${message}\n` + 'No complete refresh was claimed.\n';
}

function outcomeReason(value: Exclude<MaterializeOutcome, { status: 'materialized' }>): { reason: string; message: string } {
  if (value.status === 'unavailable') return { reason: value.reason, message: value.message };
  if (value.status === 'deadline-exceeded') return { reason: 'deadline-exceeded', message: `No revision was ready within the deadline (${value.elapsedMs} ms elapsed)` };
  if (value.status === 'superseded') return { reason: 'superseded', message: 'A newer revision replaced this request before it completed' };
  if (value.status === 'pending') return { reason: 'pending', message: 'The context could not answer a synchronized request from an active capture' };
  return { reason: 'cold', message: 'No revision has ever been published for this context' };
}

export async function materializeCommand(args: MaterializeArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  // The API view's module selection; without it any selection is sent and ignored.
  const api = !args.views || args.views.includes('api');
  // Resolved and validated to exist before connecting; `--all` never resolves a path.
  let absoluteFrom: string | undefined;
  if (api && !args.all) {
    const requested = resolve(environment.cwd, args.from ?? '.');
    try { absoluteFrom = await realpath(requested); }
    catch (error) {
      if (!missing(error)) throw error;
      environment.stdout(failureText(args.root ?? environment.cwd, 'invalid-location', `Path does not exist: ${requested}`));
      return 2;
    }
  }
  control.signal?.throwIfAborted();
  const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
  if (connected.status === 'stopped') throw new CliFailure('stopped', 'Daemon stopped explicitly', connected.record);
  if (connected.status === 'not-running') throw new CliFailure('unavailable', 'No daemon running', connected);
  const connection = connected.connection;
  let token: ContextToken | undefined, reopened = false, recovered = false;
  try {
    if (args.views && !connection.daemon.capabilities.includes('materialize-views')) {
      throw new CliFailure('incompatible-service', 'The daemon does not offer materialize-views, which --view needs', connection.daemon);
    }
    while (true) {
      try {
        const opened = await connection.openContext({ project: { cwd: environment.cwd,
          ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities } }, control);
        control.signal?.throwIfAborted();
        if (!opened.ok) throw serviceFailure(opened.error);
        if (opened.value.status === 'unresolved') {
          // Exit 1 is reserved for an invalid project; an unavailable resolution
          // (no configuration found, an acquisition failure) is exit 2 like any
          // other unavailable outcome, never a claimed "invalid project".
          const label = opened.value.resolution.status;
          const detail = opened.value.resolution.issues[0]?.message ?? `project ${label}`;
          environment.stdout(failureText(args.root ?? `(discovered from ${environment.cwd})`, `project-${label}`, detail));
          return label === 'invalid' ? 1 : 2;
        }
        if (opened.value.status === 'unavailable') throw new CliFailure(
          opened.value.reason === 'disposed' || opened.value.reason === 'configuration-changed' ? 'unavailable' : opened.value.reason,
          opened.value.message, opened.value);
        token = opened.value.token;
        const root = opened.value.current.selection.root;
        let selection: ApiViewSelection;
        if (args.all || !api) selection = { scope: 'all' };
        else {
          const relativePath = relative(root, absoluteFrom!);
          if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
            environment.stdout(failureText(root, 'invalid-location', `"${args.from ?? '.'}" lies outside the project root`));
            return 2;
          }
          const canonical = relativePath.split(sep).join('/');
          selection = { scope: 'module', from: canonical === '' ? '.' : canonical };
        }
        // Without --view the request carries no `views` field: Plan 2A's request exactly.
        const response = await connection.materialize({ token, requestId: randomUUID(),
          freshness: { mode: 'synchronized', expect: [] }, selection, ...(args.views ? { views: args.views } : {}) }, control);
        control.signal?.throwIfAborted();
        if (!response.ok) throw serviceFailure(response.error);
        const value = response.value;
        if (value.status === 'materialized') { environment.stdout(success(root, value)); return 0; }
        if (value.status === 'cancelled') throw new CliFailure('cancelled', 'Materialize was cancelled', value);
        if (value.status === 'unavailable' && ['expired-generation', 'unknown-context'].includes(value.reason) && !reopened) {
          reopened = true;
          await connection.closeContext({ token }); token = undefined;
          continue;
        }
        const { reason, message } = outcomeReason(value);
        environment.stdout(failureText(root, reason, message));
        return 2;
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

import { randomUUID } from 'node:crypto';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { MeasurementBuckets, MeasurementViews } from '../../analysis/src/interfaces/measurements.js';
import type { ContextToken } from '../../daemon/src/context-types.js';
import type { MeasureDocument, MeasureOutcome } from '../../../src/interfaces/service.js';
import type { CliEnvironment, CliExitCode } from './interfaces/cli.js';
import { capabilities } from './command-support.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

interface MeasureArguments { readonly root?: string; readonly format: 'human' | 'json' }

function viewsText(views: MeasurementViews): string {
  return views === 'measured' ? 'measured' : `unavailable (${views.reason})`;
}

function cells(bucket: MeasurementBuckets): readonly string[] {
  return [
    `${bucket.production.sourceFiles}/${bucket.production.sourceBytes}`,
    `${bucket.production.resourceFiles}/${bucket.production.resourceBytes}`,
    `${bucket.tests.sourceFiles}/${bucket.tests.sourceBytes}`,
    `${bucket.tests.resourceFiles}/${bucket.tests.resourceBytes}`,
    `${bucket.documentation.files}/${bucket.documentation.bytes}`,
    bucket.views ? `${bucket.views.ordinaryBytes}/${bucket.views.testsBytes}` : '-',
  ];
}

/** A compact deterministic table: file/byte pairs keep all buckets visible
 * without turning the human form into a second machine schema. */
export function formatMeasurements(document: MeasureDocument): string {
  const rows: string[][] = [['Module', 'Scope', 'Prod src', 'Prod res', 'Test src', 'Test res', 'Docs', 'Views o/t']];
  for (const module of document.modules) {
    rows.push([module.id, 'exact', ...cells(module.exact)]);
    rows.push([module.id, 'subtree', ...cells(module.subtree)]);
  }
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map(row => row[column]!.length)));
  const render = (row: readonly string[]): string => row.map((value, column) => value.padEnd(widths[column]!)).join('  ').trimEnd();
  return `Root: ${document.root}\nRevision: ${document.revision}\nViews: ${viewsText(document.views)}\n`
    + `${render(rows[0]!)}\n${widths.map(width => '-'.repeat(width)).join('  ')}\n`
    + rows.slice(1).map(render).join('\n') + '\n';
}

function outcomeReason(value: Exclude<MeasureOutcome, { status: 'measured' }>): { reason: string; message: string } {
  if (value.status === 'unavailable') return { reason: value.reason, message: value.message };
  if (value.status === 'deadline-exceeded') return { reason: 'deadline-exceeded', message: `No revision was ready within the deadline (${value.elapsedMs} ms elapsed)` };
  if (value.status === 'superseded') return { reason: 'superseded', message: 'A newer revision replaced this request before it completed' };
  if (value.status === 'pending') return { reason: 'pending', message: 'The context could not answer a synchronized request from an active capture' };
  if (value.status === 'cold') return { reason: 'cold', message: 'No revision has ever been published for this context' };
  return { reason: 'cancelled', message: 'Measure was cancelled' };
}

function failure(root: string, format: 'human' | 'json', reason: string, message: string, exitCode: 1 | 2): string {
  if (format === 'json') return JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable',
    diagnostics: [{ category: 'execution', code: reason, message }], exitCode }) + '\n';
  return `Root: ${root}\nNot measured (${reason}): ${message}\nNo complete measurement was claimed.\n`;
}

export async function measureCommand(args: MeasureArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  control.signal?.throwIfAborted();
  const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
  if (connected.status === 'stopped') throw new CliFailure('stopped', 'Daemon stopped explicitly', connected.record);
  if (connected.status === 'not-running') throw new CliFailure('unavailable', 'No daemon running', connected);
  const connection = connected.connection;
  let token: ContextToken | undefined, reopened = false, recovered = false;
  try {
    if (!connection.daemon.capabilities.includes('measure')) {
      throw new CliFailure('incompatible-service', 'The daemon does not offer measure', connection.daemon);
    }
    while (true) {
      try {
        const opened = await connection.openContext({ project: { cwd: environment.cwd,
          ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities } }, control);
        control.signal?.throwIfAborted();
        if (!opened.ok) throw serviceFailure(opened.error);
        if (opened.value.status === 'unresolved') {
          const label = opened.value.resolution.status;
          const message = opened.value.resolution.issues[0]?.message ?? `project ${label}`;
          const exitCode = label === 'invalid' ? 1 : 2;
          environment.stdout(failure(args.root ?? `(discovered from ${environment.cwd})`, args.format, `project-${label}`, message, exitCode));
          return exitCode;
        }
        if (opened.value.status === 'unavailable') throw new CliFailure(
          opened.value.reason === 'disposed' || opened.value.reason === 'configuration-changed' ? 'unavailable' : opened.value.reason,
          opened.value.message, opened.value);
        token = opened.value.token;
        const root = opened.value.current.selection.root;
        const response = await connection.measure({ token, requestId: randomUUID(),
          freshness: { mode: 'synchronized', expect: [] } }, control);
        control.signal?.throwIfAborted();
        if (!response.ok) throw serviceFailure(response.error);
        const value = response.value;
        if (value.status === 'measured') {
          environment.stdout(args.format === 'json' ? JSON.stringify(value.document) + '\n' : formatMeasurements(value.document));
          return 0;
        }
        if (value.status === 'cancelled') throw new CliFailure('cancelled', 'Measure was cancelled', value);
        if (value.status === 'unavailable' && ['expired-generation', 'unknown-context'].includes(value.reason) && !reopened) {
          reopened = true;
          await connection.closeContext({ token }); token = undefined;
          continue;
        }
        const mapped = outcomeReason(value);
        environment.stdout(failure(root, args.format, mapped.reason, mapped.message, 2));
        return 2;
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

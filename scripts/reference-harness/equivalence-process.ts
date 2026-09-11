import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './processes.js';
import type { CommandResult } from './processes.js';
import { repositoryRoot } from './plan.js';
import { archiveObservation, recordObservation, traceEvidence } from './observations.js';
import { parseAnalysisDocument } from './equivalence-comparison.js';
import type { TraceEvent } from '../../src/tests/process.js';

export function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected JSON object');
  return value as Record<string, unknown>;
}
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
};
export async function readTrace(path: string): Promise<TraceEvent[]> {
  let content: string;
  try { content = await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line) as TraceEvent);
}
export interface SequenceProcess {
  readonly executable: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly traceFile: string;
  readonly endpoint: string;
  run(root: string, args: readonly string[]): Promise<CommandResult>;
  status(): Promise<Record<string, unknown>>;
  check(root: string, batch: boolean): Promise<ReturnType<typeof parseAnalysisDocument>>;
}

/** A true resident witness, independent of report equality. A daemon-shaped
 * document cannot hide a check that loaded the batch engine in the CLI. */
export function assertResidentTrace(events: readonly TraceEvent[], cliPid: number, endpoint: string): void {
  const own = events.filter(e => e.pid === cliPid);
  assert.ok(own.some(e => e.event === 'connect' && e.path?.startsWith(endpoint + '/')), 'Resident check must connect to its owned endpoint');
  assert.ok(!own.some(e => e.event === 'load' && /\/(?:src\/batch|subs\/analysis\/src\/[^/]+)\.js$/.test(e.url ?? '')),
    'Resident check loaded the batch/analysis engine in its CLI process');
  assert.ok(!own.some(e => e.event === 'spawn' && e.args?.some(arg => /(?:compiler|configuration)-helper\./.test(arg))),
    'Resident check spawned compiler helpers in its CLI process');
}

/** Installs the real local package into a private npm prefix, then invokes its
 * bin link. Every command and spawned daemon inherits the tracing preload. */
export async function withSequenceProcess<T>(operation: (processes: SequenceProcess) => Promise<T>, installation?: {
  readonly executable: string;
  readonly cwd: string;
  readonly preload: string;
  readonly environment: NodeJS.ProcessEnv;
}): Promise<T> {
  const owned = await realpath(await mkdtemp(join(tmpdir(), 'ri11-')));
  const endpoint = join(owned, 'endpoint'), traceFile = join(owned, 'trace.jsonl');
  const prefix = join(owned, 'install'), executable = installation?.executable ?? join(prefix, 'node_modules/.bin/ramify');
  const cwd = installation?.cwd ?? repositoryRoot;
  const environment: NodeJS.ProcessEnv = { ...(installation?.environment ?? process.env), RAMIFY_ENDPOINT_DIR: endpoint,
    RAMIFY_CLI_TRACE: traceFile, RAMIFY_PROCESS_SOCKETS: 'allow', RAMIFY_CLI_PROBE: '',
    NODE_OPTIONS: `--import=${installation?.preload ?? join(repositoryRoot, 'src/tests/process-probe.mjs')}` };
  let installed = false, failure: unknown, result: T | undefined;
  const run = (root: string, args: readonly string[]) => command(root, executable, args, 60_000, environment);
  try {
    await mkdir(endpoint, { mode: 0o700 });
    if (!installation) {
      const install = await command(repositoryRoot, 'npm', ['install', '--prefix', prefix, '--offline', '--ignore-scripts',
        '--no-audit', '--no-fund', repositoryRoot], 30_000, { ...process.env, NODE_OPTIONS: '' });
      assert.equal(install.error, null, install.stderr);
      assert.equal(install.code, 0, install.stderr);
      assert.equal(await realpath(executable), join(repositoryRoot, 'dist/src/cli-entry.js'));
    }
    installed = true;
    const processes: SequenceProcess = {
      executable, environment, traceFile, endpoint, run,
      status: async () => {
        const outcome = await run(cwd, ['daemon', 'status', '--format', 'json']);
        assert.equal(outcome.error, null);
        assert.equal(outcome.stderr, '');
        assert.equal(outcome.code, 0, `Resident prerequisite unavailable: daemon status exited ${outcome.code}: ${outcome.stdout}`);
        const status = object(JSON.parse(outcome.stdout));
        assert.equal(status.schemaVersion, 'ramify.daemon-status/1');
        return status;
      },
      check: async (root, batch) => {
        const before = (await readTrace(traceFile)).length;
        const outcome = await run(root, ['check', ...(batch ? ['--batch'] : []), '--format', 'json']);
        assert.equal(outcome.error, null);
        assert.equal(outcome.signal, null);
        assert.equal(outcome.stderr, '', 'Normal check must not recover or fall back');
        const report = parseAnalysisDocument(outcome.stdout);
        assert.equal(outcome.code, ['incomplete', 'unavailable'].includes(report.outcome.execution) ? 2
          : report.outcome.execution === 'invalid' || report.outcome.check === 'failed' || report.summary.denied || report.diagnostics.length ? 1 : 0);
        const events = (await readTrace(traceFile)).slice(before);
        const start = events.find(e => e.event === 'start' && e.argv?.[1] === executable);
        assert.ok(start, 'Installed executable must be traced');
        if (batch) assert.ok(!events.some(e => e.pid === start.pid && ['connect', 'listen', 'bind'].includes(e.event)),
          'Batch check must not contact a daemon');
        else assertResidentTrace(events, start.pid, endpoint);
        recordObservation('equivalence-command', { command: outcome.command, code: outcome.code, durationMs: outcome.durationMs,
          pid: start.pid, mode: batch ? 'batch' : 'resident', inputId: report.inputId, runId: report.runId });
        return report;
      },
    };
    result = await operation(processes);
  } catch (error) { failure = error; }
  const cleanupErrors: unknown[] = [];
  try {
    if (installed) {
      const stop = await command(cwd, executable, ['daemon', 'stop', '--format', 'json'], 7000, environment);
      recordObservation('equivalence-stop', { code: stop.code, signal: stop.signal, error: stop.error,
        stdoutBytes: Buffer.byteLength(stop.stdout), stderr: stop.stderr, raw: await archiveObservation('equivalence-stop', stop) });
      // If the provider was absent, retain that original failure. Once the
      // operation succeeds, graceful daemon stop is part of its exit criteria.
      if (!failure) assert.equal(stop.code, 0, 'Owned daemon did not stop successfully');
    }
  } catch (error) { cleanupErrors.push(error); }
  try {
    const events = await readTrace(traceFile);
    const pids = [...new Set(events.flatMap(e => [e.pid, ...(e.event === 'spawn' && e.child ? [e.child] : [])]))];
    const deadline = performance.now() + 7000;
    while (pids.some(alive) && performance.now() < deadline) await new Promise(done => setTimeout(done, 20));
    const leaked = pids.filter(alive);
    for (const pid of leaked) {
      try { process.kill(pid, 'SIGKILL'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') cleanupErrors.push(error); }
    }
    const killedDeadline = performance.now() + 2000;
    while (leaked.some(alive) && performance.now() < killedDeadline) await new Promise(done => setTimeout(done, 20));
    const survivingAfterKill = leaked.filter(alive);
    recordObservation('equivalence-process-cleanup', { pids, leaked, survivingAfterKill, trace: traceEvidence(events),
      raw: await archiveObservation('equivalence-process-cleanup', { pids, leaked, survivingAfterKill, events }) });
    if (leaked.length) cleanupErrors.push(new Error(`Processes survived daemon stop: ${leaked.join(', ')}`));
  } catch (error) { cleanupErrors.push(error); }
  try { await rm(owned, { recursive: true, force: true }); }
  catch (error) { cleanupErrors.push(error); }
  if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors],
    [...(failure ? [String(failure)] : []), ...cleanupErrors.map(String)].join('\n'));
  return result as T;
}

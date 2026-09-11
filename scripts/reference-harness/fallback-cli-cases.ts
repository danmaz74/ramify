import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { cliProcess, repositoryRoot } from '../../src/tests/process.js';
import { waitForProcessCondition } from '../../src/tests/lifecycle-process.js';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { withResident, reference } from './process-cases.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { archiveObservation, recordObservation, traceEvidence } from './observations.js';
import type { Assertions, InstanceHandler } from './runner.js';

const forbidden = /\/dist\/(?:src\/batch\.js|subs\/analysis\/|subs\/daemon\/subs\/contexts\/)|\/(?:typescript|@typescript)\//;
const withoutRun = (report: Record<string, unknown>) => { const { runId: _runId, ...rest } = report; return rest; };
async function fault<T>(run: (directory: string, project: string, entry: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'rf-'));
  try {
    const project = await reference(directory), entry = join(directory, 'exit-entry.mjs');
    await writeFile(entry, 'process.exit(1);\n');
    return await run(directory, project, entry);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
function parentLoads(result: Awaited<ReturnType<typeof cliProcess>>): string[] {
  return result.events.filter(event => event.pid === result.pid).flatMap(event => [event.url ?? '', ...event.commonjs ?? []]);
}
const handlers: [string, InstanceHandler][] = [];
function add(id: string, run: (assertions: Assertions) => Promise<void>): void {
  handlers.push([id, { kind: 'memory', run: ({ assertions }) => run(assertions) }]);
}

add('I2-23:check-fallback-visible', assertions => fault(async (directory, project, entry) => {
  const env = { RAMIFY_ENDPOINT_DIR: directory, RAMIFY_DAEMON_ENTRY: entry };
  const expected = await cliProcess(project, ['check', '--batch', '--format', 'json'], { env, allowSockets: true, timeoutMs: 60_000 });
  assertions.equal('independent batch reference is clean', [expected.code, expected.stderr], [0, '']);
  const json = await cliProcess(project, ['check', '--format', 'json'], { env, allowSockets: true, timeoutMs: 60_000 });
  assertions.equal('terminating fallback preserves the batch exit', json.code, expected.code);
  assertions.equal('fallback JSON is exactly the bare batch report except runId', withoutRun(JSON.parse(json.stdout)), withoutRun(JSON.parse(expected.stdout)));
  assertions.ok('JSON stderr explicitly announces exhausted-daemon fallback', /^Mode: batch fallback \(daemon unavailable: .+\)\n$/.test(json.stderr));
  const human = await cliProcess(project, ['check'], { env, allowSockets: true, timeoutMs: 60_000 });
  assertions.equal('human fallback check remains clean', [human.code, human.stderr], [0, '']);
  assertions.ok('human stdout announces batch fallback', human.stdout.includes('Mode: batch fallback (daemon unavailable:'));
  const starts = json.events.filter(event => event.event === 'spawn' && event.args?.[0] === entry);
  assertions.equal('fallback starts only after two real entry failures', starts.length, 2);
  recordObservation('check-fallback', { human: { code: human.code, stdoutBytes: Buffer.byteLength(human.stdout) },
    json: { code: json.code, stderr: json.stderr }, starts, trace: traceEvidence(json.events),
    raw: await archiveObservation('check-fallback', { human, json, expected }) });
}));

add('I2-23:watch-no-fallback', assertions => fault(async (directory, project, entry) => {
  const result = await cliProcess(project, ['watch', '--format', 'json'], {
    env: { RAMIFY_ENDPOINT_DIR: directory, RAMIFY_DAEMON_ENTRY: entry }, allowSockets: true, timeoutMs: 30_000 });
  assertions.equal('watch fails after unavailable daemon startup', result.code, 2);
  assertions.ok('watch reports unavailable execution', result.stdout.includes('unavailable'));
  assertions.equal('watch never imports a fallback engine', parentLoads(result).filter(value => forbidden.test(value)), []);
  assertions.equal('failed watch starts exactly two finite entries', result.events.filter(event => event.event === 'spawn' && event.args?.[0] === entry).length, 2);
  assertions.equal('failed startup children are reaped', result.survivingChildren, []);
}));

add('I2-23:client-no-fallback', assertions => fault(async (directory, _project, entry) => {
  const script = join(directory, 'client.mjs');
  await writeFile(script, `import {connectDaemon} from ${JSON.stringify(pathToFileURL(join(repositoryRoot, 'dist/subs/daemon/src/client-entry.js')).href)};\n`
    + `console.log(JSON.stringify(await connectDaemon(${JSON.stringify({ client: { name: 'fallback-reference', version: '0.0.0' },
      engine: 'ramify.ts@0.0.0+typescript@7.0.2', start: 'if-needed', daemonEntry: entry, endpointDirectory: directory })})));\n`);
  const result = await cliProcess(repositoryRoot, [], { entry: script, env: { RAMIFY_ENDPOINT_DIR: directory }, allowSockets: true, timeoutMs: 30_000 });
  assertions.equal('external client process exits normally with an unavailable result', [result.code, JSON.parse(result.stdout).status], [0, 'unavailable']);
  assertions.equal('external client never imports an engine or contexts', parentLoads(result).filter(value => forbidden.test(value)), []);
  assertions.ok('every spawned child is the requested finite failing entry', result.events.filter(event => event.event === 'spawn').every(event => event.args?.[0] === entry));
  assertions.equal('all attempted starts are reaped', result.survivingChildren, []);
}));

add('I2-23:fallback-disposes', assertions => fault(async (directory, project, entry) => {
  const result = await cliProcess(project, ['check', '--format', 'json'], {
    env: { RAMIFY_ENDPOINT_DIR: directory, RAMIFY_DAEMON_ENTRY: entry }, allowSockets: true, timeoutMs: 60_000 });
  assertions.equal('fallback completed successfully', result.code, 0);
  const exit = result.events.find(event => event.pid === result.pid && event.event === 'exit');
  assertions.ok('real fallback process exit observed', exit);
  assertions.equal('fallback released handles and signal listeners', [exit?.handles, exit?.opened, exit?.signalListeners], [0, exit?.closed, 0]);
  assertions.equal('fallback left no helper or failed-entry process', result.survivingChildren, []);
  assertions.equal('fallback opened no listener', result.events.filter(event => ['listen', 'bind'].includes(event.event)), []);
  recordObservation('fallback-cleanup', { pid: result.pid, exit, survivingChildren: result.survivingChildren,
    trace: traceEvidence(result.events), raw: await archiveObservation('fallback-cleanup', result) });
}));

add('I2-23:stop-no-fallback', async assertions => {
  for (const format of ['human', 'json']) await withResident(async (scope, endpoint, start) => {
    const project = join(endpoint.directory, 'S1000'); await materializeSynthetic(project, 'S1000');
    const daemon = await start();
    const check = scope.start({ cwd: project, args: [join(repositoryRoot, 'dist/src/cli-entry.js'), 'check', ...(format === 'json' ? ['--format', 'json'] : [])], timeoutMs: 60_000 });
    await waitForProcessCondition('Cold S1000 check has entered a daemon compiler helper', 15_000, async () =>
      (await scope.events()).some(event => event.pid === daemon.pid && event.event === 'spawn' && event.args?.some(value => /(?:configuration|compiler)-helper\.js$/.test(value))));
    const stop = scope.start({ cwd: project, args: [join(repositoryRoot, 'dist/src/cli-entry.js'), 'daemon', 'stop'], timeoutMs: 10_000 });
    assertions.equal(`${format}: explicit stop succeeds`, (await stop.waitForExit(10_000)).code, 0);
    assertions.equal(`${format}: interrupted cold check exits unavailable`, (await check.waitForExit(10_000)).code, 2);
    if (format === 'human') assertions.ok('human stop error names the explicit stop', check.stderr.includes('Error [stopped]:') && check.stderr.includes('stopped explicitly'));
    else {
      const document = JSON.parse(check.stdout) as { schemaVersion: string; diagnostics: { code: string }[] };
      assertions.equal('JSON stop response is a CLI error envelope', [document.schemaVersion, document.diagnostics[0]?.code], ['ramify.cli/1', 'stopped']);
    }
    const events = await scope.events();
    const loads = events.filter(event => event.pid === check.pid).flatMap(event => [event.url ?? '', ...event.commonjs ?? []]);
    assertions.equal(`${format}: stopped check never imports fallback engine`, loads.filter(value => forbidden.test(value)), []);
    const record = JSON.parse(await readFile(endpoint.record, 'utf8')) as { stopped: { reason: string; requestId: string | null } };
    assertions.ok(`${format}: explicit stop preserves its wire request id`, record.stopped.reason === 'explicit' && typeof record.stopped.requestId === 'string');
    const evidence = { format, pid: check.pid, daemon: daemon.pid, code: check.exit?.code,
      stdout: check.stdout, stderr: check.stderr, record, events };
    recordObservation('stopped-cold-check', { format, pid: check.pid, daemon: daemon.pid, code: check.exit?.code,
      stdout: check.stdout, stderr: check.stderr, record, trace: traceEvidence(events),
      raw: await archiveObservation('stopped-cold-check', evidence) });
  });
});

export const fallbackCliHandlers: ReadonlyMap<string, InstanceHandler> = new Map(handlers);

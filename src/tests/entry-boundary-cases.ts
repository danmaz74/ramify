import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBatch } from '../batch.js';
import { cliProcess, repositoryRoot } from './process.js';
import type { TraceEvent } from './process.js';

/** Shared only by root tests and the independent reference harness. */
interface BoundaryAssertions {
  equal(name: string, actual: unknown, expected: unknown): void;
  ok(name: string, actual: unknown): void;
}
type ProcessResult = Awaited<ReturnType<typeof cliProcess>>;
const loads = (events: readonly TraceEvent[]) => events.flatMap(event => [event.url ?? '', ...event.commonjs ?? []]).filter(Boolean);
const engine = /\/dist\/(?:subs\/analysis\/|src\/batch\.js)|\/(?:typescript|@typescript)\//;
const serversAndUI = /\/dist\/subs\/(?:presentation|mcp|web)\/|\/(?:react|react-dom|d3-[^/]+|@modelcontextprotocol|@trpc|express)\//;
const daemonHost = /\/dist\/(?:src\/(?:daemon-entry|resident-assembly)\.js|subs\/daemon\/(?:subs\/contexts\/|src\/(?:service|host|start-daemon|filesystem-watcher|system-clock)\.js))/;

/**
 * A complete CLI check inside a Git repository also runs the advisory Git command once, in the
 * selected root (project-boundary contracts, "Git advisory warning"); outside one it starts no
 * Git process. The expected count follows from the root's location, a `.git` entry (directory or
 * worktree link file) at or above it, so a boundary holds wherever the project copy lives.
 */
export async function expectedGitAdviceLaunches(root: string): Promise<0 | 1> {
  for (let directory = root; ; directory = dirname(directory)) {
    try { await lstat(join(directory, '.git')); return 1; }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return 0; }
    if (dirname(directory) === directory) return 0;
  }
}

/** A launch of exactly the advisory Git command by the CLI process itself. */
export function isGitAdviceLaunch(event: TraceEvent, cliPid: number | undefined): boolean {
  return event.event === 'spawn' && event.pid === cliPid && event.command === 'git'
    && (event.args ?? []).join(' ') === 'ls-files --others --ignored --exclude-standard --directory -z';
}

function released(result: ProcessResult, a: BoundaryAssertions, label: string): void {
  a.equal(`${label}: successful exit and empty stderr`, [result.code, result.signal, result.stderr], [0, null, '']);
  const exit = result.events.find(event => event.pid === result.pid && event.event === 'exit');
  a.ok(`${label}: real CLI exit observed`, exit);
  a.equal(`${label}: handles and signal listeners released`, [exit?.handles, exit?.opened, exit?.signalListeners], [0, exit?.closed, 0]);
  a.equal(`${label}: every observed child exited`, result.survivingChildren, []);
}

export async function helpVersionBoundary(a: BoundaryAssertions): Promise<readonly ProcessResult[]> {
  const endpoint = await mkdtemp(join(tmpdir(), 'ramify-boundary-'));
  const results: ProcessResult[] = [];
  try {
    const version = (JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { version: string }).version;
    for (const option of ['--help', '--version']) {
      const result = await cliProcess(endpoint, [option], { env: { RAMIFY_ENDPOINT_DIR: endpoint } });
      results.push(result);
      released(result, a, option);
      a.ok(`${option}: Plan 1 output`, option === '--version' ? result.stdout === `${version}\n` : result.stdout.startsWith('Usage: ramify check'));
      const loaded = loads(result.events);
      a.ok(`${option}: actual CLI handler loaded`, loaded.some(path => path.endsWith('/dist/subs/cli/src/run-cli.js')));
      a.equal(`${option}: no engine, compiler, host or UI loaded`, loaded.filter(path => engine.test(path) || serversAndUI.test(path) || daemonHost.test(path)), []);
      a.equal(`${option}: no connection, launch or listener`, result.events.filter(event => ['connect', 'spawn', 'other-launch', 'listen', 'bind'].includes(event.event)), []);
    }
    a.equal('help/version: endpoint remains empty', await readdir(endpoint), []);
    return results;
  } finally { await rm(endpoint, { recursive: true, force: true }); }
}

export async function batchBoundary(root: string, a: BoundaryAssertions): Promise<readonly ProcessResult[]> {
  const endpoint = await mkdtemp(join(tmpdir(), 'ramify-boundary-'));
  const results: ProcessResult[] = [];
  try {
    const expected = await runBatch({ cwd: root, root, capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
      'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] });
    a.equal('batch: real API report available', expected.status, 'reported');
    if (expected.status !== 'reported') throw new Error('Batch API did not report');
    a.equal('batch: independently clean project', [expected.exitCode, expected.report.outcome.execution, expected.report.summary.errors,
      expected.report.summary.denied, expected.report.summary.coverageNotes], [0, 'completed', 0, 0, 0]);
    const gitAdvice = await expectedGitAdviceLaunches(root);
    for (const format of ['human', 'json']) {
      const result = await cliProcess(root, ['check', '--batch', '--root', root, ...(format === 'json' ? ['--format', 'json'] : [])],
        { env: { RAMIFY_ENDPOINT_DIR: endpoint } });
      results.push(result);
      released(result, a, format);
      const parentLoads = loads(result.events.filter(event => event.pid === result.pid));
      a.ok(`${format}: batch actually loaded in CLI`, parentLoads.some(path => path.endsWith('/dist/src/batch.js')));
      a.ok(`${format}: analysis actually loaded in CLI`, parentLoads.some(path => path.includes('/dist/subs/analysis/')));
      a.equal(`${format}: compiler package stays out of CLI`, parentLoads.filter(path => /\/node_modules\/(?:typescript|@typescript)\//.test(path)), []);
      a.equal(`${format}: no daemon host, contexts or UI module`, loads(result.events).filter(path => serversAndUI.test(path) || daemonHost.test(path)), []);
      a.equal(`${format}: no connection or listener`, result.events.filter(event => ['connect', 'listen', 'bind', 'other-launch'].includes(event.event)), []);
      // Re-reasoned in the project-boundary iteration 17 fix: the advisory Git command is a finite
      // child of the CLI, never a daemon or server, and is reaped like the helpers (released above).
      a.equal(`${format}: advisory Git command runs once exactly when a .git entry is at or above the root`,
        result.events.filter(event => isGitAdviceLaunch(event, result.pid)).length, gitAdvice);
      const children = result.events.filter(event => event.event === 'spawn' && !isGitAdviceLaunch(event, result.pid));
      a.ok(`${format}: finite compiler helpers observed`, children.length > 0);
      for (const [index, child] of children.entries()) a.ok(`${format}: child ${index + 1} is a finite compiler helper`,
        /\/(?:configuration|compiler)-helper\.js(?: |$)|\/@typescript\/typescript-(?:linux|darwin)-[^/]+\/lib\/tsc --api /.test([child.command, ...child.args ?? []].join(' ')));
      if (format === 'json') {
        const actual = JSON.parse(result.stdout) as { runId: string };
        a.ok('json: actual run identity supplied', typeof actual.runId === 'string' && actual.runId.length > 0);
        // Only the per-run label changes. Check exact serialization, including
        // member order and the final newline, against the unchanged batch API.
        a.equal('json: exact Plan 1 report bytes except runId', result.stdout,
          JSON.stringify({ ...expected.report, runId: actual.runId }) + '\n');
      } else {
        const lines = result.stdout.split('\n'), configuration = lines.findIndex(line => line.startsWith('Configuration:'));
        a.ok('human: configuration reported', configuration >= 0);
        a.equal('human: one Mode line immediately after configuration', [lines[configuration + 1], lines.filter(line => line.startsWith('Mode:')).length], ['Mode: batch', 1]);
        a.ok('human: completed clean report', result.stdout.includes('Execution: completed; check: passed; coverage: complete'));
      }
    }
    a.equal('batch: endpoint remains empty', await readdir(endpoint), []);
    return results;
  } finally { await rm(endpoint, { recursive: true, force: true }); }
}

/** Importing the lightweight client entry, which relays the affected-module types, loads
 * no analysis, compiler, contexts, host or UI module and opens nothing. */
export async function clientEntryBoundary(a: BoundaryAssertions): Promise<ProcessResult> {
  const work = await mkdtemp(join(tmpdir(), 'ramify-client-boundary-'));
  try {
    const entry = join(work, 'import-client.mjs');
    const client = join(repositoryRoot, 'dist/subs/daemon/src/client-entry.js');
    await writeFile(entry, `const client = await import(${JSON.stringify(pathToFileURL(client).href)});\n`
      + 'if (typeof client.connectDaemon !== "function") throw new Error("connectDaemon is missing");\n');
    const result = await cliProcess(work, [], { entry, env: { RAMIFY_ENDPOINT_DIR: work } });
    released(result, a, 'client entry');
    const loaded = loads(result.events);
    a.ok('client entry: the built client entry actually loaded', loaded.some(path => path.endsWith('/dist/subs/daemon/src/client-entry.js')));
    a.equal('client entry: no analysis runtime, compiler, host, contexts or UI', loaded.filter(path => engine.test(path)
      || /\/dist\/subs\/analysis\//.test(path) || serversAndUI.test(path) || daemonHost.test(path)), []);
    a.equal('client entry: no connection, launch or listener', result.events.filter(event =>
      ['connect', 'spawn', 'other-launch', 'listen', 'bind'].includes(event.event)), []);
    return result;
  } finally { await rm(work, { recursive: true, force: true }); }
}

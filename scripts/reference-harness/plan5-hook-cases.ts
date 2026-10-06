import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { ipcFixture } from '../../subs/daemon/src/tests/ipc-fixture.js';
import { eventually } from '../../subs/daemon/src/tests/socket-fixture.js';
import type { CheckDocument } from '../../subs/cli/src/interfaces/cli.js';
import type { CheckParams } from '../../src/interfaces/service.js';
import { packageEngine, packageVersion } from '../../src/tests/process.js';
import type { TraceEvent } from '../../src/tests/process.js';
import { waitForProcessCondition } from '../../src/tests/lifecycle-process.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { readTrace, withSequenceProcess } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { referenceEditFixture, prepareReferenceEdits, workspaceDescription } from './fixtures/plan2/reference.js';
import { applyTextMutation, residentTextMutations } from './resident-mutations.js';
import { runIsolatedProject } from './mutation.js';
import { command } from './processes.js';
import type { CommandResult } from './processes.js';
import { repositoryRoot } from './plan.js';
import { archiveObservation, recordObservation } from './observations.js';
import type { Assertions, InstanceHandler } from './runner.js';

const assembly = 'src/assembly.ts';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const noEngine = /\/dist\/(?:src\/batch\.js|subs\/analysis\/|subs\/daemon\/subs\/contexts\/)|\/node_modules\/(?:typescript|@typescript)\//;
const handlers = new Map<string, InstanceHandler>();
type HookEvent = TraceEvent & { readonly threadId?: number; readonly params?: CheckParams };
const trace = async (p: SequenceProcess) => await readTrace(p.traceFile) as HookEvent[];

async function connection(p: SequenceProcess) {
  const result = await connectDaemon({ endpointDirectory: p.endpoint, client: { name: 'hook-evidence', version: packageVersion },
    engine: packageEngine, daemonEntry: join(repositoryRoot, 'dist/src/daemon-entry.js'), start: 'never' });
  if (result.status !== 'connected') throw new Error(JSON.stringify(result));
  return result.connection;
}
async function publication(p: SequenceProcess, sequence: number): Promise<void> {
  const client = await connection(p);
  try {
    await waitForProcessCondition('watcher publication', 30_000, async () => {
      const result = await client.daemonStatus();
      return result.ok && result.value.contexts.some(context => (context.published?.sequence ?? 0) > sequence && !context.pending.analysisRunning);
    });
  } finally { await client.close(); }
}
async function changed(p: SequenceProcess, root: string, a: Assertions, label: string, expected: number,
  args: string[] = [assembly], environment = p.environment): Promise<CheckDocument> {
  const result = await command(root, p.executable, ['check', '--changed', ...args, '--format', 'json'], 60_000, environment);
  recordObservation(label, { ...result, raw: await archiveObservation(label, result) });
  a.equal(`${label}: finite process exit and stderr`, [result.code, result.signal, result.error, result.stderr], [expected, null, null, '']);
  const document = JSON.parse(result.stdout) as CheckDocument;
  a.equal(`${label}: one compact document and matching exit`, [document.schemaVersion, result.stdout.trim().split('\n').length, document.exitCode], ['ramify.check/3', 1, expected]);
  // Phase 1 project boundaries, iteration 15: each named path carries a disposition in
  // place of the coverage flag. An answered check leaves no path not checked; a check
  // that could not establish its result shows none of these single paths as checked.
  if (expected === 0 || expected === 1) {
    a.equal(`${label}: covering publication`, [document.outcome, document.reason, document.paths.every(item => item.disposition !== 'not-checked')], ['checked', null, true]);
    a.ok(`${label}: revision and checked set`, document.revision && document.checked && document.timings.daemon);
  } else a.equal(`${label}: no pass without coverage`, [document.outcome, document.paths.length > 0 && document.paths.every(item => item.disposition !== 'checked')], ['not-checked', true]);
  return document;
}
async function stop(p: SequenceProcess): Promise<void> {
  const result = await p.run(repositoryRoot, ['daemon', 'stop', '--format', 'json']);
  if (result.code !== 0 || result.error) throw new Error(`Could not stop owned daemon: ${JSON.stringify(result)}`);
}
// The adapter finds the installed `ramify` on PATH: the launcher and compiled client, which the probe cannot trace.
async function host(p: SequenceProcess, root: string, environment = p.environment): Promise<CommandResult> {
  return command(root, process.execPath, [join(repositoryRoot, 'scripts/reference-harness/fixtures/plan5/hook-host.mjs'),
    join(repositoryRoot, 'examples/hooks/claude-code-post-write.mjs'), JSON.stringify({ tool_input: { file_path: join(root, assembly) } })],
  15_000, { ...environment, PATH: `${dirname(p.bin)}:${environment.PATH ?? ''}` });
}

function add(subcase: string, run: (p: SequenceProcess, root: string, directory: string, a: Assertions) => Promise<void>): void {
  const id = `I5-11:${subcase}`;
  handlers.set(id, { kind: 'memory', run: async ({ assertions }) => {
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: id,
      fixture: referenceEditFixture }, async ({ root, runDirectory }) => {
      await prepareReferenceEdits(root);
      await withSequenceProcess(async p => {
        p.environment.NODE_OPTIONS += ` --import=${join(repositoryRoot, 'scripts/reference-harness/fixtures/plan5/hook-probe.mjs')}`;
        p.environment.RAMIFY_HOOK_PROJECT = root;
        await run(p, root, runDirectory, assertions);
      });
    });
    if (!result.ok) throw result.error;
  } });
}

add('changed-hashes-in-cli', async (p, root, _directory, a) => {
  await p.check(root, false);
  const client = await connection(p);
  try {
    const before = await client.daemonStatus();
    if (!before.ok) throw new Error(JSON.stringify(before));
    const offset = (await trace(p)).length;
    await changed(p, root, a, 'covered hash', 0);
    const events = (await trace(p)).slice(offset), sent = events.filter(event => event.event === 'hook-check');
    // Phase 1 project boundaries, iteration 15: the lightweight client cannot classify paths.
    // Its first delta request names the path with no content; the daemon's classification at
    // the published revision asks for the source's content, which the second one carries.
    const published = before.value.contexts[0]?.published?.sequence ?? null;
    a.equal('the CLI names the path without content, then hashes it in one delta request', sent.map(event =>
      [event.params?.scope, event.params?.paths, event.params?.classification, event.params?.freshness]), [
      ['delta', [assembly], null, { mode: 'synchronized', expect: [] }],
      ['delta', [assembly], published, { mode: 'synchronized', expect: [{ path: assembly, sha256: hash(await readFile(join(root, assembly))) }] }]]);
    a.equal('default deadline is 2000 ms', sent[0].params?.deadlineMs, 2000);
    a.ok('CLI file read is observed', events.some(event => event.event === 'hook-read' && event.pid === sent[0].pid && event.path === join(root, assembly)));
    // Opening still validates project/configuration selection. Once the CLI
    // submits its hashes, the covering check itself needs no project reads.
    const answering = events.slice(events.findIndex(event => event.event === 'hook-check'));
    a.equal('daemon reads no project file to answer the covered check', answering.filter(event => event.event === 'hook-read' && event.pid === before.value.pid), []);
    const after = await client.daemonStatus();
    a.equal('covered answer does no analysis and increments covering counter', after.ok && [after.value.counters.analyses - before.value.counters.analyses,
      after.value.counters.coveredRequests - before.value.counters.coveredRequests], [0, 1]);
    // Phase 1 project boundaries, iteration 15: a root-owned path that is no file and no
    // analysis input is one the complete check does not analyze. It is not analyzed and
    // leaves the clean project's exit 0, with no identity in the document.
    const missing = await changed(p, root, a, 'absent hash', 0, ['src/missing.ts']);
    a.equal('missing never-analyzed file is not analyzed', missing.paths,
      [{ path: 'src/missing.ts', disposition: 'not-analyzed', module: 'collection-review', exclusion: null, reason: 'owned-non-source' }]);
    const absent = (await trace(p)).filter(event => event.event === 'hook-check').at(-1)!;
    a.equal('missing file travels as an absent identity', absent.params?.freshness, { mode: 'synchronized', expect: [{ path: 'src/missing.ts', sha256: null }] });
  } finally { await client.close(); }
});

for (const subcase of ['changed-delta-document', 'changed-exit-0-1']) add(subcase, async (p, root, _directory, a) => {
  const clean = await changed(p, root, a, 'clean reference', 0, [assembly, '--deadline', '30000']);
  a.equal('independent clean reference expectation', [clean.execution, clean.findings], ['completed', []]);
  await applyTextMutation(root, residentTextMutations['remove-hop']);
  await publication(p, clean.revision!.sequence);
  const denied = await changed(p, root, a, 'removed exposure', 1);
  a.equal('one new independently located denial', denied.findings.map(finding => [finding.code, finding.location?.file, finding.new]), [['not-visible', assembly, true]]);
  a.equal('description edit names its revision path', denied.revision?.path, 'description');
  a.equal('delta baseline is the prior clean revision', denied.since, clean.revision!.id);
  const human = await p.run(root, ['check', '--changed', assembly]);
  a.equal('human denial exit', [human.code, human.stderr], [1, '']);
  a.ok('human includes new mark, location, mode and checked summary', /new/i.test(human.stdout) && human.stdout.includes(assembly)
    && /Mode:.*description/.test(human.stdout) && /checked/i.test(human.stdout) && /wait/i.test(human.stdout));
});

add('changed-no-batch-fallback', async (p, root, directory, a) => {
  const entry = join(directory, 'failed-start.mjs'); await writeFile(entry, 'process.exit(1);\n');
  const document = await changed(p, root, a, 'unavailable startup', 2, [assembly], { ...p.environment, RAMIFY_DAEMON_ENTRY: entry });
  a.equal('startup failure reports unavailable', document.reason, 'unavailable');
  const events = await trace(p), cli = events.find(event => event.event === 'start' && event.argv?.includes('--changed'))!;
  a.ok('actual installed CLI traced', cli);
  a.equal('CLI imports no batch analysis contexts or compiler', events.filter(event => event.pid === cli.pid && noEngine.test(event.url ?? '')), []);
  a.equal('no compiler helper or alternate spawn mechanism', events.filter(event => event.event === 'other-launch'
    || event.event === 'spawn' && event.args?.some(arg => /(?:compiler|configuration)-helper\./.test(arg))), []);
  a.equal('bounded startup retries precede explicit unavailable', events.filter(event => event.event === 'spawn' && event.args?.[0] === entry).length, 2);
});

add('changed-exit-2-not-checked', async (p, root, directory, a) => {
  const synthetic = join(directory, 'S1000');
  recordObservation('cold-fixture', await materializeSynthetic(synthetic, 'S1000'));
  const cold = await changed(p, synthetic, a, 'cold S1000', 2, ['src/impl0.ts', '--deadline', '50']);
  a.equal('cold has no covering revision', [cold.reason, cold.revision], ['cold', null]);
  // A different context cannot overtake the single running S1000 analysis.
  // Stop it before the independent warm-reference deadline control.
  await stop(p);
  await withSequenceProcess(async warm => {
    warm.environment.NODE_OPTIONS += ` --import=${join(repositoryRoot, 'scripts/reference-harness/fixtures/plan5/hook-probe.mjs')}`;
    warm.environment.RAMIFY_HOOK_PROJECT = root;
    const clean = await changed(warm, root, a, 'warm baseline', 0, [assembly, '--deadline', '30000']);
    await writeFile(join(root, assembly), await readFile(join(root, assembly), 'utf8') + '\n');
    const deadline = await changed(warm, root, a, 'warm source deadline', 2, [assembly, '--deadline', '1']);
    a.equal('warm timeout keeps current sequence', [deadline.reason, deadline.revision?.sequence], ['deadline-exceeded', clean.revision!.sequence]);
    await writeFile(join(root, 'tsconfig.json'), await readFile(join(root, 'tsconfig.json'), 'utf8') + '\n');
    const configured = await changed(warm, root, a, 'configuration hook', 2, ['tsconfig.json', '--deadline', '30000']);
    a.equal('a named configuration file is not checked at once', [configured.reason, configured.revision], ['configuration-changed', null]);
    const unobserved = await changed(warm, root, a, 'outside selected root', 2, ['../outside.ts', '--deadline', '30000']);
    a.equal('outside path is explicit', unobserved.reason, 'unobserved-input');
    const superseded = await changed(warm, root, a, 'rewritten after hash', 2, [assembly, '--deadline', '30000'],
      { ...warm.environment, RAMIFY_HOOK_REWRITE: join(root, assembly) });
    a.equal('superseded is explicit', superseded.reason, 'superseded');
    a.equal('rewrite actually happened at the outgoing check frame', (await trace(warm)).filter(event => event.event === 'hook-rewrite').length, 1);
  });
  await withSequenceProcess(async unavailable => {
    const entry = join(directory, 'exit.mjs'); await writeFile(entry, 'process.exit(1);\n');
    const result = await changed(unavailable, root, a, 'unavailable daemon', 2, [assembly], { ...unavailable.environment, RAMIFY_DAEMON_ENTRY: entry });
    a.equal('unavailable is explicit', result.reason, 'unavailable');
  });
});

add('since-evicted', async (p, root, directory, a) => {
  const entry = join(directory, 'two-revisions.mjs');
  await writeFile(entry, `process.argv.push('--budgets', JSON.stringify({maxHistoryRevisions:2}));\nawait import(${JSON.stringify(pathToFileURL(join(repositoryRoot, 'dist/src/daemon-entry.js')).href)});\n`);
  const first = await changed(p, root, a, 'retained baseline', 0, [assembly, '--deadline', '30000'], { ...p.environment, RAMIFY_DAEMON_ENTRY: entry });
  for (let index = 0; index < 3; index++) {
    await writeFile(join(root, assembly), await readFile(join(root, assembly), 'utf8') + `\n// revision ${index}\n`);
    await changed(p, root, a, `publication ${index + 2}`, 0, [assembly, '--deadline', '30000']);
  }
  const status = await p.status();
  const contexts = (status.status as { contexts: { history: { retained: number } }[] }).contexts;
  a.equal('real daemon holds only two revision headers', contexts.map(context => context.history.retained), [2]);
  const evicted = await changed(p, root, a, 'evicted baseline', 2, [assembly, '--since', first.revision!.id]);
  a.equal('evicted baseline has no invented marks', [evicted.reason, evicted.findings], ['evicted-revision', []]);
});

add('plain-check-unchanged', async (p, root, _directory, a) => {
  const resident = await p.check(root, false), batch = await p.check(root, true);
  const { runId: _resident, ...one } = resident, { runId: _batch, ...two } = batch;
  a.equal('plain resident document remains exactly batch except runId', one, two);
  a.equal('plain schema and independent reference expectation', [resident.schemaVersion, resident.summary.owners, resident.summary.denied], ['ramify.analysis/3', 15, 0]);
  a.equal('compact members do not leak into plain report', ['revision', 'since', 'paths', 'timings', 'exitCode'].filter(key => key in resident), []);
  const human = await p.run(root, ['check']);
  a.equal('plain human exit', [human.code, human.stderr], [0, '']);
  a.ok('plain mode includes revision path', /Mode: resident.*(?:cold|unchanged-surface|source|description|metadata|broad)/.test(human.stdout));
});

add('host-adapter-claude', async (p, root, directory, a) => {
  // Match the host's invocation from the edited file's directory. Invocation
  // changes intentionally require a new revision under the reviewed contract.
  const cwd = dirname(join(root, assembly));
  const first = await changed(p, cwd, a, 'adapter baseline', 0, [assembly, '--deadline', '30000']);
  a.equal('adapter baseline discovers the enclosing root from the file directory', first.root, root);
  await applyTextMutation(root, residentTextMutations['remove-hop']); await publication(p, first.revision!.sequence);
  const denial = await host(p, root);
  recordObservation('adapter-denial', denial);
  a.equal('adapter returns findings through stderr and host exit 2', [denial.code, denial.signal, denial.error, denial.stdout], [2, null, null, '']);
  a.ok('adapter names the located denial', denial.stderr.includes('not-visible') && denial.stderr.includes(assembly));
  await applyTextMutation(root, residentTextMutations['remove-hop'], true);
  // A covering request names the description itself to flush this restoration.
  await changed(p, cwd, a, 'adapter restored exposure', 0, [workspaceDescription, '--deadline', '30000']);
  const clean = await host(p, root);
  a.equal('clean adapter is silent and successful', [clean.code, clean.signal, clean.error, clean.stdout, clean.stderr], [0, null, null, '', '']);
  await withSequenceProcess(async unavailable => {
    const entry = join(directory, 'adapter-start-fails.mjs'); await writeFile(entry, 'process.exit(1);\n');
    const result = await host(unavailable, root, { ...unavailable.environment, RAMIFY_DAEMON_ENTRY: entry });
    recordObservation('adapter-unavailable', result);
    a.equal('unavailable adapter never blocks host', [result.code, result.signal, result.error, result.stdout], [0, null, null, '']);
    a.ok('one-line notice identifies unavailable', result.stderr.trim().split('\n').length === 1 && result.stderr.includes('unavailable'));
  });
});

handlers.set('I5-11:service-params-validated', { kind: 'memory', run: async ({ assertions: a }) => {
  const fixture = await ipcFixture();
  try {
    const client = await fixture.connect(), opened = await client.openContext(fixture.params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error(JSON.stringify(opened));
    const token = opened.value.token;
    const baseline = await client.check({ token, requestId: 'baseline', freshness: { mode: 'published', wait: true } });
    a.ok('same socket accepts legacy plain report request', baseline.ok && baseline.value.status === 'reported' && baseline.value.published && baseline.value.report?.outcome.execution === 'completed');
    const before = await client.daemonStatus();
    const raw = await fixture.raw();
    const malformed = [{ scope: 'unknown' }, { scope: null }, { since: 'not-a-revision' }, { since: 'rev/1:' },
      { deadlineMs: 0 }, { deadlineMs: 600001 }, { deadlineMs: 1.5 }, { deadlineMs: '500' }];
    for (const [index, fields] of malformed.entries()) {
      raw.send({ type: 'request', id: `bad-${index}`, op: 'check', params: { token, requestId: `invalid-${index}`,
        freshness: { mode: 'synchronized', expect: [] }, ...fields } });
      await eventually(() => raw.messages.some(message => message.type === 'response' && message.id === `bad-${index}`));
      const response = raw.messages.find(message => message.type === 'response' && message.id === `bad-${index}`);
      a.equal(`wire rejection ${index}`, response?.type === 'response' && !response.result.ok && response.result.error.code, 'invalid-request');
    }
    const after = await client.daemonStatus();
    a.equal('invalid parameters start no context analysis', after.ok && after.value.counters.analyses, before.ok && before.value.counters.analyses);
    raw.send({ type: 'request', id: 'good', op: 'check', params: { token, requestId: 'good', scope: 'delta', deadlineMs: 600000,
      freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash(await readFile(join(fixture.project, 'src/index.ts'))) }] } } });
    await eventually(() => raw.messages.some(message => message.type === 'response' && message.id === 'good'));
    const response = raw.messages.find(message => message.type === 'response' && message.id === 'good');
    const value = response?.type === 'response' && response.result.ok ? response.result.value as { status: string; published: boolean; report: unknown; delta: unknown } : null;
    a.ok('well-formed delta still succeeds on the rejected-request socket', value?.status === 'reported' && value.published && value.report === null && value.delta);
    recordObservation('check-parameter-wire-validation', { malformed, messages: raw.messages });
  } finally { await fixture.dispose(); }
} });

export const plan5HookHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

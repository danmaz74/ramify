import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import { help } from '../../subs/cli/src/arguments.js';
import type { CliEnvironment } from '../../subs/cli/src/interfaces/cli.js';
import type { ServiceConnection, ServiceConnector } from '../../subs/daemon/src/interfaces/daemon.js';
import { assertResidentTrace, readTrace, withSequenceProcess } from './equivalence-process.js';
import { sessionModulePattern } from './plan5-completion-cases.js';
import { writeMaterializeFixture } from './plan2a-materialize-fixture.js';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler } from './runner.js';

/** A batch call from any materialize invocation is a real defect: the
 * command never falls back to batch, per contracts.md's CLI grammar. */
function refusingBatch(): never { throw new Error('materialize must never call batch'); }

interface CliFixture {
  readonly root: string;
  readonly quick: Awaited<ReturnType<typeof createQuickEnvironment>>;
  readonly out: string[];
  readonly err: string[];
  invoke(args: readonly string[], connect?: ServiceConnector, cwd?: string): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }>;
}

async function withCli<T>(run: (fixture: CliFixture) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-plan2a-cli-'));
  await writeMaterializeFixture(root);
  const quick = await createQuickEnvironment();
  const out: string[] = [], err: string[] = [];
  try {
    const invoke: CliFixture['invoke'] = async (args, connect = quick.connect, cwd = root) => {
      out.splice(0); err.splice(0);
      const environment: CliEnvironment = { cwd, version: '0.0.0', connect, batch: async () => refusingBatch(),
        stdout: text => { out.push(text); }, stderr: text => { err.push(text); } };
      const code = await runCli(args, environment);
      return { code, stdout: out.join(''), stderr: err.join('') };
    };
    return await run({ root, quick, out, err, invoke });
  } finally { await quick.dispose(); await rm(root, { recursive: true, force: true }); }
}

export const plan2aCliHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I2A-10:grammar-default', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ invoke }) => {
      const result = await invoke(['materialize']);
      // The fixture's root module declares no `src/` of its own (a pure
      // `expose-sub` aggregator), so its ordinary area is absent and it
      // contributes zero targets.
      a.equal('materialize with no selector defaults to cwd (the root module, which owns no src/, so 0 targets)', [result.code, result.stdout.includes('0 target(s)')], [0, true]);
      const shown = await invoke(['--help']);
      const grammarLine = help.split('\n').find(line => line.includes('ramify materialize'));
      a.equal('help lists exactly the materialize grammar: --from, --all and --root, no other flag',
        grammarLine?.trim(), 'ramify materialize [--from <path>] [--all] [--root <dir>]');
      a.equal('help text matches the shared usage block verbatim', shown.stdout, help);
    });
  } }],

  ['I2A-10:from-selection', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ root, invoke }) => {
      const relative = await invoke(['materialize', '--from', 'subs/app']);
      a.equal('a relative directory --from selects the innermost module (app: ordinary + tests)', [relative.code, relative.stdout.includes('2 target(s)')], [0, true]);
      const absolute = await invoke(['materialize', '--from', join(root, 'subs/app/src/index.ts')]);
      a.equal('an absolute file --from selects the same innermost module', [absolute.code, absolute.stdout.includes('2 target(s)')], [0, true]);
      const fromSubdirectory = await invoke(['materialize', '--from', 'app'], undefined, join(root, 'subs'));
      a.equal('a relative --from resolved from a working directory below the root still finds the same project root and module',
        [fromSubdirectory.code, fromSubdirectory.stdout.startsWith(`Root: ${root}`), fromSubdirectory.stdout.includes('2 target(s)')], [0, true, true]);
    });
  } }],

  ['I2A-10:all-selection', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ invoke }) => {
      const result = await invoke(['materialize', '--all']);
      a.equal('--all requests every module once in one compact combined summary', result.code, 0);
      // 3 targets, not 4: the fixture's root module owns no `src/` (a pure
      // `expose-sub` aggregator), so it contributes no ordinary target.
      a.ok('the summary names all three targets and the two available entries',
        /3 target\(s\), 2 entries/.test(result.stdout));
    });
  } }],

  ['I2A-10:invalid-arguments', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ invoke }) => {
      let connectCalls = 0;
      const guarded: ServiceConnector = async () => { connectCalls++; return { status: 'unavailable', attempts: 0, message: 'must not connect', reason: { kind: 'closed' } }; };
      const cases: readonly string[][] = [
        ['materialize', '--from', 'subs/app', '--from', 'subs/app'], ['materialize', '--all', '--all'],
        ['materialize', '--from', ''], ['materialize', '--unknown-flag'], ['materialize', '--all', '--from', 'subs/app'],
        ['materialize', '--batch'], ['materialize', '--changed', 'src/index.ts'], ['materialize', '--format', 'json'],
        ['materialize', '--root'],
      ];
      for (const args of cases) {
        const result = await invoke(args, guarded);
        a.equal(`rejects before connecting: ${args.join(' ')}`, result.code, 2);
      }
      a.equal('none of the invalid invocations ever reached connect', connectCalls, 0);
    });
  } }],

  ['I2A-10:exit-contract', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ root, invoke, quick }) => {
      const complete = await invoke(['materialize', '--all']);
      a.equal('complete publication exits 0', complete.code, 0);
      const empty = await mkdtemp(join(tmpdir(), 'ramify-plan2a-cli-empty-'));
      try {
        const invalidProject = await invoke(['materialize', '--root', empty], undefined, empty);
        a.equal('an invalid project (no module.ramify) exits 1', invalidProject.code, 1);
      } finally { await rm(empty, { recursive: true, force: true }); }
      const outsideProject = await invoke(['materialize', '--from', '/does/not/exist/outside']);
      a.equal('an unavailable/partial outcome (a --from that cannot be reached) exits 2', outsideProject.code, 2);
      const controller = new AbortController();
      const environment: CliEnvironment = { cwd: root, version: '0.0.0', connect: quick.connect, batch: quick.batch, stdout() {}, stderr() {} };
      const pending = runCli(['materialize', '--all'], environment, { signal: controller.signal });
      controller.abort();
      a.equal('SIGINT-style interruption exits 130', await pending, 130);
    });
  } }],

  ['I2A-10:generation-recovery', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ invoke, quick }) => {
      let materializeCalls = 0, closeContextCalls = 0;
      const wrapped: ServiceConnector = async options => {
        const connected = await quick.connect(options);
        if (connected.status !== 'connected') return connected;
        const actual = connected.connection;
        const connection: ServiceConnection = { ...actual,
          async materialize(params, control) {
            materializeCalls++;
            if (materializeCalls === 1) return { ok: true, value: { status: 'unavailable', requestId: params.requestId, reason: 'expired-generation', message: 'injected' } };
            return actual.materialize(params, control);
          },
          async closeContext(params) { closeContextCalls++; return actual.closeContext(params); },
        };
        return { ...connected, connection };
      };
      const result = await invoke(['materialize', '--all'], wrapped);
      a.equal('one expired generation reopens through the existing recovery and still completes', [result.code, materializeCalls, closeContextCalls], [0, 2, 2]);
      const stopped: ServiceConnector = async () => ({ status: 'stopped', record: { schemaVersion: 'ramify.daemon-record/1',
        instanceId: 'x', pid: 1, buildKey: '0000000000000000', version: '0.0.0', engine: 'test', protocol: 'ramify.ipc/1',
        socket: '/quick', startedAt: 0, state: 'stopped', stopped: { at: 0, reason: 'explicit', requestId: null } } });
      const stoppedResult = await invoke(['materialize', '--all'], stopped);
      a.equal('a stopped peer never triggers batch fallback', stoppedResult.code, 2);
      const incompatible: ServiceConnector = async () => ({ status: 'unavailable', attempts: 1,
        reason: { kind: 'incompatible', daemon: '2.0.0', client: '0.0.0' }, message: 'incompatible' });
      const incompatibleResult = await invoke(['materialize', '--all'], incompatible);
      a.equal('an incompatible peer never triggers batch fallback', incompatibleResult.code, 2);
    });
  } }],

  ['I2A-10:output-summary', { kind: 'memory', run: async ({ assertions: a }) => {
    await withCli(async ({ invoke }) => {
      const first = await invoke(['materialize', '--all']);
      // 3 targets, not 4: the fixture's root module owns no `src/` (a pure
      // `expose-sub` aggregator), so it contributes no ordinary target.
      a.ok('success names the revision, target count, entry count and bytes written',
        /^Root: .+\nMaterialized: revision \d+; 3 target\(s\), 2 entries, \d+ bytes written, 0 unchanged\n$/.test(first.stdout));
      // A second, separately connected CLI invocation (its own context lease,
      // opened and closed independently of the first) still reaches the
      // published revision's true no-op: 0 bytes written, every target
      // unchanged. iteration 8's own report of a forced broad recompute on
      // such a reopen (recorded then as "Required follow-up for other
      // owners" #1) is superseded by the user's binding rework (see this
      // iteration's results, "Rework: views only for existing source areas"):
      // materialization never creates `src/`, so the module without one is
      // never targeted at all, and the whole bug class (an observer
      // mistaking materialize's own freshly created directory for a genuine
      // structural change) cannot occur.
      const second = await invoke(['materialize', '--all']);
      a.ok('a repeat invocation reports the same published revision, 0 bytes written and every target unchanged',
        /^Root: .+\nMaterialized: revision \d+; 3 target\(s\), 2 entries, 0 bytes written, 3 unchanged\n$/.test(second.stdout));
      a.equal('the repeat invocation reused the first invocation\'s revision', second.stdout.match(/revision (\d+)/)?.[1],
        first.stdout.match(/revision (\d+)/)?.[1]);
      for (const forbidden of ['widget', 'signature', 'documentation', '.md']) {
        a.equal(`success output never dumps catalog content ("${forbidden}")`, first.stdout.includes(forbidden), false);
      }
    });
  } }],

  ['I2A-10:lightweight-import', { kind: 'memory', run: async ({ assertions: a }) => {
    await withSequenceProcess(async processes => {
      const before = (await readTrace(processes.traceFile)).length;
      const helpRun = await processes.run(repositoryRoot, ['--help']);
      a.equal('help exits cleanly', [helpRun.code, helpRun.error], [0, null]);
      const versionRun = await processes.run(repositoryRoot, ['--version']);
      a.equal('version exits cleanly', [versionRun.code, versionRun.error], [0, null]);
      const events = (await readTrace(processes.traceFile)).slice(before);
      a.equal('help and version load no analysis/worker/compiler module', events.some(event =>
        event.event === 'load' && sessionModulePattern.test(event.url ?? '')), false);
      a.equal('help and version never start or contact a process or socket', events.filter(event =>
        ['spawn', 'other-launch', 'connect', 'listen', 'bind'].includes(event.event)), []);
    });
  } }],

  ['I2A-10:compiled-process', { kind: 'memory', run: async ({ assertions: a }) => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan2a-compiled-'));
    try {
      await writeMaterializeFixture(root);
      await withSequenceProcess(async processes => {
        const status = await processes.status();
        a.equal('the installed launcher starts the daemon on demand', status.schemaVersion, 'ramify.daemon-status/1');
        const before = (await readTrace(processes.traceFile)).length;
        const outcome = await processes.run(root, ['materialize', '--all']);
        // 3 targets, not 4: the fixture's root module owns no `src/` (a pure
        // `expose-sub` aggregator), so it contributes no ordinary target.
        a.equal('installed materialize exits 0 and names the expected summary',
          [outcome.code, outcome.error, /3 target\(s\), 2 entries/.test(outcome.stdout)], [0, null, true]);
        const meta = JSON.parse(await readFile(join(root, 'subs/app/src/.ramify/_meta.json'), 'utf8')) as { schema: string; module: string };
        a.equal('the real generated metadata is written to disk', [meta.schema, meta.module], ['ramify.api-view/1', 'materialize-fixture/app']);
        const document = await readFile(join(root, 'subs/app/src/.ramify/external/subs/lib/src/api.ts.md'), 'utf8');
        a.ok('the real generated document names the available export', document.includes('widget'));
        const events = (await readTrace(processes.traceFile)).slice(before);
        const start = events.find(event => event.event === 'start' && event.argv?.[1] === processes.executable);
        if (!start) throw new Error('Installed Node entry must be traced');
        assertResidentTrace(events, start.pid, processes.endpoint);
        a.equal('no batch analyzer runs in the CLI process for materialize', events.some(event => event.pid === start.pid
          && event.event === 'load' && sessionModulePattern.test(event.url ?? '')), false);
      });
    } finally { await rm(root, { recursive: true, force: true }); }
  } }],
]);

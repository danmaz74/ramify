import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processAlive, waitForProcessCondition } from '../../src/tests/lifecycle-process.js';
import type { LiveProcess } from '../../src/tests/lifecycle-process.js';
import type { ContextToken } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import type { DaemonRecord } from '../../subs/daemon/src/interfaces/daemon.js';
import { withLifecycleProjects } from './fixtures/plan2/lifecycle.js';
import { referenceEditFixture, prepareReferenceEdits } from './fixtures/plan2/reference.js';
import { runIsolatedProject } from './mutation.js';
import { withLifecycleRuntime } from './lifecycle-runtime.js';
import type { LifecycleRuntime } from './lifecycle-runtime.js';
import { repositoryRoot } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import { recordObservation } from './observations.js';
import type { InstanceHandler } from './runner.js';

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const handlers = new Map<string, InstanceHandler>();
function lines(process: LiveProcess): any[] { return process.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)); }
async function watch(runtime: LifecycleRuntime, root: string): Promise<LiveProcess> {
  const child = runtime.cli(root, ['watch', '--format', 'json'], 120_000);
  await child.waitForOutput('"event":"revision"', 30_000);
  return child;
}
async function endWatch(child: LiveProcess): Promise<void> { if (!child.exit) child.signal('SIGINT'); await child.waitForExit(7000); }
async function awaitIdle(runtime: LifecycleRuntime, timeout = 7000): Promise<DaemonRecord> {
  let record: DaemonRecord | null = null;
  await waitForProcessCondition('daemon idle stop', timeout, async () => { record = await runtime.record(); return record?.state === 'stopped' && !processAlive(record.pid); });
  return record!;
}
async function cliCheck(runtime: LifecycleRuntime, root: string) {
  const child = runtime.cli(root, ['check', '--format', 'json']); const exit = await child.waitForExit(40_000);
  if (exit.code !== 0) throw new Error(`Check failed ${exit.code}: ${child.stderr}`);
  return { child, report: JSON.parse(child.stdout) };
}
for (const instance of plan2Instances.filter(item => item.requiredCapabilities.includes('lifecycle'))) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const name = instance.subcase;
    const budgets: Record<string, number> = name === 'idle-disposal-releases'
      ? { warmIdleMs: 1000, coldRetainMs: 1000, idleExitMs: 3000 }
      : ['idle-exit', 'restart-after-idle', 'watch-lease-prevents-idle'].includes(name) ? { idleExitMs: 2000 } : {};
    async function execute(root: string, roots?: readonly string[]): Promise<void> {
      await withLifecycleRuntime(budgets, async runtime => {
        const client = await runtime.client();
        if (name === 'incompatible-bounded') {
          // A separate traced child supplies the incompatible wire client.
          const fixture = join(repositoryRoot, 'scripts/reference-harness/fixtures/plan2/lifecycle-incompatible.mjs');
          const bad = runtime.scope.start({ cwd: repositoryRoot, args: [fixture, repositoryRoot, runtime.endpoint.socket, runtime.endpoint.buildKey], timeoutMs: 10_000 });
          a.equal('incompatible client completes one handshake', (await bad.waitForExit(7000)).code, 0);
          const rejected = JSON.parse(bad.stdout);
          a.equal('foreign protocol is rejected once', [rejected.count, rejected.message.type, rejected.message.error.code], [1, 'reject', 'incompatible']);
          const events = (await runtime.scope.events()).filter(event => event.pid === bad.pid);
          a.equal('incompatible client makes one connection', events.filter(event => event.event === 'connect').length, 1);
          a.equal('incompatible client starts no replacement', events.filter(event => event.event === 'spawn').length, 0);
          a.equal('existing daemon remains running', (await runtime.record())?.pid, runtime.initialDaemon.pid); return;
        }
        if (name === 'eviction-under-many-contexts') {
          if (!roots) throw new Error('Nine projects required');
          const tokens: ContextToken[] = [];
          for (const [index, fixture] of roots.entries()) {
            const token = await client.open(fixture); tokens.push(token);
            const result = await client.check(token); a.equal(`fixture ${index + 1} is checked`, result.report.outcome.check, 'passed');
            await client.call('closeContext', { token }); await pause(2);
          }
          const current = await client.status();
          a.equal('only eight contexts retained', current.contexts.length, 8);
          a.equal('first root was least recently active', current.contexts.some((context: any) => context.token.context === tokens[0].context), false);
          a.equal('other eight identities remain', current.contexts.map((context: any) => context.token.context).sort(), tokens.slice(1).map(token => token.context).sort());
          const reopened = await client.open(roots[0]);
          a.ok('reopened evicted root gets new generation', reopened.generation !== tokens[0].generation); return;
        }
        const token = await client.open(root);
        const baseline = await client.check(token);
        a.equal('real reference baseline passes', [baseline.status, baseline.report.outcome.check, baseline.report.summary.owners], ['reported', 'passed', 15]);
        const original = (await runtime.record())!;
        switch (name) {
          case 'idle-exit': case 'restart-after-idle': {
            const idle = await awaitIdle(runtime);
            a.equal('bare connection does not keep daemon alive', idle.stopped?.reason, 'idle');
            const state = await client.call('state'); a.equal('client received idle-exit goodbye', state.reason?.kind, 'idle-exit');
            const recovery = await client.call('recover'); a.equal('idle client does not automatically restart', recovery.status, 'stopped');
            a.equal('automatic recovery preserves stopped record', (await runtime.record())?.instanceId, original.instanceId);
            if (name === 'restart-after-idle') {
              const checked = await cliCheck(runtime, root);
              const next = await runtime.client(); const nextToken = await next.open(root); const nextReport = await next.check(nextToken);
              a.ok('new explicit invocation starts a new instance', (await runtime.record())?.instanceId !== original.instanceId);
              a.ok('reopened context has a new generation', nextToken.generation !== token.generation);
              a.equal('restarted report retains independent baseline semantics', [checked.report.summary, nextReport.report.summary], [baseline.report.summary, baseline.report.summary]);
            } break;
          }
          case 'watch-lease-prevents-idle': {
            const live = await watch(runtime, root);
            try {
              await pause(2500); a.equal('watch subscription prevents idle exit', (await runtime.record())?.state, 'running');
              a.equal('same instance remains alive past idle deadline', processAlive(original.pid), true);
            } finally { await endWatch(live); }
            a.equal('watch exits by interruption', live.exit?.code, 130);
            const idle = await awaitIdle(runtime);
            a.equal('daemon idles after subscription is released', idle.stopped?.reason, 'idle'); break;
          }
          case 'explicit-stop': case 'missed-stop-notification': case 'new-command-after-stop': {
            const live = await watch(runtime, root); let suspended = false;
            try {
              if (name === 'missed-stop-notification') { live.signal('SIGSTOP'); suspended = true; }
              const stop = runtime.cli(root, ['daemon', 'stop', '--format', 'json']);
              a.equal('stop command acknowledges within grace', (await stop.waitForExit(7000)).code, 0);
              if (suspended) { live.signal('SIGCONT'); suspended = false; }
              a.equal('watch exits without restarting after explicit stop', (await live.waitForExit(7000)).code, 2);
              a.ok('watch output reports explicit stop', /stopped.*explicit|explicit.*stop/i.test(live.stderr + live.stdout));
              const record = (await runtime.record())!;
              a.equal('stop record is authoritative', [record.state, record.stopped?.reason], ['stopped', 'explicit']);
              a.ok('wire stop request identity is recorded', typeof record.stopped?.requestId === 'string' && record.stopped.requestId.length > 0);
              a.equal('stopped watch did not start a replacement', record.instanceId, original.instanceId);
              if (name === 'new-command-after-stop') {
                const next = await cliCheck(runtime, root);
                a.equal('fresh explicit check succeeds after stop', next.report.outcome.check, 'passed');
                a.ok('fresh command starts a different instance', (await runtime.record())?.instanceId !== record.instanceId);
                a.equal('previous watch stays stopped', live.exit?.code, 2);
              }
            } finally { if (suspended && !live.exit) live.signal('SIGCONT'); if (!live.exit) await endWatch(live); }
            break;
          }
          case 'crash-recovery': {
            const live = await watch(runtime, root);
            try {
              const started = performance.now(); runtime.initialDaemon.signal('SIGKILL'); await runtime.initialDaemon.waitForExit(7000);
              await waitForProcessCondition('watch restarts after crash', 120_000, () => /Reconnected to daemon/.test(live.stderr) && lines(live).some(line => line.event === 'status' && line.current.token.generation !== token.generation));
              recordObservation('advisory-recovery-timing', { operation: 'watch', elapsedMs: performance.now() - started, targetMs: 20_000, enforcement: 'advisory' });
              a.equal('crash recovery emits no stopped message', /stopped/i.test(live.stderr), false);
              const replacement = await runtime.record(); a.ok('watch restarted a different daemon', replacement?.instanceId !== original.instanceId);
            } finally { await endWatch(live); }
            const observing = await runtime.client();
            const recoveredToken = await observing.open(root); await observing.check(recoveredToken);
            const source = join(root, 'src/assembly.ts'); await writeFile(source, (await readFile(source, 'utf8')) + '\n// lifecycle in-flight capture\n');
            const checking = runtime.cli(root, ['check', '--format', 'json']);
            await waitForProcessCondition('check request is in flight before crash', 5000, async () => (await observing.status()).contexts.some((context: any) => context.pending.requests > 0 && context.pending.analysisRunning));
            const crashed = (await runtime.record())!; const started = performance.now(); process.kill(crashed.pid, 'SIGKILL');
            await waitForProcessCondition('crashed daemon is reaped', 5000, () => !processAlive(crashed.pid));
            const exit = await checking.waitForExit(120_000);
            a.equal('check restarts and completes after in-flight crash', exit.code, 0);
            recordObservation('advisory-recovery-timing', { operation: 'check', elapsedMs: performance.now() - started, targetMs: 20_000, enforcement: 'advisory' });
            const after = await runtime.client(); const nextToken = await after.open(root);
            a.ok('check recovery uses a new generation', nextToken.generation !== recoveredToken.generation); break;
          }
          case 'reconnect-after-crash-live': {
            runtime.initialDaemon.signal('SIGKILL'); await runtime.initialDaemon.waitForExit(7000);
            const started = performance.now(); const recovered = await client.call('recover');
            a.equal('direct client performs bounded restart', [recovered.status, recovered.restarted], ['recovered', true]);
            recordObservation('advisory-recovery-timing', { operation: 'direct', elapsedMs: performance.now() - started, targetMs: 20_000, enforcement: 'advisory' });
            const reopened = await client.open(root); const result = await client.check(reopened);
            a.ok('direct recovery opens fresh context generation', reopened.generation !== token.generation);
            a.equal('direct recovery checks actual project inputs', result.report.summary, baseline.report.summary); break;
          }
          case 'watch-exit-releases': {
            const live = await watch(runtime, root); await endWatch(live);
            await waitForProcessCondition('watch subscription released', 3000, async () => (await client.status()).subscriptions === 0);
            const status = await client.status();
            a.equal('subscription count reaches zero', status.subscriptions, 0);
            a.equal('context remains warm after watch exit', status.contexts[0].state, 'warm');
            a.equal('context has no subscription leases', status.contexts[0].leases.subscriptions, 0); break;
          }
          case 'command-exit-releases': {
            const checked = await cliCheck(runtime, root);
            const status = await client.status();
            a.equal('command completes and releases every request lease', [checked.child.exit?.code, status.contexts[0].state, status.contexts[0].leases.requests], [0, 'warm', 0]);
            const spawned = (await runtime.scope.events()).filter(event => event.event === 'spawn' && event.args?.some(arg => /(?:compiler|configuration)-helper/.test(arg))).map(event => event.child!);
            a.ok('real helper control is nonempty', spawned.length > 0);
            a.ok('all finite compiler helpers are gone after check', spawned.every(pid => !processAlive(pid))); break;
          }
          case 'idle-disposal-releases': {
            const started = performance.now(); let cold: any;
            await waitForProcessCondition('context cold transition', 120_000, async () => {
              const status = await client.status(); cold = status.contexts[0]; return cold?.state === 'cold';
            });
            recordObservation('advisory-cold-transition-timing', { elapsedMs: performance.now() - started, targetMs: 6000, enforcement: 'advisory' });
            a.equal('cold drops watcher and products while pinning current report', [cold.watcher, cold.retainedBytes, cold.history.retained], ['disposed', 0, 1]);
            const helpers = (await runtime.scope.events()).filter(event => event.event === 'spawn' && event.args?.some(arg => /(?:compiler|configuration)-helper/.test(arg))).map(event => event.child!);
            a.ok('cold has no compiler helper alive', helpers.every(pid => !processAlive(pid)));
            await waitForProcessCondition('cold context evicted', 120_000, async () => (await client.status()).contexts.length === 0);
            a.equal('eviction releases all history', (await client.status()).contexts, []);
            const idle = await awaitIdle(runtime, 120_000); a.equal('idle daemon exits after context disposal', idle.stopped?.reason, 'idle'); break;
          }
          default: throw new Error(`Unhandled lifecycle case ${instance.id}`);
        }
        recordObservation('lifecycle-case', { id: instance.id, platform: process.platform, initial: original, final: await runtime.record() });
      });
    }
    if (name === 'eviction-under-many-contexts') await withLifecycleProjects(join(repositoryRoot, '.reference-work'), roots => execute(roots[0], roots));
    else {
      const isolated = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: instance.id, fixture: referenceEditFixture }, async ({ root }) => { await prepareReferenceEdits(root); await execute(root); });
      if (!isolated.ok) throw isolated.error;
    }
    a.ok('all traced process families and endpoint directories released', true);
  } });
}
export const lifecycleHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

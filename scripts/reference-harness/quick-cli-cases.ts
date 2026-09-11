import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import { capabilities } from '../../subs/cli/src/command-support.js';
import type { CliEnvironment, WatchLine } from '../../subs/cli/src/interfaces/cli.js';
import type { ServiceConnection } from '../../subs/daemon/src/interfaces/daemon.js';
import { referenceEditFixture, prepareReferenceEdits } from './fixtures/plan2/reference.js';
import { runIsolatedProject } from './mutation.js';
import { applyTextMutation, residentTextMutations as edits } from './resident-mutations.js';
import { repositoryRoot } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import type { InstanceHandler } from './runner.js';

const semantic = (report: { runId: string }) => { const { runId: _, ...rest } = report; return rest; };
async function until(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 30_000;
  while (!predicate()) { if (performance.now() >= deadline) throw new Error('Quick CLI publication timed out'); await delay(5); }
}
const handlers = new Map<string, InstanceHandler>();
for (const instance of plan2Instances.filter(item => item.id.startsWith('I2-24:'))) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const isolated = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: instance.id,
      fixture: referenceEditFixture }, async ({ root }) => {
      await prepareReferenceEdits(root);
      const quick = await createQuickEnvironment(instance.subcase === 'quick-watch-evicted' ? { maxHistoryRevisions: 1 } : {});
      const openedConnection = await quick.connect({ start: 'if-needed' });
      if (openedConnection.status !== 'connected') throw new Error(openedConnection.status);
      const backend = openedConnection.connection;
      const opened = await backend.openContext({ project: { cwd: root, scope: 'whole-project', configuration: 'discover' }, setup: { registry: 'default', capabilities } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error(JSON.stringify(opened));
      const token = opened.value.token;
      const sync = async () => {
        const value = await backend.check({ token, requestId: randomUUID(), freshness: { mode: 'synchronized', expect: [] } });
        if (!value.ok || value.value.status !== 'reported') throw new Error(JSON.stringify(value)); return value.value;
      };
      const baseline = await sync();
      const out: string[] = [], err: string[] = [];
      const environment: CliEnvironment = { cwd: root, version: '0.0.0', connect: quick.connect, batch: quick.batch,
        stdout: text => { out.push(text); }, stderr: text => { err.push(text); } };
      const invoke = async (args: string[]) => { out.splice(0); err.splice(0); const code = await runCli(args, environment); return { code, stdout: out.join(''), stderr: err.join('') }; };
      const controller = new AbortController();
      let pendingWatch: Promise<number> | undefined;
      try {
        a.equal('real reference baseline passes', [baseline.report.summary.owners, baseline.report.outcome.check], [15, 'passed']);
        if (instance.subcase === 'quick-check-flow') {
          const first = await invoke(['check', '--format', 'json']);
          a.equal('first check serializes backend report', [first.code, first.stderr, semantic(JSON.parse(first.stdout))], [0, '', semantic(baseline.report)]);
          await applyTextMutation(root, edits['remove-hop']);
          const second = await invoke(['check', '--format', 'json']);
          a.equal('synchronized CLI sees provider denial', [second.code, JSON.parse(second.stdout).summary.denied], [1, 1]);
          const current = await sync();
          a.equal('second check equals its backend report', semantic(JSON.parse(second.stdout)), semantic(current.report));
          const human = await invoke(['check']);
          a.ok('human identifies actual context and revision', human.stdout.includes(`context ${token.context}; revision ${current.revision!.sequence}; synchronized`));
        } else if (instance.subcase === 'quick-status-stop') {
          const status = await invoke(['daemon', 'status', '--format', 'json']);
          a.equal('status uses real service', [status.code, JSON.parse(status.stdout).status.contexts.length], [0, 1]);
          let stopped: unknown;
          const release = quick.service.onStop(value => { stopped = value; });
          const stop = await invoke(['daemon', 'stop', '--format', 'json']);
          a.equal('stop is explicit and acknowledged', [stop.code, JSON.parse(stop.stdout).record.stopped.reason, (stopped as { reason: string }).reason], [0, 'explicit', 'explicit']);
          release();
        } else if (instance.subcase === 'codec-in-direct-channel') {
          const local = await quick.service.check({ token, requestId: 'local', freshness: { mode: 'published', wait: false } });
          const transported = await backend.check({ token, requestId: 'wire', freshness: { mode: 'published', wait: false } });
          if (!local.ok || local.value.status !== 'reported' || !transported.ok || transported.value.status !== 'reported') throw new Error('Expected published reports');
          a.equal('serialized report values are unchanged', transported.value.report, local.value.report);
          a.ok('transport has no report or nested shared identity', transported.value.report !== local.value.report && transported.value.report.summary !== local.value.report.summary);
          const invalid = await quick.request('notAnOperation', {});
          a.equal('unknown decoded operation reaches shared dispatcher', invalid.ok ? null : invalid.error.code, 'unsupported-operation');
          let event: unknown;
          const subscribed = await backend.subscribe({ token }, value => { event = value; });
          quick.watcher.emit(root, [{ path: '.', kind: 'error' }]);
          await until(() => event !== undefined);
          a.ok('real watcher status event is delivered through codec', event);
          if (!subscribed.ok) throw new Error(subscribed.error.message);
          a.ok('event and response own distinct status objects', (event as { current?: unknown }).current !== subscribed.value.current);
          await backend.unsubscribe({ subscription: subscribed.value.subscription });
        } else {
          const fetched: string[] = [];
          let held = false, releaseHeld: (() => void) | undefined;
          const gated = new Promise<void>(resolve => { releaseHeld = resolve; });
          const wrapped: CliEnvironment = { ...environment, connect: async options => {
            const value = await quick.connect(options);
            if (value.status !== 'connected') return value;
            const connection: ServiceConnection = { ...value.connection, check: async (request, control) => {
              if (request.freshness.mode === 'published' && request.freshness.revision) {
                fetched.push(request.freshness.revision);
                if (instance.subcase === 'quick-watch-evicted' && request.freshness.revision.endsWith(':2')) { held = true; await gated; }
              }
              return value.connection.check(request, control);
            } };
            return { ...value, connection };
          } };
          const json = instance.subcase === 'quick-watch-evicted';
          pendingWatch = runCli(['watch', ...(json ? ['--format', 'json'] : [])], wrapped, { signal: controller.signal });
          await until(() => out.join('').includes(json ? '"event":"revision"' : 'Revision 1'));
          await applyTextMutation(root, edits['remove-hop']); const changed = await sync();
          if (json) {
            await until(() => held);
            await applyTextMutation(root, edits['remove-hop'], true); const restored = await sync();
            releaseHeld!();
            await until(() => out.some(line => line.includes('"event":"revision"') && line.includes(`"sequence":${restored.revision!.sequence}`)));
            const lines = out.map(line => JSON.parse(line) as WatchLine);
            const evicted = lines.find(line => line.event === 'revision-evicted');
            a.equal('held revision is explicitly evicted with its own header', evicted?.event === 'revision-evicted' && evicted.revision, changed.revision);
            const last = lines.filter(line => line.event === 'revision').at(-1)!;
            a.equal('later header embeds its own restored report', last.event === 'revision' && [last.revision, semantic(last.report)], [restored.revision, semantic(restored.report)]);
          } else {
            await until(() => out.join('').includes(`Revision ${changed.revision!.sequence}`));
            a.equal('two human revision renderings', out.filter(line => line.startsWith('Revision ')).length, 2);
            a.ok('changed human revision includes denial', out.join('').includes('[not-visible]'));
          }
          a.ok('each report fetch names event revision', fetched.length >= 2 && fetched.every(value => value.startsWith('rev/1:')));
          controller.abort(); a.equal('watch interruption exits 130', await pendingWatch, 130);
          a.equal('watch subscription is released', (await quick.service.daemonStatus()).ok && (await quick.service.daemonStatus() as { ok: true; value: { subscriptions: number } }).value.subscriptions, 0);
          a.equal('watch has no terminal error', err.join(''), '');
        }
      } finally { controller.abort(); await pendingWatch; await quick.dispose(); }
    });
    if (!isolated.ok) throw isolated.error;
  } });
}
export const quickCliHandlers: ReadonlyMap<string, InstanceHandler> = handlers;

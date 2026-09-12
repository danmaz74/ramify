import { readFile, rm } from 'node:fs/promises';
import { channel } from 'node:diagnostics_channel';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openRetainedSession } from '../retained-session.js';
import type { SessionInputs } from '../interfaces/session.js';
import { comparable, equalToBatch, fixture, fixtureFiles, ownedFiles, paths, put, replace, timeout } from './session-test-fixture.js';
import { alive, eventually, frozenPlain, nodeProcess, observedOpen, plain, workerSuite } from './session-worker-fixture.js';

async function opened(inputs: SessionInputs) {
  const observation = await observedOpen(inputs);
  expect(observation.opened.status).toBe('opened');
  if (observation.opened.status !== 'opened') {
    observation.cleanup();
    throw new Error(JSON.stringify(observation.opened));
  }
  return { ...observation, handle: observation.opened.session, revision: observation.opened.revision };
}

workerSuite('retained session worker', import.meta.url, () => {
  it('keeps the host responsive, freezes boundary values and sends reports only when requested', () => fixture(async (_root, inputs) => {
    let ticks = 0;
    const ticker = setInterval(() => { ticks++; }, 2);
    const observation = await opened(inputs).finally(() => clearInterval(ticker));
    const { handle, worker, revision, messages, requests } = observation;
    try {
      expect(ticks).toBeGreaterThan(5);
      expect(worker.threadId).toBeGreaterThan(0);
      expect(revision.outcome.execution).toBe('completed');
      expect(revision.checked.files).toEqual(ownedFiles);
      expect(handle.current).toBe(revision);
      frozenPlain(revision); frozenPlain(handle.status());
      expect(messages.some(message => message.kind === 'reply' && message.result && 'snapshot' in message.result)).toBe(false);
      expect(requests).toEqual([{ operation: 'open', id: 1 }]);
      for (const message of messages) plain(message);

      const report = await handle.report();
      frozenPlain(report);
      expect(report?.inputId).toBe(revision.inputId);
      expect(messages.filter(message => message.kind === 'reply' && message.result && 'snapshot' in message.result)).toHaveLength(1);
      expect(requests).toContainEqual({ operation: 'report', id: 2 });
      const before = messages.length;
      const same = await handle.update([]);
      expect(same).toEqual({ status: 'revised', revision, identical: true });
      expect(handle.current).toBe(revision);
      expect(messages.slice(before).some(message => message.kind === 'reply' && message.result && 'snapshot' in message.result)).toBe(false);
      expect(await handle.verify()).toMatchObject({ status: 'equal', sequence: 1 });
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('demotes to warm while retaining facts and rebuilds broadly even for an empty next update', () => fixture(async (_root, inputs) => {
    const observation = await opened(inputs);
    const { handle, revision } = observation;
    try {
      const hot = handle.status();
      expect(hot.level).toBe('hot');
      expect(hot.worker.heapUsed).toBeGreaterThan(0);
      expect(hot.worker.rss).toBeGreaterThan(hot.worker.heapUsed);
      expect(hot.compiler.pid).not.toBeNull();
      expect(hot.compiler.rss).toBeGreaterThan(0);
      const previous = await handle.report();
      await handle.releaseCompiler();
      const warm = handle.status();
      expect(warm.level).toBe('warm');
      expect(warm.compiler).toEqual({ pid: null, rss: null });
      expect(warm.factBytes).toBe(hot.factBytes);
      expect(warm.observedInputs).toBe(hot.observedInputs);
      expect(handle.current).toBe(revision);
      await eventually(() => !alive(hot.compiler.pid!));
      expect(comparable(await handle.report())).toEqual(comparable(previous));

      const next = await handle.update([]);
      expect(next.status).toBe('revised');
      if (next.status !== 'revised') throw new Error(JSON.stringify(next));
      expect(next.identical).toBe(false);
      expect(next.revision.sequence).toBe(revision.sequence + 1);
      expect(next.revision.checked.path).toBe('broad');
      expect(next.revision.checked.files).toEqual(ownedFiles);
      expect(handle.status().compiler.pid).not.toBe(hot.compiler.pid);
      expect(handle.status().level).toBe('hot');
      await equalToBatch(handle, inputs);
      expect(await handle.verify()).toMatchObject({ status: 'equal', sequence: next.revision.sequence });
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('lets a caller stop waiting at its deadline while the update completes and publishes', () => fixture(async (root, inputs) => {
    const observation = await opened({ ...inputs, session: { ...inputs.session, updateDeadlineMs: 1 } });
    const { handle, revision } = observation;
    try {
      await handle.releaseCompiler();
      await replace(root, paths.provider, '  return 2;', '  return 3;');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const update = handle.update([{ path: paths.provider, kind: 'changed' }]);
      const deadline = new Promise<{ status: 'deadline-exceeded'; sequence: number }>(resolve => {
        timer = setTimeout(() => resolve({ status: 'deadline-exceeded', sequence: handle.current!.sequence }), 1);
      });
      const acknowledgment = await Promise.race([update, deadline]).finally(() => clearTimeout(timer));
      expect(acknowledgment).toEqual({ status: 'deadline-exceeded', sequence: revision.sequence });
      // The reviewed session port has only AbortSignal. Contexts owns this
      // request race; reaching its deadline must never abort the engine work.
      const completed = await update;
      expect(completed.status).toBe('revised');
      if (completed.status !== 'revised') throw new Error(JSON.stringify(completed));
      expect(completed.revision.sequence).toBe(revision.sequence + 1);
      expect(handle.current).toBe(completed.revision);
      expect(handle.current?.checked.path).toBe('broad');
      const timings = completed.revision.timings;
      expect(Object.keys(timings).sort()).toEqual(['classify', 'inventory', 'compiler', 'descriptions', 'accesses', 'link', 'decide', 'publish', 'total'].sort());
      for (const elapsed of Object.values(timings)) { expect(Number.isFinite(elapsed)).toBe(true); expect(elapsed).toBeGreaterThanOrEqual(0); }
      expect(timings.total).toBeGreaterThan(1);
      expect(timings.compiler).toBeGreaterThan(0);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('sweeps observed content and configuration changes and then tracks newly observed files', () => fixture(async (root, inputs) => {
    const observation = await opened(inputs);
    const { handle, revision } = observation;
    try {
      expect(handle.status().lastSweepAt).toBeNull();
      const before = Date.now();
      expect(await handle.sweep()).toEqual({ status: 'unchanged' });
      expect(handle.status().lastSweepAt).toBeGreaterThanOrEqual(before);
      expect(handle.current).toBe(revision);
      await replace(root, paths.provider, '  return 2;', '  return 3;');
      const changed = await handle.sweep();
      expect(changed.status).toBe('revised');
      if (changed.status !== 'revised') throw new Error(JSON.stringify(changed));
      expect(changed.revision.checked).toEqual({ path: 'unchanged-surface', files: [paths.provider], accesses: 0, modelRebuilt: false });
      await equalToBatch(handle, inputs);

      await put(root, paths.extra, 'export const newlyObserved = 1;\n');
      const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
      config.compilerOptions.paths = { '@added/*': ['subs/branch/src/*'] };
      await put(root, 'tsconfig.json', JSON.stringify(config));
      const configured = await handle.sweep();
      expect(configured.status).toBe('revised');
      if (configured.status !== 'revised') throw new Error(JSON.stringify(configured));
      expect(configured.revision.checked.path).toBe('broad');
      expect(configured.revision.checked.files).toContain(paths.extra);
      expect(configured.revision.inputs.some(input => input.path === paths.extra)).toBe(true);
      await replace(root, paths.extra, '= 1', '= 2');
      const discovered = await handle.sweep();
      expect(discovered.status).toBe('revised');
      if (discovered.status !== 'revised') throw new Error(JSON.stringify(discovered));
      expect(discovered.revision.changed).toContain(paths.extra);
      await equalToBatch(handle, inputs);
      expect(await handle.verify()).toMatchObject({ status: 'equal' });
      expect(await handle.sweep()).toEqual({ status: 'unchanged' });
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('recovers a cold invalid acquisition through a sweep without an existing observer', () => fixture(async (root, inputs) => {
    const observation = await opened(inputs);
    const { handle, revision } = observation;
    try {
      expect(revision.outcome.execution).toBe('invalid');
      expect(handle.status().level).toBe('warm');
      expect(handle.status().compiler.pid).toBeNull();
      await put(root, paths.description, fixtureFiles[paths.description]!);
      const recovered = await handle.sweep();
      expect(recovered.status).toBe('revised');
      if (recovered.status !== 'revised') throw new Error(JSON.stringify(recovered));
      expect(recovered.revision.outcome.execution).toBe('completed');
      expect(recovered.revision.checked.path).toBe('broad');
      expect(handle.status().lastSweepAt).not.toBeNull();
      expect(handle.status().level).toBe('hot');
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); observation.cleanup(); }
  }, { [paths.description]: 'ramify 1\nmodule branch\nexpose-src value from\n' }), timeout);

  it('cancels queued and active calls without losing the last published revision', () => fixture(async (root, inputs) => {
    const observation = await opened(inputs);
    const { handle, revision } = observation;
    try {
      const aborted = AbortSignal.abort();
      expect(await handle.update([], { signal: aborted })).toEqual({ status: 'cancelled' });
      expect(await handle.sweep({ signal: aborted })).toEqual({ status: 'cancelled' });
      expect(await handle.verify({ signal: aborted })).toEqual({ status: 'cancelled' });
      expect(await handle.report({ signal: aborted })).toBeNull();
      await handle.releaseCompiler();
      await replace(root, paths.provider, '  return 2;', '  return 3;');
      const active = new AbortController(), queued = new AbortController();
      const inFlight = handle.update([{ path: paths.provider, kind: 'changed' }], { signal: active.signal });
      const behind = handle.update([], { signal: queued.signal });
      queued.abort(); active.abort();
      expect(await inFlight).toEqual({ status: 'cancelled' });
      expect(await behind).toEqual({ status: 'cancelled' });
      expect(handle.current).toBe(revision);
      const restored = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      expect(restored.status).toBe('revised');
      if (restored.status !== 'revised') throw new Error(JSON.stringify(restored));
      expect(restored.revision.outcome.execution).toBe('completed');
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('reports abrupt worker loss, clears the current revision and releases its live compiler', () => fixture(async (_root, inputs) => {
    const observation = await opened(inputs);
    const { handle, worker } = observation;
    const pid = handle.status().compiler.pid!;
    try {
      expect(alive(pid)).toBe(true);
      await worker.terminate();
      const result = await handle.update([]);
      expect(result.status).toBe('reported');
      if (result.status !== 'reported') throw new Error(JSON.stringify(result));
      expect(result.report.outcome.execution).toBe('unavailable');
      expect(result.report.diagnostics.map(item => item.code)).toContain('internal-error');
      expect(result.report.diagnostics.some(item => item.message.includes('analysis-failed'))).toBe(true);
      expect(handle.current).toBeNull();
      expect(await handle.report()).toBeNull();
      expect(worker.threadId).toBe(-1);
      await eventually(() => !alive(pid));
      expect(handle.status().factBytes).toBe(0);
    } finally { await handle.dispose(); await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('turns an actual worker heap exhaustion into an unavailable resource-limit report', () => fixture(async (_root, inputs) => {
    const observation = await observedOpen({ ...inputs, session: { ...inputs.session, workerHeapMiB: 16 } });
    try {
      expect(observation.opened.status).toBe('reported');
      if (observation.opened.status !== 'reported') throw new Error(JSON.stringify(observation.opened));
      expect(observation.opened.report.outcome.execution).toBe('unavailable');
      expect(observation.opened.report.outcome.check).not.toBe('passed');
      expect(observation.opened.report.diagnostics.map(item => item.code)).toContain('resource-limit');
      expect(observation.opened.report.diagnostics.some(item => item.message.includes('resource-unavailable'))).toBe(true);
      expect(observation.messages.some(message => message.kind === 'reply' && message.result && 'revision' in message.result)).toBe(false);
      expect(observation.worker.threadId).toBe(-1);
      for (const message of observation.messages) if (message.kind === 'child' && message.active) {
        expect(alive(message.pid)).toBe(false);
      }
    } finally { observation.cleanup(); }
  }), timeout);

  it('rejects a heap too small for Node bootstrap without starting a worker', () => fixture(async (_root, inputs) => {
    let workers = 0;
    const created = (): void => { workers++; };
    const events = channel('worker_threads');
    events.subscribe(created);
    try {
      const result = await openRetainedSession({ ...inputs, session: { ...inputs.session, workerHeapMiB: 1 } });
      expect(result.status).toBe('reported');
      if (result.status !== 'reported') throw new Error(JSON.stringify(result));
      expect(result.report.outcome.execution).toBe('unavailable');
      expect(result.report.outcome.check).not.toBe('passed');
      expect(result.report.diagnostics.map(item => item.code)).toContain('resource-limit');
      expect(workers).toBe(0);
    } finally { events.unsubscribe(created); }
  }), timeout);

  it('rejects an inherited V8 override before loading the engine or spawning its compiler', () => fixture(async (_root, inputs) => {
    const script = `
      import { channel } from 'node:diagnostics_channel';
      let children = 0;
      channel('worker_threads').subscribe(({ worker }) => worker.on('message', message => {
        if (message.kind === 'child' && message.active) children++;
      }));
      const { openRetainedSession } = await import(process.argv[2]);
      const opened = await openRetainedSession(JSON.parse(process.argv[1]));
      if (opened.status === 'opened') await opened.session.dispose();
      console.log(JSON.stringify({ opened, children }));
    `;
    const output = await nodeProcess(['--experimental-transform-types', '--import', new URL('../session-source-loader.ts', import.meta.url).href,
      '--input-type=module', '--eval', script, JSON.stringify(inputs), new URL('../retained-session.ts', import.meta.url).href],
    { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' });
    const result = JSON.parse(output.trim().split('\n').reverse().find(line => line.startsWith('{'))!);
    expect(result.children).toBe(0);
    expect(result.opened.status).toBe('reported');
    expect(result.opened.report.outcome.execution).toBe('unavailable');
    expect(result.opened.report.diagnostics[0].code).toBe('resource-limit');
    expect(result.opened.report.diagnostics[0].message).toContain('does not enforce');
  }), timeout);

  it('rejects retained fact growth without publishing or losing the preceding report', () => fixture(async (root, inputs) => {
    const first = await opened(inputs);
    const initialBytes = first.handle.status().factBytes;
    await first.handle.dispose(); first.cleanup();
    const observation = await opened({ ...inputs, session: { ...inputs.session, maxRetainedFactBytes: initialBytes + 512 } });
    const { handle, revision } = observation;
    try {
      const previous = await handle.report();
      await put(root, paths.extra, Array.from({ length: 200 }, (_, i) => `export const extra${i} = ${i};`).join('\n'));
      const result = await handle.update([{ path: paths.extra, kind: 'created' }]);
      expect(result.status).toBe('reported');
      if (result.status !== 'reported') throw new Error(JSON.stringify(result));
      expect(result.report.diagnostics.map(item => item.code)).toContain('resource-limit');
      expect(result.report.outcome.check).not.toBe('passed');
      expect(handle.current).toBe(revision);
      expect(comparable(await handle.report())).toEqual(comparable(previous));
      await rm(join(root, paths.extra));
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('disposes while work is queued, releases thread, child and listeners, and tolerates repeated disposal', () => fixture(async (root, inputs) => {
    const observation = await opened(inputs);
    const { handle, worker } = observation;
    const pid = handle.status().compiler.pid!;
    try {
      await replace(root, paths.provider, '  return 2;', '  return 3;');
      const pending = handle.update([{ path: paths.provider, kind: 'changed' }]);
      const disposal = handle.dispose();
      expect(handle.dispose()).toBe(disposal);
      await disposal;
      const settled = await pending;
      expect(['cancelled', 'reported']).toContain(settled.status);
      expect(handle.current).toBeNull();
      expect(handle.status()).toMatchObject({ level: 'warm', factBytes: 0, observedInputs: 0,
        worker: { heapUsed: 0, rss: 0 }, compiler: { pid: null, rss: null } });
      expect(worker.threadId).toBe(-1);
      expect(worker.eventNames()).toEqual([]);
      await eventually(() => !alive(pid));
      await handle.dispose();
      const refused = await handle.update([]);
      expect(refused.status === 'reported' && refused.report.diagnostics[0]?.code).toBe('session-disposed');
      expect(await handle.report()).toBeNull();
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('returns cancelled before starting a worker for an already aborted cold open', () => fixture(async (_root, inputs) => {
    expect(await openRetainedSession(inputs, { signal: AbortSignal.abort() })).toEqual({ status: 'cancelled' });
  }), timeout);
});

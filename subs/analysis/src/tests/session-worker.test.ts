import { readFile, rm } from 'node:fs/promises';
import { channel } from 'node:diagnostics_channel';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
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
      expect(same).toEqual({ status: 'revised', revision, identical: true, reacquired: false,
        timings: { invocationCheck: 0, promotion: 0, workerStatus: expect.any(Number), workerRoundTrip: expect.any(Number) } });
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
      expect(Object.keys(timings).sort()).toEqual(['classify', 'inventory', 'compiler', 'descriptions', 'accesses', 'link', 'decide', 'companions', 'publish', 'total'].sort());
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
      expect(await handle.sweep()).toEqual({ status: 'unchanged', timings: { invocationCheck: 0, promotion: 0, workerStatus: expect.any(Number), workerRoundTrip: expect.any(Number) } });
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
      expect(await handle.sweep()).toEqual({ status: 'unchanged', timings: { invocationCheck: 0, promotion: 0, workerStatus: expect.any(Number), workerRoundTrip: expect.any(Number) } });
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
      let cleanupCompleted = false;
      let exitState: { current: unknown; factBytes: number; cleanupCompleted: boolean } | undefined;
      worker.once('exit', () => { exitState = { current: handle.current, factBytes: handle.status().factBytes, cleanupCompleted }; });
      await worker.terminate().then(() => { cleanupCompleted = true; });
      expect(exitState).toEqual({ current: null, factBytes: 0, cleanupCompleted: false });
      const signal = vi.spyOn(process, 'kill');
      try {
        worker.killOwnedProcesses();
        expect(signal).not.toHaveBeenCalled();
      } finally { signal.mockRestore(); }
      const result = await handle.update([]);
      expect(result.status).toBe('reported');
      if (result.status !== 'reported') throw new Error(JSON.stringify(result));
      expect(result.report.outcome.execution).toBe('unavailable');
      expect(result.report.diagnostics.map(item => item.code)).toContain('internal-error');
      expect(result.report.diagnostics.some(item => item.message.includes('analysis-failed'))).toBe(true);
      expect(handle.current).toBeNull();
      expect(await handle.report()).toBeNull();
      expect(worker.threadId).toBe(-1);
      expect(handle.status().factBytes).toBe(0);
    } finally {
      const disposed = await Promise.allSettled([handle.dispose(), handle.dispose()]);
      observation.cleanup();
      // Keep cleanup assertions visible without masking a prior report failure.
      expect.soft(disposed.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
      expect.soft(alive(pid)).toBe(false);
    }
  }), timeout);

  it('reports supervisor loss and reaps its worker and compiler process group', () => fixture(async (_root, inputs) => {
    const observation = await opened(inputs);
    const { handle, worker } = observation;
    const pid = handle.status().compiler.pid!;
    try {
      const exited = new Promise<void>(resolve => worker.once('exit', () => resolve()));
      process.kill(worker.pid, 'SIGKILL');
      await exited;
      expect(handle.current).toBeNull();
      const result = await handle.update([]);
      expect(result.status).toBe('reported');
      if (result.status !== 'reported') throw new Error(JSON.stringify(result));
      expect(result.report.outcome.execution).toBe('unavailable');
      expect(result.report.diagnostics.some(item => item.message.includes('analysis-failed'))).toBe(true);
      expect(worker.threadId).toBe(-1);
    } finally {
      const disposed = await Promise.allSettled([handle.dispose()]);
      observation.cleanup();
      expect.soft(disposed.map(result => result.status)).toEqual(['fulfilled']);
      expect.soft(alive(pid)).toBe(false);
      expect.soft(alive(worker.pid)).toBe(false);
    }
  }), timeout);

  it('reports heap exhaustion after compiler startup and releases the already observed child', () => fixture(async (_root, inputs) => {
    const observation = await opened({ ...inputs, session: { ...inputs.session, workerHeapMiB: 64 } });
    const { handle, worker, messages } = observation;
    const pid = handle.status().compiler.pid!;
    try {
      expect(alive(pid)).toBe(true);
      const before = messages.length;
      // Exceed the bounded worker heap during ordinary message deserialization,
      // after startup has proved that its compiler child exists. No injected
      // worker error or test-only production command supplies the failure.
      const prefix = 'x'.repeat(2_048);
      const changes = Array.from({ length: 40_000 }, (_, index) => ({ path: `${prefix}/${index}.ts`, kind: 'changed' as const }));
      const result = await handle.update(changes);
      expect(result.status).toBe('reported');
      if (result.status !== 'reported') throw new Error(JSON.stringify(result));
      expect(result.report.outcome.execution).toBe('unavailable');
      expect(result.report.outcome.check).not.toBe('passed');
      expect(result.report.diagnostics.map(item => item.code)).toContain('resource-limit');
      expect(result.report.diagnostics.some(item => item.message.includes('resource-unavailable'))).toBe(true);
      expect(messages.slice(before).some(message => message.kind === 'reply' && message.result && 'revision' in message.result)).toBe(false);
      expect(handle.current).toBeNull();
      expect(worker.threadId).toBe(-1);
    } finally {
      const disposed = await Promise.allSettled([handle.dispose()]);
      observation.cleanup();
      expect.soft(disposed.map(result => result.status)).toEqual(['fulfilled']);
      expect.soft(alive(pid)).toBe(false);
    }
  }), timeout);

  it('turns an actual worker heap exhaustion into an unavailable resource-limit report', () => fixture(async (_root, inputs) => {
    // 16 MiB sat on this fixture's open threshold: repeated opens both exhausted
    // and completed at 16 to 22 MiB. 12 MiB exhausted every sampled open, always
    // after the worker proved its heap limit and started its compiler child.
    const observation = await observedOpen({ ...inputs, session: { ...inputs.session, workerHeapMiB: 12 } });
    try {
      expect(observation.messages.some(message => message.kind === 'ready' && message.oldGenerationMiB === 12)).toBe(true);
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
    } finally {
      try {
        if (observation.opened.status === 'opened') await observation.opened.session.dispose();
      } finally { observation.cleanup(); }
    }
  }), timeout);

  it('rejects a heap too small for Node bootstrap without starting a worker', () => fixture(async (_root, inputs) => {
    let workers = 0;
    const created = (): void => { workers++; };
    const events = channel('ramify:session-worker');
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
      channel('ramify:session-worker').subscribe(({ worker }) => worker.on('message', message => {
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

  it('timing-fields: worker replies add the status checkpoint and daemon-side round trip beside the invocation check', () => fixture(async (root, inputs) => {
    const observation = await opened(inputs);
    const { handle, revision } = observation;
    try {
      const same = await handle.update([], {}, { project: inputs.project, capabilities: inputs.capabilities });
      if (same.status !== 'revised') throw new Error(JSON.stringify(same));
      // The identical update keeps the published revision; its own durations sit beside it.
      expect(same.revision).toBe(revision);
      expect(Object.keys(revision.timings).sort()).toEqual(['accesses', 'classify', 'companions', 'compiler', 'decide', 'descriptions', 'inventory', 'link', 'publish', 'total']);
      const timings = same.timings!;
      frozenPlain(timings);
      expect(Object.keys(timings).sort()).toEqual(['invocationCheck', 'promotion', 'workerRoundTrip', 'workerStatus']);
      expect(timings.promotion).toBe(0);
      expect(timings.invocationCheck).toBeGreaterThan(0);
      expect(timings.workerStatus).toBeGreaterThan(0);
      // The host's round trip brackets both durations measured inside the worker.
      expect(timings.workerRoundTrip).toBeGreaterThanOrEqual(timings.invocationCheck + timings.workerStatus!);
      // Operations other than update and sweep results report no operation timings.
      expect(await handle.verify()).not.toHaveProperty('timings');
      // A revised update reports its promotion inside the stage total.
      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      const edited = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      if (edited.status !== 'revised') throw new Error(JSON.stringify(edited));
      frozenPlain(edited.timings);
      expect(Object.keys(edited.timings!).sort()).toEqual(['invocationCheck', 'promotion', 'workerRoundTrip', 'workerStatus']);
      expect(edited.timings!.promotion).toBeGreaterThan(0);
      expect(edited.timings!.promotion).toBeLessThanOrEqual(edited.revision.timings.total);
      expect(edited.timings!.workerRoundTrip).toBeGreaterThanOrEqual(edited.revision.timings.total + edited.timings!.workerStatus!);
      // promotion-timed: an unchanged sweep carries the worker's status checkpoint and the host's round trip.
      const swept = await handle.sweep();
      expect(swept).toEqual({ status: 'unchanged', timings: { invocationCheck: 0, promotion: 0, workerStatus: expect.any(Number), workerRoundTrip: expect.any(Number) } });
      frozenPlain(swept);
      if (swept.status !== 'unchanged' || !swept.timings) throw new Error(JSON.stringify(swept));
      expect(swept.timings.workerRoundTrip).toBeGreaterThan(0);
      expect(swept.timings.workerRoundTrip).toBeGreaterThanOrEqual(swept.timings.workerStatus!);
    } finally { await handle.dispose(); observation.cleanup(); }
  }), timeout);

  it('returns cancelled before starting a worker for an already aborted cold open', () => fixture(async (_root, inputs) => {
    expect(await openRetainedSession(inputs, { signal: AbortSignal.abort() })).toEqual({ status: 'cancelled' });
  }), timeout);
});

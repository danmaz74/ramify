import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Resident, unwrap } from './resident-driver.mjs';

export function compactStatus(status) {
  return { pid: status.pid, memory: status.memory, counters: status.counters, budgets: status.budgets,
    contexts: status.contexts.map(context => ({ token: context.token, level: context.level,
      state: context.state, session: context.session, retainedBytes: context.retainedBytes,
      history: context.history, pending: context.pending,
      published: context.published && { sequence: context.published.sequence,
        inputId: context.published.fingerprints.inputId, checked: { ...context.published.checked,
          files: undefined, fileCount: context.published.checked.files.length },
        timings: context.published.timings, outcome: context.published.outcome, summary: context.published.summary } })) };
}

function compactContext(context) {
  return { level: context.level, state: context.state, synchronization: context.synchronization,
    published: context.published?.sequence ?? null, pending: context.pending, history: context.history,
    retainedBytes: context.retainedBytes };
}

/** All operations use the installed client and production daemon. */
export class FastResident extends Resident {
  telemetry = [];
  telemetryErrors = [];
  async connect(start = 'if-needed') {
    const connection = await super.connect(start);
    if (!this.telemetryTimer) {
      let pending = false;
      this.telemetryTimer = setInterval(() => {
        if (pending || this.telemetryStopped) return;
        pending = true;
        this.pendingSample = (async () => {
          const started = performance.now();
          try {
            const status = unwrap(await this.connection.daemonStatus());
            let instrumentation = null;
            try { instrumentation = JSON.parse(await readFile(join(this.endpoint, 'measurement.json'), 'utf8')); }
            catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
            this.telemetry.push({ at: Date.now(), pollDurationMs: performance.now() - started,
              ...compactStatus(status), instrumentation: instrumentation && {
                at: instrumentation.at, workers: instrumentation.workers,
                workerCount: instrumentation.workerCount, compilerPids: instrumentation.compilerPids,
                compilerCount: instrumentation.compilerCount, helpers: instrumentation.helpers,
                activeSessions: instrumentation.activeSessions, files: instrumentation.files,
                watchers: instrumentation.watchers, timers: instrumentation.timers, totals: instrumentation.totals,
              } });
          } catch (error) { this.telemetryErrors.push(String(error)); }
          finally { pending = false; }
        })();
      }, 50);
    }
    return connection;
  }
  async context(token) { return unwrap(await this.connection.contextStatus({ token })); }
  async status() { return unwrap(await this.connection.daemonStatus()); }
  async published(token, after = 0) {
    const deadline = performance.now() + 600_000;
    const work = counters => counters.analyses - counters.sweeps - counters.audits;
    const start = work((await this.status()).counters);
    const idle = context => !context.pending.analysisRunning && !context.pending.changedPaths && !context.pending.requests;
    for (;;) {
      const current = await this.context(token);
      if (current.published?.sequence > after && !current.pending.analysisRunning && !current.pending.changedPaths) return current;
      assert.ok(performance.now() < deadline, 'Publication did not arrive within finite ten minute guard');
      if (idle(current)) {
        // An analysis that ran and settled without publishing will not publish later:
        // stop now rather than wait out the guard. Counters read on both sides of an
        // idle, unpublished snapshot with no analysis between them.
        const first = work((await this.status()).counters), again = await this.context(token);
        const second = work((await this.status()).counters);
        if (first > start && first === second && idle(again) && !(again.published?.sequence > after)) {
          throw new Error(`Context settled without publishing after ${first - start} analyses: ${JSON.stringify(compactContext(again))}`);
        }
      }
      if (!current.pending.analysisRunning && current.level === 'cold' && current.synchronization !== 'initializing') {
        throw new Error(`Context failed to publish: ${JSON.stringify(current)}`);
      }
      await delay(20);
    }
  }
  async delta(token, expect = [], freshness) {
    return unwrap(await this.connection.check({ token, requestId: randomUUID(), scope: 'delta', deadlineMs: 600_000,
      freshness: freshness ?? { mode: 'synchronized', expect } }));
  }
  async hook(project, expected) {
    const result = await this.cli(project, ['check', '--root', project.root, '--changed',
      ...expected.map(item => item.path), '--deadline', '600000', '--format', 'json']);
    let document = null;
    try { document = JSON.parse(result.stdout); } catch { /* Retain malformed output as failed evidence. */ }
    return { pid: result.pid, durationMs: result.durationMs, code: result.code, signal: result.signal,
      failure: result.failure, stderr: result.stderr, document,
      ...(document ? {} : { stdout: result.stdout }), samples: result.processes };
  }
  async quiet() {
    // Outside every timing: let late fs.watch delivery settle before the next save.
    await delay(250);
    return this.settled();
  }
  async cloneProbe() {
    const metrics = await this.metrics(), worker = metrics.workers[0];
    assert.ok(worker?.status, 'A real retained worker revision is required for the clone probe');
    const dataset = worker.cloneDataset;
    assert.ok(dataset, 'A recorded production revision is required');
    const request = { requestId: randomUUID(), workerId: worker.id,
      inputId: dataset.inputId, sequence: dataset.sequence };
    await writeFile(join(this.endpoint, 'clone-request.json'), JSON.stringify(request));
    process.kill(this.pid, 'SIGUSR2');
    const deadline = performance.now() + 120_000;
    for (;;) {
      try {
        const result = JSON.parse(await readFile(join(this.endpoint, 'clone-result.json'), 'utf8'));
        if (result.requestId === request.requestId) return result;
      } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      assert.ok(performance.now() < deadline, 'Revision array cloning did not finish within the finite probe guard');
      await delay(20);
    }
  }
  async dispose() {
    this.telemetryStopped = true;
    clearInterval(this.telemetryTimer);
    await this.pendingSample;
    return super.dispose();
  }
}

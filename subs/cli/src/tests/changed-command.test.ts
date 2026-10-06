import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { CheckParams } from '../../../../src/interfaces/service.js';
import type { ServiceConnector, DisconnectReason } from '../../../daemon/src/interfaces/daemon.js';
import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';
import type { CheckOutcome } from '../../../daemon/src/context-types.js';
import type { CheckDocument, CliEnvironment } from '../interfaces/cli.js';
import { formatChangedHuman } from '../format.js';
import { runCli } from '../run-cli.js';
import { exhaustedRecoveryWitness } from './exhausted-recovery.js';
import { changedCleanupWitness } from './changed-cleanup.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-changed-command-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nroot module fixture\n');
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
  await writeFile(join(root, 'src/main.ts'), 'export const value = 1;\n');
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
  return { root, quick, async dispose() { try { await quick.dispose(); } finally { await rm(root, { recursive: true, force: true }); } } };
}

async function command(root: string, connect: ServiceConnector, extra: readonly string[] = [], control: { signal?: AbortSignal } = {}, changed = 'src/main.ts') {
  const stdout: string[] = [], stderr: string[] = [];
  let batchCalls = 0;
  const environment: CliEnvironment = { cwd: root, version: '0', connect,
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
    batch: async () => { batchCalls++; throw new Error('Changed checks must never call batch'); } };
  const code = await runCli(['check', '--changed', changed, '--format', 'json', ...extra], environment, control);
  return { code, stdout, stderr, batchCalls, document: stdout.length ? JSON.parse(stdout[0]) as CheckDocument : null };
}

// Real compiler startup, updates and teardown need room under parallel regression.
// CLI deadlines and the controlled deadline assertions remain independent.
describe('changed check command', { timeout: 30_000 }, () => {
  it('hashes bytes once, deduplicates normalized paths and sends the compact synchronized contract through the quick service', async () => {
    const f = await fixture();
    try {
      const requests: CheckParams[] = [];
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection,
          check(params, control) { requests.push(params); return connected.connection.check(params, control); } } };
      };
      const stdout: string[] = [], stderr: string[] = [];
      const exit = await runCli(['check', '--changed', 'src/main.ts', './src/main.ts', '--format', 'json'], {
        cwd: f.root, version: '0', connect, stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
        batch: async () => { throw new Error('Unexpected batch'); },
      });
      // The client cannot classify: its first request names the normalized path once with
      // no classification and no content; the daemon's classification answer at the cold
      // revision asks for the source's content, which the second request carries.
      const sha256 = createHash('sha256').update('export const value = 1;\n').digest('hex');
      expect([exit, requests.length, stdout.length, stderr]).toEqual([0, 2, 1, []]);
      expect(requests[0]).toMatchObject({ scope: 'delta', deadlineMs: 2_000, paths: ['src/main.ts'], classification: null,
        freshness: { mode: 'synchronized', expect: [] } });
      expect(requests[1]).toMatchObject({ scope: 'delta', paths: ['src/main.ts'], classification: 1,
        freshness: { mode: 'synchronized', expect: [{ path: 'src/main.ts', sha256 }] } });
      expect(requests[1].deadlineMs).toBeLessThanOrEqual(2_000);
      const output = JSON.parse(stdout[0]) as CheckDocument;
      expect(output).toMatchObject({ schemaVersion: 'ramify.check/3', root: f.root, outcome: 'checked', reason: null,
        execution: 'completed', exitCode: 0, findings: [],
        paths: [{ path: 'src/main.ts', disposition: 'checked', module: 'fixture', exclusion: null, reason: 'content', sha256 }] });
      expect(output.revision?.path).toBe('cold');
      expect(output.timings.totalMs).toBeGreaterThanOrEqual(output.timings.waitedMs);
    } finally { await f.dispose(); }
  });

  it('retains the original hash across recovery and reports an intervening write as superseded', async () => {
    const f = await fixture();
    try {
      expect((await command(f.root, f.quick.connect, ['--deadline', '5000'])).code).toBe(0);
      await writeFile(join(f.root, 'src/main.ts'), 'export const value = 2;\n');
      let failed = false, recovered = false, recoveries = 0;
      const requests: CheckParams[] = [];
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        const connection = connected.connection;
        return { ...connected, connection: { ...connection,
          get reason(): DisconnectReason | null { return failed && !recovered ? { kind: 'failure', message: 'Injected lost response' } : null; },
          async check(params, control) {
            requests.push(params);
            // The response lost is the first one to a request carrying the hashed content.
            if (!failed && params.freshness.mode === 'synchronized' && params.freshness.expect.length) {
              failed = true; await writeFile(join(f.root, 'src/main.ts'), 'export const value = 3;\n'); throw new Error('Lost response');
            }
            return connection.check(params, control);
          },
          async recover() { recoveries++; recovered = true;
            return { status: 'recovered', instance: connection.daemon.instance, restarted: false }; },
        } };
      };
      const result = await command(f.root, connect, ['--deadline', '5000']);
      // The classification answer, the hashed request whose response is lost, and its retry.
      expect([result.code, result.batchCalls, result.stderr, recoveries, requests.length]).toEqual([2, 0, [], 1, 3]);
      expect(requests[0].freshness).toEqual({ mode: 'synchronized', expect: [] });
      expect(requests[2].freshness).toEqual(requests[1].freshness);
      expect(requests[1].freshness).toEqual({ mode: 'synchronized', expect: [{ path: 'src/main.ts',
        sha256: createHash('sha256').update('export const value = 2;\n').digest('hex') }] });
      expect(result.document).toMatchObject({ outcome: 'not-checked', reason: 'superseded', exitCode: 2,
        paths: [{ path: 'src/main.ts', disposition: 'not-checked', module: 'fixture', exclusion: null, reason: 'superseded' }] });
      expect(result.document?.paths[0]).not.toHaveProperty('sha256');
    } finally { await f.dispose(); }
  });

  it.each(['cold', 'deadline-exceeded'] as const)('maps a real controlled %s deadline without cancelling the context work', async reason => {
    const f = await fixture();
    try {
      if (reason === 'deadline-exceeded') {
        expect((await command(f.root, f.quick.connect, ['--deadline', '5000'])).code).toBe(0);
        await writeFile(join(f.root, 'src/main.ts'), 'export const value = 2;\n');
      }
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection,
          async check(params, control) {
            const pending = connected.connection.check(params, control);
            await f.quick.clock.advance(2);
            return pending;
          },
        } };
      };
      const result = await command(f.root, connect, ['--deadline', '1']);
      expect([result.code, result.batchCalls, result.stderr]).toEqual([2, 0, []]);
      expect(result.document).toMatchObject({ outcome: 'not-checked', reason, checked: null,
        paths: [{ path: 'src/main.ts', disposition: 'not-checked', exclusion: null, reason }] });
      const next = await command(f.root, f.quick.connect, ['--deadline', '5000']);
      expect(next.document?.outcome).toBe('checked');
    } finally { await f.dispose(); }
  });

  it.each(['failure', 'incompatible', 'explicit-stop'] as const)('keeps %s connections explicit with one compact document and no batch', async kind => {
    const reason: DisconnectReason = kind === 'failure' ? { kind, message: 'failed startup' }
      : kind === 'incompatible' ? { kind, client: 'ramify.ipc/2', daemon: 'ramify.ipc/0' } : { kind, requestId: null };
    const result = await command('/project', async () => ({ status: 'unavailable', attempts: 3, reason, message: 'Unavailable' }));
    expect([result.code, result.stdout.length, result.stderr, result.batchCalls]).toEqual([2, 1, [], 0]);
    expect(result.document).toMatchObject({ schemaVersion: 'ramify.check/3', outcome: 'not-checked',
      reason: kind === 'failure' ? 'unavailable' : kind === 'explicit-stop' ? 'stopped' : 'incompatible', exitCode: 2 });
  });

  it.each(['unavailable', 'stopped', 'incompatible'] as const)('keeps exhausted in-flight recovery %s explicit and releases the real quick-service lease', async reason => {
    await exhaustedRecoveryWitness(reason);
  });

  it.each(['close-context', 'close-connection'] as const)('preserves received findings when %s cleanup fails', async fault => {
    await changedCleanupWitness(fault);
  });

  it('closes the acquired connection when cancellation arrives as connect completes', async () => {
    await changedCleanupWitness('cancel-connect');
  });

  it.each(['cancel-close-context', 'cancel-close-connection'] as const)('honors %s after cleanup without delivering the received result', async fault => {
    await changedCleanupWitness(fault);
  });

  it('defends the completed-result boundary against a reply without covering freshness', async () => {
    const f = await fixture();
    try {
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection,
          async check(params, control) {
            const response = await connected.connection.check(params, control);
            if (!response.ok || response.value.status !== 'reported') return response;
            const value: CheckOutcome = { ...response.value, freshness: { ...response.value.freshness, verified: false } };
            return { ok: true, value };
          },
        } };
      };
      const result = await command(f.root, connect, ['--deadline', '5000']);
      expect([result.code, result.document?.reason, result.document?.paths[0].disposition, result.document?.paths[0].reason])
        .toEqual([2, 'incomplete', 'not-checked', 'incomplete']);
    } finally { await f.dispose(); }
  });

  it('publishes an invalid description as a covering revision and exits 1 with its diagnostics', async () => {
    const f = await fixture();
    try {
      expect((await command(f.root, f.quick.connect, ['--deadline', '5000'])).code).toBe(0);
      await writeFile(join(f.root, 'module.ramify'), 'ramify 1\nroot module fixture\nexpose-src\n');
      const result = await command(f.root, f.quick.connect, ['--deadline', '5000'], {}, 'module.ramify');
      expect([result.code, result.batchCalls, result.stderr]).toEqual([1, 0, []]);
      expect(result.document).toMatchObject({ outcome: 'checked', execution: 'invalid', reason: null,
        paths: [{ path: 'module.ramify', disposition: 'checked', exclusion: null, reason: 'content',
          sha256: createHash('sha256').update('ramify 1\nroot module fixture\nexpose-src\n').digest('hex') }], exitCode: 1 });
      expect(result.document?.findings.length).toBeGreaterThan(0);
      expect(result.document?.findings.some(finding => finding.new)).toBe(true);
    } finally { await f.dispose(); }
  });

  it.each(['incomplete', 'unavailable'] as const)('renders an injected unpublished %s engine reply without claiming coverage', async execution => {
    const f = await fixture();
    try {
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection,
          async check(params, control) {
            // A plain report request obtains a real report; its paths would ask for a classification first.
            const { paths: _paths, classification: _classification, ...plain } = params;
            const response = await connected.connection.check({ ...plain, scope: 'report' }, control);
            if (!response.ok || response.value.status !== 'reported' || !response.value.report) throw new Error('Expected a report to exercise failure rendering');
            const value: CheckOutcome = { status: 'reported', requestId: params.requestId, published: false,
              revision: null, delta: null, freshness: response.value.freshness,
              report: { ...response.value.report, snapshot: null,
                outcome: { execution, check: 'not-run', coverage: 'partial' },
                diagnostics: [{ id: 'engine:missing-stage', code: 'missing-stage', category: 'execution',
                  message: 'Engine did not complete its required stage', location: null, related: [], importer: null, original: null, accessId: null }] } };
            return { ok: true, value };
          },
        } };
      };
      const result = await command(f.root, connect, ['--deadline', '5000']);
      expect([result.code, result.batchCalls, result.stdout.length, result.stderr]).toEqual([2, 0, 1, []]);
      expect(result.document).toMatchObject({ outcome: 'not-checked', reason: execution, execution, revision: null,
        paths: [{ path: 'src/main.ts', disposition: 'not-checked', module: null, exclusion: null, reason: execution }],
        findings: [{ code: 'missing-stage', new: false }], exitCode: 2 });
    } finally { await f.dispose(); }
  });

  it('timing-fields: the JSON document carries the reply timings only when the reply has them, and human output is unchanged', async () => {
    const f = await fixture();
    try {
      const replies: CheckOutcome[] = [];
      let strip = false;
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection,
          async check(params, control) {
            const response = await connected.connection.check(params, control);
            if (!response.ok || response.value.status !== 'reported') return response;
            replies.push(response.value);
            if (!strip) return response;
            const { timings: _timings, ...value } = response.value;
            return { ok: true, value };
          },
        } };
      };
      const timed = await command(f.root, connect, ['--deadline', '5000']);
      const reply = replies[0]?.status === 'reported' ? replies[0].timings : undefined;
      expect(reply).toMatchObject({ invocationCheck: expect.any(Number), workerStatus: expect.any(Number),
        workerRoundTrip: expect.any(Number), publication: expect.any(Number), service: expect.any(Number) });
      expect(timed.document).toMatchObject({ outcome: 'checked', exitCode: 0 });
      expect(Object.keys(timed.document!.timings)).toEqual(['daemon', 'waitedMs', 'totalMs', 'reply']);
      expect(timed.document!.timings.reply).toEqual(reply);
      const { reply: _reply, ...without } = timed.document!.timings;
      expect(formatChangedHuman(timed.document!)).toBe(formatChangedHuman({ ...timed.document!, timings: without }));
      strip = true;
      const untimed = await command(f.root, connect, ['--deadline', '5000']);
      expect(untimed.document).toMatchObject({ outcome: 'checked', exitCode: 0 });
      expect(Object.keys(untimed.document!.timings)).toEqual(['daemon', 'waitedMs', 'totalMs']);
    } finally { await f.dispose(); }
  });

  it('full-report-on-request: a resident JSON report equals the batch JSON report', async () => {
    const f = await fixture();
    try {
      const run = async (argv: readonly string[]) => {
        const stdout: string[] = [];
        const code = await runCli([...argv], { cwd: f.root, version: '0', connect: f.quick.connect, batch: f.quick.batch,
          stdout: value => { stdout.push(value); }, stderr: () => {} });
        expect([code, stdout.length]).toEqual([0, 1]);
        return { ...(JSON.parse(stdout[0]!) as AnalysisReport), runId: null };
      };
      const resident = await run(['check', '--format', 'json']);
      expect(resident.snapshot).not.toBeNull();
      const batch = await run(['check', '--batch', '--format', 'json']);
      // The two invocations echo the same request with differently ordered project keys.
      expect(resident.request).toEqual(batch.request);
      expect(JSON.stringify({ ...resident, request: null })).toBe(JSON.stringify({ ...batch, request: null }));
    } finally { await f.dispose(); }
  });

  it('configuration-answered-at-once: a named configuration file exits 2 at once, a following source hook is checked, and --batch still runs the whole check', async () => {
    const f = await fixture();
    try {
      const warm = await command(f.root, f.quick.connect);
      expect([warm.code, warm.document?.outcome]).toEqual([0, 'checked']);
      await writeFile(join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2021', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
      const configuration = await command(f.root, f.quick.connect, [], {}, 'tsconfig.json');
      expect([configuration.code, configuration.batchCalls, configuration.stderr]).toEqual([2, 0, []]);
      expect(configuration.document).toMatchObject({ outcome: 'not-checked', reason: 'configuration-changed', exitCode: 2,
        revision: null, execution: null, findings: [], checked: null,
        paths: [{ path: 'tsconfig.json', disposition: 'not-checked', module: 'fixture', exclusion: null, reason: 'configuration-changed' }] });
      expect(formatChangedHuman(configuration.document!)).toContain('Path tsconfig.json: not checked (configuration-changed; module fixture)\n'
        + 'Outcome: not checked (configuration-changed; 0 checked, 0 not analyzed, 1 not checked); checked set: none;');
      // The next hook waits for the revision the configuration edit queued.
      await writeFile(join(f.root, 'src/main.ts'), 'export const value = 2;\n');
      const source = await command(f.root, f.quick.connect);
      expect([source.code, source.batchCalls, source.stderr]).toEqual([0, 0, []]);
      expect(source.document).toMatchObject({ outcome: 'checked', reason: null, execution: 'completed',
        paths: [{ path: 'src/main.ts', disposition: 'checked', module: 'fixture', reason: 'content',
          sha256: createHash('sha256').update('export const value = 2;\n').digest('hex') }] });
      // A batch check of the same edit is unchanged: it runs its own session and reports in full.
      const stdout: string[] = [];
      const code = await runCli(['check', '--batch', '--format', 'json'], { cwd: f.root, version: '0',
        connect: async () => { throw new Error('A batch check must not connect'); }, batch: f.quick.batch,
        stdout: value => { stdout.push(value); }, stderr: () => {} });
      expect([code, stdout.length]).toEqual([0, 1]);
      const report = JSON.parse(stdout[0]!) as AnalysisReport;
      expect(report.outcome).toMatchObject({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect(report.snapshot).not.toBeNull();
    } finally { await f.dispose(); }
  });

  it('returns 130 on interruption before connection without a result document', async () => {
    const result = await command('/project', async () => { throw new Error('Must not connect'); }, [], { signal: AbortSignal.abort() });
    expect([result.code, result.stdout, result.batchCalls]).toEqual([130, [], 0]);
  });
});

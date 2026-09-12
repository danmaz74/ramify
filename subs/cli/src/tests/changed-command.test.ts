import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { CheckParams } from '../../../../src/interfaces/service.js';
import type { ServiceConnector, DisconnectReason } from '../../../daemon/src/interfaces/daemon.js';
import type { CheckOutcome } from '../../../daemon/src/context-types.js';
import type { CheckDocument, CliEnvironment } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-changed-command-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
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

describe('changed check command', () => {
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
      expect([exit, requests.length, stdout.length, stderr]).toEqual([0, 1, 1, []]);
      expect(requests[0]).toMatchObject({ scope: 'delta', deadlineMs: 2_000,
        freshness: { mode: 'synchronized', expect: [{ path: 'src/main.ts', sha256: createHash('sha256').update('export const value = 1;\n').digest('hex') }] } });
      const output = JSON.parse(stdout[0]) as CheckDocument;
      expect(output).toMatchObject({ schemaVersion: 'ramify.check/1', root: f.root, outcome: 'checked', reason: null,
        execution: 'completed', exitCode: 0, findings: [], changed: [{ path: 'src/main.ts', covered: true }] });
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
            if (!failed) { failed = true; await writeFile(join(f.root, 'src/main.ts'), 'export const value = 3;\n'); throw new Error('Lost response'); }
            return connection.check(params, control);
          },
          async recover() { recoveries++; recovered = true;
            return { status: 'recovered', instance: connection.daemon.instance, restarted: false }; },
        } };
      };
      const result = await command(f.root, connect, ['--deadline', '5000']);
      expect([result.code, result.batchCalls, result.stderr, recoveries, requests.length]).toEqual([2, 0, [], 1, 2]);
      expect(requests[1].freshness).toEqual(requests[0].freshness);
      expect(result.document).toMatchObject({ outcome: 'not-checked', reason: 'superseded', exitCode: 2,
        changed: [{ covered: false }] });
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
      expect(result.document).toMatchObject({ outcome: 'not-checked', reason, checked: null, changed: [{ covered: false }] });
      const next = await command(f.root, f.quick.connect, ['--deadline', '5000']);
      expect(next.document?.outcome).toBe('checked');
    } finally { await f.dispose(); }
  });

  it.each(['failure', 'incompatible', 'explicit-stop'] as const)('keeps %s connections explicit with one compact document and no batch', async kind => {
    const reason: DisconnectReason = kind === 'failure' ? { kind, message: 'failed startup' }
      : kind === 'incompatible' ? { kind, client: 'ramify.ipc/1', daemon: 'ramify.ipc/2' } : { kind, requestId: null };
    const result = await command('/project', async () => ({ status: 'unavailable', attempts: 3, reason, message: 'Unavailable' }));
    expect([result.code, result.stdout.length, result.stderr, result.batchCalls]).toEqual([2, 1, [], 0]);
    expect(result.document).toMatchObject({ schemaVersion: 'ramify.check/1', outcome: 'not-checked',
      reason: kind === 'failure' ? 'unavailable' : kind === 'explicit-stop' ? 'stopped' : 'incompatible', exitCode: 2 });
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
      expect([result.code, result.document?.reason, result.document?.changed[0].covered]).toEqual([2, 'incomplete', false]);
    } finally { await f.dispose(); }
  });

  it('publishes an invalid description as a covering revision and exits 1 with its diagnostics', async () => {
    const f = await fixture();
    try {
      expect((await command(f.root, f.quick.connect, ['--deadline', '5000'])).code).toBe(0);
      await writeFile(join(f.root, 'module.ramify'), 'ramify 1\nmodule fixture\nexpose-src\n');
      const result = await command(f.root, f.quick.connect, ['--deadline', '5000'], {}, 'module.ramify');
      expect([result.code, result.batchCalls, result.stderr]).toEqual([1, 0, []]);
      expect(result.document).toMatchObject({ outcome: 'checked', execution: 'invalid', reason: null,
        changed: [{ path: 'module.ramify', covered: true }], exitCode: 1 });
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
            const response = await connected.connection.check({ ...params, scope: 'report' }, control);
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
        changed: [{ covered: false }], findings: [{ code: 'missing-stage', new: false }], exitCode: 2 });
    } finally { await f.dispose(); }
  });

  it('returns 130 on interruption before connection without a result document', async () => {
    const result = await command('/project', async () => { throw new Error('Must not connect'); }, [], { signal: AbortSignal.abort() });
    expect([result.code, result.stdout, result.batchCalls]).toEqual([130, [], 0]);
  });
});

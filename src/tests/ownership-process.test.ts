import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withRecoverySmall, recoverySmallPaths } from '../../subs/analysis/src/tests/recovery-fixtures.js';
import { ownershipDocumentSchema } from '../../subs/cli/src/index.js';
import { checkDocumentSchema, cliFailureDocumentSchema } from '../../subs/cli/src/tests/response-schema.js';
import { cliProcess, repositoryRoot } from './process.js';

const launcher = join(repositoryRoot, 'dist/src/ramify');

async function command(root: string, endpoint: string, args: readonly string[], timeoutMs = 60_000) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(launcher, args, { cwd: root, env: { ...process.env, NODE_OPTIONS: '', RAMIFY_ENDPOINT_DIR: endpoint },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', value => { stdout += String(value); });
    child.stderr.on('data', value => { stderr += String(value); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); expired ? reject(new Error(`CLI deadline: ${args.join(' ')}`))
      : resolve({ code, stdout, stderr }); });
  });
}

async function views(root: string, directory: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const base = join(root, directory);
  let entries;
  try { entries = await readdir(base, { recursive: true, withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return snapshot; throw error; }
  for (const entry of entries) if (entry.isFile()) {
    const full = join(entry.parentPath, entry.name);
    snapshot.set(full.slice(root.length + 1), createHash('sha256').update(await readFile(full)).digest('hex'));
  }
  return snapshot;
}

async function apiViews(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.parentPath.includes('/.ramify/')) continue;
    const full = join(entry.parentPath, entry.name);
    snapshot.set(full.slice(root.length + 1), createHash('sha256').update(await readFile(full)).digest('hex'));
  }
  return snapshot;
}

describe('FR19 FR23 FR24 installed recovery process', { timeout: 240_000 }, () => {
  it('keeps current diagnostics and both generated views through A/B/C/D without resetting the daemon', async () =>
    withRecoverySmall(async fixture => {
      const endpoint = await realpath(await mkdtemp('/tmp/rrp7-'));
      let ownedPid: number | undefined;
      const run = (args: readonly string[]) => command(fixture.root, endpoint, args);
      const changed = async (path: string) => {
        const result = await run(['check', '--changed', path, '--deadline', '30000', '--format', 'json']);
        return { ...result, document: checkDocumentSchema.parse(JSON.parse(result.stdout)) };
      };
      try {
        const ownership = await run(['ownership', '--path', recoverySmallPaths.provider, '--format', 'json']);
        expect(ownership.code).toBe(0);
        expect(ownershipDocumentSchema.parse(JSON.parse(ownership.stdout)).status).toBe('answered');
        expect(await readdir(endpoint)).toEqual([]);

        const a = await changed(recoverySmallPaths.provider);
        expect([a.code, a.document.execution, a.document.recovery]).toEqual([0, 'completed', undefined]);
        const status = JSON.parse((await run(['daemon', 'status', '--format', 'json'])).stdout);
        ownedPid = status.status.pid;
        expect(Number.isInteger(ownedPid)).toBe(true);
        expect((await run(['materialize', '--all'])).code).toBe(0);
        expect((await run(['materialize', '--view', 'architect'])).code).toBe(0);
        const aApi = await apiViews(fixture.root), aArchitect = await views(fixture.root, '.ramify-architect');
        expect(aApi.size).toBeGreaterThan(0);
        expect(aArchitect.size).toBeGreaterThan(0);

        await fixture.removeExports();
        const b = await changed(recoverySmallPaths.provider);
        expect([b.code, b.document.execution, b.document.recovery?.lastCompleted?.revision]).toEqual([1, 'invalid', a.document.revision?.id]);
        const missing = b.document.findings.filter(item => item.code === 'missing-export');
        expect(missing).toHaveLength(2);
        expect(missing.every(item => item.id && item.location?.file === recoverySmallPaths.providerDescription)).toBe(true);
        expect(b.document.stages?.find(item => item.stage === 'link')?.diagnosticIds).toEqual(missing.map(item => item.id));
        const independent = ownershipDocumentSchema.parse(JSON.parse((await run(['ownership', '--path', recoverySmallPaths.provider, '--format', 'json'])).stdout));
        expect(independent.status).toBe('answered');
        const affected = await run(['affected', '--path', recoverySmallPaths.provider, '--format', 'json']);
        expect(affected.code).toBe(1);
        const refusal = cliFailureDocumentSchema.parse(JSON.parse(affected.stdout));
        expect(refusal.recovery?.lastCompleted?.revision).toBe(a.document.revision?.id);
        expect(refusal.diagnostics.slice(1)).toEqual(missing.map(({ new: _new, ...item }) => item));
        expect((await run(['materialize', '--all'])).code).toBe(2);
        expect((await run(['materialize', '--view', 'architect'])).code).toBe(2);
        expect(await apiViews(fixture.root)).toEqual(aApi);
        expect(await views(fixture.root, '.ramify-architect')).toEqual(aArchitect);

        await fixture.write(recoverySmallPaths.consumer, "import { second } from '../../provider/src/api.js';\nvoid second;\n");
        const c = await changed(recoverySmallPaths.consumer);
        expect([c.code, c.document.execution, c.document.recovery?.lastCompleted?.revision]).toEqual([1, 'invalid', a.document.revision?.id]);
        expect(c.document.recovery?.changes.paths).toEqual([recoverySmallPaths.consumer, recoverySmallPaths.provider]);
        expect(await apiViews(fixture.root)).toEqual(aApi);
        expect(await views(fixture.root, '.ramify-architect')).toEqual(aArchitect);

        const residentCancelled = await cliProcess(fixture.root,
          ['check', '--changed', recoverySmallPaths.consumer, '--deadline', '30000', '--format', 'json'], {
            mode: 'interrupt-resident-check', allowSockets: true, env: { RAMIFY_ENDPOINT_DIR: endpoint }, timeoutMs: 30_000 });
        expect([residentCancelled.code, residentCancelled.stdout, residentCancelled.survivingChildren]).toEqual([130, '', []]);
        expect(residentCancelled.events).toEqual(expect.arrayContaining([
          expect.objectContaining({ event: 'barrier', stage: 'resident-check' }),
          expect.objectContaining({ event: 'wire-cancel' }),
        ]));

        await fixture.write(recoverySmallPaths.providerDescription, 'ramify 1\nmodule provider\nexpose-src\n');
        const reportless = await run(['measure', '--format', 'json']);
        expect(reportless.code).toBe(2);
        const failure = cliFailureDocumentSchema.parse(JSON.parse(reportless.stdout));
        expect(failure.recovery?.lastCompleted?.revision).toBe(a.document.revision?.id);
        expect(failure.diagnostics.some(item => 'location' in item
          && item.location?.file === recoverySmallPaths.providerDescription)).toBe(true);
        await fixture.write(recoverySmallPaths.providerDescription,
          'ramify 1\nmodule provider\nexpose-src first, second from "api.ts" to parent\n');

        const cancelled = await cliProcess(fixture.root, ['check', '--batch', '--format', 'json'], {
          mode: 'interrupt-acquisition', readTarget: join(fixture.root, recoverySmallPaths.provider),
          env: { RAMIFY_ENDPOINT_DIR: endpoint }, timeoutMs: 30_000 });
        expect([cancelled.code, cancelled.stdout, cancelled.survivingChildren]).toEqual([130, '', []]);

        await fixture.write(recoverySmallPaths.provider, 'export const first: number = 3;\nexport const second: number = 2;\nexport const third: number = 3;\n');
        await fixture.write(recoverySmallPaths.providerDescription,
          'ramify 1\nmodule provider\nexpose-src first, second, third from "api.ts" to parent\n');
        const d = await changed(recoverySmallPaths.provider);
        expect([d.code, d.document.execution, d.document.recovery]).toEqual([0, 'completed', undefined]);
        expect((await run(['daemon', 'status', '--format', 'json'])).stdout).toContain(`"pid":${ownedPid}`);
        expect((await run(['materialize', '--all'])).code).toBe(0);
        expect((await run(['materialize', '--view', 'architect'])).code).toBe(0);
        expect(await apiViews(fixture.root)).not.toEqual(aApi);
        expect(await views(fixture.root, '.ramify-architect')).not.toEqual(aArchitect);
      } finally {
        try { await run(['daemon', 'stop']); } finally {
          if (ownedPid) {
            try { process.kill(ownedPid, 0); throw new Error(`Owned daemon ${ownedPid} survived stop`); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
          }
          await rm(endpoint, { recursive: true, force: true });
        }
      }
    }));
});

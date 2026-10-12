import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withRecoverySmall, recoverySmallPaths } from '../../subs/analysis/src/tests/recovery-fixtures.js';
import { checkDocumentSchema, cliFailureDocumentSchema } from '../../subs/cli/src/tests/response-schema.js';
import { ownershipDocumentSchema } from '../../subs/cli/src/ownership-schema.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import { runAffectedBatch, runBatch, runOwnershipBatch } from '../batch.js';
import { createQuickEnvironment, type QuickEnvironment } from './quick-environment.js';

async function invoke(quick: QuickEnvironment, root: string, args: readonly string[]) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runCli(args, { cwd: root, version: '0.4.3',
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
    connect: quick.connect, batch: runBatch, affectedBatch: runAffectedBatch, ownershipBatch: runOwnershipBatch });
  return { exit, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length };
}

async function generatedViews(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.parentPath.includes('/.ramify/')) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(full.slice(root.length + 1), await readFile(full, 'utf8'));
  }
  return files;
}

describe('FR04 FR12 FR13 FR20–FR23 CLI forward repair', { timeout: 90_000 }, () => {
  it('retains A views through invalid B/C, answers independent ownership, and publishes completed D', async () => withRecoverySmall(async fixture => {
    const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
    try {
      const changed = (path: string) => invoke(quick, fixture.root,
        ['check', '--changed', path, '--deadline', '10000', '--format', 'json']);
      const a = checkDocumentSchema.parse(JSON.parse((await changed(recoverySmallPaths.provider)).stdout));
      expect([a.exitCode, a.execution, a.recovery]).toEqual([0, 'completed', undefined]);
      const aReport = JSON.parse((await invoke(quick, fixture.root, ['check', '--format', 'json'])).stdout);
      expect(aReport.schemaVersion).toBe('ramify.analysis/3');
      expect(aReport).not.toHaveProperty('recovery');
      expect((await invoke(quick, fixture.root, ['materialize', '--all'])).exit).toBe(0);
      const aViews = await generatedViews(fixture.root);
      expect(aViews.size).toBeGreaterThan(0);

      await fixture.removeExports();
      const b = checkDocumentSchema.parse(JSON.parse((await changed(recoverySmallPaths.provider)).stdout));
      expect([b.exitCode, b.execution, b.recovery?.lastCompleted?.revision]).toEqual([1, 'invalid', a.revision?.id]);
      expect(b.findings.filter(item => item.code === 'missing-export')).toHaveLength(2);
      expect(b.stages?.find(item => item.stage === 'link')?.diagnosticIds).toEqual(
        b.findings.filter(item => item.code === 'missing-export').map(item => item.id));
      const bHuman = await invoke(quick, fixture.root, ['check', '--changed', recoverySmallPaths.provider]);
      expect(bHuman.stdout).toMatch(/^Check failed \(invalid-project\)\./);
      expect(bHuman.stdout).toContain('subs/provider/module.ramify:3:');
      const bBatch = JSON.parse((await invoke(quick, fixture.root, ['check', '--batch', '--format', 'json'])).stdout);
      expect(bBatch.schemaVersion).toBe('ramify.analysis/3');
      expect(bBatch.diagnostics.filter((item: { code: string }) => item.code === 'missing-export')).toHaveLength(2);
      expect(bBatch).not.toHaveProperty('recovery');
      const bOwnership = ownershipDocumentSchema.parse(JSON.parse((await invoke(quick, fixture.root,
        ['ownership', '--format', 'json', '--path', recoverySmallPaths.provider])).stdout));
      expect(bOwnership.status).toBe('answered');
      expect(bOwnership).not.toHaveProperty('recovery');
      const bAffected = cliFailureDocumentSchema.parse(JSON.parse((await invoke(quick, fixture.root,
        ['affected', '--path', recoverySmallPaths.provider, '--format', 'json'])).stdout));
      expect(bAffected.exitCode).toBe(1);
      expect(bAffected.diagnostics.slice(1)).toEqual(b.findings.map(({ new: _new, ...item }) => item));
      expect(bAffected.recovery?.lastCompleted?.revision).toBe(a.revision?.id);
      const bMaterialize = await invoke(quick, fixture.root, ['materialize', '--all']);
      expect(bMaterialize.exit).toBe(2);
      expect(bMaterialize.stdout).toMatch(/^Materialize failed /);
      expect(bMaterialize.stdout).toContain('subs/provider/module.ramify:3:');
      expect(bMaterialize.stdout).toContain('Observed history:');
      expect(await generatedViews(fixture.root)).toEqual(aViews);

      await fixture.write(recoverySmallPaths.consumer, "import { second } from '../../provider/src/api.js';\nvoid second;\n");
      const c = checkDocumentSchema.parse(JSON.parse((await changed(recoverySmallPaths.consumer)).stdout));
      expect([c.exitCode, c.execution, c.recovery?.lastCompleted?.revision]).toEqual([1, 'invalid', a.revision?.id]);
      expect(c.recovery?.changes.paths).toEqual([recoverySmallPaths.consumer, recoverySmallPaths.provider]);
      expect((await invoke(quick, fixture.root, ['materialize', '--all'])).exit).toBe(2);
      expect(await generatedViews(fixture.root)).toEqual(aViews);

      await fixture.write(recoverySmallPaths.provider,
        'export const first: string = "repaired";\nexport const second: number = 2;\n');
      const d = checkDocumentSchema.parse(JSON.parse((await changed(recoverySmallPaths.provider)).stdout));
      expect([d.exitCode, d.execution, d.recovery]).toEqual([0, 'completed', undefined]);
      expect((await invoke(quick, fixture.root, ['materialize', '--all'])).exit).toBe(0);
      expect(await generatedViews(fixture.root)).not.toEqual(aViews);

      await fixture.write('module.ramify', 'ramify 1\nroot module recovery\n');
      const failedCheck = checkDocumentSchema.parse(JSON.parse((await changed('module.ramify')).stdout));
      expect([failedCheck.exitCode, failedCheck.execution, failedCheck.recovery]).toEqual([1, 'completed', undefined]);
      expect(failedCheck.findings.some(item => item.code === 'not-visible')).toBe(true);
      const status = await quick.service.daemonStatus();
      if (!status.ok) throw new Error('Expected daemon status');
      expect(status.value.connections).toBe(0);
    } finally { await quick.dispose(); }
  }));

  it('FR16 FR20 starts invalid with unavailable history and omits it before context creation', async () => withRecoverySmall(async fixture => {
    await fixture.removeExports();
    const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
    try {
      const invalid = await invoke(quick, fixture.root,
        ['check', '--changed', recoverySmallPaths.provider, '--deadline', '10000', '--format', 'json']);
      const document = checkDocumentSchema.parse(JSON.parse(invalid.stdout));
      expect([invalid.exit, document.execution, document.recovery?.lastCompleted,
        document.recovery?.changes.coverage]).toEqual([2, 'invalid', null, 'unavailable']);
      expect(document.recovery?.changes.reason).toContain('no-completed-baseline');
      const invocation = await invoke(quick, fixture.root,
        ['ownership', '--path', 'src/../bad.ts', '--format', 'json']);
      const failure = cliFailureDocumentSchema.parse(JSON.parse(invocation.stdout));
      expect([invocation.exit, failure.exitCode, failure.diagnostics[0]?.category]).toEqual([2, 2, 'invocation']);
      expect(failure).not.toHaveProperty('recovery');
      const cancelled = await runCli(['check', '--changed', recoverySmallPaths.provider, '--format', 'json'],
        { cwd: fixture.root, version: '0.4.3', connect: quick.connect, batch: runBatch,
          stdout: () => { throw new Error('Cancellation must not write a result'); }, stderr: () => {} },
        { signal: AbortSignal.abort() });
      expect(cancelled).toBe(130);
    } finally { await quick.dispose(); }
  }));
});

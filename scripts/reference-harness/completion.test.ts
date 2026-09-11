import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TraceEvent } from '../../src/tests/process.js';
import { assertClientClosure } from './completion-cases.js';
import { withSequenceProcess } from './equivalence-process.js';
import { captureObservations } from './observations.js';
import { repositoryRoot } from './plan.js';
import { Assertions } from './runner.js';

describe('completion evidence controls', () => {
  const installed = '/tmp/consumer/node_modules/ramify.ts', consumer = '/tmp/consumer';
  const preload = '/tmp/toolkit/src/tests/process-probe.mjs';
  const load = (path: string): TraceEvent => ({ pid: 123, event: 'load', url: pathToFileURL(path).href });
  const baseline: TraceEvent[] = [load(preload), load(join(consumer, '[eval1]')), { pid: 123, event: 'load', url: 'node:net' },
    ...['client-entry', 'connect-daemon', 'connection', 'codec', 'discovery', 'records', 'launcher']
      .map(name => load(join(installed, `dist/subs/daemon/src/${name}.js`)))];
  it('accepts the reviewed closure and rejects missing, foreign, engine, host and context loads', () => {
    expect(assertClientClosure(baseline, installed, preload, consumer, new Assertions())).toHaveLength(7);
    expect(() => assertClientClosure([], installed, preload, consumer, new Assertions())).toThrow();
    for (const path of ['subs/daemon/src/host.js', 'subs/daemon/subs/contexts/src/manager.js',
      'subs/analysis/src/index.js', '../node_modules/typescript/index.js', '/outside/client-entry.js']) {
      expect(() => assertClientClosure([...baseline, load(join(installed, 'dist', path))], installed, preload, consumer, new Assertions())).toThrow();
    }
    expect(() => assertClientClosure([...baseline, { pid: 123, event: 'load', url: 'data:text/javascript,export default 1' }],
      installed, preload, consumer, new Assertions())).toThrow();
  });
  it.each(['spawn', 'other-launch', 'connect', 'listen', 'bind'] as const)('rejects import-time %s side effects', event => {
    expect(() => assertClientClosure([...baseline, { pid: 123, event }], installed, preload, consumer, new Assertions())).toThrow();
  });
  it('uses a supplied executable and retains failure and cleanup evidence without another installation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ri14-test-'));
    try {
      const captured = await captureObservations(async () => {
        try {
          await withSequenceProcess(async processes => {
            const help = await processes.run(directory, ['--help']);
            expect([help.code, help.error, help.stderr]).toEqual([0, null, '']);
            expect(help.stdout).toContain('Usage: ramify check');
            throw new Error('completion fixture intentional failure');
          }, { executable: join(repositoryRoot, 'dist/src/cli-entry.js'), cwd: directory,
            preload: join(repositoryRoot, 'src/tests/process-probe.mjs'), environment: process.env });
          throw new Error('Lost the intentional failure');
        } catch (error) { expect(String(error)).toContain('completion fixture intentional failure'); }
      });
      const cleanup = captured.observations.find(item => item.kind === 'equivalence-process-cleanup')?.data;
      expect(cleanup).toMatchObject({ leaked: [], survivingAfterKill: [] });
      expect(captured.observations.some(item => item.kind === 'equivalence-stop')).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);
});

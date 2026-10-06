import { describe, expect, it } from 'vitest';
import type { CapturedInput, ProjectExclusion, ProjectScope } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import type { CheckOutcome, ContextToken } from '../interfaces/contexts.js';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

/**
 * Watcher registrations follow the published ownership (contracts, "Transport, observation
 * and projections"): the watcher receives revision-bound exclusions and the canonical
 * reserved-path rules, is reconfigured after a boundary change, and a reconfiguration gap is
 * covered by conservative recapture. Expected values follow the contracts, never the code.
 */
const exclusion = (kind: ProjectExclusion['kind'], directory: string, owner: string | null = null): ProjectExclusion => ({ kind, directory, owner });
function scope(extra: readonly ProjectExclusion[]): ProjectScope {
  return { root: '/fixture', selection: 'given', invokedFrom: '/fixture', configuration: 'tsconfig.json', walkedAreas: ['src'],
    ownership: { modules: [{ id: 'app', parent: null, directory: '.' }],
      exclusions: [exclusion('scratch', 'src/tmp', 'app'), ...extra].sort((a, b) => a.directory < b.directory ? -1 : 1) } };
}
const inputs: readonly CapturedInput[] = [{ path: 'src/index.ts', role: 'source', sha256: hash('index'), bytes: 5 }];
const ignored = scope([exclusion('owned-unwired', 'vendor', 'app')]);
const reincluded = scope([]);
const covered = (outcome: CheckOutcome) => outcome.status === 'reported' && outcome.freshness.captureStarted === null && outcome.freshness.reusedRevision;

async function opened(e: ReturnType<typeof sessionEnvironment>, initial: ProjectScope): Promise<ContextToken> {
  e.script.pending.push(() => capture(1, 'completed', inputs, initial));
  const { token } = await e.open(); await flush();
  expect(e.status(token)).toMatchObject({ synchronization: 'synchronized', published: { sequence: 1 } });
  return token;
}
/** One watcher batch whose update publishes `next`. */
async function boundaryChange(e: ReturnType<typeof sessionEnvironment>, version: number, next: ProjectScope): Promise<void> {
  e.script.pending.push(() => capture(version, 'completed', inputs, next));
  e.watcher.emit('/fixture', [{ path: 'module.ramify', kind: 'changed' }]);
  e.clock.advance(100); await flush();
}

describe('watch registrations from the published ownership', () => {
  it('registers with the reserved-path rules before a revision, then with each changed exclusion set, pruning without a sweep', async () => {
    const e = sessionEnvironment();
    try {
      const token = await opened(e, ignored);
      // Before the first completed revision only the reserved-path rules apply; its table then prunes.
      expect(e.watcher.registrations).toEqual([
        { root: '/fixture', sequence: null, exclusions: [] },
        { root: '/fixture', sequence: 1, exclusions: ['src/tmp', 'vendor'] },
      ]);
      expect(e.status(token).registrations).toEqual({ sequence: 1, directories: 0, pruned: [], prunedCount: 0 });
      e.clock.advance(1000); await flush();
      expect(e.script.sweepCalls).toHaveLength(0);
      expect(e.status(token).synchronization).toBe('synchronized');

      // A revision with the same exclusions changes no registration.
      await boundaryChange(e, 2, scope([exclusion('owned-unwired', 'vendor', 'app')]));
      expect(e.status(token).published?.sequence).toBe(2);
      expect(e.watcher.registrations).toHaveLength(2);

      // A new declaration only prunes: no gap, so no conservative sweep follows.
      await boundaryChange(e, 3, scope([exclusion('owned-unwired', 'vendor', 'app'), exclusion('external', 'tools')]));
      expect(e.watcher.registrations.at(-1)).toEqual({ root: '/fixture', sequence: 3, exclusions: ['src/tmp', 'tools', 'vendor'] });
      e.clock.advance(1000); await flush();
      expect(e.script.sweepCalls).toHaveLength(0);
      expect(e.status(token)).toMatchObject({ synchronization: 'synchronized', registrations: { sequence: 3 } });
    } finally { await e.dispose(); }
  });

  it('covers nothing while a removed exclusion is registered again, then recaptures conservatively', async () => {
    const e = sessionEnvironment();
    try {
      const token = await opened(e, ignored);
      const expect1 = { mode: 'synchronized' as const, expect: [{ path: 'src/index.ts', sha256: hash('index') }] };
      expect(covered(await e.check(token, expect1))).toBe(true);

      const release = e.watcher.holdReconfiguration();
      await boundaryChange(e, 2, reincluded);
      expect(e.watcher.registrations.at(-1)).toEqual({ root: '/fixture', sequence: 2, exclusions: ['src/tmp'] });
      // Changes beneath `vendor` before its registration reach no listener: not synchronized.
      expect(e.status(token)).toMatchObject({ published: { sequence: 2 }, synchronization: 'reconciling' });
      const sweeps = e.script.sweepCalls.length;
      const during = await e.check(token, expect1); await flush();
      expect(during.status).toBe('reported');
      expect(covered(during)).toBe(false);
      // A capture during the gap sweeps.
      expect(e.script.sweepCalls.length).toBe(sweeps + 1);
      expect(e.status(token).synchronization).not.toBe('synchronized');

      release(); await flush();
      e.clock.advance(100); await flush();
      // The gap's end requires a conservative sweep, after which coverage resumes.
      expect(e.script.sweepCalls.length).toBe(sweeps + 2);
      expect(e.status(token)).toMatchObject({ synchronization: 'synchronized', registrations: { sequence: 2 } });
      expect(covered(await e.check(token, expect1))).toBe(true);
    } finally { await e.dispose(); }
  });

  it('a recapture after the gap publishes what the sweep found, as a conservative revision', async () => {
    const e = sessionEnvironment();
    try {
      const token = await opened(e, ignored);
      const release = e.watcher.holdReconfiguration();
      await boundaryChange(e, 2, reincluded);
      // A file beneath the reincluded tree changed during the gap; only the sweep finds it.
      e.script.pending.push(() => capture(3, 'completed', [...inputs, { path: 'vendor/lost.ts', role: 'source', sha256: hash('lost'), bytes: 4 }], reincluded));
      release(); await flush();
      e.clock.advance(100); await flush();
      expect(e.script.sweepCalls.length).toBe(1);
      expect(e.status(token)).toMatchObject({ synchronization: 'synchronized', published: { sequence: 3, cause: 'conservative' } });
    } finally { await e.dispose(); }
  });

  it('a removed exclusion whose tree registers nothing ends its gap without a sweep', async () => {
    const e = sessionEnvironment();
    try {
      const token = await opened(e, ignored);
      const release = e.watcher.holdReconfiguration();
      await boundaryChange(e, 2, reincluded);
      expect(e.status(token).synchronization).toBe('reconciling');
      // The reincluded directory no longer exists: nothing was registered, so nothing was missed.
      release(0); await flush();
      e.clock.advance(1000); await flush();
      expect(e.script.sweepCalls).toHaveLength(0);
      expect(e.status(token)).toMatchObject({ synchronization: 'synchronized', published: { sequence: 2 } });
      expect(covered(await e.check(token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('index') }] }))).toBe(true);
    } finally { await e.dispose(); }
  });

  it('reports no registrations once the watcher is closed', async () => {
    const e = sessionEnvironment();
    try {
      const token = await opened(e, ignored);
      expect(e.status(token)).toMatchObject({ watcher: 'active', registrations: { sequence: 1 } });
      e.watcher.emit('/fixture', [{ path: '', kind: 'error' }]); await flush();
      expect(e.status(token)).toMatchObject({ watcher: 'unavailable', registrations: null });
    } finally { await e.dispose(); }
  });
});

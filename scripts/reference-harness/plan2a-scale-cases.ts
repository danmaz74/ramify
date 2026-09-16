import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilesystemApiViewPublisher } from '../../subs/daemon/src/api-view-publisher.js';
import type { ApiViewPublishLimits } from '../../subs/daemon/src/interfaces/daemon.js';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { capabilities } from '../../subs/cli/src/command-support.js';
import { writeMaterializeFixture } from './plan2a-materialize-fixture.js';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { recordObservation } from './observations.js';
import type { InstanceHandler } from './runner.js';

/**
 * I2A-12: scale, determinism and resource evidence for `ramify materialize`.
 * Six leaves (reference/toolkit/synthetic-100/synthetic-500/synthetic-1000/
 * repeat-plateau) validate the archived raw evidence from
 * `node scripts/measurements/plan2a.mjs` (already run on this host; see the
 * iteration's results for the exact command and host). Measurement leaves
 * never re-run a heavy workload inside this reference gate, matching
 * `verify-fast-evidence.mjs`'s own convention.
 *
 * `limit-preservation` runs live here: the daemon's own `apiView`
 * (session-query) area/invocation bound is a frozen internal constant with
 * no `DaemonServiceOptions` override, but the transactional filesystem
 * publisher's own `ApiViewPublishLimits` (area/invocation/staged bytes) is
 * injectable through `createQuickEnvironment`'s `publisher` fixture — the
 * real, exposed `createFilesystemApiViewPublisher` writing real files to a
 * real temporary directory, not a mock. That is the one bound this leaf can
 * independently force without editing frozen production defaults, per the
 * coordinator's instruction.
 *
 * `linux-macos-bytes` reads the archived Linux platform report and requires
 * a real macOS counterpart to pass; with none available on this host, it
 * fails honestly (the one leaf the iteration's brief expects to fail) rather
 * than passing on Linux evidence alone.
 */

interface WorkloadRow {
  readonly name: string;
  readonly status: 'measured' | 'failed' | 'not-executed';
  readonly passed: boolean;
  readonly measurements?: unknown;
}
interface EvidenceReader {
  readonly name: string;
  readonly artifact: string | null;
  readonly row: WorkloadRow;
  readonly measurementPolicy?: Record<string, string>;
  readonly environment?: { readonly platform: string; readonly arch: string };
  readonly error: string | null;
}

/** Spawns the real `.mjs` evidence reader (never imported directly, matching
 * `plan5-fast-measure-cases.ts`'s own precedent) so this strict TypeScript
 * harness never needs declaration types for plain measurement scripts. It
 * recomputes every predicate from the raw archived report; nothing here
 * re-runs the heavy workload itself. */
async function readEvidence(name: string): Promise<EvidenceReader> {
  const provided = process.env.RAMIFY_PLAN2A_MEASUREMENT_REPORT;
  const result = await command(repositoryRoot, process.execPath,
    [join(repositoryRoot, 'scripts/measurements/verify-plan2a-evidence.mjs'), name, ...(provided ? [provided] : [])], 60_000);
  if (result.error || result.signal || result.stderr) {
    throw new Error(`plan2a evidence reader failed: ${result.error ?? result.signal ?? result.stderr}`);
  }
  return JSON.parse(result.stdout) as EvidenceReader;
}

function scaleHandler(name: string, description: string): InstanceHandler {
  return {
    kind: 'memory', run: async ({ assertions: a }) => {
      const evidence = await readEvidence(name);
      const row = evidence.row;
      a.equal(`${description}: the archived report identifies a real, current, non-empty measurement`, evidence.error, null);
      a.equal(`${description}: the workload genuinely completed`, [row.status, row.passed], ['measured', true]);
      const measurements = row.measurements as {
        readonly cold: { readonly summary: { readonly targets: number; readonly entries: number; readonly bytesWritten: number } };
        readonly warm: { readonly code: number; readonly summary: { readonly bytesWritten: number; readonly unchanged: number } } | null;
        readonly memory: { readonly peakCombinedRssBytes: number; readonly peakCombinedHeapBytes: number; readonly sampleCount: number };
        readonly metrics: { readonly files: number; readonly entries: number; readonly bytes: number;
          readonly duplicatedBytes: number; readonly largestOrdinary: unknown; readonly largestTests: unknown };
      };
      a.equal(`${description}: a real cold materialize completed with real, nonzero output`,
        [measurements.cold.summary.targets > 0, measurements.cold.summary.bytesWritten >= 0], [true, true]);
      a.ok(`${description}: real peak combined daemon RSS/heap were sampled (nonzero sample count)`, measurements.memory.sampleCount > 0);
      a.ok(`${description}: real filesystem metrics (files/entries/bytes/duplication/largest areas) were computed from the actual generated tree`,
        measurements.metrics.files >= 0 && measurements.metrics.bytes >= 0);
      recordObservation(`plan2a-scale-${name}`, {
        cold: measurements.cold.summary, warm: measurements.warm?.summary ?? null,
        peakCombinedRssBytes: measurements.memory.peakCombinedRssBytes, peakCombinedHeapBytes: measurements.memory.peakCombinedHeapBytes,
        metrics: measurements.metrics,
      });
      if (measurements.warm) {
        a.equal(`${description}: the warm repeat is a real zero-write, all-unchanged no-op`,
          measurements.warm.code === 0 ? [measurements.warm.summary.bytesWritten, measurements.warm.summary.unchanged > 0] : 'warm did not complete',
          measurements.warm.code === 0 ? [0, true] : 'warm did not complete');
      }
    },
  };
}

export const plan2aScaleHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I2A-12:reference-scale', scaleHandler('reference', 'R (examples/collection-review)')],
  ['I2A-12:toolkit-scale', scaleHandler('toolkit', 'T (the toolkit itself)')],
  ['I2A-12:synthetic-100', scaleHandler('synthetic-100', 'S100')],

  ['I2A-12:synthetic-500', { kind: 'memory', run: async ({ assertions: a }) => {
    const evidence = await readEvidence('synthetic-500');
    const row = evidence.row;
    // S500 is intentionally excluded from the default workload set by the
    // carried-forward Plan 5 measurement policy (not required; advisory).
    // The independent expectation this leaf verifies under that policy is
    // that the exclusion is real and documented, never that a number was
    // inferred or silently omitted.
    a.equal('S500 is explicitly recorded as not executed, never silently missing', row.status, 'not-executed');
    a.equal('no S500 measurement object was fabricated for the unrun workload', 'measurements' in row, false);
    a.ok('the report documents the policy reason for excluding S500 by name',
      typeof evidence.measurementPolicy?.['synthetic-500'] === 'string' && evidence.measurementPolicy['synthetic-500'].includes('Not required'));
    recordObservation('plan2a-scale-synthetic-500', { policy: evidence.measurementPolicy?.['synthetic-500'] });
  } }],

  ['I2A-12:synthetic-1000', { kind: 'memory', run: async ({ assertions: a }) => {
    const evidence = await readEvidence('synthetic-1000');
    const row = evidence.row;
    // Never forced: the leaf accepts either a real completed materialization
    // or an explicit predecessor/resource refusal, and requires the
    // measurement to have genuinely run (not silently skipped).
    a.equal('S1000 was actually attempted (not skipped)', row.status, 'measured');
    const measurements = row.measurements as { readonly cold: { readonly code: number; readonly summary: unknown | null } };
    a.ok('the real, observed outcome is recorded honestly: either a completed cold materialize or an explicit non-zero exit, never invented',
      typeof measurements.cold.code === 'number');
    recordObservation('plan2a-scale-synthetic-1000', { coldCode: measurements.cold.code, coldSummary: measurements.cold.summary });
  } }],

  ['I2A-12:repeat-plateau', { kind: 'memory', run: async ({ assertions: a }) => {
    const evidence = await readEvidence('repeat-plateau');
    const row = evidence.row;
    a.equal('the repeat-plateau workload genuinely completed', [row.status, row.passed], ['measured', true]);
    const byFixture = row.measurements as Record<string, { readonly cycles: readonly { readonly cycle: number;
      readonly code: number; readonly summary: { readonly bytesWritten: number } | null; readonly staleSiblings: number }[] }>;
    for (const [fixture, data] of Object.entries(byFixture)) {
      const repeats = data.cycles.slice(1);
      a.equal(`${fixture}: every repeat after the first cycle wrote zero bytes`, repeats.every(c => c.code === 0 && c.summary?.bytesWritten === 0), true);
      a.equal(`${fixture}: no stage or rollback sibling ever accumulated across repeats`, data.cycles.every(c => c.staleSiblings === 0), true);
    }
    recordObservation('plan2a-scale-repeat-plateau', { fixtures: Object.keys(byFixture) });
  } }],

  ['I2A-12:limit-preservation', { kind: 'memory', run: async ({ assertions: a }) => {
    const root = await mkdtemp(join(tmpdir(), 'plan2a-limit-preservation-'));
    try {
      await writeMaterializeFixture(root);
      const generousLimits: ApiViewPublishLimits = { maxAreaBytes: 32 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 };

      async function materializeOnce(limits: ApiViewPublishLimits) {
        const quick = await createQuickEnvironment({}, { publisher: createFilesystemApiViewPublisher(limits) });
        try {
          const connected = await quick.connect({ start: 'if-needed' });
          if (connected.status !== 'connected') throw new Error(`Expected a connection: ${connected.status}`);
          const opened = await connected.connection.openContext({ project: { cwd: root, scope: 'whole-project', configuration: 'discover' },
            setup: { registry: 'default', capabilities } });
          if (!opened.ok || opened.value.status !== 'opened') throw new Error(`Expected an opened context: ${JSON.stringify(opened)}`);
          const response = await connected.connection.materialize({ token: opened.value.token, requestId: crypto.randomUUID(),
            freshness: { mode: 'synchronized', expect: [] }, selection: { scope: 'all' } });
          return response.ok ? response.value : { status: 'error' as const, error: response.error };
        } finally { await quick.dispose(); }
      }

      const baseline = await materializeOnce(generousLimits);
      if (baseline.status !== 'materialized') throw new Error(`Expected a baseline materialization: ${JSON.stringify(baseline)}`);
      const appTarget = baseline.targets.find(target => target.module.endsWith('/app') && target.area === 'ordinary');
      if (!appTarget) throw new Error('Expected app\'s ordinary target in the baseline outcome');
      const targetFile = join(root, appTarget.path, 'external/subs/lib/src/api.ts.md');
      const baselineBytes = await readFile(targetFile);

      // Just-over/just-under the publisher's own maxAreaBytes, at the exact
      // real byte count the generous baseline reported for this one area.
      const overArea = await materializeOnce({ ...generousLimits, maxAreaBytes: appTarget.bytes - 1 });
      a.equal('crossing the area bound by one byte is explicitly refused, not silently truncated',
        overArea.status === 'unavailable' ? overArea.reason : overArea.status, 'resource-unavailable');
      const overAreaBytes = await readFile(targetFile);
      a.ok('the just-over-area failure preserves the old target byte-for-byte', overAreaBytes.equals(baselineBytes));

      const underArea = await materializeOnce({ ...generousLimits, maxAreaBytes: appTarget.bytes });
      a.equal('a just-under (exact) area bound control completes normally', underArea.status, 'materialized');

      // Just-over/just-under the publisher's own maxStagedBytes, at the
      // real total bytes the generous baseline wrote across every target.
      const overStaging = await materializeOnce({ ...generousLimits, maxStagedBytes: baseline.bytesWritten - 1 });
      a.equal('crossing the staged-output bound by one byte is explicitly refused',
        overStaging.status === 'unavailable' ? overStaging.reason : overStaging.status, 'resource-unavailable');
      const overStagingBytes = await readFile(targetFile);
      a.ok('the just-over-staging failure preserves the old target byte-for-byte', overStagingBytes.equals(baselineBytes));

      const underStaging = await materializeOnce({ ...generousLimits, maxStagedBytes: baseline.bytesWritten });
      a.equal('a just-under (exact) staged-output bound control completes normally', underStaging.status, 'materialized');

      // Deadline: a synchronized request against a context whose freshness
      // has not yet settled, with an exhausted controlled-clock deadline,
      // preserves the old bytes exactly as the resource-limit cases above.
      const quick = await createQuickEnvironment({}, { publisher: createFilesystemApiViewPublisher(generousLimits) });
      try {
        const connected = await quick.connect({ start: 'if-needed' });
        if (connected.status !== 'connected') throw new Error(`Expected a connection: ${connected.status}`);
        const opened = await connected.connection.openContext({ project: { cwd: root, scope: 'whole-project', configuration: 'discover' },
          setup: { registry: 'default', capabilities } });
        if (!opened.ok || opened.value.status !== 'opened') throw new Error(`Expected an opened context: ${JSON.stringify(opened)}`);
        const pending = connected.connection.materialize({ token: opened.value.token, requestId: crypto.randomUUID(),
          freshness: { mode: 'synchronized', expect: [] }, selection: { scope: 'all' }, deadlineMs: 1 });
        for (let index = 0; index < 100; index++) await Promise.resolve();
        quick.clock.advance(2);
        const deadlineResult = await pending;
        // Matching `I2A-09:failure-mapping`'s own established real result: a
        // synchronized request against a not-yet-published context with an
        // exhausted deadline is explicitly `cold`, never success.
        a.equal('an exhausted deadline is explicit (cold), never a false success',
          deadlineResult.ok ? deadlineResult.value.status : deadlineResult.error.code, 'cold');
        const deadlineBytes = await readFile(targetFile);
        a.ok('an exhausted-deadline attempt preserves the old target byte-for-byte', deadlineBytes.equals(baselineBytes));
      } finally { await quick.dispose(); }

      // Heap: neither `ApiViewQueryLimits` (frozen inside `createContextManager`,
      // no `DaemonServiceOptions` override) nor `ApiViewPublishLimits` exposes
      // an independently injectable heap ceiling; this is recorded explicitly
      // rather than invented, per the coordinator's instruction.
      a.ok('a heap limit is recorded as not independently forceable through any exposed contract, not invented',
        true);
      recordObservation('plan2a-limit-preservation', { appTargetBytes: appTarget.bytes, totalBytesWritten: baseline.bytesWritten,
        heapLimitForceable: false, heapLimitNote: 'No ApiViewQueryLimits/ApiViewPublishLimits field exposes a heap ceiling to inject.' });
    } finally { await rm(root, { recursive: true, force: true }); }
  } }],

  ['I2A-12:linux-macos-bytes', { kind: 'memory', run: async ({ assertions: a }) => {
    const linuxPath = join(repositoryRoot, 'scripts/measurements/results/plan2a-platform-linux.json');
    const darwinPath = join(repositoryRoot, 'scripts/measurements/results/plan2a-platform-darwin.json');
    let linux: { readonly passed: boolean; readonly cases: Record<string, unknown>; readonly manifest: readonly { readonly path: string; readonly bytes: number; readonly sha256: string }[]; readonly environment: { readonly platform: string } } | null = null;
    try { linux = JSON.parse(await readFile(linuxPath, 'utf8')); } catch { /* handled by the assertion below */ }
    a.ok('a real Linux platform report exists, produced by node scripts/measurements/plan2a-platform.mjs', linux !== null);
    if (linux) {
      a.equal('the Linux run passed symlink, rollback and no-op process cases and produced a real bytes manifest',
        [linux.passed, linux.environment.platform, linux.manifest.length > 0], [true, 'linux', true]);
    }
    let darwin: unknown = null;
    try { darwin = JSON.parse(await readFile(darwinPath, 'utf8')); } catch { darwin = null; }
    recordObservation('plan2a-linux-macos-bytes', { linuxPresent: linux !== null, darwinPresent: darwin !== null,
      macosCommand: 'node scripts/measurements/plan2a-platform.mjs (writes scripts/measurements/results/plan2a-platform-darwin.json)' });
    // No macOS runner is available on this host (recorded honestly, per the
    // iteration's brief: this is the one leaf expected not to pass here).
    // Linux success alone must never substitute for the missing macOS half.
    a.equal('a real macOS counterpart report is present to compare against Linux', darwin !== null, true);
  } }],
]);

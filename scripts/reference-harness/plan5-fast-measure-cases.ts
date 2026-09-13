import { join } from 'node:path';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { recordObservation } from './observations.js';
import type { InstanceHandler } from './runner.js';

// Read the completed real-process recipe. Running timings while prerequisite
// fixtures compile would invalidate the latency evidence.
const workloads = ['hook-latency-reference', 'hook-latency-s100', 'hook-latency-s500',
  'hook-latency-s1000', 'checked-set-bounded', 'repeated-edit-plateau',
  'hot-warm-memory', 'cold-open', 'entry-footprints'] as const;

interface Evidence {
  readonly passed: boolean;
  readonly error?: string;
  readonly assertions?: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly observed: unknown;
    readonly maximum?: unknown;
    readonly expected?: unknown;
    readonly enforcement?: string;
    readonly targetMet?: boolean;
  }[];
}

export const plan5FastMeasureHandlers: ReadonlyMap<string, InstanceHandler> = new Map(workloads.map(suffix => {
  const id = `I5-13:${suffix}`;
  return [id, { kind: 'memory', run: async ({ assertions }) => {
    const provided = process.env.RAMIFY_FAST_MEASUREMENT_REPORT;
    const result = await command(repositoryRoot, process.execPath,
      [join(repositoryRoot, 'scripts/measurements/verify-fast-evidence.mjs'), id, ...(provided ? [provided] : [])], 60_000);
    assertions.equal('fast evidence reader completed without timeout or signal', [result.error, result.signal, result.stderr], [null, null, '']);
    const evidence = JSON.parse(result.stdout) as Evidence;
    recordObservation('fast-measurement-evidence', evidence);
    assertions.equal('current raw fast measurement evidence is available and verified', evidence.error ?? null, null);
    assertions.ok('independent measurement predicates ran', evidence.assertions?.length);
    for (const item of evidence.assertions ?? []) {
      assertions.ok(`${item.name}; observed=${JSON.stringify(item.observed)}; target=${JSON.stringify(item.maximum ?? item.expected)}; enforcement=${item.enforcement ?? 'binding'}; targetMet=${item.targetMet ?? 'n/a'}`, item.passed);
    }
    assertions.equal('all binding fast workload predicates pass', [result.code, evidence.passed], [0, true]);
  } } satisfies InstanceHandler];
}));

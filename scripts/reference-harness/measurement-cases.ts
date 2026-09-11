import { join } from 'node:path';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import { recordObservation } from './observations.js';
import type { InstanceHandler } from './runner.js';

// Consume the same completed idle-host run for all nine rows. Launching timings
// while other matrix fixtures compile would invalidate their latency evidence.
const workloads = ['entry-footprints', 'cold-warm-broad-reference', 'cold-warm-broad-hundred',
  'repeated-edit-plateau', 'many-contexts', 'slow-consumer', 'synthetic-500', 'synthetic-1000', 'publication-peak'] as const;
interface Evidence {
  readonly passed: boolean;
  readonly error?: string;
  readonly assertions?: readonly { readonly name: string; readonly passed: boolean; readonly observed: unknown; readonly maximum: unknown }[];
}
export const measurementHandlers: ReadonlyMap<string, InstanceHandler> = new Map(workloads.map(suffix => {
  const id = `I2-29:${suffix}`;
  return [id, { kind: 'memory', run: async ({ assertions }) => {
    const provided = process.env.RAMIFY_RESIDENT_MEASUREMENT_REPORT;
    const result = await command(repositoryRoot, process.execPath,
      [join(repositoryRoot, 'scripts/measurements/verify-resident-evidence.mjs'), id, ...(provided ? [provided] : [])], 30_000);
    assertions.equal('resident evidence reader completed without timeout or signal', [result.error, result.signal, result.stderr], [null, null, '']);
    const evidence = JSON.parse(result.stdout) as Evidence;
    recordObservation('resident-measurement-evidence', evidence);
    assertions.equal('same-input raw resident evidence is available and verified', evidence.error ?? null, null);
    assertions.ok('fixed independent budget predicates ran', evidence.assertions?.length);
    for (const item of evidence.assertions ?? []) assertions.ok(`${item.name}; observed=${JSON.stringify(item.observed)}; maximum=${JSON.stringify(item.maximum)}`, item.passed);
    assertions.equal('all binding resident workload predicates pass', [result.code, evidence.passed], [0, true]);
  } } satisfies InstanceHandler];
}));

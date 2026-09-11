const MiB = 1024 ** 2;

// Transcribed from the iteration-1 revision of scope.md. No command-line
// overrides: missing observations and missed targets must remain failures.
export const residentBudgets = {
  sampleIntervalMs: 50, coldSamples: 5, editCycles: 20,
  reference: { coldMs: 6000, unchangedMs: 1500, readmeMs: 1000, exposureMs: 2500,
    sourceMs: 4500, configurationMs: 5500, peakBytes: 512 * MiB, cliBytes: 96 * MiB },
  S100: { coldMs: 16000, unchangedMs: 3000, readmeMs: 2000, exposureMs: 5000,
    sourceMs: 8000, configurationMs: 12000, peakBytes: 768 * MiB, cliBytes: 160 * MiB },
  S500: { coldMs: 45000, sourceMs: 30000, peakBytes: 1536 * MiB },
  S1000: { coldMs: 90000, sourceMs: 60000, peakBytes: 2560 * MiB },
  contextStatusMs: 50, cliStatusMs: 300, clientBytes: 64 * MiB,
  daemonEmptyBytes: 96 * MiB, daemonReferenceBytes: 192 * MiB,
  manyContexts: { contexts: 8, rssBytes: 1024 * MiB, retainedBytes: 512 * MiB },
  plateau: { cycles: 200, settledCycles: 100, rssGrowthBytes: 64 * MiB,
    heapGrowthBeyondHistoryBytes: 16 * MiB },
  slowConsumer: { publications: 10, outboundBytes: 64 * MiB, disconnectMs: 2000, rssRecoveryBytes: 32 * MiB },
  retention: { contexts: 8, revisionsPerContext: 8, historyBytesPerContext: 64 * MiB,
    productsBytesPerContext: 96 * MiB, globalBytes: 512 * MiB },
};

export const residentWorkloads = [
  ['entry-footprints', ['CLI help', './client import', 'daemon zero contexts', 'daemon warm reference',
    'CLI resident check reference', 'CLI resident check S100']],
  ['cold-warm-broad-reference', ['5 cold starts', '20 unchanged', '20 README', '20 exposure', '20 source',
    '20 configuration', 'contextStatus service timing', 'daemon status end-to-end timing', 'stage reuse']],
  ['cold-warm-broad-hundred', ['5 cold starts', '20 unchanged', '20 README', '20 exposure', '20 source',
    '20 configuration', 'contextStatus service timing', 'daemon status end-to-end timing', 'stage reuse']],
  ['repeated-edit-plateau', ['reference 200 alternating cycles', 'S100 200 alternating cycles',
    'last 100 settled RSS/heap/history/products', 'balanced watchers/helpers/timers/sessions']],
  ['many-contexts', ['8 warm S100 contexts', 'settled RSS', 'global retained bytes']],
  ['slow-consumer', ['non-reading subscriber', '10 S100 publications', 'outbound bound',
    'disconnect timing', 'settled RSS recovery']],
  ['synthetic-500', ['cold S500', 'one source edit', 'combined peak']],
  ['synthetic-1000', ['cold S1000', 'one source edit', 'combined peak']],
  ['publication-peak', ['reference publication and serialization', 'S100 publication and serialization']],
].map(([suffix, requirements]) => ({ id: `I2-29:${suffix}`, requirements }));

/** Missing work is explicit data, never zero-valued timing or a passing row. */
export function pendingResidentWorkloads(reason) {
  return residentWorkloads.map(workload => ({ ...workload, status: 'not-executed', passed: false,
    reason, measurements: null }));
}

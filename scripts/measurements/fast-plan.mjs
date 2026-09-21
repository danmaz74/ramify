// Reviewed Plan 5 scope.md budgets. Every timing and memory row is an ideal
// optimization budget, recorded and never enforced; runtime limits are enforced.
const MiB = 1024 ** 2;
export const fastBudgets = {
  sampleIntervalMs: 50, editCycles: 20, repeatedCycles: 200, settledCycles: 100,
  reference: { cold: 1500, body: 25, source: 250, description: 120, readme: 30,
    created: 600, deleted: 600, configuration: 1000, published: 120, racing: 200, signature: 250, companion: 120 },
  S100: { cold: 4000, body: 60, source: 400, description: 500, readme: 60,
    created: 1500, deleted: 1500, configuration: 2500, published: 150, racing: 250 },
  // Plan 8's exposing variant of S100. Its ideal targets are S100's; the two
  // Plan 8 edit classes take the source and description targets of each fixture.
  X100: { cold: 4000, body: 60, source: 400, description: 500, readme: 60,
    created: 1500, deleted: 1500, configuration: 2500, published: 150, racing: 250, signature: 400, companion: 500 },
  S500: { cold: 15000, body: 200, source: 1000, description: 1500, readme: 100,
    created: 5000, deleted: 5000, configuration: 8000, published: 300, racing: 500 },
  S1000: { cold: 40000, body: 400, source: 3000, description: 3000, readme: 200,
    created: 10000, deleted: 10000, configuration: 16000, published: 500, racing: 900 },
  memory: { daemonReference: 96 * MiB, combinedContexts: 1536 * MiB,
    factsReference: 64 * MiB, factsS100: 96 * MiB,
    compilerReference: 192 * MiB, compilerS100: 256 * MiB,
    rssGrowth: 64 * MiB, heapGrowthBeyondHistory: 16 * MiB },
  runtime: { contexts: 8, hotContexts: 2, factBytes: 96 * MiB, globalBytes: 512 * MiB,
    historyBytes: 128 * MiB, historyRevisions: 8, workerHeapMiB: 512 },
};
export const fastFixtures = ['reference', 'S100', 'S500', 'S1000'];
/** Plan 8's exposing fixture. It has its own hook workload and joins no derived row. */
export const exposingFixtures = ['X100'];
export const editKinds = ['body', 'source', 'description', 'readme', 'created', 'deleted', 'configuration'];
/**
 * Plan 8's edit classes: a signature edit that adds a named original, and a
 * `module.ramify` edit that removes a companion's exposure and restores it.
 */
export const companionEditKinds = ['signature', 'companion'];
export const companionEditFixtures = ['reference', 'X100'];
export const editKindsFor = name => companionEditFixtures.includes(name) ? [...editKinds, ...companionEditKinds] : editKinds;
export const fastWorkloads = [
  ...[...fastFixtures, ...exposingFixtures].map(name => `hook-latency-${name.toLowerCase()}`),
  'checked-set-bounded', 'repeated-edit-plateau', 'hot-warm-memory', 'cold-open', 'entry-footprints',
].map(suffix => ({ id: `I5-13:${suffix}` }));
export const fixtureForId = id => [...fastFixtures, ...exposingFixtures].find(name => id === `I5-13:hook-latency-${name.toLowerCase()}`);

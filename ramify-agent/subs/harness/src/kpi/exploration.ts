/** The frozen C6 observation wire. No environment values or file content are retained. */
export interface ExplorationObservation {
  readonly id: string;
  readonly invocationId: string;
  readonly operationId: string;
  readonly role: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly callId: string;
  readonly kind: 'read' | 'search';
  readonly requestedScope: readonly string[];
  readonly resolvedScope: readonly string[] | null;
  readonly files: readonly string[] | null;
  readonly returnedBytes: number | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly elapsedMs: number | null;
  readonly outcome: 'completed' | 'failed' | 'refused' | 'interrupted';
  readonly broad: boolean | null;
  readonly outsideScope: boolean | null;
  readonly coverage: readonly string[];
}

/** Numbers are known subtotals whenever coverage lists a collection limit. */
export interface ExplorationMetrics {
  readonly reads: number;
  readonly uniqueFilesRead: number;
  readonly repeatedReads: number;
  readonly returnedBytes: number;
  readonly searches: number;
  readonly broadSearches: number;
  readonly outsideScopeSearches: number;
  readonly toolElapsedMs: number;
  readonly coverage: readonly string[];
}

/** Durable source identity survives transcript replay and inheritance. */
export function explorationIdentity(observation: ExplorationObservation): string {
  return JSON.stringify([observation.invocationId, observation.operationId, observation.sessionId,
    observation.turn, observation.callId, observation.kind]);
}

export function observedElapsedMs(observation: ExplorationObservation): number | null {
  if (observation.elapsedMs !== null) return Number.isFinite(observation.elapsedMs) && observation.elapsedMs >= 0 ? observation.elapsedMs : null;
  if (observation.startedAt === null || observation.endedAt === null) return null;
  const elapsed = Date.parse(observation.endedAt) - Date.parse(observation.startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

/** Input follows recorded call order; a repeated read is a call containing at least one already-read file.
 * Extra details stay outside the frozen public metrics wire. Empty observed files mean zero matches, never zero scanned bytes. */
export function explorationDetails(input: readonly ExplorationObservation[], collectionLimits: readonly string[] = []): {
  readonly metrics: ExplorationMetrics;
  readonly zeroMatchSearches: number;
  readonly observations: readonly ExplorationObservation[];
} {
  const coverage = new Set(collectionLimits);
  const unique = new Map<string, ExplorationObservation>();
  const conflicts = new Set<string>();
  for (const observation of input) {
    const key = explorationIdentity(observation);
    const previous = unique.get(key);
    if (previous !== undefined) {
      // Storage row ids may differ when copied. The immutable source fields may not.
      const fields = (value: ExplorationObservation) => JSON.stringify([value.role, value.requestedScope, value.resolvedScope, value.files, value.returnedBytes, value.startedAt, value.endedAt, value.elapsedMs, value.outcome, value.broad, value.outsideScope, value.coverage]);
      if (fields(previous) !== fields(observation)) {
        conflicts.add(key);
        coverage.add(`${key}: conflicting observations of one source call; excluded`);
      }
    } else unique.set(key, observation);
  }
  const observations = [...unique].filter(([key]) => !conflicts.has(key)).map(([, observation]) => observation);
  const files = new Set<string>();
  let reads = 0, repeatedReads = 0, returnedBytes = 0, searches = 0, broadSearches = 0, outsideScopeSearches = 0, toolElapsedMs = 0, zeroMatchSearches = 0;
  for (const observation of observations) {
    const key = explorationIdentity(observation);
    for (const reason of observation.coverage) coverage.add(`${key}: ${reason}`);
    if (observation.outcome !== 'completed') coverage.add(`${key}: ${observation.outcome}`);
    if (observation.resolvedScope === null) coverage.add(`${key}: resolved scope unknown`);
    if (observation.returnedBytes === null || !Number.isFinite(observation.returnedBytes) || observation.returnedBytes < 0) coverage.add(`${key}: returned bytes unknown`);
    else returnedBytes += observation.returnedBytes;
    const elapsed = observedElapsedMs(observation);
    if (elapsed === null) coverage.add(`${key}: duration unknown`);
    else toolElapsedMs += elapsed;
    if (observation.kind === 'read') {
      reads += 1;
      if (observation.files === null) coverage.add(`${key}: files read unknown`);
      else {
        if (observation.files.some(file => files.has(file))) repeatedReads += 1;
        for (const file of observation.files) files.add(file);
      }
    } else {
      searches += 1;
      if (observation.files === null) coverage.add(`${key}: matched files unknown`);
      else if (observation.files.length === 0) zeroMatchSearches += 1;
      if (observation.broad === null) coverage.add(`${key}: search breadth unknown`);
      else if (observation.broad) broadSearches += 1;
      if (observation.outsideScope === null) coverage.add(`${key}: outside-scope status unknown`);
      else if (observation.outsideScope) outsideScopeSearches += 1;
    }
  }
  return { metrics: { reads, uniqueFilesRead: files.size, repeatedReads, returnedBytes, searches, broadSearches,
    outsideScopeSearches, toolElapsedMs, coverage: [...coverage] }, zeroMatchSearches, observations };
}

export function explorationMetrics(input: readonly ExplorationObservation[], collectionLimits: readonly string[] = []): ExplorationMetrics {
  return explorationDetails(input, collectionLimits).metrics;
}

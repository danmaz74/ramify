import { createHash } from 'node:crypto';
import { byteOrder, hash } from './data.js';
import type { CapturedInput, ObservationSink, ProjectInventory } from './interfaces/project.js';

type Role = CapturedInput['role'];
export type ProbeOperation = 'fileExists' | 'directoryExists' | 'realPath';

/** One filesystem callback reported by a source stage, before promotion. */
export interface ReportedObservation {
  readonly path: string;
  readonly shape: 'file' | 'directory' | 'absent' | 'probe';
  readonly role: Role;
  readonly sha256: string | null;
  readonly bytes: number;
  readonly entries: readonly string[] | undefined;
  readonly operation: ProbeOperation | undefined;
}

/**
 * The reported side of the observation table. Callbacks are merged with the
 * acquisition's own observations, never substituted for them: a report keeps
 * the identity the reporter saw until the capture observes the same path.
 */
export class ReportedObservations {
  #pending = new Map<string, ReportedObservation>();
  #promoted = new Map<string, ReportedObservation>();
  #version = 0;

  readonly sink: ObservationSink = {
    file: (path, sha256, bytes, role) => this.#record({ path, shape: 'file', role, sha256, bytes, entries: undefined, operation: undefined }),
    directory: (path, entries) => this.#record({ path, shape: 'directory', role: 'directory', sha256: null, bytes: 0, entries: [...entries], operation: undefined }),
    absent: path => this.#record({ path, shape: 'absent', role: 'absent', sha256: null, bytes: 0, entries: undefined, operation: undefined }),
    probe: (path, operation) => this.#record({ path, shape: 'probe', role: 'dependency', sha256: null, bytes: 0, entries: undefined, operation }),
  };

  #record(observation: ReportedObservation): void {
    // A byte read supersedes a bare probe of the same path within one batch.
    const previous = this.#pending.get(observation.path);
    if (previous && previous.shape !== 'probe' && observation.shape === 'probe') return;
    this.#pending.set(observation.path, observation);
    this.#version++;
  }
  /** Advances with every change to the pending reports, which merged input lists include. */
  get version(): number { return this.#version; }
  /** Take the reports awaiting promotion; promoted reports stay recorded. */
  take(): readonly ReportedObservation[] {
    const taken = [...this.#pending.values()];
    for (const observation of taken) this.#promoted.set(observation.path, observation);
    if (this.#pending.size) this.#version++;
    this.#pending.clear();
    return taken;
  }
  get pending(): readonly ReportedObservation[] { return [...this.#pending.values()]; }
  get promoted(): readonly ReportedObservation[] { return [...this.#promoted.values()]; }
  forget(path: string): void { if (this.#pending.delete(path)) this.#version++; this.#promoted.delete(path); }
  clear(): void { if (this.#pending.size) this.#version++; this.#pending.clear(); this.#promoted.clear(); }
}

/** A report's identity in the captured-input spelling, for merged input sets. */
export function reportedInput(observation: ReportedObservation, label: string): CapturedInput {
  const identity = observation.sha256
    ?? hash(JSON.stringify([observation.shape, observation.entries, observation.operation]));
  return { path: label, role: observation.role, sha256: identity, bytes: observation.bytes };
}

export const OBSERVED_INTEGRATION = 'typescript/7.0.2/captured-source/1';
export const OBSERVED_RECIPE = 'adjacent-absent-config/extends/files-all-owned-and-configured/empty-include-exclude/resource-witness/1';

/**
 * The input identity a report over the same observed inputs carries. Kept byte
 * for byte with the batch recipe so a revision and a batch report agree.
 */
export function inputIdentity(inventory: ProjectInventory, registry: string, inputs: readonly CapturedInput[]): string {
  const captured = [...inputs].sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.role, b.role));
  return `input/1:${createHash('sha256').update(JSON.stringify({
    scope: inventory.scope, registry, integration: OBSERVED_INTEGRATION, recipe: OBSERVED_RECIPE,
    roots: inventory.files.filter(file => file.kind === 'source').map(file => file.path).sort(byteOrder),
    inputs: captured,
  })).digest('hex')}`;
}

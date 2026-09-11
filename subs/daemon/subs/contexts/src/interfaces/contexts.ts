import type { Capability } from '../../../../../analysis/src/interfaces/analysis.js';
import type { ProjectRequest } from '../../../../../analysis/subs/project/src/interfaces/project.js';

// Independent declarations from the Plan 2 contract. The manager vocabulary
// follows when analysis and project supply iteration 3's prerequisite types.
export type ContextId = string;
export type GenerationId = string;
export type RevisionId = string;
export type LeaseId = string;
export interface ContextToken {
  readonly context: ContextId;
  readonly generation: GenerationId;
}
export interface ContextSetup {
  readonly registry: 'default';
  readonly capabilities: readonly Capability[];
}
export interface ContextSelection {
  readonly root: string;
  readonly scope: ProjectRequest['scope'];
  readonly configuration: ProjectRequest['configuration'];
  readonly setup: ContextSetup;
}
export interface InputFingerprints {
  readonly inputId: string;
  readonly declarations: string;
  readonly source: string;
  readonly configuration: string;
  readonly registry: string;
  readonly engine: string;
}
export interface WatchEvent {
  readonly path: string;
  readonly kind: 'changed' | 'created' | 'deleted' | 'renamed' | 'overflow' | 'error';
}
export interface WatcherHandle { close(): Promise<void> }
export interface WatcherPort {
  watch(root: string, listener: (events: readonly WatchEvent[]) => void): Promise<WatcherHandle>;
}
export interface ClockPort {
  now(): number;
  schedule(delayMs: number, run: () => void): () => void;
}

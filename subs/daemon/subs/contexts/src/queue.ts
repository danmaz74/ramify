import type { InputChange } from '../../../../analysis/src/interfaces/analysis.js';
import type { ProjectRequest } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { CheckOutcome, CheckRequest, ContextSetup } from './interfaces/contexts.js';

export interface Invocation { readonly project: ProjectRequest; readonly setup: ContextSetup }
export interface PendingCheck {
  readonly request: CheckRequest;
  readonly lease: string;
  readonly acknowledged: number;
  readonly invocation: Invocation;
  readonly resolve: (outcome: CheckOutcome) => void;
  cleanup: () => void;
  settled: boolean;
}
export interface RunningCapture {
  readonly controller: AbortController;
  readonly requests: readonly PendingCheck[];
  readonly changes: readonly InputChange[] | null;
  readonly background: boolean;
  readonly started: number;
}

export function invocationKey(value: Invocation): string {
  const { cwd, root, scope, configuration } = value.project;
  return JSON.stringify([cwd, root ?? null, scope, configuration, value.setup.registry, value.setup.capabilities]);
}
export function complete(entry: PendingCheck, outcome: CheckOutcome): void {
  if (entry.settled) return;
  entry.settled = true;
  entry.cleanup();
  entry.resolve(outcome);
}

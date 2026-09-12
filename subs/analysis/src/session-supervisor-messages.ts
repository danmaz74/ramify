import type { WorkerOptions } from 'node:worker_threads';

/** Private process envelope; the session's worker protocol remains unchanged. */
export type SupervisorRequest =
  | { readonly kind: 'start'; readonly entry: string; readonly options: WorkerOptions }
  | { readonly kind: 'post'; readonly value: unknown; readonly ports: readonly number[] }
  | { readonly kind: 'port'; readonly id: number; readonly value: unknown }
  | { readonly kind: 'port-close'; readonly id: number }
  | { readonly kind: 'terminate' };
export type SupervisorMessage =
  | { readonly kind: 'created' | 'online'; readonly threadId: number }
  | { readonly kind: 'message'; readonly value: unknown }
  | { readonly kind: 'error'; readonly message: string; readonly code?: string }
  | { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'port'; readonly id: number; readonly value: unknown }
  | { readonly kind: 'port-close'; readonly id: number };

/** Only explicitly transferred inspection ports use these private tokens. */
export function replacePorts(value: unknown, replace: (value: unknown) => unknown): unknown {
  const replaced = replace(value);
  if (replaced !== value) return replaced;
  if (Array.isArray(value)) return value.map(item => replacePorts(item, replace));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePorts(item, replace)]));
  return value;
}

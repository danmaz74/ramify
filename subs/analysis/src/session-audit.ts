import { performance } from 'node:perf_hooks';
import type { SessionFacts } from './session-facts.js';
import { captureInvalidFacts, recomputeAll, zeroTimings } from './session-revision.js';
import type { PhaseTimings, SessionState } from './session-revision.js';

export type AuditResult =
  | { readonly status: 'equal'; readonly elapsedMs: number }
  | { readonly status: 'mismatch'; readonly fields: readonly string[]; readonly facts: SessionFacts; readonly timings: PhaseTimings; readonly elapsedMs: number };

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** The retained fields that differ from a whole recomputation, by name. */
export function compareFacts(retained: SessionFacts, recomputed: SessionFacts): string[] {
  const fields: string[] = [];
  const note = (field: string, left: unknown, right: unknown): void => { if (!same(left, right)) fields.push(field); };
  note('registry', retained.registry, recomputed.registry);
  note('inventory', retained.inventory, recomputed.inventory);
  note('areas', retained.areas, recomputed.areas);
  note('areaIssues', retained.areaIssues, recomputed.areaIssues);
  note('invalid', retained.invalid, recomputed.invalid);
  for (const path of new Set([...Object.keys(retained.files), ...Object.keys(recomputed.files)])) {
    const left = retained.files[path], right = recomputed.files[path];
    if (!left || !right) { fields.push(`files[${path}]`); continue; }
    note(`files[${path}].description`, left.description, right.description);
    note(`files[${path}].accesses`, left.accesses, right.accesses);
    note(`files[${path}].coverage`, left.coverage, right.coverage);
    note(`files[${path}].candidates`, left.candidates, right.candidates);
  }
  note('catalog', retained.catalog, recomputed.catalog);
  note('linked', retained.linked, recomputed.linked);
  note('linkIssues', retained.linkIssues, recomputed.linkIssues);
  note('model', retained.model, recomputed.model);
  for (const id of new Set([...Object.keys(retained.decisions), ...Object.keys(recomputed.decisions)])) {
    note(`decisions[${id}]`, retained.decisions[id], recomputed.decisions[id]);
    const before = retained.decisions[id]?.result.decisions ?? [], after = recomputed.decisions[id]?.result.decisions ?? [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      note(`decisions[${id}].result.decisions[${i}].original.declarations`, before[i]?.original?.declarations, after[i]?.original?.declarations);
    }
  }
  note('indexes', retained.indexes, recomputed.indexes);
  return fields;
}

/**
 * The audit: recompute every description, access, the model and every
 * decision from the warm compiler and compare with the retained facts field
 * by field. The caller publishes the recomputed facts on a mismatch.
 */
export async function auditFacts(state: SessionState, signal?: AbortSignal): Promise<AuditResult> {
  const retained = state.facts;
  const inventory = state.observer?.inventory;
  if (!retained || (!inventory && !retained.invalid)) throw new Error('The audit has no retained revision to verify');
  const started = performance.now();
  const timings = zeroTimings();
  const recomputed = retained.invalid ? await captureInvalidFacts(state, signal) : await recomputeAll(state, inventory!, timings, signal);
  if (retained.invalid) timings.inventory = performance.now() - started;
  const fields = compareFacts(retained, recomputed);
  const elapsedMs = performance.now() - started;
  if (!fields.length) return { status: 'equal', elapsedMs };
  return { status: 'mismatch', fields, facts: recomputed, timings, elapsedMs };
}

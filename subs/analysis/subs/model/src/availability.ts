import type { AvailableForm, AvailableOriginal, Model, SourceArea } from './interfaces/model.js';
import { compare, immutable, sortedNames } from './data.js';
import { explainVisibility, requirementsFor, testingBlocked } from './decisions.js';

/** `consumer` must be the exact canonical area of one of `model.modules`. */
function requireArea(model: Model, consumer: SourceArea): SourceArea {
  const owner = model.modules.find((candidate) => candidate.id === consumer?.owner);
  const canonical = owner?.areas.find((candidate) => candidate.kind === consumer?.kind);
  const matches = canonical !== undefined && canonical.root === consumer.root && Array.isArray(consumer.profile)
    && JSON.stringify(sortedNames(consumer.profile)) === JSON.stringify(sortedNames(canonical.profile));
  if (!matches) throw new TypeError(`Unknown source area "${String(consumer?.owner)}"`);
  return canonical!;
}

function byOwnerFileBinding(a: AvailableOriginal, b: AvailableOriginal): number {
  return compare(a.original.owner, b.original.owner) || compare(a.original.file, b.original.file)
    || compare(a.original.binding, b.original.binding) || compare(a.original.kind, b.original.kind);
}

/**
 * Every foreign original available to `consumer`, in exactly one form each.
 *
 * Shares `explainImport`'s testing-origin, visibility and tag-requirement
 * rules through the private helpers in `decisions.ts`: an original is
 * present here precisely when at least one binding request for it would be
 * `explainImport`-allowed from this consumer, and absent when every request
 * would be denied. Same-owner originals are excluded; the result is unique
 * by original identity and byte-ordered by owner, file and binding.
 */
export function listAvailableOriginals(model: Model, consumer: SourceArea): readonly AvailableOriginal[] {
  const area = requireArea(model, consumer);
  const results: AvailableOriginal[] = [];
  for (const original of model.originals) {
    if (original.id.owner === area.owner) continue; // Same-owner originals are absent from the catalog.
    if (testingBlocked(area.profile, original.origin.area)) continue;
    if (!explainVisibility(model, area.owner, original.id).visible) continue;
    const requirements = requirementsFor(model, area.profile, original, 'value');
    if (requirements.some(({ kind, satisfied }) => kind === 'required-importer' && !satisfied)) continue;
    const valueBlocked = requirements.some(({ kind, satisfied }) => kind === 'required-symbol' && !satisfied);
    const form: AvailableForm | null = original.hasValue && !valueBlocked ? 'value'
      : original.hasType ? 'type-only' : null;
    if (form) results.push({ original: original.id, form });
  }
  return immutable(results.sort(byOwnerFileBinding));
}

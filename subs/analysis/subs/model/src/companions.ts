import type { CompanionViolation, Destination, Model, OriginalId, SourceLocation, TagName } from './interfaces/model.js';
import { compare, immutable, sortedNames } from './data.js';
import { exposureIndexFor, storedKey, visibleIn, visibleInEveryProperDescendant } from './exposure-index.js';
import type { ExposureIndex } from './exposure-index.js';
import { requiredImporterTags } from './profiles.js';

/**
 * The required-importer tags a companion carries. A companion absent from the
 * model's originals is an owned binding that is not exported, so it carries
 * exactly those of its defining source area.
 */
function companionRequiredTags(model: Model, index: ExposureIndex, id: OriginalId): readonly TagName[] {
  const known = index.originals.get(storedKey(id));
  if (known) return requiredImporterTags(model.registry, known.tags);
  const areas = index.modules.get(id.owner)?.areas ?? [];
  const area = areas.find(({ kind }) => kind === (id.file.startsWith('tests/') ? 'tests' : 'ordinary'));
  return requiredImporterTags(model.registry, area?.profile ?? []);
}

function locationOrder(a: SourceLocation, b: SourceLocation): number {
  return compare(a.file, b.file) || a.start - b.start || a.end - b.end || a.line - b.line || a.column - b.column;
}

function violationOrder(a: CompanionViolation, b: CompanionViolation): number {
  return locationOrder(a.statement, b.statement) || compare(storedKey(a.original), storedKey(b.original))
    || compare(storedKey(a.companion), storedKey(b.companion)) || compare(a.destination, b.destination)
    || compare(a.reason, b.reason);
}

/**
 * Every exposure step that makes a symbol visible where a signature companion
 * is not type-available.
 *
 * For each effective exposure of `S` by `M` through a destination that makes
 * `S` visible somewhere, and each companion `T`:
 * - `not-visible`: `T` is visible in `M` but not in `M`'s parent (to parent)
 *   or not in every proper descendant of `M` (to descendants). When `T` is not
 *   visible in `M`, an earlier step carries the violation. It is reported at
 *   the exposure's first statement.
 * - `requires-tag`: `T` carries required-importer tags `S` lacks. It does not
 *   depend on the step and is reported at each of the owner's exposure
 *   statements of `S`, naming `parent` when that exposure has a to-parent
 *   step, otherwise `descendants`.
 *
 * Tag comparison reads each definition's kind, never a tag's name;
 * required-symbol tags are not compared. The result never affects visibility
 * or import decisions. Ordered by statement location, original key, then
 * companion key.
 */
export function listCompanionViolations(model: Model): readonly CompanionViolation[] {
  const index = exposureIndexFor(model);
  const violations: CompanionViolation[] = [];
  for (const exposure of model.exposures) {
    if (!exposure.effective || !exposure.evidence.length) continue;
    const symbol = index.originals.get(storedKey(exposure.original));
    const module = index.modules.get(exposure.module);
    if (!symbol || !module || !symbol.companions.named.length) continue;
    // An exposure to parent at the root makes the symbol visible nowhere.
    const steps = exposure.destinations.filter((destination): destination is Destination =>
      destination === 'descendants' || module.parent !== null);
    if (!steps.length) continue;
    const base = { module: module.id, original: symbol.id };
    for (const companion of symbol.companions.named) {
      if (visibleIn(index, companion, module.id)) {
        for (const destination of steps) {
          const available = destination === 'parent' ? visibleIn(index, companion, module.parent!)
            : visibleInEveryProperDescendant(index, companion, module.id);
          if (!available) violations.push({ ...base, companion, destination, reason: 'not-visible', tags: [],
            statement: exposure.evidence[0] });
        }
      }
      if (exposure.provider !== null) continue;
      const missing = sortedNames(companionRequiredTags(model, index, companion).filter((tag) => !symbol.tags.includes(tag)));
      if (!missing.length) continue;
      const destination: Destination = steps.includes('parent') ? 'parent' : 'descendants';
      for (const statement of exposure.evidence) {
        violations.push({ ...base, companion, destination, reason: 'requires-tag', tags: missing, statement });
      }
    }
  }
  return immutable(violations.sort(violationOrder));
}

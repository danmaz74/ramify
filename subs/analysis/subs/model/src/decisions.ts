import type { Exposure, ExposureHop, ImportDecision, ImportQuestion, Model, ModuleId, OriginalId, SourceOrigin, TagRequirement, VisibilityDecision } from './interfaces/model.js';
import { compare, immutable, locations, validLocation } from './data.js';
import { originalKey } from './identity.js';
import { canonicalOrigin } from './model.js';

function requireModule(model: Model, id: ModuleId) {
  const module = model.modules.find((candidate) => candidate.id === id);
  if (!module) throw new TypeError(`Unknown module "${id}"`);
  return module;
}

function requireOriginal(model: Model, id: OriginalId) {
  const key = originalKey(id);
  // buildModel already validates every canonical candidate. Compare those
  // fields directly instead of validating and serializing the full catalogue
  // again for each individual access.
  const original = model.originals.find(({ id: candidate }) => candidate.kind === id.kind
    && candidate.owner === id.owner && candidate.file === id.file && candidate.binding === id.binding);
  if (!original) throw new TypeError(`Unknown original ${key}`);
  return original;
}

function pathOrder(a: readonly ExposureHop[], b: readonly ExposureHop[]): number {
  return a.length - b.length || compare(JSON.stringify(a), JSON.stringify(b));
}

export function explainVisibility(model: Model, importer: ModuleId, original: OriginalId): VisibilityDecision {
  const receiver = requireModule(model, importer);
  const owned = requireOriginal(model, original);
  return visibilityFor(model, receiver, owned);
}

function visibilityFor(model: Model, receiver: Model['modules'][number], owned: Model['originals'][number]): VisibilityDecision {
  const importer = receiver.id;
  const exposures = model.exposures.filter((exposure) => originalKey(exposure.original) === originalKey(owned.id));
  const ancestors = new Set<ModuleId>();
  let parent = receiver.parent;
  while (parent !== null) {
    ancestors.add(parent);
    parent = requireModule(model, parent).parent;
  }
  function reaches(exposure: Exposure): boolean {
    return (exposure.destinations.includes('parent') && requireModule(model, exposure.module).parent === importer)
      || (exposure.destinations.includes('descendants') && ancestors.has(exposure.module));
  }
  const prefixes = new Map<Exposure, readonly ExposureHop[]>();
  for (const exposure of [...exposures].sort((a, b) => b.module.split('/').length - a.module.split('/').length)) {
    if (!exposure.effective) continue;
    if (exposure.provider === null) {
      prefixes.set(exposure, []);
      continue;
    }
    const candidates = exposures.filter((candidate) => candidate.module === exposure.provider
      && candidate.effective && candidate.destinations.includes('parent')).map((candidate) => [
        ...prefixes.get(candidate)!,
        { module: candidate.module, destination: 'parent' as const, evidence: candidate.evidence },
      ]);
    prefixes.set(exposure, candidates.sort(pathOrder)[0]);
  }
  const paths: (readonly ExposureHop[])[] = [];
  for (const exposure of exposures.filter((candidate) => candidate.effective && reaches(candidate))) {
    const destination = requireModule(model, exposure.module).parent === importer
      && exposure.destinations.includes('parent') ? 'parent' : 'descendants';
    paths.push([...prefixes.get(exposure)!, { module: exposure.module, destination, evidence: exposure.evidence }]);
  }
  const ineffective = new Set(exposures.filter((exposure) => !exposure.effective
    && (exposure.module === importer || reaches(exposure))));
  // Follow the named provider chain so a denied consumer also receives the
  // intermediate ineffective selections that explain the missing receipt.
  for (const selection of ineffective) {
    for (const provider of exposures) {
      if (!provider.effective && provider.module === selection.provider) ineffective.add(provider);
    }
  }
  return immutable({ visible: owned.id.owner === importer || paths.length > 0, importer, original: owned.id,
    paths: owned.id.owner === importer ? [[]] : paths,
    ineffective: exposures.filter((exposure) => ineffective.has(exposure)) });
}

export function explainImport(model: Model, question: ImportQuestion): ImportDecision {
  function origin(value: SourceOrigin): SourceOrigin {
    const established = canonicalOrigin(model.modules, value);
    if (!established) throw new TypeError('Import question requires an established source origin and profile');
    return established;
  }
  if (!question || !validLocation(question.location) || !Array.isArray(question.forwarding)
    || (question.selection !== null && question.selection?.request !== 'value' && question.selection?.request !== 'type-only')) {
    throw new TypeError('Invalid import question');
  }
  const importer = origin(question.importer);
  const target = origin(question.target);
  const forwarding = question.forwarding.map(origin);
  const original = question.selection ? requireOriginal(model, question.selection.original) : null;
  if (original && question.selection?.request === 'value' && !original.hasValue) {
    throw new TypeError('A value request requires a runtime binding; source interpretation must classify type-only originals');
  }
  const establishedQuestion: ImportQuestion = { importer, target, forwarding, location: locations([question.location])[0],
    selection: original ? { original: original.id, request: question.selection!.request } : null };
  const checkedOrigins = [target, ...forwarding, ...(original ? [original.origin] : [])];
  const blockingOrigins = importer.area.profile.includes('testing') ? []
    : checkedOrigins.filter(({ area }) => area.profile.includes('testing'));
  function decision(status: ImportDecision['status'], reason: ImportDecision['reason'],
    visibility: VisibilityDecision | null = null, requirements: readonly TagRequirement[] = []): ImportDecision {
    return immutable({ status, reason, question: establishedQuestion, original, visibility,
      requirements, checkedOrigins, blockingOrigins });
  }
  if (blockingOrigins.length) return decision('denied', 'testing-origin');
  if (!original) return decision('allowed', 'symbol-free');
  const visibility = visibilityFor(model, requireModule(model, importer.area.owner), original);
  if (original.id.owner === importer.area.owner) return decision('allowed', 'same-owner', visibility);
  if (!visibility.visible) return decision('denied', 'not-visible', visibility);
  const requirements: TagRequirement[] = [];
  for (const kind of ['required-importer', 'required-symbol'] as const) {
    for (const definition of model.registry.definitions.filter((item) => item.kind === kind)) {
      const applies = kind === 'required-importer' ? original.tags.includes(definition.name)
        : question.selection!.request === 'value' && importer.area.profile.includes(definition.name);
      if (applies) requirements.push({ tag: definition.name, kind,
        satisfied: (kind === 'required-importer' ? importer.area.profile : original.tags).includes(definition.name) });
    }
  }
  const failed = requirements.find(({ satisfied }) => !satisfied);
  return failed ? decision('denied', failed.kind === 'required-importer' ? 'required-importer-tag' : 'required-symbol-tag', visibility, requirements)
    : decision('allowed', 'exposed', visibility, requirements);
}

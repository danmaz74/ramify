import type { Exposure, Model, ModelInput, ModelIssue, ModelResult, ModuleRecord, Original, SourceArea, SourceOrigin } from './interfaces/model.js';
import { compare, immutable, issue, locations, namePattern, sortedNames, validDeclarationLocation, validLocation, validPath, validText } from './data.js';
import { originalKey, validModuleId, validOriginalId } from './identity.js';
import { deriveSourceAreas, requiredImporterTags, tagIssues } from './profiles.js';
import { validateRegistry } from './registry.js';

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify(sortedNames(a)) === JSON.stringify(sortedNames(b));
}

/** A supplied origin must use the area's actual profile, including tests precedence. */
export function canonicalOrigin(modules: readonly ModuleRecord[], origin: SourceOrigin): SourceOrigin | undefined {
  if (!origin || !validPath(origin.file) || !origin.area) return undefined;
  const owner = modules.find(({ id }) => id === origin.area.owner);
  const ordinary = owner?.areas.find(({ kind }) => kind === 'ordinary');
  if (!ordinary || !origin.file.startsWith(`${ordinary.root}/`)) return undefined;
  const relative = origin.file.slice(ordinary.root.length + 1);
  const kind = relative.startsWith('tests/') ? 'tests' : 'ordinary';
  const area = owner?.areas.find((candidate) => candidate.kind === kind);
  if (!area || origin.area.kind !== kind || origin.area.root !== area.root
    || !Array.isArray(origin.area.profile) || !sameNames(origin.area.profile, area.profile)) return undefined;
  return { file: origin.file, area };
}

export function exposureOrder(a: Exposure, b: Exposure): number {
  return compare(a.module, b.module) || compare(originalKey(a.original), originalKey(b.original))
    || compare(JSON.stringify(a.evidence), JSON.stringify(b.evidence))
    || compare(JSON.stringify(a), JSON.stringify(b));
}

/** Validate the complete graph before publishing any permission data. */
export function buildModel(input: ModelInput): ModelResult<Model> {
  let captured: ModelInput;
  try {
    captured = immutable(input);
  } catch (error) {
    return immutable({ status: 'invalid', issues: [issue('invalid-tree', String(error))] });
  }
  if (!captured || !Array.isArray(captured.modules) || !Array.isArray(captured.originals)
    || !Array.isArray(captured.exposures)) {
    return immutable({ status: 'invalid', issues: [issue('invalid-tree', 'Expected module, original and exposure arrays')] });
  }
  const registry = validateRegistry(captured.registry);
  if (registry.status === 'invalid') return registry;
  const issues: ModelIssue[] = [];
  const modules = new Map<string, ModuleRecord>();
  for (const record of captured.modules as readonly ModuleRecord[]) {
    if (!record || !validModuleId(record.id) || typeof record.name !== 'string'
      || !namePattern.test(record.name) || (record.parent !== null && !validModuleId(record.parent))) {
      issues.push(issue('invalid-module-id', 'Module requires a valid declared name, identity and parent'));
      continue;
    }
    const expected = record.parent === null ? record.name : `${record.parent}/${record.name}`;
    if (record.id !== expected) issues.push(issue('invalid-module-id', `Module "${record.id}" must have declared identity "${expected}"`));
    if (modules.has(record.id)) issues.push(issue('duplicate-module', `Duplicate module "${record.id}"`));
    if ('registry' in record) issues.push(issue('invalid-registry', `Module "${record.id}" cannot override the registry`));
    if (!Array.isArray(record.areas)) {
      issues.push(issue('invalid-tree', `Module "${record.id}" has no source areas`));
      continue;
    }
    const ordinary = record.areas.find((area: SourceArea) => area?.kind === 'ordinary');
    const derived = deriveSourceAreas(registry.value, record.id, ordinary?.root, record.headerTags);
    if (derived.status === 'invalid') {
      issues.push(...derived.issues);
      continue;
    }
    if (record.areas.length !== 2 || derived.value.some((area) => {
      const supplied = record.areas.filter((candidate: SourceArea) => candidate?.kind === area.kind);
      return supplied.length !== 1 || supplied[0].owner !== area.owner || supplied[0].root !== area.root
        || !Array.isArray(supplied[0].profile) || !sameNames(supplied[0].profile, area.profile);
    })) issues.push(issue('invalid-tree', `Module "${record.id}" source profiles must match its header and fixed tests profile`));
    modules.set(record.id, { id: record.id, name: record.name, parent: record.parent,
      headerTags: sortedNames(record.headerTags), areas: derived.value });
  }
  if ([...modules.values()].filter(({ parent }) => parent === null).length !== 1) {
    issues.push(issue('invalid-tree', 'The ownership tree must have exactly one root'));
  }
  for (const module of modules.values()) {
    if (module.parent !== null && !modules.has(module.parent)) {
      issues.push(issue('invalid-tree', `Unknown parent "${module.parent}" for module "${module.id}"`));
    }
    const seen = new Set<string>([module.id]);
    let parent = module.parent;
    while (parent !== null && modules.has(parent)) {
      if (seen.has(parent)) {
        issues.push(issue('invalid-tree', `Cyclic ownership at module "${module.id}"`));
        break;
      }
      seen.add(parent);
      parent = modules.get(parent)!.parent;
    }
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  const moduleList = [...modules.values()].sort((a, b) => compare(a.id, b.id));
  for (let index = 0; index < moduleList.length; index++) {
    const root = moduleList[index].areas[0].root;
    for (const other of moduleList.slice(index + 1)) {
      const otherRoot = other.areas[0].root;
      if (root === otherRoot || root.startsWith(`${otherRoot}/`) || otherRoot.startsWith(`${root}/`)) {
        issues.push(issue('invalid-tree', `Source roots of "${moduleList[index].id}" and "${other.id}" overlap`));
      }
    }
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  const originals = new Map<string, Original>();
  for (const original of captured.originals as readonly Original[]) {
    if (!original || !validOriginalId(original.id)
      || !Array.isArray(original.declarations) || !original.declarations.every(validDeclarationLocation)
      || !Array.isArray(original.tagEvidence) || !original.tagEvidence.every(validLocation)
      || typeof original.hasValue !== 'boolean' || typeof original.hasType !== 'boolean'
      || (!original.hasValue && !original.hasType)) {
      issues.push(issue('invalid-original', 'Original requires a canonical identity, binding existence and valid evidence'));
      continue;
    }
    const origin = canonicalOrigin(moduleList, original.origin);
    const ordinary = modules.get(original.id.owner)?.areas.find(({ kind }) => kind === 'ordinary');
    if (!origin || origin.area.owner !== original.id.owner || origin.file !== `${ordinary?.root}/${original.id.file}`) {
      issues.push(issue('invalid-original', `Original ${originalKey(original.id)} has inconsistent ownership or source origin`, original.declarations));
      continue;
    }
    const unknown = tagIssues(registry.value, original.tags, `original ${originalKey(original.id)}`, original.tagEvidence);
    issues.push(...unknown);
    if (unknown.length) continue;
    const required = requiredImporterTags(registry.value, origin.area.profile);
    const missing = required.filter((tag) => !original.tags.includes(tag));
    if (missing.length) issues.push(issue('missing-required-tag', `Original ${originalKey(original.id)} must retain: ${missing.join(', ')}`,
      [...original.declarations, ...original.tagEvidence]));
    const key = originalKey(original.id);
    const previous = originals.get(key);
    if (previous && !sameNames(previous.tags, original.tags)) {
      issues.push(issue('conflicting-tags', `Original ${key} has conflicting tag sets`, [...previous.tagEvidence, ...original.tagEvidence]));
    }
    if (previous && (previous.hasValue !== original.hasValue || previous.hasType !== original.hasType)) {
      issues.push(issue('invalid-original', `Original ${key} has inconsistent binding existence`, [...previous.declarations, ...original.declarations]));
    }
    const { kind, owner, file, binding } = original.id;
    originals.set(key, { id: { kind, owner, file, binding }, origin, hasValue: original.hasValue, hasType: original.hasType,
      tags: sortedNames(original.tags), declarations: locations([...(previous?.declarations ?? []), ...original.declarations]),
      tagEvidence: locations([...(previous?.tagEvidence ?? []), ...original.tagEvidence]) });
  }
  const exposures: Exposure[] = [];
  const exposedNames = new Map<string, Exposure>();
  for (const exposure of captured.exposures as readonly Exposure[]) {
    if (!exposure || !modules.has(exposure.module) || !validOriginalId(exposure.original)
      || !originals.has(originalKey(exposure.original)) || !Array.isArray(exposure.names)
      || exposure.names.length === 0 || !exposure.names.every(validText)
      || !Array.isArray(exposure.destinations) || exposure.destinations.length === 0
      || !exposure.destinations.every((destination) => destination === 'parent' || destination === 'descendants')
      || !Array.isArray(exposure.evidence) || !exposure.evidence.every(validLocation)
      || typeof exposure.effective !== 'boolean') {
      issues.push(issue('ungrounded-exposure', 'Exposure requires established modules, originals, names, destinations and evidence'));
      continue;
    }
    if ('tags' in exposure) issues.push(issue('conflicting-tags', 'An exposure cannot reassign original tags', exposure.evidence));
    if (exposure.provider === null ? exposure.module !== exposure.original.owner
      : modules.get(exposure.provider)?.parent !== exposure.module) {
      issues.push(issue('ungrounded-exposure', `Exposure in "${exposure.module}" requires ownership or a direct child provider`, exposure.evidence));
      continue;
    }
    for (const name of exposure.names) {
      const key = JSON.stringify([exposure.module, name]);
      const previous = exposedNames.get(key);
      if (previous && originalKey(previous.original) !== originalKey(exposure.original)) {
        issues.push(issue('ungrounded-exposure', `Exposed name "${name}" in "${exposure.module}" denotes distinct originals`, [...previous.evidence, ...exposure.evidence]));
      }
      exposedNames.set(key, exposure);
    }
    exposures.push({ module: exposure.module, original: originals.get(originalKey(exposure.original))!.id,
      names: sortedNames(exposure.names), destinations: [...new Set(exposure.destinations)].sort(compare),
      evidence: locations(exposure.evidence), provider: exposure.provider, effective: exposure.effective });
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  // A child's complete name set exists even when its to-parent contract is empty.
  // Resolve leaves first; a claimed effective bit cannot manufacture a missing hop.
  const byModule = new Map(moduleList.map((module) => [module.id, exposures.filter(({ module: id }) => id === module.id)]));
  const toParent = new Map<string, Set<string>>();
  for (const module of [...moduleList].sort((a, b) => b.id.split('/').length - a.id.split('/').length || compare(a.id, b.id))) {
    const received = new Set<string>();
    for (const exposure of byModule.get(module.id)!) {
      const key = originalKey(exposure.original);
      if (exposure.provider !== null && !byModule.get(exposure.provider)!.some((item) => originalKey(item.original) === key)) {
        issues.push(issue('ungrounded-exposure', `Child "${exposure.provider}" declares no selection of ${key}`, exposure.evidence));
        continue;
      }
      const effective = exposure.provider === null || toParent.get(exposure.provider)!.has(key);
      if (exposure.effective !== effective) {
        issues.push(issue('ungrounded-exposure', `Exposure of ${key} in "${module.id}" has an incorrect effective state`, exposure.evidence));
      }
      if (effective && module.parent !== null && exposure.destinations.includes('parent')) received.add(key);
    }
    toParent.set(module.id, received);
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  // Equivalent repeated selections merge as sets, retaining all declaration sites.
  const merged = new Map<string, Exposure>();
  for (const exposure of exposures) {
    const key = JSON.stringify([exposure.module, originalKey(exposure.original), exposure.provider, exposure.effective]);
    const previous = merged.get(key);
    merged.set(key, { ...exposure, names: sortedNames([...(previous?.names ?? []), ...exposure.names]),
      destinations: [...new Set([...(previous?.destinations ?? []), ...exposure.destinations])].sort(compare),
      evidence: locations([...(previous?.evidence ?? []), ...exposure.evidence]) });
  }
  return immutable({ status: 'valid', value: { registry: registry.value, modules: moduleList,
    originals: [...originals.values()].sort((a, b) => compare(originalKey(a.id), originalKey(b.id))),
    exposures: [...merged.values()].sort(exposureOrder) } });
}

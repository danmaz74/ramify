import { assignOriginalTags, buildModel, deriveSourceAreas, originalKey } from '../../model/src/index.js';
import type { Exposure, ModelIssue, ModuleRecord, Original, OriginalId, SourceLocation } from '../../model/src/interfaces/model.js';
import type { TextSpan } from './interfaces/syntax.js';
import type { ExpandedSelection, LinkInputs, LinkIssue, LinkedDescriptions } from './interfaces/linking.js';

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const location = (file: string, span: TextSpan): SourceLocation => ({ file, ...span });

function detached<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  function freeze(item: unknown): void {
    if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
  }
  freeze(copy);
  return copy;
}

/** Link captured facts only. No compiler objects, reads, or import decisions belong here. */
export function linkDescriptions({ registry, inventory, catalog }: LinkInputs): LinkedDescriptions {
  const issues: LinkIssue[] = [];
  const add = (code: LinkIssue['code'], message: string, locations: readonly SourceLocation[]): void => {
    if (issues.length >= 100_000) throw Object.assign(new Error('Link diagnostics exceed 100000'), { code: 'resource-limit' });
    issues.push({ code, message, locations });
  };
  const modelIssues = (items: readonly ModelIssue[], fallback: readonly SourceLocation[] = []): void => {
    for (const item of items) add(
      ['unknown-tag', 'missing-required-tag', 'conflicting-tags'].includes(item.code)
        ? item.code as LinkIssue['code'] : 'invalid-prerequisite',
      item.message, item.locations.length ? item.locations : fallback);
  };
  const invalid = (): LinkedDescriptions => detached({ status: 'invalid', issues: issues.sort((a, b) =>
    compare(a.locations[0]?.file ?? '', b.locations[0]?.file ?? '')
    || (a.locations[0]?.start ?? 0) - (b.locations[0]?.start ?? 0)
    || compare(a.code, b.code) || compare(a.message, b.message)) });
  const modules: ModuleRecord[] = [];
  for (const module of inventory.modules) {
    if (module.description.status !== 'valid') {
      add('invalid-prerequisite', `Invalid parsed description for ${module.id}`,
        module.description.issues.map(issue => location(issue.file, issue.span)));
      continue;
    }
    const doc = module.description.document;
    const site = location(doc.file, doc.module.span);
    if (doc.module.name !== module.name || JSON.stringify([...doc.module.tags].sort()) !== JSON.stringify([...module.headerTags].sort())) {
      add('invalid-prerequisite', `Inventory and description disagree for ${module.id}`, [site]);
    }
    const root = module.areas.find(area => area.kind === 'ordinary')?.root ?? '';
    const result = deriveSourceAreas(registry, module.id, root, module.headerTags);
    if (result.status === 'invalid') modelIssues(result.issues, [site]);
    else modules.push({ id: module.id, name: module.name, parent: module.parent, headerTags: module.headerTags, areas: result.value });
  }
  if (issues.length) return invalid();
  const tree = buildModel({ registry, modules, originals: [], exposures: [] });
  if (tree.status === 'invalid') { modelIssues(tree.issues); return invalid(); }

  const files = new Map(catalog.files.map(file => [file.file, file]));
  const ownedFiles = new Map(inventory.files.map(file => [file.path, file]));
  const references = new Map(inventory.references.map(ref => [JSON.stringify([ref.description, ref.statement]), ref]));
  const facts = new Map(catalog.originals.map(original => [originalKey(original.id), original]));
  if (files.size !== catalog.files.length || facts.size !== catalog.originals.length) {
    add('invalid-prerequisite', 'Catalog contains duplicate file or original identities', []);
    return invalid();
  }
  for (const file of inventory.files) if (!files.has(file.path)) {
    add('invalid-prerequisite', `Catalog is missing inventoried file ${file.path}`, []);
  }
  if (issues.length) return invalid();
  const assignments = new Map<string, { tags: readonly string[]; location: SourceLocation }[]>();
  const selections: ExpandedSelection[] = [];
  const exposures: Exposure[] = [];
  let pairCount = 0;
  type Name = { original: OriginalId; evidence: SourceLocation[] };
  const contracts = new Map<string, { names: Map<string, Name>; toParent: Set<string> }>();
  // An iterative leaf-first traversal also handles deeply grouped physical paths.
  const ordered = [...inventory.modules].sort((a, b) => b.id.split('/').length - a.id.split('/').length || compare(a.id, b.id));
  for (const module of ordered) {
    if (module.description.status !== 'valid') continue;
    const doc = module.description.document;
    const names = new Map<string, Name>();
    const toParent = new Set<string>();
    contracts.set(module.id, { names, toParent });
    for (const statement of doc.statements) {
      const site = location(doc.file, statement.span);
      const fromSite = location(doc.file, statement.from.span);
      const pairs: { name: string; original: OriginalId; effective: boolean }[] = [];
      const select = (pair: typeof pairs[number]): void => {
        if (++pairCount > 1_000_000) throw Object.assign(new Error('Expanded exposure pairs exceed 1000000'), { code: 'resource-limit' });
        pairs.push(pair);
      };
      let provider: string;
      let child: string | null = null;
      if (statement.kind === 'expose-sub') {
        const found = inventory.modules.find(candidate => candidate.parent === module.id && candidate.name === statement.from.value);
        if (!found) { add('unknown-child', `No direct child ${JSON.stringify(statement.from.value)} in ${module.id}`, [fromSite]); continue; }
        provider = child = found.id;
        const contract = contracts.get(child)!;
        const selected = statement.selection.kind === 'wildcard'
          ? [...contract.names].filter(([, entry]) => contract.toParent.has(originalKey(entry.original)))
            .map(([name]) => ({ name, alias: name, span: statement.selection.kind === 'wildcard' ? statement.selection.span : statement.span }))
          : statement.selection.names;
        for (const selectedName of selected) {
          const entry = contract.names.get(selectedName.name);
          if (!entry) add('missing-export', `Child ${child} declares no exposed name ${JSON.stringify(selectedName.name)}`, [location(doc.file, selectedName.span)]);
          else select({ name: selectedName.alias, original: entry.original, effective: contract.toParent.has(originalKey(entry.original)) });
        }
      } else {
        const reference = references.get(JSON.stringify([doc.file, statement.index]));
        if (!reference || reference.decoded !== statement.from.value || reference.status !== 'file') {
          add(reference?.status === 'missing' ? 'missing-file' : 'invalid-prerequisite',
            `No validated exact file for ${JSON.stringify(statement.from.value)} (${reference?.status ?? 'absent reference'})`, [fromSite]);
          continue;
        }
        provider = reference.normalized;
        const owned = ownedFiles.get(provider);
        if (!owned || owned.owner !== module.id) {
          add('foreign-original', `File ${provider} does not belong to ${module.id}`, [fromSite]); continue;
        }
        if (statement.selection.kind === 'wildcard' && (statement.kind !== 'expose-src' || !reference.interfaceEligible)) {
          add('invalid-wildcard-target', `Wildcard file ${provider} must be beneath this owner's src/interfaces/`, [fromSite]); continue;
        }
        // Even an empty expansion must validate the spelling of its tag clause.
        if (statement.tags) for (const tag of statement.tags.values) {
          if (!registry.definitions.some(definition => definition.name === tag)) {
            add('unknown-tag', `Unknown tag ${JSON.stringify(tag)}`, [location(doc.file, statement.tags.span)]);
          }
        }
        const file = files.get(provider);
        if (!file) { add('invalid-prerequisite', `Catalog is missing inventoried file ${provider}`, [fromSite]); continue; }
        const related = catalog.coverage.filter(limit => file.issueIds.includes(limit.id)).map(limit => limit.location);
        if (statement.selection.kind === 'wildcard' && (file.state !== 'complete' || file.issueIds.length)) {
          add(file.state === 'ambiguous' ? 'ambiguous-expansion' : 'incomplete-expansion',
            `Cannot expand ${file.state} export description for ${provider}`, [site, ...related]); continue;
        }
        const selected = statement.selection.kind === 'wildcard'
          ? file.exports.map(entry => ({ name: entry.name, alias: entry.name, span: statement.selection.kind === 'wildcard' ? statement.selection.span : statement.span }))
          : statement.selection.names;
        for (const selectedName of selected) {
          const entries = file.exports.filter(entry => entry.name === selectedName.name);
          const entry = entries[0];
          const selectedSite = location(doc.file, selectedName.span);
          if (!entry) {
            add(file.state === 'complete' ? 'missing-export' : 'incomplete-expansion',
              `Export ${JSON.stringify(selectedName.name)} is ${file.state === 'complete' ? 'absent from' : 'not established in'} ${provider}`, [selectedSite, ...related]);
          } else if (entries.length !== 1 || !entry.original || !facts.has(originalKey(entry.original))) {
            add(file.state === 'ambiguous' || entries.length > 1 ? 'ambiguous-expansion' : 'incomplete-expansion',
              `Export ${JSON.stringify(selectedName.name)} in ${provider} has no unique grounded original`, [selectedSite, ...related]);
          } else if (entry.original.owner !== module.id) {
            add('foreign-original', `Export ${JSON.stringify(selectedName.name)} in ${provider} belongs to ${entry.original.owner}`,
              [selectedSite, ...facts.get(originalKey(entry.original))!.declarations]);
          } else {
            select({ name: selectedName.alias, original: entry.original, effective: true });
            if (statement.tags) {
              const key = originalKey(entry.original);
              const all = assignments.get(key) ?? [];
              all.push({ tags: statement.tags.values, location: location(doc.file, statement.tags.span) });
              assignments.set(key, all);
            }
          }
        }
      }
      const unique = new Map<string, typeof pairs[number]>();
      for (const pair of pairs) {
        const key = originalKey(pair.original);
        const previous = names.get(pair.name);
        if (previous && originalKey(previous.original) !== key) {
          add('name-collision', `Exposed name ${JSON.stringify(pair.name)} in ${module.id} denotes different originals`, [...previous.evidence, site]);
        } else names.set(pair.name, { original: pair.original, evidence: [...(previous?.evidence ?? []), site] });
        if (pair.effective && module.parent !== null && statement.destinations.includes('parent')) toParent.add(key);
        unique.set(JSON.stringify([pair.name, key]), pair);
        exposures.push({ module: module.id, original: pair.original, names: [pair.name], destinations: statement.destinations,
          provider: child, effective: pair.effective, evidence: [site] });
      }
      selections.push({ module: module.id, statement: site, form: statement.kind, selector: statement.selection.kind,
        provider, destinations: [...statement.destinations].sort(compare),
        pairs: [...unique.values()].sort((a, b) => compare(a.name, b.name) || compare(originalKey(a.original), originalKey(b.original))) });
    }
  }
  const originals: Original[] = [];
  for (const original of catalog.originals) {
    const result = assignOriginalTags(registry, original.origin.area, assignments.get(originalKey(original.id)) ?? []);
    if (result.status === 'invalid') modelIssues(result.issues, original.declarations);
    else originals.push({ ...original, tags: result.value.tags, tagEvidence: result.value.evidence });
  }
  if (issues.length) return invalid();
  const model = buildModel({ registry, modules, originals, exposures });
  if (model.status === 'invalid') { modelIssues(model.issues); return invalid(); }
  return detached({ status: 'valid', modelInput: model.value, selections: selections.sort((a, b) =>
    compare(a.module, b.module) || a.statement.start - b.statement.start) });
}

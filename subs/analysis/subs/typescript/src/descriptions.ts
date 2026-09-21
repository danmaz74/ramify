import type { Project } from 'typescript/unstable/sync';
import { originalKey } from '../../model/src/identity.js';
import type { SourceLocation } from '../../model/src/interfaces/model.js';
import { CompilerBridge } from './bridge.js';
import { assembleCatalog, describeRound, type FileRecord } from './catalog.js';
import type { CatalogDelta, CatalogExport, CatalogOriginal, FileDescription, SourceAnalysisInputs,
  SourceCatalog } from './interfaces/source.js';
import type { CatalogHost } from './resolution.js';
import { SourceFailure, type HelperInputs } from './wire.js';

export { assembleCatalog };

const order = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** Own finite compiler setup while leaving the captured input view caller-owned. */
export async function describeFiles(inputs: SourceAnalysisInputs, files: readonly string[]): Promise<readonly FileDescription[]> {
  if (inputs.signal?.aborted) throw new SourceFailure('cancelled', 'Export description was cancelled before startup');
  if (Object.values(inputs.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new SourceFailure('resource-limit', 'Source work limits must be positive safe integers');
  }
  const bridge = new CompilerBridge(inputs);
  try {
    await bridge.ready();
    return await bridge.describe(files, inputs.signal);
  } finally { await bridge.dispose(); }
}

export interface DescriptionUpdate {
  /** The descriptions this update read afresh, in byte order. */
  readonly descriptions: readonly FileDescription[];
  readonly delta: CatalogDelta;
}

/** Retained per-file export descriptions with dependency-driven recomputation.
 * It holds plain data only: every call supplies the current compiler state. */
export interface DescriptionSet {
  /** One description per owned file of the last described inventory. */
  all(): readonly FileDescription[];
  catalog(): SourceCatalog;
  describe(project: Project, inputs: HelperInputs, host: CatalogHost,
    runtime: Map<CatalogExport, boolean>, files: readonly string[]): DescriptionUpdate;
}

export function createDescriptionSet(): DescriptionSet {
  let records = new Map<string, FileRecord>();
  return {
    all: () => [...records.values()].map(record => record.description).sort((a, b) => order(a.file, b.file)),
    catalog() { return assembleCatalog(this.all()); },
    describe(project, inputs, host, runtime, files) {
      const update = recompute(records, project, inputs, host, runtime, files);
      records = update.records;
      return { descriptions: update.descriptions, delta: update.delta };
    },
  };
}

/** Positions are evidence a description carries, not part of its surface. A file
 * whose declarations only moved is reported as moved, never as changed. */
function surface(description: FileDescription): string {
  const place = (location: SourceLocation): string => location.file;
  // A note's identity is its code, file, position and message. Compare the
  // parts a declaration move cannot change, here and in the file's own list.
  const note = (id: string): unknown => {
    try {
      const parts: unknown = JSON.parse(id);
      return Array.isArray(parts) && parts.length === 4 ? [parts[0], parts[1], parts[3]] : id;
    } catch { return id; }
  };
  return JSON.stringify({
    file: description.file,
    exports: { ...description.exports, issueIds: description.exports.issueIds.map(note) },
    originals: description.originals.map(original => ({ ...original, declarations: original.declarations.map(place),
      companions: { ...original.companions, evidence: original.companions.evidence.map(place) } })),
    // A note's identity contains its position, so compare its located parts.
    coverage: description.coverage.map(issue => ({ code: issue.code, message: issue.message,
      compilerCode: issue.compilerCode ?? null, file: issue.location.file, related: issue.related.map(place) })),
    dependencies: description.dependencies,
  });
}

/** Whether creating `created` can satisfy a resolution that recorded `absent`:
 * the path itself, or a specifier base the compiler completes with an extension
 * or suffix (`src/soon` for `src/soon.ts`) or as a directory (`src/soon/index.ts`).
 * An extensionless or aliased specifier records only its base. */
export function completes(absent: string, created: string): boolean {
  return created === absent || created.startsWith(`${absent}.`) || created.startsWith(`${absent}/`);
}

function sameOriginal(left: CatalogOriginal | undefined, right: CatalogOriginal): boolean {
  return !!left && JSON.stringify(left) === JSON.stringify(right);
}

function originalsOf(record: FileRecord | undefined): ReadonlyMap<string, CatalogOriginal> {
  return new Map((record?.description.originals ?? []).map(original => [originalKey(original.id), original]));
}

/** Recompute the selected descriptions and everything a changed description can
 * reach, until the selection stops growing. Recomputing more than the minimum is
 * allowed here; recomputing less would leave a stale description behind. */
function recompute(previous: ReadonlyMap<string, FileRecord>, project: Project, inputs: HelperInputs,
  host: CatalogHost, runtime: Map<CatalogExport, boolean>, files: readonly string[]): {
    readonly records: Map<string, FileRecord>; readonly descriptions: readonly FileDescription[]; readonly delta: CatalogDelta } {
  const kinds = new Map(inputs.inventory.files.map(file => [file.path, file.kind]));
  const owned = new Set(kinds.keys());
  const deleted = [...previous.keys()].filter(path => !owned.has(path));
  // A file with no retained description has to be described whatever the call
  // names, so a cold set describes the whole project and later calls are
  // incremental against a complete one.
  const created = [...owned].filter(path => !previous.has(path));
  const selected = new Set<string>(created);
  for (const path of files) {
    if (!owned.has(path)) {
      if (!deleted.includes(path)) throw new SourceFailure('unavailable', `Cannot describe non-owned file ${path}`);
      continue;
    }
    selected.add(path);
  }
  const requested = new Set(files);
  for (const [path, record] of previous) {
    if (!owned.has(path) || selected.has(path)) continue;
    const dependencies = record.description.dependencies;
    if (deleted.some(gone => dependencies.files.includes(gone) || dependencies.resources.includes(gone)
      || dependencies.shims.includes(gone)) || created.some(added => dependencies.absent.some(absent => completes(absent, added)))) selected.add(path);
    // A shim's or an augmenting file's own export description does not carry
    // what it says here, so its content identity is the edge that reaches it.
    if (dependencies.shims.some(shim => requested.has(shim))
      || record.contributors.some(file => requested.has(file))) selected.add(path);
  }
  const rounds = owned.size + 4;
  let fresh = new Map<string, FileRecord>();
  for (let round = 0; ; round++) {
    const retained = new Map([...previous].filter(([path]) => owned.has(path) && !selected.has(path)));
    const described = describeRound(project, inputs, host, runtime, selected, retained);
    fresh = new Map(described.records);
    const additions = new Set<string>();
    const changed = new Set([...fresh].filter(([path, record]) =>
      !previous.has(path) || surface(previous.get(path)!.description) !== surface(record.description)
      || JSON.stringify(previous.get(path)!.description) !== JSON.stringify(record.description)).map(([path]) => path));
    for (const [path, record] of previous) {
      if (!owned.has(path) || fresh.has(path)) continue;
      const dependencies = record.description.dependencies;
      if (dependencies.files.some(file => changed.has(file)) || dependencies.resources.some(file => changed.has(file))
        || dependencies.shims.some(file => changed.has(file))) additions.add(path);
      // A description shaped by other files' content is the union of what they
      // contribute, so a round that rewrote one of them rewrites it too.
      if (record.contributors.some(file => fresh.has(file) && !fresh.get(file)!.contributions.includes(path))) additions.add(path);
    }
    for (const [path, record] of fresh) {
      for (const target of record.contributions) {
        if (fresh.has(target) || !owned.has(target)) continue;
        if (!previous.get(target)?.contributors.includes(path)) additions.add(target);
      }
      // A resource reached by a forwarding file alone was described without the
      // importers that also describe it; selecting it reads them as well.
      if (kinds.get(path) === 'resource' && !selected.has(path)) additions.add(path);
    }
    // Originals and notes always belong to a description the round read, so a
    // file this round spoke for without describing joins the selection.
    for (const original of described.foreignOriginals) {
      const file = original.origin.file;
      if (owned.has(file) && !sameOriginal(originalsOf(previous.get(file)).get(originalKey(original.id)), original)) additions.add(file);
    }
    for (const issue of described.foreignCoverage) {
      const file = issue.location.file;
      if (owned.has(file) && !previous.get(file)?.description.coverage.some(retained => retained.id === issue.id)) additions.add(file);
    }
    if (![...additions].some(path => !selected.has(path))) break;
    if (round >= rounds) throw new SourceFailure('resource-limit', 'Export descriptions did not settle');
    for (const path of additions) selected.add(path);
  }
  const records = new Map<string, FileRecord>();
  for (const path of [...owned].sort(order)) {
    const record = fresh.get(path) ?? previous.get(path);
    if (record) records.set(path, record);
  }
  return { records, descriptions: [...fresh.values()].map(record => record.description), delta: delta(previous, fresh, deleted) };
}

function delta(previous: ReadonlyMap<string, FileRecord>, fresh: ReadonlyMap<string, FileRecord>,
  deleted: readonly string[]): CatalogDelta {
  const recomputed = [...fresh.keys()].sort(order);
  const changed: string[] = [], moved: string[] = [];
  const changedOriginals: CatalogOriginal['id'][] = [], removedOriginals: CatalogOriginal['id'][] = [];
  for (const path of recomputed) {
    const record = fresh.get(path)!, before = previous.get(path);
    if (!before || surface(before.description) !== surface(record.description)) changed.push(path);
    else if (JSON.stringify(before.description) !== JSON.stringify(record.description)) moved.push(path);
    const retained = originalsOf(before);
    for (const original of record.description.originals) {
      if (!sameOriginal(retained.get(originalKey(original.id)), original)) changedOriginals.push(original.id);
    }
    const current = originalsOf(record);
    for (const [key, original] of retained) if (!current.has(key)) removedOriginals.push(original.id);
  }
  for (const path of [...deleted].sort(order)) {
    for (const original of previous.get(path)?.description.originals ?? []) removedOriginals.push(original.id);
  }
  return { recomputed, changed, moved, changedOriginals, removedOriginals };
}

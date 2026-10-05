import { assignOriginalTags, buildModel, createDefaultTagRegistry, deriveSourceAreas, explainVisibility, originalKey } from '../index.js';
import type { Destination, Exposure, ImportQuestion, Model, ModelResult, ModuleRecord, Original, ResolvedTagRegistry, SignatureCompanions, SourceArea, SourceLocation } from '../index.js';
import { exposureIndexFor, visibleIn } from '../exposure-index.js';

/** The companion facts of an original whose signature names no project original. */
export const noCompanions: SignatureCompanions = { named: [], evidence: [], inferred: false, unresolved: 0 };

/** Companion facts naming `named` in `originalKey` order, each with its own evidence. */
export function companionsOf(named: readonly Original[], options: Partial<Omit<SignatureCompanions, 'named' | 'evidence'>> = {}): SignatureCompanions {
  const sorted = [...named].sort((a, b) => originalKey(a.id) < originalKey(b.id) ? -1 : 1);
  return { ...noCompanions, ...options, named: sorted.map(({ id }) => id),
    evidence: sorted.map((_, index) => location('signature.ts', 10 + index)) };
}

export function valid<T>(result: ModelResult<T>): T {
  if (result.status === 'invalid') throw new Error(JSON.stringify(result.issues));
  return result.value;
}

export function location(file = 'module.ramify', start = 0): SourceLocation {
  return { file, start, end: start + 1, line: start + 1, column: 1 };
}

export function moduleRecord(id: string, tags: readonly string[] = [], registry = createDefaultTagRegistry(), root?: string): ModuleRecord {
  const parts = id.split('/');
  const name = parts.pop()!;
  const parent = parts.length ? parts.join('/') : null;
  const sourceRoot = root ?? [...parts.slice(1), name].slice(parent === null ? 1 : 0).map((part) => `subs/${part}/`).join('') + 'src';
  return { id, name, parent, headerTags: tags, areas: valid(deriveSourceAreas(registry, id, sourceRoot, tags)) };
}

export function original(module: ModuleRecord, binding = 'api', options: {
  file?: string; tags?: readonly string[]; kind?: 'code' | 'resource'; hasValue?: boolean; hasType?: boolean;
  registry?: ResolvedTagRegistry; companions?: SignatureCompanions;
} = {}): Original {
  const file = options.file ?? 'api.ts';
  const area = module.areas.find(({ kind }) => kind === (file.startsWith('tests/') ? 'tests' : 'ordinary'))!;
  const sourceFile = `${module.areas[0].root}/${file}`;
  const assignment = valid(assignOriginalTags(options.registry ?? createDefaultTagRegistry(), area,
    options.tags === undefined ? [] : [{ tags: options.tags, location: location(module.areas[0].root.replace(/src$/, 'module.ramify'), 2) }]));
  return { id: { kind: options.kind ?? 'code', owner: module.id, file, binding }, origin: { file: sourceFile, area, auxiliary: false },
    declarations: [location(sourceFile)], hasValue: options.hasValue ?? true, hasType: options.hasType ?? true,
    tags: assignment.tags, tagEvidence: assignment.evidence, companions: options.companions ?? noCompanions };
}

export function exposure(module: ModuleRecord, symbol: Original, destinations: readonly Destination[],
  options: { provider?: string; effective?: boolean; names?: readonly string[]; start?: number } = {}): Exposure {
  return { module: module.id, original: symbol.id, destinations,
    names: options.names ?? [symbol.id.binding], provider: options.provider ?? null, effective: options.effective ?? true,
    evidence: [location(module.areas[0].root.replace(/src$/, 'module.ramify'), options.start ?? 3)] };
}

export function question(importer: ModuleRecord | SourceArea, symbol: Original | null, options: Partial<ImportQuestion> = {}): ImportQuestion {
  const area = 'areas' in importer ? importer.areas[0] : importer;
  return { importer: { file: `${area.root}/consumer.ts`, area, auxiliary: false }, location: location(`${area.root}/consumer.ts`),
    target: symbol?.origin ?? { file: `${area.root}/init.ts`, area, auxiliary: false }, forwarding: [],
    selection: symbol ? { original: symbol.id, request: 'value' } : null, ...options };
}

export function modelOf(modules: readonly ModuleRecord[], originals: readonly Original[], exposures: readonly Exposure[] = [],
  registry = createDefaultTagRegistry()): Model {
  const model = valid(buildModel({ registry, modules, originals, exposures }));
  assertIndexAgreement(model);
  return model;
}

/** The exposure index answers visibility exactly as `explainVisibility` does, for every module and original. */
export function assertIndexAgreement(model: Model): void {
  const index = exposureIndexFor(model);
  for (const module of model.modules) for (const symbol of model.originals) {
    const expected = explainVisibility(model, module.id, symbol.id).visible;
    if (visibleIn(index, symbol.id, module.id) !== expected) {
      throw new Error(`Exposure index disagrees for ${JSON.stringify(symbol.id)} in "${module.id}": expected ${expected}`);
    }
  }
}

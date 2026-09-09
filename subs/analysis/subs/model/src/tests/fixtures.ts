import { assignOriginalTags, buildModel, createDefaultTagRegistry, deriveSourceAreas } from '../index.js';
import type { Destination, Exposure, ImportQuestion, Model, ModelResult, ModuleRecord, Original, ResolvedTagRegistry, SourceArea, SourceLocation } from '../index.js';

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
  registry?: ResolvedTagRegistry;
} = {}): Original {
  const file = options.file ?? 'api.ts';
  const area = module.areas.find(({ kind }) => kind === (file.startsWith('tests/') ? 'tests' : 'ordinary'))!;
  const sourceFile = `${module.areas[0].root}/${file}`;
  const assignment = valid(assignOriginalTags(options.registry ?? createDefaultTagRegistry(), area,
    options.tags === undefined ? [] : [{ tags: options.tags, location: location(module.areas[0].root.replace(/src$/, 'module.ramify'), 2) }]));
  return { id: { kind: options.kind ?? 'code', owner: module.id, file, binding }, origin: { file: sourceFile, area },
    declarations: [location(sourceFile)], hasValue: options.hasValue ?? true, hasType: options.hasType ?? true,
    tags: assignment.tags, tagEvidence: assignment.evidence };
}

export function exposure(module: ModuleRecord, symbol: Original, destinations: readonly Destination[],
  options: { provider?: string; effective?: boolean; names?: readonly string[]; start?: number } = {}): Exposure {
  return { module: module.id, original: symbol.id, destinations,
    names: options.names ?? [symbol.id.binding], provider: options.provider ?? null, effective: options.effective ?? true,
    evidence: [location(module.areas[0].root.replace(/src$/, 'module.ramify'), options.start ?? 3)] };
}

export function question(importer: ModuleRecord | SourceArea, symbol: Original | null, options: Partial<ImportQuestion> = {}): ImportQuestion {
  const area = 'areas' in importer ? importer.areas[0] : importer;
  return { importer: { file: `${area.root}/consumer.ts`, area }, location: location(`${area.root}/consumer.ts`),
    target: symbol?.origin ?? { file: `${area.root}/init.ts`, area }, forwarding: [],
    selection: symbol ? { original: symbol.id, request: 'value' } : null, ...options };
}

export function modelOf(modules: readonly ModuleRecord[], originals: readonly Original[], exposures: readonly Exposure[] = [],
  registry = createDefaultTagRegistry()): Model {
  return valid(buildModel({ registry, modules, originals, exposures }));
}

/** Presentation projections over the definitive model. Permission decisions stay in model. */
import {
  buildModel, explainImport, explainVisibility, originalKey,
  type Model, type ModelInput, type ModelResult, type ModuleId, type ModuleRecord,
  type Original, type TagName, type ImportDecision, type VisibilityDecision,
} from '../../analysis/subs/model/src/index.js';

// These originals reach presentation through model -> analysis -> root -> descendants.
export type { Model, ModelInput, ModuleId, OriginalId, Original, SourceArea, ImportDecision,
  ImportReason, BindingRequest, TagName, VisibilityDecision } from '../../analysis/subs/model/src/index.js';

/** Labels are presentation data alongside canonical model facts. */
export interface DiagramModelInput extends ModelInput { readonly labels?: Readonly<Record<ModuleId, string>> }
export interface DiagramModel extends Model { readonly labels: Readonly<Record<ModuleId, string>> }
export type SymbolName = string;
/** Readable diagram keys are labels, never the identity supplied to the evaluator. */
export interface DiagramSymbol { readonly owner: string; readonly name: string }
export interface DiagramExposure {
  readonly symbol: string;
  readonly exposeToParent: boolean;
  readonly exposeToDescendants: boolean;
}
export interface DiagramModuleView {
  readonly id: string;
  readonly canonicalId: ModuleId;
  readonly parent: string | null;
  readonly children: readonly string[];
  readonly owns: readonly DiagramExposure[];
  readonly reExposes: readonly DiagramExposure[];
}

export function validModelResult<T>(result: ModelResult<T>): T {
  if (result.status === 'invalid') throw new Error(result.issues.map((issue) => issue.message).join('\n'));
  return result.value;
}

/** Validate facts, then preserve the author's display order without altering any fact. */
export function buildDiagramModel(input: DiagramModelInput): DiagramModel {
  const model = validModelResult(buildModel(input));
  return Object.freeze({ ...model, labels: Object.freeze({ ...input.labels }),
    modules: Object.freeze(input.modules.map(({ id }) => model.modules.find((item) => item.id === id)!)),
    originals: Object.freeze(input.originals.map(({ id }) => model.originals.find((item) => originalKey(item.id) === originalKey(id))!)),
  });
}

/** Short names are usable only when unique; repeated names keep their canonical paths. */
export function moduleKey(model: Model, id: ModuleId): string {
  const record = model.modules.find((item) => item.id === id);
  if (!record) throw new Error(`Unknown module "${id}".`);
  const labels = (model as Partial<DiagramModel>).labels;
  const label = labels?.[id] ?? record.name;
  return model.modules.filter((item) => (labels?.[item.id] ?? item.name) === label).length === 1 ? label : id;
}

export function modelModule(model: Model, key: string): ModuleRecord {
  const record = model.modules.find((item) => item.id === key)
    ?? model.modules.find((item) => moduleKey(model, item.id) === key);
  if (!record) throw new Error(`Unknown module "${key}".`);
  return record;
}

export function diagramRoot(model: Model): string {
  return moduleKey(model, model.modules.find((item) => item.parent === null)!.id);
}

export function moduleView(model: Model, key: string): DiagramModuleView {
  const record = modelModule(model, key);
  const forOriginal = (original: Original): DiagramExposure => {
    const exposures = model.exposures.filter((item) => item.module === record.id
      && item.effective && originalKey(item.original) === originalKey(original.id));
    return { symbol: original.id.binding,
      exposeToParent: exposures.some((item) => item.destinations.includes('parent')),
      exposeToDescendants: exposures.some((item) => item.destinations.includes('descendants')) };
  };
  return { id: moduleKey(model, record.id), canonicalId: record.id,
    parent: record.parent === null ? null : moduleKey(model, record.parent),
    children: model.modules.filter((item) => item.parent === record.id).map((item) => moduleKey(model, item.id)),
    owns: model.originals.filter((item) => item.id.owner === record.id).map(forOriginal),
    reExposes: model.originals.filter((original) => original.id.owner !== record.id
      && model.exposures.some((item) => item.module === record.id && item.effective
        && originalKey(item.original) === originalKey(original.id))).map(forOriginal),
  };
}

export function moduleViews(model: Model): DiagramModuleView[] {
  return model.modules.map((item) => moduleView(model, item.id));
}

export function diagramOriginal(model: Model, owner: string, name: string): Original {
  const id = modelModule(model, owner).id;
  const originals = model.originals.filter((item) => item.id.owner === id && item.id.binding === name);
  if (originals.length !== 1) throw new Error(`Expected one original for ${name} in ${owner}; found ${originals.length}.`);
  return originals[0]!;
}

export function moduleTagsOf(model: Model, key: string): readonly TagName[] {
  return modelModule(model, key).areas.find((area) => area.kind === 'ordinary')!.profile;
}
export function symbolTagsOf(model: Model, owner: string, name: string): readonly TagName[] {
  return diagramOriginal(model, owner, name).tags;
}

/** Choose one drawn arrival from the model's complete exposure evidence. */
export function diagramVisibility(model: Model, importer: string, owner: string, name: string): {
  readonly visible: boolean; readonly kind: 'owned' | 'child' | 'ancestor' | null;
  readonly via: string | null; readonly decision: VisibilityDecision;
} {
  const module = modelModule(model, importer);
  const original = diagramOriginal(model, owner, name);
  const decision = explainVisibility(model, module.id, original.id);
  if (!decision.visible) return { visible: false, kind: null, via: null, decision };
  if (module.id === original.id.owner) return { visible: true, kind: 'owned', via: null, decision };
  const arrivals = decision.paths.map((path) => path.at(-1)!).filter(Boolean);
  // The picture draws a child receipt before an ancestor receipt, then the nearest ancestor.
  const hop = arrivals.find((item) => item.destination === 'parent')
    ?? arrivals.filter((item) => item.destination === 'descendants')
      .sort((a, b) => b.module.split('/').length - a.module.split('/').length)[0]!;
  return { visible: true, kind: hop.destination === 'parent' ? 'child' : 'ancestor',
    via: moduleKey(model, hop.module), decision };
}

export function diagramImport(model: Model, importer: string | { readonly module: string; readonly binding: 'value' | 'type' },
  owner: string, name: string): ImportDecision {
  const key = typeof importer === 'string' ? importer : importer.module;
  const area = modelModule(model, key).areas.find((item) => item.kind === 'ordinary')!;
  const original = diagramOriginal(model, owner, name);
  const file = `${area.root}/diagram-consumer.ts`;
  return explainImport(model, { importer: { area, file }, target: original.origin, forwarding: [],
    location: { file, start: 0, end: 1, line: 1, column: 1 },
    selection: { original: original.id, request: typeof importer !== 'string' && importer.binding === 'type' ? 'type-only' : 'value' } });
}
export function isVisible(model: Model, importer: string, owner: string, name: string): boolean {
  return diagramVisibility(model, importer, owner, name).visible;
}
export function mayImport(model: Model, importer: string | { readonly module: string; readonly binding: 'value' | 'type' }, owner: string, name: string): boolean {
  return diagramImport(model, importer, owner, name).status === 'allowed';
}

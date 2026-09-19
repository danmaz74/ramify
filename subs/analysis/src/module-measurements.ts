import type { SourceArea } from '../subs/model/src/interfaces/model.js';
import type { CapturedInput, InventoryFile, InventoryModule, ProjectInventory } from '../subs/project/src/interfaces/project.js';
import type { ContextDocumentation } from './interfaces/modularity.js';
import type { InventoryMeasurementBuckets, MeasurementFileSize } from './interfaces/measurements.js';

/** File facts detached from inventory ownership so declared and candidate adapters share the arithmetic. */
export interface ResolvedMeasurementFile {
  readonly path: string;
  readonly owner: string;
  readonly area: 'ordinary' | 'tests';
  readonly classification: 'production' | 'tests';
  readonly kind: 'source' | 'resource';
  readonly bytes: number;
}

/** Revision-bound documentation bytes resolved from the captured input list. */
export interface ResolvedDocumentationFile {
  readonly path: string;
  readonly owner: string;
  readonly area: 'documentation';
  readonly kind: 'documentation';
  readonly bytes: number;
}

export type ContextSizeBuckets = Omit<InventoryMeasurementBuckets, 'documentation'>
  & { readonly documentation: ContextDocumentation };

export type DocumentationResolution =
  | { readonly status: 'resolved'; readonly files: readonly ResolvedDocumentationFile[] }
  | { readonly status: 'unavailable'; readonly message: string };
export type MeasurementInputResolution =
  | { readonly status: 'resolved'; readonly files: readonly ResolvedMeasurementFile[];
      readonly documentation: readonly ResolvedDocumentationFile[] }
  | { readonly status: 'unavailable'; readonly message: string };

const documentationPath = (module: InventoryModule, name: 'README.md' | 'module.ramify'): string =>
  module.directory && module.directory !== '.' ? `${module.directory}/${name}` : name;

/**
 * Resolve module-root documentation without reading the filesystem. The
 * inventory's `missing-file` purpose is the revision-bound absence evidence;
 * every present README, including one with no paragraph, must be captured.
 */
export function resolveDocumentationFiles(modules: readonly InventoryModule[],
  inputs: readonly CapturedInput[]): DocumentationResolution {
  const captured = new Map(inputs.map(input => [`${input.role}\0${input.path}`, input]));
  const files: ResolvedDocumentationFile[] = [];
  for (const module of modules) {
    const descriptionPath = documentationPath(module, 'module.ramify');
    const description = captured.get(`description\0${descriptionPath}`);
    if (!description) {
      return { status: 'unavailable', message: `The revision captured no description input for ${descriptionPath}` };
    }
    files.push({ path: descriptionPath, owner: module.id, area: 'documentation', kind: 'documentation', bytes: description.bytes });

    const readmePath = documentationPath(module, 'README.md');
    if (module.purpose.state === 'missing-file') continue;
    const readme = captured.get(`readme\0${readmePath}`);
    if (!readme) return { status: 'unavailable', message: `The revision captured no README input for ${readmePath}` };
    files.push({ path: readmePath, owner: module.id, area: 'documentation', kind: 'documentation', bytes: readme.bytes });
  }
  return { status: 'resolved', files };
}

/** Physical area plus the declared owner's ordinary profile determine the source filter. */
export function measurementFileIsTesting(file: InventoryFile, areas: readonly SourceArea[]): boolean {
  return file.area === 'tests' || areas.some(area => area.owner === file.owner && area.kind === 'ordinary'
    && area.profile.includes('testing'));
}

/**
 * Declared-ownership adapter shared by report and retained-session callers.
 * A session caller supplies the captured inputs retained beside its facts.
 */
export function resolveDeclaredMeasurementInputs(inventory: Pick<ProjectInventory, 'modules' | 'files'>,
  areas: readonly SourceArea[], inputs: readonly CapturedInput[]): MeasurementInputResolution {
  const documentation = resolveDocumentationFiles(inventory.modules, inputs);
  if (documentation.status === 'unavailable') return documentation;
  return {
    status: 'resolved',
    files: inventory.files.map(file => ({
      path: file.path, owner: file.owner, area: file.area,
      classification: measurementFileIsTesting(file, areas) ? 'tests' : 'production', kind: file.kind, bytes: file.bytes,
    })),
    documentation: documentation.files,
  };
}

type MutableFileSize = { -readonly [Key in keyof MeasurementFileSize]: MeasurementFileSize[Key] };
const emptyFiles = (): MutableFileSize => ({ sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 });

/** Shared exact/subtree arithmetic over already resolved ownership and classification. */
export function measureContextSize(files: readonly ResolvedMeasurementFile[],
  documentation: readonly ResolvedDocumentationFile[], owners: ReadonlySet<string>): InventoryMeasurementBuckets;
export function measureContextSize(files: readonly ResolvedMeasurementFile[],
  documentation: ContextDocumentation, owners: ReadonlySet<string>): ContextSizeBuckets;
export function measureContextSize(files: readonly ResolvedMeasurementFile[],
  documentation: readonly ResolvedDocumentationFile[] | ContextDocumentation,
  owners: ReadonlySet<string>): ContextSizeBuckets;
export function measureContextSize(files: readonly ResolvedMeasurementFile[],
  documentation: readonly ResolvedDocumentationFile[] | ContextDocumentation,
  owners: ReadonlySet<string>): ContextSizeBuckets {
  const production = emptyFiles();
  const tests = emptyFiles();
  for (const file of files) {
    if (!owners.has(file.owner)) continue;
    const bucket = file.classification === 'production' ? production : tests;
    if (file.kind === 'source') {
      bucket.sourceFiles++;
      bucket.sourceBytes += file.bytes;
    } else {
      bucket.resourceFiles++;
      bucket.resourceBytes += file.bytes;
    }
  }
  let documentationSize: ContextDocumentation;
  if (Array.isArray(documentation)) {
    const selected = documentation.filter(file => owners.has(file.owner));
    documentationSize = { files: selected.length, bytes: selected.reduce((sum, file) => sum + file.bytes, 0) };
  } else {
    documentationSize = documentation as ContextDocumentation;
  }
  return { production, tests, documentation: documentationSize };
}

export const candidateDocumentation: ContextDocumentation =
  { state: 'unavailable', reason: 'candidate-documentation' };

import type { ParsedDescription, DescriptionParser } from '../../../descriptions/src/interfaces/syntax.js';

export interface ProjectRequest {
  readonly cwd: string;
  readonly root?: string;
  readonly scope: 'whole-project';
  readonly configuration: 'discover';
}
export interface ProjectScope {
  readonly root: string;
  readonly selection: 'given' | 'found';
  readonly invokedFrom: string;
  readonly configuration: string;
  readonly walkedAreas: readonly string[];
  readonly independentScopes: readonly string[];
}
export interface CapturedInput {
  readonly path: string;
  readonly role: 'description' | 'readme' | 'source' | 'resource'
    | 'configuration' | 'dependency' | 'directory' | 'absent';
  readonly sha256: string;
  readonly bytes: number;
}
export interface InventoryArea {
  readonly owner: string;
  readonly kind: 'ordinary' | 'tests';
  readonly root: string;
  readonly present: boolean;
}
export type ModulePurpose =
  | { readonly state: 'present'; readonly readme: string; readonly paragraph: string }
  | { readonly state: 'missing-file' | 'no-paragraph'; readonly readme: string };
export interface InventoryModule {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  readonly directory: string;
  readonly headerTags: readonly string[];
  readonly areas: readonly InventoryArea[];
  readonly description: ParsedDescription;
  readonly purpose: ModulePurpose;
}
export interface InventoryFile {
  readonly path: string;
  readonly owner: string;
  readonly area: 'ordinary' | 'tests';
  readonly kind: 'source' | 'resource';
  readonly sha256: string;
  readonly bytes: number;
}
export interface ExactReference {
  readonly description: string;
  readonly statement: number;
  readonly decoded: string;
  readonly normalized: string;
  readonly status: 'file' | 'missing' | 'directory' | 'escape' | 'symlink'
    | 'case-mismatch' | 'excluded' | 'invalid-path';
  readonly interfaceEligible: boolean;
}
export interface OutsideSourceWarning {
  readonly code: 'outside-module-source';
  readonly entry: string;
  readonly count: number;
  readonly files: readonly string[];
}
export interface ProjectInventory {
  readonly scope: ProjectScope;
  readonly modules: readonly InventoryModule[];
  readonly files: readonly InventoryFile[];
  readonly references: readonly ExactReference[];
  readonly outsideModuleFiles: readonly string[];
  readonly warnings: readonly OutsideSourceWarning[];
}
export interface ProjectIssue {
  readonly code: 'root-not-found' | 'missing-root-description' | 'configuration-not-found'
    | 'references-only-configuration' | 'invalid-layout' | 'invalid-description'
    | 'duplicate-name' | 'description-in-src' | 'stray-description'
    | 'reserved-container' | 'symlink-root' | 'symlink-description'
    | 'symlink-reference' | 'case-mismatch' | 'missing-file' | 'invalid-path'
    | 'resource-limit' | 'read-failure' | 'changed-input';
  readonly path: string;
  readonly message: string;
}
export interface AcquisitionLimits {
  readonly attempts: number;
  readonly maxFiles: number;
  readonly maxApplicationFiles: number;
  readonly maxFileBytes: number;
  readonly maxInputBytes: number;
  readonly maxApplicationBytes: number;
  readonly maxOwners: number;
  readonly maxDepth: number;
  readonly deadlineMs: number;
}
export interface ProjectInputView {
  readonly inventory: ProjectInventory;
  readonly inputs: readonly CapturedInput[];
  readFile(path: string): Promise<string | undefined>;
  fileExists(path: string): Promise<boolean>;
  directoryExists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<readonly string[]>;
  realPath(path: string): Promise<string | undefined>;
  seal(): Promise<{ readonly status: 'coherent'; readonly inputs: readonly CapturedInput[] }
    | { readonly status: 'changed'; readonly paths: readonly string[] }>;
  dispose(): Promise<void>;
}
export interface ProjectReadOptions {
  readonly request: ProjectRequest;
  readonly parse: DescriptionParser;
  readonly limits: AcquisitionLimits;
  readonly signal?: AbortSignal;
  readonly retained?: RetainedConfiguration | null;
}
export type ProjectRead =
  | { readonly status: 'acquired'; readonly view: ProjectInputView;
      readonly configuration: RetainedConfiguration; readonly reusedConfiguration: boolean }
  | { readonly status: 'invalid' | 'unavailable' | 'incomplete';
      readonly inventory: ProjectInventory | null; readonly issues: readonly ProjectIssue[];
      readonly sealedInputs: readonly CapturedInput[] | null }
  | { readonly status: 'cancelled' };

export type ProjectResolution =
  | { readonly status: 'resolved'; readonly root: string; readonly selection: 'given' | 'found';
      readonly invokedFrom: string; readonly configuration: string }
  | { readonly status: 'invalid' | 'unavailable'; readonly issues: readonly ProjectIssue[] };
export interface RetainedConfiguration {
  readonly key: string;
  readonly dependencies: readonly CapturedInput[];
  readonly bytes: number;
  readonly product: Readonly<Record<string, unknown>>;
}

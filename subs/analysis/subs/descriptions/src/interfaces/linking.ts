import type { ModelInput, ModuleId, OriginalId, ResolvedTagRegistry, SourceLocation } from '../../../model/src/interfaces/model.js';
import type { ProjectInventory } from '../../../project/src/interfaces/project.js';
import type { SourceCatalog } from '../../../typescript/src/interfaces/source.js';

export interface LinkInputs {
  readonly registry: ResolvedTagRegistry;
  readonly inventory: ProjectInventory;
  readonly catalog: SourceCatalog;
}
export interface ExpandedSelection {
  readonly module: ModuleId;
  readonly statement: SourceLocation;
  readonly form: 'expose-src' | 'expose-test' | 'expose-sub';
  readonly selector: 'named' | 'wildcard';
  readonly provider: string;
  readonly pairs: readonly { readonly name: string; readonly original: OriginalId;
    readonly effective: boolean }[];
  readonly destinations: readonly ('parent' | 'descendants')[];
}
export interface LinkIssue {
  readonly code: 'missing-file' | 'missing-export' | 'foreign-original'
    | 'incomplete-expansion' | 'ambiguous-expansion' | 'invalid-wildcard-target'
    | 'unknown-child' | 'name-collision' | 'unknown-tag'
    | 'missing-required-tag' | 'conflicting-tags' | 'invalid-prerequisite';
  readonly message: string;
  readonly locations: readonly SourceLocation[];
}
export type LinkedDescriptions =
  | { readonly status: 'valid'; readonly modelInput: ModelInput;
      readonly selections: readonly ExpandedSelection[] }
  | { readonly status: 'invalid'; readonly issues: readonly LinkIssue[] };

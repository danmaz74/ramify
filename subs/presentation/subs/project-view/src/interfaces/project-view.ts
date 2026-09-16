import type {
  BindingRequest,
  Destination,
  ImportReason,
  ModuleId,
  OriginalId,
  ResolvedTagRegistry,
  SourceLocation,
  SourceOrigin,
  TagName,
} from '../../../../../analysis/subs/model/src/interfaces/model.js';
import type { ModulePurpose } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import type {
  AccessSelection,
  SourceAccess,
  SourceLimit,
  SymbolDetailRequest,
  WrittenForm,
} from '../../../../../analysis/subs/typescript/src/interfaces/source.js';
import type { RevisionId } from '../../../../../daemon/subs/contexts/src/interfaces/contexts.js';

export interface ProjectExplorerModel {
  readonly revision: RevisionId;
  readonly rootModuleId: ModuleId;
  readonly state: 'complete' | 'partial';
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ExplorerModule[];
  readonly edges: readonly ExplorerEdge[];
  readonly coverage: readonly ExplorerCoverage[];
  readonly summary: ExplorerSummary;
}

export interface ExplorerModule {
  readonly id: ModuleId;
  readonly name: string;
  readonly directory: string;
  readonly parent: ModuleId | null;
  readonly children: readonly ModuleId[];
  readonly tags: readonly TagName[];
  readonly presentationClass: string;
  readonly purpose: ModulePurpose;
  readonly files: readonly ExplorerFile[];
  readonly exports: readonly ExplorerExport[];
  readonly metrics: ExplorerMetrics;
}

export interface ExplorerFile {
  readonly path: string;
  readonly area: 'ordinary' | 'tests';
  readonly kind: 'source' | 'resource';
}

export interface ExplorerMetrics {
  readonly ownedFiles: number;
  readonly subtreeFiles: number;
  readonly dependencies: number;
  readonly dependents: number;
  readonly accessOccurrences: number;
  readonly selectedSymbols: number;
  readonly deniedAccesses: number;
  readonly limitedAccesses: number;
  readonly approximateIcs: number;
}

export interface ExplorerEdge {
  readonly id: string;
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  readonly consumerFiles: readonly string[];
  readonly providerFiles: readonly string[];
  readonly accessCount: number;
  readonly symbolCount: number;
  readonly accesses: readonly ExplorerAccess[];
  readonly status: 'allowed' | 'denied' | 'limited';
  readonly reasons: readonly ImportReason[];
  readonly coverageIds: readonly string[];
}

export interface ExplorerAccess {
  readonly id: string;
  readonly importerFile: string;
  readonly targetFile: string | null;
  readonly specifier: string | null;
  readonly writtenForm: WrittenForm;
  readonly selectionForm: SourceAccess['selectionForm'];
  readonly runtimeLoad: boolean;
  readonly selections: readonly ExplorerSelection[];
  readonly status: 'allowed' | 'denied' | 'limited';
  readonly reasons: readonly ImportReason[];
  readonly coverageIds: readonly string[];
  readonly location: SourceLocation;
}

export interface ExplorerSelection {
  readonly exportedName: string;
  readonly localName: string | null;
  readonly original: OriginalId | null;
  readonly request: BindingRequest;
  readonly explicitType: boolean;
  readonly forwarding: readonly SourceOrigin[];
  readonly status: AccessSelection['status'];
  readonly location: SourceLocation;
}

export interface ExplorerExport {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly original: OriginalId | null;
  readonly file: string;
  readonly locations: readonly SourceLocation[];
  readonly capability: 'value' | 'type' | 'value-and-type'
    | 'resource' | 'unknown';
  readonly tags: readonly TagName[];
  readonly forwarded: boolean;
  readonly exposures: readonly ExplorerExposure[];
  readonly signature:
    | { readonly state: 'loadable'; readonly request: SymbolDetailRequest }
    | { readonly state: 'unavailable'; readonly reason: 'missing-original' };
}

export interface ExplorerExposure {
  readonly module: ModuleId;
  readonly names: readonly string[];
  readonly destinations: readonly Destination[];
  readonly provider: ModuleId | null;
  readonly effective: boolean;
  readonly evidence: readonly SourceLocation[];
}

export interface ExplorerCoverage {
  readonly limit: SourceLimit;
  readonly moduleIds: readonly ModuleId[];
  readonly edgeIds: readonly string[];
}

export interface ExplorerSummary {
  readonly owners: number;
  readonly ownedFiles: number;
  readonly edges: number;
  readonly accessOccurrences: number;
  readonly selectedSymbols: number;
  readonly deniedAccesses: number;
  readonly limitedAccesses: number;
  readonly coverageNotes: number;
}

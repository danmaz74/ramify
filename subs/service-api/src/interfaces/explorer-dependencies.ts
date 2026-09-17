import type { DependencyDiagramFacts } from '../../../analysis/src/interfaces/dependency-diagram.js';
import type { ImportReason, ModuleId, OriginalId } from '../../../analysis/subs/model/src/interfaces/model.js';
import type { ContextRevision, RevisionId } from '../../../daemon/subs/contexts/src/interfaces/contexts.js';

/** Contract C5: the browser's dependency model of one ready daemon diagram. */
export interface ExplorerDependencyModelInput {
  readonly revision: ContextRevision;
  readonly diagram: DependencyDiagramFacts;
  /** Maximum UTF-8 bytes of the model's JSON; a larger model is refused, never truncated. */
  readonly maxBytes: number;
}

/** Distinct `(consumer module, original)` dependencies. */
export interface ExplorerDependencyCount {
  readonly behavioral: number;
  readonly nonBehavioral: number;
}

/** Distinct `(consumer module, imported module, original)` used originals. */
export interface ExplorerImportedCount {
  readonly behavioralUsedOriginals: number;
  readonly nonBehavioralUsedOriginals: number;
}

export interface ExplorerDependencyModule {
  readonly id: ModuleId;
  /** Outgoing original-owner dependencies of this consumer. */
  readonly uses: ExplorerDependencyCount;
  /** Incoming imported-module links: originals other modules use through this module. */
  readonly usedThrough: ExplorerImportedCount;
  /** Incoming original-owner dependencies on originals this module owns. */
  readonly ownedUsedByOthers: ExplorerDependencyCount;
}

/** One classified boundary fact, copied from the diagram without recomputation. */
export interface ExplorerDependencyEvidence {
  readonly original: OriginalId;
  readonly originalOwner: ModuleId;
  readonly importedModule: ModuleId;
  readonly classification: 'behavioral' | 'non-behavioral';
  readonly consumerFiles: readonly string[];
  readonly importedFiles: readonly string[];
  readonly originalFiles: readonly string[];
  readonly accessIds: readonly string[];
  readonly status: 'allowed' | 'limited' | 'denied';
  readonly reasons: readonly ImportReason[];
  readonly coverageIds: readonly string[];
}

export interface ExplorerImportedDependencyEdge {
  /** `dependency-edge/1:imported-module:<sha256(JSON([consumer, provider]))>`. */
  readonly id: string;
  readonly projection: 'imported-module';
  readonly consumer: ModuleId;
  /** The imported module; never equal to `consumer`. */
  readonly provider: ModuleId;
  readonly counts: ExplorerImportedCount;
  readonly originalOwners: readonly {
    readonly owner: ModuleId;
    readonly counts: ExplorerImportedCount;
  }[];
  readonly evidence: readonly ExplorerDependencyEvidence[];
}

export interface ExplorerOriginalDependencyEdge {
  /** `dependency-edge/1:original-owner:<sha256(JSON([consumer, provider]))>`. */
  readonly id: string;
  readonly projection: 'original-owner';
  readonly consumer: ModuleId;
  /** The original owner; never equal to `consumer`. */
  readonly provider: ModuleId;
  readonly counts: ExplorerDependencyCount;
  readonly importedThrough: readonly {
    readonly module: ModuleId;
    readonly counts: ExplorerImportedCount;
  }[];
  readonly evidence: readonly ExplorerDependencyEvidence[];
}

export interface ExplorerDependencyModel {
  readonly schemaVersion: 'ramify.explorer-dependencies/1';
  readonly inputId: string;
  readonly state: 'complete' | 'partial';
  readonly project: ExplorerDependencyCount;
  /** One row per diagram module, in module ID byte order. */
  readonly modules: readonly ExplorerDependencyModule[];
  readonly importedModuleEdges: readonly ExplorerImportedDependencyEdge[];
  readonly originalOwnerEdges: readonly ExplorerOriginalDependencyEdge[];
  readonly coverage: {
    readonly unknownDependencies: number;
    readonly limitIds: readonly string[];
  };
}

export type ExplorerDependencyModelOutcome =
  | { readonly status: 'mapped'; readonly model: ExplorerDependencyModel;
      readonly encodedBytes: number }
  | { readonly status: 'refused';
      readonly reason: 'identity-mismatch' | 'inconsistent-counts'
        | 'resource-limit';
      readonly message: string };

/** The browser sends no token; the server's project binding supplies it. */
export interface DependencyViewInput {
  readonly revision: RevisionId;
}

/** Contract C6: the `dependencyView` procedure's result. */
export type DependencyViewResult =
  | { readonly status: 'ready';
      readonly revision: ContextRevision;
      readonly view: ExplorerDependencyModel }
  | { readonly status: 'pending';
      readonly revision: ContextRevision;
      readonly phase: 'waiting' | 'analyzing' }
  | { readonly status: 'superseded';
      readonly current: RevisionId | null;
      readonly reason: string }
  | { readonly status: 'unavailable'; readonly reason: string };

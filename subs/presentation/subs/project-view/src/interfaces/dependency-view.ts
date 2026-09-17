import type {
  ImportReason,
  ModuleId,
  OriginalId,
} from '../../../../../analysis/subs/model/src/interfaces/model.js';

// The view's copy of the explorer dependency model (`ramify.explorer-dependencies/1`).
// The server produces the same serialized shape; this owner cannot import its declarations.

/** Distinct `(consumer module, original)` dependencies. */
export interface DependencyGraphCount {
  readonly behavioral: number;
  readonly nonBehavioral: number;
}

/** Distinct `(consumer module, imported module, original)` used originals. */
export interface DependencyGraphImportedCount {
  readonly behavioralUsedOriginals: number;
  readonly nonBehavioralUsedOriginals: number;
}

export interface DependencyGraphModule {
  readonly id: ModuleId;
  /** Outgoing dependencies of this consumer. */
  readonly uses: DependencyGraphCount;
  /** Originals other modules use through source targets this module owns. */
  readonly usedThrough: DependencyGraphImportedCount;
  /** Dependencies on originals this module owns. */
  readonly ownedUsedByOthers: DependencyGraphCount;
}

/** One classified boundary fact supporting an edge. */
export interface DependencyGraphEvidence {
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

export interface DependencyGraphImportedEdge {
  readonly id: string;
  readonly projection: 'imported-module';
  readonly consumer: ModuleId;
  /** The imported module. */
  readonly provider: ModuleId;
  readonly counts: DependencyGraphImportedCount;
  readonly originalOwners: readonly {
    readonly owner: ModuleId;
    readonly counts: DependencyGraphImportedCount;
  }[];
  readonly evidence: readonly DependencyGraphEvidence[];
}

export interface DependencyGraphOriginalEdge {
  readonly id: string;
  readonly projection: 'original-owner';
  readonly consumer: ModuleId;
  /** The original owner. */
  readonly provider: ModuleId;
  readonly counts: DependencyGraphCount;
  readonly importedThrough: readonly {
    readonly module: ModuleId;
    readonly counts: DependencyGraphImportedCount;
  }[];
  readonly evidence: readonly DependencyGraphEvidence[];
}

export type DependencyGraphEdge = DependencyGraphImportedEdge | DependencyGraphOriginalEdge;

export interface DependencyGraphModel {
  readonly schemaVersion: 'ramify.explorer-dependencies/1';
  readonly inputId: string;
  readonly state: 'complete' | 'partial';
  readonly project: DependencyGraphCount;
  readonly modules: readonly DependencyGraphModule[];
  readonly importedModuleEdges: readonly DependencyGraphImportedEdge[];
  readonly originalOwnerEdges: readonly DependencyGraphOriginalEdge[];
  readonly coverage: {
    readonly unknownDependencies: number;
    readonly limitIds: readonly string[];
  };
}

/**
 * How deep the drawn link's ends are. `level` rolls every end up to the node of the current
 * scope that contains it; `exact` draws each defining module itself.
 */
export type DependencyDepthMode = 'level' | 'exact';

/** Local display settings; changing them never requests data. */
export interface DependencySettings {
  readonly showNonBehavioral: boolean;
  readonly depthMode: DependencyDepthMode;
  /** Whether links with an end outside the scope's subtree are drawn. */
  readonly showOutsideScope: boolean;
  /** Whether a drilled-in scope draws its own source as a node beside its children. */
  readonly showOwnSourceNode: boolean;
}

export type DependencyPhase =
  | 'idle' | 'waiting' | 'analyzing' | 'ready' | 'superseded' | 'unavailable';

/**
 * The dependency result supplied beside a displayed project model. `data` is drawn whenever
 * present, including a stale or superseded result the page keeps; `phase` and `reason`
 * describe the latest request.
 */
export interface DependencyGraphState {
  readonly data: DependencyGraphModel | null;
  readonly phase: DependencyPhase;
  readonly reason: string | null;
  readonly isStale: boolean;
}

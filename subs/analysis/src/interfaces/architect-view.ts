import type { Destination, ModuleId, OriginalId, TagName } from '../../subs/model/src/interfaces/model.js';
import type { ExportBehavior, ExportKind, SymbolDetail, SymbolDetailLimits, TestTitleLimits } from '../../subs/typescript/src/interfaces/source.js';
import type { DependencyDiagramFacts } from './dependency-diagram.js';

/** One declared module of the architect projection. */
export interface ArchitectModuleFacts {
  readonly module: ModuleId;
  /** Project-relative module directory; `''` for the root module. */
  readonly dir: string;
  readonly parent: ModuleId | null;
  /** Direct children, in byte order. */
  readonly children: readonly ModuleId[];
  /** Header tags. */
  readonly tags: readonly TagName[];
  /** Present source areas relative to `dir`: `src`, `src/tests`. */
  readonly areas: readonly string[];
  /** The README's first top-level prose paragraph, uncut; no fallback to another owner's prose. */
  readonly purpose: { readonly state: 'present'; readonly path: string; readonly text: string }
    | { readonly state: 'missing' };
  /** Inventory files under `<dir>/src/docs/`, project-relative, in byte order. */
  readonly docs: readonly string[];
  /** Inventory source files of the module's own areas, and of its subtree. */
  readonly files: { readonly own: number; readonly subtree: number };
}

/** One exported original, recorded once, at its owner. */
export interface ArchitectSymbol {
  readonly module: ModuleId;
  readonly original: OriginalId;
  /** The byte-least name under which the defining file exports the original. */
  readonly name: string;
  /** The original's local binding when `name` is `default` and the binding has a name of its own. */
  readonly binding: string | null;
  /** The owner's exposure names other than `name`, in byte order. */
  readonly exposureNames: readonly string[];
  readonly role: 'exposed' | 'internal';
  /** Where the owner exposes the original, in byte order; empty when `internal`. */
  readonly destinations: readonly Destination[];
  readonly kind: ExportKind;
  /** `null`: a supporting original. */
  readonly behavior: ExportBehavior | null;
  readonly hasValue: boolean;
  /** The original's required tags. */
  readonly tags: readonly TagName[];
  /** Ancestors that re-expose what they received, nearest to the owner first. */
  readonly reexposed: readonly { readonly by: ModuleId; readonly to: readonly Destination[] }[];
  readonly detail: SymbolDetail;
  /** Project-relative defining file. */
  readonly file: string;
}

/** Direct titles of one suite, or of one feature, holding at most `maxTitlesPerRecord` titles. */
export type ArchitectTestRecord =
  | { readonly kind: 'suite'; readonly module: ModuleId; readonly file: string;
      readonly suite: readonly string[]; readonly tests: readonly string[] }
  | { readonly kind: 'feature'; readonly module: ModuleId; readonly file: string;
      readonly feature: string | null; readonly scenarios: readonly string[] };

/** The projection's exceptional counts. */
export interface ArchitectViewCounts {
  /** Distinct catalog limits that may have omitted originals. */
  readonly coverage: number;
  /** Symbols whose detail is `unavailable`. */
  readonly detailsUnavailable: number;
  /** Symbols whose behavior is `unknown`. */
  readonly unknownShapes: number;
  /** Test titles recorded as `(dynamic)`. */
  readonly dynamicTitles: number;
  /** Test files the compiler could not read. */
  readonly testsUnavailable: number;
  /** Symbols whose detail was truncated, plus test, feature and scenario titles that were cut. */
  readonly cut: number;
}

/** The architect view's facts for one revision: frozen by the session boundary, never retained. */
export interface ArchitectViewProjection {
  readonly schema: 'ramify.architect-projection/1';
  readonly sequence: number;
  readonly inputId: string;
  readonly root: ModuleId;
  /** Tree order: a module before its children, children in byte order. */
  readonly modules: readonly ArchitectModuleFacts[];
  /** By module in tree order, then name. */
  readonly symbols: readonly ArchitectSymbol[];
  /** By module in tree order, then file, then source order. */
  readonly tests: readonly ArchitectTestRecord[];
  readonly counts: ArchitectViewCounts;
  /** The deterministic encoded size used for `maxProjectionBytes`. */
  readonly bytes: number;
}

export interface ArchitectViewQuery {
  readonly sequence: number;
  readonly details: SymbolDetailLimits;
  readonly tests: TestTitleLimits;
  readonly maxProjectionBytes: number;
}

export type ArchitectViewQueryOutcome =
  | { readonly status: 'projected'; readonly sequence: number; readonly inputId: string;
      readonly projection: ArchitectViewProjection }
  /** `observedInputId` is null when a feature file changed on disk before any observation. */
  | { readonly status: 'superseded'; readonly sequence: number; readonly observedInputId: string | null }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-revision' | 'resource-limit'
      | 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };

/** Why the architect view is published without dependency facts. */
export type ArchitectDependencyReason = 'analysis-failed' | 'resource-limit'
  | 'resource-unavailable' | 'invalid-current' | 'wait-limit';

/** The dependency facts of the view's revision under the production source filter, or why there are none. */
export type ArchitectDependencies =
  | { readonly state: 'measured'; readonly facts: DependencyDiagramFacts }
  | { readonly state: 'unavailable'; readonly reason: ArchitectDependencyReason };

/** One rendered file: its path relative to the view root and its complete UTF-8 text. */
export interface ArchitectViewFile { readonly path: string; readonly text: string }

/** The complete architect view of one revision, ready to publish. */
export interface RenderedArchitectView {
  /** Byte order by path, `_meta.json` included. */
  readonly files: readonly ArchitectViewFile[];
  readonly modules: number;
  /** `behavior.jsonl`, `supporting.jsonl` and `tests.jsonl` lines. */
  readonly records: number;
  /** UTF-8 bytes of every file. */
  readonly bytes: number;
  readonly dependencies: ArchitectDependencies['state'];
}

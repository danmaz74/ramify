/** File and byte counts for source and resource inventory. */
export interface MeasurementFileSize {
  readonly sourceFiles: number;
  readonly sourceBytes: number;
  readonly resourceFiles: number;
  readonly resourceBytes: number;
}

/** Revision-bound module-root documentation. */
export interface MeasurementDocumentationSize {
  readonly files: number;
  readonly bytes: number;
}

/** Context-size buckets derived only from the retained project inventory. */
export interface InventoryMeasurementBuckets {
  readonly production: MeasurementFileSize;
  readonly tests: MeasurementFileSize;
  readonly documentation: MeasurementDocumentationSize;
}

/** Exact encoded API-view bytes for one module. */
export interface MeasurementViewSize {
  readonly ordinaryBytes: number;
  readonly testsBytes: number;
}

/** Context-size buckets after the daemon has attempted the API-view render. */
export interface MeasurementBuckets extends InventoryMeasurementBuckets {
  /** Absent uniformly for every module when `MeasurementViews` is unavailable. */
  readonly views?: MeasurementViewSize;
}

export type MeasurementViewUnavailableReason = 'not-requested' | 'resource-unavailable' | 'analysis-failed';
/** One common view-byte state for every module on a surface. */
export type MeasurementViews = 'measured'
  | { readonly state: 'unavailable'; readonly reason: MeasurementViewUnavailableReason };

/** One retained inventory file or captured module-root documentation file. */
export interface MeasurementFileRecord {
  readonly path: string;
  readonly owner: string;
  readonly area: 'ordinary' | 'tests' | 'documentation';
  readonly kind: 'source' | 'resource' | 'documentation';
  readonly bytes: number;
}

/** One module's inventory-only values, returned by the retained session. */
export interface InventoryModuleMeasurement {
  readonly id: string;
  readonly dir: string;
  readonly parent: string | null;
  readonly exact: InventoryMeasurementBuckets;
  readonly subtree: InventoryMeasurementBuckets;
}

/** One module's complete values after the daemon joins the view render. */
export interface ModuleMeasurement {
  readonly id: string;
  readonly dir: string;
  readonly parent: string | null;
  readonly exact: MeasurementBuckets;
  readonly subtree: MeasurementBuckets;
}

/** Revision-bound inventory values. API-view bytes are deliberately absent. */
export interface SessionMeasurements {
  readonly sequence: number;
  readonly inputId: string;
  readonly modules: readonly InventoryModuleMeasurement[];
  readonly files: readonly MeasurementFileRecord[];
}

export type SessionMeasurementsOutcome =
  | { readonly status: 'measured'; readonly measurements: SessionMeasurements }
  | { readonly status: 'superseded'; readonly sequence: number }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-revision' | 'invalid-current' | 'analysis-failed';
      readonly message: string }
  | { readonly status: 'cancelled' };

/** Required measurement input to the architect renderer. */
export type ArchitectMeasurements =
  | { readonly state: 'measured'; readonly views: MeasurementViews; readonly modules: readonly ModuleMeasurement[] }
  | { readonly state: 'unavailable'; readonly reason: 'invalid-current' | 'analysis-failed' };

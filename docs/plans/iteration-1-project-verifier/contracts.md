# Contract review package

**Prepared:** 2026-09-09. **State:** proposed for architecture and contract
review; acceptance is required before iteration 3. These are definitions to
implement, not implemented capabilities. Iteration 2 may use the draft inventory.
The [main plan](main-plan.md), [owner declarations](owners.md), [scope and limits](scope.md),
[move map](move-map.md), [compiler probes](probes.md) and [instance inventory](subcases.md)
form one review package. Changing a signature or activation stage revises this
package before its consumers change.

## Conventions and dependency direction

All paths below are package-relative. Public ESM imports end in `.js`. Each
TypeScript block is an exact declaration fragment, with the owning interface
file identified immediately above it; operation declarations identify their
implementation files separately. Types imported from another owner are named
in [owners.md](owners.md#foreign-signature-types). A type mentioned in a signature
is never implicitly exposed. Interface files export only their owner's original
definitions, never foreign re-exports. Entries may use named TypeScript relays
when their originals have the separately declared exposure path.

Retained data objects are deeply readonly and JSON-compatible: no `Map`, `Set`, `Date`,
`Error`, compiler object, callback or hidden closure occurs in a retained
snapshot/report. Live views, sessions and ports are explicitly different types.
Optional properties are omitted in JSON; `null` means an explicitly absent stage
product. Arrays have deterministic order as specified in scope.md. Coordinates
are UTF-16 offsets into the original captured text, start inclusive/end exclusive;
line and column are one-based, including BOM and original CRLF offsets. Parser
spans and model source locations have separate ownership and are projected
structurally by assembly; neither pure owner depends on the other to start.

The parser (iteration 4) and acquisition (5) can ship independently of model (3).
Acquisition records raw header tags and ordinary/tests area boundaries, without
validating a registry or implementing profile rules. At composition, model
validates those names and derives `SourceArea.profile`. Parser validity is
syntactic; linked validity also requires the registry, inventory and catalog.
There is no second evaluator in project, presentation or the harness.

## Model: identities, registry and decisions

`subs/analysis/subs/model/src/interfaces/model.ts` (iteration 3):

```ts
export type ModuleId = string;
export type TagName = string;
export type TagKind = 'required-importer' | 'required-symbol';
export interface TagDefinition {
  readonly name: TagName;
  readonly kind: TagKind;
  readonly description?: string;
}
export interface ResolvedTagRegistry {
  readonly id: string;
  readonly definitions: readonly TagDefinition[];
  readonly isDefault: boolean;
}
export interface SourceLocation {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}
export interface ModelIssue {
  readonly code: 'invalid-registry' | 'unknown-tag' | 'invalid-module-id'
    | 'duplicate-module' | 'invalid-tree' | 'invalid-original'
    | 'missing-required-tag' | 'conflicting-tags' | 'ungrounded-exposure';
  readonly message: string;
  readonly locations: readonly SourceLocation[];
}
export type ModelResult<T> =
  | { readonly status: 'valid'; readonly value: T }
  | { readonly status: 'invalid'; readonly issues: readonly ModelIssue[] };
export interface SourceArea {
  readonly owner: ModuleId;
  readonly kind: 'ordinary' | 'tests';
  readonly root: string;
  readonly profile: readonly TagName[];
}
export interface ModuleRecord {
  readonly id: ModuleId;
  readonly name: string;
  readonly parent: ModuleId | null;
  readonly headerTags: readonly TagName[];
  readonly areas: readonly SourceArea[];
}
export type OriginalId =
  | { readonly kind: 'code'; readonly owner: ModuleId; readonly file: string;
      readonly binding: string }
  | { readonly kind: 'resource'; readonly owner: ModuleId; readonly file: string;
      readonly binding: string };
export interface SourceOrigin {
  readonly file: string;
  readonly area: SourceArea;
}
export interface Original {
  readonly id: OriginalId;
  readonly origin: SourceOrigin;
  readonly declarations: readonly SourceLocation[];
  readonly hasValue: boolean;
  readonly hasType: boolean;
  readonly tags: readonly TagName[];
  readonly tagEvidence: readonly SourceLocation[];
}
export type Destination = 'parent' | 'descendants';
export interface Exposure {
  readonly module: ModuleId;
  readonly original: OriginalId;
  readonly names: readonly string[];
  readonly destinations: readonly Destination[];
  readonly evidence: readonly SourceLocation[];
  readonly provider: ModuleId | null;
  readonly effective: boolean;
}
export interface ModelInput {
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ModuleRecord[];
  readonly originals: readonly Original[];
  readonly exposures: readonly Exposure[];
}
export interface Model {
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ModuleRecord[];
  readonly originals: readonly Original[];
  readonly exposures: readonly Exposure[];
}
export interface ExposureHop {
  readonly module: ModuleId;
  readonly destination: Destination;
  readonly evidence: readonly SourceLocation[];
}
export interface VisibilityDecision {
  readonly visible: boolean;
  readonly importer: ModuleId;
  readonly original: OriginalId;
  readonly paths: readonly (readonly ExposureHop[])[];
  readonly ineffective: readonly Exposure[];
}
export type BindingRequest = 'value' | 'type-only';
export interface ImportQuestion {
  readonly importer: SourceOrigin;
  readonly location: SourceLocation;
  readonly target: SourceOrigin;
  readonly forwarding: readonly SourceOrigin[];
  readonly selection: { readonly original: OriginalId;
    readonly request: BindingRequest } | null;
}
export interface TagRequirement {
  readonly tag: TagName;
  readonly kind: TagKind;
  readonly satisfied: boolean;
}
export type ImportReason = 'same-owner' | 'exposed' | 'symbol-free'
  | 'testing-origin' | 'not-visible' | 'required-importer-tag'
  | 'required-symbol-tag';
export interface ImportDecision {
  readonly status: 'allowed' | 'denied';
  readonly reason: ImportReason;
  readonly question: ImportQuestion;
  readonly original: Original | null;
  readonly visibility: VisibilityDecision | null;
  readonly requirements: readonly TagRequirement[];
  readonly checkedOrigins: readonly SourceOrigin[];
  readonly blockingOrigins: readonly SourceOrigin[];
}
```

Operations below belong to `registry.ts`, `profiles.ts`, `identity.ts`,
`model.ts`, and `decisions.ts`, respectively. They are all activated in iteration 3.

```ts
export declare function resolveTagRegistry(definitions: unknown): ModelResult<ResolvedTagRegistry>;
export declare function createDefaultTagRegistry(): ResolvedTagRegistry;
export declare function deriveSourceAreas(
  registry: ResolvedTagRegistry, owner: ModuleId, sourceRoot: string,
  headerTags: readonly string[],
): ModelResult<readonly SourceArea[]>;
export declare function assignOriginalTags(
  registry: ResolvedTagRegistry, area: SourceArea,
  assignments: readonly { readonly tags: readonly string[];
    readonly location: SourceLocation }[],
): ModelResult<{ readonly tags: readonly TagName[];
  readonly evidence: readonly SourceLocation[] }>;
export declare function originalKey(id: OriginalId): string;
export declare function buildModel(input: ModelInput): ModelResult<Model>;
export declare function explainVisibility(
  model: Model, importer: ModuleId, original: OriginalId,
): VisibilityDecision;
export declare function explainImport(model: Model, question: ImportQuestion): ImportDecision;
```

`ModuleId` is the exact decoded declared-name chain, joined by `/`; grouping
paths add no segments. Strings at public input boundaries are validated, not
trusted merely because TypeScript accepts them. Registry construction deep-copies,
validates and freezes its input. Its identity is `registry/1:` followed by canonical JSON of
name-sorted `[name, kind, description-or-null]` tuples. This exact content key
needs no platform crypto or Node built-in and changes whenever definitions change.
Omission is implemented by `createDefaultTagRegistry`,
which uses the same validation rules. `isDefault` is computed by comparison with
the documented default definitions, never accepted as a caller assertion.

An original's `file` is the byte-exact normalized path relative to its owner's
`src/`, including `tests/` when applicable. A code binding key is its original
lexical container/name path; one anonymous default uses the reserved key
`#default`. Aliases never supply this key. Merged declarations of one symbol
in one defining area share it; ambiguity across owners/areas is unresolved,
never whichever declaration the compiler lists first. A resource's binding key
identifies one effective binding within that resource (`default` in the CSS
probes), coalescing only aliases proven equivalent within that resource.
`originalKey` is canonical JSON of `[kind, owner, file, binding]`, not a compiler
ID or content hash. Input identity separately distinguishes changed bytes.
These IDs promise identity within/repeated batches of this declared tree;
there is no historical move/rename tracking.

`explainVisibility.paths` retains one deterministic shortest witness per receiving
exposure, ordered by module/original/evidence, not every combinatorial path. The
complete grounded exposure set remains in `Model` for later queries.

`buildModel` validates a finite, rooted, acyclic ownership tree and grounded
exposures. It cannot accept a partly invalid permission graph. The original
catalog includes every owned export, including private ones. `explainImport`
accepts only established originals/targets in a valid model; resolution limits
and missing exports belong to the adapter/report, not invented model symbols.
It checks target, forwarding and defining origins before the same-owner
exemption; then visibility before tag requirements. A null selection still
checks source origins but requires no dummy exposure. Named ineffective child
selections retain their identities and evidence. An allowed value implies the
corresponding type permission; later use never weakens a value request.

## Descriptions: located syntax and grounded contracts

`subs/analysis/subs/descriptions/src/interfaces/syntax.ts` (iteration 4) has no
foreign imports:

```ts
export interface TextSpan {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}
export interface DescriptionToken {
  readonly kind: 'keyword' | 'name' | 'string' | 'punctuation' | 'comment';
  readonly raw: string;
  readonly decoded: string;
  readonly span: TextSpan;
}
export interface DescriptionIssue {
  readonly code: 'invalid-encoding' | 'bare-cr' | 'invalid-whitespace'
    | 'unterminated-string' | 'invalid-escape' | 'invalid-scalar'
    | 'invalid-name' | 'empty-name' | 'reserved-name' | 'missing-version'
    | 'unsupported-version' | 'missing-header' | 'duplicate-header'
    | 'invalid-order' | 'unknown-clause' | 'invalid-selection' | 'invalid-list'
    | 'invalid-destination' | 'duplicate-tag' | 'duplicate-destination'
    | 'invalid-tag-syntax' | 'unknown-statement' | 'test-profile-declaration'
    | 'missing-from' | 'missing-to' | 'trailing-token';
  readonly message: string;
  readonly file: string;
  readonly span: TextSpan;
}
export interface NamedSelection {
  readonly name: string;
  readonly alias: string;
  readonly span: TextSpan;
}
export type DescriptionSelection =
  | { readonly kind: 'named'; readonly names: readonly NamedSelection[] }
  | { readonly kind: 'wildcard'; readonly span: TextSpan };
export interface DescriptionStatement {
  readonly index: number;
  readonly kind: 'expose-src' | 'expose-test' | 'expose-sub';
  readonly span: TextSpan;
  readonly selection: DescriptionSelection;
  readonly from: { readonly value: string; readonly span: TextSpan };
  readonly tags: { readonly values: readonly string[];
    readonly span: TextSpan } | null;
  readonly destinations: readonly ('parent' | 'descendants')[];
}
export interface DescriptionDocument {
  readonly file: string;
  readonly version: 1;
  readonly module: { readonly name: string; readonly tags: readonly string[];
    readonly span: TextSpan };
  readonly tokens: readonly DescriptionToken[];
  readonly statements: readonly DescriptionStatement[];
}
export type ParsedDescription =
  | { readonly status: 'valid'; readonly document: DescriptionDocument }
  | { readonly status: 'invalid'; readonly file: string;
      readonly tokens: readonly DescriptionToken[];
      readonly issues: readonly DescriptionIssue[] };
export type DescriptionParser = (file: string, text: string) => ParsedDescription;
```

`parse.ts`, iteration 4:

```ts
export declare function parseDescription(file: string, text: string): ParsedDescription;
```

Unknown tags are syntactically valid names until registry validation; malformed
or duplicate tag-list syntax is rejected here. `expose-test` plus wildcard and
`expose-sub` plus tags cannot appear in a valid parsed document. The discriminated
parse result prevents accidental use of a recovered partial document. The syntax reason codes above classify grammar failures without serializing
compiler or parser AST nodes; additional distinctions require a package revision.

`src/interfaces/linking.ts` (iteration 7) imports model `ModelInput`,
`ResolvedTagRegistry`, `ModuleId`, `OriginalId`, `SourceLocation`, project
`ProjectInventory`, and TypeScript adapter `SourceCatalog`, all as types:

```ts
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
```

`link.ts`, iteration 7:

```ts
export declare function linkDescriptions(inputs: LinkInputs): LinkedDescriptions;
```

Linking reads captured inventory/reference validation and supplied plain catalog
facts only. It performs no disk/compiler calls. A wildcard's complete export
set is a prerequisite; incomplete or foreign expansion invalidates the whole
link result. An existing empty interface records an empty `pairs` array. Collect
all explicit assignments before defaults and evaluate children before parents.
Changing statement order cannot change the semantic model or tags (locations
naturally reflect the new text). A missing child name is invalid; a resolvable
name without effective to-parent receipt is retained as ineffective, as the
principles require. No stale/partial model is returned in the invalid branch.

## Project: acquisition, inventory and metadata

`subs/analysis/subs/project/src/interfaces/project.ts` (iteration 5) imports
only descriptions `ParsedDescription` and `DescriptionParser` as foreign types:

```ts
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
}
export type ProjectRead =
  | { readonly status: 'acquired'; readonly view: ProjectInputView }
  | { readonly status: 'invalid' | 'unavailable' | 'incomplete';
      readonly inventory: ProjectInventory | null; readonly issues: readonly ProjectIssue[] }
  | { readonly status: 'cancelled' };
```

`read-project.ts`, iteration 5:

```ts
export declare function readProject(options: ProjectReadOptions): Promise<ProjectRead>;
```

Paths in inventory are root-relative POSIX strings. Root/configuration and
`invokedFrom` in scope are explicit real absolute paths; influencing inputs
outside root use named external scopes in serialization, never misleading `../`
application locations. Source `readFile` is decoded UTF-8 from captured bytes;
hashing and resource existence use the original bytes. `CapturedInput` includes
configuration inheritance, manifests, declarations, resolution candidates,
negative reads and directory-entry observations that influenced selection.
Compiler callbacks can add a first captured observation while the view is open;
they cannot reread already observed bytes from disk. `seal()` rechecks all
observations, including metadata and hashes, and prevents new observations.
A changed view is discarded along with its compiler session and the whole
acquisition is retried within `attempts`; exhaustion is incomplete. The same
input view serves discovery, descriptions, resources and every compiler read.

View methods are asynchronous so first disk observations do not block the
analysis event loop. The native compiler expects synchronous callbacks: a
supervised helper issues a framed request and waits for the parent to await
these view methods, then return the captured result. The helper performs no
independent live-filesystem capture.

The implementation of compiler-configuration selection stays with acquisition;
[scope.md](scope.md) fixes the selected integration and I5 boundary. It never
runs project configuration scripts or application entry points. Missing `src/`
is retained with `present: false`, never created by checking. A parse/layout
error preserves located diagnostic data without assigning malformed-child files
to the parent. Exact-path issues remain invalid inputs even if TypeScript could
substitute a suffix. `dispose()` is idempotent and clears bytes, observations
and file handles; the report retains only content identities and plain facts.

## TypeScript adapter: catalog and source occurrences

`subs/analysis/subs/typescript/src/interfaces/source.ts` starts with catalog
contracts in iteration 6; access contracts activate in 9–12. Foreign type imports
are model `OriginalId`, `ModuleId`, `SourceArea`, `SourceLocation`, `BindingRequest`,
`SourceOrigin`; project `ProjectInputView`, `ProjectInventory`:

```ts
export interface CatalogOriginal {
  readonly id: OriginalId;
  readonly origin: SourceOrigin;
  readonly declarations: readonly SourceLocation[];
  readonly hasValue: boolean;
  readonly hasType: boolean;
}
export interface CatalogExport {
  readonly name: string;
  readonly original: OriginalId | null;
  readonly namespace: readonly CatalogExport[] | null;
  readonly forwarding: readonly SourceOrigin[];
}
export interface FileExports {
  readonly file: string;
  readonly state: 'complete' | 'incomplete' | 'ambiguous';
  readonly exports: readonly CatalogExport[];
  readonly issueIds: readonly string[];
  readonly descriptionFiles: readonly string[];
}
export interface SourceCatalog {
  readonly originals: readonly CatalogOriginal[];
  readonly files: readonly FileExports[];
  readonly coverage: readonly SourceLimit[];
}
export type SourceTarget =
  | { readonly kind: 'application'; readonly origin: SourceOrigin }
  | { readonly kind: 'external'; readonly resolution: 'package' | 'builtin' | 'standard-library';
      readonly name: string; readonly resolvedFile: string | null }
  | { readonly kind: 'outside-module'; readonly file: string }
  | { readonly kind: 'unresolved' };
export type WrittenForm = 'import' | 'import-type' | 'inline-type-import'
  | 'named-export' | 'type-export' | 'inline-type-export'
  | 'namespace-import' | 'type-namespace-import' | 'star-export'
  | 'type-star-export' | 'namespace-export' | 'type-namespace-export'
  | 'dynamic-import' | 'import-type-query' | 'jsdoc-import-type'
  | 'side-effect-import' | 'empty-import' | 'empty-export' | 'discarded-import'
  | 'commonjs' | 'macro' | 'unsupported';
export interface AccessSelection {
  readonly location: SourceLocation;
  readonly exportedName: string;
  readonly localName: string | null;
  readonly original: OriginalId | null;
  readonly request: BindingRequest;
  readonly explicitType: boolean;
  readonly forwarding: readonly SourceOrigin[];
  readonly status: 'resolved' | 'missing-export' | 'unresolved';
}
export interface SourceAccess {
  readonly id: string;
  readonly location: SourceLocation;
  readonly importer: SourceOrigin;
  readonly specifier: string | null;
  readonly form: WrittenForm;
  readonly selectionForm: 'named' | 'default' | 'direct-member' | 'literal-key'
    | 'destructure' | 'qualified-type' | 'whole-star' | 'whole-namespace'
    | 'then-member' | 'then-destructure' | 'none' | 'unknown';
  readonly runtimeLoad: boolean;
  readonly target: SourceTarget;
  readonly selections: readonly AccessSelection[];
  readonly coverageIds: readonly string[];
}
export interface SourceLimit {
  readonly id: string;
  readonly code: 'unresolved-target' | 'unresolved-original' | 'incomplete-exports'
    | 'ambiguous-original' | 'unknown-key' | 'namespace-escape' | 'nonliteral-target'
    | 'unsupported-loader' | 'unsupported-commonjs' | 'shared-global'
    | 'resource-target' | 'resource-description' | 'compiled-source'
    | 'outside-module-target' | 'compiler-blocked';
  readonly location: SourceLocation;
  readonly message: string;
  readonly compilerCode?: number;
  readonly related: readonly SourceLocation[];
}
export interface SourceWorkLimits {
  readonly maxExports: number;
  readonly maxAccesses: number;
  readonly maxSelections: number;
  readonly maxForwardingDepth: number;
  readonly deadlineMs: number;
}
export interface SourceAnalysisInputs {
  readonly signal?: AbortSignal;
  readonly view: ProjectInputView;
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly limits: SourceWorkLimits;
}
export interface SourceAnalysis {
  catalog(signal?: AbortSignal): Promise<SourceCatalog>;
  accesses(signal?: AbortSignal): Promise<{ readonly accesses: readonly SourceAccess[];
    readonly coverage: readonly SourceLimit[] }>;
  dispose(): Promise<void>;
}
```

`source-analysis.ts`: `createSourceAnalysis` activates in iteration 6 with
`catalog()` and `dispose()` only; its concrete `accesses()` member and the
associated types activate in iteration 9, with supported forms added through
12. Requesting absent capability is unavailable; no stub empty access list is
permitted. The intermediate interface is the final interface with that member
omitted, not a placeholder implementation.

```ts
export declare function createSourceAnalysis(inputs: SourceAnalysisInputs): Promise<SourceAnalysis>;
```

The adapter owns every program, AST, symbol, native compiler handle and mutable
resolution cache inside one finite supervised helper plus its native compiler
child. Analysis and the captured view stay in the calling process. Source
operations and host reads use bounded private stdio frames; they are not a
public transport or a daemon. Project owns a separate configuration-only helper
at I5; the adapter owns its source helper at I6. Neither helper depends on the
other owner's private implementation. The public interfaces above need no
compiler-process types.

The parent owns the helper ChildProcess and POSIX process group, keeps its event
loop responsive, and closes or terminates that group on cancellation/deadline.
The lifetime signal in `SourceAnalysisInputs` applies before helper startup;
assembly registers the helper handle before awaiting readiness, so cancellation
can dispose a still-opening adapter. Per-operation signals are linked to that
lifetime without replacing it. Native API `close()` alone cannot guarantee bounded release. The supervision
probe establishes the bridge and forced termination, not complete Ramify session
cleanup or native-child reaping; those remain I12/I15 acceptance obligations. [probes.md](probes.md) establishes the exact compiler APIs;
ordinary type errors are excluded from reports. Compiler problems are retained
only where they block resolution or export enumeration. An incomplete catalog
can support known non-wildcard facts, but cannot satisfy a wildcard's completeness
precondition. Catalog namespace members keep constituent originals; no synthetic
wrapper original manufactures permission. Original/resource identities are
independent of the shim; known missing exports are source errors, while an
unestablished resource is coverage. A named import and a load can coexist in
one occurrence; an explicit erased binding never discards a known testing
origin. Every original, forwarding target and accessed file is retained
separately. Abort/disposal cancels outstanding adapter work, then releases its
resources before completing; a disposed adapter cannot publish late results.

## Analysis: staged composition and completed results

`subs/analysis/src/interfaces/analysis.ts` imports the model, description,
project and source types used below through its children's contracts. This is
a type file, containing no foreign re-exports. The inventory subset activates
in iteration 8; validation subset in 7; full session/report in 12.

```ts
export type Capability = 'registry' | 'layout' | 'metadata' | 'descriptions'
  | 'source-catalog' | 'exposure-linking' | 'static-access' | 'tags-origin'
  | 'namespace-access' | 'lazy-access' | 'symbol-free-access' | 'resource-access'
  | 'coverage' | 'browser-verification';
export type StageId = 'registry' | 'acquisition' | 'parse' | 'catalog'
  | 'link' | 'access' | 'decide' | 'report';
export interface RunControl { readonly signal?: AbortSignal }
export interface AnalysisLimits {
  readonly acquisition: AcquisitionLimits;
  readonly source: SourceWorkLimits;
  readonly maxExposurePairs: number;
  readonly maxDiagnostics: number;
  readonly maxReportBytes: number;
  readonly disposeTimeoutMs: number;
  readonly deadlineMs: number;
}
export interface AnalysisInputs {
  readonly project: ProjectRequest;
  readonly registry: ResolvedTagRegistry;
  readonly capabilities: readonly Capability[];
  readonly limits: AnalysisLimits;
}
export interface InventoryInputs {
  readonly project: ProjectRequest;
  readonly registry: ResolvedTagRegistry;
  readonly limits: AcquisitionLimits;
}
export interface InventorySnapshot {
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly inputs: readonly CapturedInput[];
  readonly inputId: string;
}
export type InventoryRun =
  | { readonly status: 'completed'; readonly snapshot: InventorySnapshot }
  | { readonly status: 'invalid' | 'incomplete' | 'unavailable';
      readonly diagnostics: readonly AnalysisDiagnostic[] }
  | { readonly status: 'cancelled' };
export type ValidationRun =
  | { readonly status: 'valid'; readonly input: InventorySnapshot;
      readonly catalog: SourceCatalog;
      readonly linked: Extract<LinkedDescriptions, { readonly status: 'valid' }> }
  | { readonly status: 'invalid' | 'incomplete' | 'unavailable';
      readonly diagnostics: readonly AnalysisDiagnostic[] }
  | { readonly status: 'cancelled' };
export interface CapabilityExecution {
  readonly capability: Capability;
  readonly available: boolean;
  readonly requested: boolean;
  readonly executed: boolean;
}
export interface StageExecution {
  readonly stage: StageId;
  readonly status: 'completed' | 'invalid' | 'blocked' | 'unavailable'
    | 'failed' | 'not-requested';
  readonly blockedBy: readonly StageId[];
  readonly diagnosticIds: readonly string[];
}
export type AnalysisCode = ModelIssue['code'] | DescriptionIssue['code']
  | ProjectIssue['code'] | LinkIssue['code'] | ImportReason
  | 'missing-export' | 'invalid-invocation' | 'unavailable-capability'
  | 'missing-stage' | 'session-used' | 'session-disposed' | 'output-failure'
  | 'resource-limit' | 'internal-error';
export interface AnalysisDiagnostic {
  readonly id: string;
  readonly category: 'invocation' | 'registry' | 'layout' | 'description'
    | 'missing-export' | 'import' | 'acquisition' | 'unavailable' | 'execution' | 'limit';
  readonly code: AnalysisCode;
  readonly message: string;
  readonly location: SourceLocation | null;
  readonly related: readonly SourceLocation[];
  readonly importer: SourceArea | null;
  readonly original: OriginalId | null;
  readonly accessId: string | null;
  readonly limit?: { readonly name: string; readonly maximum: number;
    readonly observed: number; readonly collectedPrefix: true };
}
export interface AccessResult {
  readonly accessId: string;
  readonly decisions: readonly ImportDecision[];
  readonly outcome: 'checked' | 'external' | 'outside-scope' | 'unverifiable' | 'mixed';
  readonly diagnostics: readonly string[];
  readonly coverage: readonly string[];
}
export interface AnalysisSnapshot {
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly inputs: readonly CapturedInput[];
  readonly catalog: SourceCatalog | null;
  readonly linked: LinkedDescriptions | null;
  readonly model: Model | null;
  readonly accesses: readonly SourceAccess[];
  readonly results: readonly AccessResult[];
}
export interface AnalysisSummary {
  readonly complete: boolean;
  readonly owners: number;
  readonly sourceFiles: number;
  readonly resources: number;
  readonly originals: number;
  readonly accesses: number;
  readonly allowed: number;
  readonly denied: number;
  readonly errors: number;
  readonly warnings: number;
  readonly coverageNotes: number;
  readonly external: number;
}
export interface AnalysisReport {
  readonly schemaVersion: 'ramify.analysis/1';
  readonly runId: string;
  readonly inputId: string | null;
  readonly request: AnalysisInputs;
  readonly scope: ProjectScope | null;
  readonly registry: ResolvedTagRegistry | null;
  readonly capabilities: readonly CapabilityExecution[];
  readonly stages: readonly StageExecution[];
  readonly outcome: { readonly execution: 'completed' | 'invalid' | 'incomplete' | 'unavailable';
    readonly check: 'passed' | 'failed' | 'not-run';
    readonly coverage: 'complete' | 'partial' | 'not-run' };
  readonly snapshot: AnalysisSnapshot | null;
  readonly diagnostics: readonly AnalysisDiagnostic[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly summary: AnalysisSummary;
}
export type AnalysisRun =
  | { readonly status: 'reported'; readonly report: AnalysisReport }
  | { readonly status: 'cancelled' };
export interface AnalysisSession {
  analyze(control?: RunControl): Promise<AnalysisRun>;
  dispose(): Promise<void>;
}
```

Operations and defining files:

```ts
// validation.ts — iteration 7; runs acquisition, registry, catalog, linking.
export declare function validateProject(inputs: AnalysisInputs, control?: RunControl): Promise<ValidationRun>;
// inventory.ts — iteration 8; no program/catalog/link/source checking.
export declare function acquireInventory(inputs: InventoryInputs, control?: RunControl): Promise<InventoryRun>;
// session.ts — iteration 12; construction does no I/O or compiler startup.
export declare function createAnalysisSession(inputs: AnalysisInputs): AnalysisSession;
// analyze-project.ts — iteration 12; always disposes its real session in finally.
export declare function analyzeProject(inputs: AnalysisInputs, control?: RunControl): Promise<AnalysisRun>;
```

`validateProject` requests the validation capability subset (registry, layout,
metadata, descriptions, source-catalog, exposure-linking). `acquireInventory`
requests acquisition and profiles only; it shares their real implementations,
not an approximation that walks paths looking for `tests`. Direct tests bind
`analyzeProject` itself; no CLI-only or fake analysis backend supplies evidence.

One Plan 1 session admits exactly one analyze call; concurrent/repeated calls
produce an explicit execution failure, never reuse a prior success. Repeated
batch measurements create fresh sessions. `dispose()` is idempotent, aborts
in-flight work and awaits release. The report is detached before disposal;
retaining it retains neither the input view nor the compiler. Cancellation
returns `cancelled` only after cleanup and emits no successful report. Read,
limit or execution failures preserve obtainable diagnostics and scope but mark
unfinished stages explicitly. No source decisions run from an invalid registry,
layout or linked description set. The report stage completes only after sealing
the input and detaching/size-checking the complete serialization. Registry
validation also verifies a supplied resolved value
against its definitions and identity; if invalid, `report.registry` is null
and registry/source stages are invalid/blocked. The request records the supplied
JSON-compatible definitions for diagnosis; that echo is not a validated registry.

`runId` is a fresh batch identifier (UUID), not a daemon revision. `inputId`
hashes canonical root/scope/configuration, resolved registry identity, integration
version and sorted captured observations. The content hash is finalized only
after sealing. Input equality says which bytes were analyzed, never that they
were the latest filesystem bytes at process exit. Capability availability,
execution, input validity, check outcome and coverage are independent dimensions.
All required stages must complete for exit 0. A supported bounded stage may
complete with coverage notes; an unrun stage cannot. Counts derive from retained
records, never a hand-authored violation total. Exact ordering, limits and exits
are fixed in [scope.md](scope.md) and the CLI specification.

## Root and CLI: injected batch delivery

Root `src/interfaces/batch.ts` (iteration 13), with type imports of analysis
`Capability`, `RunControl`, `AnalysisReport`:

```ts
export interface BatchInvocation {
  readonly cwd: string;
  readonly root?: string;
  readonly capabilities: readonly Capability[];
}
export type BatchResult =
  | { readonly status: 'reported'; readonly report: AnalysisReport;
      readonly exitCode: 0 | 1 | 2 }
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type BatchOperation = (invocation: BatchInvocation, control?: RunControl) => Promise<BatchResult>;
```

Root `src/batch.ts` (13) implements `runBatch`; this is the lazy dispatch
assembly that chooses the default registry and reviewed limits:

```ts
export declare function runBatch(invocation: BatchInvocation, control?: RunControl): Promise<BatchResult>;
```

`subs/cli/src/interfaces/cli.ts` (13), importing root `BatchOperation` and
analysis `RunControl` only as types:

```ts
export type CliExitCode = 0 | 1 | 2 | 130;
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly batch: BatchOperation;
}
```

`subs/cli/src/run-cli.ts` (13):

```ts
export declare function runCli(argv: readonly string[], environment: CliEnvironment,
  control?: RunControl): Promise<CliExitCode>;
```

`src/cli-entry.ts` begins with `#!/usr/bin/env node`, imports only CLI handling
and lightweight root invocation setup, and passes a callback with
`await import('./batch.js')`. It installs SIGINT handling, writes exitCode rather
than terminating before disposal, and handles broken output streams as operational
failures. `--help`/`--version` do not invoke the callback. CLI owns parse/format
code; its checks consume the same complete `AnalysisReport` as the reference
harness. No CLI type or root dispatch contract is imported by analysis or its
children. A requested unsupported browser verifier is unavailable, while ordinary
browser tag matching is required and supported. No inspection/watch/server
commands are implied. This package does not implement a daemon or listener.

## Layout and presentation boundary

Layout's I8 `src/interfaces/layout.ts` is neutral and has no foreign types:

```ts
export interface Point { readonly x: number; readonly y: number }
export interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface ViewRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Anchor { readonly u: number; readonly v: number }
export interface LayoutNodeInput { readonly key: string; readonly parent: string | null;
  readonly width: number; readonly height: number; readonly order: number }
export interface LayoutEdgeInput { readonly key: string; readonly from: string; readonly to: string;
  readonly lane: number; readonly order: number }
export interface LayoutGraphInput { readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[] }
export interface LayoutNode { readonly key: string; readonly box: Box }
export interface LayoutEdge { readonly key: string; readonly points: readonly Point[] }
export interface LayoutResult { readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[]; readonly bounds: Box }
export interface LayoutOptions { readonly gapX: number; readonly gapY: number;
  readonly padding: number; readonly orientation: 'horizontal' | 'vertical' }
export interface LegendItemInput { readonly key: string; readonly width: number; readonly height: number }
export interface LegendInput { readonly items: readonly LegendItemInput[]; readonly maxWidth: number }
export interface LegendResult { readonly items: readonly LayoutNode[]; readonly bounds: Box }
```

Its I8 functions are defined in the respective `*-placement.ts` and `bounds.ts`
files named in move-map.md:

```ts
export declare function placeNodes(input: LayoutGraphInput, options: LayoutOptions): LayoutResult;
export declare function placeLanes(input: LayoutGraphInput, options: LayoutOptions): LayoutResult;
export declare function placeChords(input: LayoutGraphInput, options: LayoutOptions): LayoutResult;
export declare function placeLegend(input: LegendInput, options: LayoutOptions): LegendResult;
export declare function placeTree(input: LayoutGraphInput, options: LayoutOptions): LayoutResult;
export declare function placeFocus(input: LayoutGraphInput, options: LayoutOptions): LayoutResult;
export declare function measureBounds(boxes: readonly Box[]): Box;
```

Existing geometry/viewport helpers retain their signatures while moving:
`scaleOf`, `clampPan`, `zoomAt`, `panBy`, `isReset`, `normalizeWheelDelta`,
`wheelFactor`, `headerBandHeight`, `r`, `polyline`, `textWidth`, `rowLabelDx`,
`wrapText`, and the neutral constants. Their exact current signatures are the
migration input, not a license to import parent-owned types. Move their geometry
types to the interface file above. Layout receives opaque keys, ordered edges,
measured dimensions and coordinates; it never receives a `Model`, `DiagramDefinition`,
color policy, module classification or React object. Presentation joins neutral
results to its own rows/labels/colors by key and uses the definitive model to
prepare permissions and teaching fixtures. All this work activates in iteration 8.

Presentation keeps its current public component/props and diagram-definition
names selected in owners.md. Their fields that name the legacy evaluator migrate
to the corresponding `Model`, `ModuleId`, `OriginalId`, `SourceArea`,
`ImportDecision` and `Exposure` types, imported through the reviewed model relay.
The file-by-file map owns the exact split; no combined dispatch/UI barrel survives.
Public rendering props and teaching data stay presentation originals with `ui`;
the layout vocabulary cannot become aliases of those parent-owned definitions.

## Package entries and activation

The final package metadata is the following map; iteration 8 activates only
entries whose implementation exists, and iteration 13 activates the complete map.
`main` and `types` target analysis in the final package; the legacy combined
entry is removed and repository consumers explicitly use subpaths.

```json
{
  "type": "module",
  "main": "./dist/subs/analysis/src/index.js",
  "types": "./dist/subs/analysis/src/index.d.ts",
  "bin": { "ramify": "dist/src/cli-entry.js" },
  "exports": {
    ".": { "types": "./dist/subs/analysis/src/index.d.ts", "import": "./dist/subs/analysis/src/index.js" },
    "./analysis": { "types": "./dist/subs/analysis/src/index.d.ts", "import": "./dist/subs/analysis/src/index.js" },
    "./analysis/inventory": { "types": "./dist/subs/analysis/src/inventory-entry.d.ts", "import": "./dist/subs/analysis/src/inventory-entry.js" },
    "./model": { "types": "./dist/subs/analysis/subs/model/src/index.d.ts", "import": "./dist/subs/analysis/subs/model/src/index.js" },
    "./presentation": { "types": "./dist/subs/presentation/src/index.d.ts", "import": "./dist/subs/presentation/src/index.js" },
    "./layout": { "types": "./dist/subs/presentation/subs/layout/src/index.d.ts", "import": "./dist/subs/presentation/subs/layout/src/index.js" },
    "./cli": { "types": "./dist/subs/cli/src/index.d.ts", "import": "./dist/subs/cli/src/index.js" }
  }
}
```

| Entry | Activation | Permitted transitive runtime dependencies |
| --- | --- | --- |
| `./model` | I8 package entry; owner API I3 | Own portable code and standard ECMAScript only; no Node, compiler, React or d3. |
| `./layout` | I8 | Own neutral geometry/viewport; portable d3 hierarchy/shape permitted; no React, model, filesystem or compiler. |
| `./presentation` | I8 | Presentation, portable model and layout; React/ReactDOM and browser-safe d3. No Node or compiler. |
| `./analysis/inventory` | I8 | Analysis inventory assembly, parser, project, registry/profile operations and configuration-only integration chosen in probes. No source program, React, d3, MCP or web server. |
| `.` and `./analysis` | I12 | Analysis and its four children; Node filesystem/path/crypto and selected compiler integration. No React, d3, CLI, daemon, MCP or web. |
| `./cli` | I13 | Argument parsing, formatting and injected operation types. No eagerly imported engine/compiler/UI/server stack. |
| `bin.ramify` | I13 | Lightweight root/CLI until check dispatch; then dynamic batch/analysis closure. No server startup. |

Source entry `subs/analysis/src/validation-entry.ts` activates I7 and exports
`validateProject` plus its named vocabulary relays for independent migration
verification. It is an internal supported repository tool surface, not an
additional final installed export. Source inventory-entry.ts exports
`acquireInventory` and named vocabulary needed by scripts before dist exists.
Root source never re-exports presentation values. Package resolution is separate
from Ramify exposure; a physical import can target the original owning file once
the consumer has a legal exposure path. No package wildcard exposes every private
implementation file.

## Future contexts boundary: type review only

The following draft belongs to the future owner
`subs/daemon/subs/contexts/src/interfaces/contexts.ts`. It is deliberately absent
from the nine Plan 1 declarations and package entries. The future port imports
analysis `AnalysisInputs`, `AnalysisReport`, `RunControl` as types through root's
unchanged analysis relay. Root supplies an implementation that opens a real
session and disposes it; contexts never imports root `BatchOperation`.

```ts
export interface AnalysisDriver {
  check(inputs: AnalysisInputs, control?: RunControl): Promise<
    { readonly status: 'reported'; readonly report: AnalysisReport }
    | { readonly status: 'cancelled' }
  >;
  dispose(): Promise<void>;
}
```

This type establishes reusable batch compatibility only. Plan 2 reviews the
extension for revision identity, changed inputs, scheduling, watcher ownership
and retained sessions. A Plan 1 input hash is not a `ContextRevision`, and no
watcher, historical lookup, persistent cache or empty daemon runtime is added.

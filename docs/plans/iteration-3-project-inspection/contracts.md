# Plan 3 contract review package

**Prepared:** 2026-09-11. **State:** draft review package for
[Plan 3](main-plan.md); iteration 1 accepts it or records its revision.
Final acceptance still requires the complete verification gates;
declaration availability alone is not delivery. The [owner manifest](owners.md),
[scope decisions](scope.md) and [instance inventory](subcases.md) form one
review package with this document. Changing a signature, a wire schema or
an activation stage revises this package before its consumers change.

Every name implemented by Plans 1 and 2 is reused exactly as recorded in
their contracts; nothing there is renamed. Names Plan 5 introduces are
consumed only in iteration 9, exactly as its [contracts](../iteration-5-fast-incremental-checks/contracts.md)
record them.

## Conventions and dependency direction

All paths are package-relative; public ESM imports end in `.js`. Each block
is an exact declaration fragment, with the owning interface file named
above it. Foreign types a consumer imports are named in
[owners.md](owners.md#foreign-signature-types); a type mentioned in a
signature is never implicitly exposed. Every result is plain, frozen data;
no compiler, socket or graph object crosses an owner boundary.

## Model: availability

`subs/analysis/subs/model/src/interfaces/model.ts` (iteration 2), appended:

```ts
export interface ConsumerArea {
  readonly module: ModuleId;
  readonly area: SourceArea;              // canonical: kind, root and profile as the model records them
}
export type AvailabilityForm = 'value' | 'type-only' | 'blocked';
export type AvailabilityReason = 'exposed' | 'type-only-original' | 'required-symbol-tag'
  | 'required-importer-tag' | 'testing-origin' | 'not-visible' | 'same-owner';
export interface MissingHop {
  readonly module: ModuleId;
  readonly destination: Destination;
  readonly declaration: string;           // rendered declaration text, e.g. `expose-sub inspect from core to parent`
  readonly existing: boolean;             // true when an effective hop already exists at this position
}
export interface OriginalAvailability {
  readonly original: Original;
  readonly consumer: ConsumerArea;
  readonly form: AvailabilityForm;
  readonly reason: AvailabilityReason;
  readonly visibility: VisibilityDecision;
  readonly requirements: readonly TagRequirement[];
  readonly testingOrigin: boolean;
  readonly missingHops: readonly MissingHop[];   // empty when visible or same-owner
}
```

`subs/analysis/subs/model/src/availability.ts` (iteration 2):

```ts
export function listAvailability(model: Model, consumer: ConsumerArea): readonly OriginalAvailability[];
export function explainAvailability(model: Model, consumer: ConsumerArea, original: OriginalId): OriginalAvailability;
```

`listAvailability` excludes same-owner originals and not-visible originals,
orders by owner, defining file and binding, and throws `TypeError` for a
consumer whose area is not the canonical area of its module.
`explainAvailability` accepts any original of the model and never throws
for a foreign or same-owner original; it throws for an unknown original.
The `requirements` records have the same `tag`, `kind` and `satisfied`
values `explainImport` produces for an access with the same importer area,
original and request. In iteration 9 both functions and `explainImport`
share one private helper in `availability.ts`.

## TypeScript: symbol details

`subs/analysis/subs/typescript/src/interfaces/source.ts` (iteration 4),
appended:

```ts
export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable'
  | 'namespace' | 'resource' | 'unknown';
export interface SymbolDetail {
  readonly original: OriginalId;
  readonly state: 'described' | 'truncated' | 'failed';
  readonly kind: SymbolKind;
  readonly signature: string;               // one line, body-free, bounded
  readonly declaration: string;             // body-free declaration text, overloads merged, bounded
  readonly documentation: string | null;    // JSDoc text without markers, bounded; null when absent
  readonly summary: string | null;          // first sentence or line of documentation
  readonly truncated: readonly ('signature' | 'declaration' | 'documentation')[];
  readonly limitId: string | null;          // SourceLimit id when failed
}
export interface DetailLimits {
  readonly maxOriginals: number;
  readonly maxSignatureChars: number;
  readonly maxDeclarationChars: number;
  readonly maxDocumentationChars: number;
  readonly deadlineMs: number;
}
export interface SymbolDetails {
  readonly details: readonly SymbolDetail[];
  readonly coverage: readonly SourceLimit[];
  readonly requested: number;
  readonly described: number;
}
export interface SourceAnalysis {
  catalog(signal?: AbortSignal): Promise<SourceCatalog>;
  accesses(signal?: AbortSignal): Promise<{ readonly accesses: readonly SourceAccess[];
    readonly coverage: readonly SourceLimit[] }>;
  details(originals: readonly OriginalId[], limits: DetailLimits, signal?: AbortSignal): Promise<SymbolDetails>;
  dispose(): Promise<void>;
}
```

`subs/analysis/subs/typescript/src/details.ts` (iteration 4) exports
`describeOriginals(project, catalog, originals, limits): SymbolDetails`,
executed inside the helper process; `src/wire.ts` gains the operation
`details` with `{ originals, limits }` input; `src/compiler-helper.ts`
serves it from the live program and checker after `catalog`; `src/bridge.ts`
and `src/source-analysis.ts` expose it. `SourceLimit.code` gains
`'detail-failed'` and `'detail-limit'`. Output is deterministic for
identical inputs: details are ordered by `originalKey`, whitespace is
normalized, and no position or timestamp appears in a detail.

## Analysis: inspection vocabulary and queries

`subs/analysis/src/interfaces/inspection.ts` (iteration 3):

```ts
export interface ConsumerLocation { readonly path: string }   // absolute, canonical; directory or file
export interface Consumer {
  readonly module: ModuleId;
  readonly name: string;
  readonly directory: string;
  readonly area: SourceArea;
  readonly baseDirectory: string;
  readonly outsideSource: boolean;
}
export type DetailLevel = 'names' | 'signatures' | 'docs';
export type InspectionQuery =
  | { readonly kind: 'available'; readonly from: ConsumerLocation; readonly pattern: string | null;
      readonly owner: string | null; readonly form: 'value' | 'type' | null; readonly tag: string | null;
      readonly search: string | null; readonly detail: DetailLevel; readonly limit: number | null }
  | { readonly kind: 'module'; readonly from: ConsumerLocation; readonly usage: boolean;
      readonly symbol: string | null }
  | { readonly kind: 'explain'; readonly from: ConsumerLocation; readonly name: string;
      readonly form: 'value' | 'type' };
export interface SymbolDetailView {
  readonly state: 'described' | 'truncated' | 'failed' | 'unavailable';
  readonly reason: 'not-extracted' | 'not-exposed' | 'superseded' | 'cold' | 'failed' | null;
  readonly kind: SymbolKind | null;
  readonly signature: string | null;
  readonly declaration: string | null;      // only at detail level 'docs'
  readonly documentation: string | null;    // only at detail level 'docs'
  readonly summary: string | null;
}
export interface AvailableSymbol {
  readonly name: string;                    // export name in the defining file
  readonly aliases: readonly string[];      // names differing from `name` in effective exposures
  readonly original: OriginalId;
  readonly owner: ModuleId;
  readonly file: string;
  readonly form: 'value' | 'type-only';
  readonly reason: AvailabilityReason;
  readonly tags: readonly TagName[];
  readonly path: readonly ExposureHop[];    // the first effective path
  readonly specifier: string;
  readonly details: SymbolDetailView;
}
export interface ProviderGroup {
  readonly module: ModuleId;
  readonly name: string;
  readonly purpose: ModulePurpose;
  readonly headerTags: readonly TagName[];
  readonly relation: 'ancestor' | 'child' | 'other';
  readonly symbols: readonly AvailableSymbol[];
}
export interface AvailabilityListing {
  readonly kind: 'available';
  readonly consumer: Consumer;
  readonly spellingStyle: 'relative-js';
  readonly providers: readonly ProviderGroup[];
  readonly total: number;                   // rows before limit
  readonly listed: number;
  readonly truncated: boolean;
  readonly typeOnly: number;
  readonly details: { readonly level: DetailLevel; readonly available: boolean;
    readonly reason: SymbolDetailView['reason'] };
  readonly notes: readonly string[];        // unknown owner, outside-source, and similar
}
export interface OwnExposure {
  readonly destination: Destination;
  readonly names: readonly string[];
  readonly original: OriginalId;
  readonly provider: ModuleId | null;
  readonly effective: boolean;
  readonly evidence: readonly SourceLocation[];
}
export interface UsageRow {
  readonly original: OriginalId;
  readonly name: string;
  readonly importer: SourceOrigin;
  readonly location: SourceLocation;
  readonly form: WrittenForm;
  readonly request: BindingRequest;
  readonly status: 'allowed' | 'denied';
  readonly reason: ImportReason;
}
export interface UsageListing {
  readonly symbols: readonly { readonly original: OriginalId; readonly name: string;
    readonly uses: number; readonly denied: number }[];
  readonly importers: readonly { readonly module: ModuleId; readonly files: readonly {
    readonly file: string; readonly rows: readonly UsageRow[] }[] }[];
  readonly unit: 'selections';
}
export interface ModuleSummary {
  readonly kind: 'module';
  readonly consumer: Consumer;
  readonly headerTags: readonly TagName[];
  readonly purpose: ModulePurpose;
  readonly parent: ModuleId | null;
  readonly children: readonly { readonly module: ModuleId; readonly name: string }[];
  readonly exposures: readonly OwnExposure[];
  readonly areas: readonly SourceArea[];
  readonly usage: UsageListing | null;
}
export interface SymbolExplanation {
  readonly kind: 'explain';
  readonly consumer: Consumer;
  readonly name: string;
  readonly matches: readonly {
    readonly availability: OriginalAvailability;
    readonly exportName: string;
    readonly specifier: string | null;      // present when the requested form is available
    readonly proposal: readonly MissingHop[];
    readonly proposalLabel: 'Proposed declarations (not existing permissions)';
    readonly details: SymbolDetailView;
  }[];
}
export type InspectionResult = AvailabilityListing | ModuleSummary | SymbolExplanation;
export type InspectionUnavailable = {
  readonly status: 'unavailable';
  readonly reason: 'invalid-query' | 'outside-root' | 'no-snapshot' | 'model-invalid';
  readonly message: string;
};
export interface InspectionInputs {
  readonly snapshot: AnalysisSnapshot;
  readonly root: string;
  readonly query: InspectionQuery;
  readonly maxListedSymbols: number;
}
```

`subs/analysis/src/inspection.ts` (iteration 3):

```ts
export function resolveConsumer(inventory: ProjectInventory, areas: readonly SourceArea[], root: string,
  location: ConsumerLocation): Consumer | InspectionUnavailable;
export function answerInspection(inputs: InspectionInputs): InspectionResult | InspectionUnavailable;
```

Both are pure over plain data. `answerInspection` reads
`snapshot.details` when present; iteration 9 adds an optional
`details?: SymbolDetails` input so the daemon can supply details obtained
from the retained session for the same revision.

`subs/analysis/src/interfaces/analysis.ts` (iteration 6), changed members:

```ts
export type Capability = /* Plan 1 members */ | 'symbol-details';
export type StageId = 'registry' | 'acquisition' | 'parse' | 'catalog' | 'link' | 'access' | 'details' | 'decide' | 'report';
export interface AnalysisLimits { /* Plan 1 members */ readonly details: DetailLimits }
export interface AnalysisSnapshot { /* Plan 1 members */ readonly details: SymbolDetails | null }
```

The `details` stage is `not-requested` without the capability, and
`completed`, `failed` or `blocked` with it; `failed` carries an
`execution` diagnostic and the capability record `executed: false`.

## Root: the service operation and the batch operation

`src/interfaces/service.ts` (iteration 8), appended:

```ts
export type ServiceOperation = /* Plan 2 members */ | 'inspect';
export type ServiceCapability = /* Plan 2 members */ | 'inspect';
export interface InspectParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly lastValid?: boolean;
  readonly query: InspectionQuery;
}
export type InspectOutcome =
  | { readonly status: 'answered'; readonly requestId: string; readonly revision: ContextRevision;
      readonly result: InspectionResult }
  | { readonly status: 'not-answered'; readonly requestId: string; readonly revision: ContextRevision | null;
      readonly reason: InspectionUnavailable['reason'] | 'snapshot-not-retained' | 'evicted-revision'
        | 'invalid-revision' | 'pending' | 'superseded' | UnavailableReason;
      readonly message: string }
  | { readonly status: 'cancelled'; readonly requestId: string };
export interface RamifyService {
  /* Plan 2 members */
  inspect(params: InspectParams, control?: RunControl): Promise<ServiceResult<InspectOutcome>>;
}
```

`src/interfaces/batch.ts` (iteration 7), appended:

```ts
export interface InspectInvocation { readonly cwd: string; readonly root?: string; readonly query: InspectionQuery }
export type InspectResult =
  | { readonly status: 'answered'; readonly inputId: string; readonly result: InspectionResult; readonly exitCode: 0 }
  | { readonly status: 'not-answered'; readonly report: AnalysisReport | null;
      readonly reason: InspectionUnavailable['reason'] | 'not-completed'; readonly message: string; readonly exitCode: 2 }
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type InspectOperation = (invocation: InspectInvocation, control?: RunControl) => Promise<InspectResult>;
```

`src/batch.ts` (iteration 7) exports `runInspection`, which calls
`analyzeProject` with the batch limits, `createDefaultTagRegistry()` and
Plan 1's capabilities plus `symbol-details`, then `answerInspection` over
the report's snapshot. `src/cli-entry.ts` injects
`inspect: async (invocation, control) => (await import('./batch.js')).runInspection(invocation, control)`.
`src/resident-assembly.ts` (iteration 8) passes
`inspection: { answer: answerInspection, resolve: resolveConsumer }` to
`createDaemonService`.

## Daemon: validation and binding

`subs/daemon/src/interfaces/daemon.ts` (iteration 8):

```ts
export interface InspectionEngine {
  answer(inputs: InspectionInputs): InspectionResult | InspectionUnavailable;
}
export interface DaemonServiceOptions { /* Plan 2 members */ readonly inspection: InspectionEngine }
```

`src/validation.ts` accepts `inspect` with `token`, `requestId`,
`freshness` as for `check`, optional boolean `lastValid`, and `query` as a
record whose `kind` is one of the three strings, whose `from.path` is a
nonempty string and whose remaining members have the declared types;
anything else is `invalid-request`. `src/service.ts` implements `inspect`
by calling the context manager's `check` with the request's token,
freshness and a derived `requestId`, taking the report of a `reported`
outcome, mapping `pending`, `superseded`, `cancelled` and unavailable
outcomes to `not-answered`, answering `snapshot-not-retained` when
`report.snapshot` is null, and otherwise calling `options.inspection.answer`
with the context's root and `maxListedSymbols`. `dispatchServiceRequest`
gains the case. `src/connection.ts` and `src/connect-daemon.ts` mirror the
method; the welcome advertises the `inspect` capability. From iteration 9
the binding obtains the report from the compact history's projection and
requests details from the session for the listed originals when the query's
detail level needs them.

## CLI: arguments, document and exits

`subs/cli/src/arguments.ts` (iteration 7) accepts:

```text
available [<pattern>] [--from <path>] [--owner <module>] [--kind value|type] [--tag <tag>]
          [--search <text>] [--detail names|signatures|docs] [--limit <n>] [--fresh] [--last-valid]
          [--batch] [--root <dir>] [--format json]
inspect   [--from <path>] [--usage] [--symbol <name>] [--fresh] [--last-valid] [--batch] [--root <dir>] [--format json]
explain   <name> [--from <path>] [--kind value|type] [--fresh] [--last-valid] [--batch] [--root <dir>] [--format json]
```

`--fresh` with `--batch`, `--last-valid` with `--batch`, `--symbol` without
`--usage`, a non-positive `--limit` and a `--detail` value outside the three
are invalid invocations. `subs/cli/src/interfaces/cli.ts` adds:

```ts
export interface CliEnvironment { /* Plan 2 members */ readonly inspect: InspectOperation }
export interface InspectDocument {
  readonly schemaVersion: 'ramify.inspect/1';
  readonly root: string;
  readonly mode: 'resident' | 'batch' | 'batch fallback';
  readonly revision: { readonly id: RevisionId; readonly sequence: number } | null;
  readonly inputId: string | null;
  readonly query: InspectionQuery;
  readonly outcome: 'answered' | 'not-answered';
  readonly reason: string | null;
  readonly result: InspectionResult | null;
  readonly exitCode: 0 | 2;
}
```

New source `subs/cli/src/inspect-commands.ts` implements the three commands
over `environment.inspect` and `connection.inspect`, reusing
`check-command.ts`'s connection, reopen and fallback rules for a
terminating command. Human rendering lives in `subs/cli/src/inspect-format.ts`:

```text
Root: <root>  Revision: rev/1:… | Mode: batch
From: subs/workspace/subs/reviews/src  (workspace/reviews, ordinary area, profile [dispatch])
Available: 23 symbols from 5 modules, 2 type-only
Signatures: from revision rev/1:…               | unavailable (not extracted; use --batch)

workspace/contracts  [ancestor's child]  Neutral vocabulary shared by every workspace owner.
  recordIdSchema      value      [browser]    ../../contracts/src/interfaces/vocabulary.js
      const recordIdSchema: ZodString — Identifier of a catalog record.
  RecordId            type-only  [browser]    ../../contracts/src/interfaces/vocabulary.js
      type RecordId = string
...
Listed 23 of 23.
```

`explain` prints one block per match ending in `Available as value from
here: ../x.js`, `Type-only from here (browser promise missing)` or
`Not available: not visible` followed by `Proposed declarations (not
existing permissions):` and the hop lines. `inspect` prints the summary
block and, with `--usage`, one section per importing owner. Exits follow
the [main plan](main-plan.md#exits).

## Package entries and activation

No package entry is added or removed; the eight entries and `bin` stand.
[owners.md](owners.md#activation-manifest) lists the activation stage of
every declaration line: iteration 2 activates the model availability line,
3 the inspection lines, 4 the details operation inside T1 and T2, 6 the
capability inside A4, 7 the batch and CLI lines, 8 the service lines and
the daemon's engine option, 9 the join changes behind existing lines, and
11 verifies the final texts through `scripts/validate-final-contracts.ts`.
Iteration 5 activates no line: it implements the explanation and module
branches over the vocabulary iteration 3 declared.

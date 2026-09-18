# Plan 2B contracts

**Status:** accepted with [Plan 2B](main-plan.md), 2026-09-18. The
[architect view specification](../../architecture/architect-view.spec.md) is
the output format; these contracts fix the code that produces it. Every public
value is immutable plain data. An iteration that finds a name here wrong for
the code it meets records the correction in its results and keeps the
behavior.

## C1. Export shapes

In `analysis/typescript`, `src/interfaces/source.ts`:

```ts
export type ExportBehavior = 'constructable' | 'callable' | 'member' | 'unknown';
export type ExportKind = 'class' | 'function' | 'interface' | 'type' | 'enum'
  | 'namespace' | 'value' | 'resource';
export interface ExportShapeRequest { readonly original: OriginalId; readonly exportName: string }
export interface ExportShape {
  readonly original: OriginalId;
  readonly exportName: string;
  readonly kind: ExportKind;
  /** null: a supporting original. */
  readonly behavior: ExportBehavior | null;
}
```

`describeExportShapes(project, inputs: { inventory; areas }, requests, signal?)`
returns one `ExportShape` per request, in request order.
`RetainedSourceAnalysis` gains
`shapes(requests, signal?): Promise<readonly ExportShape[]>`, with the same
hot-compiler precondition as `details`.

Rules:

- `kind` comes from the original's primary declaration: class, function,
  interface, type alias, enum and module declarations give their kind; any
  other value declaration gives `value`. A `resource` original gives
  `resource` and `behavior: null` without a compiler query.
- An original without a runtime value (`hasValue` false) has
  `behavior: null`.
- A value's behavior is the shape of its type at the declaration:
  `constructable`, `callable` and `member` give that behavior, `data` gives
  `null` and `unknown` gives `unknown`. A declaration the compiler cannot
  resolve gives `unknown` for a value.
- The shape comes from one function in `behavior-classifier.ts`,
  `BehaviorShapes.shape(type)`, returning `'constructable' | 'callable' |
  'member' | 'data' | 'unknown'`. The existing `of(type)` becomes
  `collapse(shape(type))`, where the three behaviors map to `capable`. Its
  results must not change for any type.
- Precedence: a construct signature gives `constructable`, else a call
  signature gives `callable`, else a declared first-level callable or
  constructable member gives `member`. A union or intersection takes the
  highest-precedence behavior among its non-nullish parts; with none, any
  `unknown` part gives `unknown`, else `data`. The depth limit, the
  instantiable-constraint rule and the library-member exclusion are unchanged.
- A counter, `shapeRuns()`, counts `describeExportShapes` calls in the
  process, as `behaviorRuns()` does for the consumer classifier.

## C2. Test titles

In `analysis/typescript`, `src/interfaces/source.ts`:

```ts
export interface TestTitleLimits {
  readonly maxTitleBytes: number;      // 240
  readonly maxTitlesPerRecord: number; // 40
  readonly maxResultBytes: number;     // 16 MiB
}
export interface TestSuiteTitles {
  readonly suite: readonly string[];   // outermost first; [] outside any suite
  readonly tests: readonly string[];   // direct tests only, source order
}
export type TestFileTitles =
  | { readonly file: string; readonly state: 'described';
      readonly suites: readonly TestSuiteTitles[];
      readonly dynamic: number; readonly cut: number }
  | { readonly file: string; readonly state: 'unavailable';
      readonly reason: 'not-in-program' | 'compiler-failure' };
```

`describeTestTitles(project, files, limits, signal?)` reads each
project-relative TypeScript or JavaScript file from the compiler program's
syntax tree, in request order. `RetainedSourceAnalysis` gains
`testTitles(files, limits, signal?)`. A counter, `testTitleRuns()`, counts
calls.

Rules, from the specification's `tests.jsonl` section:

- A suite is a call whose callee is `describe`, or `describe` followed by
  property accesses (`describe.skip`, `describe.only.each`), or a call of such
  a call (`describe.each(table)(title, …)`). A test is the same for `it` and
  `test`. The title is the first argument.
- A file with its own top-level binding named `describe`, `it` or `test`
  contributes no calls of that name.
- A title is verbatim when it is a string literal or a template literal with
  no substitutions; otherwise it is `(dynamic)` and counted in `dynamic`.
- Titles longer than `maxTitleBytes` are cut on a character boundary with a
  trailing `…` and counted in `cut`.
- One `TestSuiteTitles` per suite that has direct tests, per suite that has
  neither tests nor suites (with `tests: []`), and one with `suite: []` for
  tests outside any suite. A suite whose tests are all nested yields none.
  A list longer than `maxTitlesPerRecord` continues in further entries with
  the same `suite`.
- Exceeding `maxResultBytes` or cancellation throws the existing
  `SourceFailure`.

In `analysis`, a pure reader for `.feature` text:

```ts
export interface FeatureTitles { readonly feature: string | null; readonly scenarios: readonly string[] }
export function readFeatureTitles(text: string, limits: TestTitleLimits): FeatureTitles & { readonly cut: number };
```

It recognizes lines whose first non-blank text is `Feature:`, `Scenario:`,
`Example:`, `Scenario Outline:` or `Scenario Template:`, in English only, and
trims the title.

## C3. Architect projection and session query

In `analysis`, `src/interfaces/session.ts` or a new
`src/interfaces/architect-view.ts`:

```ts
export interface ArchitectModuleFacts {
  readonly module: ModuleId;
  readonly dir: string;                       // project-relative module directory, '' for the root
  readonly parent: ModuleId | null;
  readonly children: readonly ModuleId[];     // byte order
  readonly tags: readonly TagName[];          // header tags
  readonly areas: readonly string[];          // present areas relative to dir: 'src', 'src/tests'
  readonly purpose: { readonly state: 'present'; readonly path: string; readonly text: string }
    | { readonly state: 'missing' };
  readonly docs: readonly string[];           // inventory files under <dir>/src/docs/
  readonly files: { readonly own: number; readonly subtree: number };
}

export interface ArchitectSymbol {
  readonly module: ModuleId;
  readonly original: OriginalId;
  readonly name: string;                      // byte-least defining-file export name
  readonly binding: string | null;            // set when name is 'default'
  readonly exposureNames: readonly string[];  // owner exposure names other than name
  readonly role: 'exposed' | 'internal';
  readonly destinations: readonly Destination[];
  readonly kind: ExportKind;
  readonly behavior: ExportBehavior | null;
  readonly hasValue: boolean;
  readonly tags: readonly TagName[];          // Original.tags
  readonly reexposed: readonly { readonly by: ModuleId; readonly to: readonly Destination[] }[];
  readonly detail: SymbolDetail;
  readonly file: string;                      // project-relative defining file
}

export type ArchitectTestRecord =
  | { readonly kind: 'suite'; readonly module: ModuleId; readonly file: string;
      readonly suite: readonly string[]; readonly tests: readonly string[] }
  | { readonly kind: 'feature'; readonly module: ModuleId; readonly file: string;
      readonly feature: string | null; readonly scenarios: readonly string[] };

export interface ArchitectViewCounts {
  readonly coverage: number;
  readonly detailsUnavailable: number;
  readonly unknownShapes: number;
  readonly dynamicTitles: number;
  readonly testsUnavailable: number;
  readonly cut: number;
}

export interface ArchitectViewProjection {
  readonly schema: 'ramify.architect-projection/1';
  readonly sequence: number;
  readonly inputId: string;
  readonly root: ModuleId;
  readonly modules: readonly ArchitectModuleFacts[];   // tree order
  readonly symbols: readonly ArchitectSymbol[];        // by module, then name
  readonly tests: readonly ArchitectTestRecord[];      // by module, file, source order
  readonly counts: ArchitectViewCounts;
  readonly bytes: number;
}

export interface ArchitectViewQuery {
  readonly sequence: number;
  readonly details: SymbolDetailLimits;   // 240, 280, 4 overloads, 32 MiB
  readonly tests: TestTitleLimits;
  readonly maxProjectionBytes: number;    // 64 MiB
}

export type ArchitectViewQueryOutcome =
  | { readonly status: 'projected'; readonly sequence: number; readonly inputId: string;
      readonly projection: ArchitectViewProjection }
  | { readonly status: 'superseded'; readonly sequence: number; readonly observedInputId: string | null }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-revision' | 'resource-limit'
      | 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };
```

`RetainedSession.architectView(query, control?)` follows `apiView`: it is
serialized with the session's other operations, answers `invalid-revision`
for any sequence other than the current one, rehydrates a released compiler
the way `apiView` does, and travels through `session-messages.ts`,
`session-worker.ts` and `session-host.ts`.

The pure functions in `analysis`:

- `planArchitectView(facts)` lists the detail and shape requests for every
  owned exported original, the TypeScript and JavaScript test files, and the
  `.feature` files.
- `projectArchitectView(facts, sequence, inputId, provided, limits)` builds
  the projection from the model, catalog and inventory plus the provided
  details, shapes, test titles and feature titles, and refuses with
  `resource-limit` above `maxProjectionBytes`.

Selection rules:

- The originals are the catalog originals of kind `code` or `resource` whose
  owner is a declared module and whose defining file exports them under at
  least one name. Each appears once.
- `role` is `exposed` when the model has an `Exposure` with
  `provider === null` and `module === original.owner` for it;
  `destinations` and `exposureNames` are the union over those exposures.
- `reexposed` lists each exposure of the same original with a non-null
  provider and `effective: true`, one entry per relaying module, nearest to
  the owner first, with its destinations.
- Test files are inventory files in areas whose profile includes `testing`:
  `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs` and `.cjs` source files
  go to `testTitles`; `.feature` resources are read by the worker from disk
  and used only when their SHA-256 equals the revision's captured input; a
  mismatch answers `superseded`.
- A module's own `files` counts its inventory files of kind `source`; `docs`
  lists its inventory files under `<dir>/src/docs/`.

## C4. Rendering

In `analysis`:

```ts
export type ArchitectDependencyReason = 'analysis-failed' | 'resource-limit'
  | 'resource-unavailable' | 'invalid-current' | 'wait-limit';
export type ArchitectDependencies =
  | { readonly state: 'measured'; readonly facts: DependencyDiagramFacts;
      readonly testReferences: TestReferenceFacts | null }   // C9; added by iteration 6
  | { readonly state: 'unavailable'; readonly reason: ArchitectDependencyReason };

export interface ArchitectViewFile { readonly path: string; readonly text: string }  // relative to the view root
export interface RenderedArchitectView {
  readonly files: readonly ArchitectViewFile[];   // byte order by path, _meta.json included
  readonly modules: number;
  readonly records: number;                       // behavior + supporting + tests lines
  readonly bytes: number;                         // UTF-8
  readonly dependencies: ArchitectDependencies['state'];
}

export function renderArchitectView(input: {
  readonly revision: string;
  readonly projection: ArchitectViewProjection;
  readonly dependencies: ArchitectDependencies;
}): RenderedArchitectView;
```

The renderer imports no compiler, filesystem or session module. It throws
when measured facts or test references name an `inputId` other than the
projection's. Iteration 4 implemented C4 without `testReferences`; iteration 6
adds it as C9 states.

- A module's view directory is its identifier without the root module's
  identifier and the slash after it; the root module's is the view root.
- Units: group `facts.boundaries` by consumer module and original identity
  `(owner, file, binding, kind)`. A unit is behavioral if any boundary is
  behavioral, else unknown if any is unknown, else non-behavioral.
  `behavioral`, `nonBehavioral` and `unclassified` on a record list the
  consumer modules of its units by class. `uses` of module M and `usedBy` of
  module O count, per (M, O) pair, M's units on originals owned by O, by
  class.
- Records, `module.json`, `README.md` and `_meta.json` follow the
  specification's field tables, order, bounds and ordering exactly. JSON is
  produced from objects built in the specified key order; JSONL lines end in
  `\n`; files are UTF-8 with LF; an empty record file is `"\n"`.

## C5. Reserved names

In `analysis/project`, `generated-path.ts`: `isRamifyGeneratedSegment`
additionally returns true for `.ramify-architect`,
`/^\.ramify-architect\.tmp-.+$/` and `/^\.ramify-architect\.old-.+$/`.
`isRamifyGeneratedPath` and every call site are unchanged. Near misses such as
`.ramify-architects`, `.ramify-other` and `.ramify-architect.tmp` remain
ordinary. The toolkit's and the reference project's `.gitignore` add
`.ramify-architect/`, `.ramify-architect.tmp-*/` and
`.ramify-architect.old-*/`.

## C6. Publisher

In `daemon`, `interfaces/daemon.ts` and `api-view-publisher.ts`:

```ts
export type MaterializedViewId = 'api' | 'architect';
export interface PublishInput {
  readonly api: ApiViewProjection | null;
  readonly architect: RenderedArchitectView | null;
}
export interface ApiViewPublishLimits {
  readonly maxAreaBytes: number;
  readonly maxArchitectBytes: number;   // 64 MiB
  readonly maxInvocationBytes: number;
  readonly maxStagedBytes: number;
}
export interface MaterializedTarget {
  readonly view: MaterializedViewId;
  readonly module: string | null;             // null for architect
  readonly area: 'ordinary' | 'tests' | null; // null for architect
  readonly path: string;                      // '.ramify-architect' for architect
  readonly files: number;
  readonly entries: number;                   // records for architect
  readonly bytes: number;
  readonly changed: boolean;
}
publish(root, revision, input: PublishInput, requestId, control?): Promise<PublishApiViewOutcome>;
```

- The architect target is `<root>/.ramify-architect`, staged at
  `.ramify-architect.tmp-<suffix>`, rolled back through
  `.ramify-architect.old-<suffix>`, with the existing marker scheme.
- An existing target is replaced only when it is a real directory containing
  only regular files and directories whose `_meta.json` parses with
  `"schema":"ramify.architect-view/1"`. Anything else refuses the whole
  invocation with `invalid-path`, and a symbolic link with `symlink`; nothing
  changes.
- `_meta.json` is written last. Unchanged bytes are not staged. API and
  architect targets form one transaction: a failure while switching rolls
  back every switched target.
- The architect target counts against `maxArchitectBytes`,
  `maxInvocationBytes` and `maxStagedBytes`.
- The API view's rendering, paths and bytes do not change.

## C7. Materialize

Root `src/interfaces/service.ts`:

```ts
export type MaterializeViewId = 'api' | 'architect';
export interface MaterializeParams {
  // existing fields unchanged
  readonly views?: readonly MaterializeViewId[];   // absent: ['api']
}
// MaterializeOutcome 'materialized' gains, when architect was requested:
//   readonly architect?: { readonly modules: number; readonly records: number;
//     readonly dependencies: 'measured' | { readonly unavailable: ArchitectDependencyReason } };
```

`ServiceCapability` gains `'materialize-views'`, which the daemon advertises.
Validation accepts `views` as a non-empty array of distinct known identifiers.
`selection` stays required and is ignored when `api` is not requested.

Contexts: `ApiViewRequest` gains `views?: readonly MaterializeViewId[]`;
`ApiViewQueryLimits` gains `architect: { details; tests; maxProjectionBytes }`;
the `projected` outcome's `projection` becomes `ApiViewProjection | null` and
gains `architect: ArchitectViewProjection | null`. The session is called only
for requested views, both at the pinned sequence.

Daemon service: after a `projected` outcome with `architect`, it waits for
dependency facts as the [lifecycle](main-plan.md#lifecycle-and-consistency)
describes, using the service's own `dependencyDiagram` path and lease, then
renders and publishes. A `superseded` dependency answer returns
`superseded`. Cancellation during the wait returns `cancelled`.

CLI: `ramify materialize [--view <api|architect>]... [--from <path> | --all] [--root <dir>]`.

- Unknown or duplicate `--view` values, and `--from` or `--all` without the
  API view, are invalid invocations: exit 2 before connecting.
- Without `--view`, the request carries no `views` field, so the wire and the
  output are Plan 2A's.
- With `views`, a daemon whose welcome lacks `materialize-views` gives
  `Error [incompatible-service]` and exit 2.
- Success output keeps the existing two lines and adds, for the architect
  view:
  `Architect view: .ramify-architect, <modules> modules, <records> records, dependencies <measured|unavailable (<reason>)>`.
- Exits are Plan 2A's: 0 complete, 1 invalid project, 2 unavailable,
  superseded, partial, rollback failure, deadline or incompatible service,
  130 interrupted.

## C8. Failure and preservation

| Condition | Result | Existing views |
| --- | --- | --- |
| A symbol detail, shape or test file fails alone | Published with `detail`, `unknown` or a count | Replaced |
| Dependency facts unavailable or wait limit | Published with `dependencies: unavailable` and reason | Replaced |
| Newer revision before dependency facts | `superseded` | Preserved |
| Session projection or publisher bound | `unavailable` | Preserved |
| Existing `.ramify-architect` not recognizably generated | `unavailable`, `invalid-location` | Preserved |
| Symbolic link in or at a target | `unavailable`, `symlink` | Preserved |
| Cancellation before switching | `cancelled` | Preserved |
| Failure during switching | Rolled back; never success | Restored or explicit rollback failure |
| Identical bytes | Published, zero bytes written | Untouched |
| Test references refused by their byte limit alone | Published with `testReferences: unavailable` | Replaced |

## C9. Test references

Added on 2026-09-18, after iteration 4, when `tests.jsonl` records gained
`exercises`. It is a projection of facts the dependency analyzer already
produces: `DependencyBehaviorFacts` holds one `DependencyBehaviorFact` per
(consumer file, original) pair whatever the ownership of either file, with the
precedence behavioral, unknown, non-behavioral, unused already applied. The
classifier is unchanged.

In `analysis`, `src/interfaces/dependency-diagram.ts`:

```ts
export interface TestFileReferences {
  readonly file: string;                        // project-relative consumer file
  readonly exercises: readonly OriginalId[];    // pairs classified behavioral, by (owner, file, binding, kind)
  readonly unclassified: number;                // pairs classified unknown
}

export interface TestReferenceFacts {
  readonly inputId: string;
  readonly files: readonly TestFileReferences[];  // byte order by file
}

export function projectTestReferences(input: DependencyDiagramInput):
  | { readonly status: 'projected'; readonly references: TestReferenceFacts }
  | { readonly status: 'refused'; readonly reason: 'analysis-incomplete' | 'not-requested'
      | 'capability-failed' | 'resource-limit';
      readonly observedBytes?: number; readonly maximumBytes?: number };
```

- The consumer files are those the modularity projection's `test` source
  filter selects: files in areas whose profile includes `testing`. Same-owner
  originals are included. A file with neither a behavioral nor an unknown
  pair is omitted. `DependencyDiagramInput.limits.maxResultBytes` bounds the
  references' JSON separately from the diagram's.
- `DependencyAnalyzerOutcome`'s `ready` variant gains
  `testReferences: TestReferenceFacts | null`, projected from the same report
  in the same run as `diagram`; `null` means only the references were refused.
  The diagram facts are byte-identical to those before this change. The
  process runner in `src/dependency-analyzer-process.ts` validates and carries
  the field.
- Iteration 7 carries `testReferences` from the context manager's ready
  dependency result to `renderArchitectView`. The public
  `RamifyService.dependencyDiagram` answer and the explorer's wire stay
  unchanged.
- The renderer writes `exercises` on each suite record whose `file` has an
  entry, as `<owner>#<name>` using the `name` of the original's own record,
  distinct and in byte order, at most twelve with `exercisesMore`; `[]` for a suite record
  whose file has no entry; nothing on feature records; and no `exercises` on
  any record when `testReferences` is `null` or dependencies are unavailable.
  An original with no record in the projection is left out.
  `unclassifiedExercises` in `_meta.json` sums `unclassified` over files that
  have a suite record. `_meta.json` records `testReferences` after
  `dependencyScope`.

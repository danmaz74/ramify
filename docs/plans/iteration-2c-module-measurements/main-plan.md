# Plan 2C: Module measurements

**Date:** 2026-09-19. **Status:** implemented; the
[completion report](iterations/iteration4-results.md) records MM01–MM18 and the
fixed `measure` policy. This plan makes Ramify measure, per module and at one revision, how
much text a module and its subtree hold and which files belong to it. It
publishes one computation through two surfaces: a summary in the
[architect view](../../architecture/architect-view.spec.md) for an agent
reasoning about the architecture, and a `measure` query with JSON output for a
program. Ramify interprets neither. The motivating consumers were recorded
during plan review; nothing in this plan names or depends on them.

## Runnable outcome

On a project with a running daemon:

- `ramify materialize --view architect` publishes, in each module's
  `module.json`, a measured `metrics` block with context size for the exact
  owner and its subtree.
- `ramify measure --format json` prints one document, pinned to one revision,
  with the same values for every module plus every owned file's owner, area,
  kind and bytes. It writes nothing to the project.

Both surfaces report equal inventory buckets at the same revision. API-view
bytes are equal when both surfaces measure them; an explicit architect-only
omission policy may leave those bytes unavailable there while the query
measures them. Neither surface substitutes zero for unavailable evidence.

## What exists

Verified against source on 2026-09-19:

- The [modularity report](../../architecture/modularity-report.spec.md#9-context-size)
  defines context size per exact owner and subtree, per source filter:
  `sourceFiles`, `sourceBytes`, `resourceFiles`, `resourceBytes`, `originals`,
  `exposedOriginals`, `accessOccurrences`. `contextSize` in
  `subs/analysis/src/modularity-owner.ts` computes it from a complete report.
  Only the probe script and tests call `projectModularity`; its types are
  internal to `analysis`.
- The architect view hardcodes `"metrics": { "state": "unavailable" }` in
  `module.json` and `"metrics": "unavailable"` in `_meta.json`
  (`subs/analysis/src/architect-render.ts`). The block is reserved by the
  specification.
- The architect projection is built from `SessionFacts`, which holds the
  inventory, not a complete report. `InventoryFile` carries `path`, `owner`,
  `area`, `kind`, `sha256` and `bytes`. Admission is by location: every file
  under a module's `src/`, subject to discovery exclusions and without
  traversing symlinks; `module.ramify` and generated paths are excluded, with
  `kind` decided by extension.
- `README.md` and `module.ramify` are captured inputs with byte counts (roles
  `readme` and `description`) but not inventory files, so nothing counts them.
  The retained session already preserves captured inputs with its published
  revision (`session-engine.ts`); no new project inventory field is needed.
  Other files under a module directory outside `src/` are not inventoried.
- The API view renderer (`subs/daemon/src/api-view-documents.ts`) is pure; the
  publisher already sums rendered bytes per target. The architect view is
  rendered before publication and receives none of it.
- The daemon answers retained-session queries without writing files, as
  `explorerDetails` does. No operation returns measurements, and no command
  maps a path to its owner; `OwnershipResolver` is internal and has no area.

## Decisions delivered

1. **One computation.** A new internal function in `analysis` computes the
   file and byte buckets from inventory files, effective ownership and captured
   inputs. Declared ownership serves the query and architect view; the existing
   modularity report also supplies validated candidate ownership. The
   modularity report's `contextSize`, the architect projection and the
   `measure` query all use it. `originals`, `exposedOriginals` and
   `accessOccurrences` stay report-only.
2. **A documentation bucket.** `documentation` counts the owner's `README.md`
   and `module.ramify`. Documentation under `src/` is already a resource and
   is not counted twice. It is independent of the source filter and reported
   once per owner. Candidate reports do not invent documentation for proposed
   owners; their documentation bucket is explicitly unavailable, as specified
   below. Their existing source/resource counts remain measurable.
3. **No sum and no reading.** Ramify keeps the term context size and publishes
   buckets. A consumer adds the buckets it reads.
4. **View bytes from an in-memory render.** The daemon renders the API view of
   every module in memory, without writing it, and measures the bytes per
   owner and area: exactly what `materialize --view api` would publish at that
   revision. The daemon, which owns the API renderer, adds them to the
   session's inventory buckets once for both surfaces; the session never
   carries a placeholder for them. One render covers the whole project, so
   view bytes are measured for every owner or for none, and each surface
   carries one common `views` state. The resource and surface-equality contracts
   below define failures and the architect-only omission policy. MM12 chooses
   the delivered policy from measured cost; it is not a timing-dependent
   fallback on individual invocations.
5. **Surfaces by consumer.** The architect view carries the summary only:
   exact and subtree buckets, no file list, so an agent's searches gain almost
   no hits. The file list and the ownership rule are in the `measure` output
   only.
6. **`measure` is a daemon query with synchronized freshness**, like
   `materialize`, so a caller gets values for the project's current state. It
   never runs a batch analysis and never writes. Whole project only; selectors
   are deferred until a consumer needs them.
7. **Inventory evidence and provisional paths are distinct.** The `measure`
   output publishes the path-attribution rule below. Listed files have verified
   owner/area facts. Path shape alone never proves that an unlisted path was
   inventoried: exclusions, independent scopes and symlinks may explain its
   absence. No filesystem traversal or new path-query operation is added.
8. **Schema identity.** Filling the reserved `metrics` block keeps
   `ramify.architect-view/1`. The query output is a new schema,
   `ramify.measure/1`.
9. **Other modularity metrics stay out.** Locality, connectedness, stability
   and the other indices of the
   [cohesion and coupling proposal](../../agents/module-architect-skill-design/2026-09-18-cohesion-coupling-indices.md)
   need a complete report in the daemon and the `dependency-behavior`
   capability. They remain that proposal's subject.

## Contract

### Buckets

For one owner, exact or subtree:

```json
{ "production":    { "sourceFiles": 0, "sourceBytes": 0, "resourceFiles": 0, "resourceBytes": 0 },
  "tests":         { "sourceFiles": 0, "sourceBytes": 0, "resourceFiles": 0, "resourceBytes": 0 },
  "documentation": { "files": 0, "bytes": 0 },
  "views":         { "ordinaryBytes": 0, "testsBytes": 0 } }
```

- Production and tests follow the report's
  [source filter](../../architecture/modularity-report.spec.md#source-filter):
  the ordinary source of a testing-classified module counts under tests.
- Subtree values are sums over the subtree's owners.
- `views` comes from one in-memory render of the whole project's API view.
  Each surface carries one views state, `"measured"` or
  `{ "state": "unavailable", "reason": … }`; when unavailable, `views` is
  omitted from every bucket set rather than reported as zero.
- A missing area has zero bytes and is measured; unavailable is never zero.

### Architect view

`module.json` `metrics` becomes
`{ "state": "measured", "views": <views state>, "contextSize": { "exact": <buckets>, "subtree": <buckets> } }`,
or `unavailable` with a reason when no valid inventory exists. `_meta.json`
`metrics` becomes `measured` or `unavailable`.

### Effective ownership and documentation

The shared arithmetic accepts files already resolved to an effective owner and
production/testing classification, plus the selected owner set. The report
adapter uses its existing `OwnershipResolver` and candidate tree; the retained
session uses declared inventory ownership and source profiles. Neither adapter
reassigns files by directory after candidate ownership has been resolved.
Subtree membership follows the tree in use. Existing coverage, original,
exposure and occurrence calculations remain in the report.

For declared ownership, documentation counts captured `README.md` and
`module.ramify` inputs once, independently of source filters. An absent README
adds no file or bytes; unreadable/uncaptured required evidence is unavailable,
not an empty file. Capture lengths belong to the same revision as inventory.
Use the session's existing retained captured-input list under the same serialized
sequence guard as inventory; do not add another stored copy or reread live files.
Missing required capture evidence refuses the measurement instead of producing
a successful document with incomplete documentation totals.

Candidate ownership reassigns source/resources, not descriptions or README
files, and may contain owners with no directory. For every candidate report,
`ContextSize.documentation` is `{ "state": "unavailable", "reason":
"candidate-documentation" }`; declared reports use `{ "files": N, "bytes": N }`.
This affects only the new documentation field, not the existing four file/byte
fields or their coverage. Query/view buckets always use declared ownership;
candidate structures and this report-only reason are not added to their API.

### `ramify measure --format json`

```json
{ "schema": "ramify.measure/1",
  "revision": "rev/1:…",
  "root": "…",
  "ownershipRule": "…the path-attribution rule below…",
  "views": <views state>,
  "modules": [ { "id": "workspace/analysis", "dir": "subs/analysis", "parent": "workspace",
                 "exact": <buckets>, "subtree": <buckets> } ],
  "files": [ { "path": "subs/analysis/src/architect-view.ts", "owner": "workspace/analysis",
               "area": "ordinary", "kind": "source", "bytes": 12345 } ],
  "outsideModuleFiles": [ "…compiler-selected paths owned by no module…" ] }
```

- `modules` in module-identifier order; `files` in path order; `kind` is
  `source`, `resource` or `documentation`.
- Source/resource records have physical `area` `ordinary` or `tests`;
  documentation records have `area: "documentation"` and name only the owner's
  root `README.md` or `module.ramify`. IDs and parents use the existing module
  identity convention; the root parent is `null`. Paths are project-relative.
- No duplicate per-file testing flag is needed. With a complete inventory,
  `tests` area files are testing-classified. For an owner with ordinary files,
  a positive exact production file count (source plus resource) classifies all
  its ordinary files as production; otherwise they are testing-classified.
  An owner with no ordinary files provides no such inference for future files.
  Never apply this derivation to unavailable or partial buckets.
- Without `--format json`, a short text table of exact and subtree totals per
  bucket.
- Exit codes and project selection follow the
  [CLI invocation contract](../../architecture/cli-invocation.spec.md);
  pending, cold, deadline and unavailable outcomes are reported as for
  `materialize`, never as zero values.

The service gains operation `measure` and capability `measure`, with
parameters `token`, `requestId`, synchronized `freshness` and optional
`deadlineMs`, returning the document above or the materialize outcome
statuses.

### Path-attribution rule

The following order is normative. Paths must first be normalized within the
reported project root; escapes or malformed paths are not attributable.

1. A reserved generated segment means `generated`, before testing for source
   area or owner. Use the existing `generated-path.ts` predicate exactly:
   `.ramify`, `.ramify-architect`, and their `.tmp-<suffix>`/`.old-<suffix>`
   siblings at any segment position, including sibling marker files. Similar
   names such as `.ramify-other` are not reserved.
2. A path in `files` is `inventoried` with exactly its recorded owner, area,
   kind and bytes. A path in `outsideModuleFiles` is known outside the owned
   inventory; it receives no owner even if its spelling resembles owned source.
3. Beneath a directory named `.git`, `node_modules`, `bower_components` or
   `jspm_packages`, an unlisted path is `excluded`, following discovery's
   unconditional directory exclusions.
4. Every other unlisted path is `unobserved`. Its nearest listed module may
   supply a **provisional** owner/area only beneath that module's `src/`
   (`src/tests/` takes precedence) or at its root documentation paths. Other
   locations receive no provisional owner. Never climb to an ancestor's source
   area when the nearest module does not own that location.

Configured output exclusions, independent compiler scopes, invalid boundaries
and symlink observations are not fully encoded by the query. An unobserved path
therefore cannot be asserted present, owned, ordinary, empty or outside the
project from its spelling alone. No symlink following is implied. Refreshing
the inventory can establish a new file; until then attribution is provisional.
Consumers can implement this rule from the document without another analyzer.

### Surface equality and unavailable values

Inventory/documentation buckets must match at the same revision. View bytes
must match when both surfaces have `views: "measured"`; unavailable fields are
absent and have an explicit reason. Keep all modules' view-byte availability
uniform within each surface; discard any partial render totals.

The default architect metrics policy is `measure`. MM12 may select `omit` as
the delivered policy if the added render exceeds the agreed architect budget.
Record that build/configuration choice in the specification and completion
report. Under `omit`, architect metrics always use `not-requested`, including
combined API/architect publication; requested API publication still proceeds
normally. `measure` queries always attempt view measurement independently.
Policy never changes based on a single invocation's elapsed time. This is the
only policy-based exception to surface equality, and MM16 tests it explicitly.

An API-only projection/render failure may leave valid inventory buckets with
`views` unavailable (`resource-unavailable` or `analysis-failed`). The reason
must survive serialization. Cancellation, deadline expiry, supersession and
invalid current inventory instead terminate the whole request with the existing
corresponding outcome; never turn them into a successful partial document or
combine new buckets with the last valid revision. Equality checks compare
commonly measured fields and separately assert availability/reasons.

### Resource and execution limits

Reuse the existing API projection/detail limits and numeric render ceilings:
32 MiB per API area and 256 MiB across all API areas of one measurement. The
architect target retains its separate 64 MiB publication ceiling. These are
encoded UTF-8 byte bounds, not a claim about total process heap usage. Staging
limits apply only when publishing; measurement never stages output.

Refactor the existing renderer to support bounded counting/emission through the
same encoding path; do not create a second approximate serializer. Check bytes
before accepting each emitted chunk, discard completed area's temporary
buffers for measurement-only calls, and stop at the first exceeded ceiling.
When publication is also requested, reuse rendered selected areas within the
existing invocation ceiling; measurement must not widen publication selection.
Projection, byte measurement and returned inventory must share one revision.

Bound the complete serialized `measure` response, including its transport
envelope, by the daemon's configured/negotiated `maxResponseBytes` before
allocating a complete response string or buffer. Count JSON escaping and UTF-8
exactly while accumulating records; stop/refuse the whole document with the
existing `resource-unavailable` outcome instead of dropping file records.
Direct-service and CLI paths use the same configured ceiling. Existing
acquisition owner/file limits continue to bound the underlying inventory.

Carry one request deadline/cancellation control through projection, rendering
and response assembly. Check it before each module and between bounded output
batches; yield to the event loop at least every 256 records or 1 MiB of emitted
text, whichever occurs first. Split larger output into bounded chunks. Check
again before returning or publishing and verify the revision has not changed.
Interrupted/failed buffers are released and never published or retained as
valid measurements. No per-request cache or new model analysis is required.

For MM12, retain Plan 2B's warm toolkit bounds: 15 s for the architect session
query, 90 s for whole architect materialization, 8 MiB for the published view
and zero bytes written on an unchanged repeat. Re-measure hit cost against the
recorded baseline and its explicit deferral; it was not a passing threshold.
The new measure latency and peak memory are reported separately, without an
invented pre-measured performance claim.

MM15/MM17 use lowered injected limits for exact-boundary tests, escaped and
multibyte text, many owners/files and mid-work cancellation. At-limit succeeds;
one byte over fails explicitly. MM12 records live cost and peak memory; timing
evidence cannot substitute for enforced ceilings or justify silently increasing
them. New limits or policy changes require a recorded contract decision.

### Specifications changed

Section 9 of the modularity report gains the documentation bucket. The
architect-view specification replaces the reserved `metrics` text. The
[processes and clients](../../architecture/processes-and-clients.md) command
table and the daemon's operation list gain `measure`. No principles document
changes: these are tooling outputs, and the importability model is untouched.

## Exposure

The bucket, module-measurement and file-record types live in a new
`interfaces/measurements.ts` in `analysis`, exposed whole to its parent and
re-exposed by the root to descendants, as `interfaces/architect-view.ts` is.
The retained session gains one operation returning inventory buckets and the
file list for a sequence; the daemon adds view bytes. No modularity report type
leaves `analysis`. Candidate ownership remains internal to the report adapter.

## Iterations

| Iteration | Delivers | Owner | Prerequisite |
| ---: | --- | --- | --- |
| [1](iterations/iteration1.md) | Specification text; shared bucket computation with documentation; modularity report uses it | `analysis` | none |
| [2](iterations/iteration2.md) | Measurement types, retained-session operation, in-memory view bytes, architect view `metrics` | `analysis`, `daemon` | 1 |
| [3](iterations/iteration3.md) | `measure` operation, capability and protocol | `daemon`, root service interface | 2 |
| [4](iterations/iteration4.md) | `ramify measure` command; toolkit evidence, latency and budgets; completion report | `cli`, evidence | 3 |

## Acceptance

| ID | Iteration | Case |
| --- | ---: | --- |
| MM01 | 1 | The shared computation returns the existing `sourceFiles`, `sourceBytes`, `resourceFiles`, `resourceBytes` for the modularity fixture unchanged, for exact owner and subtree, in both filters. |
| MM02 | 1 | `README.md` and `module.ramify` bytes appear as documentation for their owner; a module without a README counts only its description; documentation under `src/` stays a resource. |
| MM03 | 1 | A testing-classified module's ordinary source/resources count under tests and none under production. Reconstruct source-filtered totals from complete records and the documented ordinary-file derivation; cover resource-only, empty and ordinary production owners. Empty owners provide no future-file classification. |
| MM04 | 2 | The retained-session operation returns inventory buckets, without views, equal to the shared computation and a file list equal to the inventory plus documentation, ordered, with no descendant file in an ancestor's exact list. Documentation records have area/kind documentation and captured revision-bound bytes; missing README is not a zero-byte file record. |
| MM05 | 2 | The architect fixture's `module.json` carries measured context size equal to the session operation's values plus the in-memory view bytes; golden files updated; key order pinned; no file list in the view. |
| MM06 | 2 | With no valid inventory, `metrics` and the session operation are unavailable with a reason, never zero. When the API projection fails, the views state is unavailable and no bucket set carries `views`. An unchanged project republishes zero bytes. |
| MM07 | 2 | View bytes from the in-memory render equal the sizes of the files `materialize --view api --all` publishes at the same revision, per owner and area; no file is written by the measurement. Reuse rendering for combined publication without widening its selected API targets. |
| MM08 | 3 | Over actual daemon transport, inventory buckets and commonly measured view bytes equal the architect output at the same revision; availability and reasons are checked separately. Synchronized freshness waits for a pending edit; cancellation, deadline, cold and superseded outcomes follow `materialize`. No last-valid inventory is labeled as the invalid current revision. |
| MM09 | 3 | A client without the `measure` capability is refused as unsupported; existing operations and capability negotiation are unchanged. |
| MM10 | 4 | `ramify measure --format json` on the toolkit prints a valid `ramify.measure/1` document; every listed path is inventoried with exactly its recorded owner/area; named unobserved and outside paths follow the published rule without treating provisional owners as verified. |
| MM11 | 4 | Toolkit: the sum of exact values over all owners equals the root subtree value per bucket, and each file-level byte count matches the file on disk. |
| MM12 | 4 | Record toolkit `measure` latency warm and after a new daemon, peak memory during all-area rendering/response assembly, architect size/time/unchanged-repeat budgets and hit cost. Choose and document the fixed architect metrics policy; compare hit cost with Plan 2B's recorded deferred overages rather than claiming its failed thresholds passed. Rendering/response ceilings remain enforced under either policy. |
| MM13 | 4 | `npm run check:self` passes; the only new exposures are the listed measurement types and the session operation. |
| MM14 | 1 | Preserve identity, split and merge candidate context sizes in both filters and exact/subtree scopes; the existing helper split still contributes one source file and 20 bytes to its candidate owner. Add resource reassignment and unchanged root totals. Candidate documentation is explicitly unavailable; declared documentation remains measured once per owner. |
| MM15 | 2 | At-limit and one-byte-over per-area/all-area renders, escaped/multibyte text and many-owner fixtures enforce injected byte ceilings before accumulation. No partial view totals survive. Cancellation, deadline and revision change during rendering abort without publication; subsequent requests succeed with released temporary state. |
| MM16 | 3 | At one revision, fixed architect policy omit produces not-requested view metrics while measure returns measured view bytes. Inventory buckets agree, unavailable buckets omit views, repeats are deterministic, and combined API publication still works. An API render limit preserves valid inventory plus its view failure reason, while whole-request interruption never becomes partial success. |
| MM17 | 3 | Many-file/long-path/escaped-Unicode responses succeed exactly at the configured response ceiling and refuse one byte over, including envelope bytes, over actual transport and the direct service. No file-list truncation or success before a late codec refusal. Mid-assembly cancellation/deadline aborts; recovery succeeds. |
| MM18 | 4 | A CLI fixture exercises generated catalogs and transient markers at multiple depths, similar nonreserved names, dependency/output directories, independent compiler scopes, symlinks, outside-module files and newly created paths. Listed facts remain authoritative; known generated/excluded paths receive no source owner; other absent paths remain unobserved/provisional until a refreshed inventory establishes them. |

## Review dispositions

The 2026-09-19 review is addressed in the delivered contract. The completion
report names the implementation evidence for each disposition.

| Issue | Plan change | Evidence required |
| --- | --- | --- |
| Candidate ownership regression | Shared arithmetic receives effective ownership; candidate documentation is unavailable | MM14 |
| Overclaimed unlisted-path ownership | Generated paths first, listed facts authoritative, then known exclusions and unobserved paths; provisional attribution only | MM10, MM18 |
| Missing file classification | Document derivation from complete owner buckets and physical areas; no duplicate testing flag | MM03, MM04 |
| Fallback versus equality | Equality on commonly measured fields, explicit availability, fixed architect omission policy | MM08, MM16 |
| Unbounded measurement work | Reuse numeric render limits, bound serialized responses and propagate interruption | MM12, MM15, MM17 |

## Completion gate

All cases have evidence. The architect-view, modularity-report, processes and
clients and daemon documents describe the delivered fields, operation and
command. The completion report records all MM01–MM18 evidence, the toolkit's
per-owner values, the `measure` latency, the budget and hit-cost measurements
and the decision taken
on each review item. The roadmap gains a Plan 2C row.

## Out of scope

Cross-bucket scores, rankings, recommendations or interpretation; agent-specific
names or outputs; other modularity indices; module or path selectors on `measure`; an
MCP or explorer surface for the values; a batch `measure`; files under a module
directory outside `src/` other than the two declared documentation inputs;
verified ownership for arbitrary unlisted paths; candidate measurements on the
new CLI/service; token counts. Excluded files remain uninventoried and are
named as a limit in the specification. No consumer activity is recorded.

# Plan 3 scope and semantic decisions

**Status:** draft review package for [Plan 3](main-plan.md), prepared
2026-09-11. This document fixes the consumer-area rule, the spelling rule,
the availability semantics, the detail tiers, the explanation proposals,
the usage semantics, the freshness rules, the coexistence rules with Plan 5,
budgets and deferrals in reviewable form. [contracts.md](contracts.md) owns
the exact signatures and wire schemas; [owners.md](owners.md) owns
declarations and placement. Plan 2's [scope decisions](../done/iteration-2-resident-verification/scope.md)
remain in force for deployment, endpoint discovery, startup and recovery,
idle exit, context selection, compatibility and IPC bounds. Only the
sections below change or extend them.

## Consumer area rule

Every query names a consumer location: a directory or a file inside the
selected project. The CLI supplies the working directory when `--from` is
absent. Resolution runs after the root is selected by the unchanged
[CLI invocation contract](../../architecture/cli-invocation.spec.md#selecting-the-project)
and uses the inventory of the revision being queried:

1. Canonicalize the location. A location outside the selected root is an
   invalid invocation.
2. Find the module whose directory is the longest prefix of the location.
   Module directories nest only through `subs/`, so the longest prefix is
   the innermost module. A location under `subs/` of a module but outside
   every child's directory belongs to that module.
3. If the location lies beneath the module's `src/tests/` area root, the
   consumer is the tests area; if beneath its ordinary `src/` root, the
   ordinary area; otherwise the ordinary area with `outsideSource: true`.
4. The base directory for spellings is the location itself when it is a
   directory and its parent directory when it is a file.

The answer states owner, area kind, profile, base directory and the
`outsideSource` flag. A tests area that is absent (`present: false`) still
resolves; its profile is the fixed testing profile. The rule reads
`InventoryModule.directory` and `InventoryArea.root`; it adds nothing to
`project`.

## Spelling rule

The specifier of a listed symbol is the relative path from the base
directory to the original's defining file (`Original.id.file`), with a
leading `./` when it does not start with `../`, and with a `.ts`, `.tsx`,
`.mts` or `.cts` extension replaced by `.js`, `.js`, `.mjs` or `.cjs`
respectively. Resource originals keep their own extension. Path separators
are `/`.

This is the convention of the reference project and the toolkit, both of
which import other modules' files directly with `.js`; probe P3-3 records
the survey. The defining file is the original's own source area, so the
spelling passes the source-origin check whenever the original is available
to the consumer area, and the listing needs no compiler to establish it.
Importing a testing-area original from an ordinary area is blocked before a
spelling is produced. The answer records `spellingStyle: 'relative-js'`
so a later style can be added without ambiguity. Barrel and alias
spellings are an explicit deferral.

## Availability semantics

`listAvailability(model, consumer)` applies the definitive rules to every
foreign original in one pass:

1. Visible set: the originals of every effective exposure whose module is
   a proper ancestor of the consumer's module with destination
   `descendants`, plus those of every effective exposure whose module is a
   direct child with destination `parent`. This equals
   `explainVisibility(model, consumer.module, original).visible` for every
   original, which I3-01 asserts on the reference and the toolkit.
2. Testing origin: an original whose defining area profile includes
   `testing` is blocked in both forms for a consumer area whose profile does
   not, with reason `testing-origin`.
3. Required-importer tags: each such tag on the original must be in the
   consumer profile; a missing one blocks both forms with reason
   `required-importer-tag`.
4. Required-symbol tags: each such tag in the consumer profile must be on
   the original for value availability; a missing one leaves type-only
   availability with reason `required-symbol-tag`. A type-only original
   (`hasValue: false`) is type-only with reason `type-only-original`.
5. Otherwise the original is value-available, which implies type
   availability.

Same-owner originals are excluded from the listing. `explainAvailability`
answers one original for one consumer area with the same classification,
reporting `same-owner` for the consumer's own originals and, for a
not-visible original, the ineffective exposures and the missing hops. Both
functions produce `TagRequirement` records with the same names, kinds and
satisfaction as `explainImport`, and I3-01 `agrees-with-enforcement`
compares every recorded access decision of the reference and the toolkit
with the corresponding availability answer. Until iteration 9 the rule
application is a separate function in `src/availability.ts`; iteration 9
moves the shared tag-rule helper so `explainImport` calls it too, after
Plan 5's changes to `decisions.ts` have merged.

## Detail tiers and availability

The first tier needs no compiler: export name, aliases, form, tags, owner,
defining file, exposure path and spelling. The second tier is
`SymbolDetail`: kind, a one-line signature, body-free declaration text and
documentation, each bounded, with `described`, `truncated` or `failed`.

Details exist for the originals of every effective exposure of the revision
or batch run that carried the `symbol-details` capability. The `details`
stage runs after `access` and before the compiler is disposed, reads the
model's effective exposures, calls `SourceAnalysis.details` once with the
whole set and the limits, and records the result in
`AnalysisSnapshot.details`. A stage failure records an `execution`
diagnostic, marks the capability `executed: false` and leaves `decide`
completed; DA14 holds. The stage adds nothing to a run that does not
request the capability, and I3-08 proves the report byte-identical except
`runId`.

Where details come from:

| Path | Iterations 7 and 8 | From iteration 9 |
| --- | --- | --- |
| `--batch` | The batch run requests `symbol-details`; details present. | Unchanged. |
| Resident, published or synchronized | The context was opened without the capability; every row's details are `{ state: 'unavailable', reason: 'not-extracted' }` and the answer says so once. | The daemon asks the retained session for the listed originals at the answering revision; the warm compiler describes them, or the session answers `superseded` or `cold` and the rows say so. |

A detail is never rendered as empty text when it was not extracted; the
human output prints one line, `Signatures: unavailable (...)`, and JSON
carries the state per row. Truncation is per string with the limit named.
Adapt the body-free rendering, overload merging and documentation
extraction of cucumber-viz's declaration extractor, with its tests; discard
its content-hash cache and barrel inventories.

## Explanations and proposals

`explainAvailability` for a not-visible original computes the missing hops
along the shortest legal path. With owner O, consumer module M and their
lowest common ancestor L:

- If M is a proper ancestor of O: each module from O up to the child of M
  must expose the original to its parent. Existing effective hops are
  kept; missing ones are proposed.
- Otherwise: each module from O up to the child of L must expose the
  original to its parent, and L must expose it to descendants. If L is O
  itself, only the to-descendants exposure is needed.

Each proposed hop is rendered as declaration text: `expose-src <name> from
"<path>" to parent` in the owner, `expose-sub <name> from <child> to parent`
or `to descendants` in an ancestor. The rendering names the child by its
declared name and the original by its defining-file export name. The
answer labels the list `proposal: true` and the human output prints
`Proposed declarations (not existing permissions)`. Tag and testing-origin
blocks are reported as facts with the unsatisfied requirement; no tag edit
is proposed. Ineffective existing exposures are listed as evidence.

## Usage semantics

`inspect --usage` lists observed accesses from `AnalysisSnapshot.accesses`
whose selection resolves to an original owned by the consumer's module,
joined with the recorded `AccessResult` decisions. Grouping is by importing
owner, then importing file, then selection; each row carries the written
form, the checked request, the decision status and reason, and the
location. Exposed originals with no observed access are listed with zero
uses. Accesses from the module's own files are excluded; accesses from its
descendants are included as foreign importers, because descendants are
other modules. Counts are counts of selections, stated as such. No subtree
rollup, edge aggregation or complexity score is produced.

## Freshness and revisions

`InspectParams.freshness` reuses Plan 2's `Freshness`. `published` answers
from the published revision without analysis and names it; `synchronized`
with an empty `expect` follows the check path and answers from the
resulting revision; a named `revision` that is retained answers from it and
otherwise returns `evicted-revision`. An invalid published revision answers
only when `lastValid: true` is requested, from the last valid revision,
naming it. Details are extracted at the answering revision or reported
unavailable; a later revision's compiler state is never used for an
earlier revision's answer.

Before iteration 9 the daemon obtains the report through the context
manager's existing `check` with the requested freshness and answers from
`report.snapshot`; a dropped snapshot is `snapshot-not-retained`. From
iteration 9 the daemon uses the compact history's on-demand report
projection, and the outcome disappears for retained revisions.

## Coexistence with Plan 5

Both plans execute in their own Studio worktrees from `main`. The rules:

- Iterations 1 to 8 of this plan require nothing from Plan 5 and touch no
  file Plan 5 rewrites, except the additive edits listed in the
  [main plan](main-plan.md#coexistence-with-plan-5).
- An additive edit appends a union member, a switch case, a method, an
  interface member, an export line or a declaration line. It never
  reorders, reformats or renames existing text. Comment IDs continue the
  numbering Plan 5's owners document assigns.
- Before iterations 7 and 8 exit, the branch rebases onto `main`; a
  conflict inside an additive edit is resolved by keeping both additions.
- Iteration 9 is the only iteration with a semantic dependency on Plan 5:
  the retained session's `details` operation, the session-driver daemon
  and the compact history projection. It starts after Plan 5's iteration 9
  has merged, and its own changes to `decisions.ts` follow Plan 5's
  indexed lookups.
- If Plan 5 stalls, iterations 10 and 11 may run on the Plan 2 build; the
  I3-12 instances stay pending and the plan is not complete.

## Budgets

Starting values; iteration 1 revises them once from the probes. Binding
rows are asserted by iteration 10; advisory rows are recorded.

| Measurement | Fixture | Target | Status |
| --- | --- | --- | ---: |
| `ramify available` end to end, warm daemon, published revision, `--detail names` | reference | ≤ 250 ms median | binding from iteration 10 |
| Same | S100 | ≤ 600 ms median | binding from iteration 10 |
| Same | S1000 | ≤ 3 s median | advisory |
| `ramify available --batch` with details | reference | ≤ batch check + 40% | advisory |
| Same | S100 | ≤ batch check + 40% | advisory |
| `describeOriginals` per exposed original | reference, toolkit | ≤ 1 ms median | advisory |
| Report bytes with details versus without | reference, toolkit | ≤ +30% | binding from iteration 10 |
| Largest listing | S1000 | recorded; `maxListedSymbols` default 2,000 | advisory |
| Daemon heap after 200 inspect answers | reference | plateau within Plan 2's context budget | binding from iteration 10 |

### Limits

| Limit | Default | Where |
| --- | --- | --- |
| `maxListedSymbols` | 2,000 | `InspectionQuery.limit` upper bound; the CLI's `--limit` default is 200 in human output |
| `DetailLimits.maxOriginals` | 20,000 | per run or per request |
| `DetailLimits.maxSignatureChars` | 400 | per detail |
| `DetailLimits.maxDeclarationChars` | 2,000 | per detail |
| `DetailLimits.maxDocumentationChars` | 1,200 | per detail |
| `DetailLimits.deadlineMs` | 10,000 | per run or per request |

## Document revisions

Iteration 11 revises: the [daemon architecture](../../architecture/daemon.md)
service operation table (the `inspect` operation, the consumer rule and the
detail tiers), the [processes and clients](../../architecture/processes-and-clients.md)
command table (`available`, `inspect` and `explain` implemented), the
[memory lifecycle](../../architecture/memory-lifecycle.md) ML06 status,
the [roadmap](../../roadmap.md) status and handoff rows, and the
development guides' command lists. No model document changes.

## Explicit deferrals

| Deferral | Trigger to revisit |
| --- | --- |
| Alternative spellings through barrels or path aliases | P3-3 or a consuming project shows a non-relative convention. |
| Cursors, pagination, ranking, subtree rollups, edge counts | Plan 6. |
| Source-text search across modules | A workflow that contract search cannot serve. |
| Historical revisions beyond published and last-valid | Plan 6's revision navigation. |
| Persistent detail cache | Iteration 10 measures batch detail cost above the advisory target. |
| Tag-edit proposals | A reviewed workflow for architecture edits; availability never approves a write. |
| MCP tools over these operations | Plan 4. |

# Plan 3: Project inspection

**Date:** 2026-09-11. **Status:** Detailed implementation plan for review,
authored from the roadmap's revised [Plan 3 brief](../../roadmap.md#plan-3-project-inspection),
Plan 1's [completion evidence](../done/iteration-1-project-verifier/iterations/iteration15-results.md),
Plan 2's [completion report](../done/iteration-2-resident-verification/iterations/iteration14-results.md)
and the draft [Plan 5](../iteration-5-fast-incremental-checks/main-plan.md),
which is being implemented at the same time. No inspection command, query
operation or passing Plan 3 evidence is established by this document. The
plan runs as eleven iterations, listed under [Iteration sequence](#iteration-sequence);
each is sized to be implemented within one 250k-token context, and the
plan's completion gate is the last iteration's exit. The [contracts](contracts.md),
[owners](owners.md), [scope](scope.md) and [instance inventory](subcases.md)
beside this plan form its review package.

## Deliverable and completion boundary

Deliver the commands a coding agent needs to orient itself in a Ramify
project from the module it is working on. The agent's working directory is
normally that module's `src/`. Its own internals it reads with ordinary
tools; every other module is a library to it, and the question it asks most
is which foreign symbols it may already import from where it stands, and how
to spell those imports. Answering that question is the primary deliverable.
Reading the current module's own summary, explaining why a named symbol is
or is not available, and listing who imports the current module's exports
are the secondary deliverables.

From a module's `src/` directory inside a Ramify project, the installed CLI
must support, in addition to every Plan 1, 2 and 5 command unchanged:

```sh
ramify available                                   # every foreign symbol importable from here, grouped by provider
ramify available Record --owner workspace/contracts --detail docs
ramify available --search "revision chain" --format json
ramify available --from src/tests --kind type      # the tests area of the current module, type-availability
ramify inspect                                     # where am I: owner, area, purpose, own contract, children
ramify inspect --usage                             # who imports this module's exports, denied accesses included
ramify explain validateRevisionChain              # why a named original is or is not available from here
ramify available --batch                           # the same answer from a fresh in-process analysis, with signatures
```

The first command resolves the working directory to an owner and source
area, connects to the daemon, starting one if necessary, and prints, for the
published revision, every original binding that is available in that area:
grouped by the owning module with its purpose paragraph, each row carrying
the export name, value or type-only availability, tags, the relative import
specifier that resolves to the original's defining file, and, when the
revision carries symbol details, a one-line signature and the first line of
its documentation. The seventh command reports, for every original with
that name, its owner, defining file, tags, the exposure path that reaches
the consumer or the reason none does, the tag and testing-origin rules that
apply, and the resulting availability; when the original is not visible, it
prints the exposure declarations that would make it visible, labeled as a
proposal. The last command loads the engine into the CLI process, runs one
analysis with the `symbol-details` capability, answers the same query from
that report and disposes the engine.

Completion requires every I3 instance in the [acceptance matrix](#acceptance-matrix)
to run and assert its independent expectation; every listing row's import
specifier, written into a file of the consumer area it was listed for, to
pass `ramify check` on the reference project and the toolkit; resident and
batch answers to agree for identical inputs; the query budgets in
[scope.md](scope.md#budgets) met on the reference project and S100 with raw
results archived; Plan 1's 308-instance gate, Plan 2's gate and, once it is
merged, Plan 5's gate still passing on the same build; and
`npm run check:self` accepting the eleven-owner toolkit. A listing that
names a symbol the checker would deny, a spelling that fails the check, an
answer labeled with a revision it was not computed from, or a detail
rendered as empty when it was not extracted does not complete this plan.

MCP tools (Plan 4) and the explorer (Plan 6) consume the query vocabulary,
result documents and fixtures this plan hands off. Observed-usage
aggregates for the graph, counting units, cursors and ranking are Plan 6's
work and are not implemented here.

## Authority and supporting documents

| Document | Role |
| --- | --- |
| [Importability principles](../../model/cross-module-importability.principles.md), [glossary](../../model/glossary.md), [module descriptions](../../model/module-description.spec.md), [TypeScript interpretation](../../model/typescript-source-interpretation.spec.md) | Definitive rules the availability listing applies unchanged; this plan adds no importability rule. Availability is evaluated for a source area, never for a module alone. |
| [Daemon and analysis](../../architecture/daemon.md) | Service operation families, module inspection and explanations, revision and freshness guarantees, DA12–DA14. Revised by iteration 11 as [scope.md](scope.md#document-revisions) lists. |
| [Processes and clients](../../architecture/processes-and-clients.md) | Command roles for `inspect` and `explain`, the terminating-command fallback rule, PC03 and PC07. Gains the `available` command in iteration 11. |
| [Memory lifecycle](../../architecture/memory-lifecycle.md) | ML06: detail expansion and result serialization within budgets; unavailable enrichment distinguishable from empty data. |
| [Quick testing](../../architecture/quick-testing.spec.md) | Direct-adapter flows for the query operation, QT01, QT03 and QT04. |
| [CLI invocation](../../architecture/cli-invocation.spec.md) | Root selection from the working directory, reused unchanged; the consumer-area rule of this plan builds on it. |
| [Tooling roadmap](../../roadmap.md) | The revised brief, the nine authoring rules and the scheduling map. |
| Plan 1 [contracts](../done/iteration-1-project-verifier/contracts.md) and Plan 2 [contracts](../done/iteration-2-resident-verification/contracts.md), [owners](../done/iteration-2-resident-verification/owners.md) and [scope](../done/iteration-2-resident-verification/scope.md) | Implemented names, entries and budgets this plan preserves. |
| Draft [Plan 5](../iteration-5-fast-incremental-checks/main-plan.md), its [contracts](../iteration-5-fast-incremental-checks/contracts.md) and [owners](../iteration-5-fast-incremental-checks/owners.md) | The retained session, compact reply and revised driver this plan joins in iteration 9; the files both plans touch are listed under [Coexistence with Plan 5](#coexistence-with-plan-5). |
| [Project-explorer reuse analysis](../../analysis/project-explorer-reuse.md) | The declaration extractor and surface renderer to adapt for symbol details; supporting evidence, not authority. |
| [Reference cases](../reference-project/cases.md), [contract map](../reference-project/contract-map.md) and [harness](../reference-project/harness.md) | H01–H03 host-integration cases and the independent expectations for the reference fixtures. |

This plan selects implementation scope and evidence; it revises no model
document. Where the architecture lists a decision still requiring review,
the [resolved decisions](#resolved-decisions) below fix it or name the
alternatives and the recommended one as a review point for iteration 1.

## Starting point

The planning inspection on 2026-09-11 established the following from the
branch `docs/roadmap-fast-incremental-checks` at `25cac53`. Recheck at
implementation start.

- Plan 2 is complete and merged; its plan directory is under
  `docs/plans/done/`. Plan 5 has a draft detailed plan awaiting its
  iteration 1 review and is scheduled for implementation in parallel with
  this plan.
- Eleven owners are declared: root, `analysis` with `model`, `descriptions`,
  `project` and `typescript`, `daemon` with `contexts`, `presentation` with
  `layout`, and `cli`. `npm run check:self` reports eleven owners.
- `model` exposes `explainVisibility(model, importer, original)` and
  `explainImport(model, question)` from `src/decisions.ts`. Both answer
  one original or one access at a time. No function enumerates the
  originals visible to a module or available to a source area; the
  required-importer and required-symbol rules are applied inline in
  `explainImport`, and `canonicalOrigin` in `src/model.ts` establishes an
  area from a file path.
- `typescript` runs the pinned TypeScript 7.0.2 helper in a child process
  (`src/compiler-helper.ts`, `src/bridge.ts`, `src/wire.ts`) with the
  operations `ready`, `catalog`, `accesses` and `dispose`. The program and
  checker stay alive between operations. No signature, declaration text or
  JSDoc extraction exists in the owner.
- `analysis` runs the stages `registry`, `acquisition`, `parse`, `catalog`,
  `link`, `access`, `decide` and `report` in `src/run-analysis.ts`; the
  compiler session is disposed after `access` and before `decide`, so the
  effective exposures of the model are known while the compiler is alive.
  `AnalysisSnapshot` carries inventory, areas, inputs, catalog, linked
  descriptions, model, accesses and results, and is dropped from a report
  that exceeds `maxReportBytes`.
- `project` extracts each module's purpose paragraph (`ModulePurpose` with
  `present`, `missing-file` and `no-paragraph` states) and records
  `InventoryArea` roots per owner; `src/selection.ts` implements the root
  climb of the CLI invocation contract.
- Root's `src/interfaces/service.ts` declares `RamifyService` with eight
  operations. `daemon` validates and dispatches them in `src/validation.ts`
  and `src/service.ts`; `src/connection.ts` and `src/connect-daemon.ts`
  mirror them for the client; `src/tests/quick-environment.ts` mirrors them
  in-process. A `check` with `freshness.mode: 'published'` on a warm
  context returns the published revision's whole report without analysis.
- `cli` parses `check`, `watch` and `daemon` in `src/arguments.ts`,
  dispatches in `src/run-cli.ts`, and prints reports through
  `src/command-support.ts` and `src/format.ts`. Root's `src/cli-entry.ts`
  injects the lazily loaded batch operation; `src/interfaces/batch.ts`
  declares `BatchInvocation`, `BatchResult` and `BatchOperation`.
- Cross-module imports in the reference project and the toolkit are
  relative paths to the original's defining file with the `.js` extension,
  for example `'../../contracts/src/interfaces/vocabulary.js'` in
  `subs/workspace/subs/reviews/src/router.ts`. There are no barrels.
- The harness selects `--plan 1` and `--plan 2`; `plan2-instances.ts`
  transcribes Plan 2's inventory and `plan.ts` validates it against the
  main plan's tables.

## Scope decisions

### Included

- The availability enumeration in `model`: every original visible to a
  module through effective exposures, classified for a source area as
  value-available, type-only available or blocked, with the same rules and
  the same reasons `explainImport` produces, plus the explanation of one
  original from one area with the missing exposure hops when it is not
  visible.
- The consumer-area rule: a working directory or file resolves to one owner
  and one source area; the ordinary area by default, the tests area beneath
  `src/tests/`; a location inside a module but outside its `src/` resolves
  to the ordinary area with an explicit note.
- The inspection queries in `analysis` over an `AnalysisSnapshot`: the
  availability listing with filters, search and detail levels; the module
  summary; the explanation of a named symbol; incoming usage of the
  module's own exports; every answer plain data.
- Symbol details in `typescript`: body-free signature, declaration text,
  kind and documentation for a named set of originals, bounded and explicit
  about truncation and failure, through a new helper operation on the live
  compiler.
- The `symbol-details` capability in `analysis`: a `details` stage that
  describes the originals of every effective exposure while the compiler is
  alive, recorded in the snapshot; its failure leaves the check completed.
- The `ramify available`, `ramify inspect` and `ramify explain` commands
  with human and JSON output, the `ramify.inspect/1` document, exits, the
  `--batch` path through a root-injected operation and the resident path
  through a new `inspect` service operation answered from a revision's
  report.
- The join with Plan 5: symbol details on demand from the retained
  session's warm compiler at the requested revision, and the `inspect`
  operation over the compact history's on-demand report projection.
- Evidence: the model, consumer, listing, explanation, usage, details,
  capability, CLI, round-trip, service, join, process and measurement
  instances of the matrix; Plan 1's, Plan 2's and Plan 5's gates.

### Scheduled later or excluded

- Observed-usage aggregates for the graph, counting units for edges and
  files, drill-down identifiers, cursors and pagination, ranking and
  complexity metrics: Plan 6, on the query vocabulary handed off here.
- Search across other modules' source text. The agent's own internals are
  searched with ordinary tools; other modules are searched through their
  contracts. The cucumber-viz source-search executor is not lifted.
- Import suggestions through barrels or forwarding files. The canonical
  spelling targets the defining file; alternative spellings are a later
  extension once a project needs them.
- Proposals beyond exposure hops. Adding a tag to an importer's header or
  removing a tag from an original is reported as the blocking fact, never
  proposed.
- Historical revisions other than the published or last-valid one, and
  MCP tools: Plan 4 maps these operations to tools.
- Persistent detail caches. Details are recomputed per revision by the
  session or per batch run; a cache is a later optimization gated by
  iteration 10's measurements.
- Windows, registry serialization, strict outside-source configuration:
  unchanged deferrals.

### Source scope and project selection

Unchanged from Plans 1 and 2: whole-project scope, discovered
configuration, default registry, the CLI invocation contract for root
selection. The consumer location is resolved after the root, inside the
selected project only; a `--from` path outside the root is an invalid
invocation.

### Supported platforms

Linux and macOS, as Plan 2 fixed. This plan adds no platform-specific
behavior; the process suite must pass on macOS before acceptance.

## Implementation ownership

No owner is added; the eleven-owner tree stands. [owners.md](owners.md)
carries the final declaration texts.

| Owner | This plan's responsibility |
| --- | --- |
| `model` | `listAvailability` and `explainAvailability` in a new `src/availability.ts`; the missing-hop computation; no rule change and no change to `decisions.ts` until the post-join refactor of iteration 9. |
| `typescript` | `describeOriginals` in a new `src/details.ts`, the `details` helper operation, `SourceAnalysis.details`, the `SymbolDetail` vocabulary and its limits. |
| `analysis` | The inspection vocabulary and `answerInspection` in new files; the consumer-area rule; the `symbol-details` capability and `details` stage; `AnalysisSnapshot.details`. |
| root | `InspectParams`, `InspectOutcome` and `RamifyService.inspect`; the batch `runInspection` and its injection; the relay of the inspection vocabulary; document revisions. |
| `daemon` | Validation of `inspect`, its service binding over the context's published or synchronized report, the client mirror; no transport change. |
| `cli` | `available`, `inspect` and `explain`; argument parsing; the `ramify.inspect/1` document; human rendering; exits; the terminating-command fallback rule. |
| `contexts`, `project`, `descriptions`, `presentation`, `layout` | Unchanged. The consumer-area rule reads `InventoryArea` roots; it adds nothing to `project`. |

### Exposure rules for this plan

- `model` exposes the two availability operations and their vocabulary to
  its parent through its existing M1 wildcard and a new value line;
  `analysis` relays them unchanged through A5, so root and the harness
  receive them.
- `typescript` exposes `SourceAnalysis.details` and the detail vocabulary
  through T1 and T2; compiler objects never cross the boundary.
- `analysis` exposes `answerInspection`, `resolveConsumer` and the
  inspection vocabulary to root; root relays the vocabulary to descendants
  and injects the query function into the daemon service, as it injects
  the driver today. `daemon` and `cli` import no analysis value.
- The batch inspection operation lives in root's `src/batch.ts` beside
  `runBatch` and is injected into the CLI environment; `cli` still contains
  no analysis algorithm.

### Coexistence with Plan 5

Plan 5 is implemented in parallel. Iterations 1 to 7 of this plan touch no
file Plan 5 rewrites, except the additive edits below, and require nothing
Plan 5 delivers; iteration 9 requires Plan 5's iteration 9 to be merged.
Whichever plan merges second rebases and resolves the additive conflicts;
neither plan reorders, reformats or renumbers the other's lines.

| Shared file | Plan 5 change | This plan's change | Rule |
| --- | --- | --- | --- |
| `subs/analysis/subs/typescript/src/interfaces/source.ts` | Adds description, interpreter and retained-adapter types | Adds `SymbolDetail`, `SymbolDetails`, `DetailLimits`, `SourceAnalysis.details` | Append; distinct names. |
| `subs/analysis/subs/typescript/src/wire.ts`, `src/compiler-helper.ts`, `src/bridge.ts`, `src/source-analysis.ts` | Unchanged (batch path stays) | Adds the `details` operation | Append one operation. |
| `subs/analysis/src/interfaces/analysis.ts` | Removes six increment types in iteration 9; adds session names | Adds `'symbol-details'` to `Capability`, `'details'` to `StageId`, `AnalysisSnapshot.details` | Append; the removal is elsewhere in the file. |
| `subs/analysis/src/run-analysis.ts` | Removes the retained input in iteration 9 | Adds the `details` stage between `access` and the compiler disposal | One inserted block. |
| `subs/analysis/src/index.ts`, `module.ramify` files, root `module.ramify` | Adds and removes lines | Adds lines | Append; comment IDs continue Plan 5's numbering. |
| `src/interfaces/service.ts`, `subs/daemon/src/validation.ts`, `src/service.ts`, `src/connection.ts`, `src/connect-daemon.ts`, `src/tests/quick-environment.ts` | Extends `check` parameters in Plan 5's iteration 10 | Adds the `inspect` operation | Append a union member, a case and a method each. |
| `subs/cli/src/arguments.ts`, `src/run-cli.ts`, `src/interfaces/cli.ts`, `src/errors.ts`, `src/cli-entry.ts` | Adds `--changed`, `--since`, `--deadline`, `CheckDocument` | Adds three commands, `InspectDocument`, `CliEnvironment.inspect` | Append; new files carry the command bodies. |
| `scripts/reference-harness/verify.ts`, `plan.ts`, `instances.ts` | Adds `--plan 5` | Adds `--plan 3` | Append; separate instance files. |
| `subs/analysis/src/interfaces/session.ts`, `src/retained-session.ts`, `src/session-worker.ts` | Creates them in its iterations 6 to 8 | Iteration 9 adds one `details` operation to `RetainedSession` and its worker message | Not a file both plans edit concurrently: this plan extends a contract Plan 5 has already merged. It is the one change here that obliges Plan 5's package, and RP-7 records it. |

`decisions.ts` and `model.ts` in `model` are edited by Plan 5's iteration 2
and not by this plan before iteration 9. The retained session, observer,
contexts driver and compact reply are Plan 5's alone; this plan consumes
them in iteration 9 through their reviewed contracts.

## The inspection path and contract review

### Required data flow

```text
ramify available / inspect / explain
  -> cli: parse; resolve root (unchanged contract); resolve the consumer location
  -> resident: openContext (existing setup) -> inspect { token, freshness, query }
       -> daemon: validate; obtain the revision's report (published: no analysis;
          synchronized: the existing check path); call the injected answerInspection
       -> reply: revision, consumer, result
  -> batch: runInspection -> analyzeProject with symbol-details -> answerInspection
  -> cli: render human text or the ramify.inspect/1 document; exit

answerInspection(snapshot, query)
  -> resolveConsumer(inventory, areas, location) -> owner, area, base directory
  -> listAvailability(model, consumer area)            [model]
  -> names from the catalog's defining-file exports; aliases from exposures
  -> spelling: relative path from the base directory to the defining file, .js
  -> details from snapshot.details when present, else 'unavailable' with reason
  -> group by provider with purpose; filter; search; limit; order
```

An answer names the revision it was computed from, or `batch` with the
input identity. Batch and resident answers over identical inputs are equal
after normalizing run identifiers, timing and host metadata.

### Proposed contract shapes

[contracts.md](contracts.md) holds the exact definitions. These
requirements constrain them.

| Contract | Owner | Required information or behavior |
| --- | --- | --- |
| `listAvailability`, `explainAvailability`, `OriginalAvailability`, `ConsumerArea`, `MissingHop` | model | For a consumer area: every foreign original visible to its module with value and type-only availability, the effective path, the tag requirements with satisfaction, testing-origin blocking, and the blocking reason; for one original: the same plus the missing exposure hops when not visible. Same-owner originals are excluded from the listing and reported as `same-owner` by the explanation. Results are ordered by owner, defining file and binding. |
| `describeOriginals`, `SymbolDetail`, `SymbolDetails`, `DetailLimits`, `SourceAnalysis.details` | typescript | For named originals: kind, one-line signature, body-free declaration text, documentation, each bounded, with `described`, `truncated` or `failed` per original and a coverage note per failure; deterministic for identical inputs; never a compiler object. |
| `InspectionQuery`, `ConsumerLocation`, `Consumer`, `AvailableSymbol`, `AvailabilityListing`, `ModuleSummary`, `UsageListing`, `SymbolExplanation`, `InspectionResult`, `resolveConsumer`, `answerInspection` | analysis | Plain-data queries and answers; the consumer rule; spellings from the base directory; grouping with purpose states; filters, search and limits with truncation reported; details or an explicit unavailable state; usage over owned originals with denied accesses retained. |
| `Capability` (`symbol-details`), `StageId` (`details`), `AnalysisSnapshot.details`, `AnalysisLimits.details` | analysis | The capability is requested explicitly; the stage describes the originals of every effective exposure; failure marks the capability `executed: false` with a diagnostic and leaves `decide` completed. |
| `InspectParams`, `InspectOutcome`, `RamifyService.inspect`, `InspectInvocation`, `InspectResult`, `InspectOperation` | root | The operation names a context, freshness and a query; the outcome carries the revision or the batch input identity, the consumer and the result, or an explicit unavailable reason. |
| `InspectDocument` (`ramify.inspect/1`), `parseArguments` (extended) | cli | The document, the three commands with their arguments, the exits. |

## Resolved decisions

Each of the brief's decisions ends in one proposal. Details and numbers
live in the named sections of the review package.

1. **The consumer is a place.** Every query names a consumer location: the
   working directory by default or `--from <path>`. The location resolves to
   one owner and one area by the rule in [scope.md](scope.md#consumer-area-rule);
   the answer states both. A module name alone is never a consumer.
2. **Spellings are mandatory and canonical.** Every listed symbol carries
   the relative specifier from the consumer's base directory to the
   original's defining file, with the source extension replaced by `.js`.
   That path passes the source-origin check whenever the original is
   available, because the defining file is the original's own area. Other
   spellings are not suggested. See [scope.md](scope.md#spelling-rule).
3. **Names are TypeScript export names.** A row's name is the export name
   under which the defining file exports the original; Ramify aliases from
   `expose-sub ... as ...` are listed as aliases, not as importable names.
4. **Details are a second tier and part of this plan.** Names, forms, tags
   and spellings need no compiler. Signatures, declarations and
   documentation come from `typescript` and are present when the answering
   revision or batch run carried the `symbol-details` capability, and
   otherwise reported as unavailable with the reason. In iterations 7 and
   8 the batch path carries details and the resident path does not;
   iteration 9 adds resident details from the retained session. See
   [scope.md](scope.md#detail-tiers-and-availability).
5. **Queries run over the revision's report inside the daemon.** The
   `inspect` operation obtains the report through the existing check path
   with the requested freshness and applies the injected query function;
   contexts and the driver are untouched by this plan. A report whose
   snapshot was dropped for size answers `unavailable` with reason
   `snapshot-not-retained`; the join with Plan 5's compact history removes
   that limit through the on-demand projection.
6. **Explanations propose hops, never permissions.** A not-visible original
   is explained with the exposure declarations that would make it visible
   along the shortest legal path, each rendered as declaration text and
   labeled a proposal. Tag and testing-origin blocks are reported as facts.
7. **Usage is owned, not subtree.** `inspect --usage` lists the observed
   accesses whose selected original is owned by the consumer's module,
   grouped by importing owner and file, denied accesses included, unused
   exposed originals listed. Subtree rollups belong to Plan 6.
8. **Three commands, one document.** `ramify available`, `ramify inspect`
   and `ramify explain` share the `ramify.inspect/1` document and exits
   0 answered, 2 not answered, 130 interrupted. `available` is a top-level
   command because it is the command agents reach for first; iteration 11
   records it in the architecture's command table. RP-2 records the
   alternative.
9. **Parallel with Plan 5.** Iterations 1 to 8 stand on Plan 2's merged
   daemon and touch only new files and the additive edits listed above;
   iteration 9 is the join and requires Plan 5's iteration 9. It adds one
   `details` operation to Plan 5's `RetainedSession`, the only change here
   that extends a contract another plan owns; RP-7 records it for Plan 5's
   acceptance. The plan's
   gate runs on a build that includes Plan 5 when Plan 5 has merged, and
   otherwise records the join iteration as pending.

## Required behavior and diagnostics

### Commands

| Command | Required behavior |
| --- | --- |
| `ramify available [<pattern>] [--from <path>] [--owner <module>] [--kind value\|type] [--tag <tag>] [--search <text>] [--detail names\|signatures\|docs] [--limit <n>] [--fresh] [--batch] [--root <dir>] [--format json]` | Resolve the root and the consumer; obtain the published revision (`--fresh`: a synchronized revision; `--batch`: a fresh analysis with `symbol-details`); print the listing grouped by provider; exit 0 when answered, including an empty listing. `<pattern>` is a case-insensitive substring or `*` glob on the export name; `--search` matches names, aliases, signatures, documentation and provider purposes; `--detail` defaults to `signatures`; `--limit` defaults to 200 rows in human output and to no limit in JSON, with truncation stated. |
| `ramify inspect [--from <path>] [--usage] [--symbol <name>] [--fresh] [--batch] [--root <dir>] [--format json]` | Print the consumer module's summary: identifier, directory, header tags, area and profile, purpose or its missing state, parent, children, and its own exposures with destinations and expanded names. With `--usage`, add the incoming usage of its owned originals, optionally one symbol. |
| `ramify explain <name> [--from <path>] [--kind value\|type] [--fresh] [--batch] [--root <dir>] [--format json]` | For every original whose binding or export name equals `<name>`, or exactly the one named `owner:name`, print owner, defining file, tags, form, visibility with its path or the missing hops, the tag requirements, testing-origin status, the resulting availability for the requested kind and the spelling when available. Unknown names answer with zero matches and exit 0. |
| `ramify check`, `ramify watch`, `ramify daemon` | Unchanged. |

### Exits

| Exit | `available`, `inspect`, `explain` |
| --- | --- |
| 0 | Answered from a published, synchronized or batch revision, including an empty listing, zero matches or an unavailable detail tier. |
| 2 | Not answered: invalid invocation, working directory outside a project, `--from` outside the root, unresolved project, engine outcome not completed, snapshot not retained, evicted revision, or an unavailable, stopped or incompatible daemon after the fallback rule below. |
| 130 | Interrupted. |

An invalid current model (`outcome.execution: 'invalid'`) answers from
the last valid revision only when the caller passes `--last-valid`, and
otherwise exits 2 naming the invalid revision; the answer states which
revision it used.

### Error table

| Condition | Outcome |
| --- | --- |
| Working directory outside every Ramify project | Invalid invocation naming the directory; exit 2, as `check`. |
| `--from` resolves outside the selected root | Invalid invocation; exit 2. |
| `--from` inside the root but outside every module's directory | Consumer is the root module's ordinary area with `outsideSource: true` in the answer. |
| The revision's report carries no snapshot | `unavailable` with reason `snapshot-not-retained`; exit 2; the message names `--batch`. |
| `--detail signatures` or `docs` on a revision without details | Answered; every row's `details` is `{ state: 'unavailable', reason }`; one summary line names the reason; exit 0. |
| `--fresh` and the context cannot synchronize | The existing `pending`, `superseded` and unavailable outcomes of `check`, mapped to exit 2 with the same reasons. |
| Daemon unavailable after exhausted recovery | Visible batch fallback, as for `check`, because these are terminating commands; `stopped` never falls back. |
| Unknown `--owner` | Answered with an empty listing and a note naming the unknown owner; exit 0. |
| `explain` name matching several originals | All matches listed, each explained; exit 0. |

### Freshness and revision guarantees

Plan 2's [guarantees](../done/iteration-2-resident-verification/scope.md#freshness-and-supersession-guarantees)
stand. An answer names its revision; `published` answers never trigger
analysis; `--fresh` follows the synchronized path with an empty `expect`;
a `revision` named in `InspectParams.freshness` that is evicted answers
`evicted-revision`. Details are extracted from the same revision's compiler
state or reported unavailable; a later revision's details are never
labeled with an earlier revision.

## Acceptance matrix

Every row is required. Subcase names are stable executable instance
suffixes, for example `I3-04:spelling-relative-js`; the
[inventory](subcases.md) lists every instance with its iteration, fixture,
evidence kind and expectation. A row is complete only when all its subcases
ran and asserted their own result. `api` evidence calls the owners'
operations directly; `quick` evidence uses root's quick environment;
`process`, `ipc` and `measurement` evidence use the real socket, the
compiled entries and the recorded recipe and are never replaced by a quick
run.

| ID | Families | Required subcases and independently expected outcome |
| --- | --- | --- |
| I3-01 | DA12, H02 | `visible-set-equals-explain`: on R and T the listing's visible set equals `explainVisibility` over every original; `agrees-with-enforcement`: for every decided access with a selection in R and T, the area's availability for that original and request equals the recorded decision's status and reason; `testing-consumer-differs`: a testing-area original is blocked for the ordinary area and available for the tests area of the same consumer; `browser-type-only`: a browser-profile consumer sees a foreign value without the browser promise as type-only; `required-importer-blocks-both`: a `ui`-tagged original is blocked in both forms for a core consumer; `same-owner-excluded`; `children-contracts-included`: a child's to-parent exposure is listed for its parent; `ineffective-exposure-explained`: an original exposed only to a sibling branch is not visible and the explanation names the ineffective exposures and the missing hops; `unknown-consumer-rejected`: an unestablished area throws. |
| I3-02 | harness discipline | `required-membership`, `removed-record-fails`, `failing-assertion-fails`, `iteration-filter`: the `--plan 3` gate behaves as Plan 2's I2-28 analogue. |
| I3-03 | H01, H03 | `cwd-in-src`, `cwd-in-tests`, `cwd-module-dir-outside-src`, `file-path-consumer`, `nested-module-not-parent`, `root-src-consumer`, `outside-root-invalid`: the consumer rule resolves each location to the expected owner, area, base directory and `outsideSource` flag. |
| I3-04 | DA12, H02, H03 | `grouped-by-provider-with-purpose`: R's `workspace/reviews` listing groups by owner with each purpose paragraph and the `missing-file` state for a README removed in the copy; `spelling-relative-js`: every row's specifier is the relative path from the base directory to the defining file with `.js`; `spelling-from-file-vs-directory`: a file location and its directory produce the same specifiers; `type-only-marked`; `alias-exposed-name`: `inspect as inspectRecord` lists name `inspect` with alias `inspectRecord`; `name-filter`, `owner-filter`, `kind-filter`, `tag-filter`; `limit-truncation-reported`; `missing-purpose-explicit`; `details-unavailable-explicit`: without details every row states `unavailable` and the reason; `ordering-stable`. |
| I3-05 | DA12, H02 | `available-with-spelling`; `not-visible-with-proposal`: the proposal names the exact hops as declaration text and is labeled a proposal; `blocked-by-importer-tag`; `type-only-by-symbol-tag`; `testing-origin-blocked`; `same-owner`; `ambiguous-name-lists-all`; `unknown-name-empty`; `owner-qualified-name`; `wildcard-growth-reflected`: an export added to `vocabulary.ts` is explained as available without a declaration edit. |
| I3-06 | H04 | `incoming-by-importer-owner`: R's `workspace/contracts` usage lists importers by owner and file with counts equal to the contract map; `denied-access-retained`: an injected denied import appears with its decision; `unused-export-listed`: an exposed original nobody imports appears with zero uses; `owned-only-not-subtree`; `type-vs-value-form`; `symbol-filter`. |
| I3-07 | ML06 | `function-signature-body-free`, `overloads-merged`, `class-summary`, `interface-and-type`, `jsdoc-first-line-and-full`, `resource-original`, `truncation-bounded`, `unknown-original-failed-explicit`, `deterministic`, `deadline-explicit`: `describeOriginals` on R and T produces the expected details within the limits. |
| I3-08 | DA14, ML06 | `requested-only`: a run without the capability has `details: null` and a byte-identical report except `runId`; `exposed-originals-only`; `snapshot-carries-details`; `failure-leaves-check-completed`: a failing details stage marks the capability not executed and `decide` completed; `report-bytes-bounded`: R and T reports with details stay within the growth budget; `search-details`: `--search` matches a documentation phrase. |
| I3-09 | PC03, QT01 | `available-human`, `available-json-document`, `inspect-module-summary`, `inspect-usage`, `explain-human-json`, `outside-project-exit-2`, `invalid-arguments`, `help-lists-commands`, `batch-details-present`: the batch commands through the injected operation over R produce the expected documents and exits. |
| I3-10 | DA12 | `spellings-pass-check-reference`: every listed specifier for three consumer areas of R written into a new file there passes `ramify check --batch`; `spellings-pass-check-toolkit`: the same for two areas of T; `tests-area-spellings`; `type-only-value-import-denied-control`: importing a listed type-only symbol as a value produces the expected `required-symbol-tag` denial. |
| I3-11 | DA12, DA15, PC03, QT03, QT04 | `inspect-operation-validated`; `published-answer-no-analysis`; `synchronized-answer`; `revision-qualified`; `evicted-revision-explicit`; `unknown-context`; `quick-equals-batch`; `ipc-serialization`; `resident-cli-fallback-rules`; `resident-details-unavailable-before-join`; `snapshot-not-retained-explicit`. |
| I3-12 | DA12, DA14, DA15 | `resident-details-warm`: after Plan 5 merges, `--detail signatures` is answered from the retained session; `resident-details-superseded-unavailable`; `session-driver-inspect`; `compact-history-projection`; `hook-latency-unaffected`; `decisions-shared-helper`: `explainImport` and `explainAvailability` share one tag-rule helper and the I3-01 equivalence still holds. |
| I3-13 | DA17, ML06, PC03, QT05 | `process-available-reference`, `process-explain-toolkit`, `process-inspect-usage`: through the compiled daemon and the installed executable; `latency-published-reference`, `latency-published-s100`, `latency-batch-details`, `listing-size-s1000`, `memory-details-bounded`: measured against the budgets with raw results archived. |
| I3-14 | DA18, PC01, QT05 | `self-check-eleven`; `declarations-final`; `package-entries-unchanged`; `plan1-regression`; `plan2-regression`; `plan5-regression`; `documents-revised`; `handoff-recorded`. |

The matrix exercises only the stated portions of each family. DA12 is
established here for CLI and service queries; PC07's MCP portion, ML05 and
QT08 remain later plans' evidence.

## Harness implementation and evidence

Extend the existing harness; do not add a second checker or a second
daemon.

1. Add `plan3-instances.ts` transcribing every leaf of [subcases.md](subcases.md);
   `plan.ts` validates the transcription against this plan's matrix and
   iteration table; `--plan 3` selects it. Register capabilities
   `availability-model`, `consumer-rule`, `inspection-queries`,
   `symbol-details`, `details-capability`, `inspect-batch`,
   `inspect-service`, `inspect-join`, `inspect-measure`, `harness-gate`
   and `completion`; availability is distinct from execution.
2. `api` instances call `listAvailability`, `explainAvailability`,
   `resolveConsumer`, `answerInspection`, `describeOriginals` and
   `analyzeProject` over harness copies; `quick` instances use root's
   `createQuickEnvironment` with its real driver; `process` instances spawn
   the compiled daemon and the installed executable with a unique
   `RAMIFY_ENDPOINT_DIR` and stop their daemon in `finally`.
3. Round-trip instances write one file per consumer area containing every
   listed specifier as a type or value import matching the listed form,
   run `analyzeProject` over the copy, and require no finding; the control
   instance imports one type-only symbol as a value and requires the
   `required-symbol-tag` denial at that location.
4. Measurement instances run through `npm run measure:inspect`, added
   beside `measure:resident`, and assert the recorded values against the
   [budget tables](scope.md#budgets); raw results are archived under
   `scripts/measurements/results/` with fixture and build identities.
5. `--iteration <n>` requires the named iteration's instances and its
   transitive prerequisites; the unfiltered command requires everything and
   is expected to fail until iteration 11.
6. Every harness or scripted run of a resident command sets
   `RAMIFY_ENDPOINT_DIR` to a directory it owns and stops the daemon it
   started in `finally`.

| Command from the Ramify root | Meaning |
| --- | --- |
| `npm run reference:verify -- --plan 3` | Require every I3 instance; fail on missing capabilities, removed records, unrun or failed assertions. |
| `npm run reference:verify -- --plan 3 --iteration <n>` | Require the named iteration and its prerequisites. |
| `npm run reference:verify -- --plan 1`, `--plan 2`, `--plan 5` | Required to pass on the Plan 3 build by I3-14; `--plan 5` once Plan 5 has merged. |
| `npm run measure:inspect` | Run the query measurement recipe and archive raw results. |
| `npm run check:self`, `npm run check:reference` | Unchanged; must report eleven and fifteen owners. |

## Iteration sequence

The plan runs as eleven iterations, each written to be implemented within a
single 250k-token context: one owner or one capability, a bounded slice of
the matrix, its own verification commands and exit criteria. The iteration
files under [`iterations/`](iterations/manifest.json) follow the existing
headings. Iterations 3 and 4 may run in parallel after 2. Iterations 1 to 8
require nothing from Plan 5; iteration 9 requires Plan 5's iteration 9
merged. The completion gate is iteration 11's exit.

| # | Iteration | Owners | Requires | Executes | Instances |
| --- | --- | --- | --- | --- | ---: |
| 1 | Contract package, probes and review points | none | none | review only: accept contracts.md, owners.md, scope.md, subcases.md; run the four [probes](#probes); settle RP-2 to RP-6 | 0 |
| 2 | Availability in the model and the `--plan 3` harness | model; harness | 1 | I3-01, I3-02 | 13 |
| 3 | Consumer rule and the availability listing | analysis | 2 | I3-03, I3-04 | 20 |
| 4 | Symbol details in the compiler helper | typescript | 2 | I3-07 | 10 |
| 5 | Explanations and incoming usage | analysis | 3 | I3-05, I3-06 | 16 |
| 6 | The `symbol-details` capability and stage | analysis | 4, 5 | I3-08 | 6 |
| 7 | Batch inspection and the three commands | root batch, cli | 6 | I3-09, I3-10 | 13 |
| 8 | The `inspect` service operation and the resident path | root service, daemon, cli | 7 | I3-11 | 11 |
| 9 | Join with Plan 5: resident details and the compact history | analysis, model, daemon, root | 8; Plan 5 iteration 9 | I3-12 | 6 |
| 10 | Process evidence and query measurements | integration; measurement tooling | 9 | I3-13 | 8 |
| 11 | Declarations, document revisions, self-check and completion | all owners; docs | 10 | I3-14 | 8 |

Iteration 1 is a review gate: iteration 2 onward implements the reviewed
contracts, and a change to them revises iteration 1's package first.
Iteration 2's harness registration lists every instance as not executed.
Iteration 3 delivers the whole inspection vocabulary and the availability
listing, so iteration 5 adds no type and no declaration line while it
implements the explanation and module branches over that vocabulary.
Iteration 4 depends only on iteration 2 because the helper operation needs
no query code; iteration 6 needs the queries of iteration 5 to consume
details and the operation of iteration 4 to produce them. If Plan 5 has
not reached its iteration 9 when iteration 8 exits, iteration 9 waits;
iterations 10 and 11 may run on the Plan 2 build with the join instances
recorded pending, and the plan is not complete until iteration 9 has run.

### Probes

Iteration 1 runs four probes under `scripts/probes/inspection/`, each with
a JSON result under `scripts/probes/results/`, and revises
[scope.md](scope.md#budgets) once from them.

| Probe | Question | Feeds |
| --- | --- | --- |
| P3-1 `details-cost.mjs` | The cost and output size of body-free signatures, declaration text and JSDoc for the originals of every effective exposure on R, T, S100 and S1000, through a throwaway helper operation on the live checker. | The detail limits, the report growth budget and the batch detail budget. |
| P3-2 `snapshot-retention.mjs` | Whether the report snapshot survives `maxReportBytes` on R, T, S100, S500 and S1000, and the serialized snapshot size with and without details. | RP-4 and the `snapshot-not-retained` outcome's expected frequency. |
| P3-3 `specifier-style.mjs` | The specifier styles of every application-targeting access in R and T: `.js`, `.ts`, bare, and path aliases. | Confirms decision 2; records whether any project needs an alternative spelling. |
| P3-4 `listing-sizes.mjs` | For every ordinary and tests area of R, T and S1000: the number of visible originals, the largest listing, and the time to enumerate through `explainVisibility` per original versus one exposure pass. | The enumeration algorithm, `maxListedSymbols` and the latency budgets. |

## Validation and completion conditions

Run the following in the Ramify package; script additions above are
implementation tasks, not commands claimed to exist today.

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run build
npm run type-check
npm test
npm run reference:cases
npm run check:reference
npm run check:self
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
npm run reference:verify -- --plan 5
npm run reference:verify -- --plan 3
npm run measure:inspect
npm run reference:report
npm run diagrams
npm run site:build
node dist/src/cli-entry.js daemon stop
git diff --check
```

The plan is complete only when all of these hold:

- [ ] From a module's `src/` in the reference project, `ramify available`
  lists every foreign original available there with a specifier, form,
  tags and provider purpose; `ramify explain` and `ramify inspect --usage`
  answer as the tables fix; `check`, `watch` and `daemon` behave as Plans 2
  and 5 fixed.
- [ ] Every required I3 subcase ran and asserted its independent
  expectation; api, quick, ipc, process and measurement evidence are
  recorded separately.
- [ ] Every listed specifier written into its consumer area passes the
  check on the reference project and the toolkit, and the type-only control
  is denied.
- [ ] Resident and batch answers agree for identical inputs; every answer
  names its revision; details come from that revision or are unavailable.
- [ ] The query latency budgets on the reference and S100 are met with raw
  results archived; listing sizes and report growth are recorded against
  their targets.
- [ ] Symbol details are answered from the retained session after Plan 5
  merges, and the shared tag-rule helper is in place.
- [ ] `npm run check:self` accepts eleven owners; the declarations and the
  eight package entries validate; the architecture documents are revised.
- [ ] The completion report records the query vocabulary, the document,
  the consumer rule, the spelling rule, the detail contract and the
  fixtures Plans 4 and 6 need.

## Risks and decisions to settle early

| Risk | Required response inside this plan |
| --- | --- |
| The listing names a symbol the checker would deny | I3-01 `agrees-with-enforcement` compares every recorded decision with the availability answer; I3-10 writes every listed spelling and checks it. |
| The spelling convention differs in some project | P3-3 surveys the reference and the toolkit; the spelling rule is recorded with its assumption and the answer states the base directory; alternative spellings are an explicit deferral. |
| Details bloat reports or slow checks | Details are requested explicitly, cover exposed originals only, are bounded per string and per run, and I3-08 `requested-only` proves the unchanged report; P3-1 measures. |
| The report snapshot is dropped on large projects | P3-2 measures where; the outcome is explicit; the join with Plan 5's projection removes the dependence on retained whole reports. |
| Additive edits collide with Plan 5 | The shared-file table fixes the rule; iterations 7 and 8 rebase before exit; the join iteration owns the only semantic merge. |
| `explainVisibility` per original is too slow at S1000 | P3-4 measures; `listAvailability` uses one pass over exposures and ancestors, and I3-01 proves equality with the per-original function. |
| The proposal is mistaken for a permission | The document labels proposals; the human output prints `Proposed declarations (not existing permissions)`; I3-05 asserts the label. |
| An iteration exceeds one context | The four query kinds are split across iterations 3 and 5, the largest slice being 20 instances; no iteration carries compiler, transport and query work together, and details rendering waits for iteration 6's consumption of `snapshot.details`. |

Review points for iteration 1, each with the recommended choice:

| ID | Question | Alternatives | Recommendation or decision |
| --- | --- | --- | --- |
| RP-1 | Parallel schedule | (a) iterations 1–8 independent of Plan 5, join at 9; (b) wait for Plan 5 | Decided in this draft: (a). |
| RP-2 | Command naming | (a) `ramify available` top-level with `inspect` and `explain`; (b) `ramify inspect available` | (a); the agent's first command should be shortest. Needs the user's acceptance. |
| RP-3 | Name shown per row | (a) the defining file's export name with Ramify aliases listed; (b) the exposure's name | (a); it is the name the spelling imports. |
| RP-4 | Resident answers before the join | (a) over the whole report through the check path, details unavailable; (b) start a compiler per request for details | (a); (b) is throwaway work and seconds of latency. |
| RP-5 | Default detail level | (a) `signatures`; (b) `names` | (a); rows without details print one summary line, not per-row noise. |
| RP-6 | Budgets | (a) published-answer latency on the reference and S100 binding from iteration 10; the rest advisory; (b) all advisory | (a). Needs the user's acceptance. |
| RP-7 | Resident details at the answering revision | (a) add a `details` operation to Plan 5's `RetainedSession`, answered from its warm compiler and returning `superseded` or `cold`; (b) leave resident details permanently unavailable and answer `--detail` only under `--batch` | (a); it is the only way a warm answer carries signatures at the revision it names. It extends a contract Plan 5 owns, so Plan 5's package accepts the addition before iteration 9 starts. |

Do not add cursors, ranking, source-text search, barrel suggestions or a
second permission evaluator to resolve schedule pressure. If a required
case cannot be implemented within the agreed scope, report the specific
unfinished capability; changing the plan gate requires an explicit plan
revision.

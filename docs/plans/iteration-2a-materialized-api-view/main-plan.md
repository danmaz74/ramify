# Plan 2A: Materialized API discovery

**Date:** 2026-09-15. **Status:** implemented; completion gate item 5 (Linux
and macOS byte-identical evidence) is pending a macOS run, recorded honestly
as failed rather than waived or passed — see the
[iteration 10 completion report](iterations/iteration10-results.md) for the
exact command and archive path a macOS host must produce. This is a new
predecessor to [Plan 3](../iteration-3-project-inspection/main-plan.md), not a
replacement or revision of that plan. `ramify materialize` and the generated
`.ramify` view are implemented as specified below.

The plan implements the
[materialized API discovery specification](../../architecture/materialized-api-view.spec.md):
each Ramify module receives compact, generated Markdown describing the foreign
APIs available to its ordinary source, and an independently complete catalog
for `src/tests/` when that area exists. Agents search the hidden, gitignored
catalogs with an explicit `rg` path.

The [contracts](contracts.md), [scope](scope.md), [owners](owners.md) and
[executable instance inventory](subcases.md) beside this file form the review
package. Ten implementation iterations are registered in
[the manifest](iterations/manifest.json); the last iteration is the completion
gate.

## Runnable outcome

From anywhere in a project, an agent can refresh one module or the whole
project:

```sh
ramify materialize
ramify materialize --from subs/workspace/subs/reviews/src/tests
ramify materialize --all --root /work/project
```

The command synchronizes one resident context, computes all requested views
from one valid revision, obtains bounded body-free signatures and the first
useful documentation paragraph, then safely replaces the generated directories.
It returns only after complete publication. A failed, cancelled or
resource-limited invocation preserves the previous complete view and never
claims partial output as success.

An agent working in ordinary source searches only:

```sh
rg -n -i -C 6 '<terms>' src/.ramify/{external,children}
```

An agent working in tests searches only:

```sh
rg -n -i -C 6 '<terms>' src/tests/.ramify/{external,children}
```

Each catalog is complete for its own source area. The test catalog repeats
ordinary entries that remain available, so an agent never combines the two.

## Position in the roadmap

Plan 2A executes after Plan 5 and before Plan 3. Plan 5 supplies the retained
inventory, catalog, model, source facts, compiler lifecycle, exact revisions,
context scheduling and resident client. This plan adds availability
enumeration, symbol-detail extraction, projection, generated-file publication
and the one terminating command.

The existing Plan 3 package remains unchanged. After Plan 2A completes, Plan 3
must be reviewed as a successor: its proposed `available` search surface is
superseded by these files, while explanations, module summaries and observed
usage remain separate possible scope. Plan 4 does not need an MCP search tool
for this discovery workflow.

## Verified starting point

Planning inspected commit `71643d5` on 2026-09-15. Recheck it at iteration 1.

**Revision (iteration 1, 2026-09-15).** Rechecked against source at the same
commit `71643d522eb053336e4c01fcf9836ec52b58fbad` (still current). Every claim
below is confirmed against current files; none required correction. Two
precise nuances the prose below did not state, load-bearing for this plan's
design, are recorded here rather than silently folded in:

- `RetainedSession` (`subs/analysis/src/interfaces/session.ts`) has eight
  methods, not six: the six named below (`update`, `sweep`, `verify`,
  `report`, `releaseCompiler`, `dispose`) plus `releaseRevision(sequence)` and
  `status()`, both load-bearing for `apiView`'s revision-bound query.
- `Freshness`'s `'synchronized'` mode (`subs/daemon/subs/contexts/src/interfaces/contexts.ts`)
  carries only `{ mode: 'synchronized'; expect: readonly ExpectedContent[] }`;
  it carries no deadline itself. `deadlineMs` is a sibling field on
  `CheckRequest`/`CheckParams` (and, by the same pattern, on
  [`ApiViewRequest`](contracts.md#context-operation) and
  [`MaterializeParams`](contracts.md#root-service-and-wire)), not part of
  `Freshness`.

Full file:line citations for every item below are in
[iteration1-results.md](iterations/iteration1-results.md#provider-handoff).

- Eleven toolkit owners exist. No new owner is required.
- Plan 5's retained worker keeps `SessionFacts` containing inventory, source
  areas, catalog, linked model, per-file access facts, decisions and indexes.
  `RetainedSession` currently supports update, sweep, verify, report, compiler
  release and disposal; it has no API-view operation.
- The retained compiler adapter can update and describe file exports, but has
  no bounded symbol-signature or documentation operation.
- `model` explains visibility or one observed import. It does not enumerate
  every foreign original available to a source area.
- `project` currently treats files below `src/` as source or resources, and the
  daemon watcher excludes `node_modules`, `.git`, `dist` and
  `.reference-work`, not `.ramify`.
- The root service has eight operations and the CLI recognizes `check`,
  `watch` and `daemon`. Materialization is absent from the service, codecs,
  quick environment, process entry and help.
- Plan 5 is closed on its branch but its unfiltered gate is not fully green:
  performance waivers and recorded resident defects remain. In particular,
  S1000 exceeds the existing 96 MiB retained-fact limit. This plan preserves
  those facts as predecessor limitations; it does not relabel them as passes.

## Architecture slice

```text
ramify materialize
  -> resident client / daemon service
  -> contexts freshness queue (one revision)
  -> retained analysis worker
       -> model availability enumeration
       -> live or rehydrated TypeScript symbol details
       -> complete ordinary/test projections
  -> daemon-owned Markdown renderer and filesystem publisher
  -> <module>/src[/tests]/.ramify/{external,children}
```

The large projection never crosses local IPC. Only the compact completion or
failure summary does. The daemon owns filesystem publication because it already
owns local process and filesystem adapters; contexts only orders the
revision-bound query, and analysis remains free of output writes.

## Resolved decisions

1. The directory and document formats, complete test catalog, child/external
   partition, metadata omissions and agent commands are exactly those in the
   specification. Presence means available; generated documents never emit
   `availability`, `provider`, defining-path metadata, tags or exposure paths.
2. `model` exposes a pure `listAvailableOriginals` provider. It returns only
   value-available or type-only originals; completely blocked and same-owner
   originals are absent. Its rules share the same tag/test logic as enforcement.
3. `typescript` owns bounded signature and documentation extraction from the
   original defining-file export. It returns explicit `described`, `truncated`
   or `unavailable` states and no compiler objects.
4. `analysis` joins availability, catalog export names, owner relationships and
   details into a plain projection. A testing projection is recomputed from the
   testing profile and is never represented as an overlay.
5. A hot retained compiler answers directly. A warm session may rehydrate a
   compiler from the retained observer's captured input view; this publishes no
   revision and performs no new project inventory walk. If observed input
   identity changes or the requested sequence ceases to be current, the query
   is unavailable and no view is replaced.
6. Materialization always requests synchronized freshness. There is no batch
   fallback and no `--batch` option. Ordinary `ramify check` stays read-only.
7. The daemon stages every requested target before switching any target,
   compares complete bytes, keeps rollback directories until all switches
   succeed and publishes each `_meta.json` as the last staged file. Repeating an
   identical operation writes zero target bytes and preserves mtimes.
8. Existing path components, the `.ramify` target and its contents are checked
   with `lstat`; any symlink refuses the operation. Generated relative paths
   must be canonical project-relative inventory paths and remain beneath the
   staging root.
9. `.ramify` and the publisher's reserved sibling staging/rollback names are
   excluded by inventory, compiler inputs, retained observation and watching.
   Gitignore rules are defense against commits, not runtime isolation.
10. No materialized documents cross the service wire, no MCP tool is added and
    no separate API-view cache or dependency graph is retained.

## Scope boundary

Included:

- complete ordinary and testing-area foreign API projections;
- `children/` and `external/` grouping by original owner;
- compact Markdown and `_meta.json` rendering;
- deterministic, transactional filesystem replacement and stale-file removal;
- generated-output isolation throughout batch and resident input discovery;
- retained-session, contexts, daemon, client and CLI integration;
- root `AGENTS.md` instructions and project ignore rules;
- reference, toolkit, synthetic-scale, process, IPC, Linux and macOS evidence.

Excluded:

- explanations of unavailable symbols, exposure proposals, module summaries,
  observed usage, ranking and source-text search;
- npm, built-in and standard-library APIs;
- import-specifier generation, barrels or edits to application source;
- automatic materialization during `check` or a post-write hook;
- MCP and explorer surfaces;
- persistent caches, historical-revision queries and Windows acceptance.

## Contract limits and probes

Iteration 1 freezes numeric limits after running the checked-in probes. The
initial candidates are 2,048 UTF-8 bytes per signature, 512 UTF-8 bytes for the
documentation paragraph, eight overloads, 32 MiB per projected area and
256 MiB of staged output per invocation. Per-entry detail limits may emit the
specified markers; area or invocation exhaustion must return unavailable and
preserve the old view, never truncate the available set.

Binding correctness budgets apply now:

- identical reruns perform zero target writes and change zero mtimes;
- every generated target comes from one revision and one schema version;
- no materialization filesystem event changes the context revision;
- failure, cancellation and resource exhaustion preserve the previous complete
  view for every target not successfully rolled back;
- worker, compiler, temporary directory and client cleanup is complete.

Iteration 1 records representative latency and memory from the reference,
toolkit, S100, S500 and S1000 fixtures and replaces the candidate numeric limits
with evidence-backed values before provider implementation. S500 or S1000 may
legitimately produce an explicit predecessor resource-limit outcome; the probe
and final gate record that outcome instead of inventing successful scale support.
Performance timing targets are ideal budgets. Output integrity, bounded memory,
cleanup and explicit limit behavior are binding.

**Revision (iteration 1, 2026-09-15).** Done: every candidate above is now
frozen in [contracts.md](contracts.md#revision-iteration-1-2026-09-15), backed
by real probe evidence archived at `scripts/probes/results/plan2a/`. All five
candidates are retained at their original values (no evidence contradicted
them); `maxInvocationBytes` is clarified rather than changed, since this
document's candidate list did not previously distinguish it from the staged-
output candidate. S100/S500/S1000 did not produce a resource-limit outcome for
inventory-scale batch analysis (real elapsed times: S100 ≈5.9s, S500 ≈57.8s,
S1000 ≈100.7s, all with zero available entries since the synthetic generator
declares no `expose-src`); the known Plan 5 S1000 retained-session refusal at
the 96 MiB `maxRetainedFactBytes` limit is preserved unchanged as a
predecessor limitation and is not re-claimed as resolved by this disposable
batch result. See
[iteration1-results.md](iterations/iteration1-results.md) for full detail.

## Acceptance matrix

The [subcase inventory](subcases.md) freezes every execution leaf. These groups
map the architecture and process obligations without treating one passing leaf
as an entire family:

| Group | Capability | Iteration | Main families |
| --- | --- | ---: | --- |
| I2A-01 | Provider review, probes and frozen bounds | 1 | DA12–DA15, ML06 |
| I2A-02 | Generated-output isolation and harness controls | 2 | DA03, DA09, QT03 |
| I2A-03 | Availability enumeration | 3 | DA12, model/reference |
| I2A-04 | Symbol details | 4 | DA14, ML06 |
| I2A-05 | Complete area projection | 5 | DA12–DA15 |
| I2A-06 | Compact deterministic documents | 6 | PC03, QT01 |
| I2A-07 | Safe filesystem publication | 6 | PC03, ML06, QT03 |
| I2A-08 | Retained revision query | 7 | DA13–DA15, ML06 |
| I2A-09 | Context, service and IPC operation | 8 | PC03, QT01, QT04 |
| I2A-10 | CLI command and real process | 8 | PC01, PC03, QT03 |
| I2A-11 | Agent `rg` workflow and repository integration | 9 | H01–H03, QT03 |
| I2A-12 | Scale, determinism and resource evidence | 9 | ML01–ML06, PC10 |
| I2A-13 | Declarations, regressions and handoff | 10 | DA18, PC01, QT05 |

## Iteration sequence

| Iteration | Title | Direct prerequisites | Parallel group |
| ---: | --- | --- | --- |
| 1 | Contract review and scale probes | Plan 5 implementation and closure record | — |
| 2 | Generated-output isolation and harness ledger | 1 | provider-foundations |
| 3 | Model availability enumeration | 1 | provider-foundations |
| 4 | TypeScript symbol details | 1 | provider-foundations |
| 5 | Complete API-view projection | 2, 3, 4 | — |
| 6 | Markdown rendering and transactional publication | 5 | runtime-halves |
| 7 | Retained-session and context query | 5 | runtime-halves |
| 8 | Daemon service, client and CLI command | 6, 7 | — |
| 9 | Agent workflow, process and resource evidence | 8 | — |
| 10 | Final declarations, regressions and Plan 3 handoff | 9 | — |

Iterations in one parallel group have disjoint production owners and tests.
Iteration 5 is the integration join for the three provider foundations;
iteration 8 joins the runtime halves.

## Completion gate

Plan 2A is complete only when iteration 10 records all of the following on one
coherent build:

1. Every I2A instance is present and required; each binding case passes. Any
   approved performance waiver remains explicitly unexecuted or waived.
2. `npm run build`, `npm run type-check`, focused owner tests, `npm test`,
   `npm run reference:cases`, `npm run check:self` and
   `npm run check:reference` pass with generated views present.
3. The Plan 1 gate passes. Plan 2 and Plan 5 gates have no regression from their
   recorded closure baselines; their existing waivers and defects are not
   converted into Plan 2A failures or false passes.
4. Real compiled CLI and daemon runs materialize the reference and toolkit,
   explicit `rg` searches find independently expected names/signatures/docs,
   an unchanged repeat writes nothing, and the owned daemon is stopped in
   `finally`.
5. Linux and macOS emit byte-identical relative document trees for the shared
   fixture and no symlink/interruption case publishes mixed output.
6. The eleven declarations, package entries and lightweight `./cli`/`./client`
   import closures validate. No twelfth owner or MCP dependency appears.
7. Architecture, roadmap, CLI/testing guidance and a completion report describe
   implemented behavior, measured limits and remaining gaps.
8. `docs/plans/iteration-3-project-inspection/` is unchanged from the Plan 2A
   implementation base. The handoff identifies the specific Plan 3 contracts
   now supplied and the Plan 3 scope that still needs review.

## Handoff to Plan 3

The completion report hands over:

- the implemented availability enumeration and its enforcement-equivalence
  evidence;
- symbol-detail request/result bounds and explicit unavailable states;
- area resolution, complete ordinary/testing projections and revision rules;
- the generated schema, deterministic renderer and scale measurements;
- user-facing discovery as `rg` over `.ramify`, with no query/MCP search
  requirement;
- remaining independent product questions for explanations, module summaries
  and observed usage.

Plan 3 may reuse these providers, but its existing plan is not implicitly
approved or changed by Plan 2A.

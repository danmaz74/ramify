# Plan 3 successor: Inspection queries

**Date:** 2026-09-21. **Status:** draft, high level, deferred. Iteration files
follow once the [review decisions](#decisions-for-review) are taken; nothing
here is scheduled before [Plan 2D](../iteration-2d-view-orientation/main-plan.md)
completes. This is the successor review the roadmap requires of the preserved
[Plan 3 draft](../iteration-3-project-inspection/main-plan.md), which stays
unchanged as input. It keeps Plan 3's identity and number: it selects what of
that draft remains worth building now that the materialized views exist.

## What the successor review found

The 2026-09-21 comparison of the Plan 3 draft with the
[API view](../../architecture/materialized-api-view.spec.md), the
[architect view](../../architecture/architect-view.spec.md) and Plan 2C's
measurements sorted every fact the draft would have delivered into three
groups.

**Delivered by the views.** The available set per source area with names,
value or type-only form, signatures and first documentation paragraphs; the
module summary's identity, tags, areas, purpose, parent and children;
module-level usage split by behavioral and non-behavioral dependency; unused
exposed originals; test files' use of foreign symbols through `exercises`.
`ramify available`, its `--search` and the module summary of `ramify inspect`
are withdrawn for good. Plan 4 needs no tool for them.

**Added to the views by Plan 2D.** Provider identity and purpose for a
module-bound agent; tag kinds and subtree dependencies for the architect.

**Unsuited to a view.** Everything below. A view holds positive facts that can
be enumerated before the question is asked, are bounded by the project's size
and do not depend on where exactly the reader stands. These facts are verdicts
about one consumer and one original, depend on the importing file, need
computation per question, or are useful only when current.

## Remaining scope

| # | Information | Why a view does not hold it | Proposed surface |
| ---: | --- | --- | --- |
| 1 | Why a named original is or is not available from a place: the `AvailabilityReason`, the tag requirements with their satisfaction, testing-origin blocking, `same-owner` | The negative space is every consumer area times every original, and the answer is a verdict per pair | `explain` query |
| 2 | Originals that exposure reaches but tags or testing origin block, and why a symbol is type-only | In a view they would break "presence means available" | `explain` query |
| 3 | The missing exposure hops and the declarations that would make an original visible, labeled a proposal | A shortest-path computation per pair; proposal text in a generated file risks being read as a permission | `explain` query |
| 4 | A module's own exposure declarations with `effective`, the providing child and the declaration's location; ineffective exposures in particular | Effective exposures are already on the architect records; the ineffective ones are a defect diagnostic, not an architecture fact | RD-2: `explain`, or a `ramify check` warning |
| 5 | The import specifier from an importing file to a defining file | Depends on the importing file's directory, not on the source area | A field of the `explain` answer when the requested form is available |
| 6 | Body-free declaration text and full documentation | Size; the defining file's path is already in both views | `explain --detail docs` |
| 7 | File-level usage of a module's originals: importing file, location, written form, binding request, allowed or denied | Volume scales with accesses and would deepen both measured hit-cost failures | RD-3: a `usage` query |
| 8 | Whether a published view still matches the project | Inherent to a generated artifact | RD-4: a staleness report on `materialize` |
| 9 | Filters, ranking, bounded and ordered answers over the architect facts; a programmatic surface for MCP, the explorer and Plan 7 | Computation over the question | RD-5: the architect projection as a query, as Plan 2C did for measurements |

Denied accesses as a standalone list are not in scope: `ramify check` owns
violations. They appear only as the `status` of a usage row in item 7;
`DependencyBoundaryFact.status` already carries `allowed`, `limited` or
`denied` per boundary.

## Runnable outcome proposed

```sh
ramify explain validateRevisionChain                 # from the working directory's source area
ramify explain workspace/contracts:Record --from src/tests/review.test.ts --kind type
ramify explain Record --detail docs --format json
```

For every original whose export or binding name matches, or the one named
`owner:name`: its owner, defining file and tags; whether exposure reaches the
consumer and by which effective path, or the missing hops as proposed
declaration text; each tag requirement with its kind and whether the consumer
satisfies it; testing-origin status; the resulting availability for the
requested form; and, when available and `--from` names a file, the specifier
to write. Answers name the revision they were computed from. The consumer is a
place, never a module name, as the draft's decision 1 fixed.

The draft's contracts for this part stand as the starting proposal:
`ConsumerArea`, `OriginalAvailability`, `MissingHop`, `explainAvailability`,
`resolveConsumer`, `SymbolExplanation` and the shared tag-rule helper with
`explainImport`. The draft's `listAvailability` and `describeOriginals` were
delivered in substance by Plan 2A as `listAvailableOriginals`
(`model/src/availability.ts`) and `describeSymbolDetails`
(`typescript/src/symbol-details.ts`); reuse them, do not rebuild them.

## Decisions for review

1. **RD-1: one query or three.** Proposal: deliver `explain` alone first,
   items 1 to 6, as one service operation, one CLI command and one
   `ramify.explain/1` document. It is the part no view was ever meant to hold
   and it needs no decision on hit cost. Items 7 to 9 are separable.
2. **RD-2: ineffective exposures.** Either `explain` reports them when asked
   about the original, or `ramify check` warns about a declared exposure that
   reaches nobody. Proposal: the check warning, nonblocking, because nobody
   asks about an exposure they do not know is broken. This may need a
   sentence in the CLI invocation contract; it changes no importability rule.
3. **RD-3: usage.** A `usage` query over the dependency facts Plan 6D and
   Plan 7 already use, or a per-module `usage.jsonl` in the architect view.
   Proposal: the query, decided together with Plan 7's contract review,
   because both read the same boundary and access facts and a view would add
   the most volume of any candidate. Deferred until the user takes Plan 2B's
   query-interface or split-view decision.
4. **RD-4: staleness.** A view's `revision` names a daemon generation, so two
   daemons disagree on it for equal inputs; the architect `_meta.json` also
   carries the `input` identity and the API view's does not. Proposal:
   `ramify materialize --status` compares each published view's identity with
   the current input identity and reports stale targets without writing;
   whether the API view's `_meta.json` gains `input` is part of this
   decision.
5. **RD-5: the architect projection as a query.** Plan 2B's H1 verdict left
   the choice between a query interface and a view split by module to the
   user. This plan does not take it. If the choice is a query, it belongs
   here, shaped as Plan 2C's `measure`: one computation, the view and a JSON
   query as two surfaces, bounded responses, synchronized freshness.
6. **RD-6: batch.** The draft gave every command a `--batch` path. Proposal:
   `explain` keeps it, as a terminating command with the visible fallback
   rule; `usage` and the architect query are resident only, as `materialize`
   and `measure` are.
7. **RD-7: MCP.** Plan 4's tool inventory is whatever this plan delivers plus
   the existing checks. With RD-1 accepted, Plan 4 can be planned against
   `check` and `explain` without waiting for items 7 to 9.

## Candidate iteration outline

Not yet iteration files. Sizes assume RD-1 to RD-7 as proposed.

| Step | Delivers | Owner |
| ---: | --- | --- |
| 1 | Contract review package: revised contracts, owners, scope and instance inventory derived from the draft's I3-01, I3-03, I3-05 and I3-10 to I3-13 | review |
| 2 | `explainAvailability`, `MissingHop`, the shared tag-rule helper | `model` |
| 3 | Consumer resolution, the `explain` answer, specifier and detail tiers over the retained session | `analysis` |
| 4 | `explain` service operation, validation, client mirror, batch operation | root, `daemon` |
| 5 | `ramify explain`, the `ramify.explain/1` document, exits and fallback | `cli` |
| 6 | Reference, toolkit and process evidence; every proposed hop applied to a copy makes the original available; every specifier passes `ramify check`; completion | evidence |
| later | `usage`, staleness and the architect query, each after its decision | — |

## Evidence carried over from the draft

The draft's instances remain the starting inventory for the retained parts:
I3-01's agreement with enforcement and `ineffective-exposure-explained`,
I3-03's consumer rule, I3-05 in full, I3-10's specifier round trip restricted
to `explain`, the `explain` rows of I3-09, I3-11 and I3-13, and I3-14's
regression set extended with Plans 2A to 2D and 5. I3-04, I3-06 to I3-08 and
the `available` and module-summary rows are retired with the surfaces they
tested, except I3-06, which moves with item 7.

## Out of scope

`ramify available`, availability search and the module summary; any change to
a materialized view's content beyond RD-4's possible `input` key; subtree
usage roll-ups, delivered by Plan 2D; ranking formulas and recommendations;
proposals other than exposure hops; historical revisions; MCP tools
themselves, which are Plan 4's.

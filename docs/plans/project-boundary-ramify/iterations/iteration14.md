# Iteration 14: Containment-based affected provider

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 13](iteration13.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Analysis affected selection plus mechanical root/daemon request-result relays. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Resolve every seed with Project facts: inventory/declaration/area/containment/excluded/none. Return complete ownership topology without per-file inert inventory.

## Read first

- [Contracts](../contracts.md): Canonical path ownership; Reports, affected queries and freshness.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-08, PB1-17, PB1-18, PB1-19 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/src/affected-query.ts`.
- `subs/analysis/src/interfaces/affected.ts`.
- `subs/analysis/src/session-engine.ts`.
- `subs/analysis/src/session-messages.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Resolve every seed with Project facts: inventory/declaration/area/containment/excluded/none. Return complete ownership topology without per-file inert inventory.
2. Preserve reverse-import closure, coverage widening, warm/current-revision checks, limits and cancellation; root ownership never means automatic descendant selection.
3. Add project-boundary-affected.test.ts with all written topology answers, absent/deleted/rename sides and outside seeds; propagate the new answer schema and strict consumers.

## Matrix rows executed here

Exercise PB1-08, PB1-17, PB1-18, PB1-19 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-08, PB1-17, PB1-18, PB1-19.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/src/tests/project-boundary-affected.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-08/17/18/19 pass as exact independently expected provider results; no test file listing or audit selection implementation is added.

Record `iteration14-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Stable affected v2 contract and provider topology answers for later audit.

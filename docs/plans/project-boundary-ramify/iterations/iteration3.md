# Iteration 3: Canonical path ownership provider

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 2](iteration2.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Project plus mechanical public ownership vocabulary relays through analysis/root. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Implement classifyProjectPath over one immutable ProjectOwnership table; normalized paths, nested boundaries, nearest module, scratch and reserved exclusions are handled by one provider.

## Read first

- [Contracts](../contracts.md): Canonical path ownership and inventory.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-03, PB1-04, PB1-08, PB1-09, PB1-17, PB1-18, PB1-19 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/project/src/interfaces/project.ts`.
- `subs/analysis/subs/project/src/inventory.ts`.
- `subs/analysis/subs/project/src/generated-path.ts`.
- `subs/analysis/src/inventory.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Implement classifyProjectPath over one immutable ProjectOwnership table; normalized paths, nested boundaries, nearest module, scratch and reserved exclusions are handled by one provider.
2. Prepare scope metadata and declaration evidence without broadening inventory until iteration 8. Never read path contents or require named inert/deleted files to exist.
3. Add path-ownership.test.ts covering written topology, absent/deleted seeds, outside/invalid paths and exact scratch position; propagate legal type/API relays.

## Matrix rows executed here

Exercise PB1-03, PB1-04, PB1-08, PB1-09, PB1-17, PB1-18, PB1-19 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/project/src/tests/path-ownership.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

Classifier-level expectations pass. Full acquisition and affected cases close in their later producers; unused preparation is not runtime whole-tree delivery.

Record `iteration3-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Canonical ownership API/table for acquisition, source resolution, contexts and affected consumers.

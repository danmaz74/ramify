# Iteration 12: Boundary-aware project observation

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 11](iteration11.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Project observer/capture and neutral observation contracts. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Recognize boundary/child declaration changes as structural; retain boundary existence, retire excluded observations and bring newly included source through fresh capture.

## Read first

- [Contracts](../contracts.md): Transport, observation and projections.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-21, PB1-22, PB1-23, PB1-24 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/project/src/observer.ts`.
- `subs/analysis/subs/project/src/observations.ts`.
- `subs/analysis/subs/project/src/capture.ts`.
- `subs/analysis/subs/project/src/read-project.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Recognize boundary/child declaration changes as structural; retain boundary existence, retire excluded observations and bring newly included source through fresh capture.
2. Handle auxiliary source creation/deletion/edit under ordinary membership; never admit inert/ignored/scratch contents to satisfy changed-path freshness.
3. Add project-boundary-observer.test.ts with recorded content reads/observations and unchanged byte-only excluded/inert mutations.

## Matrix rows executed here

Exercise PB1-21, PB1-22, PB1-23, PB1-24 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/project/src/tests/project-boundary-observer.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

Observer-level expected inputs/invalidation pass. Retained revisions and daemon watch registration qualify in later slices.

Record `iteration12-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Coherent updates/retirement evidence for retained sessions and context freshness.

# Iteration 18: Boundary-aware views and explorer projections

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 17](iteration17.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** One revision-projection capability across analysis rendering, daemon publication and service-api DTO mapping. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

List declaration boundaries in architect module records without excluded descendants; include auxiliary internal behavioral evidence and update counts/byte measurements.

## Read first

- [Contracts](../contracts.md): Transport, observation and projections.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-27, PB1-28, PB1-29 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/src/architect-view.ts`.
- `subs/analysis/src/architect-render.ts`.
- `subs/analysis/src/interfaces/architect-view.ts`.
- `subs/analysis/src/module-measurements.ts`.
- `subs/service-api/src/project-view.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. List declaration boundaries in architect module records without excluded descendants; include auxiliary internal behavioral evidence and update counts/byte measurements.
2. Keep foreign API availability derived from legal exposures/profiles and selection rules; no auxiliary/excluded originals leak. Migrate browser/dependency/measurement DTOs and schemas that changed.
3. Add project-boundary-views.test.ts over real materialization and projections, with byte-exact expectations, one revision identity and existing projection/publication budgets.

## Matrix rows executed here

Exercise PB1-27, PB1-28, PB1-29 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-27, PB1-28, PB1-29.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npm run build
npx vitest run subs/analysis/src/tests/project-boundary-views.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-27/28/29 pass; views and explorer contain the same analyzed source population, not inert owner contents.

Record `iteration18-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Schema/documented view facts and browser projection witnesses for teaching/final gates.

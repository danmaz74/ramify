# Iteration 4: Auxiliary provenance vocabulary

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 3](iteration3.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** One toolkit-wide provenance type migration; behavioral implementations stay in their named owners. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Add reviewed auxiliary origin, inventory placement and boundary-target vocabulary, retaining original binding identity and source profiles.

## Read first

- [Contracts](../contracts.md): Source and exposure provenance.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-07, PB1-12, PB1-13, PB1-14, PB1-15, PB1-25 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/model/src/interfaces/model.ts`.
- `subs/analysis/subs/typescript/src/interfaces/source.ts`.
- `subs/analysis/subs/project/src/interfaces/project.ts`.
- `subs/analysis/src/interfaces/analysis.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Add reviewed auxiliary origin, inventory placement and boundary-target vocabulary, retaining original binding identity and source profiles.
2. Update every existing origin/target builder, serializer/type fixture and legal exposure relay for explicit defaults. New targets are not produced until resolver activation.
3. Type-check public positive/negative fixtures; record the complete schema/type producer list without falsely asserting source behavior.

## Matrix rows executed here

Exercise PB1-07, PB1-12, PB1-13, PB1-14, PB1-15, PB1-25 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

All toolkit producers compile with explicit provenance. Source-interpretation PB1 cases remain pending until activation.

Record `iteration4-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Companion-complete source types and producer map for resolver/linker/analysis.

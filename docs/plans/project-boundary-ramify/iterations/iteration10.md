# Iteration 10: Auxiliary original exposure enforcement

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 9](iteration9.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Descriptions/model exposure validation capability with legal relays only. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Reject auxiliary originals through exact selections, interface wildcard expansion and same-owner forwarding chains, without changing original ownership/tags.

## Read first

- [Contracts](../contracts.md): Source and exposure provenance.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-13 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/descriptions/src/link.ts`.
- `subs/analysis/subs/descriptions/src/interfaces/linking.ts`.
- `subs/analysis/subs/model/src/model.ts`.
- `subs/analysis/subs/model/src/interfaces/model.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Reject auxiliary originals through exact selections, interface wildcard expansion and same-owner forwarding chains, without changing original ownership/tags.
2. Reject a forged auxiliary exposure in model validation too; preserve ordinary exposure, re-exposure and signature companion semantics.
3. Add auxiliary-exposure.test.ts with independent denied codes and normal-original positive controls.

## Matrix rows executed here

Exercise PB1-13 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-13.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/descriptions/src/tests/auxiliary-exposure.test.ts
npx vitest run subs/analysis/subs/model/src/tests
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-13 passes; auxiliary exports may still be internal catalog evidence but can never become an API.

Record `iteration10-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Complete exposure rejection for batch/retained importability and projections.

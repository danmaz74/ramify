# Iteration 9: Resolution provenance and boundary targets

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 8](iteration8.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** TypeScript adapter and its captured-resolution interfaces. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Retain the actual package route before canonical real-target classification. Verify the pinned TypeScript resolver evidence using code/resources and linked NodeNext packages.

## Read first

- [Contracts](../contracts.md): Source and exposure provenance.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-14, PB1-15, PB1-16 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/typescript/src/resolution.ts`.
- `subs/analysis/subs/typescript/src/catalog.ts`.
- `subs/analysis/subs/typescript/src/descriptions.ts`.
- `subs/analysis/subs/typescript/src/interfaces/source.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Retain the actual package route before canonical real-target classification. Verify the pinned TypeScript resolver evidence using code/resources and linked NodeNext packages.
2. Emit explicit nested-tree, outside-project and application targets through the canonical Project classifier; keep unresolved/unsupported evidence as coverage.
3. Add project-boundary-resolution.test.ts with paired true-package and bare-alias controls sharing the same physical target; test type-only/symbol-free imports and forwarding provenance.

## Matrix rows executed here

Exercise PB1-14, PB1-15, PB1-16 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/typescript/src/tests/project-boundary-resolution.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

Producer facts and package-route controls pass; final import verdict cases close in iteration 11. Bare spelling or realpath alone never proves package resolution.

Record `iteration9-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Recorded source targets/provenance and resolver receipts for analysis decisions.

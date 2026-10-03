# Iteration 8: Declared discovery and auxiliary input activation

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 7](iteration7.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Project acquisition and scope contracts; toolkit fixture/declaration corrections are limited to the new model. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Activate boundary pruning before walk descent; validate real directories/child overlap and retain boundary existence evidence. Remove inferred independentScopes and .reference-work special handling.

## Read first

- [Contracts](../contracts.md): Canonical path ownership and inventory; Description language.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-03, PB1-04, PB1-05, PB1-06, PB1-07, PB1-09, PB1-11, PB1-32, PB1-33 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/project/src/inventory.ts`.
- `subs/analysis/subs/project/src/references.ts`.
- `subs/analysis/subs/project/src/configuration.ts`.
- `subs/analysis/subs/project/src/capture.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Activate boundary pruning before walk descent; validate real directories/child overlap and retain boundary existence evidence. Remove inferred independentScopes and .reference-work special handling.
2. Inventory all owned compiler source, including auxiliary/unselected/loose subs code, and required resources; retire outsideModuleFiles/outside warning. Add compiler-selected ignored/scratch warnings.
3. Add project-boundary-inventory.test.ts with invalid layout, ignored malformed descriptions, scratch position, compiler selections and inert inventories. Run widened self-check on actual toolkit imports, and confirm the harness tree contributes no inventory file, warning or finding.

## Matrix rows executed here

Exercise PB1-03, PB1-04, PB1-05, PB1-06, PB1-07, PB1-09, PB1-11, PB1-32, PB1-33 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-03, PB1-04, PB1-05, PB1-06, PB1-07, PB1-09, PB1-11, PB1-32, PB1-33.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/project/src/tests/project-boundary-inventory.test.ts
npm run build
npm run check:self
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

All listed acquisition cases pass and root scripts have legal imports. Known new source decisions may remain pending at analysis slices, but no acquisition error is suppressed.

Record `iteration8-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Real Project inventories and warnings, plus auxiliary ownership inputs for TypeScript.

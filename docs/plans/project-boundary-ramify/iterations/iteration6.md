# Iteration 6: Reference harness boundary preparation

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 5](iteration5.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Root-owned scripts, measurements and compiler configuration that touch the reference harness tree. The harness is not relocated; edits inside `scripts/reference-harness/` are limited to what a moved helper requires. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Prepare `scripts/reference-harness/` to be a root owned-ignored tree in place: no analyzed toolkit code imports from it and no toolkit compiler scope other than its own selects it. Its location, compiler configuration, Vitest configuration and commands do not change.

## Read first

- [Contracts](../contracts.md): Review decision R6; Source and exposure provenance, boundary imports.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-32 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `scripts/validate-final-contracts.ts`.
- `scripts/measurements/plan2b.mjs`.
- `scripts/measurements/plan2c.mjs`.
- `scripts/measurements/plan2a-platform.mjs`.
- `tsconfig.scripts.json`.
- `scripts/reference-harness/tsconfig.json`.
- `scripts/reference-harness/README.md`.
- `package.json`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Inventory every import from root-owned code outside the tree into `scripts/reference-harness/`. The planning scan found four: `scripts/validate-final-contracts.ts` and the measurement scripts `plan2b.mjs`, `plan2c.mjs` and `plan2a-platform.mjs`; the root compiler options allow JavaScript, so all four become analyzed auxiliary source. Recheck the list at execution.
2. Remove each such import, since analyzed code may not import from an ignored tree. Move a shared helper to a root-owned location outside the tree and let the harness import it from there, or move the importing script into the tree where it belongs to the harness. A moved helper must not import test-only source.
3. Take the tree out of `tsconfig.scripts.json`'s selection; its own `tsconfig.json` keeps type-checking it through `npm run type-check`. Keep `reference:cases`, `reference:verify` and `reference:report` and their configurations unchanged.
4. Record the harness's test-file and instance inventory before and after, and assert it is identical. State in the harness README that the tree is owned-ignored and that its imports into toolkit internals are a declared, unverified convention.

## Matrix rows executed here

Exercise PB1-32 at this slice's evidence boundary.
Cases whose producer is this iteration: none; the declaration lands in iteration 7 and takes effect in iteration 8, which produces PB1-32.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
flock /tmp/ramify-audit-tests.lock npm run reference:cases
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

No file outside the tree imports from it, the scripts compiler scope no longer selects it, and the test inventory is unchanged under the unchanged command. The reference command runs at this and every later gate; no audit-definition check is added.

Record `iteration6-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Importer inventory with each removal, the unchanged test inventory and the compiler-scope change, for the declaration in iteration 7.

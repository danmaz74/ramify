# Iteration 5: Legal tooling access for root scripts

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 4](iteration4.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** One tooling-access capability across supplying owners and their ancestor declarations; no consumer project edits. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Give the root scripts and measurements legal access to what they import: inventory their cross-owner imports, then expose only the justified operations through the correct channels and fix the root tooling imports.

The size of this slice is unknown until deliverable 1 is done. The coordinator reviews the inventory before any exposure edit. If the required exposures do not fit one context, or widen a provider's contract beyond what its consumers already justify, split the slice under [sizing.md](../sizing.md) before continuing.

## Read first

- [Contracts](../contracts.md): Source and exposure provenance; Canonical path ownership and inventory.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-33 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `scripts/production-selection.ts`.
- `subs/analysis/src/index.ts`.
- `subs/analysis/module.ramify`.
- `module.ramify`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Produce a symbol-level inventory of the cross-owner imports of the root scripts and measurements outside `scripts/reference-harness/`. The harness tree becomes owned-ignored and its imports are out of scope.
2. Reuse discovered public APIs first. Expose only justified source operations and test-only helpers through correct channels; ordinary scripts never receive test-only access. A script that genuinely needs test-only source moves into the harness tree in iteration 6 rather than becoming ordinary by fiat.
3. Fix root tooling imports, including acquireInventory through its public analysis entry. Check every required signature companion; do not create blanket internal or package export exposure.

## Matrix rows executed here

Exercise PB1-33 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npm run build
npm run check:self
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

An import/exposure map accounts for every changed consumer and rejects unsupported ordinary-to-testing access. Full auxiliary enforcement starts later.

Record `iteration5-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Provider access map and legal imports for root scripts, and the list of scripts that must move into the harness tree.

# Iteration 7: Toolkit declarations and compiler exclusions

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 6](iteration6.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Toolkit root-owned descriptions/configuration plus fixture-owner declarations; no agent/audit writes. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Declare site, examples/collection-review and scripts/reference-harness owned-ignored; ramify-agent external; declare .reference-work, .history, .cucumber-viz, .playwright-mcp and actual source-shaped generated/planning trees requiring boundaries.

## Read first

- [Contracts](../contracts.md): Description language; Canonical path ownership.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-03, PB1-05, PB1-09, PB1-11, PB1-32, PB1-40 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `module.ramify`.
- `tsconfig.json`.
- `tsconfig.scripts.json`.
- `tsconfig.portable.json`.
- `subs/analysis/subs/project/src/generated-path.ts`.
- `package.json`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Declare site, examples/collection-review and scripts/reference-harness owned-ignored; ramify-agent external; declare .reference-work, .history, .cucumber-viz, .playwright-mcp and actual source-shaped generated/planning trees requiring boundaries.
2. Re-inventory all owned fixture-package and source-shaped data directories; add declarations at their owner. The harness's fixtures lie inside its ignored tree and need none. Do not infer boundaries from Git or tsconfig.
3. Add scratch/compiler exclusions in all toolkit compiler scopes and runner configurations; keep source-area classifications and production exclusions. Preserve existing Git ignore rules; harness scratch lifecycle remains Phase 3.

## Matrix rows executed here

Exercise PB1-03, PB1-05, PB1-09, PB1-11, PB1-32, PB1-40 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
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

The declaration/compile inventory is ready for wider discovery; no unsupported audit fields or external project edits appear. Document absent/generated external directories explicitly.

Record `iteration7-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Complete toolkit boundary/declaration inventory and compiler selection controls for activation.

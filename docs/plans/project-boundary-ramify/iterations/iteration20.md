# Iteration 20: Full semantic and regression qualification

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 19](iteration19.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Toolkit integration acceptance; defects reopen named producers rather than expand this slice. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Run all PB1 runtime cases, real public/CLI/IPC/materialization workflows and scale/resource/cleanup assertions on one clean candidate; archive independent expectations and observations.

## Read first

- [Contracts](../contracts.md): All reviewed contracts.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-35, PB1-37, PB1-38 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `docs/plans/project-boundary-ramify/acceptance.md`.
- `docs/plans/project-boundary-ramify/execution.md`.
- `subs/integration-tests/module.ramify`.
- `ramify-audit.json`.
- `package.json`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Run all PB1 runtime cases, real public/CLI/IPC/materialization workflows and scale/resource/cleanup assertions on one clean candidate; archive independent expectations and observations.
2. Run the explicit full old-audit/direct gate, separate locked reference:cases and full reference acceptance chain in execution.md, including affected required measurements and browser workflow. Record each earlier timing target as met or missed under the [budget policy](../budgets.md#policy); a missed target does not fail this gate.
3. Review actual write scope, runtime docs, schema identity and remaining defects. Preserve failed attempts and report source/audit/direct/reference results separately.

## Matrix rows executed here

Exercise PB1-35, PB1-37, PB1-38 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-35, PB1-37, PB1-38.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

Execute the entire Final gate section of execution.md, not just the two commands below. Requalify PB1-01 through PB1-38 and PB1-41 through PB1-44 that describe runtime behavior; keep artifact PB1-36 for iteration 21. No required command/configuration may be omitted.

From the toolkit checkout:

```sh
npm run build
flock /tmp/ramify-audit-tests.lock npm run reference:cases
npm run check:reference
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

All runtime PB1 rows and declared full gates pass on the candidate. The minimal audit probe and catalogue validation never substitute for these executions.

Record `iteration20-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Final candidate commit/tree/config identity and full qualification receipts for packing.

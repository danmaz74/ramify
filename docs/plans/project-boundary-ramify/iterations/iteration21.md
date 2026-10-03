# Iteration 21: Packed artifact and Phase 2 handoff

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 20](iteration20.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Toolkit root artifact/receipt capability; no publication or consumer implementation in this planning task. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Pack the qualified build into an external artifact directory, produce digest/file manifest and install it in a clean isolated consumer probe.

## Read first

- [Contracts](../contracts.md): All reviewed contracts.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-36, PB1-39, PB1-40 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `docs/plans/project-boundary-ramify/handoff.md`.
- `docs/plans/project-boundary-ramify/fixtures.md`.
- `package.json`.
- `src/interfaces/batch.ts`.
- `subs/analysis/src/index.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Pack the qualified build, whose manifest already says 0.2.0, into an external artifact directory without changing the qualified tree, produce digest/file manifest and install it in a clean isolated consumer probe.
2. Run the written topology through installed typed API, batch and resident CLI; assert exact expected provider answers and stop all probe processes. No fixture is copied to audit/agent.
3. Seal durable source/config/contract/artifact/evidence identity, scope review and merge handoff, including the performance report that informs the user of every missed earlier timing target. Document local-development versus later exact published-registry completion requirements.

## Matrix rows executed here

Exercise PB1-36, PB1-39, PB1-40 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-36, PB1-39, PB1-40.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

Use an external PB1_ARTIFACT_DIR and the isolated-install procedure in handoff.md. Rerun the mandatory full/direct and separate reference gates if this slice changes candidate source/build inputs; otherwise bind the immutable iteration 20 receipts to the packed artifact.

From the toolkit checkout:

```sh
npm run build
npm pack --ignore-scripts --pack-destination "$PB1_ARTIFACT_DIR"
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-36/39/40 pass and every runtime row has valid final evidence. Packing does not publish and does not certify a different post-merge tree.

Record `iteration21-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Immutable local Ramify artifact, written topology and qualified receipt for /ramify-audit Phase 2.

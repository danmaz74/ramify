# Iteration 1: Contract adoption and gate readiness

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** The reviewed master, the user's recorded decisions on R1–R6 and the checked-out source state.
**Owners and write scope:** Toolkit-owned model/architecture documents and this plan only; no runtime edits. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Adopt the user's accepted R1–R6 decisions at a fixed contract revision, through only the exact specification patches authorized by the coordinator under the protected-document procedure. This iteration does not decide R1–R6. Keep runtime support marked pending; no principle change is expected.

## Read first

- [Contracts](../contracts.md): Review decisions; Description language; Reports, affected queries and freshness.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-01, PB1-02, PB1-03, PB1-04, PB1-20, PB1-35, PB1-40 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `docs/architecture/project-boundary.proposal.md`.
- `docs/model/module-description.spec.md`.
- `docs/model/typescript-source-interpretation.spec.md`.
- `docs/architecture/cli-invocation.spec.md`.
- `ramify-audit.json`.
- `package.json`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Record the user's accepted R1–R6 decisions at a fixed contract revision and obtain coordinator authorization for the exact grammar/validation/schema/freshness patches before adopting them in the owning specifications. An entry the user has not accepted stops the iteration. Keep runtime support marked pending; model/architecture write scope does not authorize other protected edits.
2. Inventory every changed schema and foreign signature companion, map producer/consumer/exposure changes, and preserve CLI root and production-selection policies. From that inventory, name the first iteration whose candidate changes the affected output the installed audit reads; gates switch from partial to full audits there.
3. Reconfirm the installed full-audit mode path, run the clean toolkit baseline and separate reference command, and retain baseline failures plus a concrete direct-fallback readiness receipt.
4. Record the protected-document baseline and adoption rationale/approvals, prepare the coordinator's standalone comparison check before adoption edits, and retain the actual diff review and affected-authority handoff.

## Matrix rows executed here

Exercise PB1-01, PB1-02, PB1-03, PB1-04, PB1-20, PB1-35, PB1-40 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

Run the baseline full-audit command and separate reference command from execution.md. The planning probe is supporting evidence only. Record unresolved baseline failures and runtime cases as pending.

The coordinator compares all protected-file changes to the baseline and exact
authorized adoption patches, reviews their meaning and records the outcome
under [the protected-document procedure](../execution.md#protected-principles-and-specifications).

From the toolkit checkout:

```sh
git diff --check
flock /tmp/ramify-audit-tests.lock npm run reference:cases
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

The receipt cites the user's decision for every R entry, names the audit-mode switch iteration and identifies baseline gaps, protected-file approvals and the coordinator's actual diff review. PB1 runtime cases remain unimplemented; do not mark them passed from document validation or the small audit probe.

Record `iteration1-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Reviewed specification/contract revision, schema inventory, gate command and baseline evidence; all implementation slices require this receipt.

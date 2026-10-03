# Iteration 8: Declared discovery and auxiliary input activation

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 7](iteration7.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Project acquisition and scope contracts, and the modularity producer; toolkit fixture/declaration corrections are limited to the new model. The identifiers this slice advances (`ramify.check/2`, `ramify.measure/2`, `ramify.modularity/3`), their toolkit readers and the reference harness's expected values for every output this slice changes. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Activate boundary pruning before walk descent; validate real directories/child overlap and retain boundary existence evidence. Remove inferred independentScopes and .reference-work special handling.

## Read first

- [Contracts](../contracts.md): Canonical path ownership and inventory; Description language; Schema versions.
- [Modularity report specification](../../../architecture/modularity-report.spec.md): its project-boundary paragraph.
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
- `subs/analysis/src/modularity.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Activate boundary pruning before walk descent; validate real directories/child overlap and retain boundary existence evidence. Remove inferred independentScopes and .reference-work special handling.
2. Inventory all owned compiler source, including auxiliary/unselected/loose subs code, and required resources; retire outsideModuleFiles/outside warning. Add compiler-selected ignored/scratch warnings.
3. Add project-boundary-inventory.test.ts with invalid layout, ignored malformed descriptions, scratch position, compiler selections and inert inventories. Run widened self-check on actual toolkit imports, and confirm the harness tree contributes no inventory file, warning or finding.
4. Own the modularity producer, `subs/analysis/src/modularity.ts` and its context and graph: `omittedScopes` records the declared nested-tree directories, outside occurrences count `outside-project` targets, and owned compiler source outside `src/` counts as its owner's auxiliary source, as the modularity report specification states. Advance it to `ramify.modularity/3`.
5. Per [schema versions](../contracts.md#schema-versions), advance `ramify.check/2` (`ProjectWarning`) and `ramify.measure/2` (`outsideModuleFiles` retired), and extend the documents already at version 2 for the removed `independentScopes`, including the daemon codec's scope validator. Update every toolkit reader in this candidate: the CLI changed command, `examples/hooks/claude-code-post-write.mjs`, `scripts/measurements/fast-assertions.mjs`, `fast-evidence.test.mjs` and `plan2c.mjs`, the daemon measure service, toolkit tests and the reference harness's expected values, such as the `outside-module-source` warning and `outsideModuleFiles`, under [iteration gates](../execution.md#iteration-gates).

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
npx vitest run subs/analysis/src/tests/modularity.test.ts subs/analysis/src/tests/modularity-batch.test.ts
npm run build
npm run check:self
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

All listed acquisition cases pass, root scripts have legal imports, and the check, measurement and modularity documents carry their new versions. Known new source decisions may remain pending at analysis slices, but no acquisition error is suppressed.

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

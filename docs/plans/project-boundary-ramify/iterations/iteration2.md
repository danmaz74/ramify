# Iteration 2: Nested-tree parser and statement partition

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 1](iteration1.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Descriptions plus mechanical syntax type/exposure relays and affected test producers; the `ramify.analysis/2` identifier, its toolkit readers and the reference harness's expected values for it. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Implement both statements with all reviewed syntax/encoding/span rules; keep existing exposure records exact.

## Read first

- [Contracts](../contracts.md): Description language and validation; Schema versions.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-01, PB1-02 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/descriptions/src/parse.ts`.
- `subs/analysis/subs/descriptions/src/tokenize.ts`.
- `subs/analysis/subs/descriptions/src/interfaces/syntax.ts`.
- `subs/analysis/subs/descriptions/src/link.ts`.
- `subs/analysis/subs/project/src/references.ts`.
- `subs/analysis/src/interfaces/analysis.ts` and `subs/analysis/src/report.ts`, for the report identifier.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Implement both statements with all reviewed syntax/encoding/span rules; keep existing exposure records exact.
2. Partition tree statements from link and source-reference processing; relay new types with signature companions through analysis/root.
3. Add project-boundary-grammar.test.ts with independent expected AST locations and malformed-input codes, plus positive exposure controls.
4. Advance the analysis report to `ramify.analysis/2`: its snapshot's parsed descriptions now admit the nested-tree statement member, per [schema versions](../contracts.md#schema-versions). Update every toolkit reader in this candidate, including toolkit tests and `scripts/measurements/resident-driver.mjs` and `resident-failure.test.mjs`, and the reference harness's expected values under [iteration gates](../execution.md#iteration-gates).

## Matrix rows executed here

Exercise PB1-01, PB1-02 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-01, PB1-02.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/descriptions/src/tests/project-boundary-grammar.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-01/02 pass and the report is `ramify.analysis/2`; tree validation/discovery is not claimed yet. No client-specific ownership parser is added.

Record `iteration2-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Discriminated statements and parser evidence for Project acquisition.

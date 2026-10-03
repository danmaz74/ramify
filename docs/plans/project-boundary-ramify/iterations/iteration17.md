# Iteration 17: CLI boundary outputs and advisory diagnostics

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 16](iteration16.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** CLI plus root entry tests and the reference harness's expected values for CLI outputs this slice changes; Git advice stays outside analysis inputs. Specification changes only as proposed patches. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Emit check/affected JSON and human path dispositions; the changed check's findings and exit code are those the complete check would give on the project after the change. Preserve definite findings for mixed checks and retry stale classification at most once.

## Read first

- [Contracts](../contracts.md): Reports, affected queries and freshness; Git advisory warning; Schema versions.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-10, PB1-20, PB1-26, PB1-30 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/cli/src/changed-command.ts`.
- `subs/cli/src/affected-command.ts`.
- `subs/cli/src/format.ts`.
- `subs/cli/src/interfaces/cli.ts`.
- `subs/cli/src/check-command.ts`.
- `subs/analysis/subs/project/src/resolve-root.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Emit check/affected JSON and human path dispositions, replacing `covered`, and extend `ramify.check/2` and `ramify.affected-cli/2` per [schema versions](../contracts.md#schema-versions). Findings and exit code are those of the complete check on the project after the change: a not-analyzed path never changes the exit code, and exit 2 means the result could not be established. Preserve definite findings for mixed checks and retry stale classification at most once. Update the harness's expected values, such as Plan 5's `covered` assertions, under [iteration gates](../execution.md#iteration-gates).
2. Implement NUL-safe ignored-but-walked Git advice without model/ownership influence; no repo/missing Git/optional command failure leaves source verdict intact.
3. Add project-boundary-cli.test.ts in the root tests for real built batch/resident invocations, nested roots, outside seeds, whitespace paths and every exclusion/not-analyzed control. Update CLI help. Propose the CLI invocation specification edits, including its passages that still name `ramify.analysis/1`, to the coordinator as exact patches under the [protected-document procedure](../execution.md#protected-principles-and-specifications); do not edit the specification.

## Matrix rows executed here

Exercise PB1-10, PB1-20, PB1-26, PB1-30 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-10, PB1-20, PB1-26, PB1-30.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npm run build
npx vitest run src/tests/project-boundary-cli.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-10/20/26/30 pass through actual CLI processes; no excluded content is labelled passed, and root selection remains documented behavior. Selection for a project inside an owned-ignored tree beneath `subs/` follows the user's answer to [open question 2](../main-plan.md#open-questions-for-the-user).

Record `iteration17-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Public CLI contract/diagnostic witnesses for consumers and final qualification.
